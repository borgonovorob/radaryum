export function hasDatabase(env) {
  return Boolean(env?.DB);
}

export async function persistPipeline(env, payload, window = "3d") {
  if (!hasDatabase(env)) return { stored: false, reason: "D1 binding DB is not configured." };

  const now = new Date().toISOString();
  const statements = [];

  statements.push(
    env.DB.prepare(`
      INSERT INTO scans (
        generated_at, window, provider, elapsed_ms, event_count, company_count, multi_signal_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      payload.generatedAt,
      window,
      payload.provider,
      payload.elapsedMs || 0,
      payload.stats?.events || payload.events.length,
      payload.stats?.companies || payload.companies.length,
      payload.stats?.multiSignalCompanies || 0
    )
  );

  for (const event of payload.events) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO events (
          id, title, url, domain, provider, published_at, signal, signal_label,
          country, company, company_confidence, score, confidence, reasons_json,
          suggested_action, source_language, source_country,
          sec_form, sec_relevance_score, sec_matched_terms_json, sec_evidence_snippet,
          first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          url = excluded.url,
          domain = excluded.domain,
          provider = excluded.provider,
          published_at = excluded.published_at,
          signal = excluded.signal,
          signal_label = excluded.signal_label,
          country = excluded.country,
          company = excluded.company,
          company_confidence = excluded.company_confidence,
          score = excluded.score,
          confidence = excluded.confidence,
          reasons_json = excluded.reasons_json,
          suggested_action = excluded.suggested_action,
          source_language = excluded.source_language,
          source_country = excluded.source_country,
          sec_form = excluded.sec_form,
          sec_relevance_score = excluded.sec_relevance_score,
          sec_matched_terms_json = excluded.sec_matched_terms_json,
          sec_evidence_snippet = excluded.sec_evidence_snippet,
          last_seen_at = excluded.last_seen_at
      `).bind(
        event.id, event.title, event.url, event.domain, event.provider || payload.provider,
        event.publishedAt, event.signal, event.signalLabel, event.country, event.company,
        event.companyConfidence || 0, event.score, event.confidence,
        JSON.stringify(event.reasons || []), event.suggestedAction || null,
        event.sourceLanguage || null, event.sourceCountry || null,
        event.secForm || null, event.secRelevanceScore || null,
        JSON.stringify(event.secMatchedTerms || []), event.secEvidenceSnippet || null,
        now, now
      )
    );
  }

  for (const company of payload.companies) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO companies (
          id, company, normalized_company, score, confidence, signal_count,
          event_count, source_count, signals_json, countries_json, reasons_json,
          suggested_action, latest_at, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          company = excluded.company,
          normalized_company = excluded.normalized_company,
          score = excluded.score,
          confidence = excluded.confidence,
          signal_count = excluded.signal_count,
          event_count = excluded.event_count,
          source_count = excluded.source_count,
          signals_json = excluded.signals_json,
          countries_json = excluded.countries_json,
          reasons_json = excluded.reasons_json,
          suggested_action = excluded.suggested_action,
          latest_at = excluded.latest_at,
          last_seen_at = excluded.last_seen_at
      `).bind(
        company.id, company.company, company.normalizedCompany, company.score,
        company.confidence, company.signalCount, company.eventCount, company.sourceCount,
        JSON.stringify(company.signals || []), JSON.stringify(company.countries || []),
        JSON.stringify(company.reasons || []), company.suggestedAction || null,
        company.latestAt, now, now
      )
    );

    for (const event of company.timeline || []) {
      statements.push(
        env.DB.prepare(`
          INSERT OR IGNORE INTO company_events (company_id, event_id, linked_at)
          VALUES (?, ?, ?)
        `).bind(company.id, event.id, now)
      );
    }
  }

  for (let index = 0; index < statements.length; index += 75) {
    await env.DB.batch(statements.slice(index, index + 75));
  }

  return {
    stored: true,
    events: payload.events.length,
    companies: payload.companies.length,
    statements: statements.length
  };
}

export async function saveSnapshot(env, window, payload) {
  if (!hasDatabase(env)) return { stored: false };

  if (!payload?.events?.length && !payload?.companies?.length) {
    return { stored: false, reason: "Empty snapshots are not published." };
  }

  const snapshotId = payload.snapshotId || crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO snapshots (
      snapshot_id, window, created_at, generated_at, status, partial,
      event_count, company_count, collector_summary_json, payload_json
    ) VALUES (?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?)
  `).bind(
    snapshotId,
    window,
    now,
    payload.generatedAt || now,
    payload.partial ? 1 : 0,
    payload.events?.length || 0,
    payload.companies?.length || 0,
    JSON.stringify(payload.collectors || {}),
    JSON.stringify({ ...payload, snapshotId })
  ).run();

  await env.DB.prepare(`
    DELETE FROM snapshots
    WHERE window = ?
      AND snapshot_id NOT IN (
        SELECT snapshot_id
        FROM snapshots
        WHERE window = ?
        ORDER BY created_at DESC
        LIMIT 20
      )
  `).bind(window, window).run();

  return { stored: true, snapshotId };
}

export async function readLatestSnapshot(env, window) {
  if (!hasDatabase(env)) return null;

  const row = await env.DB.prepare(`
    SELECT payload_json
    FROM snapshots
    WHERE window = ? AND status = 'ready'
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(window).first();

  if (!row?.payload_json) return null;
  return safeJson(row.payload_json, null);
}

export async function readArchive(env, options = {}) {
  if (!hasDatabase(env)) return { configured: false, companies: [], events: [] };

  const limit = Math.min(100, Math.max(1, Number(options.limit || 50)));
  const minScore = Math.min(100, Math.max(0, Number(options.minScore || 0)));
  const country = String(options.country || "").trim();

  const companyWhere = ["score >= ?"];
  const companyBindings = [minScore];
  if (country) {
    companyWhere.push("countries_json LIKE ?");
    companyBindings.push(`%${country}%`);
  }

  const companyResult = await env.DB.prepare(`
    SELECT * FROM companies
    WHERE ${companyWhere.join(" AND ")}
    ORDER BY score DESC, latest_at DESC
    LIMIT ?
  `).bind(...companyBindings, limit).all();

  const eventWhere = ["score >= ?"];
  const eventBindings = [minScore];
  if (country) {
    eventWhere.push("country = ?");
    eventBindings.push(country);
  }

  const eventResult = await env.DB.prepare(`
    SELECT * FROM events
    WHERE ${eventWhere.join(" AND ")}
    ORDER BY published_at DESC, score DESC
    LIMIT ?
  `).bind(...eventBindings, limit).all();

  return {
    configured: true,
    companies: (companyResult.results || []).map(parseCompany),
    events: (eventResult.results || []).map(parseEvent)
  };
}

export async function readStats(env) {
  if (!hasDatabase(env)) return { configured: false };

  const [events, companies, scans, feedback, snapshots, health] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS count, MAX(last_seen_at) AS latest FROM events"),
    env.DB.prepare("SELECT COUNT(*) AS count, MAX(last_seen_at) AS latest FROM companies"),
    env.DB.prepare("SELECT COUNT(*) AS count, MAX(generated_at) AS latest FROM scans"),
    env.DB.prepare("SELECT COUNT(*) AS count, MAX(created_at) AS latest FROM feedback"),
    env.DB.prepare("SELECT COUNT(*) AS count, MAX(created_at) AS latest FROM snapshots"),
    env.DB.prepare("SELECT status, COUNT(*) AS count FROM source_health GROUP BY status")
  ]);

  return {
    configured: true,
    events: events.results?.[0] || { count: 0, latest: null },
    companies: companies.results?.[0] || { count: 0, latest: null },
    scans: scans.results?.[0] || { count: 0, latest: null },
    feedback: feedback.results?.[0] || { count: 0, latest: null },
    snapshots: snapshots.results?.[0] || { count: 0, latest: null },
    sourceHealth: health.results || []
  };
}

export async function saveFeedback(env, input) {
  if (!hasDatabase(env)) return { stored: false, reason: "D1 binding DB is not configured." };

  const allowedTypes = new Set(["company", "event"]);
  const allowedRatings = new Set(["useful", "review", "dismiss"]);
  if (!allowedTypes.has(input.targetType) || !allowedRatings.has(input.rating) || !input.targetId) {
    throw new Error("Invalid feedback payload.");
  }

  await env.DB.prepare(`
    INSERT INTO feedback (target_type, target_id, rating, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    input.targetType,
    input.targetId,
    input.rating,
    input.note || null,
    new Date().toISOString()
  ).run();

  return { stored: true };
}

function parseCompany(row) {
  return {
    id: row.id,
    company: row.company,
    normalizedCompany: row.normalized_company,
    score: row.score,
    confidence: row.confidence,
    signalCount: row.signal_count,
    eventCount: row.event_count,
    sourceCount: row.source_count,
    signals: safeJson(row.signals_json, []),
    countries: safeJson(row.countries_json, []),
    reasons: safeJson(row.reasons_json, []),
    suggestedAction: row.suggested_action,
    latestAt: row.latest_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    archived: true
  };
}

function parseEvent(row) {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    domain: row.domain,
    provider: row.provider,
    publishedAt: row.published_at,
    signal: row.signal,
    signalLabel: row.signal_label,
    country: row.country,
    company: row.company,
    companyConfidence: row.company_confidence,
    score: row.score,
    confidence: row.confidence,
    reasons: safeJson(row.reasons_json, []),
    suggestedAction: row.suggested_action,
    sourceLanguage: row.source_language,
    sourceCountry: row.source_country,
    secForm: row.sec_form || null,
    secRelevanceScore: row.sec_relevance_score || null,
    secMatchedTerms: safeJson(row.sec_matched_terms_json, []),
    secEvidenceSnippet: row.sec_evidence_snippet || null,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    archived: true
  };
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
