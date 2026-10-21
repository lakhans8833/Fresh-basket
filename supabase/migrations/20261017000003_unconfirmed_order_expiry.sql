-- WhatsApp cash-on-delivery orders hold stock while "pending_confirmation". If the store doesn't confirm
-- them in time (reservation_expires_at, set when the order is saved), they are cancelled like unpaid
-- online orders, so fake or forgotten orders can't keep stock and delivery slots blocked.
-- The cancel reason differs from 'Payment was not completed in time', so mark_order_paid never revives them.
create or replace function public.release_expired_reservations() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_status text;
  v_count integer := 0;
begin
  for v_id, v_status in
    select id, status from public.orders
     where status in ('pending_payment', 'pending_confirmation') and reservation_expires_at < now()
     order by reservation_expires_at
     for update skip locked
  loop
    perform public.cancel_order(
      v_id, 'system',
      case when v_status = 'pending_payment' then 'Payment was not completed in time'
           else 'Not confirmed by the store in time' end);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

drop index if exists public.orders_expiry_idx;
create index if not exists orders_expiry_idx on public.orders (reservation_expires_at)
  where status in ('pending_payment', 'pending_confirmation');
revoke all on function public.release_expired_reservations() from public, anon, authenticated;
