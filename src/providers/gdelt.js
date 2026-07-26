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
  }
];

const GOOGLE_NEWS_QUERIES = [
  { id: "expansion", query: 'manufacturing investment OR factory expansion OR new plant OR production capacity' },
  { id: "procurement", query: 'procurement manager OR strategic sourcing OR supplier development OR commodity manager manufacturing' },
  { id: "product", query: 'manufacturing new product launch OR starts production OR production program' },
  { id: "supply", query: 'manufacturing supply chain OR supplier shortage OR dual sourcing OR supplier qualification' },
  { id: "expansion", query: 'automotive supplier factory investment OR industrial manufacturing expansion' },
  { id: "procurement", query: 'electronics manufacturing supplier sourcing OR industrial supplier qualification' }
];

export async function fetchGdelt(window) {
  const normalizedWindow = normalizeTimespan(window);

  const gdeltAttempts = [
    { name: "primary", groups: SIGNAL_GROUPS, records: 120 },
    { name: "real-fallback", groups: REAL_FALLBACK_QUERIES, records: 100 }
  ];

  const errors = [];

  for (const attempt of gdeltAttempts) {
    const result = await collectGdelt(attempt.groups, normalizedWindow, attempt.name, attempt.records);

    if (result.articles.length > 0) {
      console.log(`GDELT ${attempt.name} returned ${result.articles.length} real articles.`);
      return result.articles;
    }

    errors.push(...result.errors);
    console.warn(`GDELT ${attempt.name} returned zero articles.`);
  }

  const rssResult = await collectGoogleNews(normalizedWindow);

  if (rssResult.articles.length > 0) {
    console.log(`Google News RSS returned ${rssResult.articles.length} real articles.`);
    return rssResult.articles;
  }

  errors.push(...rssResult.errors);
  console.error("All real news collectors returned zero articles.", JSON.stringify(errors));
  return [];
}

async function collectGdelt(groups, window, mode, maxRecords) {
  const settled = await Promise.allSettled(
    groups.map((group) => fetchGdeltGroup(group, window, mode, maxRecords))
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

  const response = await fetch(endpoint.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": "Radaryum/4.3-real-news-collectors (+https://radaryum.com)"
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
    GOOGLE_NEWS_QUERIES.map((group) => fetchGoogleNewsGroup(group, window))
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

  return { articles: dedupeArticles(articles).slice(0, 180), errors };
}

async function fetchGoogleNewsGroup(group, window) {
  const when = googleWhen(window);
  const endpoint = new URL("https://news.google.com/rss/search");
  endpoint.searchParams.set("q", `${group.query} when:${when}`);
  endpoint.searchParams.set("hl", "en-US");
  endpoint.searchParams.set("gl", "US");
  endpoint.searchParams.set("ceid", "US:en");

  const response = await fetch(endpoint.toString(), {
    headers: {
      accept: "application/rss+xml, application/xml, text/xml",
      "user-agent": "Radaryum/4.3-real-news-collectors (+https://radaryum.com)"
    },
    cf: { cacheTtl: 60, cacheEverything: true }
  });

  const xml = await response.text();

  if (!response.ok) {
    throw new Error(`Google News RSS ${group.id} HTTP ${response.status}: ${xml.slice(0, 180)}`);
  }

  return parseRss(xml, group.id);
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
