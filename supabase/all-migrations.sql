-- Fresh Basket: all migrations in one file, for the Supabase SQL editor (run once on a NEW project).
-- Normally not needed: migrations run automatically before each Vercel build (apps/web/scripts/migrate.mjs).

-- ===== supabase/migrations/20261014000001_schema.sql =====
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

-- ===== supabase/migrations/20261014000002_auth_and_rls.sql =====
-- Fresh Basket — profiles bootstrap, role helpers and row-level security.
--
-- The Next.js API talks to Postgres in two ways:
--   * customer-scoped reads/writes run inside a transaction that does
--       set local role authenticated; set_config('request.jwt.claims', '{"sub": "<uid>"}', true)
--     so the policies below apply exactly as they would through Supabase's REST API;
--   * privileged operations (placing orders, payments, admin) run as the database
--     owner after the API has checked the caller's role server-side.

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies can read profiles without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'anon')
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
$$;

-- ---------------------------------------------------------------------------
-- Create a profile for every new auth user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Customers may edit their own profile but never their role.
-- Runs as the invoking role (not security definer) so current_user reflects the caller.
create or replace function public.guard_profile_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role
     and current_user in ('authenticated', 'anon')
     and not public.is_admin() then
    raise exception 'Only an admin can change roles' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.store_settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.addresses enable row level security;
alter table public.delivery_areas enable row level security;
alter table public.delivery_slots enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.support_messages enable row level security;

-- Profiles
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Public catalogue & configuration (read-only for everyone, write for admins)
create policy settings_read on public.store_settings for select to anon, authenticated using (true);
create policy settings_admin on public.store_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy categories_read on public.categories for select to anon, authenticated using (active or public.is_staff());
create policy categories_admin on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy products_read on public.products for select to anon, authenticated using (active or public.is_staff());
create policy products_admin on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy product_images_read on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and (p.active or public.is_staff())));
create policy product_images_admin on public.product_images for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy variants_read on public.product_variants for select to anon, authenticated
  using ((active and exists (select 1 from public.products p where p.id = product_id and p.active)) or public.is_staff());
create policy variants_admin on public.product_variants for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy areas_read on public.delivery_areas for select to anon, authenticated using (active or public.is_staff());
create policy areas_admin on public.delivery_areas for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy slots_read on public.delivery_slots for select to anon, authenticated using (active or public.is_staff());
create policy slots_admin on public.delivery_slots for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Coupons are never listed publicly (prevents code enumeration). Validation happens in the API.
create policy coupons_admin on public.coupons for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Addresses: owner only (staff can read for fulfilment)
create policy addresses_owner on public.addresses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy addresses_staff_read on public.addresses for select to authenticated using (public.is_staff());

-- Orders: customers can read their own; nobody inserts/updates directly from a client.
-- Order creation and status changes go through the server API (database owner) only.
create policy orders_owner_read on public.orders for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy order_items_owner_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff())));
create policy order_events_owner_read on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff())));
create policy coupon_redemptions_admin on public.coupon_redemptions for select to authenticated using (public.is_admin());

-- Payments & webhook log: staff read-only
create policy payments_staff_read on public.payments for select to authenticated using (public.is_staff());
create policy payment_events_admin_read on public.payment_events for select to authenticated using (public.is_admin());

-- Newsletter & support: written by the API, read by staff
create policy newsletter_admin_read on public.newsletter_subscribers for select to authenticated using (public.is_admin());
create policy support_staff on public.support_messages for select to authenticated using (public.is_staff());
create policy support_staff_update on public.support_messages for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Grants. Supabase grants table privileges to anon/authenticated by default;
-- RLS above is what actually restricts rows. We additionally remove write
-- privileges on tables that must only be written by the server.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on public.addresses to authenticated;
grant update on public.profiles to authenticated;
grant insert, update, delete on public.categories, public.products, public.product_images,
  public.product_variants, public.delivery_areas, public.delivery_slots, public.coupons to authenticated;
grant update on public.store_settings, public.support_messages to authenticated;

revoke insert, update, delete on public.orders, public.order_items, public.order_events,
  public.payments, public.payment_events, public.coupon_redemptions, public.newsletter_subscribers from anon, authenticated;
revoke insert, delete on public.support_messages from anon, authenticated;

-- ===== supabase/migrations/20261014000003_order_functions.sql =====
-- Fresh Basket — order lifecycle functions.
-- These run inside the caller's transaction and lock the order row, so concurrent
-- webhooks / admin actions / expiry jobs are serialised per order.
-- They are NOT callable by anon/authenticated users; only the server (database owner).

-- Return reserved stock and release any coupon redemption. Idempotent.
create or replace function public.release_order_stock(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_coupon uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.stock_released then
    return;
  end if;

  update public.product_variants v
     set stock = v.stock + oi.quantity
    from public.order_items oi
   where oi.order_id = p_order_id and oi.variant_id = v.id;

  delete from public.coupon_redemptions where order_id = p_order_id returning coupon_id into v_coupon;
  if v_coupon is not null then
    update public.coupons set used_count = greatest(used_count - 1, 0) where id = v_coupon;
  end if;

  update public.orders set stock_released = true where id = p_order_id;
end $$;

-- Cancel an order (customer, admin or system). Restocks; paid orders become refund_pending.
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
           else payment_status end
   where id = p_order_id
   returning * into v_order;

  insert into public.order_events (order_id, status, note, actor)
  values (p_order_id, 'cancelled', p_reason, p_actor);

  return v_order;
end $$;

-- Cancel online-payment orders whose stock reservation has expired.
create or replace function public.release_expired_reservations() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.orders
     where status = 'pending_payment' and reservation_expires_at < now()
     order by reservation_expires_at
     for update skip locked
  loop
    perform public.cancel_order(v_id, 'system', 'Payment was not completed in time');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Record a server-verified successful payment. Safe to call many times for the
-- same payment (client verify + webhook + webhook retries).
-- Returns: 'paid' | 'already_processed' | 'paid_late' | 'refund_required' | 'amount_mismatch' | 'not_found'
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
      for v_item in select variant_id, quantity from public.order_items where order_id = p_order_id loop
        update public.product_variants
           set stock = stock - v_item.quantity
         where id = v_item.variant_id and stock >= v_item.quantity and active;
        if not found then
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

revoke all on function public.release_order_stock(uuid) from public, anon, authenticated;
revoke all on function public.cancel_order(uuid, text, text) from public, anon, authenticated;
revoke all on function public.release_expired_reservations() from public, anon, authenticated;
revoke all on function public.mark_order_paid(uuid, text, text, text, integer, text) from public, anon, authenticated;

-- ===== supabase/migrations/20261014000004_storage.sql =====
-- Fresh Basket — product image bucket (Supabase Storage).
-- Public read so images can be served by URL; only admins may upload/replace/delete.
-- Guarded so the migration also applies to a plain Postgres used for local tests.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$create policy "product images public read" on storage.objects for select to anon, authenticated using (bucket_id = 'product-images')$p$;
    execute $p$create policy "product images admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin())$p$;
    execute $p$create policy "product images admin update" on storage.objects for update to authenticated using (bucket_id = 'product-images' and public.is_admin())$p$;
    execute $p$create policy "product images admin delete" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and public.is_admin())$p$;
  end if;
end $$;

-- ===== supabase/migrations/20261015000005_ram_avatar_brand.sql =====
-- Ram Avatar Fresh Basket branding + development photos for the sample catalogue.
-- Only touches values that are still the original defaults / development placeholders,
-- so anything already changed in Admin is left alone.

update public.store_settings
   set store_name = 'Ram Avatar Fresh Basket',
       tagline = 'Fresh Vegetables, Healthy Life'
 where store_name = 'Fresh Basket';

-- Category names/images from the sample seed → mockup naming.
update public.categories set name = 'Daily Vegetables', description = 'Everyday kitchen staples'
 where slug = 'everyday' and name = 'Everyday vegetables';
update public.categories set name = 'Leafy Greens', description = 'Fresh greens and herbs'
 where slug = 'leafy-greens' and name = 'Leafy greens';
update public.categories set name = 'Root Vegetables', description = 'Carrots, potatoes, beetroot and more'
 where slug = 'roots' and name = 'Roots & tubers';

update public.categories c set image_url = v.url
  from (values ('everyday', '/images/dev/cat-daily.jpg'), ('leafy-greens', '/images/dev/cat-leafy.jpg'),
               ('roots', '/images/dev/cat-roots.jpg')) as v(slug, url)
 where c.slug = v.slug and (c.image_url is null or c.image_url like '/images/dev/%');

-- Product photos: replace only development placeholders (or add when a product has none).
with photos(slug, url, alt) as (
  values
    ('tomato', '/images/dev/tomato-white.jpg', 'Fresh red tomatoes'),
    ('carrot', '/images/dev/carrot-white.jpg', 'Orange carrots with green tops'),
    ('potato', '/images/dev/potato-white.jpg', 'Potatoes'),
    ('onion', '/images/dev/onion.jpg', 'Red onions, one cut in half'),
    ('spinach', '/images/dev/spinach.jpg', 'A bunch of fresh spinach (palak)'),
    ('coriander', '/images/dev/coriander.jpg', 'A bunch of fresh coriander (dhaniya)')
),
targets as (
  select p.id, ph.url, ph.alt
    from photos ph join public.products p on p.slug = ph.slug
   where not exists (select 1 from public.product_images i where i.product_id = p.id and i.url not like '/images/dev/%')
),
cleared as (
  delete from public.product_images i using targets t where i.product_id = t.id returning i.product_id
)
insert into public.product_images (product_id, url, alt, sort_order)
select t.id, t.url, t.alt, 0 from targets t;

-- Keep the extra tomato close-up as a second photo.
insert into public.product_images (product_id, url, alt, sort_order)
select p.id, '/images/dev/tomato-closeup.jpg', 'Tomatoes, one cut in half', 1
  from public.products p
 where p.slug = 'tomato'
   and not exists (select 1 from public.product_images i where i.product_id = p.id and i.url not like '/images/dev/%')
   and not exists (select 1 from public.product_images i where i.product_id = p.id and i.url = '/images/dev/tomato-closeup.jpg');

-- ===== supabase/migrations/20261015000006_standard_pack_sizes.sql =====
-- Standard pack sizes: 100 g, 250 g, 500 g and 1 kg for every product sold by weight.
--
-- Prices are NOT invented: a new size is priced in proportion to the product's own nearest
-- existing size (price per gram × weight), rounded UP to the next whole rupee. MRP is scaled the
-- same way when the source size has one. Stock is copied from that size — review it in Admin.
-- Products with any non-weight option (e.g. "1 bunch", "1 pc") are left untouched, and sizes
-- that already exist (including inactive ones, or "1000 g" for "1 kg") are never duplicated.

-- "500 g" -> 500, "1 kg" -> 1000, "1.5 kg" -> 1500, "1 bunch" -> null
create or replace function public.pack_label_grams(p_label text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when m[2] in ('kg', 'kgs', 'kilo', 'kilogram', 'kilograms') then round(m[1]::numeric * 1000)::integer
    when m[2] in ('g', 'gm', 'gms', 'gram', 'grams', 'gr') then round(m[1]::numeric)::integer
  end
  from (select regexp_match(lower(trim(p_label)), '^(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilograms?|g|gm|gms|grams?|gr)$') as m) s
$$;

-- Adds the missing standard sizes to one product (p_product) or to all products (null).
-- Returns the number of pack sizes added.
create or replace function public.add_standard_pack_sizes(p_product uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  sizes constant integer[] := array[100, 250, 500, 1000];
  prod record;
  src record;
  g integer;
  added integer := 0;
begin
  for prod in
    select p.id
    from products p
    where (p_product is null or p.id = p_product)
      and exists (select 1 from product_variants v where v.product_id = p.id)
      and not exists (select 1 from product_variants v where v.product_id = p.id and pack_label_grams(v.label) is null)
    order by p.id
    for update
  loop
    foreach g in array sizes loop
      continue when exists (select 1 from product_variants v where v.product_id = prod.id and pack_label_grams(v.label) = g);

      select v.price, v.mrp, v.stock, pack_label_grams(v.label) as grams
        into src
      from product_variants v
      where v.product_id = prod.id and v.active and pack_label_grams(v.label) > 0
      order by abs(pack_label_grams(v.label) - g), pack_label_grams(v.label)
      limit 1;
      continue when not found;

      insert into product_variants (product_id, label, price, mrp, stock, sort_order, active)
      values (
        prod.id,
        case when g >= 1000 then (g / 1000)::text || ' kg' else g::text || ' g' end,
        (ceil(src.price::numeric * g / src.grams / 100) * 100)::integer,
        case when src.mrp is null then null else (ceil(src.mrp::numeric * g / src.grams / 100) * 100)::integer end,
        src.stock,
        0,
        true
      );
      added := added + 1;
    end loop;

    -- Show sizes smallest first.
    update product_variants v
       set sort_order = o.rn
      from (
        select id, (row_number() over (order by pack_label_grams(label), sort_order, label) - 1)::integer as rn
        from product_variants
        where product_id = prod.id
      ) o
     where v.id = o.id and v.sort_order is distinct from o.rn;
  end loop;
  return added;
end;
$$;

revoke all on function public.add_standard_pack_sizes(uuid) from public, anon, authenticated;

-- Apply once to the current catalogue (no-op on an empty database; seed.sql calls it again).
select public.add_standard_pack_sizes(null);

-- ===== supabase/migrations/20261015000007_safe_standard_pack_sizes.sql =====
-- Make "standard pack sizes" safe for real stock.
--
-- The previous version gave every new 100 g / 250 g / 500 g / 1 kg pack the FULL stock of the pack it
-- was priced from. Stock is counted per pack, so a product with 4 kg on the shelf could sell 4 kg in
-- every size. From now on:
--   * new sizes start with stock 0 — the owner sets real stock in Admin → Inventory before they sell;
--   * prices are scaled only from active packs (unchanged rule: price per gram × weight, rounded up);
--   * existing packs' sort order is only rewritten for products that actually got a new size.
-- This migration only replaces the function. It does not run it and does not change any existing rows.

create or replace function public.add_standard_pack_sizes(p_product uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  sizes constant integer[] := array[100, 250, 500, 1000];
  prod record;
  src record;
  g integer;
  added integer := 0;
  added_here integer;
begin
  for prod in
    select p.id
    from products p
    where (p_product is null or p.id = p_product)
      and exists (select 1 from product_variants v where v.product_id = p.id)
      and not exists (select 1 from product_variants v where v.product_id = p.id and pack_label_grams(v.label) is null)
    order by p.id
    for update
  loop
    added_here := 0;
    foreach g in array sizes loop
      continue when exists (select 1 from product_variants v where v.product_id = prod.id and pack_label_grams(v.label) = g);

      select v.price, v.mrp, pack_label_grams(v.label) as grams
        into src
      from product_variants v
      where v.product_id = prod.id and v.active and pack_label_grams(v.label) > 0
      order by abs(pack_label_grams(v.label) - g), pack_label_grams(v.label)
      limit 1;
      continue when not found;

      insert into product_variants (product_id, label, price, mrp, stock, sort_order, active)
      values (
        prod.id,
        case when g >= 1000 then (g / 1000)::text || ' kg' else g::text || ' g' end,
        (ceil(src.price::numeric * g / src.grams / 100) * 100)::integer,
        case when src.mrp is null then null else (ceil(src.mrp::numeric * g / src.grams / 100) * 100)::integer end,
        0,      -- never copy stock: the same kilos can't be sold once per pack size
        (select coalesce(max(sort_order), 0) + 1 from product_variants where product_id = prod.id),
        true
      );
      added_here := added_here + 1;
    end loop;

    if added_here > 0 then
      -- Show sizes smallest first, only for products that just got a new size.
      update product_variants v
         set sort_order = o.rn
        from (
          select id, (row_number() over (order by pack_label_grams(label), sort_order, label) - 1)::integer as rn
          from product_variants
          where product_id = prod.id
        ) o
       where v.id = o.id and v.sort_order is distinct from o.rn;
    end if;
    added := added + added_here;
  end loop;
  return added;
end;
$$;

revoke all on function public.add_standard_pack_sizes(uuid) from public, anon, authenticated;

-- ===== supabase/migrations/20261015000008_dedupe_addresses.sql =====
-- Checkout's "Save this address" used to insert the address again on every order, so customers
-- could have several identical saved addresses. Remove exact duplicates (same customer, name,
-- phone, address lines and PIN code), keeping the default one, else the oldest.
-- Orders keep their own copy of the delivery address, so nothing else refers to these rows.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, pincode, phone, lower(btrim(full_name)), lower(btrim(line1)), lower(btrim(coalesce(line2, '')))
           order by is_default desc, created_at
         ) as rn
  from public.addresses
)
delete from public.addresses a
using ranked r
where a.id = r.id and r.rn > 1;

-- ===== supabase/migrations/20261015000009_promo_banners.sql =====
-- Offer banners shown in a strip on the home page, managed in Admin → Banners.
-- Links are internal paths only ("/deals", "/category/fruits"), so a banner can never send
-- customers to another website.
create table public.promo_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 60),
  subtitle text check (subtitle is null or char_length(subtitle) <= 120),
  image_url text check (image_url is null or char_length(image_url) <= 500),
  link_url text not null default '/shop' check (link_url ~ '^/[^/\\]' or link_url = '/'),
  theme text not null default 'green' check (theme in ('green', 'lime', 'amber', 'ivory')),
  active boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 999),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index promo_banners_order_idx on public.promo_banners (sort_order, created_at);

alter table public.promo_banners enable row level security;
create policy promo_banners_read on public.promo_banners for select to anon, authenticated
  using ((active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) or public.is_staff());
create policy promo_banners_admin on public.promo_banners for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.promo_banners to anon, authenticated;
grant insert, update, delete on public.promo_banners to authenticated;

-- ===== supabase/migrations/20261016000001_product_info.sql =====
-- Optional "Product information" shown on the product page (like big grocery apps: storage, shelf life, origin).
-- Filled in by the owner in Admin → Products. Empty values are simply not shown — nothing is made up.
alter table public.products
  add column if not exists storage_tips text check (storage_tips is null or length(storage_tips) <= 200),
  add column if not exists shelf_life text check (shelf_life is null or length(shelf_life) <= 60),
  add column if not exists origin text check (origin is null or length(origin) <= 60);

-- ===== supabase/migrations/20261016000002_order_fingerprint.sql =====
-- Duplicate-order guard. A double click / resubmit with a new idempotency key used to create a
-- second identical order (seen live: FB261015-01001 and -01002, 17 s apart). Each order now
-- stores a fingerprint of what was ordered (items, address, slot, date, payment, coupon); the
-- server returns the existing order when the same customer submits the same fingerprint again
-- within 2 minutes.
alter table public.orders add column if not exists request_fingerprint text;
create index if not exists orders_user_fingerprint_idx on public.orders (user_id, request_fingerprint, created_at desc)
  where request_fingerprint is not null;

-- ===== supabase/migrations/20261016000003_cod_cancelled.sql =====
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

-- ===== supabase/migrations/20261016000004_first_order_coupons.sql =====
-- "First order" coupons: valid only for a signed-in customer with no earlier order (cancelled
-- orders don't count). per_user_limit = 1 only stopped the same coupon being used twice.
alter table public.coupons add column if not exists first_order_only boolean not null default false;
update public.coupons set first_order_only = true
 where code = 'WELCOME50' or description ilike '%first order%';

-- ===== supabase/migrations/20261016000005_stock_by_weight.sql =====
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

-- ===== supabase/migrations/20261016000006_reviews_nutrition.sql =====
-- Nutrition text per product (Admin → Products) and customer reviews.
-- Reviews: only a customer with a DELIVERED order containing the product can review it (checked by
-- the server, which also records that order). New and edited reviews wait for Admin approval; only
-- approved reviews are shown, and ratings/counts are computed from those alone.

alter table public.products add column if not exists nutrition text check (nutrition is null or char_length(nutrition) <= 2000);

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index if not exists product_reviews_product_idx on public.product_reviews (product_id, status, created_at desc);
create index if not exists product_reviews_status_idx on public.product_reviews (status, created_at desc);

alter table public.product_reviews enable row level security;
drop policy if exists reviews_read_approved on public.product_reviews;
create policy reviews_read_approved on public.product_reviews for select to anon, authenticated
  using (status = 'approved' or user_id = auth.uid() or public.is_staff());
drop policy if exists reviews_admin on public.product_reviews;
create policy reviews_admin on public.product_reviews for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Customers never write this table directly: the server checks the delivered order first.

-- ===== supabase/migrations/20261016000007_stock_lock_order.sql =====
-- Stock fixes found in review.
--
-- 1. Lock order: checkout locks product rows ordered by product id, but cancel/expiry and late-payment
--    re-reserve walked items by variant id. Two such transactions on the same products could deadlock
--    (Postgres aborts one with 40P01). All loops now go in product-id order.
-- 2. Returned/re-taken grams use the pack size that was SOLD (order_items.variant_label), not the
--    variant's current label — renaming a "500 g" pack to "1 kg" can no longer inflate stock when an
--    old order is cancelled.

drop function if exists public.take_stock(uuid, integer, boolean);
create or replace function public.take_stock(p_variant uuid, p_qty integer, p_require_active boolean default false, p_label text default null)
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
  v_grams := pack_label_grams(coalesce(p_label, v_label));
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

drop function if exists public.return_stock(uuid, integer);
create or replace function public.return_stock(p_variant uuid, p_qty integer, p_label text default null)
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
  v_grams := pack_label_grams(coalesce(p_label, v_label));
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

  for v_item in
    select oi.variant_id, oi.quantity, oi.variant_label
      from public.order_items oi join public.product_variants v on v.id = oi.variant_id
     where oi.order_id = p_order_id
     order by v.product_id, oi.variant_id
  loop
    perform public.return_stock(v_item.variant_id, v_item.quantity, v_item.variant_label);
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

revoke all on function public.take_stock(uuid, integer, boolean, text) from public, anon, authenticated;
revoke all on function public.return_stock(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.release_order_stock(uuid) from public, anon, authenticated;
revoke all on function public.mark_order_paid(uuid, text, text, text, integer, text) from public, anon, authenticated;

-- ===== supabase/migrations/20261016000008_late_payment_only_after_expiry.sql =====
-- A payment that arrives after an order was cancelled used to bring the order back (re-reserve stock,
-- status "placed") whatever the reason for the cancellation — so an order the customer cancelled, or
-- the store cancelled on purpose, could be delivered anyway. Now only orders cancelled because the
-- payment window expired are revived; every other cancelled order is flagged "refund required".

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

revoke all on function public.mark_order_paid(uuid, text, text, text, integer, text) from public, anon, authenticated;

-- ===== supabase/migrations/20261016000009_hero_banners.sql =====
-- Banners can now also be slides in the home page hero slider (Admin → Banners → "Where to show").
-- Existing banners stay in the offer strip. Additive only.
alter table public.promo_banners add column if not exists placement text not null default 'strip';
alter table public.promo_banners drop constraint if exists promo_banners_placement_check;
alter table public.promo_banners add constraint promo_banners_placement_check check (placement in ('strip', 'hero'));
-- Hero-only extras: the small badge above the title and the button text.
alter table public.promo_banners add column if not exists badge text check (badge is null or char_length(badge) <= 40);
alter table public.promo_banners add column if not exists cta_label text check (cta_label is null or char_length(cta_label) <= 30);
create index if not exists promo_banners_placement_idx on public.promo_banners (placement, sort_order, created_at);

-- ===== supabase/migrations/20261017000001_whatsapp_orders_payments.sql =====
-- WhatsApp orders saved in the database, UPI (manual verification) and Razorpay Payment Links,
-- and WhatsApp order-update notifications with a send log.
--
-- REVIEW BEFORE PRODUCTION: this changes the orders table (nullable user_id for guest WhatsApp
-- orders, two new payment methods). Existing rows are not modified. Vercel preview builds don't
-- run migrations; this runs only when the change is merged and deployed to production.

-- Orders placed on WhatsApp without an account have no user (tracked by a secret link instead).
alter table public.orders alter column user_id drop not null;
-- Retries of a guest order with the same idempotency key return the same order.
create unique index if not exists orders_guest_idempotency_idx on public.orders (idempotency_key) where user_id is null;

-- Where the order came from: the website checkout or the "Order on WhatsApp" flow.
alter table public.orders add column if not exists channel text not null default 'web';
alter table public.orders drop constraint if exists orders_channel_check;
alter table public.orders add constraint orders_channel_check check (channel in ('web', 'whatsapp'));

-- Payment methods: cash on delivery, Razorpay Checkout, test payments, UPI to the store's UPI ID
-- (verified by staff against the bank statement) and Razorpay Payment Links (verified by webhook).
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('cod', 'razorpay', 'mock', 'upi', 'razorpay_link'));

-- UPI: the reference (UTR) the customer says they paid with. It is NOT proof of payment —
-- the order stays "payment pending" until staff confirm the money arrived.
alter table public.orders add column if not exists upi_reference text check (upi_reference is null or upi_reference ~ '^[A-Za-z0-9]{6,35}$');
alter table public.orders add column if not exists upi_reference_at timestamptz;

-- Razorpay Payment Link created by the server for this order's exact total.
alter table public.orders add column if not exists razorpay_payment_link_id text unique;
alter table public.orders add column if not exists razorpay_payment_link_url text;

-- Customer agreed to receive order updates on WhatsApp (unticked by default).
alter table public.orders add column if not exists whatsapp_updates boolean not null default false;

-- Manual UPI confirmations are recorded as payments too (one per UTR).
alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments add constraint payments_provider_check check (provider in ('razorpay', 'mock', 'upi_manual'));

-- Store UPI details (shown to customers at checkout; not secret).
alter table public.store_settings add column if not exists upi_id text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,200}@[A-Za-z][A-Za-z0-9.-]{1,63}$');
alter table public.store_settings add column if not exists upi_payee_name text check (upi_payee_name is null or char_length(upi_payee_name) <= 60);
alter table public.store_settings add column if not exists upi_qr_url text check (upi_qr_url is null or char_length(upi_qr_url) <= 500);

-- One row per (order, channel, event): the unique key stops duplicate notifications when a status
-- is saved twice or a webhook is retried. Failed sends can be retried a few times.
create table if not exists public.order_notifications (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  event text not null check (event in ('confirmed', 'packed', 'out_for_delivery', 'delivered')),
  status text not null check (status in ('sending', 'sent', 'failed', 'skipped')),
  recipient text,
  provider_message_id text,
  error text,
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, channel, event)
);
create index if not exists order_notifications_order_idx on public.order_notifications (order_id);
-- Server only: no client policies.
alter table public.order_notifications enable row level security;

-- ===== supabase/migrations/20261017000002_whatsapp_pending_confirmation.sql =====
-- WhatsApp cash-on-delivery orders start as "pending_confirmation": saved (stock reserved), but the
-- store confirms them (→ "placed") after the customer's WhatsApp message arrives, or cancels them
-- (stock returned by cancel_order). Existing rows are not changed.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending_payment', 'pending_confirmation', 'placed', 'packed', 'out_for_delivery', 'delivered', 'cancelled'));
create index if not exists orders_to_confirm_idx on public.orders (created_at) where status = 'pending_confirmation';

