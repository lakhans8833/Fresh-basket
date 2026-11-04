-- Production-readiness audit (4 Nov 2026). Additive only: two new tables and two new triggers.
-- Nothing existing is changed or deleted. Reversible — see the "Rollback" block at the end.
--
-- 1. Stock movement history (append-only). Every change to stock is recorded by a database trigger, so
--    no code path (checkout, cancellation, expiry, late payment, admin edits, SQL editor) can skip it:
--      - products sold by weight: changes to products.stock_grams (unit = 'g');
--      - products with per-pack stock: changes to product_variants.stock (unit = 'pack').
--    A weight pack's own stock is derived from the product total (derive_pack_stock), so those derived
--    updates are NOT logged again. The app labels each change with set_config('fb.stock_reason' /
--    'fb.order_id' / 'fb.actor', …, true) — transaction-local; unlabelled changes are still recorded.
-- 2. Admin audit log: who did what in Admin (method, path, result). Written by the API wrapper after each
--    admin request. Never stores request bodies, so no passwords, codes, tokens or payment secrets.

create table if not exists public.stock_movements (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  product_id uuid not null,
  variant_id uuid,
  unit text not null check (unit in ('g', 'pack')),
  delta bigint not null,
  stock_after bigint not null,
  reason text not null default 'unlabelled',
  order_id uuid,
  actor_id uuid
);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index if not exists stock_movements_order_idx on public.stock_movements (order_id) where order_id is not null;
alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from anon, authenticated;
revoke all on sequence public.stock_movements_id_seq from anon, authenticated;

-- Reads the transaction-local labels; a malformed uuid is ignored rather than failing the stock change.
create or replace function public.fb_setting_uuid(p_name text) returns uuid
language plpgsql stable set search_path = public as $$
declare v text := nullif(current_setting(p_name, true), '');
begin
  return v::uuid;
exception when others then
  return null;
end $$;

create or replace function public.log_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := coalesce(nullif(left(current_setting('fb.stock_reason', true), 40), ''), 'unlabelled');
  v_order uuid := fb_setting_uuid('fb.order_id');
  v_actor uuid := fb_setting_uuid('fb.actor');
  v_old bigint;
begin
  if tg_table_name = 'products' then
    v_old := case when tg_op = 'INSERT' then null else old.stock_grams end;
    if new.stock_grams is null or new.stock_grams is not distinct from v_old then
      return null;
    end if;
    insert into stock_movements (product_id, unit, delta, stock_after, reason, order_id, actor_id)
    values (new.id, 'g', new.stock_grams - coalesce(v_old, 0), new.stock_grams, v_reason, v_order, v_actor);
  else
    -- Weight packs mirror the product total: their change is already logged on the product.
    if exists (select 1 from products p where p.id = new.product_id and p.stock_grams is not null)
       and pack_label_grams(new.label) is not null then
      return null;
    end if;
    v_old := case when tg_op = 'INSERT' then null else old.stock end;
    if new.stock is not distinct from v_old or (tg_op = 'INSERT' and new.stock = 0) then
      return null;
    end if;
    insert into stock_movements (product_id, variant_id, unit, delta, stock_after, reason, order_id, actor_id)
    values (new.product_id, new.id, 'pack', new.stock - coalesce(v_old, 0), new.stock, v_reason, v_order, v_actor);
  end if;
  return null;
end $$;
revoke all on function public.log_stock_movement() from public, anon, authenticated;
revoke all on function public.fb_setting_uuid(text) from public, anon, authenticated;

drop trigger if exists products_log_stock on public.products;
create trigger products_log_stock after insert or update of stock_grams on public.products
  for each row execute function public.log_stock_movement();
drop trigger if exists product_variants_log_stock on public.product_variants;
create trigger product_variants_log_stock after insert or update of stock on public.product_variants
  for each row execute function public.log_stock_movement();

create table if not exists public.admin_audit_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_role text,
  method text not null,
  path text not null,
  status integer not null
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx on public.admin_audit_log (actor_id, created_at desc);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
revoke all on sequence public.admin_audit_log_id_seq from anon, authenticated;

-- Rollback (run by hand only if needed; drops the history these tables collected):
--   drop trigger if exists products_log_stock on public.products;
--   drop trigger if exists product_variants_log_stock on public.product_variants;
--   drop function if exists public.log_stock_movement();
--   drop function if exists public.fb_setting_uuid(text);
--   drop table if exists public.stock_movements;
--   drop table if exists public.admin_audit_log;
--   delete from public._fb_migrations where name = '20261104000001_stock_movements_admin_audit.sql';
