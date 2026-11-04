-- FB-38 (5 Nov 2026): an admin save's retry id (admin_request_log) also records a hash of what was saved.
-- Same id + same hash → a browser retry, skipped as before. Same id + DIFFERENT hash → the app answers 409
-- ("This save conflicts with an earlier one, reload") instead of silently dropping the second save.
-- Additive and idempotent: one nullable column. Rows written before this (null hash) are treated as a retry.
alter table public.admin_request_log add column if not exists payload_hash text;

-- Rollback:
--   alter table public.admin_request_log drop column if exists payload_hash;
