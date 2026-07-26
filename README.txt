Radaryum v5.8.7 — Multi-company detection correction

Replace in GitHub:
- src/engines/entity.js

This corrects two issues in v5.8.5:
1. The generated entity file still contained the old singular matching helpers.
2. Single-word brands in coordinated headlines, such as Geely in
   "Ford and Geely Reshape...", were rejected for lacking a corporate suffix.

Verified detections:
- Ford and Geely Reshape... -> Ford, Geely
- Ford and Geely to pool... -> Ford, Geely
- Ford and Geely join forces... -> Ford, Geely
- Ford and Geely Form... -> Ford, Geely
- Pearl Global Builds... -> Pearl Global
- BeOne Medicines Plans... -> BeOne Medicines

No new D1 migration is required because companies_json already exists.

After deployment, trigger:
https://radaryum.com/api/events?window=7d&minScore=0&refresh=1&t=multicompany-fix

Then verify in D1:
SELECT title, company, companies_json, last_seen_at
FROM events
WHERE title LIKE '%Ford%Geely%'
ORDER BY last_seen_at DESC;
