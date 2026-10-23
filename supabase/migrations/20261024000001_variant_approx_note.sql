-- Optional short note per pack size shown to shoppers, e.g. "approx 6–8 pcs" for 1 kg of bananas or
-- "approx 400–600 g" for 1 cauliflower (what BigBasket shows next to a pack). Adds a nullable column only.
alter table public.product_variants
  add column if not exists note text check (note is null or char_length(note) <= 40);
