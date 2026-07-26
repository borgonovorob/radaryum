Radaryum v5.8.6 — Refresh button UX fix

Replace in GitHub:
- public/app.js

Why:
The previous button waited up to 75 seconds for a new snapshot ID. When a
refresh completed but produced unchanged content, the optimized persistence
layer correctly skipped writing a new snapshot, so the ID did not change and
the button appeared stuck.

New behavior:
- Starts the refresh normally.
- Polls for a new snapshot for at most 30 seconds.
- If content changes: shows "Updated".
- If no new snapshot appears: shows "Refresh continues in background".
- Re-enables the button instead of remaining locked for 75 seconds.
- No D1 migration required.
