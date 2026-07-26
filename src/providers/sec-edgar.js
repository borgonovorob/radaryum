import {
  dedupeProviderArticles,
  domainFromUrl,
  fetchWithTimeout,
  normalizeWindow,
  toGdeltDate
} from "./common.js";

const MATERIAL_FORMS = new Set(["8-K", "10-K", "10-Q", "6-K", "20-F"]);
const MAX_CONCURRENCY = 2;
const SUBMISSIONS_TIMEOUT_MS = 30000;
const FILING_TIMEOUT_MS = 30000;
const CACHE_TTL_SECONDS = 3600;
const MAX_FILINGS_PER_COMPANY = 4;

const SIGNAL_RULES = [
  {
    signal: "expansion",
    label: "industrial expansion or investment",
    terms: [
      ["new manufacturing facility", 5],
      ["new production facility", 5],
      ["factory expansion", 5],
      ["plant expansion", 5],
      ["production capacity", 4],
      ["manufacturing capacity", 4],
      ["capital expenditure", 4],
      ["capital expenditures", 4],
      ["manufacturing line", 4],
      ["production line", 4],
      ["new facility", 3],
      ["new plant", 4],
      ["capacity expansion", 5],
      ["construction", 2],
      ["expansion", 2],
      ["investment", 2],
      ["capex", 3]
    ]
  },
  {
    signal: "procurement",
    label: "procurement or supplier activity",
    terms: [
      ["strategic sourcing", 5],
      ["supplier qualification", 5],
      ["supplier development", 5],
      ["dual sourcing", 5],
      ["local sourcing", 4],
      ["new supplier", 4],
      ["procurement", 3],
      ["sourcing", 3],
      ["supplier agreement", 4],
      ["supply agreement", 4]
    ]
  },
  {
    signal: "supply",
    label: "supply-chain change or risk",
    terms: [
      ["supply chain disruption", 5],
      ["supplier shortage", 5],
      ["component shortage", 5],
      ["supply constraint", 4],
      ["supply constraints", 4],
      ["supply chain", 2],
      ["supplier risk", 4],
      ["localization", 3],
      ["alternative supplier", 4]
    ]
  },
  {
    signal: "product",
    label: "new product or production program",
    terms: [
      ["new product launch", 5],
      ["commercial production", 5],
      ["start of production", 5],
      ["starts production", 5],
      ["production program", 4],
      ["new platform", 4],
      ["new product", 3],
      ["commercialization", 3],
      ["product launch", 4],
      ["new model", 3]
    ]
  },
  {
    signal: "expansion",
    label: "contract, acquisition or strategic transaction",
    terms: [
      ["definitive agreement", 3],
      ["material agreement", 3],
      ["joint venture", 4],
      ["acquisition", 3],
      ["acquire", 3],
      ["contract award", 5],
      ["awarded contract", 5],
      ["strategic partnership", 4]
    ]
  }
];

const GENERIC_FALSE_POSITIVE_TERMS = [
  "share repurchase",
  "dividend",
  "executive compensation",
  "stock-based compensation",
  "earnings per share",
  "income tax",
  "accounting standards",
  "interest expense",
  "foreign exchange"
];

export const secEdgarProvider = {
  id: "sec-edgar",

  async collect({ env, window }) {
    if (!env?.DB) {
      return {
        provider: "sec-edgar",
        articles: [],
        partial: false,
        errors: []
      };
    }

    const normalizedWindow = normalizeWindow(window);

    const result = await env.DB.prepare(`
      SELECT id, company, sec_cik
      FROM company_sources
      WHERE active = 1
        AND sec_cik IS NOT NULL
        AND TRIM(sec_cik) <> ''
      ORDER BY priority DESC, COALESCE(last_success_at, '') ASC
      LIMIT 40
    `).all();

    const sources = result.results || [];

    if (!sources.length) {
      return {
        provider: "sec-edgar",
        articles: [],
        partial: false,
        errors: []
      };
    }

    const collected = [];
    const errors = [];

    for (let index = 0; index < sources.length; index += MAX_CONCURRENCY) {
      const batch = sources.slice(index, index + MAX_CONCURRENCY);

      const settled = await Promise.allSettled(
        batch.map((source) => fetchCompanyFilings(source, normalizedWindow))
      );

      for (const item of settled) {
        if (item.status === "fulfilled") {
          collected.push(...item.value);
        } else {
          errors.push(String(item.reason?.message || item.reason));
        }
      }
    }

    return {
      provider: "sec-edgar",
      articles: dedupeProviderArticles(collected),
      partial: errors.length > 0,
      errors
    };
  }
};

async function fetchCompanyFilings(source, window) {
  const cik = String(source.sec_cik).replace(/\D/g, "").padStart(10, "0");
  const endpoint = `https://data.sec.gov/submissions/CIK${cik}.json`;

  const response = await fetchWithTimeout(endpoint, {
    headers: secHeaders(),
    cf: {
      cacheTtl: CACHE_TTL_SECONDS,
      cacheEverything: true
    }
  }, SUBMISSIONS_TIMEOUT_MS);

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${source.company} SEC submissions HTTP ${response.status}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${source.company} SEC submissions returned invalid JSON`);
  }

  const recent = data?.filings?.recent;
  if (!recent) return [];

  const cutoff = windowCutoff(window);
  const candidates = [];

  for (let index = 0; index < Math.min(50, recent.form?.length || 0); index += 1) {
    const form = recent.form[index];
    if (!MATERIAL_FORMS.has(form)) continue;

    const filingDate = recent.filingDate[index];
    const accession = String(recent.accessionNumber[index] || "").replace(/-/g, "");
    const primaryDocument = recent.primaryDocument[index];

    if (!filingDate || !accession || !primaryDocument) continue;

    const published = new Date(`${filingDate}T12:00:00Z`);
    if (Number.isNaN(published.getTime()) || published < cutoff) continue;

    const rawCik = String(Number(cik));
    const url = `https://www.sec.gov/Archives/edgar/data/${rawCik}/${accession}/${primaryDocument}`;

    candidates.push({
      form,
      filingDate,
      published,
      url
    });

    if (candidates.length >= MAX_FILINGS_PER_COMPANY) break;
  }

  const articles = [];

  for (const candidate of candidates) {
    try {
      const article = await analyzeFiling(source, candidate);
      if (article) articles.push(article);
    } catch (error) {
      console.warn(`SEC filing analysis failed for ${source.company}`, error);
    }
  }

  return articles;
}

async function analyzeFiling(source, filing) {
  const response = await fetchWithTimeout(filing.url, {
    headers: secHeaders(),
    cf: {
      cacheTtl: CACHE_TTL_SECONDS,
      cacheEverything: true
    }
  }, FILING_TIMEOUT_MS);

  const html = await response.text();

  if (!response.ok) {
    throw new Error(`${source.company} ${filing.form} HTTP ${response.status}`);
  }

  const text = normalizeFilingText(html);
  const relevance = scoreFiling(text);

  if (!relevance.relevant) {
    return null;
  }

  return {
    title: `${source.company} ${filing.form} signals ${relevance.label}`,
    url: filing.url,
    domain: domainFromUrl(filing.url),
    seendate: toGdeltDate(filing.published),
    requestedSignal: relevance.signal,
    provider: "SEC EDGAR",
    language: "English",
    sourcecountry: "United States",
    sourceCompany: source.company,
    secForm: filing.form,
    secRelevanceScore: relevance.score,
    secMatchedTerms: relevance.matchedTerms,
    secEvidenceSnippet: evidenceSnippet(text, relevance.matchedTerms)
  };
}


function evidenceSnippet(text, matchedTerms) {
  if (!text || !matchedTerms?.length) return null;

  const strongest = [...matchedTerms]
    .sort((a, b) => b.length - a.length)
    .find((term) => text.includes(term));

  if (!strongest) return null;

  const index = text.indexOf(strongest);
  const start = Math.max(0, index - 180);
  const end = Math.min(text.length, index + strongest.length + 260);

  return text
    .slice(start, end)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 520);
}

function scoreFiling(text) {
  if (!text) {
    return {
      relevant: false,
      signal: "product",
      label: "no actionable industrial signal",
      score: 0,
      matchedTerms: []
    };
  }

  let best = {
    signal: "product",
    label: "no actionable industrial signal",
    score: 0,
    matchedTerms: []
  };

  for (const rule of SIGNAL_RULES) {
    let score = 0;
    const matchedTerms = [];

    for (const [term, weight] of rule.terms) {
      if (text.includes(term)) {
        score += weight;
        matchedTerms.push(term);
      }
    }

    if (score > best.score) {
      best = {
        signal: rule.signal,
        label: rule.label,
        score,
        matchedTerms
      };
    }
  }

  const genericPenalty = GENERIC_FALSE_POSITIVE_TERMS
    .filter((term) => text.includes(term))
    .length;

  const adjustedScore = Math.max(0, best.score - Math.min(4, genericPenalty));

  const hasStrongTerm = best.matchedTerms.some((term) =>
    SIGNAL_RULES.some((rule) =>
      rule.terms.some(([candidate, weight]) => candidate === term && weight >= 4)
    )
  );

  return {
    ...best,
    score: adjustedScore,
    relevant: adjustedScore >= 5 && hasStrongTerm
  };
}

function normalizeFilingText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .slice(0, 1_500_000);
}

function secHeaders() {
  return {
    accept: "application/json,text/html,application/xhtml+xml",
    "user-agent": "Radaryum/5.1 contact@radaryum.com"
  };
}

function windowCutoff(window) {
  const hours =
    window === "24h" ? 24 :
    window === "7d" ? 24 * 7 :
    24 * 3;

  return new Date(Date.now() - hours * 60 * 60 * 1000);
}