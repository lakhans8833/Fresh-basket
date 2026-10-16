-- WhatsApp cash-on-delivery orders start as "pending_confirmation": saved (stock reserved), but the
-- store confirms them (→ "placed") after the customer's WhatsApp message arrives, or cancels them
-- (stock returned by cancel_order). Existing rows are not changed.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending_payment', 'pending_confirmation', 'placed', 'packed', 'out_for_delivery', 'delivered', 'cancelled'));
create index if not exists orders_to_confirm_idx on public.orders (created_at) where status = 'pending_confirmation';
