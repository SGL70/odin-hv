const db = require('../db');
const { matchesKeywordRules } = require('../lib/newsKeywords');
const { classifyNewsItem } = require('./newsClassifier');

const USER_AGENT = 'ResurslageNewsBot/1.0 (+https://resurslage.jv10.se)';

async function fetchText(url, timeoutMs = 10000) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/html;q=0.8, */*;q=0.5' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function stripCdata(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

function stripHtml(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).trim();
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decodeEntities(stripCdata(m[1]).trim()) : null;
}

// RSS 2.0 <item>, med fallback till Atom <entry> för källor som lagts till via
// discoverFeedUrl() snarare än de fyra verifierade RSS-källorna.
function parseRssItems(xml) {
  const items = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks) {
    const title = extractTag(block, 'title');
    if (!title) continue;
    const link = extractTag(block, 'link');
    const guid = extractTag(block, 'guid') || link;
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'dc:date');
    const description = extractTag(block, 'description');
    items.push({
      guid: guid || title,
      title: stripHtml(title),
      link: link || null,
      summary: description ? stripHtml(description).slice(0, 500) : null,
      published_at: pubDate ? new Date(pubDate) : null,
    });
  }
  if (items.length) return items;

  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of entryBlocks) {
    const title = extractTag(block, 'title');
    if (!title) continue;
    const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["']/i);
    const link = linkMatch ? decodeEntities(linkMatch[1]) : null;
    const guid = extractTag(block, 'id') || link;
    const updated = extractTag(block, 'updated') || extractTag(block, 'published');
    const summary = extractTag(block, 'summary') || extractTag(block, 'content');
    items.push({
      guid: guid || title,
      title: stripHtml(title),
      link,
      summary: summary ? stripHtml(summary).slice(0, 500) : null,
      published_at: updated ? new Date(updated) : null,
    });
  }
  return items;
}

function looksLikeFeed(text) {
  const head = text.slice(0, 500).toLowerCase();
  return head.includes('<rss') || head.includes('<feed')
    || (head.includes('<?xml') && (text.includes('<item') || text.includes('<entry')));
}

// Försöker hitta en RSS/Atom-feed för en godtycklig sajt-URL i tre steg: (1) är URL:en redan
// en feed, (2) <link rel="alternate" type="application/rss+xml|atom+xml"> i sidans <head>,
// (3) vanliga gissningsvägar. Kastar bara vid nätverksfel — "hittade ingen feed" ger null.
async function discoverFeedUrl(inputUrl) {
  let url = inputUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const parsed = new URL(url);
  const origin = parsed.origin;
  const path = parsed.pathname.replace(/\/$/, '');

  let html = null;
  try {
    const text = await fetchText(url);
    if (looksLikeFeed(text)) return url;
    html = text;
  } catch {
    // fortsätt till kandidatvägar även om själva sid-hämtningen misslyckas
  }

  if (html) {
    const linkTag = html.match(/<link\b[^>]*>/gi)?.find(tag =>
      /rel=["']alternate["']/i.test(tag) && /type=["']application\/(rss|atom)\+xml["']/i.test(tag)
    );
    if (linkTag) {
      const hrefMatch = linkTag.match(/href=["']([^"']+)["']/i);
      if (hrefMatch) {
        try {
          const feedUrl = new URL(hrefMatch[1], url).toString();
          const feedText = await fetchText(feedUrl);
          if (looksLikeFeed(feedText)) return feedUrl;
        } catch { /* prova kandidatvägar nedan */ }
      }
    }
  }

  const candidates = [...new Set([
    `${origin}/rss.xml`, `${origin}/rss`, `${origin}/feed`, `${origin}/feed.xml`,
    ...(path ? [`${origin}${path}/rss.xml`, `${origin}${path}/rss`, `${origin}${path}.rss`] : []),
  ])];

  for (const candidate of candidates) {
    try {
      const text = await fetchText(candidate);
      if (looksLikeFeed(text)) return candidate;
    } catch { /* prova nästa kandidat */ }
  }
  return null;
}

async function fetchFeedItems(feedUrl) {
  const xml = await fetchText(feedUrl, 15000);
  return parseRssItems(xml);
}

// Nyckelordsförfilter + Haiku-klassificering av en nyinsatt post. Fångar egna fel så att en
// enskild klassificeringsmiss aldrig stoppar hela pollningen (samma mönster som afterHarvest()).
async function classifyNewItem(id, title, summary, keywordRules) {
  try {
    if (!matchesKeywordRules(`${title} ${summary || ''}`, keywordRules)) {
      await db.query(
        `UPDATE news_items SET relevant = false, classifier_note = 'Nyckelordsfilter' WHERE id = $1`,
        [id]
      );
      return;
    }
    const result = await classifyNewsItem(title, summary);
    if (!result) return; // ANTHROPIC_API_KEY ej satt — relevant förblir NULL
    await db.query(
      `UPDATE news_items SET relevant = $1, category = $2, classifier_note = $3 WHERE id = $4`,
      [result.relevant, result.category, result.reason, id]
    );
  } catch (err) {
    console.error(`Klassificering misslyckades för nyhetspost ${id}:`, err.message);
  }
}

async function pollSource(io, source) {
  try {
    const items = await fetchFeedItems(source.feed_url);
    const settingsRow = await db.query(`SELECT value FROM settings WHERE key = 'news_keyword_rules'`);
    const keywordRules = settingsRow.rows[0]?.value || [];
    let inserted = 0;
    for (const item of items) {
      const { rows } = await db.query(
        `INSERT INTO news_items (source_id, guid, title, link, summary, published_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (source_id, guid) DO NOTHING
         RETURNING id`,
        [source.id, item.guid, item.title, item.link, item.summary, item.published_at]
      );
      if (rows.length) {
        inserted++;
        await classifyNewItem(rows[0].id, item.title, item.summary, keywordRules);
      }
    }
    await db.query(`UPDATE news_sources SET last_fetched_at = NOW(), last_error = NULL WHERE id = $1`, [source.id]);
    if (inserted > 0) {
      io.emit('news_item:new', { source_id: source.id, count: inserted });
      console.log(`Nyhetskälla "${source.name}": ${inserted} nya poster`);
    }
  } catch (err) {
    await db.query(`UPDATE news_sources SET last_fetched_at = NOW(), last_error = $2 WHERE id = $1`, [source.id, err.message]);
    console.error(`Nyhetskälla "${source.name}" gick fel:`, err.message);
  }
}

async function pollAllSources(io) {
  const { rows } = await db.query(`SELECT * FROM news_sources WHERE enabled = true AND feed_url IS NOT NULL`);
  for (const source of rows) {
    await pollSource(io, source);
  }
}

// Efterklassificerar poster som fanns innan nyckelordsfilter/Haiku-klassificeringen infördes
// (relevant IS NULL). Körs i bakgrunden — kan vara hundratals poster och ska inte blockera
// HTTP-anropet som startade den (se routes/news.js POST /classify-pending).
async function classifyPendingBacklog(io) {
  const settingsRow = await db.query(`SELECT value FROM settings WHERE key = 'news_keyword_rules'`);
  const keywordRules = settingsRow.rows[0]?.value || [];
  const { rows } = await db.query(`SELECT id, title, summary FROM news_items WHERE relevant IS NULL`);
  const total = rows.length;
  let done = 0;
  for (const item of rows) {
    await classifyNewItem(item.id, item.title, item.summary, keywordRules);
    done++;
    if (done % 5 === 0 || done === total) io.emit('news_classify:progress', { done, total });
  }
  io.emit('news_classify:done', { classified: done, total });
  console.log(`Efterklassificering klar: ${done} poster`);
  return total;
}

module.exports = { parseRssItems, discoverFeedUrl, fetchFeedItems, pollAllSources, classifyPendingBacklog };
