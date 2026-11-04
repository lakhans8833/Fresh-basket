-- Audit round 8 (5 Nov 2026). Two add-only history tables; nothing existing is changed or removed.
-- To undo: drop trigger stock_movement_variants on public.product_variants;
--          drop trigger stock_movement_products on public.products;
--          drop function public.log_stock_movement(); drop table public.stock_movements, public.admin_audit_log;

-- 1. Who changed what in Admin: one row per saving admin/staff API call (method, path, result, the
--    sanitised request — never passwords, tokens or codes). Written by the server only.
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,                -- no foreign key: the history stays if the account is later deleted
  actor_email text,
  actor_role text,
  method text not null,
  path text not null,
  status integer not null,
  details jsonb
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx on public.admin_audit_log (actor_id, created_at desc);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;
drop policy if exists "admins read the audit log" on public.admin_audit_log;
create policy "admins read the audit log" on public.admin_audit_log for select to authenticated using (public.is_admin());

-- 2. Stock ledger: every change of a pack's stock or a product's stock by weight, with before/after,
--    why (set by the app for the transaction: order, cancellation, admin edit, …) and who.
create table if not exists public.stock_movements (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  product_id uuid not null,     -- no foreign keys: the history stays if a product is deleted
  variant_id uuid,              -- null for stock kept by weight on the product
  unit text not null check (unit in ('packs', 'grams')),
  before bigint not null,
  after bigint not null,
  change bigint not null,
  reason text,
  actor_id uuid
);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index if not exists stock_movements_created_idx on public.stock_movements (created_at desc);
alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from anon, authenticated;
grant select on public.stock_movements to authenticated;
drop policy if exists "staff read the stock ledger" on public.stock_movements;
create policy "staff read the stock ledger" on public.stock_movements for select to authenticated using (public.is_staff());

-- Security definer so the row is written whoever changed the stock (checkout runs some steps as the
-- customer under row-level security). A bad "fb.actor" value is ignored, never an error: logging must
-- not be able to stop an order.
create or replace function public.log_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(current_setting('fb.stock_reason', true), '');
  v_actor_raw text := nullif(current_setting('fb.actor', true), '');
  v_actor uuid;
  v_before bigint;
  v_after bigint;
begin
  if v_actor_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_actor := v_actor_raw::uuid; end if;
  if tg_table_name = 'product_variants' then
    -- Packs of a product sold by weight only mirror the product's kilos (logged on the product row).
    if exists (select 1 from products where id = new.product_id and stock_grams is not null) then return null; end if;
    v_before := case when tg_op = 'INSERT' then 0 else coalesce(old.stock, 0) end;
    v_after := coalesce(new.stock, 0);
    if v_before is distinct from v_after then
      insert into stock_movements (product_id, variant_id, unit, before, after, change, reason, actor_id)
      values (new.product_id, new.id, 'packs', v_before, v_after, v_after - v_before, coalesce(v_reason, case when tg_op = 'INSERT' then 'new pack' end), v_actor);
    end if;
  else
    v_before := case when tg_op = 'INSERT' then null else old.stock_grams end;
    v_after := new.stock_grams;
    if v_before is distinct from v_after and v_after is not null then
      insert into stock_movements (product_id, variant_id, unit, before, after, change, reason, actor_id)
      values (new.id, null, 'grams', coalesce(v_before, 0), v_after, v_after - coalesce(v_before, 0), coalesce(v_reason, case when tg_op = 'INSERT' then 'new product' end), v_actor);
    end if;
  end if;
  return null;
end $$;
revoke all on function public.log_stock_movement() from public, anon, authenticated;

drop trigger if exists stock_movement_variants on public.product_variants;
create trigger stock_movement_variants after insert or update of stock on public.product_variants
  for each row execute function public.log_stock_movement();
drop trigger if exists stock_movement_products on public.products;
create trigger stock_movement_products after insert or update of stock_grams on public.products
  for each row execute function public.log_stock_movement();
