import { normalizeTitle, normalizeUrl } from "../utils/text.js";

export function deduplicateArticles(items) {
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
