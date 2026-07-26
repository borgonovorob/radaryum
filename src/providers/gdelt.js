import {
  dedupeProviderArticles,
  fetchWithTimeout,
  normalizeWindow
} from "./common.js";

const QUERIES = [
  { id: "expansion", query: '"factory expansion" OR "new factory" OR "new plant" OR "manufacturing investment" OR "production capacity"' },
  { id: "procurement", query: '"strategic sourcing" OR "supplier development" OR "procurement manager" OR "commodity manager"' },
  { id: "product", query: '"starts production" OR "new product" OR "production program" OR "product launch"' },
  { id: "supply", query: '"supplier shortage" OR "dual sourcing" OR "supplier qualification" OR "supply chain"' }
];

export const gdeltProvider = {
  id: "gdelt",
  async collect({ window }) {
    const normalizedWindow = normalizeWindow(window);
    const timeoutMs = normalizedWindow === "7d" ? 6000 : 5000;
    const maxRecords = normalizedWindow === "7d" ? 55 : 40;

    const settled = await Promise.allSettled(
      QUERIES.map((group) => fetchGroup(group, normalizedWindow, maxRecords, timeoutMs))
    );

    const articles = [];
    const errors = [];

    for (const result of settled) {
      if (result.status === "fulfilled") articles.push(...result.value);
      else errors.push(String(result.reason?.message || result.reason));
    }

    return {
      provider: "gdelt",
      articles: dedupeProviderArticles(articles),
      partial: errors.length > 0,
      errors
    };
  }
};

async function fetchGroup(group, window, maxRecords, timeoutMs) {
  const endpoint = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  endpoint.searchParams.set("query", group.query);
  endpoint.searchParams.set("mode", "artlist");
  endpoint.searchParams.set("maxrecords", String(maxRecords));
  endpoint.searchParams.set("timespan", window);
  endpoint.searchParams.set("sort", "datedesc");
  endpoint.searchParams.set("format", "json");

  const response = await fetchWithTimeout(endpoint.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": "Radaryum/5.0 (+https://radaryum.com)"
    },
    cf: { cacheTtl: 60, cacheEverything: true }
  }, timeoutMs);

  const text = await response.text();
  if (!response.ok) throw new Error(`GDELT ${group.id} HTTP ${response.status}`);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GDELT ${group.id} returned invalid JSON`);
  }

  return (Array.isArray(data.articles) ? data.articles : [])
    .filter((article) => article?.url && article?.title)
    .map((article) => ({
      ...article,
      requestedSignal: group.id,
      provider: "GDELT DOC 2.0"
    }));
}
