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

    const quality = evaluateSnapshotQuality(previous, payload);

    if (!quality.publish) {
      console.warn(`Snapshot rejected for ${window}: ${quality.reason}`);

      if (previous) {
        return {
          ...previous,
          refreshRejected: true,
          refreshRejectedAt: new Date().toISOString(),
          refreshRejectedReason: quality.reason,
          rejectedCandidateStats: {
            events: payload.events?.length || 0,
            companies: payload.companies?.length || 0,
            collectors: payload.collectors || null
          }
        };
      }

      return emptySnapshot(window, quality.reason);
    }

    const snapshotPayload = {
      ...payload,
      snapshotId: crypto.randomUUID(),
      snapshotWindow: window,
      snapshotCreatedAt: new Date().toISOString(),
      snapshotStatus: "ready",
      qualityGate: {
        passed: true,
        reason: quality.reason
      }
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


function evaluateSnapshotQuality(previous, candidate) {
  const newEvents = candidate?.events?.length || 0;
  const newCompanies = candidate?.companies?.length || 0;
  const collectors = candidate?.collectors || {};
  const providers = Array.isArray(collectors.providers) ? collectors.providers : [];

  if (newEvents === 0 && newCompanies === 0) {
    return {
      publish: false,
      reason: "Collectors returned no publishable events or companies."
    };
  }

  const activeProviders = providers.filter((provider) => (provider.itemsFound || 0) > 0);
  const primaryItems = providers
    .filter((provider) => ["gdelt", "google-news"].includes(provider.provider))
    .reduce((sum, provider) => sum + (provider.itemsFound || 0), 0);

  if (previous) {
    const previousEvents = previous?.events?.length || previous?.stats?.events || 0;
    const previousCompanies = previous?.companies?.length || previous?.stats?.companies || 0;

    if (previousEvents >= 10) {
      const minimumEvents = Math.max(5, Math.ceil(previousEvents * 0.30));

      if (newEvents < minimumEvents) {
        return {
          publish: false,
          reason: `Candidate has ${newEvents} events; minimum required is ${minimumEvents} versus previous ${previousEvents}.`
        };
      }
    }

    if (previousCompanies >= 4 && newCompanies === 0) {
      return {
        publish: false,
        reason: `Candidate has no companies versus previous ${previousCompanies}.`
      };
    }
  }

  if (activeProviders.length <= 1 && primaryItems === 0 && newEvents < 10) {
    return {
      publish: false,
      reason: "Only one secondary provider contributed and the primary news collectors returned zero."
    };
  }

  if ((collectors.failed || 0) >= Math.max(2, Math.ceil((collectors.total || 0) / 2))) {
    return {
      publish: false,
      reason: "At least half of the configured collectors failed."
    };
  }

  return {
    publish: true,
    reason: previous
      ? "Candidate passed relative quality checks against the previous snapshot."
      : "Initial snapshot contains publishable data."
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
