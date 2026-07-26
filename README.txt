Radaryum v5.8.2 — Robust company detection

Replace in GitHub:
- src/engines/entity.js
- src/engines/pipeline.js

Improvements:
- Detects company names before a much broader set of corporate-action phrases.
- Handles headlines such as:
  - Pearl Global Builds...
  - BeOne Medicines Plans...
  - ABC Group to build...
  - XYZ will invest...
  - Company breaks ground...
- Adds a conservative title-case fallback when the action verb is unknown.
- Reprocesses archived events with null, "undetected", "unknown", or
  "Company undetected" values during the next canonical refresh.
- No D1 migration required.

After deployment:
Open:
https://radaryum.com/api/events?window=7d&minScore=0&refresh=1

Wait for the new snapshot, then reload the Event Stream.
