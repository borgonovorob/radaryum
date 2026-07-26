const SITE_URL = "https://radaryum.com";
const INDEX_MIN_EVENTS = 3;
const INDEX_MIN_SOURCES = 2;
const INDEX_MAX_AGE_DAYS = 180;
const PUBLIC_EVENT_LIMIT = 40;

const INDUSTRIES = [
  { slug: "automotive", name: "Automotive", keywords: ["automotive", "vehicle", "car", "truck", "ev", "battery", "ford", "gm", "toyota", "geely", "volkswagen", "bmw", "mercedes", "stellantis", "tesla", "magna", "valeo", "forvia", "aisin", "kostal"] },
  { slug: "electronics", name: "Electronics", keywords: ["electronics", "semiconductor", "chip", "display", "sensor", "connector", "circuit", "flex", "amphenol", "hubbell", "leviton"] },
  { slug: "electrical-equipment", name: "Electrical Equipment", keywords: ["electrical", "power", "switchgear", "breaker", "grid", "transformer", "energy", "siemens", "schneider", "abb", "hubbell", "eaton"] },
  { slug: "industrial-equipment", name: "Industrial Equipment", keywords: ["industrial equipment", "machinery", "pump", "compressor", "automation", "tooling", "factory equipment", "dover", "grundfos", "xylem", "danfoss"] },
  { slug: "medical-devices", name: "Medical Devices", keywords: ["medical device", "diagnostic", "healthcare equipment", "pharma manufacturing", "beone medicines", "medtech"] }
];

const SIGNAL_PAGES = [
  { slug: "factory-expansion", name: "Factory Expansion", keys: ["expansion"], description: "Public signals related to new plants, capacity additions, production transfers and manufacturing investment." },
  { slug: "procurement", name: "Procurement Activity", keys: ["procurement"], description: "Public signals related to sourcing, supplier activity, purchasing and commercial opportunities." },
  { slug: "supply-chain", name: "Supply-Chain Change", keys: ["supply"], description: "Public signals related to supplier changes, localization, restructuring and supply-chain movement." },
  { slug: "product-programs", name: "Product Programs", keys: ["product"], description: "Public signals related to product launches, platform programs and new production requirements." }
];

export async function renderCompaniesIndex(env) {
  const companies = await readCompanies(env);
  const eligibleCount = companies.filter(isIndexEligible).length;
  const cards = companies.map(companyCard).join("");
  const description = "Browse companies with public manufacturing, sourcing, expansion and supply-chain signals detected by Radaryum.";
  return htmlResponse(pageShell({
    title: "Industrial Company Signals | Radaryum",
    description,
    canonical: `${SITE_URL}/companies`,
    body: `<main class="page-shell">${header()}${breadcrumbs([{ name: "Home", url: "/" }, { name: "Companies" }])}
      <section class="page-hero"><p class="kicker">PUBLIC COMPANY INDEX</p><h1>Industrial companies showing active opportunity signals</h1><p>Explore public evidence of manufacturing investment, sourcing activity, plant expansion, product programs and supply-chain change.</p><div class="stat-line"><strong>${companies.length}</strong> companies tracked · <strong>${eligibleCount}</strong> currently eligible for search indexing</div></section>
      <section class="company-grid">${cards || emptyState("No company signals are available yet.")}</section>${signupCta("Track the companies that matter to you")}</main>${footer()}`,
    structuredData: [collectionSchema("Radaryum Industrial Company Signals", `${SITE_URL}/companies`, description, companies.slice(0, 100).map((c) => ({ name: c.company, url: `${SITE_URL}/company/${slugify(c.company)}` }))), breadcrumbSchema([{ name: "Home", url: `${SITE_URL}/` }, { name: "Companies", url: `${SITE_URL}/companies` }])]
  }));
}

export async function renderCompanyPage(env, rawSlug) {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return notFoundPage("Company");
  const companies = await readCompanies(env);
  const company = companies.find((row) => slugify(row.company) === slug || slugify(row.normalized_company) === slug);
  if (!company) return notFoundPage("Company");
  const events = await readCompanyEvents(env, company.id, company.company);
  const related = await readRelatedCompanies(env, events, company.company);
  const canonical = `${SITE_URL}/company/${slugify(company.company)}`;
  const description = `Track public manufacturing, sourcing, investment, product and supply-chain signals related to ${company.company}.`;
  return htmlResponse(pageShell({
    title: `${company.company} Industrial Opportunity Signals | Radaryum`, description, canonical,
    robots: isIndexEligible(company) ? "index,follow,max-image-preview:large" : "noindex,follow",
    body: `<main class="page-shell">${header()}${breadcrumbs([{ name: "Home", url: "/" }, { name: "Companies", url: "/companies" }, { name: company.company }])}
      <section class="page-hero company-hero"><p class="kicker">INDUSTRIAL OPPORTUNITY INTELLIGENCE</p><h1>${escapeHtml(company.company)} public opportunity signals</h1><p>${escapeHtml(description)}</p><div class="stat-grid"><div><strong>${number(company.event_count)}</strong><span>signals detected</span></div><div><strong>${number(company.source_count)}</strong><span>source domains</span></div><div><strong>${number(company.signal_count)}</strong><span>signal categories</span></div><div><strong>${number(company.score)}</strong><span>company score</span></div></div><div class="chips">${[...safeArray(company.signals_json), ...safeArray(company.countries_json)].map((v) => `<span>${escapeHtml(label(v))}</span>`).join("")}</div></section>
      ${eventSection("RECENT PUBLIC EVIDENCE", "Latest detected signals", events, company.latest_at)}
      ${related.length ? `<section class="content-section"><p class="kicker">RELATED COMPANIES</p><h2>Companies appearing in the same public signals</h2><div class="related-links">${related.map((name) => `<a href="/company/${slugify(name)}">${escapeHtml(name)}</a>`).join("")}</div></section>` : ""}
      ${signupCta(`Create a free account to monitor ${company.company}`, company.company)}<p class="disclaimer">Radaryum organizes public-source signals for human review. Scores are not probabilities, confirmed RFQs or purchase orders.</p></main>${footer()}`,
    structuredData: [
      { "@context": "https://schema.org", "@type": "Organization", "@id": `${canonical}#organization`, name: company.company, mainEntityOfPage: { "@id": `${canonical}#webpage` } },
      collectionSchema(`${company.company} Industrial Opportunity Signals`, canonical, description, events.map((e) => ({ name: e.title, url: e.url })), company.latest_at),
      breadcrumbSchema([{ name: "Home", url: `${SITE_URL}/` }, { name: "Companies", url: `${SITE_URL}/companies` }, { name: company.company, url: canonical }])
    ]
  }));
}

export async function renderLatestPage(env) {
  const events = await readPublicEvents(env, { limit: PUBLIC_EVENT_LIMIT });
  const description = "The latest public manufacturing, procurement, expansion and supply-chain signals detected by Radaryum.";
  return renderEventCollection({ title: "Latest Industrial Signals | Radaryum", heading: "Latest industrial opportunity signals", kicker: "LATEST PUBLIC EVIDENCE", description, canonical: `${SITE_URL}/latest`, events, trail: [{ name: "Home", url: "/" }, { name: "Latest" }] });
}

export async function renderTrendingPage(env) {
  const events = await readPublicEvents(env, { limit: PUBLIC_EVENT_LIMIT, trending: true });
  const description = "High-scoring public industrial signals ranked by recent activity, source diversity and commercial relevance.";
  return renderEventCollection({ title: "Trending Industrial Opportunity Signals | Radaryum", heading: "Trending industrial opportunity signals", kicker: "TRENDING NOW", description, canonical: `${SITE_URL}/trending`, events, trail: [{ name: "Home", url: "/" }, { name: "Trending" }], intro: "A live ranking for human review—not a forecast or confirmed RFQ." });
}

export async function renderCountriesIndex(env) {
  const groups = await readCountryGroups(env);
  return renderTaxonomyIndex({ title: "Industrial Signals by Country | Radaryum", heading: "Browse industrial signals by country", kicker: "COUNTRY INTELLIGENCE", description: "Explore public manufacturing, sourcing, investment and supply-chain signals grouped by country.", canonical: `${SITE_URL}/countries`, groups, basePath: "/country", trail: [{ name: "Home", url: "/" }, { name: "Countries" }] });
}

export async function renderCountryPage(env, rawSlug) {
  const groups = await readCountryGroups(env);
  const group = groups.find((g) => slugify(g.name) === normalizeSlug(rawSlug));
  if (!group) return notFoundPage("Country");
  const events = await readPublicEvents(env, { country: group.name, limit: PUBLIC_EVENT_LIMIT });
  const canonical = `${SITE_URL}/country/${slugify(group.name)}`;
  return renderEventCollection({ title: `${group.name} Manufacturing and Procurement Signals | Radaryum`, heading: `${group.name} industrial opportunity signals`, kicker: "COUNTRY INTELLIGENCE", description: `Public manufacturing, procurement, investment and supply-chain signals related to ${group.name}.`, canonical, events, indexable: group.event_count >= INDEX_MIN_EVENTS && group.source_count >= INDEX_MIN_SOURCES, trail: [{ name: "Home", url: "/" }, { name: "Countries", url: "/countries" }, { name: group.name }] });
}

export async function renderSignalsIndex(env) {
  const counts = await readSignalGroups(env);
  const groups = SIGNAL_PAGES.map((s) => ({ ...s, ...(counts.find((c) => s.keys.includes(c.key)) || { event_count: 0, source_count: 0, latest_at: null }) }));
  return renderTaxonomyIndex({ title: "Industrial Signal Types | Radaryum", heading: "Browse industrial opportunity signal types", kicker: "SIGNAL INTELLIGENCE", description: "Explore public evidence grouped by factory expansion, procurement, supply-chain change and product programs.", canonical: `${SITE_URL}/signals`, groups, basePath: "/signals", trail: [{ name: "Home", url: "/" }, { name: "Signals" }] });
}

export async function renderSignalPage(env, rawSlug) {
  const signal = SIGNAL_PAGES.find((s) => s.slug === normalizeSlug(rawSlug));
  if (!signal) return notFoundPage("Signal");
  const events = await readPublicEvents(env, { signals: signal.keys, limit: PUBLIC_EVENT_LIMIT });
  const sourceCount = uniqueDomains(events).size;
  return renderEventCollection({ title: `${signal.name} Signals | Radaryum`, heading: signal.name, kicker: "SIGNAL INTELLIGENCE", description: signal.description, canonical: `${SITE_URL}/signals/${signal.slug}`, events, indexable: events.length >= INDEX_MIN_EVENTS && sourceCount >= INDEX_MIN_SOURCES, trail: [{ name: "Home", url: "/" }, { name: "Signals", url: "/signals" }, { name: signal.name }] });
}

export async function renderIndustriesIndex(env) {
  const events = await readPublicEvents(env, { limit: 500 });
  const groups = INDUSTRIES.map((industry) => {
    const matches = events.filter((e) => eventMatchesIndustry(e, industry));
    return { ...industry, event_count: matches.length, source_count: uniqueDomains(matches).size, latest_at: matches[0]?.published_at || null };
  });
  return renderTaxonomyIndex({ title: "Industrial Opportunity Signals by Industry | Radaryum", heading: "Browse industrial signals by industry", kicker: "INDUSTRY INTELLIGENCE", description: "Explore public manufacturing, sourcing, expansion and supply-chain signals across industrial sectors.", canonical: `${SITE_URL}/industries`, groups, basePath: "/industry", trail: [{ name: "Home", url: "/" }, { name: "Industries" }] });
}

export async function renderIndustryPage(env, rawSlug) {
  const industry = INDUSTRIES.find((i) => i.slug === normalizeSlug(rawSlug));
  if (!industry) return notFoundPage("Industry");
  const all = await readPublicEvents(env, { limit: 500 });
  const events = all.filter((e) => eventMatchesIndustry(e, industry)).slice(0, PUBLIC_EVENT_LIMIT);
  const canonical = `${SITE_URL}/industry/${industry.slug}`;
  return renderEventCollection({ title: `${industry.name} Manufacturing and Procurement Signals | Radaryum`, heading: `${industry.name} industrial opportunity signals`, kicker: "INDUSTRY INTELLIGENCE", description: `Public manufacturing, procurement, expansion and supply-chain signals related to the ${industry.name.toLowerCase()} industry.`, canonical, events, indexable: events.length >= INDEX_MIN_EVENTS && uniqueDomains(events).size >= INDEX_MIN_SOURCES, trail: [{ name: "Home", url: "/" }, { name: "Industries", url: "/industries" }, { name: industry.name }] });
}

export async function renderSitemap(env) {
  const companies = (await readCompanies(env)).filter(isIndexEligible);
  const countries = (await readCountryGroups(env)).filter((g) => g.event_count >= INDEX_MIN_EVENTS && g.source_count >= INDEX_MIN_SOURCES);
  const signals = await Promise.all(SIGNAL_PAGES.map(async (s) => ({ ...s, events: await readPublicEvents(env, { signals: s.keys, limit: PUBLIC_EVENT_LIMIT }) })));
  const allEvents = await readPublicEvents(env, { limit: 500 });
  const industries = INDUSTRIES.map((i) => ({ ...i, events: allEvents.filter((e) => eventMatchesIndustry(e, i)) })).filter((i) => i.events.length >= INDEX_MIN_EVENTS && uniqueDomains(i.events).size >= INDEX_MIN_SOURCES);
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ["/", "weekly", "1.0"], ["/companies", "daily", "0.9"], ["/latest", "daily", "0.9"], ["/trending", "daily", "0.9"], ["/countries", "weekly", "0.8"], ["/industries", "weekly", "0.8"], ["/signals", "weekly", "0.8"]
  ].map(([path, freq, priority]) => sitemapEntry(`${SITE_URL}${path}`, today, freq, priority));
  urls.push(...companies.map((c) => sitemapEntry(`${SITE_URL}/company/${slugify(c.company)}`, String(c.latest_at || today).slice(0, 10), "daily", "0.8")));
  urls.push(...countries.map((c) => sitemapEntry(`${SITE_URL}/country/${slugify(c.name)}`, String(c.latest_at || today).slice(0, 10), "daily", "0.7")));
  urls.push(...signals.filter((s) => s.events.length >= INDEX_MIN_EVENTS && uniqueDomains(s.events).size >= INDEX_MIN_SOURCES).map((s) => sitemapEntry(`${SITE_URL}/signals/${s.slug}`, String(s.events[0]?.published_at || today).slice(0, 10), "daily", "0.7")));
  urls.push(...industries.map((i) => sitemapEntry(`${SITE_URL}/industry/${i.slug}`, String(i.events[0]?.published_at || today).slice(0, 10), "daily", "0.7")));
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`, { headers: { "content-type": "application/xml; charset=UTF-8", "cache-control": "public, max-age=3600, s-maxage=3600" } });
}

function renderEventCollection({ title, heading, kicker, description, canonical, events, trail, intro = "", indexable = true }) {
  const sourceCount = uniqueDomains(events).size;
  const robots = indexable && events.length >= INDEX_MIN_EVENTS && sourceCount >= INDEX_MIN_SOURCES ? "index,follow,max-image-preview:large" : "noindex,follow";
  return htmlResponse(pageShell({ title, description, canonical, robots,
    body: `<main class="page-shell">${header()}${breadcrumbs(trail)}<section class="page-hero"><p class="kicker">${escapeHtml(kicker)}</p><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(description)}</p>${intro ? `<p>${escapeHtml(intro)}</p>` : ""}<div class="stat-line"><strong>${events.length}</strong> recent signals · <strong>${sourceCount}</strong> source domains</div></section>${eventSection("PUBLIC EVIDENCE", "Recent detected signals", events, events[0]?.published_at)}${signupCta("Create a free account for the complete live radar")}</main>${footer()}`,
    structuredData: [collectionSchema(heading, canonical, description, events.map((e) => ({ name: e.title, url: e.url })), events[0]?.published_at), breadcrumbSchema(trail.map((t) => ({ name: t.name, url: t.url ? `${SITE_URL}${t.url}` : canonical })))]
  }));
}

function renderTaxonomyIndex({ title, heading, kicker, description, canonical, groups, basePath, trail }) {
  const cards = groups.map((g) => `<article class="company-card"><div class="company-card-top"><h2><a href="${basePath}/${slugify(g.slug || g.name)}">${escapeHtml(g.name)}</a></h2><span class="score">${number(g.event_count)}</span></div><p>${number(g.event_count)} public signals · ${number(g.source_count)} source domains</p>${g.description ? `<p>${escapeHtml(g.description)}</p>` : ""}<a class="text-link" href="${basePath}/${slugify(g.slug || g.name)}">Explore signals →</a></article>`).join("");
  return htmlResponse(pageShell({ title, description, canonical, body: `<main class="page-shell">${header()}${breadcrumbs(trail)}<section class="page-hero"><p class="kicker">${escapeHtml(kicker)}</p><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(description)}</p></section><section class="company-grid">${cards || emptyState("No public signal groups are available yet.")}</section>${signupCta("Build your personal industrial radar")}</main>${footer()}`, structuredData: [collectionSchema(heading, canonical, description, groups.map((g) => ({ name: g.name, url: `${SITE_URL}${basePath}/${slugify(g.slug || g.name)}` }))), breadcrumbSchema(trail.map((t) => ({ name: t.name, url: t.url ? `${SITE_URL}${t.url}` : canonical })))] }));
}

function eventSection(kicker, heading, events, latestAt) {
  return `<section class="content-section"><div class="section-heading"><div><p class="kicker">${escapeHtml(kicker)}</p><h2>${escapeHtml(heading)}</h2></div><span>${latestAt ? `Last updated ${formatDate(latestAt)}` : ""}</span></div><div class="signal-list">${events.map(eventCard).join("") || emptyState("No recent public evidence is available.")}</div></section>`;
}

function eventCard(event) {
  const companies = safeArray(event.companies_json);
  const companyLinks = companies.map((name) => `<a href="/company/${slugify(name)}">${escapeHtml(name)}</a>`).join(" · ");
  return `<article class="signal-card"><div class="signal-score">${number(event.score)}<span>signal score</span></div><div><p class="signal-meta">${escapeHtml(event.signal_label || label(event.signal))} · ${escapeHtml(event.country || "Global")} · ${formatDate(event.published_at)}</p><h2><a href="${escapeAttribute(event.url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(event.title)}</a></h2><p>${escapeHtml(event.provider || event.domain || "Public source")} · ${escapeHtml(event.domain || "Source")}</p>${companyLinks ? `<p class="company-links">Companies: ${companyLinks}</p>` : ""}${event.suggested_action ? `<p class="suggestion"><strong>Suggested review:</strong> ${escapeHtml(event.suggested_action)}</p>` : ""}</div></article>`;
}

function companyCard(company) {
  const slug = slugify(company.company);
  return `<article class="company-card"><div class="company-card-top"><h2><a href="/company/${slug}">${escapeHtml(company.company)}</a></h2><span class="score">${number(company.score)}</span></div><p>${number(company.event_count)} public signals · ${number(company.source_count)} source domains</p><div class="chips">${[...safeArray(company.signals_json), ...safeArray(company.countries_json)].slice(0, 8).map((v) => `<span>${escapeHtml(label(v))}</span>`).join("")}</div><a class="text-link" href="/company/${slug}">View company signals →</a></article>`;
}

async function readCompanies(env) {
  if (!env?.DB) return [];
  const result = await env.DB.prepare(`SELECT id, company, normalized_company, score, confidence, signal_count, event_count, source_count, signals_json, countries_json, suggested_action, latest_at, first_seen_at, last_seen_at FROM companies WHERE company IS NOT NULL AND TRIM(company) <> '' ORDER BY score DESC, latest_at DESC, company ASC LIMIT 500`).all();
  return result.results || [];
}

async function readPublicEvents(env, { country, signals, limit = PUBLIC_EVENT_LIMIT, trending = false } = {}) {
  if (!env?.DB) return [];
  const clauses = ["url IS NOT NULL", "title IS NOT NULL"];
  const binds = [];
  if (country) { clauses.push("LOWER(country) = LOWER(?)"); binds.push(country); }
  if (signals?.length) { clauses.push(`signal IN (${signals.map(() => "?").join(",")})`); binds.push(...signals); }
  const order = trending ? "score DESC, published_at DESC" : "published_at DESC, score DESC";
  const sql = `SELECT id, title, url, domain, provider, published_at, signal, signal_label, country, company, companies_json, score, confidence, suggested_action FROM events WHERE ${clauses.join(" AND ")} ORDER BY ${order} LIMIT ?`;
  binds.push(Math.min(500, Math.max(1, limit)));
  const result = await env.DB.prepare(sql).bind(...binds).all();
  return result.results || [];
}

async function readCountryGroups(env) {
  if (!env?.DB) return [];
  const result = await env.DB.prepare(`SELECT country AS name, COUNT(*) AS event_count, COUNT(DISTINCT domain) AS source_count, MAX(published_at) AS latest_at FROM events WHERE country IS NOT NULL AND TRIM(country) <> '' GROUP BY country ORDER BY event_count DESC, latest_at DESC LIMIT 100`).all();
  return result.results || [];
}

async function readSignalGroups(env) {
  if (!env?.DB) return [];
  const result = await env.DB.prepare(`SELECT signal AS key, COUNT(*) AS event_count, COUNT(DISTINCT domain) AS source_count, MAX(published_at) AS latest_at FROM events WHERE signal IS NOT NULL AND TRIM(signal) <> '' GROUP BY signal`).all();
  return result.results || [];
}

async function readCompanyEvents(env, companyId, companyName) {
  if (!env?.DB) return [];
  try {
    const result = await env.DB.prepare(`SELECT DISTINCT e.id, e.title, e.url, e.domain, e.provider, e.published_at, e.signal, e.signal_label, e.country, e.company, e.companies_json, e.score, e.confidence, e.suggested_action FROM events e LEFT JOIN company_events ce ON ce.event_id = e.id WHERE ce.company_id = ? OR LOWER(e.company) = LOWER(?) ORDER BY e.published_at DESC, e.score DESC LIMIT 10`).bind(companyId, companyName).all();
    return result.results || [];
  } catch {
    const fallback = await env.DB.prepare(`SELECT id, title, url, domain, provider, published_at, signal, signal_label, country, company, companies_json, score, confidence, suggested_action FROM events WHERE LOWER(company) = LOWER(?) ORDER BY published_at DESC, score DESC LIMIT 10`).bind(companyName).all();
    return fallback.results || [];
  }
}

async function readRelatedCompanies(env, events, currentCompany) {
  const names = new Set();
  for (const event of events) for (const name of safeArray(event.companies_json)) if (String(name).toLowerCase() !== String(currentCompany).toLowerCase()) names.add(String(name));
  if (!names.size) return [];
  const catalog = await readCompanies(env);
  const available = new Map(catalog.map((row) => [String(row.company).toLowerCase(), row.company]));
  return [...names].map((name) => available.get(name.toLowerCase())).filter(Boolean).slice(0, 8);
}

function eventMatchesIndustry(event, industry) {
  const text = `${event.title || ""} ${event.company || ""} ${safeArray(event.companies_json).join(" ")} ${event.suggested_action || ""}`.toLowerCase();
  return industry.keywords.some((keyword) => keyword.length <= 3 ? new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(text) : text.includes(keyword));
}

function uniqueDomains(events) { return new Set(events.map((e) => e.domain).filter(Boolean)); }
function isIndexEligible(company) { const latest = new Date(company.latest_at || 0).getTime(); return number(company.event_count) >= INDEX_MIN_EVENTS && number(company.source_count) >= INDEX_MIN_SOURCES && Number.isFinite(latest) && latest >= Date.now() - INDEX_MAX_AGE_DAYS * 86400000; }
function collectionSchema(name, url, description, items = [], dateModified) { return { "@context": "https://schema.org", "@type": "CollectionPage", "@id": `${url}#webpage`, name, url, description, isPartOf: { "@id": `${SITE_URL}/#website` }, ...(dateModified ? { dateModified } : {}), mainEntity: { "@type": "ItemList", numberOfItems: items.length, itemListElement: items.slice(0, 100).map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, url: item.url })) } }; }
function breadcrumbSchema(items) { return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url })) }; }
function breadcrumbs(items) { return `<nav class="breadcrumbs" aria-label="Breadcrumb">${items.map((item, index) => `${index ? "<span>›</span>" : ""}${item.url ? `<a href="${escapeAttribute(item.url)}">${escapeHtml(item.name)}</a>` : `<span>${escapeHtml(item.name)}</span>`}`).join("")}</nav>`; }

function pageShell({ title, description, canonical, robots = "index,follow,max-image-preview:large", body, structuredData }) {
  const jsonLd = (Array.isArray(structuredData) ? structuredData : [structuredData]).filter(Boolean).map((item) => `<script type="application/ld+json">${safeJsonForHtml(item)}</script>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#06100d"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeAttribute(description)}"><meta name="robots" content="${escapeAttribute(robots)}"><link rel="canonical" href="${escapeAttribute(canonical)}"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta property="og:type" content="website"><meta property="og:site_name" content="Radaryum"><meta property="og:title" content="${escapeAttribute(title)}"><meta property="og:description" content="${escapeAttribute(description)}"><meta property="og:url" content="${escapeAttribute(canonical)}"><meta property="og:image" content="${SITE_URL}/social-preview.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeAttribute(title)}"><meta name="twitter:description" content="${escapeAttribute(description)}"><meta name="twitter:image" content="${SITE_URL}/social-preview.png"><link rel="stylesheet" href="/seo.css">${jsonLd}<script type="text/javascript">(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","xsnufg4lyg");</script></head><body>${body}</body></html>`;
}

function header() { return `<header class="seo-header"><a class="brand" href="/">RADARYUM</a><nav><a href="/latest">Latest</a><a href="/trending">Trending</a><a href="/companies">Companies</a><a class="header-cta" href="/?signup=1">Create free account</a></nav></header>`; }
function footer() { return `<footer class="seo-footer"><div><a class="brand" href="/">RADARYUM</a><span>Industrial opportunity intelligence from public sources.</span></div><nav aria-label="Footer"><a href="/latest">Latest</a><a href="/trending">Trending</a><a href="/companies">Companies</a><a href="/countries">Countries</a><a href="/industries">Industries</a><a href="/signals">Signal types</a><a href="/?signup=1">Create free account</a></nav></footer>`; }
function signupCta(title, company = "") { const href = `/?signup=1${company ? `&company=${encodeURIComponent(company)}` : ""}`; return `<section class="signup-cta"><p class="kicker">FREE BETA ACCESS</p><h2>${escapeHtml(title)}</h2><p>Open the live company radar, event stream and persistent opportunity archive.</p><a href="${escapeAttribute(href)}">Create free account</a></section>`; }
function emptyState(message) { return `<div class="empty-state">${escapeHtml(message)}</div>`; }
function notFoundPage(type) { return htmlResponse(pageShell({ title: `${type} Not Found | Radaryum`, description: `The requested Radaryum ${type.toLowerCase()} page was not found.`, canonical: `${SITE_URL}/`, robots: "noindex,follow", body: `<main class="page-shell">${header()}<section class="page-hero"><p class="kicker">404</p><h1>${escapeHtml(type)} page not found</h1><p>This public Radaryum page is not available.</p><a class="primary-link" href="/latest">Browse latest signals</a></section></main>${footer()}` }), 404); }
function htmlResponse(html, status = 200) { return new Response(html, { status, headers: { "content-type": "text/html; charset=UTF-8", "cache-control": status === 200 ? "public, max-age=300, s-maxage=300" : "no-store", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" } }); }
function sitemapEntry(loc, lastmod, changefreq, priority) { return `\n  <url><loc>${escapeXml(loc)}</loc><lastmod>${escapeXml(lastmod)}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`; }
export function slugify(value) { return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100); }
function normalizeSlug(value) { try { return slugify(decodeURIComponent(String(value || ""))); } catch { return slugify(value); } }
function safeArray(value) { if (Array.isArray(value)) return value; try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function safeJsonForHtml(value) { return JSON.stringify(value).replace(/</g, "\\u003c"); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function label(value) { return ({ expansion: "Factory expansion", procurement: "Procurement activity", product: "Product launch", supply: "Supply-chain change" })[value] || String(value || ""); }
function formatDate(value) { const date = new Date(value || 0); if (Number.isNaN(date.getTime())) return "date unavailable"; return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(date); }
function escapeHtml(value = "") { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function escapeAttribute(value = "") { return escapeHtml(value); }
function escapeXml(value = "") { return escapeHtml(value); }
function escapeRegExp(value = "") { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
