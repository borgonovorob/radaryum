import { SIGNAL_GROUPS } from "./config/signals.js";
import { runPipeline } from "./engines/pipeline.js";
import {
  hasDatabase,
  persistPipeline,
  readArchive,
  readStats,
  saveFeedback
} from "./engines/persistence.js";
import { clamp } from "./utils/text.js";

const SNAPSHOT_VERSION = "v4.4";
const SNAPSHOT_TTL_SECONDS = 180;
const inflightScans = new Map();

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/api/companies") return handleCompanies(request, env, ctx);
      if (url.pathname === "/api/opportunities") return handleEvents(request, env, ctx);
      if (url.pathname === "/api/events") return handleEvents(request, env, ctx);
      if (url.pathname === "/api/archive") return handleArchive(request, env);
      if (url.pathname === "/api/stats") return handleStats(env);
      if (url.pathname === "/api/feedback" && request.method === "POST") {
        return handleFeedback(request, env);
      }

      if (url.pathname === "/api/health") {
        return noStoreJson({
          ok: true,
          service: "radaryum",
          version: "4.4.0",
          architecture: "shared-live-snapshot",
          snapshotTtlSeconds: SNAPSHOT_TTL_SECONDS,
          databaseConfigured: hasDatabase(env),
          time: new Date().toISOString()
        });
      }

      if (url.pathname.startsWith("/api/")) {
        return noStoreJson({
          error: "API route not found",
          path: url.pathname,
          ok: false
        }, 404);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return noStoreJson({
        error: String(error?.message || error),
        ok: false
      }, 500);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(refreshSnapshot("3d", env));
  }
};

async function handleCompanies(request, env, ctx) {
  const url = new URL(request.url);
  const window = normalizeWindow(url.searchParams.get("window"));
  const country = (url.searchParams.get("country") || "").trim();
  const minScore = clamp(Number(url.searchParams.get("minScore") || 60), 0, 100);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  try {
    const payload = await getSharedPayload(window, env, ctx, forceRefresh);
    let companies = Array.isArray(payload.companies) ? payload.companies : [];

    if (country) {
      companies = companies.filter((company) =>
        Array.isArray(company.countries) && company.countries.includes(country)
      );
    }

    companies = companies.filter((company) => company.score >= minScore);

    return noStoreJson({
      ...payload,
      events: undefined,
      companies,
      snapshot: snapshotInfo(payload),
      persistence: { configured: hasDatabase(env) },
      filters: { window, country, minScore }
    });
  } catch (error) {
    return noStoreJson({ error: String(error?.message || error), ok: false }, 500);
  }
}

async function handleEvents(request, env, ctx) {
  const url = new URL(request.url);
  const window = normalizeWindow(url.searchParams.get("window"));
  const signal = normalizeSignal(url.searchParams.get("signal"));
  const country = (url.searchParams.get("country") || "").trim();
  const minScore = clamp(Number(url.searchParams.get("minScore") || 55), 0, 100);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  try {
    const payload = await getSharedPayload(window, env, ctx, forceRefresh);
    let events = Array.isArray(payload.events) ? payload.events : [];

    if (signal) events = events.filter((event) => event.signal === signal);
    if (country) events = events.filter((event) => event.country === country);
    events = events.filter((event) => event.score >= minScore);

    return noStoreJson({
      ...payload,
      companies: undefined,
      events,
      snapshot: snapshotInfo(payload),
      persistence: { configured: hasDatabase(env) },
      filters: { window, signal, country, minScore }
    });
  } catch (error) {
    return noStoreJson({ error: String(error?.message || error), ok: false }, 500);
  }
}

async function handleArchive(request, env) {
  const url = new URL(request.url);

  try {
    const archive = await readArchive(env, {
      limit: url.searchParams.get("limit"),
      minScore: url.searchParams.get("minScore"),
      country: url.searchParams.get("country")
    });

    return noStoreJson({
      generatedAt: new Date().toISOString(),
      ...archive
    });
  } catch (error) {
    return noStoreJson({ error: String(error?.message || error), ok: false }, 500);
  }
}

async function handleStats(env) {
  try {
    return noStoreJson({
      generatedAt: new Date().toISOString(),
      ...(await readStats(env))
    });
  } catch (error) {
    return noStoreJson({ error: String(error?.message || error), ok: false }, 500);
  }
}

async function handleFeedback(request, env) {
  try {
    const input = await request.json();
    return noStoreJson(await saveFeedback(env, input));
  } catch (error) {
    return noStoreJson({ error: String(error?.message || error) }, 400);
  }
}

async function getSharedPayload(window, env, ctx, forceRefresh = false) {
  const cacheKey = snapshotKey(window);

  if (!forceRefresh) {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached.json();
  }

  if (inflightScans.has(window)) {
    return inflightScans.get(window);
  }

  const promise = createSnapshot(window, env, ctx, cacheKey);
  inflightScans.set(window, promise);

  try {
    return await promise;
  } finally {
    inflightScans.delete(window);
  }
}

async function createSnapshot(window, env, ctx, cacheKey) {
  const started = Date.now();
  const payload = await runPipeline(window);

  const snapshotPayload = {
    ...payload,
    elapsedMs: Date.now() - started,
    snapshotId: `${SNAPSHOT_VERSION}-${window}-${Date.now()}`,
    snapshotCreatedAt: new Date().toISOString(),
    snapshotWindow: window
  };

  await caches.default.put(cacheKey, snapshotResponse(snapshotPayload));

  if (hasDatabase(env) && ctx) {
    ctx.waitUntil(
      persistPipeline(env.DB, snapshotPayload).catch((error) => {
        console.error("D1 persistence failed", error);
      })
    );
  }

  return snapshotPayload;
}

async function refreshSnapshot(window, env) {
  try {
    const started = Date.now();
    const payload = await runPipeline(window);

    const snapshotPayload = {
      ...payload,
      elapsedMs: Date.now() - started,
      snapshotId: `${SNAPSHOT_VERSION}-${window}-${Date.now()}`,
      snapshotCreatedAt: new Date().toISOString(),
      snapshotWindow: window
    };

    await Promise.all([
      caches.default.put(snapshotKey(window), snapshotResponse(snapshotPayload)),
      hasDatabase(env) ? persistPipeline(env.DB, snapshotPayload) : Promise.resolve()
    ]);
  } catch (error) {
    console.error("Scheduled refresh failed", error);
  }
}

function snapshotResponse(payload) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${SNAPSHOT_TTL_SECONDS}`
    }
  });
}

function snapshotKey(window) {
  return new Request(
    `https://radaryum.internal/live-snapshot/${SNAPSHOT_VERSION}/${window}`
  );
}

function snapshotInfo(payload) {
  return {
    id: payload.snapshotId,
    createdAt: payload.snapshotCreatedAt,
    window: payload.snapshotWindow,
    ttlSeconds: SNAPSHOT_TTL_SECONDS,
    shared: true
  };
}

function normalizeWindow(value) {
  return ["24h", "3d", "7d"].includes(value) ? value : "3d";
}

function normalizeSignal(value) {
  return SIGNAL_GROUPS.some((group) => group.id === value) ? value : "";
}

function noStoreJson(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "pragma": "no-cache",
      "expires": "0"
    }
  });
}
