import { clean } from "../utils/text.js";

const COMPANY_SUFFIXES = /\b(incorporated|corporation|corp|company|co|limited|ltd|plc|llc|gmbh|ag|sa|spa|srl|bv|nv|group|holdings?|technologies|technology|systems|industries|industrial|electronics|electric|automation|motors)\b/gi;

const HEADLINE_STOP = new Set([
  "new", "factory", "plant", "expansion", "investment", "manufacturing", "production",
  "capacity", "launches", "launch", "opens", "opening", "announces", "announced",
  "plans", "plan", "seeks", "seeking", "supplier", "procurement", "sourcing",
  "manager", "company", "million", "billion", "the", "a", "an", "to", "in",
  "for", "of", "and", "with", "at", "on", "first", "deep", "gas", "well",
  "oil", "project", "market", "industry", "sector", "report", "analysis"
]);

const GEO_PREFIXES = new Set([
  "egypt", "mexico", "china", "india", "canada", "germany", "france", "italy",
  "romania", "poland", "japan", "korea", "brazil", "spain", "turkey", "uae",
  "united", "american", "european", "asian", "global", "africa", "african"
]);

const NON_COMPANY_WORDS = new Set([
  "deep", "gas", "well", "wells", "oil", "field", "pipeline", "project", "terminal",
  "mine", "mining", "copper", "gold", "silver", "lithium", "solar", "wind",
  "factory", "plant", "capacity", "production", "procurement", "manager", "report",
  "market", "industry", "sector", "growth", "demand", "supply", "chain"
]);

const KNOWN_COMPANIES = [
  "ABB", "Siemens", "Bosch", "Schneider Electric", "Tesla", "Ford", "GM", "General Motors",
  "Stellantis", "Toyota", "Honda", "Nissan", "BMW", "Mercedes-Benz", "Volkswagen",
  "Valeo", "Forvia", "Magna", "Aptiv", "Continental", "Denso", "Yazaki", "Lear",
  "Whirlpool", "Electrolux", "GE Appliances", "Kohler", "Moen", "Delta Faucet",
  "Honeywell", "Emerson", "Eaton", "Rockwell Automation", "Johnson Controls",
  "Carrier", "Trane", "Daikin", "Panasonic", "Samsung", "LG", "Foxconn",
  "Flex", "Jabil", "Amphenol", "TE Connectivity", "Molex", "Hubbell", "Leviton",
  "Danfoss", "Grundfos", "Xylem", "Parker Hannifin", "3M", "BASF", "SABIC",
  "Dow", "DuPont", "Celanese", "Covestro", "Solvay", "LyondellBasell"
];

const COMPANY_VERBS = [
  "opens", "launches", "announces", "plans", "expands", "invests", "starts",
  "seeks", "hires", "acquires", "builds", "unveils", "partners", "selects"
];

export function extractCompany(title) {
  const original = clean(title);
  const headline = original.replace(/\s[-–—|:]\s.*$/, "").trim();

  const known = matchKnownCompany(original);
  if (known) return { name: known, confidence: 0.95 };

  const verbPattern = COMPANY_VERBS.join("|");
  const explicitPattern = new RegExp(
    `^([A-Z][A-Za-z0-9&.'\\-]*(?:\\s+[A-Z][A-Za-z0-9&.'\\-]*){0,4})\\s+(?:${verbPattern}|to\\b)`,
    "i"
  );

  const explicit = headline.match(explicitPattern);
  if (explicit) {
    const candidate = sanitizeCompany(explicit[1]);
    const quality = scoreCandidate(candidate, "explicit");
    if (quality >= 0.70) return { name: candidate, confidence: quality };
  }

  const afterPreposition = headline.match(
    /(?:by|at|for|from|with)\s+([A-Z][A-Za-z0-9&.'\-]*(?:\s+[A-Z][A-Za-z0-9&.'\-]*){0,3})(?:\s|$)/
  );

  if (afterPreposition) {
    const candidate = sanitizeCompany(afterPreposition[1]);
    const quality = scoreCandidate(candidate, "preposition");
    if (quality >= 0.72) return { name: candidate, confidence: quality };
  }

  const acronym = headline.match(/^([A-Z][A-Z0-9&.'\-]{2,}(?:\s+[A-Z][A-Z0-9&.'\-]{2,}){0,3})\b/);
  if (acronym) {
    const candidate = sanitizeCompany(acronym[1]);
    const quality = scoreCandidate(candidate, "acronym");
    if (quality >= 0.78) return { name: candidate, confidence: quality };
  }

  return { name: null, confidence: 0 };
}

export function normalizeCompany(value) {
  return sanitizeCompany(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchKnownCompany(text) {
  for (const company of KNOWN_COMPANIES) {
    const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    if (pattern.test(text)) return company;
  }
  return null;
}

function sanitizeCompany(value) {
  return clean(value)
    .replace(COMPANY_SUFFIXES, "")
    .replace(/\s+/g, " ")
    .replace(/[,:;.\-]+$/, "")
    .trim();
}

function scoreCandidate(candidate, source) {
  if (!candidate || candidate.length < 3 || candidate.length > 60) return 0;

  const words = candidate
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}&.'-]/gu, ""))
    .filter(Boolean);

  if (!words.length) return 0;

  const lowerWords = words.map((word) => word.toLowerCase());

  if (lowerWords.every((word) => HEADLINE_STOP.has(word))) return 0;
  if (GEO_PREFIXES.has(lowerWords[0]) && words.length > 1) return 0.20;
  if (lowerWords.some((word) => NON_COMPANY_WORDS.has(word)) && !hasCorporateSignal(words)) return 0.25;

  let score = 0.55;

  if (source === "explicit") score += 0.18;
  if (source === "preposition") score += 0.12;
  if (source === "acronym") score += 0.20;

  if (hasCorporateSignal(words)) score += 0.18;
  if (words.length === 1) score -= 0.08;
  if (words.length >= 2 && words.length <= 3) score += 0.06;
  if (words.length > 4) score -= 0.15;

  const properCaseWords = words.filter((word) => /^[A-Z][a-z0-9&.'-]+$/.test(word)).length;
  const acronymWords = words.filter((word) => /^[A-Z0-9&.'-]{2,}$/.test(word)).length;

  if (properCaseWords + acronymWords === words.length) score += 0.08;
  if (lowerWords.some((word) => HEADLINE_STOP.has(word))) score -= 0.18;

  return Math.max(0, Math.min(0.99, score));
}

function hasCorporateSignal(words) {
  const joined = words.join(" ");
  return /\b(Inc|Corp|Ltd|LLC|GmbH|AG|SA|SpA|Group|Technologies|Systems|Industries|Electric|Electronics|Automation|Motors)\b/i.test(joined);
}
