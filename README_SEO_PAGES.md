# Radaryum SEO Pages v1

This consolidated release adds public, server-rendered pages without changing D1 schema:

- `/companies`
- `/company/:slug`
- `/sitemap.xml`

## Deployment

Replace the repository contents with this package, commit to `main`, and let Cloudflare deploy it.
No D1 migration and no new secret are required.

## Verification

Open:

- `https://radaryum.com/companies`
- `https://radaryum.com/company/ford`
- `https://radaryum.com/sitemap.xml`
- `https://radaryum.com/api/health`

Company pages are indexable only when the company has at least 3 events, at least 2 source domains, and a signal in the last 180 days. Other valid company pages remain accessible with `noindex,follow` and are excluded from the sitemap.

The public CTA sends visitors to `/?signup=1`, which opens Clerk sign-up automatically.
