"""Browser test: refund / replacement after delivery (admin records it, customer sees it).

Usage: python3 apps/web/e2e/after_delivery.py <base_url> <database_url>
Needs a development build (dev login on). Uses the sample customer's latest order, marks it delivered with
cash collected (test database only), then: admin records a refund for one item → marks it sent; the
customer's order page shows it; checked at 1280 px and 390 px.
"""
import re, subprocess, sys
from playwright.sync_api import sync_playwright, expect

BASE, DB = sys.argv[1], sys.argv[2]
res = []


def check(name, ok, detail=""):
    res.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""), flush=True)


def sql(q):
    return subprocess.run(["psql", DB, "-Atc", q], check=True, capture_output=True, text=True).stdout.strip()


oid = sql("select o.id from orders o join profiles p on p.id = o.user_id where p.email = 'customer@freshbasket.local' and o.status <> 'cancelled' order by o.created_at desc limit 1")
assert oid, "the sample customer needs at least one order (run e2e/flow.py first)"
sql(f"delete from order_adjustments where order_id = '{oid}'; update orders set status = 'delivered', payment_status = 'cod_collected', payment_method = 'cod' where id = '{oid}'")
item = sql(f"select product_name || '|' || unit_price from order_items where order_id = '{oid}' order by product_name limit 1")
name, unit = item.split("|")
rupees = int(unit) // 100 or 1

with sync_playwright() as p:
    b = p.chromium.launch()
    # Admin records a refund for 1 of the first item.
    c = b.new_context(viewport={"width": 1280, "height": 900}); pg = c.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    pg.goto(BASE + "/admin/login?next=%2Fadmin", wait_until="networkidle")
    pg.locator("main").get_by_label("Email").first.fill("admin@freshbasket.local")
    pg.get_by_role("button", name="Sign in").first.click()
    pg.wait_for_url(re.compile(r"/admin/?$"))
    pg.goto(f"{BASE}/admin/orders/{oid}", wait_until="networkidle")
    check("delivered order shows 'Problems after delivery'", pg.get_by_role("heading", name="Problems after delivery").count() == 1)
    pg.get_by_role("button", name="Record a refund or replacement").click()
    pg.get_by_label("Refund", exact=True).check()
    pg.get_by_label(re.compile("^" + re.escape(name))).first.fill("1")
    pg.get_by_label("Refund amount (₹)").fill(str(rupees))
    pg.get_by_label("What was wrong?").fill("One pack squashed (photo on WhatsApp)")
    pg.get_by_role("button", name="Save", exact=True).click()
    expect(pg.get_by_text(re.compile(r"Refund ₹[\d,.]+ · to send"))).to_be_visible(timeout=10000)
    check("refund recorded and listed as 'to send'", True)
    pg.get_by_role("button", name="Mark refund sent").click()
    expect(pg.get_by_text(re.compile(r"Refund ₹[\d,.]+ · sent"))).to_be_visible(timeout=10000)
    check("refund marked as sent", True)
    check("timeline has the refund notes", pg.get_by_text(re.compile(r"^Refund of ₹[\d,.]+ (for|sent)")).count() >= 2)
    # Phone width: no sideways scrolling on the admin order page.
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
    check("admin order page fits 390 px", pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"))
    check("no page errors (admin)", not errs, errs)
    c.close()

    # The customer sees it.
    for w in (1280, 390):
        c = b.new_context(viewport={"width": w, "height": 900}); pg = c.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        pg.goto(BASE + "/login")
        pg.get_by_role("button", name="Sample customer").click()
        pg.wait_for_url(re.compile(r"/account"), timeout=20000)
        pg.goto(f"{BASE}/orders/{oid}", wait_until="networkidle")
        check(f"{w}px: customer sees 'Refunds & replacements'", pg.get_by_role("heading", name="Refunds & replacements").count() == 1)
        check(f"{w}px: refund shown as sent", pg.get_by_text(re.compile(r"Refund of ₹[\d,.]+ — sent")).count() == 1)
        check(f"{w}px: fits the screen", pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"))
        check(f"{w}px: no page errors", not errs, errs)
        c.close()
    b.close()

print(f"{sum(res)}/{len(res)} checks passed")
sys.exit(0 if all(res) else 1)
