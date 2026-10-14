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
