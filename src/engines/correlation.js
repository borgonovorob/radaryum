import { normalizeCompany } from "./entity.js";
import { scoreCompany } from "./scoring.js";
import { stableId } from "../utils/text.js";

const BAD_COMPANY_NAMES = new Set([
  "from informality",
  "egypt wanda"
]);

export function correlateCompanies(events) {
  const groups = new Map();

  for (const event of events) {
    if (!event.company || event.companyConfidence < 0.60) continue;

    const key = normalizeCompany(event.company);
    if (!key || key.length < 3 || BAD_COMPANY_NAMES.has(key)) continue;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }

  const companies = [];

  for (const [key, items] of groups) {
    const distinctSignals = [...new Set(items.map((item) => item.signal))];
    const distinctDomains = [...new Set(items.map((item) => item.domain))];
    const countries = [...new Set(
      items.map((item) => item.country).filter((country) => country !== "Other / undetected")
    )];
    const timeline = [...items].sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
    );
    const freshest = timeline[0];
    const score = scoreCompany(items);

    companies.push({
      id: stableId(key),
      company: freshest.company,
      normalizedCompany: key,
      score,
      confidence: score >= 86 ? "High" : score >= 72 ? "Medium" : "Review",
      signalCount: distinctSignals.length,
      eventCount: items.length,
      sourceCount: distinctDomains.length,
      signals: distinctSignals,
      countries,
      latestAt: freshest.publishedAt,
      reasons: companyReasons(items, distinctSignals, distinctDomains, countries),
      suggestedAction: companyAction(distinctSignals),
      timeline: timeline.slice(0, 8)
    });
  }

  return companies
    .sort((a, b) => b.score - a.score || Date.parse(b.latestAt) - Date.parse(a.latestAt))
    .slice(0, 70);
}

function companyReasons(items, signals, domains, countries) {
  const reasons = [];
  if (signals.length > 1) reasons.push(`${signals.length} independent signal types converge around the same company.`);
  if (domains.length > 1) reasons.push(`The company appears across ${domains.length} source domains.`);
  if (items.length > 1) reasons.push(`${items.length} current events were correlated.`);
  if (countries.length) reasons.push(`Detected geography: ${countries.join(", ")}.`);
  return reasons;
}

function companyAction(signals) {
  if (signals.includes("expansion") && signals.includes("procurement")) {
    return "Prioritize verification: identify the local plant, sourcing leadership and probable qualification window.";
  }
  if (signals.includes("expansion") && signals.includes("product")) {
    return "Map the new capacity to the launched product or platform and identify likely component categories.";
  }
  if (signals.includes("supply")) {
    return "Check for dual-sourcing, localization or replacement-supplier requirements.";
  }
  if (signals.includes("procurement")) {
    return "Identify the responsible commodity/category manager and verify whether the role supports a new program.";
  }
  return "Review the correlated timeline and verify whether supplier onboarding is likely.";
}
