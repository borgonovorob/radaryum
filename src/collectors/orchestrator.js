import { companyNewsroomProvider } from "../providers/company-newsroom.js";
import { gdeltProvider } from "../providers/gdelt.js";
import { googleNewsProvider } from "../providers/google-news.js";
import { secEdgarProvider } from "../providers/sec-edgar.js";
import { dedupeProviderArticles } from "../providers/common.js";
import { recordCollectorRun } from "./source-health.js";

const PROVIDERS = [
  gdeltProvider,
  googleNewsProvider,
  companyNewsroomProvider,
  secEdgarProvider
];

export async function collectSources(window, env) {
  const settled = await Promise.allSettled(
    PROVIDERS.map((provider) => runProvider(provider, window, env))
  );

  const articles = [];
  const runs = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      articles.push(...result.value.articles);
      runs.push(result.value.run);
    } else {
      runs.push({
        provider: "unknown",
        window,
        status: "failed",
        partial: false,
        itemsFound: 0,
        errorMessage: String(result.reason?.message || result.reason)
      });
    }
  }

  return {
    articles: dedupeProviderArticles(articles),
    collectors: summarizeRuns(runs),
    runs
  };
}

async function runProvider(provider, window, env) {
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();

  try {
    const result = await provider.collect({ window, env });
    const status = result.partial ? "partial" : "healthy";

    const run = {
      runId,
      provider: provider.id,
      window,
      startedAt,
      finishedAt: new Date().toISOString(),
      status,
      partial: Boolean(result.partial),
      itemsFound: result.articles.length,
      errorMessage: (result.errors || []).slice(0, 3).join(" | ") || null
    };

    await recordCollectorRun(env, run).catch((error) => {
      console.error("Collector health persistence failed", error);
    });

    return { articles: result.articles, run };
  } catch (error) {
    const run = {
      runId,
      provider: provider.id,
      window,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failed",
      partial: false,
      itemsFound: 0,
      errorMessage: String(error?.message || error)
    };

    await recordCollectorRun(env, run).catch((healthError) => {
      console.error("Collector health persistence failed", healthError);
    });

    return { articles: [], run };
  }
}

function summarizeRuns(runs) {
  return {
    total: runs.length,
    successful: runs.filter((run) => run.status === "healthy").length,
    partial: runs.filter((run) => run.status === "partial").length,
    failed: runs.filter((run) => run.status === "failed").length,
    itemsFound: runs.reduce((sum, run) => sum + (run.itemsFound || 0), 0),
    providers: runs.map((run) => ({
      provider: run.provider,
      status: run.status,
      itemsFound: run.itemsFound || 0
    }))
  };
}
