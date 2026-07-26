import { INDUSTRIAL_TERMS, SIGNAL_TERMS } from "../config/signals.js";
import { clamp } from "../utils/text.js";

const STRONG_ACTION_TERMS = [
  "opens", "launches", "expands", "invests", "builds", "starts production",
  "adds capacity", "new plant", "new factory", "production line", "supplier qualification",
  "strategic sourcing", "procurement manager", "commodity manager", "dual sourcing",
  "local sourcing", "awards contract", "selects supplier"
];

const GENERIC_NEWS_TERMS = [
  "stock market", "share price", "analyst rating", "earnings call", "quarterly results",
  "inflation", "trade surplus", "central bank", "government policy", "minister says",
  "market report", "industry report", "forecast report", "what it means"
];

export function scoreEvent({ title, signal, country, publishedAt, company }) {
  const lower = title.toLowerCase();
  let score = 32;
  const reasons = [];

  const matched = SIGNAL_TERMS[signal]
    .filter(([term]) => lower.includes(term))
    .sort((a, b) => b[1] - a[1]);

  if (matched.length) {
    score += Math.min(30, matched.reduce((sum, [, weight]) => sum + weight, 0));
    reasons.push(`Detected ${signal} language in the current source.`);
  }

  const industrialMatches = INDUSTRIAL_TERMS.filter((term) => lower.includes(term));
  if (industrialMatches.length) {
    score += Math.min(14, 7 + industrialMatches.length * 2);
    reasons.push("The headline is directly related to manufacturing or an industrial market.");
  }

  const strongActionMatches = STRONG_ACTION_TERMS.filter((term) => lower.includes(term));
  if (strongActionMatches.length) {
    score += Math.min(18, 10 + strongActionMatches.length * 3);
    reasons.push("A concrete industrial action or sourcing trigger was detected.");
  }

  if (country !== "Other / undetected") {
    score += 6;
    reasons.push(`A specific industrial geography was detected: ${country}.`);
  }

  if (company) {
    score += 7;
    reasons.push(`A probable company entity was extracted: ${company}.`);
  }

  if (/\b(million|billion|investment|capacity|production|supplier|procurement|sourcing|factory|plant)\b/i.test(title)) {
    score += 7;
    reasons.push("The source includes investment, capacity, production or sourcing terminology.");
  }

  const genericHits = GENERIC_NEWS_TERMS.filter((term) => lower.includes(term));
  if (genericHits.length) {
    score -= Math.min(24, 10 + genericHits.length * 5);
    reasons.push("The headline contains generic market or macroeconomic language.");
  }

  if (!company && !strongActionMatches.length && industrialMatches.length === 0) {
    score -= 10;
  }

  const parsedDate = Date.parse(publishedAt);
  const ageHours = Number.isNaN(parsedDate)
    ? 999
    : Math.max(0, (Date.now() - parsedDate) / 3600000);

  if (ageHours <= 24) {
    score += 7;
    reasons.push("The signal was published within the last 24 hours.");
  } else if (ageHours <= 72) {
    score += 3;
    reasons.push("The signal is recent.");
  } else if (ageHours > 120) {
    score -= 6;
  }

  return {
    score: clamp(Math.round(score), 0, 100),
    reasons: reasons.slice(0, 4)
  };
}

export function scoreCompany(items) {
  if (!items.length) return 0;

  const distinctSignals = [...new Set(items.map((item) => item.signal))];
  const distinctDomains = [...new Set(items.map((item) => item.domain).filter(Boolean))];
  const distinctTitles = [...new Set(items.map((item) => item.title).filter(Boolean))];

  const sortedScores = items.map((item) => item.score).sort((a, b) => b - a);
  const base = sortedScores[0] || 0;
  const secondBestBonus = sortedScores.length > 1 ? Math.min(8, Math.round((sortedScores[1] || 0) * 0.1)) : 0;
  const multiSignalBonus = Math.min(20, Math.max(0, distinctSignals.length - 1) * 10);
  const sourceBonus = Math.min(10, Math.max(0, distinctDomains.length - 1) * 4);
  const eventBonus = Math.min(8, Math.max(0, distinctTitles.length - 1) * 2);

  const duplicatePenalty = Math.max(0, items.length - distinctTitles.length) * 2;

  return clamp(
    base + secondBestBonus + multiSignalBonus + sourceBonus + eventBonus - duplicatePenalty,
    0,
    100
  );
}
