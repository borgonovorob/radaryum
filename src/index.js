import { SIGNAL_GROUPS } from "./config/signals.js";
import { runPipeline } from "./engines/pipeline.js";
import {
  hasDatabase,
  persistPipeline,
  readArchive,
  readStats,
  saveFeedback
} from "./engines/persistence.js";
import { failure, json } from "./utils/http.js";
import { clamp } from "./utils/text.js";

const CACHE_KEY = new Request("https://radaryum.internal/api/correlated?window=3d");

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/companies") return handleCompanies(request, env, ctx);
    if (url.pathname === "/api/opportunities") return handleEvents(request, env, ctx);
    if (url.pathname === "/api/archive") return handleArchive(request, env);
    if (url.pathname === "/api/stats") return handleStats(env);
    if (url.pathname === "/api/feedback" && request.method === "POST") {
      return handleFeedback(request, env);
    }
    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "radaryum",
        version: "4.0.0",
        architecture: "modular-persistent",
        databaseConfigured: hasDatabase(env),
        time: new Date().toISOString()
      }, 200, 60);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(refreshAndPersist(env));
  }
};

async function handleCompanies(request, env, ctx) {
  const url = new URL(request.url);
  const window = normalizeWindow(url.searchParams.get("window"));
  const country = (url.searchParams.get("country") || "").trim();
  const minScore = clamp(Number(url.searchParams.get("minScore") || 60), 0, 100);

  try {
    const payload = await getPayload(window, env, ctx);
    let companies = payload.companies;
    if (country) companies = companies.filter((company) => company.countries.includes(country));
    companies = companies.filter((company) => company.score >= minScore);

    return json({
      ...payload,
      events: undefined,
      companies,
      persistence: { configured: hasDatabase(env) },
      filters: { window, country, minScore }
    }, 200, 300);
  } catch (error) {
    return failure(error);
  }
}

async function handleEvents(request, env, ctx) {
  const url = new URL(request.url);
  const window = normalizeWindow(url.searchParams.get("window"));
  const signal = normalizeSignal(url.searchParams.get("signal"));
  const country = (url.searchParams.get("country") || "").trim();
  const minScore = clamp(Number(url.searchParams.get("minScore") || 55), 0, 100);

  try {
    const payload = await getPayload(window, env, ctx);
    let events = payload.events;
    if (signal) events = events.filter((event) => event.signal === signal);
    if (country) events = events.filter((event) => event.country === country);
    events = events.filter((event) => event.score >= minScore);

    return json({
      ...payload,
      companies: undefined,
      events,
      persistence: { configured: hasDatabase(env) },
      filters: { window, signal, country, minScore }
    }, 200, 300);
  } catch (error) {
    return failure(error);
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
    return json({
      generatedAt: new Date().toISOString(),
      ...archive
    }, 200, 120);
  } catch (error) {
    return failure(error);
  }
}

async function handleStats(env) {
  try {
    return json({
      generatedAt: new Date().toISOString(),
      ...(await readStats(env))
    }, 200, 60);
  } catch (error) {
    return failure(error);
  }
}

async function handleFeedback(request, env) {
  try {
    const input = await request.json();
    return json(await saveFeedback(env, input), 200, 0);
  } catch (error) {
    return json({ error: String(error?.message || error) }, 400, 0);
  }
}

async function getPayload(window, env, ctx) {
  if (window !== "3d") {
    const payload = await runPipeline(window);
    ctx.waitUntil(persistPipeline(env, payload, window));
    return payload;
  }

  let response = await caches.default.match(CACHE_KEY);
  if (!response) {
    const payload = await runPipeline(window);
    response = json(payload, 200, 900);
    ctx.waitUntil(Promise.all([
      caches.default.put(CACHE_KEY, response.clone()),
      persistPipeline(env, payload, window)
    ]));
  }

  return response.json();
}

async function refreshAndPersist(env) {
  try {
    const payload = await runPipeline("3d");
    await Promise.all([
      caches.default.put(CACHE_KEY, json(payload, 200, 900)),
      persistPipeline(env, payload, "3d")
    ]);
  } catch (error) {
    console.error("Scheduled refresh failed", error);
  }
}

function normalizeWindow(value) {
  return ["24h", "3d", "7d"].includes(value) ? value : "3d";
}

function normalizeSignal(value) {
  return SIGNAL_GROUPS.some((group) => group.id === value) ? value : "";
}
