-- After-delivery problems (31 Oct 2026): the returns policy promises a refund or a replacement for items
-- that arrive missing, damaged, spoiled or wrong. Staff record it on the order; the customer sees it on
-- the order page. Refunds are money leaving the shop: only an admin records and closes them (server
-- rule, see lib/admin/adjustments.ts). Rows are written only by the server (owner role).

create table public.order_adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('refund', 'replacement')),
  -- [{ "itemId": uuid, "name": text, "label": text, "quantity": int }] — a snapshot of the affected items
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 50),
  -- refund: paise to give back (> 0); replacement: 0
  amount integer not null default 0 check (amount >= 0 and amount <= 10000000),
  reason text not null check (char_length(reason) between 3 and 300),
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_by text not null,
  created_at timestamptz not null default now(),
  done_by text,
  done_at timestamptz,
  check ((kind = 'refund' and amount > 0) or (kind = 'replacement' and amount = 0)),
  check ((status = 'done') = (done_at is not null))
);
create index order_adjustments_order_idx on public.order_adjustments (order_id, created_at);

alter table public.order_adjustments enable row level security;
create policy order_adjustments_owner_read on public.order_adjustments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff())));
revoke insert, update, delete on public.order_adjustments from anon, authenticated;
grant select on public.order_adjustments to authenticated;
