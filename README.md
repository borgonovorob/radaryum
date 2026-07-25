# Radaryum v4 — Persistent D1 Archive

Version 4 saves every live scan to Cloudflare D1. The application keeps working without D1, but the Archive and feedback persistence remain disabled until the binding is configured.

## New capabilities
- Persistent event history
- Persistent company history
- First-seen and last-seen timestamps
- Scan history
- Company-to-event links
- User relevance feedback
- `/api/archive`
- `/api/stats`
- Scheduled scans persist automatically

## Cloudflare setup — browser only

### 1. Create the database
Cloudflare dashboard:
1. **Storage & databases**
2. **D1 SQL Database**
3. **Create database**
4. Name: `radaryum-db`
5. Create

### 2. Initialize tables
Open `radaryum-db` → **Console**.
Copy and run the full contents of:

`migrations/0001_initial.sql`

### 3. Bind database to the Worker
Open Worker `radaryum`:
1. **Settings**
2. **Bindings**
3. **Add binding**
4. Type: **D1 database**
5. Variable name: `DB`
6. Database: `radaryum-db`
7. Save / deploy

The variable name must be exactly `DB`.

### 4. Verify
Open:

`https://radaryum.roberto-borgonovo.workers.dev/api/health`

It should show:

`"version": "4.0.0"`
`"databaseConfigured": true`

Then open `/api/stats`.

## Upload
Use github.dev or GitHub Desktop to replace the repository with this project. Commit to `main`; Cloudflare deploys automatically.

## Accuracy boundary
Stored data remains public-source intelligence. A score is a review priority, not a confirmed sourcing requirement or statistical probability.
