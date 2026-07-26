Radaryum Sprint 3 — Clerk UI initialization fix

Replace in GitHub:
public/app.js

Cause:
ClerkJS loaded, but the Clerk UI bundle was not passed to Clerk.load().
Therefore openSignIn() and openSignUp() could not render the authentication modal.

Fix:
Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } })

No D1 migration is required.
