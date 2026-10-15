-- Duplicate-order guard. A double click / resubmit with a new idempotency key used to create a
-- second identical order (seen live: FB261015-01001 and -01002, 17 s apart). Each order now
-- stores a fingerprint of what was ordered (items, address, slot, date, payment, coupon); the
-- server returns the existing order when the same customer submits the same fingerprint again
-- within 2 minutes.
alter table public.orders add column if not exists request_fingerprint text;
create index if not exists orders_user_fingerprint_idx on public.orders (user_id, request_fingerprint, created_at desc)
  where request_fingerprint is not null;
