import "server-only";
import type { z } from "zod";
import type { adminCategorySchema, AdminProductInput } from "@freshbasket/shared";
import { noteStock, query, queryOne, tx } from "../db";
import { currentActor } from "../request-context";
import type { PoolClient } from "pg";
import { badRequest, conflict, notFound } from "../http";
import { packGrams } from "@freshbasket/shared";

export async function adminListCategories() {
  return query(
    `select c.id, c.slug, c.name, c.description, c.image_url as "imageUrl", c.sort_order as "sortOrder", c.active,
            (select count(*)::int from products p where p.category_id = c.id) as "productCount"
       from categories c order by c.sort_order, c.name`,
  );
}

export async function adminSaveCategory(id: string | null, d: z.output<typeof adminCategorySchema>) {
  const params = [d.name, d.slug, d.description ?? null, d.imageUrl ?? null, d.sortOrder, d.active];
  if (id) {
    const r = await queryOne("update categories set name=$1, slug=$2, description=$3, image_url=$4, sort_order=$5, active=$6 where id=$7 returning id", [...params, id]);
    if (!r) throw notFound();
    return r;
  }
  return queryOne("insert into categories (name, slug, description, image_url, sort_order, active) values ($1,$2,$3,$4,$5,$6) returning id", params);
}

export async function adminDeleteCategory(id: string) {
  const r = await queryOne<{ n: number }>("select count(*)::int as n from products where category_id = $1", [id]);
  if ((r?.n ?? 0) > 0) throw conflict("Move or delete this category's products first. You can also just hide the category.");
  await query("delete from categories where id = $1", [id]);
}

export async function adminListProducts(q?: string | null) {
  const params: unknown[] = [];
  let where = "";
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where = "where lower(p.name) like $1";
  }
  return query(
    `select p.id, p.slug, p.name, p.active, p.featured, p.seasonal, c.name as "categoryName",
            p.stock_grams::float8 as "stockGrams",
            (select url from product_images i where i.product_id = p.id order by sort_order limit 1) as "imageUrl",
            (select coalesce(json_agg(json_build_object('id', v.id, 'label', v.label, 'price', v.price, 'stock', v.stock, 'active', v.active) order by v.sort_order), '[]')
               from product_variants v where v.product_id = p.id) as variants
       from products p join categories c on c.id = p.category_id ${where}
      order by p.name`,
    params,
  );
}

export async function adminGetProduct(id: string) {
  const p = await queryOne(
    `select id, slug, name, category_id as "categoryId", description, highlights, storage_tips as "storageTips", shelf_life as "shelfLife", origin, nutrition,
            seasonal, featured, active, stock_grams::float8 as "stockGrams" from products where id = $1`,
    [id],
  );
  if (!p) throw notFound();
  const images = await query(`select url, alt from product_images where product_id = $1 order by sort_order`, [id]);
  const variants = await query(
    `select id, label, price, mrp, stock, sort_order as "sortOrder", active, note,
            exists(select 1 from order_items oi where oi.variant_id = v.id) as "hasOrders"
       from product_variants v where product_id = $1 order by sort_order, price`,
    [id],
  );
  return { ...p, images, variants };
}

/**
 * Create or update a product with its images and weight variants in one transaction.
 * Variants referenced by past orders are deactivated rather than deleted.
 */
/** A save with this request id was already applied (browser retry): true → skip it. Prunes old ids now and then. */
async function alreadyApplied(c: PoolClient, requestId: string | undefined): Promise<boolean> {
  if (!requestId) return false;
  if (Math.random() < 0.02) await c.query("delete from admin_request_log where created_at < now() - interval '1 day'");
  const r = await c.query("insert into admin_request_log (id) values ($1) on conflict do nothing", [requestId]);
  return r.rowCount === 0;
}

export async function adminSaveProduct(id: string | null, d: AdminProductInput) {
  return tx(async (c) => {
    await noteStock(c, "product saved in Admin", currentActor()?.id);
    if (id && (await alreadyApplied(c, d.requestId))) return { id }; // the same save was applied before (retry)
    let productId = id;
    // Stock pool before this save (null = stock counted per pack), locked so a sale can't slip in between.
    const before = id
      ? (await c.query<{ g: string | null }>("select stock_grams::text as g from products where id = $1 for update", [id])).rows[0]?.g ?? null
      : null;
    const switchingToPerPack = before !== null && d.stockGrams === null;
    const fields = [d.name, d.slug, d.categoryId, d.description ?? null, d.highlights, d.seasonal, d.featured, d.active];
    if (productId) {
      const r = await c.query(
        "update products set name=$1, slug=$2, category_id=$3, description=$4, highlights=$5, seasonal=$6, featured=$7, active=$8 where id=$9",
        [...fields, productId],
      );
      if (r.rowCount === 0) throw notFound();
    } else {
      const r = await c.query<{ id: string }>(
        "insert into products (name, slug, category_id, description, highlights, seasonal, featured, active) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
        fields,
      );
      productId = r.rows[0]!.id;
    }

    // Product information: only touch a field when the request includes it (older clients don't send these).
    const info: [string, string | null | undefined][] = [["storage_tips", d.storageTips], ["shelf_life", d.shelfLife], ["origin", d.origin], ["nutrition", d.nutrition]];
    for (const [col, val] of info) {
      if (val === undefined) continue;
      await c.query(`update products set ${col} = $1 where id = $2`, [val?.trim() ? val.trim() : null, productId]);
    }

    await c.query("delete from product_images where product_id = $1", [productId]);
    for (const [i, img] of d.images.entries()) {
      await c.query("insert into product_images (product_id, url, alt, sort_order) values ($1,$2,$3,$4)", [productId, img.url, img.alt ?? null, i]);
    }

    // Switching from "total stock in kg" to stock per pack: clear the total FIRST. While it is set, the
    // database derives every weight pack's stock from it and ignores the per-pack numbers typed in;
    // cleared afterwards, each pack would keep its derived count and the same kilos would sell several times.
    if (d.stockGrams === null) await c.query("update products set stock_grams = null where id = $1", [productId]);

    const keep: string[] = [];
    for (const [i, v] of d.variants.entries()) {
      if (v.id) {
        const r = await c.query(
          // Stock: apply only what the admin changed, on top of today's stock (sales meanwhile stay counted).
          // Price / MRP / on-off: a value the admin left as loaded keeps what the database has now, so a
          // change made meanwhile (Inventory, another admin) isn't silently undone.
          `update product_variants set label=$1,
                  price = case when $11::int is not null and $2 = $11::int then price else $2 end,
                  mrp = case when $12::boolean and $3::int is not distinct from $13::int then mrp else $3::int end,
                  stock = case when $9::int is null then $4 else greatest(0, stock + ($4 - $9::int)) end,
                  sort_order=$5,
                  active = case when $14::boolean is not null and $6 = $14::boolean then active else $6 end,
                  note=$10
            where id=$7 and product_id=$8`,
          // Switching to per-pack stock: the numbers typed are the new stock as is (the old pack counts were
          // only derived from the shared kilos, so "change since loaded" means nothing here).
          [v.label, v.price, v.mrp ?? null, v.stock, i, v.active, v.id, productId, switchingToPerPack ? null : (v.stockLoaded ?? null), v.note ?? null,
            v.priceLoaded ?? null, v.mrpLoaded !== undefined, v.mrpLoaded ?? null, v.activeLoaded ?? null],
        );
        if (r.rowCount === 1) {
          keep.push(v.id);
          continue;
        }
      }
      const r = await c.query<{ id: string }>(
        "insert into product_variants (product_id, label, price, mrp, stock, sort_order, active, note) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
        [productId, v.label, v.price, v.mrp ?? null, v.stock, i, v.active, v.note ?? null],
      );
      keep.push(r.rows[0]!.id);
    }
    // Removed variants: delete if never ordered, otherwise hide.
    await c.query(
      `delete from product_variants v where v.product_id = $1 and not (v.id = any($2::uuid[]))
         and not exists (select 1 from order_items oi where oi.variant_id = v.id)`,
      [productId, keep],
    );
    await c.query("update product_variants set active = false where product_id = $1 and not (id = any($2::uuid[]))", [productId, keep]);
    if (switchingToPerPack) {
      // The same kilos must not be sold several times: packs of a weight together may hold at most the
      // kilos that were in stock (each pack was showing its share of the SAME total).
      const grams = d.variants.reduce((sum, v) => sum + (v.active !== false ? (packGrams(v.label) ?? 0) * v.stock : 0), 0);
      if (grams > Number(before)) {
        throw badRequest(
          `Stock is now counted per pack. Enter how many of each pack you have — together they can't be more than the ${Number(before) / 1000} kg in stock. (Got new stock? Save this first, then add it.)`,
        );
      }
    }
    if (d.stockGrams != null) {
      // Only sizes on sale matter: a hidden size without a weight is kept for old orders, not sold.
      if (d.variants.some((v) => v.active !== false && packGrams(v.label) === null)) {
        throw badRequest("Total stock in kg only works when every option is a weight like “500 g” or “1 kg”.");
      }
      // Setting a total re-derives every weight pack's stock (database trigger). With the total seen when
      // the form opened, only the change is applied, so grams sold meanwhile are not handed back.
      await c.query(
        `update products set stock_grams = case when $3::bigint is null or stock_grams is null then $1::bigint
                                                else greatest(0, stock_grams + ($1::bigint - $3::bigint)) end
          where id = $2`,
        [d.stockGrams, productId, d.stockGramsLoaded ?? null],
      );
    }
    // What the database now holds can differ from the form (values kept from changes made meanwhile):
    // an MRP below today's price means nothing (same rule as Inventory), and an active product must keep a
    // pack on sale.
    await c.query("update product_variants set mrp = null where product_id = $1 and mrp is not null and mrp < price", [productId]);
    const onSale = await c.query("select 1 from product_variants where product_id = $1 and active limit 1", [productId]);
    if (d.active && onSale.rowCount === 0) {
      throw conflict("Every pack size of this product is now switched off (one may have been switched off in Inventory meanwhile). Reload the page and keep at least one on sale.");
    }
    return { id: productId };
  });
}

export async function adminDeleteProduct(id: string) {
  // Locked like a checkout locks it: an order placed at the same moment either comes first (→ archived,
  // its lines keep their pack) or finds the product gone — never a deleted pack under a live order.
  return tx(async (c) => {
    await c.query("select id from products where id = $1 for update", [id]);
    const r = await c.query<{ n: number }>("select count(*)::int as n from order_items where product_id = $1", [id]);
    if ((r.rows[0]?.n ?? 0) > 0) {
      await c.query("update products set active = false where id = $1", [id]);
      return { archived: true };
    }
    await c.query("delete from products where id = $1", [id]);
    return { archived: false };
  });
}

export async function adminInventory() {
  return query(
    `select v.id as "variantId", p.id as "productId", p.name as "productName", v.label, v.price, v.stock, v.active,
            p.active as "productActive", c.name as "categoryName",
            p.stock_grams::float8 as "productStockGrams", pack_label_grams(v.label) as "packGrams"
       from product_variants v join products p on p.id = v.product_id join categories c on c.id = p.category_id
      order by p.name, v.sort_order`,
  );
}
export async function adminPatchInventory(
  updates: { variantId: string; price?: number; stock?: number; stockLoaded?: number; active?: boolean }[],
  products: { productId: string; stockGrams: number; stockGramsLoaded?: number }[] = [],
  requestId?: string,
) {
  return tx(async (c) => {
    await noteStock(c, "inventory edited in Admin", currentActor()?.id);
    if (await alreadyApplied(c, requestId)) return { updated: 0, alreadySaved: true }; // browser retry of a save that went through
    // Same lock order as checkout: every affected product row (by id) first, then packs by id —
    // otherwise a save running alongside a checkout could deadlock.
    await c.query(
      `select id from products
        where id = any($2::uuid[]) or id in (select product_id from product_variants where id = any($1::uuid[]))
        order by id for update`,
      [updates.map((u) => u.variantId), products.map((p) => p.productId)],
    );
    for (const pr of [...products].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))) {
      // With the loaded total, apply only the change (orders placed while the table was open stay counted).
      await c.query(
        `update products set stock_grams = case when $3::bigint is null then $2::bigint else greatest(0, stock_grams + ($2::bigint - $3::bigint)) end
          where id = $1 and stock_grams is not null`,
        [pr.productId, pr.stockGrams, pr.stockGramsLoaded ?? null],
      );
    }
    for (const u of [...updates].sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0))) {
      // For stock-by-weight packs the database derives `stock` from the product total, so a
      // stock value sent here is ignored for them (price / active still apply).
      await c.query(
        `update product_variants set price = coalesce($2, price),
                -- a new price above the MRP: the MRP no longer means anything (the product form would refuse it)
                mrp = case when $2::int is not null and mrp is not null and mrp < $2::int then null else mrp end,
                stock = case when $3::int is null then stock when $5::int is null then $3 else greatest(0, stock + ($3 - $5::int)) end,
                active = coalesce($4, active)
          where id = $1`,
        [u.variantId, u.price ?? null, u.stock ?? null, u.active ?? null, u.stockLoaded ?? null],
      );
    }
    // Every pack of a product switched off here would leave an active product nobody can buy (and a
    // "not found" product page): refuse, as the product form does.
    // (Only products where this save switched a pack off: a plain restock of a product already in that
    // state isn't blocked.)
    const empty = await c.query<{ name: string }>(
      `select p.name from products p
        where p.active and p.id in (select product_id from product_variants where id = any($1::uuid[]))
          and not exists (select 1 from product_variants v where v.product_id = p.id and v.active)`,
      [updates.filter((u) => u.active === false).map((u) => u.variantId)],
    );
    if (empty.rows[0]) throw conflict(`Keep at least one pack size of ${empty.rows[0].name} on sale — or hide the whole product in Products.`);
    return { updated: updates.length + products.length };
  });
}

/**
 * Adds any missing 100 g / 250 g / 500 g / 1 kg sizes (one product, or all when null).
 * Prices are scaled from the product's own nearest existing size — see migration 20261015000006.
 */
export async function adminAddStandardSizes(productId: string | null) {
  const r = await queryOne<{ added: number }>("select public.add_standard_pack_sizes($1::uuid) as added", [productId]);
  return { added: r?.added ?? 0 };
}
