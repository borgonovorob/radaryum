import { SIGNAL_GROUPS } from "../config/signals.js";

export async function fetchGdelt(window) {
  const results = await Promise.allSettled(
    SIGNAL_GROUPS.map((group) => fetchGroup(group, window))
  );

  return results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
}

async function fetchGroup(group, window) {
  const endpoint = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  endpoint.searchParams.set("query", group.query);
  endpoint.searchParams.set("mode", "artlist");
  endpoint.searchParams.set("maxrecords", "120");
  endpoint.searchParams.set("timespan", window);
  endpoint.searchParams.set("sort", "datedesc");
  endpoint.searchParams.set("format", "json");

  const response = await fetch(endpoint, {
    headers: {
      accept: "application/json",
      "user-agent": "Radaryum/3.0 (+https://radaryum.com)"
    },
    cf: { cacheTtl: 600, cacheEverything: true }
  });

  if (!response.ok) {
    throw new Error(`GDELT ${group.id} returned HTTP ${response.status}`);
  }

  const data = await response.json();
  const articles = Array.isArray(data.articles) ? data.articles : [];
  return articles.map((article) => ({
    ...article,
    requestedSignal: group.id,
    provider: "GDELT DOC 2.0"
  }));
}
