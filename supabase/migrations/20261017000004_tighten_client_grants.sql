-- Tighter direct-database (Supabase REST) rights. The website does all of this through its own server,
-- so nothing in the app changes; this only closes doors for someone calling the Supabase API directly.

-- Customers may change only their name and phone on their profile — not the email the admin panel
-- shows (or any other column). Roles were already protected by a trigger.
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- Product sizes: only admins may create/change/delete them directly (staff use the admin panel).
drop policy if exists variants_admin on public.product_variants;
create policy variants_admin on public.product_variants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Support messages: staff may only change the status, not rewrite what the customer wrote.
revoke update on public.support_messages from authenticated;
grant update (status) on public.support_messages to authenticated;
