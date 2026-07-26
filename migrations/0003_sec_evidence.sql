ALTER TABLE events ADD COLUMN sec_form TEXT;
ALTER TABLE events ADD COLUMN sec_relevance_score INTEGER;
ALTER TABLE events ADD COLUMN sec_matched_terms_json TEXT;
ALTER TABLE events ADD COLUMN sec_evidence_snippet TEXT;
