# Radaryum V5.0 — Sprint 3A

## Replace/add
- src/index.js
- src/engines/pipeline.js
- src/engines/persistence.js
- src/collectors/orchestrator.js
- src/collectors/source-health.js
- src/providers/common.js
- src/providers/gdelt.js
- src/providers/google-news.js
- src/providers/company-newsroom.js
- src/providers/sec-edgar.js
- migrations/0002_collectors.sql
- wrangler.jsonc

## Deployment order
1. Upload all files and deploy.
2. Run `migrations/0002_collectors.sql` in the D1 console.
3. Redeploy once after the migration if the first deployment logged missing-table errors.
4. Bootstrap each snapshot once:
   - https://radaryum.com/api/events?window=24h&minScore=0&refresh=1
   - https://radaryum.com/api/events?window=3d&minScore=0&refresh=1
   - https://radaryum.com/api/events?window=7d&minScore=0&refresh=1
5. Normal page loads now read the last ready snapshot instead of waiting for feeds.

## Cron cadence
- 3d: every 15 minutes
- 24h: twice per hour
- 7d: hourly

## Safety
- Empty collection does not replace the previous snapshot.
- Provider failures are recorded independently.
- Company newsroom and SEC collectors activate only when company_sources contains valid RSS URLs or SEC CIKs.
- No demo data.
