import { clean } from "../utils/text.js";

const COMPANY_SUFFIXES = /\b(incorporated|corporation|corp|company|co|limited|ltd|plc|llc|gmbh|ag|sa|spa|srl|bv|nv|group|holdings?|technologies|technology|systems|industries|industrial|electronics|electric|automation|motors|manufacturing|solutions)\b/gi;

const BAD_START_WORDS = new Set([
  "from", "via", "after", "before", "inside", "outside", "how", "why", "what",
  "when", "where", "this", "these", "those", "the", "a", "an", "our", "their",
  "your", "his", "her", "its", "it", "latest", "breaking", "analysis", "report",
  "china", "mexico", "egypt", "india", "global", "new", "first"
]);

const BAD_PHRASES = [
  /\bfrom informality\b/i,
  /\begypt wanda\b/i,
  /\bdeep gas well\b/i,
  /\boil field\b/i,
  /\bmarket report\b/i,
  /\bindustry report\b/i,
  /\bwhat it means\b/i,
  /\bit means\b/i,
  /\brecord trade surplus\b/i,
  /\bthailand economy\b/i,
  /\bpolicy\b/i,
  /\bgovernment\b/i,
  /\bminister\b/i
];

const GENERIC_ACRONYMS = new Set([
  "CPU", "GPU", "AI", "ML", "IoT", "EV", "ICE", "ERP", "CRM", "API", "SaaS",
  "OEM", "ODM", "EMS", "PCB", "PCBA", "SMT", "CNC", "CAD", "CAM", "CAGR",
  "GDP", "IPO", "M&A", "R&D", "ESG", "CO2", "USB", "LED", "LCD", "OLED",
  "HVAC", "BMS", "RFQ", "RFI", "PO", "MOQ"
]);

const NON_COMPANY_WORDS = new Set([
  "deep", "gas", "well", "wells", "oil", "field", "pipeline", "project", "terminal",
  "mine", "mining", "copper", "gold", "silver", "lithium", "report", "market",
  "industry", "sector", "informality", "economy", "government", "minister", "policy",
  "means", "record", "surplus", "trade", "tariff", "inflation", "export", "import"
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
  "Dow", "DuPont", "Celanese", "Covestro", "Solvay", "LyondellBasell",
  "NAVER", "Hyundai", "Kia", "SK Hynix", "TSMC", "Intel", "AMD", "Nvidia",
  "Microsoft", "Amazon", "Google", "Meta", "Apple", "Oracle", "Salesforce"
];

const COMPANY_VERBS = [
  "opens", "launches", "announces", "plans", "expands", "invests", "starts",
  "seeks", "hires", "acquires", "builds", "unveils", "partners", "selects"
];

export function extractCompany(title) {
  const original = clean(title);
  const headline = original.replace(/\s[-–—|:]\s.*$/, "").trim();

  if (!headline) return { name: null, confidence: 0 };
  if (BAD_PHRASES.some((pattern) => pattern.test(original))) return { name: null, confidence: 0 };
  if (startsWithBadWord(headline)) return { name: null, confidence: 0 };

  const known = matchKnownCompany(original);
  if (known) return { name: known, confidence: 0.98 };

  const verbPattern = COMPANY_VERBS.join("|");

  // Only trust first-position extraction when headline follows a strong corporate action pattern.
  const explicitPattern = new RegExp(
    `^([A-Z][A-Za-z0-9&.'\\-]*(?:\\s+[A-Z][A-Za-z0-9&.'\\-]*){0,3})\\s+(?:${verbPattern})\\b`,
    "i"
  );

  const explicit = headline.match(explicitPattern);
  if (explicit) {
    const candidate = sanitizeCompany(explicit[1]);
    const quality = scoreCandidate(candidate, "explicit");
    if (quality >= 0.78) return { name: candidate, confidence: quality };
  }

  // For "by/with/at/for X", require a corporate signal or known company. This avoids phrases.
  const afterPreposition = headline.match(
    /(?:by|at|for|with)\s+([A-Z][A-Za-z0-9&.'\-]*(?:\s+[A-Z][A-Za-z0-9&.'\-]*){0,3})(?:\s|$)/
  );

  if (afterPreposition) {
    const candidate = sanitizeCompany(afterPreposition[1]);
    const quality = scoreCandidate(candidate, "preposition");
    if (quality >= 0.82) return { name: candidate, confidence: quality };
  }

  // Acronyms are accepted only if they are known companies; otherwise too many false positives.
  return { name: null, confidence: 0 };
}

export function normalizeCompany(value) {
  return sanitizeCompany(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function startsWithBadWord(text) {
  const first = text.split(/\s+/)[0]?.replace(/[^\p{L}\p{N}&.'-]/gu, "").toLowerCase();
  return BAD_START_WORDS.has(first);
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

  if (BAD_START_WORDS.has(lowerWords[0])) return 0;
  if (words.length === 1 && GENERIC_ACRONYMS.has(words[0])) return 0;
  if (lowerWords.some((word) => NON_COMPANY_WORDS.has(word)) && !hasCorporateSignal(words)) return 0;

  let score = 0.48;

  if (source === "explicit") score += 0.18;
  if (source === "preposition") score += 0.10;

  if (hasCorporateSignal(words)) score += 0.26;
  else score -= 0.10;

  // Single-word unknown names are too risky. Known companies are already handled earlier.
  if (words.length === 1) score -= 0.35;

  if (words.length >= 2 && words.length <= 3) score += 0.08;
  if (words.length > 3) score -= 0.16;

  const properCaseWords = words.filter((word) => /^[A-Z][a-z0-9&.'-]+$/.test(word)).length;
  const acronymWords = words.filter((word) => /^[A-Z0-9&.'-]{2,}$/.test(word)).length;

  if (properCaseWords + acronymWords === words.length) score += 0.05;

  return Math.max(0, Math.min(0.99, score));
}

function hasCorporateSignal(words) {
  const joined = words.join(" ");
  return /\b(Inc|Corp|Ltd|LLC|GmbH|AG|SA|SpA|Group|Technologies|Systems|Industries|Electric|Electronics|Automation|Motors|Manufacturing|Solutions)\b/i.test(joined);
}
