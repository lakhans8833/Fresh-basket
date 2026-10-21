-- What the customer wants if an item can't be supplied (out of stock at packing, poor quality):
--   'call'   → the store calls/messages before changing anything (no substitute, no extra charge
--              without the customer's OK);
--   'remove' → leave the item out; the customer pays only for what is delivered (refund if prepaid).
-- There is deliberately NO "substitute automatically" option. Orders placed before this column
-- existed keep NULL ("not asked").
alter table public.orders add column if not exists unavailable_item_preference text
  check (unavailable_item_preference is null or unavailable_item_preference in ('call', 'remove'));
