-- Business details shown on the Privacy, Terms and Returns pages. Filled in by the owner in
-- Admin → Settings → Legal & policies; pages leave out anything still empty (nothing is invented).
-- Additive only: new nullable columns, no data changed.
alter table public.store_settings
  add column if not exists legal_name text check (legal_name is null or char_length(legal_name) <= 120),
  add column if not exists legal_address text check (legal_address is null or char_length(legal_address) <= 300),
  add column if not exists legal_registration text check (legal_registration is null or char_length(legal_registration) <= 200),
  add column if not exists grievance_officer text check (grievance_officer is null or char_length(grievance_officer) <= 80),
  add column if not exists grievance_email text check (grievance_email is null or grievance_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column if not exists legal_jurisdiction text check (legal_jurisdiction is null or char_length(legal_jurisdiction) <= 80),
  add column if not exists policies_updated date;
