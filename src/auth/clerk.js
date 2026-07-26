const CLERK_ISSUER = "https://clerk.radaryum.com";
const AUTHORIZED_PARTIES = new Set([
  "https://radaryum.com",
  "https://www.radaryum.com",
  "https://radaryum.roberto-borgonovo.workers.dev",
  "http://localhost:8787",
  "http://127.0.0.1:8787"
]);

const CLERK_JWT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3Nc5zA3xB1ppsRYuXLY7
BK7aFt7+6YXUT83zqsWxwBM/ziLNkBfX5DmpuiHk07VsU2D1x24gTgreHPYBNglX
NNwJw7U9sVuKg15GmUeeZgxLHWL2B+qXQt5a/08DDSZSzCMd/QRBvNjyGzOT8XM7
nAmwocBsqzrn8je2yiVf2Z0UxaIyq7VeYQso5XrSgX8NyPucovyJQbRVly918cWw
GTm9ZXTJOx0/pB+Y1zrQB3Z1EA1H9kMJa6aYTp8jSNBjdCCF2wkaLE//4evSwAZR
5UTWI4uigi++rXEDD1n0btscGhgtByktd+CwldDb270E0VT9ByDd7c8G+aIfgfFE
7wIDAQAB
-----END PUBLIC KEY-----`;

let importedKeyPromise;

export async function authenticateRequest(request) {
  const token = sessionTokenFromRequest(request);
  if (!token) return { ok: false, message: "Sign in is required." };

  try {
    const claims = await verifyClerkToken(token);
    return { ok: true, claims, userId: claims.sub, sessionId: claims.sid || null };
  } catch (error) {
    return { ok: false, message: String(error?.message || "Invalid session token.") };
  }
}

export function authResponse(auth) {
  return new Response(JSON.stringify({
    ok: false,
    error: "Unauthorized",
    message: auth?.message || "Sign in is required."
  }, null, 2), {
    status: 401,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function verifyClerkToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed session token.");

  const header = parseJsonPart(parts[0]);
  const claims = parseJsonPart(parts[1]);
  if (header.alg !== "RS256") throw new Error("Unexpected token algorithm.");

  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    await clerkPublicKey(),
    base64UrlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw new Error("Session signature verification failed.");

  const now = Math.floor(Date.now() / 1000);
  const skew = 10;
  if (!claims.sub) throw new Error("Session has no user identifier.");
  if (!Number.isFinite(claims.exp) || claims.exp < now - skew) throw new Error("Session token has expired.");
  if (Number.isFinite(claims.nbf) && claims.nbf > now + skew) throw new Error("Session token is not active yet.");
  if (claims.iss !== CLERK_ISSUER) throw new Error("Unexpected token issuer.");
  if (claims.azp && !AUTHORIZED_PARTIES.has(claims.azp)) throw new Error("Session was issued for an unauthorized origin.");

  return claims;
}

function sessionTokenFromRequest(request) {
  const authorization = request.headers.get("authorization") || "";
  if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, "").trim();

  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)__session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function clerkPublicKey() {
  if (!importedKeyPromise) {
    importedKeyPromise = crypto.subtle.importKey(
      "spki",
      pemToBytes(CLERK_JWT_PUBLIC_KEY),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
  }
  return importedKeyPromise;
}

function parseJsonPart(value) {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));
  } catch {
    throw new Error("Session token contains invalid JSON.");
  }
}

function base64UrlBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function pemToBytes(pem) {
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(atob(body), char => char.charCodeAt(0));
}
