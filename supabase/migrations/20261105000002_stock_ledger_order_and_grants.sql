-- Reconciles the stock ledger / admin audit log of 20261105000001 (live) with the production-readiness
-- branch (5 Nov 2026). Additive and re-runnable; nothing is deleted.
--  - stock_movements gets order_id (which order moved the stock) + index.
--  - log_stock_movement(): labels from fb.stock_reason / fb.order_id / fb.actor (unlabelled changes are
--    still recorded as 'unlabelled'); a weight pack of a product sold by weight mirrors the product total,
--    so only the product row is logged — but a non-weight pack ("1 bunch") of such a product is logged.
--  - One trigger per table (drops the other branch's trigger names if a database has them).
--  - Customers can't read either table at all (was: allowed, then RLS returned no rows).

alter table public.stock_movements add column if not exists order_id uuid;
create index if not exists stock_movements_order_idx on public.stock_movements (order_id) where order_id is not null;

create or replace function public.log_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(left(current_setting('fb.stock_reason', true), 120), '');
  v_order uuid := public.fb_setting_uuid('fb.order_id');
  v_actor uuid := public.fb_setting_uuid('fb.actor');
  v_before bigint;
  v_after bigint;
begin
  if tg_table_name = 'product_variants' then
    if exists (select 1 from products p where p.id = new.product_id and p.stock_grams is not null)
       and pack_label_grams(new.label) is not null then
      return null;
    end if;
    v_before := case when tg_op = 'INSERT' then 0 else coalesce(old.stock, 0) end;
    v_after := coalesce(new.stock, 0);
    if v_before = v_after then return null; end if;
    insert into stock_movements (product_id, variant_id, unit, before, after, change, reason, order_id, actor_id)
    values (new.product_id, new.id, 'packs', v_before, v_after, v_after - v_before,
            coalesce(v_reason, case when tg_op = 'INSERT' then 'new pack' else 'unlabelled' end), v_order, v_actor);
  else
    v_before := case when tg_op = 'INSERT' then null else old.stock_grams end;
    v_after := new.stock_grams;
    if v_after is null or v_before is not distinct from v_after then return null; end if;
    insert into stock_movements (product_id, variant_id, unit, before, after, change, reason, order_id, actor_id)
    values (new.id, null, 'grams', coalesce(v_before, 0), v_after, v_after - coalesce(v_before, 0),
            coalesce(v_reason, case when tg_op = 'INSERT' then 'new product' else 'unlabelled' end), v_order, v_actor);
  end if;
  return null;
end $$;
revoke all on function public.log_stock_movement() from public, anon, authenticated;

drop trigger if exists products_log_stock on public.products;
drop trigger if exists product_variants_log_stock on public.product_variants;
drop trigger if exists stock_movement_variants on public.product_variants;
create trigger stock_movement_variants after insert or update of stock on public.product_variants
  for each row execute function public.log_stock_movement();
drop trigger if exists stock_movement_products on public.products;
create trigger stock_movement_products after insert or update of stock_grams on public.products
  for each row execute function public.log_stock_movement();

drop policy if exists "staff read the stock ledger" on public.stock_movements;
drop policy if exists "admins read the audit log" on public.admin_audit_log;
revoke all on public.stock_movements, public.admin_audit_log from anon, authenticated;
do $$ begin
  if to_regclass('public.stock_movements_id_seq') is not null then
    revoke all on sequence public.stock_movements_id_seq from anon, authenticated;
  end if;
  if to_regclass('public.admin_audit_log_id_seq') is not null then
    revoke all on sequence public.admin_audit_log_id_seq from anon, authenticated;
  end if;
end $$;

-- Rollback (by hand): re-run log_stock_movement() and the grants/policies from 20261105000001;
--   drop index if exists public.stock_movements_order_idx; (order_id column can stay: unused).
