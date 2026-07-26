import {
  dedupeProviderArticles,
  domainFromUrl,
  fetchWithTimeout,
  toGdeltDate
} from "./common.js";

const MATERIAL_FORMS = new Set(["8-K", "10-K", "10-Q", "6-K", "20-F"]);

export const secEdgarProvider = {
  id: "sec-edgar",

  async collect({ env }) {
    if (!env?.DB) {
      return { provider: "sec-edgar", articles: [], partial: false, errors: [] };
    }

    const result = await env.DB.prepare(`
      SELECT id, company, sec_cik
      FROM company_sources
      WHERE active = 1
        AND sec_cik IS NOT NULL
        AND TRIM(sec_cik) <> ''
      ORDER BY priority DESC, COALESCE(last_success_at, '') ASC
      LIMIT 15
    `).all();

    const sources = result.results || [];
    const settled = await Promise.allSettled(
      sources.map((source) => fetchCompanySubmissions(source))
    );

    const articles = [];
    const errors = [];

    for (const result of settled) {
      if (result.status === "fulfilled") articles.push(...result.value);
      else errors.push(String(result.reason?.message || result.reason));
    }

    return {
      provider: "sec-edgar",
      articles: dedupeProviderArticles(articles),
      partial: errors.length > 0,
      errors
    };
  }
};

async function fetchCompanySubmissions(source) {
  const cik = String(source.sec_cik).replace(/\D/g, "").padStart(10, "0");
  const endpoint = `https://data.sec.gov/submissions/CIK${cik}.json`;

  const response = await fetchWithTimeout(endpoint, {
    headers: {
      accept: "application/json",
      "user-agent": "Radaryum admin@radaryum.com"
    },
    cf: { cacheTtl: 900, cacheEverything: true }
  }, 5000);

  const text = await response.text();
  if (!response.ok) throw new Error(`${source.company} SEC HTTP ${response.status}`);

  const data = JSON.parse(text);
  const recent = data?.filings?.recent;
  if (!recent) return [];

  const articles = [];

  for (let index = 0; index < Math.min(20, recent.form?.length || 0); index += 1) {
    const form = recent.form[index];
    if (!MATERIAL_FORMS.has(form)) continue;

    const filingDate = recent.filingDate[index];
    const accession = String(recent.accessionNumber[index] || "").replace(/-/g, "");
    const primaryDocument = recent.primaryDocument[index];
    if (!filingDate || !accession || !primaryDocument) continue;

    const rawCik = String(Number(cik));
    const url = `https://www.sec.gov/Archives/edgar/data/${rawCik}/${accession}/${primaryDocument}`;
    const published = new Date(`${filingDate}T12:00:00Z`);

    articles.push({
      title: `${source.company} filed ${form} with the SEC`,
      url,
      domain: domainFromUrl(url),
      seendate: toGdeltDate(published),
      requestedSignal: form === "8-K" || form === "6-K" ? "expansion" : "product",
      provider: "SEC EDGAR",
      language: "English",
      sourcecountry: "United States",
      sourceCompany: source.company
    });
  }

  return articles;
}
