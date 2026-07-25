import { INDUSTRIAL_TERMS, SIGNAL_TERMS } from "../config/signals.js";
import { clamp } from "../utils/text.js";

export function scoreEvent({ title, signal, country, publishedAt, company }) {
  const lower = title.toLowerCase();
  let score = 36;
  const reasons = [];

  const matched = SIGNAL_TERMS[signal]
    .filter(([term]) => lower.includes(term))
    .sort((a, b) => b[1] - a[1]);

  if (matched.length) {
    score += Math.min(32, matched.reduce((sum, [, weight]) => sum + weight, 0));
    reasons.push(`Detected ${signal} language in the current source.`);
  }

  if (INDUSTRIAL_TERMS.some((term) => lower.includes(term))) {
    score += 10;
    reasons.push("The headline is directly related to manufacturing or an industrial market.");
  }

  if (country !== "Other / undetected") {
    score += 7;
    reasons.push(`A specific industrial geography was detected: ${country}.`);
  }

  if (company) {
    score += 4;
    reasons.push(`A probable company entity was extracted: ${company}.`);
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

  return {
    score: clamp(Math.round(score), 0, 100),
    reasons: reasons.slice(0, 4)
  };
}

export function scoreCompany(items) {
  const distinctSignals = [...new Set(items.map((item) => item.signal))];
  const distinctDomains = [...new Set(items.map((item) => item.domain))];
  const base = Math.max(...items.map((item) => item.score));
  const multiSignalBonus = Math.min(24, Math.max(0, distinctSignals.length - 1) * 12);
  const sourceBonus = Math.min(10, Math.max(0, distinctDomains.length - 1) * 4);
  const eventBonus = Math.min(8, Math.max(0, items.length - 1) * 2);

  return clamp(base + multiSignalBonus + sourceBonus + eventBonus, 0, 100);
}
