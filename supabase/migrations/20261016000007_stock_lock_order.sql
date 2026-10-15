-- Stock fixes found in review.
--
-- 1. Lock order: checkout locks product rows ordered by product id, but cancel/expiry and late-payment
--    re-reserve walked items by variant id. Two such transactions on the same products could deadlock
--    (Postgres aborts one with 40P01). All loops now go in product-id order.
-- 2. Returned/re-taken grams use the pack size that was SOLD (order_items.variant_label), not the
--    variant's current label — renaming a "500 g" pack to "1 kg" can no longer inflate stock when an
--    old order is cancelled.

drop function if exists public.take_stock(uuid, integer, boolean);
create or replace function public.take_stock(p_variant uuid, p_qty integer, p_require_active boolean default false, p_label text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_product uuid;
  v_label text;
  v_active boolean;
  v_total bigint;
  v_grams integer;
begin
  select product_id, label, active into v_product, v_label, v_active from product_variants where id = p_variant;
  if not found or (p_require_active and not v_active) then
    return false;
  end if;
  select stock_grams into v_total from products where id = v_product for update;
  v_grams := pack_label_grams(coalesce(p_label, v_label));
  if v_total is not null and v_grams is not null and v_grams > 0 then
    if v_total < p_qty::bigint * v_grams then
      return false;
    end if;
    update products set stock_grams = stock_grams - p_qty::bigint * v_grams where id = v_product;
    return true;
  end if;
  update product_variants set stock = stock - p_qty where id = p_variant and stock >= p_qty;
  return found;
end $$;

drop function if exists public.return_stock(uuid, integer);
create or replace function public.return_stock(p_variant uuid, p_qty integer, p_label text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_product uuid;
  v_label text;
  v_total bigint;
  v_grams integer;
begin
  select product_id, label into v_product, v_label from product_variants where id = p_variant;
  if not found then
    return;
  end if;
  select stock_grams into v_total from products where id = v_product for update;
  v_grams := pack_label_grams(coalesce(p_label, v_label));
  if v_total is not null and v_grams is not null and v_grams > 0 then
    update products set stock_grams = stock_grams + p_qty::bigint * v_grams where id = v_product;
  else
    update product_variants set stock = stock + p_qty where id = p_variant;
  end if;
end $$;

create or replace function public.release_order_stock(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_coupon uuid;
  v_item record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.stock_released then
    return;
  end if;

  for v_item in
    select oi.variant_id, oi.quantity, oi.variant_label
      from public.order_items oi join public.product_variants v on v.id = oi.variant_id
     where oi.order_id = p_order_id
     order by v.product_id, oi.variant_id
  loop
    perform public.return_stock(v_item.variant_id, v_item.quantity, v_item.variant_label);
  end loop;

  delete from public.coupon_redemptions where order_id = p_order_id returning coupon_id into v_coupon;
  if v_coupon is not null then
    update public.coupons set used_count = greatest(used_count - 1, 0) where id = v_coupon;
  end if;

  update public.orders set stock_released = true where id = p_order_id;
end $$;

create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_provider text,
  p_provider_order_id text,
  p_payment_id text,
  p_amount integer,
  p_source text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_item record;
  v_coupon uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return 'not_found';
  end if;

  insert into public.payments (order_id, provider, provider_order_id, provider_payment_id, amount, status, source)
  values (p_order_id, p_provider, p_provider_order_id, p_payment_id, p_amount, 'captured', p_source)
  on conflict (provider, provider_payment_id) do nothing;

  if v_order.payment_status in ('paid', 'refund_pending', 'refunded') then
    return 'already_processed';
  end if;

  if p_amount <> v_order.total then
    insert into public.order_events (order_id, status, note, actor)
    values (p_order_id, v_order.status, format('Payment %s amount %s does not match order total %s — needs review', p_payment_id, p_amount, v_order.total), 'system');
    return 'amount_mismatch';
  end if;

  if v_order.status = 'pending_payment' then
    update public.orders
       set status = 'placed', payment_status = 'paid', paid_at = now(), reservation_expires_at = null
     where id = p_order_id;
    insert into public.order_events (order_id, status, note, actor)
    values (p_order_id, 'placed', 'Payment confirmed', 'system');
    return 'paid';
  end if;

  if v_order.status = 'cancelled' and v_order.stock_released then
    -- Payment arrived after the reservation expired: try to re-reserve stock.
    begin
      -- Same lock order as checkout (products by id), and the pack size that was actually sold.
      for v_item in
        select oi.variant_id, oi.quantity, oi.variant_label
          from public.order_items oi join public.product_variants v on v.id = oi.variant_id
         where oi.order_id = p_order_id
         order by v.product_id, oi.variant_id
      loop
        if not public.take_stock(v_item.variant_id, v_item.quantity, true, v_item.variant_label) then
          raise exception 'insufficient_stock';
        end if;
      end loop;

      if v_order.coupon_id is not null then
        insert into public.coupon_redemptions (coupon_id, order_id, user_id)
        values (v_order.coupon_id, p_order_id, v_order.user_id)
        on conflict (order_id) do nothing
        returning coupon_id into v_coupon;
        if v_coupon is not null then
          update public.coupons set used_count = used_count + 1 where id = v_coupon;
        end if;
      end if;

      update public.orders
         set status = 'placed', payment_status = 'paid', paid_at = now(),
             stock_released = false, cancelled_reason = null
       where id = p_order_id;
      insert into public.order_events (order_id, status, note, actor)
      values (p_order_id, 'placed', 'Payment confirmed after reservation expired; stock re-reserved', 'system');
      return 'paid_late';
    exception when others then
      update public.orders set payment_status = 'refund_pending', paid_at = now() where id = p_order_id;
      insert into public.order_events (order_id, status, note, actor)
      values (p_order_id, 'cancelled', 'Payment received after expiry but items are out of stock — refund required', 'system');
      return 'refund_required';
    end;
  end if;

  if v_order.status = 'cancelled' then
    update public.orders set payment_status = 'refund_pending', paid_at = now() where id = p_order_id;
    insert into public.order_events (order_id, status, note, actor)
    values (p_order_id, 'cancelled', 'Payment received for a cancelled order — refund required', 'system');
    return 'refund_required';
  end if;

  update public.orders set payment_status = 'paid', paid_at = now() where id = p_order_id;
  return 'paid';
end $$;

revoke all on function public.take_stock(uuid, integer, boolean, text) from public, anon, authenticated;
revoke all on function public.return_stock(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.release_order_stock(uuid) from public, anon, authenticated;
revoke all on function public.mark_order_paid(uuid, text, text, text, integer, text) from public, anon, authenticated;
