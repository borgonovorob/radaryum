import { SIGNAL_GROUPS } from "../config/signals.js";

const SIMPLE_FALLBACK_QUERIES = [
  { id: "expansion", query: '"factory expansion" OR "new factory" OR "plant expansion" OR "manufacturing investment"' },
  { id: "procurement", query: '"procurement manager" OR "strategic sourcing" OR "commodity manager" OR "supplier development"' },
  { id: "product", query: '"new product" OR "product launch" OR "starts production" OR "new platform"' },
  { id: "supply", query: '"supplier shortage" OR "dual sourcing" OR "new supplier" OR "supply chain"' }
];

export async function fetchGdelt(window) {
  const normalizedWindow = normalizeTimespan(window);

  let results = await collect(SIGNAL_GROUPS, normalizedWindow, "primary");

  if (results.articles.length > 0) {
    return results.articles;
  }

  console.warn("GDELT primary queries returned zero articles. Retrying with fallback queries.", results.errors);

  results = await collect(SIMPLE_FALLBACK_QUERIES, normalizedWindow, "fallback");

  if (results.articles.length > 0) {
    return results.articles;
  }

  console.error("GDELT fallback queries also returned zero articles.", results.errors);
  return [];
}

async function collect(groups, window, mode) {
  const settled = await Promise.allSettled(
    groups.map((group) => fetchGroup(group, window, mode))
  );

  const articles = [];
  const errors = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
    } else {
      errors.push(String(result.reason?.message || result.reason));
    }
  }

  return { articles, errors };
}

async function fetchGroup(group, window, mode) {
  const endpoint = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  endpoint.searchParams.set("query", group.query);
  endpoint.searchParams.set("mode", "artlist");
  endpoint.searchParams.set("maxrecords", mode === "fallback" ? "80" : "120");
  endpoint.searchParams.set("timespan", window);
  endpoint.searchParams.set("sort", "datedesc");
  endpoint.searchParams.set("format", "json");

  const response = await fetch(endpoint.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": "Radaryum/4.1d (+https://radaryum.com)"
    },
    cf: { cacheTtl: 60, cacheEverything: true }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`GDELT ${group.id} ${mode} returned HTTP ${response.status}: ${text.slice(0, 180)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`GDELT ${group.id} ${mode} returned non-JSON: ${text.slice(0, 180)}`);
  }

  const articles = Array.isArray(data.articles) ? data.articles : [];

  return articles.map((article) => ({
    ...article,
    requestedSignal: group.id,
    provider: `GDELT DOC 2.0 ${mode}`
  }));
}

function normalizeTimespan(value) {
  if (value === "24h") return "24h";
  if (value === "3d") return "3d";
  if (value === "7d") return "7d";
  return "3d";
}
