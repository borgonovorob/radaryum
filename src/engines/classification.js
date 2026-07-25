import { SIGNAL_TERMS } from "../config/signals.js";

export function classifySignal(text, fallback) {
  const lower = text.toLowerCase();
  let best = fallback || "expansion";
  let highest = -1;

  for (const [signal, terms] of Object.entries(SIGNAL_TERMS)) {
    const points = terms.reduce(
      (sum, [term, weight]) => sum + (lower.includes(term) ? weight : 0),
      0
    );
    if (points > highest) {
      highest = points;
      best = signal;
    }
  }

  return best;
}
