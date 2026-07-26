Radaryum v5.8.3 — Archive source links

Replace these files in GitHub:
- src/engines/persistence.js
- public/app.js

Changes:
- Archive company cards now include up to five latest source-news links.
- Each link includes date, signal, headline, and source domain.
- The original article is not copied into D1; only the URL and existing event metadata are used.
- No D1 migration is required.
- Storage impact is negligible because the URLs already exist in the events table.
