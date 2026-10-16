-- Late payments: reviving an expired order is now validated completely and atomically.
--
-- Before: mark_order_paid() re-took stock (checking only variant.active, and silently skipping items
-- whose variant row was gone), re-redeemed the coupon without checking its limits, and set the order
-- back to "placed" on its old date/slot. The app then tried to fix past dates/closed slots in a
-- background callback after the payment had committed.
--
-- Now, inside the same transaction that revives the order (lock order as checkout: order → products
-- → variants → coupon → slot):
--   1. every order item must still exist and be sellable (variant, product and category active);
--   2. stock is re-taken with the pack label that was sold;
--   3. the coupon (if any) is locked and re-checked: still exists and active, not expired, global
--      usage limit, per-customer limit and first-order rule — the order being revived is excluded from
--      its own counts (its redemption was removed when it expired);
--   4. the delivery slot row is locked and re-checked (active, cutoff, capacity, date not past). If the
--      slot can't be used, the order is revived WITHOUT a slot for today ("delivery time to be agreed",
--      the same state as WhatsApp orders without a slot) and an order event explains it.
-- If 1–3 fail, everything is rolled back (no stock or coupon change), the order stays cancelled and the
-- captured payment is flagged refund_pending for a refund / manual review. The paid amount is never
-- changed. Idempotency is unchanged: one payments row per provider payment id, and a payment for an
-- order that is already paid / refund-pending returns 'already_processed'.

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
               slot_id = null, delivery_date = v_today, slot_label = 'Delivery time confirmed on WhatsApp'
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
