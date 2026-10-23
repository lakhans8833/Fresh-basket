"""Features borrowed from the big grocery apps, end to end on a local dev-mode build.

Usage: python3 e2e/shopper_features.py http://localhost:3200 <screenshot-dir>
- Admin adds an approx note to a pack ("approx 8–10 pcs") → shown on the product page and cards.
- Top bar shows the next bookable delivery slot.
- Header cart shows "N items · ₹total" (desktop); phones get a "View cart" bar above the tab bar
  that hides on the product, cart and checkout pages.
- The search box cycles through real product names.
"""
import json, re, sys
from playwright.sync_api import sync_playwright, expect

BASE, SHOTS = sys.argv[1], sys.argv[2]
H = {"Origin": BASE, "content-type": "application/json"}
res = []
def check(name, ok, detail=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""), flush=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    # Admin: put a note on carrot's first pack through the admin API (same call the product form makes).
    admin = b.new_context()
    tok = admin.request.post(BASE + "/api/auth/dev-login", headers=H, data=json.dumps({"email": "admin@freshbasket.local"})).json()["token"]
    AH = {**H, "Authorization": f"Bearer {tok}"}
    plist = admin.request.get(BASE + "/api/admin/products?q=carrot", headers=AH).json()
    pid = next(x["id"] for x in plist["products"] if x["slug"] == "carrot")
    prod = admin.request.get(BASE + f"/api/admin/products/{pid}", headers=AH).json()["product"]
    variants = prod["variants"]
    target = next(v for v in variants if v["active"])
    body = {k: prod[k] for k in ("name", "slug", "categoryId", "description", "highlights", "seasonal", "featured", "active", "images", "stockGrams") if k in prod}
    body["variants"] = [{"id": v["id"], "label": v["label"], "price": v["price"], "mrp": v["mrp"], "stock": v["stock"], "sortOrder": i, "active": v["active"],
                         "note": "approx 8–10 pcs"} for i, v in enumerate(variants)]
    r = admin.request.put(BASE + f"/api/admin/products/{pid}", headers=AH, data=json.dumps(body))
    check("admin saves a pack note", r.ok, r.text()[:200])
    again = admin.request.get(BASE + f"/api/admin/products/{pid}", headers=AH).json()["product"]
    check("note is stored", any(v.get("note") == "approx 8–10 pcs" for v in again["variants"]))
    long = dict(body); long["variants"] = [dict(v, note="x" * 41) for v in body["variants"]]
    check("a note over 40 characters is refused", admin.request.put(BASE + f"/api/admin/products/{pid}", headers=AH, data=json.dumps(long)).status == 400)
    admin.close()

    # Desktop shopper
    c = b.new_context(viewport={"width": 1366, "height": 900}); pg = c.new_page()
    pg.goto(BASE + "/product/carrot", wait_until="networkidle")
    check("product page shows the pack note", pg.get_by_text("approx 8–10 pcs").first.is_visible())
    check("top bar shows the next delivery slot", pg.get_by_text(re.compile(r"Next delivery:")).first.is_visible())
    pg.get_by_role("button", name="Add to Cart").first.click(); pg.wait_for_timeout(600)
    cart_text = pg.get_by_role("link", name=re.compile(r"^Cart,")).first.inner_text()
    check("header cart shows items and total", re.search(r"1 item · ₹\d", cart_text), cart_text)
    ph = [pg.get_by_role("combobox").first.get_attribute("placeholder")]
    pg.wait_for_timeout(2800); ph.append(pg.get_by_role("combobox").first.get_attribute("placeholder"))
    check("search placeholder cycles through product names", ph[0] != ph[1] and all(x.startswith("Search \"") for x in ph), ph)
    pg.goto(BASE + "/shop", wait_until="networkidle")
    check("cards show the pack note", pg.get_by_text(re.compile("approx 8–10 pcs")).count() >= 1)
    pg.screenshot(path=f"{SHOTS}/desktop-header.png", clip={"x": 0, "y": 0, "width": 1366, "height": 160})
    c.close()

    # Phone shopper
    m = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); pg = m.new_page()
    pg.goto(BASE + "/product/carrot", wait_until="networkidle")
    pg.get_by_role("button", name="Add to Cart").first.click(); pg.wait_for_timeout(600)
    bar = pg.locator("div.fixed").get_by_role("link", name=re.compile(r"View cart"))
    check("no View cart bar on the product page", bar.count() == 0 or not bar.first.is_visible())
    pg.goto(BASE + "/", wait_until="networkidle"); pg.wait_for_timeout(800)
    check("phones: View cart bar with count and total on home", bar.first.is_visible() and re.search(r"1 item.*₹\d", bar.first.inner_text(), re.S), bar.first.inner_text() if bar.count() else "")
    pg.screenshot(path=f"{SHOTS}/phone-home-cartbar.png")
    bar.first.click(); pg.wait_for_url(re.compile(r"/cart$"))
    check("bar opens the cart and hides there", bar.count() == 0 or not bar.first.is_visible())
    m.close()
    b.close()
print(f"{sum(res)}/{len(res)} checks passed")
sys.exit(0 if all(res) else 1)
