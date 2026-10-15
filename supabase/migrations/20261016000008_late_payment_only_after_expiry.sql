-- A payment that arrives after an order was cancelled used to bring the order back (re-reserve stock,
-- status "placed") whatever the reason for the cancellation — so an order the customer cancelled, or
-- the store cancelled on purpose, could be delivered anyway. Now only orders cancelled because the
-- payment window expired are revived; every other cancelled order is flagged "refund required".

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

  if v_order.status = 'cancelled' and v_order.stock_released and v_order.cancelled_reason = 'Payment was not completed in time' then
    -- Payment arrived after the reservation EXPIRED: try to re-reserve stock. Orders the customer or
    -- the store cancelled on purpose are never revived — they fall through to "refund required".
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

revoke all on function public.mark_order_paid(uuid, text, text, text, integer, text) from public, anon, authenticated;
