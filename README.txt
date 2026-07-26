Radaryum v5.8.1 — Company detection fix

Replace in GitHub:
- src/engines/entity.js
- src/engines/pipeline.js

What this fixes:
- Detects company names immediately before action verbs without greedily
  consuming the verb.
- Example: "Pearl Global Builds..." is detected as "Pearl Global".
- Accepts company-like names without legal suffixes such as Inc., Ltd. or Group.
- Reprocesses stored events whose company is currently null, so historical
  "Company undetected" events can be corrected during the next 7-day refresh.

No D1 migration is required.

After deployment:
1. Open https://radaryum.com/api/events?window=7d&minScore=0&refresh=1
2. Wait for the background refresh.
3. Reload the event stream.
