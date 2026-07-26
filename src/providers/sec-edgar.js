import {
  dedupeProviderArticles,
  domainFromUrl,
  fetchWithTimeout,
  normalizeWindow,
  toGdeltDate
} from "./common.js";

const MATERIAL_FORMS = new Set(["8-K", "10-K", "10-Q", "6-K", "20-F"]);
const MAX_CONCURRENCY = 2;
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_SECONDS = 3600;

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
        batch.map((source) => fetchCompanySubmissions(source, normalizedWindow))
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

async function fetchCompanySubmissions(source, window) {
  const cik = String(source.sec_cik).replace(/\D/g, "").padStart(10, "0");
  const endpoint = `https://data.sec.gov/submissions/CIK${cik}.json`;

  const response = await fetchWithTimeout(endpoint, {
    headers: {
      accept: "application/json",
      "user-agent": "Radaryum/5.0 contact@radaryum.com"
    },
    cf: {
      cacheTtl: CACHE_TTL_SECONDS,
      cacheEverything: true
    }
  }, REQUEST_TIMEOUT_MS);

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${source.company} SEC HTTP ${response.status}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${source.company} SEC returned invalid JSON`);
  }

  const recent = data?.filings?.recent;
  if (!recent) return [];

  const cutoff = windowCutoff(window);
  const articles = [];

  for (let index = 0; index < Math.min(40, recent.form?.length || 0); index += 1) {
    const form = recent.form[index];
    if (!MATERIAL_FORMS.has(form)) continue;

    const filingDate = recent.filingDate[index];
    const accession = String(recent.accessionNumber[index] || "").replace(/-/g, "");
    const primaryDocument = recent.primaryDocument[index];

    if (!filingDate || !accession || !primaryDocument) continue;

    const published = new Date(`${filingDate}T12:00:00Z`);

    if (Number.isNaN(published.getTime()) || published < cutoff) {
      continue;
    }

    const rawCik = String(Number(cik));
    const url = `https://www.sec.gov/Archives/edgar/data/${rawCik}/${accession}/${primaryDocument}`;

    articles.push({
      title: `${source.company} filed ${form} with the SEC`,
      url,
      domain: domainFromUrl(url),
      seendate: toGdeltDate(published),
      requestedSignal: filingSignal(form),
      provider: "SEC EDGAR",
      language: "English",
      sourcecountry: "United States",
      sourceCompany: source.company
    });
  }

  return articles;
}

function filingSignal(form) {
  if (form === "8-K" || form === "6-K") return "expansion";
  if (form === "10-Q" || form === "10-K" || form === "20-F") return "product";
  return "product";
}

function windowCutoff(window) {
  const now = Date.now();

  const hours =
    window === "24h" ? 24 :
    window === "7d" ? 24 * 7 :
    24 * 3;

  return new Date(now - hours * 60 * 60 * 1000);
}
