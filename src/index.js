const SEARCH_GROUPS = [
  {
    id: "expansion",
    label: "Factory expansion",
    query: '("new factory" OR "new manufacturing plant" OR "plant expansion" OR "factory expansion" OR "production capacity" OR "manufacturing investment")'
  },
  {
    id: "procurement",
    label: "Procurement activity",
    query: '("procurement manager" OR "strategic sourcing manager" OR "commodity manager" OR "supplier development" OR "supplier qualification" OR "seeking suppliers")'
  },
  {
    id: "product",
    label: "Product or platform launch",
    query: '("launches new product" OR "new product platform" OR "new vehicle platform" OR "new production program" OR "starts production")'
  },
  {
    id: "supply",
    label: "Supply-chain change",
    query: '("supply chain disruption" OR "supplier shortage" OR "dual sourcing" OR "supplier consolidation" OR "new supplier" OR "localize supply chain")'
  }
];

const TERMS = {
  expansion: [
    ["new factory", 24], ["new manufacturing plant", 24], ["plant expansion", 20],
    ["factory expansion", 20], ["production capacity", 12], ["manufacturing investment", 16],
    ["new plant", 18], ["expand production", 15], ["capacity expansion", 17]
  ],
  procurement: [
    ["procurement manager", 22], ["strategic sourcing", 22], ["commodity manager", 22],
    ["supplier development", 18], ["supplier qualification", 20], ["seeking suppliers", 26],
    ["new supplier", 14], ["sourcing manager", 20]
  ],
  product: [
    ["launches new", 15], ["new product", 12], ["new platform", 17],
    ["new vehicle", 16], ["starts production", 18], ["new production program", 20]
  ],
  supply: [
    ["supply chain disruption", 18], ["supplier shortage", 22], ["dual sourcing", 23],
    ["supplier consolidation", 18], ["localize supply chain", 20], ["shortage", 10]
  ]
};

const INDUSTRIAL_TERMS = [
  "manufactur", "factory", "industrial", "automotive", "electrical", "electronics",
  "plastic", "resin", "polymer", "appliance", "sanitary", "machinery", "energy",
  "aerospace", "medical device", "semiconductor", "battery", "automation"
];

const COUNTRY_PATTERNS = [
  ["Mexico", /\bmexico\b|quer[eé]taro|monterrey|nuevo le[oó]n|tijuana|ciudad ju[aá]rez|guanajuato|san luis potos[ií]|puebla/i],
  ["United States", /\bunited states\b|\bu\.s\.\b|\busa\b|texas|california|ohio|michigan|north carolina|south carolina|tennessee|georgia/i],
  ["Canada", /\bcanada\b|ontario|qu[eé]bec|alberta/i],
  ["Germany", /\bgermany\b|bavaria|baden-w[uü]rttemberg|saxony/i],
  ["France", /\bfrance\b|nouvelle-aquitaine|hauts-de-france/i],
  ["Italy", /\bitaly\b|lombardy|piemont|emilia-romagna|veneto/i],
  ["Romania", /\bromania\b|bucharest|bac[aă]u|cluj|timi[sș]oara/i],
  ["Poland", /\bpoland\b|warsaw|wroc[lł]aw|katowice/i],
  ["United Kingdom", /\bunited kingdom\b|\buk\b|england|scotland|wales/i],
  ["China", /\bchina\b|shanghai|shenzhen|suzhou|guangdong|jiangsu/i],
  ["India", /\bindia\b|pune|chennai|bangalore|bengaluru|gujarat/i]
];

const cacheKey = new Request("https://radaryum.internal/api/opportunities?window=3d");

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/opportunities") {
      return handleOpportunities(request, ctx);
    }

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "radaryum",
        time: new Date().toISOString(),
        dataProvider: "GDELT DOC 2.0"
      }, 200, 60);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(refreshCache());
  }
};

async function handleOpportunities(request, ctx) {
  const url = new URL(request.url);
  const window = normalizeWindow(url.searchParams.get("window"));
  const signal = normalizeSignal(url.searchParams.get("signal"));
  const country = (url.searchParams.get("country") || "").trim();
  const minScore = clamp(Number(url.searchParams.get("minScore") || 55), 0, 100);

  try {
    let payload;
    if (window === "3d") {
      const cache = caches.default;
      let cached = await cache.match(cacheKey);
      if (!cached) {
        payload = await collectLive(window);
        const response = json(payload, 200, 900);
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      } else {
        payload = await cached.json();
      }
    } else {
      payload = await collectLive(window);
    }

    let items = payload.items;
    if (signal) items = items.filter((item) => item.signal === signal);
    if (country) items = items.filter((item) => item.country === country);
    items = items.filter((item) => item.score >= minScore);

    return json({
      ...payload,
      filters: { window, signal, country, minScore },
      items
    }, 200, 300);
  } catch (error) {
    console.error("Opportunity scan failed", error);
    return json({
      error: "The live public-source scan is temporarily unavailable.",
      detail: String(error?.message || error),
      generatedAt: new Date().toISOString(),
      items: []
    }, 502, 30);
  }
}

async function refreshCache() {
  try {
    const payload = await collectLive("3d");
    await caches.default.put(cacheKey, json(payload, 200, 900));
  } catch (error) {
    console.error("Scheduled refresh failed", error);
  }
}

async function collectLive(window) {
  const started = Date.now();
  const results = await Promise.allSettled(
    SEARCH_GROUPS.map((group) => fetchGroup(group, window))
  );

  const raw = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );

  const deduped = deduplicate(raw);
  const items = deduped
    .map(enrich)
    .filter((item) => item.score >= 45)
    .sort((a, b) => b.score - a.score || Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 100);

  return {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    provider: "GDELT DOC 2.0",
    methodology: "Public-source collection, deterministic classification, deduplication and rule-based relevance scoring.",
    caveat: "A score indicates commercial relevance, not verified buying intent or a confirmed RFQ.",
    items
  };
}

async function fetchGroup(group, window) {
  const endpoint = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  endpoint.searchParams.set("query", group.query);
  endpoint.searchParams.set("mode", "artlist");
  endpoint.searchParams.set("maxrecords", "100");
  endpoint.searchParams.set("timespan", window);
  endpoint.searchParams.set("sort", "datedesc");
  endpoint.searchParams.set("format", "json");

  const response = await fetch(endpoint, {
    headers: {
      "accept": "application/json",
      "user-agent": "Radaryum/1.0 (+https://radaryum.com)"
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
    requestedSignal: group.id
  }));
}

function deduplicate(items) {
  const byUrl = new Map();
  const titleFingerprints = new Set();

  for (const item of items) {
    const url = normalizeUrl(item.url);
    if (!url || byUrl.has(url)) continue;

    const fingerprint = normalizeTitle(item.title || "");
    if (!fingerprint || titleFingerprints.has(fingerprint)) continue;

    titleFingerprints.add(fingerprint);
    byUrl.set(url, { ...item, url });
  }

  return [...byUrl.values()];
}

function enrich(article) {
  const title = clean(article.title || "Untitled source");
  const domain = clean(article.domain || safeDomain(article.url));
  const combined = `${title} ${domain}`;
  const signal = classifySignal(combined, article.requestedSignal);
  const country = detectCountry(combined);
  const publishedAt = parseGdeltDate(article.seendate) || new Date().toISOString();
  const scoring = scoreOpportunity({ title, signal, country, publishedAt });

  return {
    id: stableId(article.url),
    title,
    url: article.url,
    domain,
    publishedAt,
    signal,
    signalLabel: SEARCH_GROUPS.find((g) => g.id === signal)?.label || "Industrial signal",
    country,
    score: scoring.score,
    confidence: scoring.score >= 82 ? "High" : scoring.score >= 67 ? "Medium" : "Review",
    reasons: scoring.reasons,
    suggestedAction: suggestedAction(signal),
    sourceLanguage: article.language || null,
    sourceCountry: article.sourcecountry || null
  };
}

function classifySignal(text, fallback) {
  const lower = text.toLowerCase();
  let best = fallback || "expansion";
  let highest = -1;

  for (const [signal, terms] of Object.entries(TERMS)) {
    const points = terms.reduce((sum, [term, weight]) =>
      sum + (lower.includes(term) ? weight : 0), 0);
    if (points > highest) {
      highest = points;
      best = signal;
    }
  }
  return best;
}

function scoreOpportunity({ title, signal, country, publishedAt }) {
  const lower = title.toLowerCase();
  let score = 36;
  const reasons = [];

  const matched = TERMS[signal]
    .filter(([term]) => lower.includes(term))
    .sort((a, b) => b[1] - a[1]);

  if (matched.length) {
    const signalPoints = Math.min(32, matched.reduce((sum, [, weight]) => sum + weight, 0));
    score += signalPoints;
    reasons.push(`Detected ${signal.replaceAll("-", " ")} language in the current source.`);
  }

  if (INDUSTRIAL_TERMS.some((term) => lower.includes(term))) {
    score += 10;
    reasons.push("The headline is directly related to manufacturing or an industrial market.");
  }

  if (country !== "Other / undetected") {
    score += 7;
    reasons.push(`A specific industrial geography was detected: ${country}.`);
  }

  if (/\b(million|billion|investment|capacity|production|supplier|procurement|sourcing)\b/i.test(title)) {
    score += 8;
    reasons.push("The source includes investment, capacity, production or sourcing terminology.");
  }

  const ageHours = Math.max(0, (Date.now() - Date.parse(publishedAt)) / 3600000);
  if (ageHours <= 24) {
    score += 7;
    reasons.push("The signal was published within the last 24 hours.");
  } else if (ageHours <= 72) {
    score += 3;
    reasons.push("The signal is recent.");
  } else if (ageHours > 120) {
    score -= 5;
  }

  return { score: clamp(Math.round(score), 0, 100), reasons: reasons.slice(0, 4) };
}

function suggestedAction(signal) {
  const actions = {
    expansion: "Verify the investment and identify the plant, program and local sourcing leadership.",
    procurement: "Verify the role or sourcing initiative and identify the responsible category or commodity manager.",
    product: "Map the product architecture, likely components and expected sourcing or industrialization window.",
    supply: "Check whether the event creates dual-sourcing, localization or replacement-supplier demand."
  };
  return actions[signal] || "Review the original source and verify the commercial relevance.";
}

function detectCountry(text) {
  for (const [country, pattern] of COUNTRY_PATTERNS) {
    if (pattern.test(text)) return country;
  }
  return "Other / undetected";
}

function parseGdeltDate(value) {
  if (!value) return null;
  const s = String(value);
  const match = s.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`).toISOString();
  }
  const timestamp = Date.parse(s);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"]
      .forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeTitle(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 14)
    .join(" ");
}

function clean(value) {
  return String(value)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function stableId(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeWindow(value) {
  return ["24h", "3d", "7d"].includes(value) ? value : "3d";
}

function normalizeSignal(value) {
  return SEARCH_GROUPS.some((group) => group.id === value) ? value : "";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": "*"
    }
  });
}
