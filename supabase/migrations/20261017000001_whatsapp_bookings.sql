-- WhatsApp bookings: an order request saved on the server BEFORE WhatsApp opens.
-- Opening WhatsApp (or the customer sending the message) never confirms a booking by itself:
-- every booking starts as 'pending_confirmation' and the shop confirms it in Admin → WhatsApp bookings.
-- Prices and totals are computed on the server from the live price list (never from the browser).

create sequence if not exists public.booking_number_seq start 1001;

create table if not exists public.whatsapp_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_number text not null unique default (
    'WB' || to_char((now() at time zone 'Asia/Kolkata'), 'YYMMDD') || '-' || lpad(nextval('public.booking_number_seq')::text, 5, '0')
  ),
  -- Signed-in customer (optional: WhatsApp booking works without an account).
  user_id uuid references public.profiles (id) on delete set null,
  idempotency_key text not null unique,
  request_fingerprint text not null,
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled')),
  payment_method text not null check (payment_method in ('upi_qr', 'razorpay_link', 'cod')),
  -- 'paid' only after a verified confirmation: Razorpay webhook (signature checked) for payment links,
  -- or staff recording the UPI reference / cash received. Never set by the customer's browser.
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  customer_name text not null check (char_length(customer_name) between 2 and 80),
  customer_phone text not null check (customer_phone ~ '^[6-9][0-9]{9}$'),
  address_line text not null check (char_length(address_line) between 5 and 200),
  area text,
  city text not null,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  delivery_notes text,
  delivery_date date not null,
  slot_id uuid references public.delivery_slots (id) on delete set null,
  slot_label text not null,
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  delivery_fee integer not null default 0 check (delivery_fee >= 0),
  total integer not null check (total >= 0),
  -- Stock is taken when the shop confirms the booking (not when WhatsApp opens), and returned on cancel.
  stock_taken boolean not null default false,
  razorpay_link_id text unique,
  razorpay_link_url text,
  payment_reference text,
  paid_at timestamptz,
  paid_by uuid references public.profiles (id) on delete set null,
  cancelled_reason text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total = subtotal - discount + delivery_fee),
  check (payment_status <> 'paid' or paid_at is not null)
);

create index if not exists whatsapp_bookings_status_idx on public.whatsapp_bookings (status, created_at desc);
create index if not exists whatsapp_bookings_slot_idx on public.whatsapp_bookings (delivery_date, slot_id) where status <> 'cancelled';
create index if not exists whatsapp_bookings_fingerprint_idx on public.whatsapp_bookings (request_fingerprint, created_at desc);
create index if not exists whatsapp_bookings_phone_idx on public.whatsapp_bookings (customer_phone, created_at desc);

create table if not exists public.whatsapp_booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.whatsapp_bookings (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  variant_label text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0 and quantity <= 99),
  line_total integer not null check (line_total = unit_price * quantity),
  image_url text
);
create index if not exists whatsapp_booking_items_booking_idx on public.whatsapp_booking_items (booking_id);

create table if not exists public.whatsapp_booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.whatsapp_bookings (id) on delete cascade,
  status text not null,
  note text,
  actor text not null default 'system',
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_booking_events_booking_idx on public.whatsapp_booking_events (booking_id, created_at);

-- Private data: only the server (database owner) reads/writes these tables. No client policies at all.
alter table public.whatsapp_bookings enable row level security;
alter table public.whatsapp_booking_items enable row level security;
alter table public.whatsapp_booking_events enable row level security;
revoke all on public.whatsapp_bookings, public.whatsapp_booking_items, public.whatsapp_booking_events from anon, authenticated;

-- UPI QR payments: the shop's UPI ID and payee name (Admin → Settings).
alter table public.store_settings add column if not exists upi_id text;
alter table public.store_settings add column if not exists upi_payee_name text;
