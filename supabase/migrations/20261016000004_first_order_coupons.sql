-- "First order" coupons: valid only for a signed-in customer with no earlier order (cancelled
-- orders don't count). per_user_limit = 1 only stopped the same coupon being used twice.
alter table public.coupons add column if not exists first_order_only boolean not null default false;
update public.coupons set first_order_only = true
 where code = 'WELCOME50' or description ilike '%first order%';
