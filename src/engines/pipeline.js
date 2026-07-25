import { detectCountry } from "../config/geography.js";
import { signalLabel } from "../config/signals.js";
import { fetchGdelt } from "../providers/gdelt.js";
import { classifySignal } from "./classification.js";
import { correlateCompanies } from "./correlation.js";
import { deduplicateArticles } from "./deduplication.js";
import { extractCompany } from "./entity.js";
import { scoreEvent } from "./scoring.js";
import { clean, parseGdeltDate, safeDomain, stableId } from "../utils/text.js";

export async function runPipeline(window) {
  const started = Date.now();
  const raw = await fetchGdelt(window);
  const events = deduplicateArticles(raw)
    .map(enrichEvent)
    .filter((event) => event.score >= 45)
    .sort((a, b) => b.score - a.score || Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 140);

  const companies = correlateCompanies(events);

  return {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    provider: "GDELT DOC 2.0",
    methodology: "Modular public-source collection, deterministic classification, entity extraction, deduplication, event scoring and company-level multi-signal correlation.",
    caveat: "Scores indicate relevance for commercial review, not verified purchase intent or a confirmed RFQ.",
    stats: {
      events: events.length,
      companies: companies.length,
      multiSignalCompanies: companies.filter((company) => company.signalCount >= 2).length
    },
    events,
    companies
  };
}

function enrichEvent(article) {
  const title = clean(article.title || "Untitled source");
  const domain = clean(article.domain || safeDomain(article.url));
  const combined = `${title} ${domain}`;
  const signal = classifySignal(combined, article.requestedSignal);
  const country = detectCountry(combined);
  const publishedAt = parseGdeltDate(article.seendate) || new Date().toISOString();
  const entity = extractCompany(title);
  const scoring = scoreEvent({
    title,
    signal,
    country,
    publishedAt,
    company: entity.name
  });

  return {
    id: stableId(article.url),
    title,
    url: article.url,
    domain,
    provider: article.provider,
    publishedAt,
    signal,
    signalLabel: signalLabel(signal),
    country,
    company: entity.name,
    companyConfidence: entity.confidence,
    score: scoring.score,
    confidence: scoring.score >= 82 ? "High" : scoring.score >= 67 ? "Medium" : "Review",
    reasons: scoring.reasons,
    suggestedAction: suggestedAction(signal),
    sourceLanguage: article.language || null,
    sourceCountry: article.sourcecountry || null
  };
}

function suggestedAction(signal) {
  return {
    expansion: "Verify the investment and identify the plant, program and local sourcing leadership.",
    procurement: "Verify the role or sourcing initiative and identify the responsible category or commodity manager.",
    product: "Map the product architecture, likely components and expected sourcing or industrialization window.",
    supply: "Check whether the event creates dual-sourcing, localization or replacement-supplier demand."
  }[signal] || "Review the original source and verify the commercial relevance.";
}
