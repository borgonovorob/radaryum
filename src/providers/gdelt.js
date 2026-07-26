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

const TIMEOUT_MS = 15000;
const ROTATION_INTERVAL_MS = 15 * 60 * 1000;

export const gdeltProvider = {
  id: "gdelt",

  async collect({ window }) {
    const normalizedWindow = normalizeWindow(window);
    const maxRecords = normalizedWindow === "7d" ? 80 : 50;

    // One GDELT request per collector cycle.
    // The category rotates every 15 minutes to reduce HTTP 429 responses.
    const rotationIndex =
      Math.floor(Date.now() / ROTATION_INTERVAL_MS) % QUERIES.length;
    const group = QUERIES[rotationIndex];

    try {
      const articles = await fetchGroup(group, normalizedWindow, maxRecords);

      return {
        provider: "gdelt",
        articles: dedupeProviderArticles(articles),
        partial: false,
        errors: []
      };
    } catch (error) {
      return {
        provider: "gdelt",
        articles: [],
        partial: true,
        errors: [String(error?.message || error)]
      };
    }
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
      "user-agent": "Radaryum/5.6 (+https://radaryum.com)"
    },
    cf: {
      cacheTtl: 300,
      cacheEverything: true
    }
  }, TIMEOUT_MS);

  const text = await response.text();

  if (response.status === 429) {
    throw new Error(
      `GDELT ${group.id} HTTP 429 — rate limited; next cycle will rotate to another category`
    );
  }

  if (!response.ok) {
    throw new Error(`GDELT ${group.id} HTTP ${response.status}`);
  }

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
