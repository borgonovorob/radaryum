Radaryum v5.8.5 — Multi-company events

Replace/add in GitHub:
- src/engines/entity.js
- src/engines/pipeline.js
- src/engines/correlation.js
- src/engines/persistence.js
- public/app.js
- migrations/0004_event_companies.sql

IMPORTANT — run the D1 migration once:
Cloudflare → D1 → radaryum-db → Console

Paste and execute the contents of:
migrations/0004_event_companies.sql

What changes:
- One event can belong to several companies.
- Headlines such as “Ford and Geely Reshape…” detect both Ford and Geely.
- The event is linked to both company cards through company_events.
- Event Stream displays “Ford · Geely”.
- Company timelines show “Also: …” for related companies.
- Existing single-company events are backfilled into companies_json.
- Stored events are reprocessed during refreshes as detection improves.

After deployment and migration:
https://radaryum.com/api/events?window=7d&minScore=0&refresh=1
