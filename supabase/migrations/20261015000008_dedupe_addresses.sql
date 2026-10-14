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
