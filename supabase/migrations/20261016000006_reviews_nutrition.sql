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
