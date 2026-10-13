-- Fresh Basket — order lifecycle functions.
-- These run inside the caller's transaction and lock the order row, so concurrent
-- webhooks / admin actions / expiry jobs are serialised per order.
-- They are NOT callable by anon/authenticated users; only the server (database owner).

-- Return reserved stock and release any coupon redemption. Idempotent.
create or replace function public.release_order_stock(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_coupon uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.stock_released then
    return;
  end if;

  update public.product_variants v
     set stock = v.stock + oi.quantity
    from public.order_items oi
   where oi.order_id = p_order_id and oi.variant_id = v.id;

  delete from public.coupon_redemptions where order_id = p_order_id returning coupon_id into v_coupon;
  if v_coupon is not null then
    update public.coupons set used_count = greatest(used_count - 1, 0) where id = v_coupon;
  end if;

  update public.orders set stock_released = true where id = p_order_id;
end $$;

-- Cancel an order (customer, admin or system). Restocks; paid orders become refund_pending.
create or replace function public.cancel_order(p_order_id uuid, p_actor text, p_reason text)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.status = 'cancelled' then
    return v_order; -- idempotent
  end if;
  if v_order.status in ('out_for_delivery', 'delivered') then
    raise exception 'Order can no longer be cancelled' using errcode = 'P0001';
  end if;

  perform public.release_order_stock(p_order_id);

  update public.orders
     set status = 'cancelled',
         cancelled_reason = p_reason,
         reservation_expires_at = null,
         payment_status = case
           when payment_status = 'paid' then 'refund_pending'
           when payment_status = 'pending' then 'failed'
           else payment_status end
   where id = p_order_id
   returning * into v_order;

  insert into public.order_events (order_id, status, note, actor)
  values (p_order_id, 'cancelled', p_reason, p_actor);

  return v_order;
end $$;

-- Cancel online-payment orders whose stock reservation has expired.
create or replace function public.release_expired_reservations() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.orders
     where status = 'pending_payment' and reservation_expires_at < now()
     order by reservation_expires_at
     for update skip locked
  loop
    perform public.cancel_order(v_id, 'system', 'Payment was not completed in time');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Record a server-verified successful payment. Safe to call many times for the
-- same payment (client verify + webhook + webhook retries).
-- Returns: 'paid' | 'already_processed' | 'paid_late' | 'refund_required' | 'amount_mismatch' | 'not_found'
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
      for v_item in select variant_id, quantity from public.order_items where order_id = p_order_id loop
        update public.product_variants
           set stock = stock - v_item.quantity
         where id = v_item.variant_id and stock >= v_item.quantity and active;
        if not found then
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

revoke all on function public.release_order_stock(uuid) from public, anon, authenticated;
revoke all on function public.cancel_order(uuid, text, text) from public, anon, authenticated;
revoke all on function public.release_expired_reservations() from public, anon, authenticated;
revoke all on function public.mark_order_paid(uuid, text, text, text, integer, text) from public, anon, authenticated;
