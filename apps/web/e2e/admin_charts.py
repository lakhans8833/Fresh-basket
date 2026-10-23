"""Admin dashboard charts on a local dev-mode build.

Usage: python3 e2e/admin_charts.py http://localhost:3200
- "Sales overview" shows one column per day for 30 days (default) and 7 / 90 days when switched.
- Hovering / focusing a day shows its sales and orders; "Show as table" lists the same days.
- No console errors, no sideways scrolling on a phone.
"""
import re, sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1]
res = []
def check(name, ok, detail=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""), flush=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    c = b.new_context(); pg = c.new_page()
    pg.goto(BASE + "/admin/login?next=%2Fadmin", wait_until="networkidle")
    pg.locator("main").get_by_label("Email").first.fill("admin@freshbasket.local")
    pg.get_by_role("button", name="Sign in").first.click()
    pg.wait_for_url(re.compile(r"/admin/?$"))
    state = c.storage_state(); c.close()
    for w, h in ((1280, 900), (390, 844)):
        c = b.new_context(storage_state=state, viewport={"width": w, "height": h}); pg = c.new_page(); errs = []
        pg.on("console", lambda m: m.type == "error" and errs.append(m.text[:150]))
        pg.goto(BASE + "/admin", wait_until="networkidle")
        bars = pg.locator("ol[aria-label^='Sales per day'] > li")
        expect(bars).to_have_count(30)
        check(f"{w}px: 30 days of columns by default", bars.count() == 30)
        pg.get_by_role("button", name="7 days").click(); expect(bars).to_have_count(7)
        check(f"{w}px: 7 days", bars.count() == 7)
        pg.get_by_role("button", name="90 days").click(); expect(bars).to_have_count(90)
        check(f"{w}px: 90 days", bars.count() == 90)
        pg.get_by_role("button", name="7 days").click(); expect(bars).to_have_count(7)
        last = pg.locator("ol[aria-label^='Sales per day'] button").last
        last.focus()
        tip = pg.get_by_role("tooltip")
        check(f"{w}px: focusing a day shows its figures", tip.is_visible() and re.search(r"₹[\d,]+(\.\d+)? · \d+ orders?", tip.inner_text()), tip.inner_text() if tip.count() else "")
        pg.get_by_role("button", name="Show as table").click()
        check(f"{w}px: table view lists 7 days", pg.locator("figure table tbody tr").count() == 7)
        check(f"{w}px: bar lists present", all(pg.get_by_role("heading", name=n).is_visible() for n in ("Top products", "Orders by status", "Top delivery areas")))
        check(f"{w}px: no sideways scroll", not pg.evaluate("document.documentElement.scrollWidth > innerWidth"))
        check(f"{w}px: no console errors", not errs, errs)
        c.close()
    b.close()
print(f"{sum(res)}/{len(res)} checks passed")
sys.exit(0 if all(res) else 1)
