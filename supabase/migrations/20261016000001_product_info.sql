-- Optional "Product information" shown on the product page (like big grocery apps: storage, shelf life, origin).
-- Filled in by the owner in Admin → Products. Empty values are simply not shown — nothing is made up.
alter table public.products
  add column if not exists storage_tips text check (storage_tips is null or length(storage_tips) <= 200),
  add column if not exists shelf_life text check (shelf_life is null or length(shelf_life) <= 60),
  add column if not exists origin text check (origin is null or length(origin) <= 60);
