import {
  decodeXml,
  dedupeProviderArticles,
  domainFromUrl,
  extractTag,
  fetchWithTimeout,
  toGdeltDate
} from "./common.js";

const TIMEOUT_MS = 15000;
const MAX_SOURCES_PER_RUN = 8;
const CONCURRENCY = 2;

export const companyNewsroomProvider = {
  id: "company-newsroom",

  async collect({ env }) {
    if (!env?.DB) {
      return { provider: "company-newsroom", articles: [], partial: false, errors: [] };
    }

    const result = await env.DB.prepare(`
      SELECT id, company, rss_url, newsroom_url
      FROM company_sources
      WHERE active = 1
        AND rss_url IS NOT NULL
        AND TRIM(rss_url) <> ''
      ORDER BY
        CASE WHEN last_checked_at IS NULL THEN 0 ELSE 1 END,
        last_checked_at ASC,
        priority DESC
      LIMIT ?
    `).bind(MAX_SOURCES_PER_RUN).all();

    const sources = result.results || [];
    const articles = [];
    const errors = [];

    for (let index = 0; index < sources.length; index += CONCURRENCY) {
      const batch = sources.slice(index, index + CONCURRENCY);
      const settled = await Promise.allSettled(batch.map(fetchRssSource));

      for (const item of settled) {
        if (item.status === "fulfilled") articles.push(...item.value);
        else errors.push(String(item.reason?.message || item.reason));
      }
    }

    if (sources.length) {
      await env.DB.batch(
        sources.map((source) => env.DB.prepare(`
          UPDATE company_sources
          SET last_checked_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(source.id))
      ).catch((error) => console.warn("Newsroom rotation update failed", error));
    }

    return {
      provider: "company-newsroom",
      articles: dedupeProviderArticles(articles),
      partial: errors.length > 0,
      errors
    };
  }
};

async function fetchRssSource(source) {
  const response = await fetchWithTimeout(source.rss_url, {
    headers: {
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      "user-agent": "Radaryum/5.5 (+https://radaryum.com)"
    },
    cf: { cacheTtl: 300, cacheEverything: true }
  }, TIMEOUT_MS);

  const xml = await response.text();
  if (!response.ok) throw new Error(`${source.company} newsroom HTTP ${response.status}`);

  const rssItems = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const atomItems = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

  return [...rssItems, ...atomItems].map((item) => {
    const title = decodeXml(extractTag(item, "title"));
    const link = decodeXml(
      extractTag(item, "link") ||
      (item.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] || "")
    );
    const pubDate =
      decodeXml(extractTag(item, "pubDate")) ||
      decodeXml(extractTag(item, "published")) ||
      decodeXml(extractTag(item, "updated"));

    if (!title || !link) return null;

    const published = new Date(pubDate);

    return {
      title,
      url: link,
      domain: domainFromUrl(link),
      seendate: toGdeltDate(Number.isNaN(published.getTime()) ? new Date() : published),
      requestedSignal: "product",
      provider: `Official newsroom: ${source.company}`,
      language: null,
      sourcecountry: null,
      sourceCompany: source.company
    };
  }).filter(Boolean);
}
