# Radaryum v2 — Correlation Engine

This release moves Radaryum from a stream of individual articles to company-level opportunity intelligence.

## New in v2
- Probable company extraction from current headlines
- Company-name normalization
- Correlation of multiple events around the same company
- Distinct signal, source-domain and event counts
- Company Opportunity Score
- Company timeline
- Separate Company Radar and Event Stream views
- No stored demonstration opportunities

## Deployment
Upload these files to the root of the existing GitHub repository, replacing the previous files. Commit to `main`. Cloudflare's Git integration should deploy automatically.

## Endpoints
- `/api/companies?window=3d&country=Mexico&minScore=60`
- `/api/opportunities?window=3d&signal=expansion&minScore=55`
- `/api/health`

## Important accuracy boundary
Entity extraction is deterministic and based primarily on current headlines. A company group is a probable correlation and must be verified through the linked original sources. Scores are prioritization indicators, not statistical probabilities.
