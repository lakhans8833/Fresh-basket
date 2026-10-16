-- Customers could update ANY column of their own profile through the Supabase API (table-level UPDATE
-- grant), including `email`. The admin panel and the ADMIN_EMAILS deploy bootstrap trusted that column,
-- so a customer could pose as the owner's address. Now customers may change only their name and phone;
-- identity fields (id, email, role, timestamps) are written only by the server.
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- Repair any profile email that no longer matches its Supabase Auth account (the source of truth).
do $$
begin
  if to_regclass('auth.users') is not null then
    update public.profiles p set email = u.email
      from auth.users u
     where u.id = p.id and p.email is distinct from u.email;
  end if;
end $$;
