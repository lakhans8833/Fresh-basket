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
