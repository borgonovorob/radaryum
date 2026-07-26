import { detectCountry } from "../config/geography.js";
import { signalLabel } from "../config/signals.js";
import { collectSources } from "../collectors/orchestrator.js";
import { classifySignal } from "./classification.js";
import { correlateCompanies } from "./correlation.js";
import { deduplicateArticles } from "./deduplication.js";
import { extractCompany } from "./entity.js";
import { readActiveCompanyCatalog, readRecentEvents } from "./persistence.js";
import { scoreEvent } from "./scoring.js";
import { clean, parseGdeltDate, safeDomain, stableId } from "../utils/text.js";

export async function runPipeline(window, env) {
  const started = Date.now();
  const [collected, configuredCompanies, storedEvents] = await Promise.all([
    collectSources(window, env),
    readActiveCompanyCatalog(env).catch(() => []),
    readRecentEvents(env, window, 700).catch(() => [])
  ]);

  const freshEvents = deduplicateArticles(collected.articles)
    .map(article => enrichEvent(article, configuredCompanies))
    .filter(event => event.score >= 35);

  // Re-run entity detection for archived events that were previously stored
  // without a company. This fixes historical "Company undetected" records as
  // the extraction engine and company catalog improve.
  const repairedStoredEvents = storedEvents.map((event) =>
    repairStoredCompany(event, configuredCompanies)
  );

  const events = mergeEvents(repairedStoredEvents, freshEvents)
    .filter(event => insideWindow(event.publishedAt, window))
    .sort((a,b) => b.score-a.score || Date.parse(b.publishedAt)-Date.parse(a.publishedAt))
    .slice(0, 600);

  const companies = correlateCompanies(events);
  return {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now()-started,
    provider: "Radaryum multi-provider collector",
    methodology: "Accumulated D1 archive plus background multi-source collection, deterministic classification, dynamic entity extraction, deduplication, scoring and company correlation.",
    caveat: "Scores indicate relevance for commercial review, not verified purchase intent or a confirmed RFQ.",
    partial: collected.collectors.failed > 0 || collected.collectors.partial > 0,
    collectors: collected.collectors,
    archiveMerge: { storedEvents: storedEvents.length, freshEvents: freshEvents.length, mergedEvents: events.length },
    stats: { events:events.length, companies:companies.length, multiSignalCompanies:companies.filter(c=>c.signalCount>=2).length },
    events, companies
  };
}

function repairStoredCompany(event, configuredCompanies) {
  if (event?.company || !event?.title) return event;

  const entity = extractCompany(event.title, configuredCompanies);
  if (!entity.name) return event;

  const scoring = scoreEvent({
    title: event.title,
    signal: event.signal,
    country: event.country,
    publishedAt: event.publishedAt,
    company: entity.name
  });

  return {
    ...event,
    company: entity.name,
    companyConfidence: entity.confidence,
    score: Math.max(event.score || 0, scoring.score),
    confidence:
      Math.max(event.score || 0, scoring.score) >= 82 ? "High" :
      Math.max(event.score || 0, scoring.score) >= 67 ? "Medium" :
      "Review",
    reasons: scoring.reasons
  };
}

function mergeEvents(stored, fresh) {
  const map = new Map();
  for (const event of stored || []) if (event?.id) map.set(event.id, event);
  for (const event of fresh || []) if (event?.id) map.set(event.id, event);
  return [...map.values()];
}

function insideWindow(value, window) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const hours = window === "24h" ? 24 : window === "3d" ? 72 : 168;
  return date >= new Date(Date.now() - hours*3600000);
}

function enrichEvent(article, configuredCompanies) {
  const title=clean(article.title||"Untitled source");
  const domain=clean(article.domain||safeDomain(article.url));
  const combined=`${title} ${domain}`;
  const signal=classifySignal(combined,article.requestedSignal);
  const country=detectCountry(combined);
  const publishedAt=parseGdeltDate(article.seendate)||new Date().toISOString();
  const entity=article.sourceCompany ? {name:article.sourceCompany,confidence:0.99} : extractCompany(title,configuredCompanies);
  const scoring=scoreEvent({title,signal,country,publishedAt,company:entity.name});
  if(article.provider==="SEC EDGAR"){
    if(article.secRelevanceScore) scoring.reasons.unshift(`SEC filing relevance score: ${article.secRelevanceScore}.`);
    if(article.secMatchedTerms?.length) scoring.reasons.unshift(`SEC evidence matched: ${article.secMatchedTerms.slice(0,4).join(", ")}.`);
  }
  return { id:stableId(article.url), title, url:article.url, domain, provider:article.provider, publishedAt, signal, signalLabel:signalLabel(signal), country, company:entity.name, companyConfidence:entity.confidence, score:scoring.score, confidence:scoring.score>=82?"High":scoring.score>=67?"Medium":"Review", reasons:scoring.reasons, suggestedAction:suggestedAction(signal), sourceLanguage:article.language||null, sourceCountry:article.sourcecountry||null, secForm:article.secForm||null, secRelevanceScore:article.secRelevanceScore||null, secMatchedTerms:article.secMatchedTerms||[], secEvidenceSnippet:article.secEvidenceSnippet||null };
}
function suggestedAction(signal){return {expansion:"Verify the investment and identify the plant, program and local sourcing leadership.",procurement:"Verify the role or sourcing initiative and identify the responsible category or commodity manager.",product:"Map the product architecture, likely components and expected sourcing or industrialization window.",supply:"Check whether the event creates dual-sourcing, localization or replacement-supplier demand."}[signal]||"Review the original source and verify the commercial relevance.";}
