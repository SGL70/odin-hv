// Konverterar docs/anvandarguide/*.md till statisk HTML i dist/docs/, servad av samma
// nginx som resten av appen (fångas upp av try_files, ingen extra config behövs).
// Källfilerna hålls medvetet renderer-agnostiska (ren markdown, inga MkDocs-specifika
// admonitions) så de går att läsa/rendera överallt — inte bara här.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '../../docs/anvandarguide');
const OUT_DIR = path.resolve(__dirname, '../dist/docs');

mkdirSync(OUT_DIR, { recursive: true });

const files = readdirSync(SRC_DIR).filter(f => f.endsWith('.md'));

function rewriteLinks(md) {
  // [text](00-index) eller [text](01-xxx.md) -> [text](01-xxx.html)
  return md.replace(/\]\((\.\/)?([\w-]+)(\.md)?\)/g, (_m, _dot, name) => `](${name}.html)`);
}

function template(title, bodyHtml) {
  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — ODINhv</title>
<style>
  body { background: #14141f; color: #ddd; font-family: system-ui, sans-serif; max-width: 820px; margin: 0 auto; padding: 24px 20px 60px; line-height: 1.6; }
  a { color: #7aaeff; }
  h1, h2, h3 { color: #eee; }
  h1 { border-bottom: 1px solid #333; padding-bottom: 10px; }
  h2 { margin-top: 2em; border-bottom: 1px solid #2a2a40; padding-bottom: 6px; }
  code { background: #1e1e30; padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }
  pre { background: #1e1e30; padding: 12px 14px; border-radius: 6px; overflow-x: auto; border: 1px solid #333; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #333; padding: 6px 10px; text-align: left; font-size: 0.95em; }
  th { background: #1e1e30; }
  blockquote { border-left: 3px solid #5b8cff; margin: 1em 0; padding: 2px 16px; background: #1a1a2e; border-radius: 0 4px 4px 0; }
  hr { border: none; border-top: 1px solid #333; margin: 2em 0; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

for (const file of files) {
  const raw = readFileSync(path.join(SRC_DIR, file), 'utf-8');
  const rewritten = rewriteLinks(raw);
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const title = titleMatch
    ? titleMatch[1].replace(/[#*`]/g, '').replace(/^\p{Extended_Pictographic}\s*/u, '').replace(/^ODINhv\s*—\s*/, '').trim()
    : file;
  const bodyHtml = marked.parse(rewritten);
  const outName = file.replace(/\.md$/, '.html');
  writeFileSync(path.join(OUT_DIR, outName), template(title, bodyHtml));
  console.log(`docs: ${file} -> dist/docs/${outName}`);
}
