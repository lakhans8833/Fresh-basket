-- Fresh Basket — product image bucket (Supabase Storage).
-- Public read so images can be served by URL; only admins may upload/replace/delete.
-- Guarded so the migration also applies to a plain Postgres used for local tests.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$create policy "product images public read" on storage.objects for select to anon, authenticated using (bucket_id = 'product-images')$p$;
    execute $p$create policy "product images admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin())$p$;
    execute $p$create policy "product images admin update" on storage.objects for update to authenticated using (bucket_id = 'product-images' and public.is_admin())$p$;
    execute $p$create policy "product images admin delete" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and public.is_admin())$p$;
  end if;
end $$;
