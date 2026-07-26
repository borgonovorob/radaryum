import { SIGNAL_GROUPS } from "../config/signals.js";

const REAL_FALLBACK_QUERIES = [
  {
    id: "expansion",
    query: '"factory expansion" OR "new factory" OR "new plant" OR "manufacturing investment" OR "plant expansion" OR "production capacity"'
  },
  {
    id: "procurement",
    query: '"procurement manager" OR "strategic sourcing" OR "commodity manager" OR "supplier development" OR "supplier qualification" OR "new supplier"'
  },
  {
    id: "product",
    query: '"new product" OR "product launch" OR "starts production" OR "new platform" OR "production program"'
  },
  {
    id: "supply",
    query: '"supply chain" OR "supplier shortage" OR "dual sourcing" OR "supplier qualification" OR "local sourcing"'
  },
  {
    id: "investment",
    query: '"manufacturing investment" OR "industrial investment" OR "capacity investment" OR "production investment"'
  }
];

const BROAD_REAL_QUERIES = [
  {
    id: "expansion",
    query: 'manufacturing factory expansion investment'
  },
  {
    id: "procurement",
    query: 'procurement sourcing supplier manufacturing'
  },
  {
    id: "product",
    query: 'production manufacturing product launch'
  },
  {
    id: "supply",
    query: 'supply chain supplier manufacturing'
  }
];

export async function fetchGdelt(window) {
  const normalizedWindow = normalizeTimespan(window);

  const attempts = [
    { name: "primary", groups: SIGNAL_GROUPS, records: 120 },
    { name: "real-fallback", groups: REAL_FALLBACK_QUERIES, records: 100 },
    { name: "broad-real", groups: BROAD_REAL_QUERIES, records: 80 }
  ];

  const errors = [];

  for (const attempt of attempts) {
    const result = await collect(attempt.groups, normalizedWindow, attempt.name, attempt.records);

    if (result.articles.length > 0) {
      console.log(`GDELT ${attempt.name} returned ${result.articles.length} real articles.`);
      return result.articles;
    }

    errors.push(...result.errors);
    console.warn(`GDELT ${attempt.name} returned zero articles.`);
  }

  console.error("All real GDELT attempts returned zero articles.", JSON.stringify(errors));
  return [];
}

async function collect(groups, window, mode, maxRecords) {
  const settled = await Promise.allSettled(
    groups.map((group) => fetchGroup(group, window, mode, maxRecords))
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

async function fetchGroup(group, window, mode, maxRecords) {
  const endpoint = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  endpoint.searchParams.set("query", group.query);
  endpoint.searchParams.set("mode", "artlist");
  endpoint.searchParams.set("maxrecords", String(maxRecords));
  endpoint.searchParams.set("timespan", window);
  endpoint.searchParams.set("sort", "datedesc");
  endpoint.searchParams.set("format", "json");

  const response = await fetch(endpoint.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": "Radaryum/4.2-real-news-only (+https://radaryum.com)"
    },
    cf: {
      cacheTtl: 30,
      cacheEverything: true
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`GDELT ${group.id} ${mode} HTTP ${response.status}: ${text.slice(0, 180)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GDELT ${group.id} ${mode} non-JSON: ${text.slice(0, 180)}`);
  }

  const articles = Array.isArray(data.articles) ? data.articles : [];

  return articles
    .filter((article) => article?.url && article?.title)
    .map((article) => ({
      ...article,
      requestedSignal: normalizeSignal(group.id),
      provider: `GDELT DOC 2.0 ${mode}`
    }));
}

function normalizeTimespan(value) {
  if (value === "24h") return "24h";
  if (value === "3d") return "3d";
  if (value === "7d") return "7d";
  return "3d";
}

function normalizeSignal(value) {
  if (value === "investment") return "expansion";
  if (["expansion", "procurement", "product", "supply"].includes(value)) return value;
  return "expansion";
}
