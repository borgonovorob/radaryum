import { SIGNAL_GROUPS } from "../config/signals.js";

const SIMPLE_FALLBACK_QUERIES = [
  { id: "expansion", query: "manufacturing expansion factory investment" },
  { id: "procurement", query: "procurement sourcing supplier manager" },
  { id: "product", query: "new product manufacturing production launch" },
  { id: "supply", query: "supply chain supplier shortage sourcing" }
];

const DEMO_FALLBACK_ARTICLES = [
  {
    title: "ABB expands manufacturing capacity for electrification products",
    url: "https://radaryum.com/demo/abb-expands-manufacturing-capacity",
    domain: "radaryum.com",
    seendate: "20260726010000",
    requestedSignal: "expansion",
    provider: "RADARYUM DEMO FALLBACK",
    language: "English",
    sourcecountry: "Switzerland"
  },
  {
    title: "Siemens announces new production program for industrial automation",
    url: "https://radaryum.com/demo/siemens-production-program",
    domain: "radaryum.com",
    seendate: "20260726005500",
    requestedSignal: "product",
    provider: "RADARYUM DEMO FALLBACK",
    language: "English",
    sourcecountry: "Germany"
  },
  {
    title: "Bosch hiring strategic sourcing manager for manufacturing operations",
    url: "https://radaryum.com/demo/bosch-strategic-sourcing-manager",
    domain: "radaryum.com",
    seendate: "20260726005000",
    requestedSignal: "procurement",
    provider: "RADARYUM DEMO FALLBACK",
    language: "English",
    sourcecountry: "Germany"
  },
  {
    title: "Schneider Electric invests in new capacity for energy management equipment",
    url: "https://radaryum.com/demo/schneider-electric-capacity",
    domain: "radaryum.com",
    seendate: "20260726004500",
    requestedSignal: "expansion",
    provider: "RADARYUM DEMO FALLBACK",
    language: "English",
    sourcecountry: "France"
  },
  {
    title: "Danfoss seeks supplier development support for new manufacturing platform",
    url: "https://radaryum.com/demo/danfoss-supplier-development",
    domain: "radaryum.com",
    seendate: "20260726004000",
    requestedSignal: "procurement",
    provider: "RADARYUM DEMO FALLBACK",
    language: "English",
    sourcecountry: "Denmark"
  },
  {
    title: "Honeywell starts production of new automation components",
    url: "https://radaryum.com/demo/honeywell-automation-production",
    domain: "radaryum.com",
    seendate: "20260726003500",
    requestedSignal: "product",
    provider: "RADARYUM DEMO FALLBACK",
    language: "English",
    sourcecountry: "United States"
  },
  {
    title: "Eaton expands electrical equipment production capacity in North America",
    url: "https://radaryum.com/demo/eaton-production-capacity",
    domain: "radaryum.com",
    seendate: "20260726003000",
    requestedSignal: "expansion",
    provider: "RADARYUM DEMO FALLBACK",
    language: "English",
    sourcecountry: "United States"
  },
  {
    title: "Jabil adds supplier qualification roles for electronics manufacturing",
    url: "https://radaryum.com/demo/jabil-supplier-qualification",
    domain: "radaryum.com",
    seendate: "20260726002500",
    requestedSignal: "procurement",
    provider: "RADARYUM DEMO FALLBACK",
    language: "English",
    sourcecountry: "United States"
  }
];

export async function fetchGdelt(window) {
  const normalizedWindow = normalizeTimespan(window);

  let result = await collect(SIGNAL_GROUPS, normalizedWindow, "primary");

  if (result.articles.length > 0) {
    console.log(`GDELT primary returned ${result.articles.length} articles.`);
    return result.articles;
  }

  console.warn("GDELT primary returned zero articles. Retrying fallback.", JSON.stringify(result.errors));

  result = await collect(SIMPLE_FALLBACK_QUERIES, normalizedWindow, "fallback");

  if (result.articles.length > 0) {
    console.log(`GDELT fallback returned ${result.articles.length} articles.`);
    return result.articles;
  }

  console.error("GDELT returned zero articles. Using marked Radaryum demo fallback.", JSON.stringify(result.errors));
  return DEMO_FALLBACK_ARTICLES.map((article) => ({
    ...article,
    seendate: currentGdeltDate()
  }));
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
  endpoint.searchParams.set("maxrecords", mode === "fallback" ? "50" : "100");
  endpoint.searchParams.set("timespan", window);
  endpoint.searchParams.set("sort", "datedesc");
  endpoint.searchParams.set("format", "json");

  const response = await fetch(endpoint.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": "Radaryum/4.1e (+https://radaryum.com)"
    },
    cf: { cacheTtl: 30, cacheEverything: true }
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

function currentGdeltDate() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join("") + "T" + [
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds())
  ].join("") + "Z";
}
