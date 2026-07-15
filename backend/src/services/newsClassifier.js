// Klassificerar nyhetsposter (efter att nyckelordsförfiltret i lib/newsKeywords.js släppt
// igenom dem) med Claude Haiku 4.5 — kort textklassificering av rubrik+ingress, samma
// raw-fetch-mönster som routes/weather.js (ingen SDK behövs för ett enda enkelt anrop).
// Flaggar bara relevans/kategori, raderar eller döljer aldrig — människan i NewsPanel.tsx
// gör fortfarande sista valet.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5';

const PROMPT_INTRO = `Du bedömer om en nyhetsrubrik är relevant för Hemvärnets lägesbild i Norrbotten
(t.ex. olyckor, bränder, elavbrott, extremväder, trafikstörningar, större polisinsatser,
samhällsstörningar). Svara ENDAST med kompakt JSON, inget annat: {"relevant": bool, "category": string, "reason": string}
category ska vara ett kort svenskt ord (t.ex. "Trafik", "Brand", "Väder", "Elavbrott", "Polis", "Övrigt").
reason: max en mening på svenska som motiverar bedömningen.`;

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Inget JSON-svar från modellen');
  return JSON.parse(match[0]);
}

async function classifyNewsItem(title, summary) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const content = `${PROMPT_INTRO}\n\nRubrik: ${title}\nIngress: ${summary || '(ingen ingress)'}`;
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const parsed = extractJson(text);
  return {
    relevant: !!parsed.relevant,
    category: parsed.category || null,
    reason: parsed.reason || null,
  };
}

module.exports = { classifyNewsItem };
