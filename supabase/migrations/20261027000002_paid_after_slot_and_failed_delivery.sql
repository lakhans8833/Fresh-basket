-- Deep check 27 Oct 2026.
-- 1. mark_order_paid: a payment confirmed in time for its stock hold but after the booked delivery
--    window ended (or after the delivery date) no longer leaves a "placed" order for a past slot: the
--    order is kept and moved to "delivery time agreed on WhatsApp", today or later (same as a late payment).
--    Everything else is unchanged from 20261023000001.
-- 2. cancel_order: the store (actor "admin:…") can cancel an order that is out for delivery when the
--    customer refused it or couldn't be reached; its stock is returned. Customers still can't.

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
  v_coupon public.coupons;
  v_coupon_id uuid;
  v_slot public.delivery_slots;
  v_n integer;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_reason text;
  v_slot_note text;
  v_detail text;
  v_new_payment boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return 'not_found';
  end if;

  insert into public.payments (order_id, provider, provider_order_id, provider_payment_id, amount, status, source)
  values (p_order_id, p_provider, p_provider_order_id, p_payment_id, p_amount, 'captured', p_source)
  on conflict (provider, provider_payment_id) do nothing;
  v_new_payment := found;

  -- A payment id already recorded for ANOTHER order is never reused to pay this one.
  if not v_new_payment and exists (
    select 1 from public.payments
     where provider = p_provider and provider_payment_id = p_payment_id and order_id <> p_order_id
  ) then
    insert into public.order_events (order_id, status, note, actor)
    values (p_order_id, v_order.status, format('Payment %s belongs to another order — not applied, needs review', p_payment_id), 'system');
    return 'payment_reused';
  end if;

  if v_order.payment_status in ('paid', 'refund_pending', 'refunded') then
    -- A second, different payment for an order that is already paid: flag it so staff refund it.
    if v_new_payment then
      insert into public.order_events (order_id, status, note, actor)
      values (p_order_id, v_order.status, format('Second payment %s (%s paise) received for an order that was already paid — refund required', p_payment_id, p_amount), 'system');
      return 'duplicate_payment';
    end if;
    return 'already_processed';
  end if;

  if p_amount <> v_order.total then
    insert into public.order_events (order_id, status, note, actor)
    values (p_order_id, v_order.status, format('Payment %s amount %s does not match order total %s — needs review', p_payment_id, p_amount, v_order.total), 'system');
    return 'amount_mismatch';
  end if;

  if v_order.status = 'pending_payment' then
    -- Paid in time for the hold, but the booked delivery window may already be over (UPI/payment-link
    -- holds last up to 24 h; staff may verify a UPI payment late): don't promise a past slot — keep the
    -- order, deliver today or later at a time agreed with the customer, like a late payment.
    v_slot_note := null;
    if v_order.delivery_date < v_today then
      v_slot_note := 'the delivery date had passed';
    elsif v_order.slot_id is not null then
      select * into v_slot from public.delivery_slots where id = v_order.slot_id;
      if found and now() >= ((v_order.delivery_date + v_slot.end_time) at time zone 'Asia/Kolkata') then
        v_slot_note := 'the delivery slot had ended';
      end if;
    end if;
    if v_slot_note is null then
      update public.orders
         set status = 'placed', payment_status = 'paid', paid_at = now(), reservation_expires_at = null
       where id = p_order_id;
      insert into public.order_events (order_id, status, note, actor)
      values (p_order_id, 'placed', 'Payment confirmed', 'system');
    else
      update public.orders
         set status = 'placed', payment_status = 'paid', paid_at = now(), reservation_expires_at = null,
             slot_id = null, delivery_date = greatest(v_order.delivery_date, v_today), slot_label = 'Delivery time confirmed on WhatsApp'
       where id = p_order_id;
      insert into public.order_events (order_id, status, note, actor)
      values (p_order_id, 'placed',
              format('Payment confirmed. %s, so the store will agree a new delivery time with you.', initcap(left(v_slot_note, 1)) || substr(v_slot_note, 2)),
              'system');
    end if;
    return 'paid';
  end if;

  if v_order.status = 'cancelled' and v_order.stock_released and v_order.cancelled_reason = 'Payment was not completed in time' then
    begin
      -- 1. Every item must still exist and be sellable. No inner join: a missing variant/product fails.
      select count(*) into v_n
        from public.order_items oi
        left join public.product_variants v on v.id = oi.variant_id
        left join public.products p on p.id = v.product_id
        left join public.categories c on c.id = p.category_id
       where oi.order_id = p_order_id
         and (v.id is null or not v.active or p.id is null or not p.active or c.id is null or not c.active);
      if v_n > 0 then
        raise exception 'revival_blocked' using detail = 'an item in the order is no longer available';
      end if;

      -- 2. Stock, same lock order as checkout (products by id), with the pack size that was sold.
      for v_item in
        select oi.variant_id, oi.quantity, oi.variant_label
          from public.order_items oi join public.product_variants v on v.id = oi.variant_id
         where oi.order_id = p_order_id
         order by v.product_id, oi.variant_id
      loop
        if not public.take_stock(v_item.variant_id, v_item.quantity, true, v_item.variant_label) then
          raise exception 'revival_blocked' using detail = 'items are out of stock';
        end if;
      end loop;

      -- 3. Coupon: locked and re-validated, this order excluded from its own counts.
      if v_order.coupon_id is null and v_order.discount > 0 then
        raise exception 'revival_blocked' using detail = 'the coupon used no longer exists';
      end if;
      if v_order.coupon_id is not null then
        select * into v_coupon from public.coupons where id = v_order.coupon_id for update;
        if not found then
          raise exception 'revival_blocked' using detail = 'the coupon used no longer exists';
        end if;
        if not v_coupon.active or (v_coupon.ends_at is not null and v_coupon.ends_at < now()) then
          raise exception 'revival_blocked' using detail = format('coupon %s is no longer valid', v_coupon.code);
        end if;
        if v_coupon.usage_limit is not null then
          select count(*) into v_n from public.coupon_redemptions where coupon_id = v_coupon.id and order_id <> p_order_id;
          if greatest(v_n, v_coupon.used_count) >= v_coupon.usage_limit then
            raise exception 'revival_blocked' using detail = format('coupon %s has reached its usage limit', v_coupon.code);
          end if;
        end if;
        if v_coupon.per_user_limit is not null and v_order.user_id is not null then
          select count(*) into v_n from public.coupon_redemptions
           where coupon_id = v_coupon.id and user_id = v_order.user_id and order_id <> p_order_id;
          if v_n >= v_coupon.per_user_limit then
            raise exception 'revival_blocked' using detail = format('coupon %s was already used by this customer', v_coupon.code);
          end if;
        end if;
        if coalesce(v_coupon.first_order_only, false) then
          select count(*) into v_n from public.orders
           where user_id = v_order.user_id and status <> 'cancelled' and id <> p_order_id;
          if v_order.user_id is null or v_n > 0 then
            raise exception 'revival_blocked' using detail = format('coupon %s is for a first order only', v_coupon.code);
          end if;
        end if;
        insert into public.coupon_redemptions (coupon_id, order_id, user_id)
        values (v_coupon.id, p_order_id, v_order.user_id)
        on conflict (order_id) do nothing
        returning coupon_id into v_coupon_id;
        if v_coupon_id is not null then
          update public.coupons set used_count = used_count + 1 where id = v_coupon_id;
        end if;
      end if;

      -- 4. Delivery slot (locked last, like checkout). Not usable → no slot, today, agreed with customer.
      v_slot_note := null;
      if v_order.slot_id is not null then
        select * into v_slot from public.delivery_slots where id = v_order.slot_id for update;
        if not found or not v_slot.active then
          v_slot_note := 'the delivery slot is no longer offered';
        elsif v_order.delivery_date < v_today then
          v_slot_note := 'the delivery date had passed';
        elsif now() >= ((v_order.delivery_date + v_slot.start_time) at time zone 'Asia/Kolkata') - make_interval(mins => v_slot.cutoff_minutes) then
          v_slot_note := 'the delivery slot had closed';
        else
          select count(*) into v_n from public.orders
           where slot_id = v_order.slot_id and delivery_date = v_order.delivery_date and status <> 'cancelled' and id <> p_order_id;
          if v_n >= v_slot.capacity then
            v_slot_note := 'the delivery slot was full';
          end if;
        end if;
      elsif v_order.delivery_date < v_today then
        v_slot_note := 'the delivery date had passed';
      end if;

      if v_slot_note is null then
        update public.orders
           set status = 'placed', payment_status = 'paid', paid_at = now(), stock_released = false, cancelled_reason = null
         where id = p_order_id;
        insert into public.order_events (order_id, status, note, actor)
        values (p_order_id, 'placed', 'Payment confirmed after reservation expired; stock re-reserved', 'system');
      else
        update public.orders
           set status = 'placed', payment_status = 'paid', paid_at = now(), stock_released = false, cancelled_reason = null,
               slot_id = null, delivery_date = greatest(v_order.delivery_date, v_today), slot_label = 'Delivery time confirmed on WhatsApp'
         where id = p_order_id;
        insert into public.order_events (order_id, status, note, actor)
        values (p_order_id, 'placed',
                format('Payment confirmed after reservation expired; stock re-reserved. %s, so the store will agree a new delivery time with you.', initcap(left(v_slot_note, 1)) || substr(v_slot_note, 2)),
                'system');
      end if;
      return 'paid_late';
    exception when others then
      -- Nothing above is kept (stock, coupon). Keep the order cancelled; flag the captured payment.
      get stacked diagnostics v_detail = pg_exception_detail;
      v_reason := case when sqlerrm = 'revival_blocked' then coalesce(nullif(v_detail, ''), 'the order can no longer be fulfilled') else 'the order could not be restored' end;
      update public.orders set payment_status = 'refund_pending', paid_at = now() where id = p_order_id;
      insert into public.order_events (order_id, status, note, actor)
      values (p_order_id, 'cancelled', format('Payment received after expiry but %s — refund required', v_reason), 'system');
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

create or replace function public.cancel_order(p_order_id uuid, p_actor text, p_reason text)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_captured boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.status = 'cancelled' then
    return v_order; -- idempotent
  end if;
  -- Out for delivery: only the store can cancel (customer refused / not reachable) — the goods come
  -- back, so their stock is returned. Delivered orders can never be cancelled.
  if v_order.status = 'delivered' or (v_order.status = 'out_for_delivery' and p_actor not like 'admin:%') then
    raise exception 'Order can no longer be cancelled' using errcode = 'P0001';
  end if;

  select exists (select 1 from public.payments where order_id = p_order_id and status = 'captured') into v_captured;

  perform public.release_order_stock(p_order_id);

  update public.orders
     set status = 'cancelled',
         cancelled_reason = p_reason,
         reservation_expires_at = null,
         payment_status = case
           when payment_status = 'paid' then 'refund_pending'
           when payment_status = 'pending' and v_captured then 'refund_pending'
           when payment_status = 'pending' then 'failed'
           when payment_status = 'cod_pending' then 'cod_cancelled'
           else payment_status end
   where id = p_order_id
   returning * into v_order;

  insert into public.order_events (order_id, status, note, actor)
  values (p_order_id, 'cancelled', p_reason, p_actor);
  if v_captured and v_order.payment_status = 'refund_pending' and v_order.paid_at is null then
    insert into public.order_events (order_id, status, note, actor)
    values (p_order_id, 'cancelled', 'A captured payment exists for this unpaid order — refund required', 'system');
  end if;

  return v_order;
end $$;
revoke all on function public.cancel_order(uuid, text, text) from public, anon, authenticated;
