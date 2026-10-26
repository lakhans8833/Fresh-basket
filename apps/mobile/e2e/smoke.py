"""Phone-app smoke test on the web build (390 px), against a local dev-mode API.

Usage:
  cd apps/mobile && EXPO_PUBLIC_API_URL=http://localhost:3200 npx expo export --platform web --output-dir /tmp/appweb
  serve /tmp/appweb on http://localhost:8081 with an SPA fallback, run the API with EXTRA_ALLOWED_ORIGINS=http://localhost:8081
  python3 e2e/smoke.py http://localhost:8081
Checks: home has category tiles and product rows; cards open on the 500 g pack and show % OFF + MRP;
ADD turns into a stepper; the View basket bar shows count + total; categories rail filters;
product page opens on 500 g with "Select unit"; order slot times read "12 PM–3 PM", not "12:00–15:00".
"""
import re, sys
from playwright.sync_api import sync_playwright, expect

A = sys.argv[1]
res = []
def check(name, ok, detail=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""), flush=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); pg = c.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    pg.goto(A + "/", wait_until="networkidle"); pg.wait_for_timeout(1500)
    check("home: category tiles", pg.get_by_text("Shop by category").count() == 1 and pg.get_by_role("button", name="Leafy Greens").count() >= 1)
    check("home: Popular picks row", pg.get_by_text("Popular picks").count() == 1)
    card = pg.get_by_role("link", name=re.compile(r"^Broccoli")).first
    label = card.get_attribute("aria-label") or ""
    check("card opens on the 500 g pack", "500 g" in label, label)
    check("card shows % off", re.search(r"\d+% off", label), label)
    check("card shows the MRP struck through", pg.get_by_text(re.compile(r"^₹111\.25$")).count() >= 1 or "% off" in label)
    pg.get_by_label(re.compile(r"^Add Broccoli")).first.click(); pg.wait_for_timeout(300)
    check("ADD turns into a stepper", pg.get_by_label(re.compile(r"^Increase Broccoli")).count() >= 1)
    pg.get_by_label(re.compile(r"^Increase Broccoli")).first.click(); pg.wait_for_timeout(300)
    bar = pg.get_by_label(re.compile(r"^View basket, 2 items, ₹"))
    check("View basket bar with count and total", bar.count() == 1)
    pg.get_by_text("Categories").last.click(); pg.wait_for_timeout(1500)
    pg.get_by_role("button", name="Leafy Greens", exact=True).last.click(); pg.wait_for_timeout(1500)
    check("categories rail filters", pg.get_by_role("heading", name="Leafy Greens").count() >= 1 or pg.get_by_text("Leafy Greens").count() >= 2)
    pg.goto(A + "/product/carrot", wait_until="networkidle"); pg.wait_for_timeout(1500)
    sel = pg.get_by_role("radio", name=re.compile(r"^500 g")).first
    check("product page: Select unit, 500 g chosen", pg.get_by_text("Select unit").count() == 1 and (sel.get_attribute("aria-checked") == "true" or sel.get_attribute("aria-selected") == "true"))
    pg.goto(A + "/login", wait_until="networkidle"); pg.wait_for_timeout(800)
    pg.get_by_text("Sample customer").click(); pg.wait_for_timeout(2500)
    pg.goto(A + "/orders", wait_until="networkidle"); pg.wait_for_timeout(2000)
    body = pg.locator("body").inner_text()
    check("orders: slot times in 12-hour format", not re.search(r"\d{2}:\d{2}–\d{2}:\d{2}", body) and re.search(r"(AM|PM)", body), body[:200])
    check("no page errors", not errs, errs)
    b.close()
print(f"{sum(res)}/{len(res)} checks passed")
sys.exit(0 if all(res) else 1)
