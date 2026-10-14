-- Ram Avatar Fresh Basket branding + development photos for the sample catalogue.
-- Only touches values that are still the original defaults / development placeholders,
-- so anything already changed in Admin is left alone.

update public.store_settings
   set store_name = 'Ram Avatar Fresh Basket',
       tagline = 'Fresh Vegetables, Healthy Life'
 where store_name = 'Fresh Basket';

-- Category names/images from the sample seed → mockup naming.
update public.categories set name = 'Daily Vegetables', description = 'Everyday kitchen staples'
 where slug = 'everyday' and name = 'Everyday vegetables';
update public.categories set name = 'Leafy Greens', description = 'Fresh greens and herbs'
 where slug = 'leafy-greens' and name = 'Leafy greens';
update public.categories set name = 'Root Vegetables', description = 'Carrots, potatoes, beetroot and more'
 where slug = 'roots' and name = 'Roots & tubers';

update public.categories c set image_url = v.url
  from (values ('everyday', '/images/dev/cat-daily.jpg'), ('leafy-greens', '/images/dev/cat-leafy.jpg'),
               ('roots', '/images/dev/cat-roots.jpg')) as v(slug, url)
 where c.slug = v.slug and (c.image_url is null or c.image_url like '/images/dev/%');

-- Product photos: replace only development placeholders (or add when a product has none).
with photos(slug, url, alt) as (
  values
    ('tomato', '/images/dev/tomato-white.jpg', 'Fresh red tomatoes'),
    ('carrot', '/images/dev/carrot-white.jpg', 'Orange carrots with green tops'),
    ('potato', '/images/dev/potato-white.jpg', 'Potatoes'),
    ('onion', '/images/dev/onion.jpg', 'Red onions, one cut in half'),
    ('spinach', '/images/dev/spinach.jpg', 'A bunch of fresh spinach (palak)'),
    ('coriander', '/images/dev/coriander.jpg', 'A bunch of fresh coriander (dhaniya)')
),
targets as (
  select p.id, ph.url, ph.alt
    from photos ph join public.products p on p.slug = ph.slug
   where not exists (select 1 from public.product_images i where i.product_id = p.id and i.url not like '/images/dev/%')
),
cleared as (
  delete from public.product_images i using targets t where i.product_id = t.id returning i.product_id
)
insert into public.product_images (product_id, url, alt, sort_order)
select t.id, t.url, t.alt, 0 from targets t;

-- Keep the extra tomato close-up as a second photo.
insert into public.product_images (product_id, url, alt, sort_order)
select p.id, '/images/dev/tomato-closeup.jpg', 'Tomatoes, one cut in half', 1
  from public.products p
 where p.slug = 'tomato'
   and not exists (select 1 from public.product_images i where i.product_id = p.id and i.url not like '/images/dev/%')
   and not exists (select 1 from public.product_images i where i.product_id = p.id and i.url = '/images/dev/tomato-closeup.jpg');
