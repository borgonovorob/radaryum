import { SIGNAL_GROUPS } from "../config/signals.js";

const FAST_GDELT_QUERIES = [
  { id: "expansion", query: '"factory expansion" OR "new factory" OR "new plant" OR "manufacturing investment"' },
  { id: "procurement", query: '"strategic sourcing" OR "supplier development" OR "procurement manager"' },
  { id: "product", query: '"starts production" OR "new product" OR "production program"' },
  { id: "supply", query: '"supplier shortage" OR "dual sourcing" OR "supplier qualification"' }
];

const FAST_GOOGLE_NEWS_QUERIES = [
  { id: "expansion", query: 'manufacturing investment OR factory expansion OR new plant' },
  { id: "procurement", query: 'strategic sourcing OR supplier development manufacturing' },
  { id: "product", query: 'manufacturing new product launch OR starts production' },
  { id: "supply", query: 'manufacturing supply chain OR supplier shortage' }
];

const FETCH_TIMEOUT_MS = 3500;
const MAX_PER_QUERY = 35;

export async function fetchGdelt(window) {
  const normalizedWindow = normalizeTimespan(window);

  // Fast production mode: query fewer sources, with short timeouts, and return partial real data.
  const [gdelt, google] = await Promise.allSettled([
    collectGdelt(FAST_GDELT_QUERIES, normalizedWindow, "fast", MAX_PER_QUERY),
    collectGoogleNews(normalizedWindow)
  ]);

  const articles = [
    ...valueOrEmpty(gdelt).articles,
    ...valueOrEmpty(google).articles
  ];

  const deduped = dedupeArticles(articles).slice(0, 120);

  if (deduped.length > 0) {
    console.log(`Fast real collectors returned ${deduped.length} articles.`);
    return deduped;
  }

  console.warn("Fast real collectors returned zero articles. No demo fallback used.");
  return [];
}

function valueOrEmpty(result) {
  if (result.status === "fulfilled") return result.value;
  return { articles: [], errors: [String(result.reason?.message || result.reason)] };
}

async function collectGdelt(groups, window, mode, maxRecords) {
  const settled = await Promise.allSettled(
    groups.map((group) => fetchGdeltGroup(group, window, mode, maxRecords))
  );

  const articles = [];
  const errors = [];

  for (const result of settled) {
    if (result.status === "fulfilled") articles.push(...result.value);
    else errors.push(String(result.reason?.message || result.reason));
  }

  return { articles: dedupeArticles(articles), errors };
}

async function fetchGdeltGroup(group, window, mode, maxRecords) {
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
      "user-agent": "Radaryum/4.3c-fast-live-json-safe (+https://radaryum.com)"
    },
    cf: { cacheTtl: 30, cacheEverything: true }
  }, FETCH_TIMEOUT_MS);

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`GDELT ${group.id} ${mode} HTTP ${response.status}: ${text.slice(0, 120)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GDELT ${group.id} ${mode} non-JSON`);
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

async function collectGoogleNews(window) {
  const settled = await Promise.allSettled(
    FAST_GOOGLE_NEWS_QUERIES.map((group) => fetchGoogleNewsGroup(group, window))
  );

  const articles = [];
  const errors = [];

  for (const result of settled) {
    if (result.status === "fulfilled") articles.push(...result.value);
    else errors.push(String(result.reason?.message || result.reason));
  }

  return { articles: dedupeArticles(articles).slice(0, 100), errors };
}

async function fetchGoogleNewsGroup(group, window) {
  const when = googleWhen(window);
  const endpoint = new URL("https://news.google.com/rss/search");
  endpoint.searchParams.set("q", `${group.query} when:${when}`);
  endpoint.searchParams.set("hl", "en-US");
  endpoint.searchParams.set("gl", "US");
  endpoint.searchParams.set("ceid", "US:en");

  const response = await fetchWithTimeout(endpoint.toString(), {
    headers: {
      accept: "application/rss+xml, application/xml, text/xml",
      "user-agent": "Radaryum/4.3c-fast-live-json-safe (+https://radaryum.com)"
    },
    cf: { cacheTtl: 60, cacheEverything: true }
  }, FETCH_TIMEOUT_MS);

  const xml = await response.text();

  if (!response.ok) {
    throw new Error(`Google News RSS ${group.id} HTTP ${response.status}: ${xml.slice(0, 120)}`);
  }

  return parseRss(xml, group.id);
}

async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseRss(xml, signal) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  return items.map((item) => {
    const title = decodeXml(extractTag(item, "title"));
    const link = decodeXml(extractTag(item, "link"));
    const pubDate = decodeXml(extractTag(item, "pubDate"));
    const sourceName = decodeXml(extractTag(item, "source"));
    const sourceUrl = decodeXml(extractAttr(item, "source", "url"));
    const published = new Date(pubDate);

    if (!title || !link) return null;

    return {
      title: stripGoogleSuffix(title),
      url: link,
      domain: domainFromUrl(sourceUrl || link) || sourceName || "news.google.com",
      seendate: toGdeltDate(Number.isNaN(published.getTime()) ? new Date() : published),
      requestedSignal: normalizeSignal(signal),
      provider: "Google News RSS",
      language: "English",
      sourcecountry: "United States"
    };
  }).filter(Boolean);
}

function extractTag(xml, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(pattern);
  return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}

function extractAttr(xml, tag, attr) {
  const pattern = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "i");
  const match = xml.match(pattern);
  return match ? match[1].trim() : "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripGoogleSuffix(title) {
  return title.replace(/\s+-\s+[^-]{2,80}$/, "").trim();
}

function dedupeArticles(articles) {
  const seen = new Set();
  const clean = [];

  for (const article of articles) {
    const key = (article.url || article.title || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    clean.push(article);
  }

  return clean;
}

function domainFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeTimespan(value) {
  if (value === "24h") return "24h";
  if (value === "3d") return "3d";
  if (value === "7d") return "7d";
  return "3d";
}

function googleWhen(window) {
  if (window === "24h") return "1d";
  if (window === "7d") return "7d";
  return "3d";
}

function normalizeSignal(value) {
  if (["expansion", "procurement", "product", "supply"].includes(value)) return value;
  return "expansion";
}

function toGdeltDate(date) {
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
