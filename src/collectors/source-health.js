const RUN_HEARTBEAT_MS = 2 * 60 * 60 * 1000;

export async function recordCollectorRun(env, run) {
  if (!env?.DB) return;
  const now = new Date().toISOString();
  const previous = await env.DB.prepare(`
    SELECT status, items_found, error_message, finished_at
    FROM collector_runs WHERE provider = ? AND window = ?
    ORDER BY finished_at DESC LIMIT 1
  `).bind(run.provider, run.window).first();
  const previousTime = previous?.finished_at ? new Date(previous.finished_at).getTime() : 0;
  const changed = !previous || previous.status !== run.status || Number(previous.items_found||0)!==Number(run.itemsFound||0) || String(previous.error_message||"")!==String(run.errorMessage||"");
  const heartbeatDue = !previousTime || Date.now()-previousTime >= RUN_HEARTBEAT_MS;
  if (!changed && !heartbeatDue) return;

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO collector_runs (run_id,provider,window,started_at,finished_at,status,items_found,partial,error_message)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(run.runId,run.provider,run.window,run.startedAt,run.finishedAt,run.status,run.itemsFound||0,run.partial?1:0,run.errorMessage||null),
    env.DB.prepare(`
      INSERT INTO source_health (provider,status,last_checked_at,last_success_at,last_error_at,last_error_message,consecutive_failures,last_item_count)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(provider) DO UPDATE SET
        status=excluded.status,last_checked_at=excluded.last_checked_at,
        last_success_at=CASE WHEN excluded.status IN ('healthy','partial') THEN excluded.last_success_at ELSE source_health.last_success_at END,
        last_error_at=CASE WHEN excluded.status='failed' THEN excluded.last_error_at ELSE source_health.last_error_at END,
        last_error_message=excluded.last_error_message,
        consecutive_failures=CASE WHEN excluded.status='failed' THEN source_health.consecutive_failures+1 ELSE 0 END,
        last_item_count=excluded.last_item_count
    `).bind(run.provider,run.status,now,run.status==='failed'?null:now,run.status==='failed'?now:null,run.errorMessage||null,run.status==='failed'?1:0,run.itemsFound||0)
  ]);
}
