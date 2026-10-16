-- Pack labels like "500 g" pasted from a website can contain a NON-BREAKING space (U+00A0) or a thin
-- space. The website (JavaScript) read those labels as 500 g, but pack_label_grams() did not, so a
-- product's shared weight stock and its packs went out of step (shown "in stock" but not sellable).
-- Now the database treats every kind of space as a plain space, and existing labels are cleaned up.
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
  from (
    select regexp_match(
      lower(trim(regexp_replace(translate(p_label, U&'\00A0\2007\202F\2009\200A', '     '), '\s+', ' ', 'g'))),
      '^(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilograms?|g|gm|gms|grams?|gr)$'
    ) as m
  ) s
$$;

-- Clean existing labels (the stock-by-weight trigger re-derives each pack's stock on update).
update public.product_variants
   set label = btrim(regexp_replace(translate(label, U&'\00A0\2007\202F\2009\200A', '     '), '\s+', ' ', 'g'))
 where label <> btrim(regexp_replace(translate(label, U&'\00A0\2007\202F\2009\200A', '     '), '\s+', ' ', 'g'));
