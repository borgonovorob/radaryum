ALTER TABLE events ADD COLUMN companies_json TEXT NOT NULL DEFAULT '[]';

UPDATE events
SET companies_json = CASE
  WHEN company IS NOT NULL AND TRIM(company) <> ''
    THEN json_array(company)
  ELSE '[]'
END
WHERE companies_json = '[]';
