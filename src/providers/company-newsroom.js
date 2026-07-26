import {
  decodeXml,
  dedupeProviderArticles,
  domainFromUrl,
  extractTag,
  fetchWithTimeout,
  toGdeltDate
} from "./common.js";

export const companyNewsroomProvider = {
  id: "company-newsroom",

  async collect({ env, window }) {
    if (!env?.DB) {
      return { provider: "company-newsroom", articles: [], partial: false, errors: [] };
    }

    const result = await env.DB.prepare(`
      SELECT id, company, rss_url, newsroom_url
      FROM company_sources
      WHERE active = 1
        AND rss_url IS NOT NULL
        AND TRIM(rss_url) <> ''
      ORDER BY priority DESC, COALESCE(last_success_at, '') ASC
      LIMIT 20
    `).all();

    const sources = result.results || [];
    const settled = await Promise.allSettled(
      sources.map((source) => fetchRssSource(source, window))
    );

    const articles = [];
    const errors = [];

    for (const result of settled) {
      if (result.status === "fulfilled") articles.push(...result.value);
      else errors.push(String(result.reason?.message || result.reason));
    }

    return {
      provider: "company-newsroom",
      articles: dedupeProviderArticles(articles),
      partial: errors.length > 0,
      errors
    };
  }
};

async function fetchRssSource(source, window) {
  const response = await fetchWithTimeout(source.rss_url, {
    headers: {
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      "user-agent": "Radaryum/5.0 (+https://radaryum.com)"
    },
    cf: { cacheTtl: 300, cacheEverything: true }
  }, 5000);

  const xml = await response.text();
  if (!response.ok) throw new Error(`${source.company} newsroom HTTP ${response.status}`);

  const rssItems = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const atomItems = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  const items = [...rssItems, ...atomItems];

  return items.map((item) => {
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
