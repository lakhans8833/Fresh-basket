-- Production-readiness audit (4 Nov 2026), part 2. No data is changed or deleted.
--
-- 1. UPI orders whose customer reported a UTR (payment reference) are no longer auto-cancelled as
--    "payment failed" when their hold expires: the money may well have arrived. They stay reserved for
--    48 hours after the UTR was sent, shown on the Admin dashboard ("UPI payments to check"), so staff can
--    check the bank and confirm (or cancel with a refund). After 48 h unchecked they expire as before.
--    release_expired_reservations() is otherwise unchanged (same lock order as 20261031000001).
-- 2. Indexes for foreign keys on tables that grow with every order (order_items → product/variant,
--    orders → coupon): used by "has this product/pack been ordered?" checks and ON DELETE SET NULL scans,
--    which otherwise read every order line while holding the product row lock checkout needs.
-- 3. Column-level read grants. RLS limits WHICH ROWS a signed-in customer can read through the Supabase
--    API, not which columns: customers could read staff ids (order_events.actor, order_adjustments
--    .created_by / done_by) and internal order fields (idempotency key, request fingerprint, payment
--    preparation token). Customers keep every other column of their own rows.

create or replace function public.release_expired_reservations() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_status text;
  v_count integer := 0;
begin
  select coalesce(array_agg(id order by reservation_expires_at), '{}') into v_ids
    from (
      select id, reservation_expires_at from public.orders
       where status in ('pending_payment', 'pending_confirmation') and reservation_expires_at < now()
         -- A customer-reported UPI payment waits for staff to check the bank (up to 48 h after the UTR).
         and not (payment_method = 'upi' and upi_reference is not null
                  and coalesce(upi_reference_at, now()) > now() - interval '48 hours')
       order by reservation_expires_at
       for update skip locked
    ) o;
  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  -- Same lock order as checkout: products (by id), then their packs, then coupons (by id).
  perform 1 from public.products p
   where p.id in (select v.product_id from public.order_items oi join public.product_variants v on v.id = oi.variant_id
                   where oi.order_id = any(v_ids))
   order by p.id for update;
  perform 1 from public.product_variants v
   where v.id in (select oi.variant_id from public.order_items oi where oi.order_id = any(v_ids))
   order by v.id for update;
  perform 1 from public.coupons c
   where c.id in (select cr.coupon_id from public.coupon_redemptions cr where cr.order_id = any(v_ids))
   order by c.id for update;

  foreach v_id in array v_ids loop
    select status into v_status from public.orders where id = v_id;
    perform public.cancel_order(
      v_id, 'system',
      case when v_status = 'pending_payment' then 'Payment was not completed in time'
           else 'Not confirmed by the store in time' end);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.release_expired_reservations() from public, anon, authenticated;

create index if not exists order_items_variant_idx on public.order_items (variant_id);
create index if not exists order_items_product_idx on public.order_items (product_id);
create index if not exists orders_coupon_idx on public.orders (coupon_id) where coupon_id is not null;

-- Column grants: all current columns except the internal ones listed here.
do $$
declare
  t record;
  cols text;
begin
  for t in
    select * from (values
      ('orders', array['idempotency_key', 'request_fingerprint', 'payment_prep_token', 'payment_prep_at']),
      ('order_events', array['actor']),
      ('order_adjustments', array['created_by', 'done_by'])
    ) as x(tbl, hidden)
  loop
    if to_regclass('public.' || t.tbl) is null then
      continue;
    end if;
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = t.tbl and column_name <> all (t.hidden);
    execute format('revoke select on public.%I from authenticated', t.tbl);
    execute format('grant select (%s) on public.%I to authenticated', cols, t.tbl);
  end loop;
end $$;

-- Rollback (by hand, only if needed):
--   grant select on public.orders, public.order_events, public.order_adjustments to authenticated;
--   drop index if exists public.order_items_variant_idx, public.order_items_product_idx, public.orders_coupon_idx;
--   and re-run release_expired_reservations() from 20261031000001_release_lock_order_and_order_numbers.sql.
