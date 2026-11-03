-- Audit round 7 (3 Nov 2026): admin saves that apply a *change* (stock "+10 since loaded") must not be
-- applied twice when the browser retries after a timeout or a partly failed save. Each save carries a
-- request id; one already in this log was saved before and is skipped. Rows older than a day are pruned.
create table public.admin_request_log (
  id uuid primary key,
  created_at timestamptz not null default now()
);
alter table public.admin_request_log enable row level security;
revoke all on public.admin_request_log from anon, authenticated;

-- Clean data that the old Inventory screen could leave: an MRP below the selling price (the product form
-- refuses to save such a pack, and the shop never shows it as a discount anyway).
update public.product_variants set mrp = null where mrp is not null and mrp < price;
