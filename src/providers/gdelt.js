import {
  dedupeProviderArticles,
  fetchWithTimeout,
  normalizeWindow,
  sleep
} from "./common.js";

const QUERIES = [
  { id: "expansion", query: '"factory expansion" OR "new factory" OR "new plant" OR "manufacturing investment" OR "production capacity"' },
  { id: "procurement", query: '"strategic sourcing" OR "supplier development" OR "procurement manager" OR "commodity manager"' },
  { id: "product", query: '"starts production" OR "new product" OR "production program" OR "product launch"' },
  { id: "supply", query: '"supplier shortage" OR "dual sourcing" OR "supplier qualification" OR "supply chain"' }
];

const TIMEOUT_MS = 15000;
const REQUEST_DELAY_MS = 1500;

export const gdeltProvider = {
  id: "gdelt",

  async collect({ window }) {
    const normalizedWindow = normalizeWindow(window);
    const maxRecords = normalizedWindow === "7d" ? 60 : 45;
    const articles = [];
    const errors = [];

    // GDELT is intentionally queried sequentially to reduce HTTP 429 responses.
    for (let index = 0; index < QUERIES.length; index += 1) {
      const group = QUERIES[index];

      try {
        articles.push(...await fetchGroup(group, normalizedWindow, maxRecords));
      } catch (error) {
        errors.push(String(error?.message || error));
      }

      if (index < QUERIES.length - 1) await sleep(REQUEST_DELAY_MS);
    }

    return {
      provider: "gdelt",
      articles: dedupeProviderArticles(articles),
      partial: errors.length > 0,
      errors
    };
  }
};

async function fetchGroup(group, window, maxRecords) {
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
      "user-agent": "Radaryum/5.5 (+https://radaryum.com)"
    },
    cf: { cacheTtl: 120, cacheEverything: true }
  }, TIMEOUT_MS);

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
