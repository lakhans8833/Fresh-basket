-- Audit round 6 (31 Oct 2026).
--
-- 1. release_expired_reservations() cancelled expired orders one by one, so the product rows of
--    several orders were locked in "order by order" sequence, not by product id. A checkout that
--    locks the same products in id order could deadlock with it ("deadlock detected" → 500).
--    Now every product (then coupon) touched by the expired orders is locked up front in id order —
--    the same order checkout, payment revival and inventory edits use — before anything is cancelled.
-- 2. Order numbers: lpad(n, 5) cuts numbers above 99 999 to 5 characters ("100007" → "10000"), so
--    after that many orders numbers would repeat and checkouts fail on the unique index.

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

create or replace function public.next_order_number() returns text
language plpgsql set search_path = public as $$
declare
  n bigint := nextval('public.order_number_seq');
begin
  return 'FB' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-' || lpad(n::text, greatest(5, length(n::text)), '0');
end $$;

alter table public.orders alter column order_number set default public.next_order_number();
revoke all on function public.next_order_number() from public, anon, authenticated;
