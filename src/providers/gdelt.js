const FAST_GDELT_QUERIES = [
  { id: "expansion", query: '"factory expansion" OR "new factory" OR "new plant" OR "manufacturing investment" OR "production capacity"' },
  { id: "procurement", query: '"strategic sourcing" OR "supplier development" OR "procurement manager" OR "commodity manager"' },
  { id: "product", query: '"starts production" OR "new product" OR "production program" OR "product launch"' },
  { id: "supply", query: '"supplier shortage" OR "dual sourcing" OR "supplier qualification" OR "supply chain"' }
];

const GOOGLE_NEWS_QUERIES = [
  { id: "expansion", query: 'manufacturing OR factory OR plant OR production capacity OR industrial investment' },
  { id: "procurement", query: 'procurement OR strategic sourcing OR supplier development OR commodity manager' },
  { id: "product", query: 'manufacturing product launch OR starts production OR production program' },
  { id: "supply", query: 'manufacturing supply chain OR supplier shortage OR dual sourcing OR supplier qualification' },
  { id: "expansion", query: 'automotive supplier investment OR electronics manufacturing expansion' },
  { id: "procurement", query: 'industrial supplier sourcing OR local sourcing manufacturing' }
];

export async function fetchGdelt(window) {
  const normalizedWindow = normalizeTimespan(window);
  const timeoutMs = normalizedWindow === "24h" ? 8500 : 5000;
  const maxPerQuery = normalizedWindow === "24h" ? 55 : 35;

  const [gdelt, google] = await Promise.allSettled([
    collectGdelt(FAST_GDELT_QUERIES, normalizedWindow, maxPerQuery, timeoutMs),
    collectGoogleNews(normalizedWindow, timeoutMs)
  ]);

  const articles = [
    ...valueOrEmpty(gdelt).articles,
    ...valueOrEmpty(google).articles
  ];

  const deduped = dedupeArticles(articles).slice(0, 160);

  if (deduped.length > 0) {
    console.log(`Real collectors returned ${deduped.length} articles for ${normalizedWindow}.`);
    return deduped;
  }

  console.warn(`Real collectors returned zero articles for ${normalizedWindow}.`);
  return [];
}

function valueOrEmpty(result) {
  if (result.status === "fulfilled") return result.value;
  return { articles: [], errors: [String(result.reason?.message || result.reason)] };
}

async function collectGdelt(groups, window, maxRecords, timeoutMs) {
  const settled = await Promise.allSettled(
    groups.map((group) => fetchGdeltGroup(group, window, maxRecords, timeoutMs))
  );

  const articles = [];
  for (const result of settled) {
    if (result.status === "fulfilled") articles.push(...result.value);
  }

  return { articles: dedupeArticles(articles) };
}

async function fetchGdeltGroup(group, window, maxRecords, timeoutMs) {
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
      "user-agent": "Radaryum/4.6-24h-collector-fix (+https://radaryum.com)"
    },
    cf: { cacheTtl: 30, cacheEverything: true }
  }, timeoutMs);

  const text = await response.text();
  if (!response.ok) throw new Error(`GDELT HTTP ${response.status}`);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("GDELT returned invalid JSON");
  }

  const articles = Array.isArray(data.articles) ? data.articles : [];

  return articles
    .filter((article) => article?.url && article?.title)
    .map((article) => ({
      ...article,
      requestedSignal: normalizeSignal(group.id),
      provider: "GDELT DOC 2.0"
    }));
}

async function collectGoogleNews(window, timeoutMs) {
  const settled = await Promise.allSettled(
    GOOGLE_NEWS_QUERIES.map((group) => fetchGoogleNewsGroup(group, window, timeoutMs))
  );

  const articles = [];
  for (const result of settled) {
    if (result.status === "fulfilled") articles.push(...result.value);
  }

  return { articles: dedupeArticles(articles).slice(0, 140) };
}

async function fetchGoogleNewsGroup(group, window, timeoutMs) {
  const endpoint = new URL("https://news.google.com/rss/search");
  endpoint.searchParams.set("q", `${group.query} when:${googleWhen(window)}`);
  endpoint.searchParams.set("hl", "en-US");
  endpoint.searchParams.set("gl", "US");
  endpoint.searchParams.set("ceid", "US:en");

  const response = await fetchWithTimeout(endpoint.toString(), {
    headers: {
      accept: "application/rss+xml, application/xml, text/xml",
      "user-agent": "Radaryum/4.6-24h-collector-fix (+https://radaryum.com)"
    },
    cf: { cacheTtl: 60, cacheEverything: true }
  }, timeoutMs);

  const xml = await response.text();
  if (!response.ok) throw new Error(`Google News RSS HTTP ${response.status}`);

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
  return ["24h", "3d", "7d"].includes(value) ? value : "3d";
}

function googleWhen(window) {
  if (window === "24h") return "1d";
  if (window === "7d") return "7d";
  return "3d";
}

function normalizeSignal(value) {
  return ["expansion", "procurement", "product", "supply"].includes(value)
    ? value
    : "expansion";
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
