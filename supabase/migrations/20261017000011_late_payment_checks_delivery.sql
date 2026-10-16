-- A payment that arrives after an order's reservation expired used to revive the order after
-- re-taking stock only — without checking that delivery is still possible. The order could come back
-- for a past date, a slot that was switched off, past its cutoff, or into a slot that had filled up in
-- the meantime. Now the revival also checks date, active slot, cutoff and capacity (under the slot row
-- lock, like checkout). If delivery isn't possible the order stays cancelled, nothing is re-reserved,
-- and the captured payment is flagged "refund pending" for the store to refund or review.
-- Webhook idempotency is unchanged: the payment row is still recorded once per provider payment id and
-- an already-processed payment returns 'already_processed'.

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
  v_slot public.delivery_slots;
  v_booked integer;
  v_problem text;
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

      -- Delivery must still be possible, checked AFTER the stock rows are locked (same lock order as
      -- checkout: products → variants → slot). The slot row lock serialises this with checkouts, which
      -- lock the same row before counting, so capacity can't be exceeded by a late payment.
      if v_order.delivery_date < (now() at time zone 'Asia/Kolkata')::date then
        raise exception 'delivery_unavailable' using detail = 'the delivery date has passed';
      end if;
      if v_order.slot_id is not null then
        select * into v_slot from public.delivery_slots where id = v_order.slot_id for update;
        if not found or not v_slot.active then
          raise exception 'delivery_unavailable' using detail = 'the delivery slot is no longer offered';
        end if;
        if now() >= ((v_order.delivery_date + v_slot.start_time) at time zone 'Asia/Kolkata')
                    - make_interval(mins => v_slot.cutoff_minutes) then
          raise exception 'delivery_unavailable' using detail = 'the delivery slot has closed';
        end if;
        select count(*) into v_booked from public.orders
         where slot_id = v_order.slot_id and delivery_date = v_order.delivery_date and status <> 'cancelled';
        if v_booked >= v_slot.capacity then
          raise exception 'delivery_unavailable' using detail = 'the delivery slot is full';
        end if;
      end if;

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
      -- Everything above (stock taken, coupon) is rolled back; the order stays cancelled and the
      -- captured payment (already recorded in payments) is flagged for a refund / manual review.
      get stacked diagnostics v_problem = pg_exception_detail;
      update public.orders set payment_status = 'refund_pending', paid_at = now() where id = p_order_id;
      insert into public.order_events (order_id, status, note, actor)
      values (p_order_id, 'cancelled',
              case when sqlerrm = 'delivery_unavailable'
                   then format('Payment received after expiry but %s — refund required', v_problem)
                   else 'Payment received after expiry but items are out of stock — refund required' end,
              'system');
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
