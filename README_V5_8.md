# Radaryum v5.8 — Consolidated accumulated feed

This release consolidates the current production project.

## Main changes
- One canonical 7-day feed accumulated from D1 plus each fresh collector run.
- 24h and 3d views are derived from the same 7-day dataset.
- Active `company_sources` names are loaded dynamically for company detection.
- Existing events and companies are updated only when content changes.
- Collector health rows are written only on change or every two hours.
- Unchanged snapshots are not stored; only eight changed snapshots are retained.
- Daily cleanup of old scan logs and events older than 60 days.
- Refresh button polls until a new snapshot appears instead of waiting a fixed 15 seconds.
- Package, Worker and health endpoint versions aligned to 5.8.0.

## Deployment
Replace the repository contents with this package and deploy normally. No new D1 migration is required.
