import { SIGNAL_GROUPS } from "./config/signals.js";
import { runPipeline } from "./engines/pipeline.js";
import {
  hasDatabase,
  persistPipeline,
  readArchive,
  readLatestSnapshot,
  readStats,
  saveFeedback,
  saveSnapshot
} from "./engines/persistence.js";
import { clamp } from "./utils/text.js";

const CACHE_TTL_SECONDS = 300;
const REFRESHING = new Set();

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
        return apiJson({
          ok: true,
          service: "radaryum",
          version: "5.0.0",
          architecture: "background-collectors-persistent-snapshots",
          databaseConfigured: hasDatabase(env),
          time: new Date().toISOString()
        });
      }

      if (url.pathname.startsWith("/api/")) {
        return apiJson({ ok: false, error: "API route not found", path: url.pathname }, 404);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return apiJson({ ok: false, error: String(error?.message || error) }, 500);
    }
  },

  async scheduled(controller, env, ctx) {
    const window = cronWindow(controller.cron);
    ctx.waitUntil(refreshWindow(window, env));
  }
};

async function handleCompanies(request, env, ctx) {
  const url = new URL(request.url);
  const window = normalizeWindow(url.searchParams.get("window"));
  const country = (url.searchParams.get("country") || "").trim();
  const minScore = clamp(Number(url.searchParams.get("minScore") || 60), 0, 100);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  const payload = await getSnapshot(window, env, ctx, forceRefresh);
  let companies = Array.isArray(payload.companies) ? payload.companies : [];

  if (country) {
    companies = companies.filter((company) =>
      Array.isArray(company.countries) && company.countries.includes(country)
    );
  }

  companies = companies.filter((company) => company.score >= minScore);

  return apiJson({
    ...payload,
    events: undefined,
    companies,
    filters: { window, country, minScore }
  });
}

async function handleEvents(request, env, ctx) {
  const url = new URL(request.url);
  const window = normalizeWindow(url.searchParams.get("window"));
  const signal = normalizeSignal(url.searchParams.get("signal"));
  const country = (url.searchParams.get("country") || "").trim();
  const minScore = clamp(Number(url.searchParams.get("minScore") || 55), 0, 100);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  const payload = await getSnapshot(window, env, ctx, forceRefresh);
  let events = Array.isArray(payload.events) ? payload.events : [];

  if (signal) events = events.filter((event) => event.signal === signal);
  if (country) events = events.filter((event) => event.country === country);
  events = events.filter((event) => event.score >= minScore);

  return apiJson({
    ...payload,
    companies: undefined,
    events,
    filters: { window, signal, country, minScore }
  });
}

async function getSnapshot(window, env, ctx, forceRefresh) {
  const cacheKey = snapshotKey(window);
  const cached = await caches.default.match(cacheKey);

  if (forceRefresh) {
    scheduleRefresh(window, env, ctx);
  }

  if (cached) {
    const payload = await cached.json();
    return {
      ...payload,
      refresh: {
        requested: forceRefresh,
        inProgress: REFRESHING.has(window)
      }
    };
  }

  const stored = await readLatestSnapshot(env, window);
  if (stored) {
    await caches.default.put(cacheKey, snapshotResponse(stored));
    if (forceRefresh) scheduleRefresh(window, env, ctx);

    return {
      ...stored,
      refresh: {
        requested: forceRefresh,
        inProgress: REFRESHING.has(window)
      }
    };
  }

  // First-run bootstrap only. Normal requests never run collectors.
  const payload = await refreshWindow(window, env);

  return {
    ...payload,
    refresh: {
      requested: forceRefresh,
      inProgress: false
    }
  };
}

function scheduleRefresh(window, env, ctx) {
  if (REFRESHING.has(window)) return;
  if (ctx) ctx.waitUntil(refreshWindow(window, env));
}

async function refreshWindow(window, env) {
  if (REFRESHING.has(window)) {
    const existing = await readLatestSnapshot(env, window);
    return existing || emptySnapshot(window, "Refresh already in progress.");
  }

  REFRESHING.add(window);

  try {
    const previous = await readLatestSnapshot(env, window);
    const payload = await runPipeline(window, env);

    if (!payload.events.length && !payload.companies.length) {
      return previous || emptySnapshot(window, "Collectors returned no publishable results.");
    }

    const snapshotPayload = {
      ...payload,
      snapshotId: crypto.randomUUID(),
      snapshotWindow: window,
      snapshotCreatedAt: new Date().toISOString(),
      snapshotStatus: "ready"
    };

    await Promise.all([
      caches.default.put(snapshotKey(window), snapshotResponse(snapshotPayload)),
      persistPipeline(env, snapshotPayload, window),
      saveSnapshot(env, window, snapshotPayload)
    ]);

    return snapshotPayload;
  } catch (error) {
    console.error(`Refresh failed for ${window}`, error);
    const previous = await readLatestSnapshot(env, window);
    return previous || emptySnapshot(window, String(error?.message || error));
  } finally {
    REFRESHING.delete(window);
  }
}

async function handleArchive(request, env) {
  const url = new URL(request.url);
  const archive = await readArchive(env, {
    limit: url.searchParams.get("limit"),
    minScore: url.searchParams.get("minScore"),
    country: url.searchParams.get("country")
  });

  return apiJson({
    generatedAt: new Date().toISOString(),
    ...archive
  });
}

async function handleStats(env) {
  return apiJson({
    generatedAt: new Date().toISOString(),
    ...(await readStats(env))
  });
}

async function handleFeedback(request, env) {
  try {
    return apiJson(await saveFeedback(env, await request.json()));
  } catch (error) {
    return apiJson({ error: String(error?.message || error) }, 400);
  }
}

function snapshotResponse(payload) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`
    }
  });
}

function snapshotKey(window) {
  return new Request(`https://radaryum.internal/v5/snapshot/${window}`);
}

function emptySnapshot(window, reason) {
  return {
    generatedAt: new Date().toISOString(),
    snapshotId: null,
    snapshotWindow: window,
    snapshotCreatedAt: null,
    snapshotStatus: "unavailable",
    partial: true,
    caveat: reason,
    collectors: {
      total: 0,
      successful: 0,
      partial: 0,
      failed: 0,
      itemsFound: 0,
      providers: []
    },
    stats: {
      events: 0,
      companies: 0,
      multiSignalCompanies: 0
    },
    events: [],
    companies: []
  };
}

function cronWindow(cron) {
  if (cron === "*/15 * * * *") return "3d";
  if (cron === "7,37 * * * *") return "24h";
  if (cron === "23 * * * *") return "7d";
  return "3d";
}

function normalizeWindow(value) {
  return ["24h", "3d", "7d"].includes(value) ? value : "3d";
}

function normalizeSignal(value) {
  return SIGNAL_GROUPS.some((group) => group.id === value) ? value : "";
}

function apiJson(payload, status = 200) {
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
