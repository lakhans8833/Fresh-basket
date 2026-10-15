-- Stock by weight.
-- Before: every pack size had its own stock, so a product could show 100 g / 250 g "out of stock"
-- while 25 kg sat in the 1 kg pack. Now products sold by weight keep ONE total in grams
-- (products.stock_grams) and each weight pack's stock is derived from it:
--   Apple 25 kg -> 100 g: 250, 250 g: 100, 500 g: 50, 1 kg: 25 packs available.
-- Selling a pack takes its grams from the total; cancelling gives them back.
-- Products with non-weight packs ("1 bunch", "1 pc") keep per-pack stock (stock_grams is null).
--
-- Concurrency: take_stock()/return_stock() lock the product row before touching its packs, and
-- checkout locks products before packs, so concurrent orders can neither oversell nor deadlock.

alter table public.products add column if not exists stock_grams bigint check (stock_grams is null or stock_grams >= 0);

-- A weight pack's stock always mirrors the product total (enforced in the database).
create or replace function public.derive_pack_stock() returns trigger
language plpgsql set search_path = public as $$
declare
  v_total bigint;
  v_grams integer;
begin
  select stock_grams into v_total from products where id = new.product_id;
  v_grams := pack_label_grams(new.label);
  if v_total is not null and v_grams is not null and v_grams > 0 then
    new.stock := least(v_total / v_grams, 2147483647)::integer;
  end if;
  return new;
end $$;

drop trigger if exists product_variants_derive_stock on public.product_variants;
create trigger product_variants_derive_stock before insert or update on public.product_variants
  for each row execute function public.derive_pack_stock();

-- When the total changes, refresh every pack (the trigger above recomputes each one).
create or replace function public.refresh_pack_stock() returns trigger
language plpgsql set search_path = public as $$
begin
  update product_variants set stock = stock where product_id = new.id;
  return null;
end $$;

drop trigger if exists products_refresh_pack_stock on public.products;
create trigger products_refresh_pack_stock after insert or update of stock_grams on public.products
  for each row when (new.stock_grams is not null) execute function public.refresh_pack_stock();

-- Take p_qty packs of a variant: from the product total for weight products, else from the pack.
-- Returns false (and changes nothing) when there isn't enough. Locks the product row first.
create or replace function public.take_stock(p_variant uuid, p_qty integer, p_require_active boolean default false)
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
  v_grams := pack_label_grams(v_label);
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

-- Give p_qty packs back (cancellation / expired reservation).
create or replace function public.return_stock(p_variant uuid, p_qty integer)
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
  v_grams := pack_label_grams(v_label);
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

  for v_item in select variant_id, quantity from public.order_items where order_id = p_order_id and variant_id is not null order by variant_id loop
    perform public.return_stock(v_item.variant_id, v_item.quantity);
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
      for v_item in select variant_id, quantity from public.order_items where order_id = p_order_id order by variant_id loop
        if not public.take_stock(v_item.variant_id, v_item.quantity, true) then
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

revoke all on function public.take_stock(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.return_stock(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_order_stock(uuid) from public, anon, authenticated;
revoke all on function public.mark_order_paid(uuid, text, text, text, integer, text) from public, anon, authenticated;

-- Switch every product whose packs are all weights ("100 g", "1 kg") to a total in grams.
-- Starting total = the largest stock any single pack had (packs were often copies of the same
-- stock, so adding them up would overstate it). Check totals in Admin → Inventory.
update public.products p
   set stock_grams = s.total
  from (
    select v.product_id, max(v.stock::bigint * pack_label_grams(v.label)) as total
      from public.product_variants v
     group by v.product_id
    having bool_and(pack_label_grams(v.label) is not null)
  ) s
 where s.product_id = p.id and p.stock_grams is null;
