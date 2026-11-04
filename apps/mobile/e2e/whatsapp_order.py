"""Phone app: order on WhatsApp (web build, 390 px), against a local dev-mode API with a store WhatsApp
number set. Usage as e2e/smoke.py:  python3 e2e/whatsapp_order.py http://localhost:8081 postgres://…/fb_ui
Checks: the cart offers both "Order on WhatsApp" and "Checkout"; the WhatsApp form refuses bad details;
sending saves a WhatsApp order waiting for the store (pending_confirmation, channel whatsapp) and opens
wa.me with the order message; the basket is emptied; the done screen shows the order number.
"""
import re, subprocess, sys, urllib.parse
from playwright.sync_api import sync_playwright

A = sys.argv[1]
DB = sys.argv[2] if len(sys.argv) > 2 else "postgres://postgres:postgres@localhost:5432/fb_ui"
def sql(q): return subprocess.run(["psql", DB, "-Atc", q], capture_output=True, text=True, check=True).stdout.strip()
res = []
def check(name, ok, detail=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""), flush=True)

phone = "98" + sql("select lpad((floor(random()*1e8))::bigint::text, 8, '0')")
before = int(sql("select count(*) from orders where channel = 'whatsapp'"))
with sync_playwright() as p:
    b = p.chromium.launch()
    c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    c.add_init_script("window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return { closed: false, focus(){}, location: {} }; };")
    pg = c.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    pg.goto(A + "/", wait_until="networkidle"); pg.wait_for_timeout(1500)
    for _ in range(3):
        add = pg.get_by_label(re.compile(r"^Add Broccoli")).first
        if add.count(): add.click(); pg.wait_for_timeout(300)
        inc = pg.get_by_label(re.compile(r"^Increase Broccoli")).first
        if inc.count(): inc.click(); pg.wait_for_timeout(250)
    pg.goto(A + "/cart", wait_until="networkidle"); pg.wait_for_timeout(2000)
    wa = pg.get_by_role("button", name="Order on WhatsApp")
    check("cart: Order on WhatsApp + Checkout both offered", wa.count() == 1 and pg.get_by_role("button", name=re.compile(r"^Checkout")).count() == 1)
    wa.click(); pg.wait_for_timeout(2000)
    check("WhatsApp order screen opens", pg.get_by_text("Your details").count() >= 1, pg.url)
    # Bad details are refused before anything is saved.
    pg.get_by_label("Full name").fill("A")
    pg.get_by_label("Mobile number").fill("12345")
    pg.get_by_role("button", name="Send order on WhatsApp").click(); pg.wait_for_timeout(800)
    check("bad name/mobile refused with messages", pg.get_by_text("Enter your full name").count() >= 1 and pg.get_by_text("Enter a valid 10-digit mobile number").count() >= 1)
    check("nothing saved for bad details", int(sql("select count(*) from orders where channel = 'whatsapp'")) == before)
    pg.get_by_label("Full name").fill("App WhatsApp Test")
    pg.get_by_label("Mobile number").fill(phone)
    pg.get_by_label("House no., street, landmark").fill("House 12, Test Lane, near park")
    pg.get_by_label("City").fill("Bengaluru")
    pg.get_by_label("PIN code").fill("560034")
    pg.get_by_role("button", name="Send order on WhatsApp").click(); pg.wait_for_timeout(3500)
    row = sql(f"select status || '|' || channel || '|' || payment_method || '|' || order_number from orders where address->>'phone' = '{phone}' or address::text like '%{phone}%' order by created_at desc limit 1")
    check("order saved: waiting for the store, WhatsApp channel, COD", row.startswith("pending_confirmation|whatsapp|cod|"), row)
    num = row.split("|")[-1] if row else ""
    opened = pg.evaluate("window.__opened")
    msg = urllib.parse.unquote(opened[-1]) if opened else ""
    check("WhatsApp opened with the order message", bool(opened) and "wa.me/" in opened[-1] and num in msg, (opened[-1][:120] if opened else "none"))
    check("done screen shows the order number", pg.get_by_text(re.compile(rf"Order {re.escape(num)} saved")).count() == 1 if num else False)
    pg.goto(A + "/cart", wait_until="networkidle"); pg.wait_for_timeout(1500)
    check("basket emptied after sending", pg.get_by_text(re.compile("basket is empty", re.I)).count() >= 1)
    check("no page errors", not errs, "; ".join(errs[:3]))
    b.close()
print(f"{sum(res)}/{len(res)} checks passed")
sys.exit(0 if all(res) else 1)
