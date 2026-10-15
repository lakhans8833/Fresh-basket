import "server-only";
import type { AdminBannerInput, PromoBanner } from "@freshbasket/shared";
import { query, queryOne } from "./db";
import { notFound } from "./http";

type Row = {
  id: string; title: string; subtitle: string | null; image_url: string | null; link_url: string;
  theme: PromoBanner["theme"]; active: boolean; sort_order: number; starts_at: Date | null; ends_at: Date | null;
  placement?: "strip" | "hero"; badge?: string | null; cta_label?: string | null;
};

const toBanner = (r: Row): PromoBanner => ({
  id: r.id, title: r.title, subtitle: r.subtitle, imageUrl: r.image_url, linkUrl: r.link_url, theme: r.theme,
  placement: r.placement ?? "strip", badge: r.badge ?? null, ctaLabel: r.cta_label ?? null,
});

/** Banners customers should see right now (active and inside their optional date window). */
export async function listActiveBanners(limit = 8, placement: "strip" | "hero" = "strip"): Promise<PromoBanner[]> {
  const rows = await query<Row>(
    `select * from promo_banners
      where active and placement = $2 and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
      order by sort_order, created_at limit $1`,
    [limit, placement],
  );
  return rows.map(toBanner);
}

export type AdminBanner = PromoBanner & { active: boolean; sortOrder: number; startsAt: string | null; endsAt: string | null; live: boolean };

export async function adminListBanners(): Promise<AdminBanner[]> {
  const rows = await query<Row & { live: boolean }>(
    `select *, (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) as live
       from promo_banners order by sort_order, created_at`,
  );
  return rows.map((r) => ({
    ...toBanner(r), active: r.active, sortOrder: r.sort_order, live: r.live,
    startsAt: r.starts_at ? r.starts_at.toISOString() : null, endsAt: r.ends_at ? r.ends_at.toISOString() : null,
  }));
}

export async function adminSaveBanner(id: string | null, b: AdminBannerInput) {
  const p = [b.title, b.subtitle ?? null, b.imageUrl ?? null, b.linkUrl, b.theme, b.active, b.sortOrder, b.startsAt ?? null, b.endsAt ?? null,
    b.placement ?? "strip", b.badge?.trim() || null, b.ctaLabel?.trim() || null];
  const r = id
    ? await queryOne<{ id: string }>(
        `update promo_banners set title=$1, subtitle=$2, image_url=$3, link_url=$4, theme=$5, active=$6, sort_order=$7,
                starts_at=$8, ends_at=$9, placement=$10, badge=$11, cta_label=$12, updated_at=now() where id=$13 returning id`,
        [...p, id],
      )
    : await queryOne<{ id: string }>(
        `insert into promo_banners (title, subtitle, image_url, link_url, theme, active, sort_order, starts_at, ends_at, placement, badge, cta_label)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
        p,
      );
  if (!r) throw notFound("Banner not found.");
  return { id: r.id };
}

export async function adminDeleteBanner(id: string) {
  const r = await queryOne<{ id: string }>("delete from promo_banners where id = $1 returning id", [id]);
  if (!r) throw notFound("Banner not found.");
}
