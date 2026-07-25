# Radaryum v1

A full-stack Cloudflare Worker that serves the website and a live industrial opportunity API from one deployment.

## Live data
No sample opportunities are stored in this repository. `/api/opportunities` retrieves current public-source results from GDELT DOC 2.0, removes duplicate URLs/headlines, classifies signals and applies a transparent rule-based relevance score.

## Deploy from Cloudflare Git integration
Cloudflare is already connected to the repository:

1. Upload every file and folder from this project to the root of the GitHub repository.
2. Return to the Cloudflare "Create a Worker" screen.
3. Select the repository and click **Deploy**.
4. Cloudflare will run `npm run deploy`.
5. After deployment, open the generated `workers.dev` preview.
6. Under the Worker settings, add the custom domain `radaryum.com`.

## Project layout
- `src/index.js`: Worker API, live collection, scoring, caching and scheduled refresh.
- `public/`: website assets.
- `wrangler.jsonc`: Cloudflare static assets and Cron configuration.
- `package.json`: Wrangler scripts.

## API
- `/api/health`
- `/api/opportunities?window=3d&signal=expansion&country=Mexico&minScore=55`

Allowed windows: `24h`, `3d`, `7d`.

## Accuracy boundary
Radaryum surfaces and prioritizes public signals. It does not label a result as a confirmed RFQ unless the linked source explicitly establishes that fact. The Opportunity Score is a deterministic relevance score and not a statistical probability.
