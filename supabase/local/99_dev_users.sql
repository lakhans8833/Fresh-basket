-- LOCAL DEVELOPMENT ONLY: two sample accounts for the development login.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@freshbasket.local', '{"full_name":"Store Admin (dev)"}'),
  ('00000000-0000-4000-8000-0000000000c1', 'customer@freshbasket.local', '{"full_name":"Test Customer (dev)"}')
on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';
