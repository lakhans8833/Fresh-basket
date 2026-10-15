-- Cancelled cash-on-delivery orders kept payment_status 'cod_pending' ("Cash on delivery"), which
-- reads as money still to collect. They now get 'cod_cancelled' (nothing to collect).
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('pending', 'paid', 'failed', 'cod_pending', 'cod_collected', 'cod_cancelled', 'refund_pending', 'refunded'));

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
           when payment_status = 'cod_pending' then 'cod_cancelled'
           else payment_status end
   where id = p_order_id
   returning * into v_order;

  insert into public.order_events (order_id, status, note, actor)
  values (p_order_id, 'cancelled', p_reason, p_actor);

  return v_order;
end $$;
revoke all on function public.cancel_order(uuid, text, text) from public, anon, authenticated;

-- Existing cancelled COD orders.
update public.orders set payment_status = 'cod_cancelled' where status = 'cancelled' and payment_status = 'cod_pending';
