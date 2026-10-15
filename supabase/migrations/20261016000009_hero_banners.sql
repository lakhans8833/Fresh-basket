-- Banners can now also be slides in the home page hero slider (Admin → Banners → "Where to show").
-- Existing banners stay in the offer strip. Additive only.
alter table public.promo_banners add column if not exists placement text not null default 'strip';
alter table public.promo_banners drop constraint if exists promo_banners_placement_check;
alter table public.promo_banners add constraint promo_banners_placement_check check (placement in ('strip', 'hero'));
-- Hero-only extras: the small badge above the title and the button text.
alter table public.promo_banners add column if not exists badge text check (badge is null or char_length(badge) <= 40);
alter table public.promo_banners add column if not exists cta_label text check (cta_label is null or char_length(cta_label) <= 30);
create index if not exists promo_banners_placement_idx on public.promo_banners (placement, sort_order, created_at);
