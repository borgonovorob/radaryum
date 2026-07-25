import { clean } from "../utils/text.js";

const COMPANY_SUFFIXES = /\b(incorporated|corporation|corp|company|co|limited|ltd|plc|llc|gmbh|ag|sa|spa|srl|bv|nv|group|holdings?)\b/gi;
const HEADLINE_STOP = new Set([
  "new", "factory", "plant", "expansion", "investment", "manufacturing", "production",
  "capacity", "launches", "launch", "opens", "opening", "announces", "announced",
  "plans", "plan", "seeks", "seeking", "supplier", "procurement", "sourcing",
  "manager", "company", "million", "billion", "the", "a", "an", "to", "in",
  "for", "of", "and", "with", "at", "on"
]);

export function extractCompany(title) {
  const cleaned = clean(title).replace(/\s[-–—|:]\s.*$/, "").trim();

  const patterns = [
    /^([A-Z][A-Za-z0-9&.'\-]*(?:\s+[A-Z][A-Za-z0-9&.'\-]*){0,4})\s+(?:opens|launches|announces|plans|expands|invests|starts|seeks|hires|to\b)/,
    /(?:by|at|for)\s+([A-Z][A-Za-z0-9&.'\-]*(?:\s+[A-Z][A-Za-z0-9&.'\-]*){0,4})(?:\s|$)/,
    /^([A-Z][A-Z0-9&.'\-]{2,}(?:\s+[A-Z][A-Z0-9&.'\-]{2,}){0,3})\b/
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match) continue;
    const name = sanitizeCompany(match[1]);
    if (validCompany(name)) return { name, confidence: 0.82 };
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const candidate = [];
  for (const token of tokens.slice(0, 7)) {
    const plain = token.replace(/[^\p{L}\p{N}&.'-]/gu, "");
    if (!plain || HEADLINE_STOP.has(plain.toLowerCase()) || !/^[A-Z0-9]/.test(plain)) break;
    candidate.push(plain);
    if (candidate.length >= 4) break;
  }

  const name = sanitizeCompany(candidate.join(" "));
  return validCompany(name)
    ? { name, confidence: 0.55 }
    : { name: null, confidence: 0 };
}

export function normalizeCompany(value) {
  return sanitizeCompany(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sanitizeCompany(value) {
  return clean(value)
    .replace(COMPANY_SUFFIXES, "")
    .replace(/\s+/g, " ")
    .replace(/[,:;.\-]+$/, "")
    .trim();
}

function validCompany(value) {
  if (!value || value.length < 3 || value.length > 60) return false;
  const words = value.toLowerCase().split(/\s+/);
  if (words.every((word) => HEADLINE_STOP.has(word))) return false;
  return !/^(new|factory|plant|manufacturing|production|investment|global|local)$/i.test(value);
}
