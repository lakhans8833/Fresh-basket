-- Fresh Basket — DEVELOPMENT SEED DATA
-- Prices, stock, PIN codes, slots and coupons below are SAMPLE values for testing.
-- Images under /images/dev/ are development assets cropped from the design reference.
-- Review everything in the admin panel before going live.

insert into public.store_settings (id, store_name, tagline, cod_enabled, default_min_order, slot_days_ahead)
values (true, 'Ram Avatar Fresh Basket', 'Fresh Vegetables, Healthy Life', true, 9900, 3)
on conflict (id) do nothing;

insert into public.categories (slug, name, description, image_url, sort_order) values
  ('everyday', 'Daily Vegetables', 'Everyday kitchen staples', '/images/dev/cat-daily.jpg', 1),
  ('leafy-greens', 'Leafy Greens', 'Fresh greens and herbs', '/images/dev/cat-leafy.jpg', 2),
  ('roots', 'Root Vegetables', 'Carrots, potatoes, beetroot and more', '/images/dev/cat-roots.jpg', 3),
  ('gourds', 'Gourds & squashes', 'Pumpkin, cucumber and gourds', '/images/dev/cat-seasonal.jpg', 4)
on conflict (slug) do nothing;

-- Products -------------------------------------------------------------------
with c as (select id, slug from public.categories)
insert into public.products (slug, name, category_id, description, highlights, seasonal, featured) values
  ('tomato', 'Tomato', (select id from c where slug = 'everyday'),
   'Firm, red tomatoes for curries, salads and chutneys. Sold by weight; individual pieces vary in size.',
   array['Sold by weight', 'Store at room temperature'], false, true),
  ('carrot', 'Carrot', (select id from c where slug = 'roots'),
   'Crunchy orange carrots for salads, halwa and stir-fries.',
   array['Sold by weight', 'Refrigerate after delivery'], true, true),
  ('broccoli', 'Broccoli', (select id from c where slug = 'everyday'),
   'Green broccoli heads for stir-fries, soups and steaming.',
   array['Sold by weight', 'Refrigerate after delivery'], true, true),
  ('potato', 'Potato', (select id from c where slug = 'roots'),
   'All-purpose potatoes for sabzi, fries and parathas.',
   array['Sold by weight', 'Store in a cool, dark place'], false, true),
  ('onion', 'Onion', (select id from c where slug = 'everyday'),
   'Everyday red onions.', array['Sold by weight'], false, false),
  ('spinach', 'Spinach (Palak)', (select id from c where slug = 'leafy-greens'),
   'Fresh palak leaves, sold by the bunch weight.', array['Wash before use'], true, false),
  ('coriander', 'Coriander', (select id from c where slug = 'leafy-greens'),
   'Coriander leaves for garnish and chutney.', array['Wash before use'], false, false),
  ('pumpkin', 'Pumpkin', (select id from c where slug = 'gourds'),
   'Cut pumpkin pieces for sabzi and soups.', array['Sold by weight'], true, false),
  ('cucumber', 'Cucumber', (select id from c where slug = 'gourds'),
   'Cucumbers for salads and raita.', array['Sold by weight'], false, false),
  ('capsicum', 'Capsicum (Green)', (select id from c where slug = 'everyday'),
   'Green bell peppers.', array['Sold by weight'], false, false),
  ('ladies-finger', 'Ladies finger (Bhindi)', (select id from c where slug = 'everyday'),
   'Tender bhindi for fry and curry.', array['Sold by weight'], false, false),
  ('beetroot', 'Beetroot', (select id from c where slug = 'roots'),
   'Beetroot for salads, juices and poriyal.', array['Sold by weight'], false, false)
on conflict (slug) do nothing;

insert into public.product_images (product_id, url, alt, sort_order)
select p.id, i.url, i.alt, i.sort_order
from (values
  ('tomato', '/images/dev/tomato-white.jpg', 'Fresh red tomatoes', 0),
  ('tomato', '/images/dev/tomato-closeup.jpg', 'Tomatoes, one cut in half', 1),
  ('carrot', '/images/dev/carrot-white.jpg', 'Orange carrots with green tops', 0),
  ('broccoli', '/images/dev/broccoli.jpg', 'A head of broccoli', 0),
  ('potato', '/images/dev/potato-white.jpg', 'Potatoes', 0),
  ('onion', '/images/dev/onion.jpg', 'Red onions, one cut in half', 0),
  ('spinach', '/images/dev/spinach.jpg', 'A bunch of fresh spinach (palak)', 0),
  ('coriander', '/images/dev/coriander.jpg', 'A bunch of fresh coriander (dhaniya)', 0)
) as i(slug, url, alt, sort_order)
join public.products p on p.slug = i.slug
where not exists (select 1 from public.product_images x where x.product_id = p.id);

insert into public.product_variants (product_id, label, price, mrp, stock, sort_order)
select p.id, v.label, v.price, v.mrp, v.stock, v.sort_order
from (values
  ('tomato', '500 g', 3200, null::integer, 80, 0), ('tomato', '1 kg', 6000, null, 50, 1),
  ('carrot', '500 g', 4500, null, 60, 0), ('carrot', '1 kg', 8500, null, 30, 1),
  ('broccoli', '500 g', 8900, null, 25, 0),
  ('potato', '500 g', 3800, null, 100, 0), ('potato', '1 kg', 7000, null, 80, 1), ('potato', '2 kg', 13500, null, 40, 2),
  ('onion', '1 kg', 4800, null, 120, 0), ('onion', '2 kg', 9200, null, 60, 1),
  ('spinach', '250 g', 2500, null, 4, 0),
  ('coriander', '100 g', 1500, null, 40, 0),
  ('pumpkin', '500 g', 2000, null, 30, 0), ('pumpkin', '1 kg', 3800, null, 15, 1),
  ('cucumber', '500 g', 3000, null, 45, 0),
  ('capsicum', '250 g', 2800, null, 0, 0), ('capsicum', '500 g', 5200, null, 0, 1),
  ('ladies-finger', '250 g', 2200, null, 35, 0), ('ladies-finger', '500 g', 4200, null, 20, 1),
  ('beetroot', '500 g', 3500, null, 30, 0)
) as v(slug, label, price, mrp, stock, sort_order)
join public.products p on p.slug = v.slug
where not exists (select 1 from public.product_variants x where x.product_id = p.id);

-- Delivery (SAMPLE PIN codes) ---------------------------------------------------
insert into public.delivery_areas (pincode, area_name, city, fee, free_above, min_order) values
  ('560034', 'Koramangala', 'Bengaluru', 2500, 49900, 9900),
  ('560095', 'Koramangala 6th Block', 'Bengaluru', 2500, 49900, 9900),
  ('560038', 'Indiranagar', 'Bengaluru', 3000, 59900, 14900),
  ('560102', 'HSR Layout', 'Bengaluru', 3000, 59900, 14900)
on conflict (pincode) do nothing;

insert into public.delivery_slots (label, start_time, end_time, cutoff_minutes, capacity, sort_order)
select * from (values
  ('Morning', time '07:00', time '10:00', 600, 40, 1),
  ('Afternoon', time '12:00', time '15:00', 120, 40, 2),
  ('Evening', time '17:00', time '20:00', 120, 40, 3)
) v(label, start_time, end_time, cutoff_minutes, capacity, sort_order)
where not exists (select 1 from public.delivery_slots);

-- Coupons (SAMPLE) --------------------------------------------------------------
insert into public.coupons (code, description, kind, value, min_order, max_discount, per_user_limit) values
  ('WELCOME50', '₹50 off your first order above ₹299', 'flat', 5000, 29900, null, 1),
  ('FRESH10', '10% off orders above ₹199, up to ₹75', 'percent', 10, 19900, 7500, null)
on conflict (code) do nothing;
