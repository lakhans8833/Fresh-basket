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
