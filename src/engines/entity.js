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
  /\bminister\b/i,
  /\bcentral bank\b/i,
  /\bstock market\b/i,
  /\btrade surplus\b/i,
  /\binflation report\b/i
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

const COMPANY_ALIASES = [
  ["LG Energy Solution", ["LG Energy Solution", "LGES"]],
  ["LG Electronics", ["LG Electronics", "LGE"]],
  ["LG Display", ["LG Display"]],
  ["GE Appliances", ["GE Appliances", "General Electric Appliances"]],
  ["Schneider Electric", ["Schneider Electric"]],
  ["Rockwell Automation", ["Rockwell Automation"]],
  ["Johnson Controls", ["Johnson Controls"]],
  ["TE Connectivity", ["TE Connectivity"]],
  ["Parker Hannifin", ["Parker Hannifin"]],
  ["General Motors", ["General Motors", "GM"]],
  ["Mercedes-Benz", ["Mercedes-Benz", "Mercedes Benz"]],
  ["SK Hynix", ["SK Hynix"]],
  ["Delta Faucet", ["Delta Faucet"]],
  ["LyondellBasell", ["LyondellBasell"]],
  ["Foxconn", ["Foxconn", "Hon Hai"]],
  ["NAVER", ["NAVER"]],
  ["Tesla", ["Tesla"]],
  ["ABB", ["ABB"]],
  ["Siemens", ["Siemens"]],
  ["Bosch", ["Bosch"]],
  ["Stellantis", ["Stellantis"]],
  ["Toyota", ["Toyota"]],
  ["Honda", ["Honda"]],
  ["Nissan", ["Nissan"]],
  ["BMW", ["BMW"]],
  ["Volkswagen", ["Volkswagen"]],
  ["Ford", ["Ford"]],
  ["Valeo", ["Valeo"]],
  ["Forvia", ["Forvia"]],
  ["Magna", ["Magna"]],
  ["Aptiv", ["Aptiv"]],
  ["Continental", ["Continental"]],
  ["Denso", ["Denso"]],
  ["Yazaki", ["Yazaki"]],
  ["Lear", ["Lear"]],
  ["Whirlpool", ["Whirlpool"]],
  ["Electrolux", ["Electrolux"]],
  ["Kohler", ["Kohler"]],
  ["Moen", ["Moen"]],
  ["Honeywell", ["Honeywell"]],
  ["Emerson", ["Emerson"]],
  ["Eaton", ["Eaton"]],
  ["Carrier", ["Carrier"]],
  ["Trane", ["Trane"]],
  ["Daikin", ["Daikin"]],
  ["Panasonic", ["Panasonic"]],
  ["Samsung", ["Samsung"]],
  ["Flex", ["Flex"]],
  ["Jabil", ["Jabil"]],
  ["Amphenol", ["Amphenol"]],
  ["Molex", ["Molex"]],
  ["Hubbell", ["Hubbell"]],
  ["Leviton", ["Leviton"]],
  ["Danfoss", ["Danfoss"]],
  ["Grundfos", ["Grundfos"]],
  ["Xylem", ["Xylem"]],
  ["3M", ["3M"]],
  ["BASF", ["BASF"]],
  ["SABIC", ["SABIC"]],
  ["Dow", ["Dow"]],
  ["DuPont", ["DuPont"]],
  ["Celanese", ["Celanese"]],
  ["Covestro", ["Covestro"]],
  ["Solvay", ["Solvay"]],
  ["Hyundai", ["Hyundai"]],
  ["Kia", ["Kia"]],
  ["TSMC", ["TSMC"]],
  ["Intel", ["Intel"]],
  ["AMD", ["AMD"]],
  ["Nvidia", ["Nvidia"]],
  ["Microsoft", ["Microsoft"]],
  ["Amazon", ["Amazon"]],
  ["Google", ["Google"]],
  ["Meta", ["Meta"]],
  ["Apple", ["Apple"]],
  ["Oracle", ["Oracle"]],
  ["Salesforce", ["Salesforce"]],
  ["LG", ["LG"]]
];

const COMPANY_ACTIONS = [
  "opens", "launches", "announces", "plans", "expands", "invests", "starts",
  "seeks", "hires", "acquires", "builds", "unveils", "partners", "selects",
  "adds", "increases", "relocates", "awards", "qualifies", "targets", "eyes",
  "commits", "secures", "raises", "signs", "develops", "establishes",
  "upgrades", "doubles", "boosts", "accelerates", "moves", "enters", "forms",
  "completes", "begins", "breaks ground", "will invest", "will build",
  "to invest", "to build", "to open", "to expand", "is investing",
  "is building", "is opening", "is expanding"
];

export function extractCompany(title, dynamicCompanies = []) {
  const original = clean(title);
  const headline = original.replace(/\s[-–—|:]\s.*$/, "").trim();

  if (!headline) return { name: null, confidence: 0 };
  if (BAD_PHRASES.some((pattern) => pattern.test(original))) return { name: null, confidence: 0 };
  if (startsWithBadWord(headline)) return { name: null, confidence: 0 };

  const configured = matchConfiguredCompany(original, dynamicCompanies);
  if (configured) return { name: configured, confidence: 0.995 };

  const known = matchKnownCompany(original);
  if (known) return { name: known, confidence: 0.99 };

  const explicit = extractLeadingCompanyBeforeVerb(headline);
  if (explicit) return explicit;

  const afterPreposition = headline.match(
    /(?:by|at|for|with)\s+([A-Z][A-Za-z0-9&.'\-]*(?:\s+[A-Z][A-Za-z0-9&.'\-]*){0,3})(?:\s|$)/
  );

  if (afterPreposition) {
    const candidate = sanitizeCompany(afterPreposition[1]);
    const quality = scoreCandidate(candidate, "preposition");
    if (quality >= 0.84) return { name: candidate, confidence: quality };
  }

  return { name: null, confidence: 0 };
}

function extractLeadingCompanyBeforeVerb(headline) {
  const actionPattern = COMPANY_ACTIONS
    .map((action) => action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
    .join("|");

  // Capture the shortest company-like phrase before a corporate action.
  // Examples:
  // "Pearl Global Builds..." -> "Pearl Global"
  // "BeOne Medicines Plans $300M..." -> "BeOne Medicines"
  // "ABC Group to build a new plant..." -> "ABC Group"
  const pattern = new RegExp(
    `^(.{2,100}?)\\s+(?:${actionPattern})\\b`,
    "i"
  );

  const match = headline.match(pattern);
  if (match) {
    const candidate = validateLeadingCandidate(match[1]);
    if (candidate) return candidate;
  }

  // Secondary fallback: take the opening title-cased phrase before punctuation.
  // This covers headlines where the action verb is not yet in the catalog.
  const opening = headline.match(
    /^((?:[A-Z0-9][A-Za-z0-9&.'-]*)(?:\s+[A-Z0-9][A-Za-z0-9&.'-]*){0,3})(?=\s+(?:[a-z$€£]|\d)|\s*[,;:—–-])/
  );

  if (opening) {
    const candidate = validateLeadingCandidate(opening[1], 0.04);
    if (candidate) return candidate;
  }

  return null;
}

function validateLeadingCandidate(value, confidenceBonus = 0.14) {
  const rawCandidate = clean(value)
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/[,:;—–-]+$/, "")
    .trim();

  const words = rawCandidate.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return null;

  const companyLikeWords = words.filter((word) =>
    /^[A-Z0-9][A-Za-z0-9&.'-]*$/.test(word)
  ).length;

  if (companyLikeWords !== words.length) return null;

  const candidate = sanitizeCompany(rawCandidate);
  if (!candidate) return null;

  const baseQuality = scoreCandidate(candidate, "explicit");
  const confidence = Math.min(0.96, baseQuality + confidenceBonus);

  if (confidence < 0.76) return null;
  return { name: candidate, confidence };
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

function matchConfiguredCompany(text, companies) {
  for (const company of companies || []) {
    const canonical = clean(company?.company || company?.name || company);
    if (!canonical || canonical.length < 2) continue;

    const candidates = [canonical, ...(Array.isArray(company?.aliases) ? company.aliases : [])];
    for (const alias of candidates) {
      const value = clean(alias);
      if (!value || value.length < 2) continue;
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, "i");
      if (pattern.test(text)) return canonical;
    }
  }
  return null;
}

function matchKnownCompany(text) {
  for (const [canonical, aliases] of COMPANY_ALIASES) {
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`\\b${escaped}\\b`, "i");
      if (pattern.test(text)) return canonical;
    }
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
