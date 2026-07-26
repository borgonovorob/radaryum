const SITE_URL = "https://radaryum.com";
const INDEX_MIN_EVENTS = 3;
const INDEX_MIN_SOURCES = 2;
const INDEX_MAX_AGE_DAYS = 180;

export async function renderCompaniesIndex(env) {
  const companies = await readCompanies(env);
  const eligibleCount = companies.filter(isIndexEligible).length;
  const cards = companies.map((company) => {
    const slug = slugify(company.company);
    const signals = safeArray(company.signals_json).slice(0, 4);
    const countries = safeArray(company.countries_json).slice(0, 4);
    return `<article class="company-card">
      <div class="company-card-top">
        <h2><a href="/company/${encodeURIComponent(slug)}">${escapeHtml(company.company)}</a></h2>
        <span class="score">${number(company.score)}</span>
      </div>
      <p>${number(company.event_count)} public signals · ${number(company.source_count)} source domains</p>
      <div class="chips">${[...signals, ...countries].map((value) => `<span>${escapeHtml(label(value))}</span>`).join("")}</div>
      <a class="text-link" href="/company/${encodeURIComponent(slug)}">View company signals →</a>
    </article>`;
  }).join("");

  const description = "Browse companies with public manufacturing, sourcing, expansion and supply-chain signals detected by Radaryum.";
  return htmlResponse(pageShell({
    title: "Industrial Company Signals | Radaryum",
    description,
    canonical: `${SITE_URL}/companies`,
    body: `<main class="page-shell">
      ${header()}
      <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><span>Companies</span></nav>
      <section class="page-hero">
        <p class="kicker">PUBLIC COMPANY INDEX</p>
        <h1>Industrial companies showing active opportunity signals</h1>
        <p>Explore public evidence of manufacturing investment, sourcing activity, plant expansion, product programs and supply-chain change.</p>
        <div class="stat-line"><strong>${companies.length}</strong> companies tracked · <strong>${eligibleCount}</strong> currently eligible for search indexing</div>
      </section>
      <section class="company-grid">${cards || emptyState("No company signals are available yet.")}</section>
      ${signupCta("Track the companies that matter to you")}
    </main>${footer()}`,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/companies#webpage`,
        name: "Radaryum Industrial Company Signals",
        url: `${SITE_URL}/companies`,
        description,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: ["Industrial companies", "Manufacturing signals", "Procurement signals", "Supply-chain signals"],
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: companies.length,
          itemListElement: companies.slice(0, 100).map((company, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: company.company,
            url: `${SITE_URL}/company/${encodeURIComponent(slugify(company.company))}`
          }))
        }
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Companies", item: `${SITE_URL}/companies` }
        ]
      }
    ]
  }));
}

export async function renderCompanyPage(env, rawSlug) {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return notFoundPage();

  const companies = await readCompanies(env);
  const company = companies.find((row) => slugify(row.company) === slug || slugify(row.normalized_company) === slug);
  if (!company) return notFoundPage();

  const events = await readCompanyEvents(env, company.id, company.company);
  const indexable = isIndexEligible(company);
  const canonical = `${SITE_URL}/company/${encodeURIComponent(slugify(company.company))}`;
  const description = `Track public manufacturing, sourcing, investment, product and supply-chain signals related to ${company.company}.`;
  const signals = safeArray(company.signals_json);
  const countries = safeArray(company.countries_json);
  const related = await readRelatedCompanies(env, events, company.company);

  const eventCards = events.map((event) => `<article class="signal-card">
    <div class="signal-score">${number(event.score)}<span>signal score</span></div>
    <div>
      <p class="signal-meta">${escapeHtml(event.signal_label || label(event.signal))} · ${escapeHtml(event.country || "Global")} · ${formatDate(event.published_at)}</p>
      <h2><a href="${escapeAttribute(event.url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(event.title)}</a></h2>
      <p>${escapeHtml(event.provider || event.domain || "Public source")} · ${escapeHtml(event.domain || "Source")}</p>
      ${event.suggested_action ? `<p class="suggestion"><strong>Suggested review:</strong> ${escapeHtml(event.suggested_action)}</p>` : ""}
    </div>
  </article>`).join("");

  const relatedLinks = related.map((name) => `<a href="/company/${encodeURIComponent(slugify(name))}">${escapeHtml(name)}</a>`).join("");
  const robots = indexable ? "index,follow,max-image-preview:large" : "noindex,follow";

  return htmlResponse(pageShell({
    title: `${company.company} Industrial Opportunity Signals | Radaryum`,
    description,
    canonical,
    robots,
    body: `<main class="page-shell">
      ${header()}
      <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><a href="/companies">Companies</a><span>›</span><span>${escapeHtml(company.company)}</span></nav>
      <section class="page-hero company-hero">
        <p class="kicker">INDUSTRIAL OPPORTUNITY INTELLIGENCE</p>
        <h1>${escapeHtml(company.company)} public opportunity signals</h1>
        <p>${escapeHtml(description)}</p>
        <div class="stat-grid">
          <div><strong>${number(company.event_count)}</strong><span>signals detected</span></div>
          <div><strong>${number(company.source_count)}</strong><span>source domains</span></div>
          <div><strong>${number(company.signal_count)}</strong><span>signal categories</span></div>
          <div><strong>${number(company.score)}</strong><span>company score</span></div>
        </div>
        <div class="chips">${[...signals, ...countries].map((value) => `<span>${escapeHtml(label(value))}</span>`).join("")}</div>
      </section>
      <section class="content-section">
        <div class="section-heading"><div><p class="kicker">RECENT PUBLIC EVIDENCE</p><h2>Latest detected signals</h2></div><span>Last updated ${formatDate(company.latest_at)}</span></div>
        <div class="signal-list">${eventCards || emptyState("No recent public evidence is available for this company.")}</div>
      </section>
      ${relatedLinks ? `<section class="content-section"><p class="kicker">RELATED COMPANIES</p><h2>Companies appearing in the same public signals</h2><div class="related-links">${relatedLinks}</div></section>` : ""}
      ${signupCta(`Create a free account to monitor ${company.company}`, company.company)}
      <p class="disclaimer">Radaryum organizes public-source signals for human review. Scores are not probabilities, confirmed RFQs or purchase orders.</p>
    </main>${footer()}`,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${canonical}#organization`,
        name: company.company,
        mainEntityOfPage: { "@id": `${canonical}#webpage` }
      },
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": `${canonical}#webpage`,
        name: `${company.company} Industrial Opportunity Signals`,
        url: canonical,
        description,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${canonical}#organization` },
        dateModified: company.latest_at || new Date().toISOString(),
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: events.length,
          itemListElement: events.map((event, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: event.title,
            url: event.url
          }))
        }
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Companies", item: `${SITE_URL}/companies` },
          { "@type": "ListItem", position: 3, name: company.company, item: canonical }
        ]
      }
    ]
  }));
}

export async function renderSitemap(env) {
  const companies = (await readCompanies(env)).filter(isIndexEligible);
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    sitemapEntry(`${SITE_URL}/`, today, "weekly", "1.0"),
    sitemapEntry(`${SITE_URL}/companies`, today, "daily", "0.9"),
    ...companies.map((company) => sitemapEntry(
      `${SITE_URL}/company/${encodeURIComponent(slugify(company.company))}`,
      String(company.latest_at || today).slice(0, 10),
      "daily",
      "0.8"
    ))
  ].join("");

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: {
      "content-type": "application/xml; charset=UTF-8",
      "cache-control": "public, max-age=3600, s-maxage=3600"
    }
  });
}

async function readCompanies(env) {
  if (!env?.DB) return [];
  const result = await env.DB.prepare(`
    SELECT id, company, normalized_company, score, confidence, signal_count,
           event_count, source_count, signals_json, countries_json,
           suggested_action, latest_at, first_seen_at, last_seen_at
    FROM companies
    WHERE company IS NOT NULL AND TRIM(company) <> ''
    ORDER BY score DESC, latest_at DESC, company ASC
    LIMIT 500
  `).all();
  return result.results || [];
}

async function readCompanyEvents(env, companyId, companyName) {
  if (!env?.DB) return [];
  try {
    const result = await env.DB.prepare(`
      SELECT DISTINCT e.id, e.title, e.url, e.domain, e.provider, e.published_at,
             e.signal, e.signal_label, e.country, e.company, e.companies_json,
             e.score, e.confidence, e.suggested_action
      FROM events e
      LEFT JOIN company_events ce ON ce.event_id = e.id
      WHERE ce.company_id = ? OR LOWER(e.company) = LOWER(?)
      ORDER BY e.published_at DESC, e.score DESC
      LIMIT 10
    `).bind(companyId, companyName).all();
    return result.results || [];
  } catch {
    const fallback = await env.DB.prepare(`
      SELECT id, title, url, domain, provider, published_at, signal, signal_label,
             country, company, companies_json, score, confidence, suggested_action
      FROM events
      WHERE LOWER(company) = LOWER(?)
      ORDER BY published_at DESC, score DESC
      LIMIT 10
    `).bind(companyName).all();
    return fallback.results || [];
  }
}

async function readRelatedCompanies(env, events, currentCompany) {
  const names = new Set();
  for (const event of events) {
    for (const name of safeArray(event.companies_json)) {
      if (String(name).toLowerCase() !== String(currentCompany).toLowerCase()) names.add(String(name));
    }
  }
  if (!names.size) return [];
  const catalog = await readCompanies(env);
  const available = new Map(catalog.map((row) => [String(row.company).toLowerCase(), row.company]));
  return [...names].map((name) => available.get(name.toLowerCase())).filter(Boolean).slice(0, 8);
}

function isIndexEligible(company) {
  const eventCount = number(company.event_count);
  const sourceCount = number(company.source_count);
  const latest = new Date(company.latest_at || 0).getTime();
  const recentEnough = Number.isFinite(latest) && latest >= Date.now() - INDEX_MAX_AGE_DAYS * 86400000;
  return eventCount >= INDEX_MIN_EVENTS && sourceCount >= INDEX_MIN_SOURCES && recentEnough;
}

function pageShell({ title, description, canonical, robots = "index,follow,max-image-preview:large", body, structuredData }) {
  const jsonLd = (Array.isArray(structuredData) ? structuredData : [structuredData]).filter(Boolean)
    .map((item) => `<script type="application/ld+json">${safeJsonForHtml(item)}</script>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#06100d">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeAttribute(description)}">
<meta name="robots" content="${escapeAttribute(robots)}">
<link rel="canonical" href="${escapeAttribute(canonical)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Radaryum">
<meta property="og:title" content="${escapeAttribute(title)}">
<meta property="og:description" content="${escapeAttribute(description)}">
<meta property="og:url" content="${escapeAttribute(canonical)}">
<meta property="og:image" content="${SITE_URL}/social-preview.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeAttribute(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttribute(title)}">
<meta name="twitter:description" content="${escapeAttribute(description)}">
<meta name="twitter:image" content="${SITE_URL}/social-preview.png">
<meta name="twitter:image:alt" content="${escapeAttribute(title)}">
<link rel="stylesheet" href="/seo.css">
${jsonLd}
</head>
<body>${body}</body>
</html>`;
}

function header() {
  return `<header class="seo-header"><a class="brand" href="/">RADARYUM</a><nav><a href="/companies">Companies</a><a class="header-cta" href="/?signup=1">Create free account</a></nav></header>`;
}

function footer() {
  return `<footer class="seo-footer"><div><a class="brand" href="/">RADARYUM</a><span>Industrial opportunity intelligence from public sources.</span></div><nav aria-label="Footer"><a href="/">Home</a><a href="/companies">Companies</a><a href="/?signup=1">Create free account</a></nav></footer>`;
}

function signupCta(title, company = "") {
  const href = `/?signup=1${company ? `&company=${encodeURIComponent(company)}` : ""}`;
  return `<section class="signup-cta"><p class="kicker">FREE BETA ACCESS</p><h2>${escapeHtml(title)}</h2><p>Open the live company radar, event stream and persistent opportunity archive.</p><a href="${escapeAttribute(href)}">Create free account</a></section>`;
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function notFoundPage() {
  const body = `<main class="page-shell">${header()}<section class="page-hero"><p class="kicker">404</p><h1>Company page not found</h1><p>This company does not currently have a public Radaryum page.</p><a class="primary-link" href="/companies">Browse tracked companies</a></section></main>${footer()}`;
  return htmlResponse(pageShell({
    title: "Company Not Found | Radaryum",
    description: "The requested Radaryum company page was not found.",
    canonical: `${SITE_URL}/companies`,
    robots: "noindex,follow",
    body
  }), 404);
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": status === 200 ? "public, max-age=300, s-maxage=300" : "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin"
    }
  });
}

function sitemapEntry(loc, lastmod, changefreq, priority) {
  return `\n  <url><loc>${escapeXml(loc)}</loc><lastmod>${escapeXml(lastmod)}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

export function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function normalizeSlug(value) {
  try { return slugify(decodeURIComponent(String(value || ""))); }
  catch { return slugify(value); }
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function safeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function label(value) {
  return ({ expansion: "Factory expansion", procurement: "Procurement activity", product: "Product launch", supply: "Supply-chain change" })[value] || String(value || "");
}

function formatDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function escapeAttribute(value = "") {
  return escapeHtml(value);
}

function escapeXml(value = "") {
  return escapeHtml(value);
}
