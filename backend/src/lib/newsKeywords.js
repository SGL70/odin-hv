// Nyckelordsförfilter för mediabevakningen (se roadmap: "Nyheter — allt möjligt" / Haiku-
// klassificering i services/newsClassifier.js). Regler lagras i settings.news_keyword_rules:
//   { any?: string[], all?: string[], none?: string[] }[]
// En text matchar EN regel om: (any tomt ELLER minst ett any-ord finns) OCH
// (all tomt ELLER samtliga all-ord finns) OCH (none tomt ELLER inget none-ord finns).
// Texten matchar hela regeluppsättningen om den matchar MINST EN regel (OR mellan regler).
// Tomma/odefinierade regler passerar allt (fail-open) — annars döljs allt tills någon hunnit
// konfigurera regler.

function includesWord(haystack, word) {
  return haystack.includes(word.toLowerCase().trim());
}

function matchesRule(haystack, rule) {
  const any = rule.any || [];
  const all = rule.all || [];
  const none = rule.none || [];
  if (any.length && !any.some(w => includesWord(haystack, w))) return false;
  if (all.length && !all.every(w => includesWord(haystack, w))) return false;
  if (none.length && none.some(w => includesWord(haystack, w))) return false;
  return true;
}

function matchesKeywordRules(text, rules) {
  if (!Array.isArray(rules) || rules.length === 0) return true;
  const haystack = (text || '').toLowerCase();
  return rules.some(rule => matchesRule(haystack, rule));
}

module.exports = { matchesKeywordRules };
