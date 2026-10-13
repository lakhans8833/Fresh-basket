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
