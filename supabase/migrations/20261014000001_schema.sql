-- Fresh Basket — core schema
-- Money is stored as integer paise. Times are timestamptz; business dates are IST calendar dates.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'staff', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- Store settings (single row)
-- ---------------------------------------------------------------------------
create table public.store_settings (
  id boolean primary key default true check (id),
  store_name text not null default 'Fresh Basket',
  tagline text not null default '',
  logo_url text,
  support_phone text,
  support_email text,
  whatsapp text,
  address text,
  support_hours text,
  instagram_url text,
  facebook_url text,
  youtube_url text,
  x_url text,
  cod_enabled boolean not null default true,
  default_min_order integer not null default 0 check (default_min_order >= 0),
  slot_days_ahead integer not null default 3 check (slot_days_ahead between 1 and 14),
  announcement text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  image_url text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category_id uuid not null references public.categories (id) on delete restrict,
  description text,
  highlights text[] not null default '{}',
  seasonal boolean not null default false,
  featured boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id) where active;
create index products_name_idx on public.products (lower(name));

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url text not null,
  alt text,
  sort_order integer not null default 0
);
create index product_images_product_idx on public.product_images (product_id, sort_order);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label text not null,
  price integer not null check (price >= 0),
  mrp integer check (mrp is null or mrp >= 0),
  -- The CHECK is the last line of defence against overselling.
  stock integer not null default 0 check (stock >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants (product_id, sort_order);

-- ---------------------------------------------------------------------------
-- Customers' saved addresses
-- ---------------------------------------------------------------------------
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null default 'Home',
  full_name text not null,
  phone text not null,
  line1 text not null,
  line2 text,
  landmark text,
  city text not null,
  state text not null,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);
create unique index addresses_one_default on public.addresses (user_id) where is_default;

-- ---------------------------------------------------------------------------
-- Delivery configuration
-- ---------------------------------------------------------------------------
create table public.delivery_areas (
  id uuid primary key default gen_random_uuid(),
  pincode text not null unique check (pincode ~ '^[1-9][0-9]{5}$'),
  area_name text not null,
  city text not null,
  fee integer not null default 0 check (fee >= 0),
  free_above integer check (free_above is null or free_above >= 0),
  min_order integer not null default 0 check (min_order >= 0),
  active boolean not null default true
);

create table public.delivery_slots (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  start_time time not null,
  end_time time not null,
  cutoff_minutes integer not null default 60 check (cutoff_minutes >= 0),
  capacity integer not null default 50 check (capacity > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  check (start_time < end_time)
);

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9]{3,32}$'),
  description text,
  kind text not null check (kind in ('percent', 'flat')),
  value integer not null check (value > 0),
  min_order integer not null default 0 check (min_order >= 0),
  max_discount integer check (max_discount is null or max_discount >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_user_limit integer check (per_user_limit is null or per_user_limit > 0),
  used_count integer not null default 0 check (used_count >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100)
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default (
    'FB' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 5, '0')
  ),
  user_id uuid not null references public.profiles (id) on delete restrict,
  status text not null check (status in ('pending_payment', 'placed', 'packed', 'out_for_delivery', 'delivered', 'cancelled')),
  payment_method text not null check (payment_method in ('cod', 'razorpay', 'mock')),
  payment_status text not null check (payment_status in ('pending', 'paid', 'failed', 'cod_pending', 'cod_collected', 'refund_pending', 'refunded')),
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  coupon_id uuid references public.coupons (id) on delete set null,
  coupon_code text,
  delivery_fee integer not null default 0 check (delivery_fee >= 0),
  total integer not null check (total >= 0),
  delivery_date date not null,
  slot_id uuid references public.delivery_slots (id) on delete set null,
  slot_label text not null,
  address jsonb not null,
  customer_note text,
  idempotency_key text not null,
  reservation_expires_at timestamptz,
  stock_released boolean not null default false,
  razorpay_order_id text unique,
  paid_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (total = subtotal - discount + delivery_fee)
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_slot_idx on public.orders (delivery_date, slot_id) where status <> 'cancelled';
create index orders_expiry_idx on public.orders (reservation_expires_at) where status = 'pending_payment';

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null,
  variant_label text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total integer not null check (line_total = unit_price * quantity),
  image_url text
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  status text not null,
  note text,
  actor text not null default 'system',
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index coupon_redemptions_user_idx on public.coupon_redemptions (coupon_id, user_id);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'mock')),
  provider_order_id text,
  provider_payment_id text not null,
  amount integer not null,
  status text not null,
  source text not null, -- 'client_verify' | 'webhook'
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index payments_order_idx on public.payments (order_id);

-- Every webhook delivery is stored once; duplicates are ignored by the unique key.
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  result text,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- ---------------------------------------------------------------------------
-- Newsletter + support
-- ---------------------------------------------------------------------------
create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);
create unique index newsletter_email_uniq on public.newsletter_subscribers (lower(email));

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  order_number text,
  message text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
create trigger variants_touch before update on public.product_variants for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.store_settings for each row execute function public.touch_updated_at();
