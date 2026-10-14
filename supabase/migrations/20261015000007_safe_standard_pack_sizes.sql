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
