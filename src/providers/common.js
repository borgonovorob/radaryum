export async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const effectiveTimeoutMs = Math.max(30000, Number(timeoutMs) || 30000);
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function dedupeProviderArticles(articles) {
  const seen = new Set();
  const output = [];
  for (const article of articles || []) {
    const key = String(article.url || article.title || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(article);
  }
  return output;
}
export function normalizeWindow(value) { return ["24h", "3d", "7d"].includes(value) ? value : "3d"; }
export function googleWhen(window) { if (window === "24h") return "1d"; if (window === "7d") return "7d"; return "3d"; }
export function domainFromUrl(value) { try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return ""; } }
export function toGdeltDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [date.getUTCFullYear(),pad(date.getUTCMonth()+1),pad(date.getUTCDate())].join("")+"T"+[pad(date.getUTCHours()),pad(date.getUTCMinutes()),pad(date.getUTCSeconds())].join("")+"Z";
}
export function decodeXml(value) { return String(value || "").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">"); }
export function extractTag(xml, tag) { const pattern=new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,"i"); const match=xml.match(pattern); return match?match[1].replace(/<!\\[CDATA\\[|\\]\\]>/g,"").trim():""; }
export function extractAttr(xml, tag, attr) { const pattern=new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`,"i"); const match=xml.match(pattern); return match?match[1].trim():""; }
