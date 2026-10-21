"""QA test plan (TC-001 … TC-027) run against a LOCAL production build in dev-login mode with a local
seeded Postgres — never against the live site. Places real orders only in the local test database.

Usage: python3 e2e/qa_plan.py http://localhost:3200 <DATABASE_URL of that local DB> <out.json>
Writes one result per check: {tc, check, status: PASS|FAIL|INFO, detail}."""
import itertools, json, re, subprocess, sys, time, uuid
from concurrent.futures import ThreadPoolExecutor
from playwright.sync_api import sync_playwright, expect

BASE, DB, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
RUN = str(int(time.time()))[-6:]
results = []


def rec(tc, check, ok, detail=""):
    status = "PASS" if ok is True else "FAIL" if ok is False else "INFO"
    results.append({"tc": tc, "check": check, "status": status, "detail": str(detail)[:400]})
    print(f"{status} {tc} {check}" + (f" — {detail}" if detail and status != "PASS" else ""))


def sql(q):
    return subprocess.run(["psql", DB, "-Atc", q], capture_output=True, text=True, check=True).stdout.strip()


def variant(slug, label):
    return sql(f"select v.id from product_variants v join products p on p.id=v.product_id where p.slug='{slug}' and v.label='{label}'")


H = {"Origin": BASE, "content-type": "application/json"}


def api(ctx, method, path, body=None):
    r = ctx.request.fetch(f"{BASE}{path}", method=method, headers=H, data=json.dumps(body) if body is not None else None)
    try:
        b = r.json()
    except Exception:
        b = None
    return r.status, b


def login(ctx, email, name="QA Test Customer"):
    s, _ = api(ctx, "POST", "/api/auth/dev-login", {"email": email, "name": name})
    return s


TOMORROW = sql("select to_char((now() at time zone 'Asia/Kolkata')::date + 1, 'YYYY-MM-DD')")
# A roomy slot of our own so repeated local runs never fill the real ones.
EVENING = sql(f"insert into delivery_slots (label, start_time, end_time, cutoff_minutes, capacity, sort_order, active) values ('QA open {RUN}', '17:00', '20:00', 60, 1000, 98, true) returning id").splitlines()[0]
ADDR = {"label": "Home", "fullName": "QA Test Customer", "phone": "9876500000", "line1": "QA House 1, Sector 8", "city": "Faridabad",
        "state": "Haryana", "pincode": "121006", "isDefault": False}


def order_body(items, **o):
    b = {"items": items, "address": {**ADDR, "line1": f"QA House {uuid.uuid4().hex[:6]}, Sector 8"}, "saveAddress": False, "slotId": EVENING,
         "deliveryDate": TOMORROW, "paymentMethod": "cod", "idempotencyKey": str(uuid.uuid4()), "couponCode": None, "customerNote": None}
    b.update(o)
    return b


# Fresh stock for the products these tests order (earlier local runs reserved some). Local test DB only.
sql("update products set stock_grams = 80000 where slug in ('potato','carrot','tomato')")
CARROT500, CARROT100 = variant("carrot", "500 g"), variant("carrot", "100 g")
POTATO1, TOMATO100, TOMATO500 = variant("potato", "1 kg"), variant("tomato", "100 g"), variant("tomato", "500 g")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

    # ---------------- TC-001 delivery area validation ----------------
    ctx = b.new_context()
    for pin, want in [("121006", True), ("110001", False), ("560034", True)]:
        s, r = api(ctx, "GET", f"/api/delivery/check?pincode={pin}")
        rec("TC-001", f"PIN {pin} serviceable={want}", s == 200 and r["serviceable"] is want, r)
    for pin in ["", "000000", "12100", "abcdef"]:
        s, r = api(ctx, "GET", f"/api/delivery/check?pincode={pin}")
        rec("TC-001", f"invalid PIN '{pin}' rejected", s == 400, (s, r))
    login(ctx, f"qa-a-{RUN}@example.com")
    s, r = api(ctx, "POST", "/api/orders", order_body([{"variantId": POTATO1, "quantity": 3}], address={**ADDR, "pincode": "110001", "state": "Delhi", "city": "New Delhi"}))
    rec("TC-001", "checkout refuses an unserviceable PIN (same rule as the PIN check)", s == 409, (s, r and r.get("error")))

    # ---------------- TC-003 slots ----------------
    s, r = api(ctx, "POST", "/api/orders", {k: v for k, v in order_body([{"variantId": POTATO1, "quantity": 3}]).items() if k != "slotId"})
    rec("TC-003", "order without a slot is rejected", s == 400, (s, r and r.get("error")))
    past = sql("select to_char((now() at time zone 'Asia/Kolkata')::date - 1, 'YYYY-MM-DD')")
    s, r = api(ctx, "POST", "/api/orders", order_body([{"variantId": POTATO1, "quantity": 3}], deliveryDate=past))
    rec("TC-003", "past date rejected", s in (400, 409), (s, r and r.get("error")))
    full = sql(f"insert into delivery_slots (label, start_time, end_time, cutoff_minutes, capacity, sort_order, active) values ('QA full {RUN}', '18:00', '19:00', 60, 1, 99, true) returning id").splitlines()[0]
    s1, r1 = api(ctx, "POST", "/api/orders", order_body([{"variantId": POTATO1, "quantity": 3}], slotId=full))
    s2, r2 = api(ctx, "POST", "/api/orders", order_body([{"variantId": POTATO1, "quantity": 3}], slotId=full))
    rec("TC-003", "slot with capacity 1: first order OK, second refused", s1 in (200, 201) and s2 == 409, (s1, s2, r2 and r2.get("error")))
    if s1 in (200, 201):
        oid = r1["order"]["id"]
        row = sql(f"select to_char(delivery_date,'YYYY-MM-DD')||'|'||slot_id from orders where id='{oid}'")
        rec("TC-003", "order stores the chosen date and slot", row == f"{TOMORROW}|{full}", row)
    sql(f"update delivery_slots set active=false where id='{full}'")
    s, r = api(ctx, "POST", "/api/orders", order_body([{"variantId": POTATO1, "quantity": 3}], slotId=full))
    rec("TC-003", "switched-off slot refused", s == 409, (s, r and r.get("error")))
    ctx.close()

    # ---------------- TC-004 / TC-008 fees, threshold, arithmetic ----------------
    ctx = b.new_context()
    fee, free = map(int, sql("select fee||' '||free_above from delivery_areas where pincode='121006'").split())
    prices = {vid: int(sql(f"select price from product_variants where id='{vid}'")) for vid in [CARROT500, CARROT100, TOMATO100, TOMATO500, POTATO1]}
    exact = None
    for a, c, d, e in itertools.product(range(0, 12), range(0, 12), range(0, 12), range(0, 8)):
        if a * prices[CARROT500] + c * prices[CARROT100] + d * prices[TOMATO100] + e * prices[TOMATO500] == free:
            exact = [(CARROT500, a), (CARROT100, c), (TOMATO100, d), (TOMATO500, e)]
            break

    def quote(items, **o):
        s, r = api(ctx, "POST", "/api/quote", {"items": items, **o})
        return s, r

    for name, items in [("below", [{"variantId": CARROT500, "quantity": 3}]),
                        ("exactly", [{"variantId": v, "quantity": q} for v, q in (exact or []) if q]),
                        ("above", [{"variantId": POTATO1, "quantity": 8}])]:
        if not items:
            rec("TC-004", f"cart {name} free threshold", None, "no combination found")
            continue
        s, r = quote(items, pincode="121006")
        sub = sum(prices[i["variantId"]] * i["quantity"] for i in items)
        want_fee = 0 if sub >= free else fee
        qd = r["quote"]
        rec("TC-004", f"cart {name} ₹{free/100:.0f} (subtotal ₹{sub/100:.2f}) → fee ₹{want_fee/100:.0f}", qd["deliveryFee"] == want_fee and qd["subtotal"] == sub and qd["total"] == sub + want_fee, qd)
    s, r = quote([{"variantId": CARROT500, "quantity": 3}, {"variantId": TOMATO500, "quantity": 4}], pincode="121006", couponCode="FRESH10")
    q = r["quote"]
    sub = 3 * prices[CARROT500] + 4 * prices[TOMATO500]
    disc = sub * 10 // 100
    rec("TC-008", "quantity × price, 10% coupon, fee and total add up (paise, rounded down)", q["subtotal"] == sub and q["discount"] == disc and q["total"] == sub - disc + (0 if sub - disc >= free else fee), q)
    ctx.close()

    # ---------------- TC-007 tampering (server side) ----------------
    ctx = b.new_context(); login(ctx, f"qa-t-{RUN}@example.com")
    for qty in [0, -1, 100000, 1.5]:
        s, r = api(ctx, "POST", "/api/orders", order_body([{"variantId": POTATO1, "quantity": qty}]))
        rec("TC-007", f"order with quantity {qty} rejected", s == 400, (s, r and r.get("error")))
    body = order_body([{"variantId": POTATO1, "quantity": 2, "price": 1, "unitPrice": 1}], total=1, subtotal=1, deliveryFee=0, status="delivered", paymentStatus="paid", userId=str(uuid.uuid4()))
    s, r = api(ctx, "POST", "/api/orders", body)
    if s in (200, 201):
        o = r["order"]
        rec("TC-007", "client price/total/status fields are ignored (server recomputes)", o["subtotal"] == 2 * prices[POTATO1] and o["status"] == "placed" and o["paymentStatus"] == "cod_pending", {k: o[k] for k in ("subtotal", "total", "status", "paymentStatus")})
        owner = sql(f"select u.email from orders o join auth.users u on u.id=o.user_id where o.id='{o['id']}'")
        rec("TC-021", "order can't be assigned to another customer via userId", owner.startswith("qa-t-"), owner)
    else:
        rec("TC-007", "tampered order accepted with server values", False, (s, r))
    spin = variant("spinach-palak", "1 kg") or variant("spinach", "1 kg")
    st = int(sql(f"select stock from product_variants where id='{spin}'")) if spin else 0
    if spin:
        s, r = api(ctx, "POST", "/api/orders", order_body([{"variantId": spin, "quantity": min(20, st + 1)}, {"variantId": POTATO1, "quantity": 2}]))
        rec("TC-007", f"more than stock ({st}) refused", s == 409, (s, r and r.get("error")))
    ctx.close()

    # ---------------- TC-009 coupons ----------------
    ctx = b.new_context(); login(ctx, f"qa-new-{RUN}@example.com")
    big = [{"variantId": POTATO1, "quantity": 5}]
    s, r = api(ctx, "POST", "/api/quote", {"items": big, "pincode": "121006", "couponCode": "WELCOME50"})
    rec("TC-009", "WELCOME50 applies for a new customer's first order", r["quote"]["couponCode"] == "WELCOME50" and r["quote"]["discount"] == 5000, r["quote"])
    s, r = api(ctx, "POST", "/api/orders", order_body(big, couponCode="WELCOME50"))
    rec("TC-009", "first order with WELCOME50 stores the discount", s in (200, 201) and r["order"]["discount"] == 5000 and r["order"]["couponCode"] == "WELCOME50", (s, r and r.get("order", r)))
    s, r = api(ctx, "POST", "/api/quote", {"items": big, "pincode": "121006", "couponCode": "WELCOME50"})
    rec("TC-009", "WELCOME50 refused on the second order", r["quote"]["discount"] == 0 and any(i["code"] == "COUPON_INVALID" for i in r["quote"]["issues"]), r["messages"])
    s, r = api(ctx, "POST", "/api/orders", order_body(big, couponCode="WELCOME50"))
    rec("TC-009", "second order with WELCOME50 refused at checkout", s == 409, (s, r and r.get("error")))
    s, r = api(ctx, "POST", "/api/quote", {"items": [{"variantId": CARROT100, "quantity": 1}], "pincode": "121006", "couponCode": "FRESH10"})
    rec("TC-009", "FRESH10 below its minimum → clear message", r["quote"]["discount"] == 0 and "_coupon" in r["messages"], r["messages"])
    s, r = api(ctx, "POST", "/api/quote", {"items": big, "pincode": "121006", "couponCode": "FRESH10"})
    rec("TC-009", "FRESH10 applies 10%", r["quote"]["discount"] == r["quote"]["subtotal"] // 10, r["quote"])
    for code in ["NOPE123", "WELCOME50 FRESH10", "fresh10 "]:
        s, r = api(ctx, "POST", "/api/quote", {"items": big, "pincode": "121006", "couponCode": code})
        rec("TC-009", f"code '{code}'", None, f"discount {r['quote']['discount']} coupon {r['quote']['couponCode']} msg {r['messages'].get('_coupon')}")
    sql("update coupons set ends_at = now() - interval '1 day' where code='FRESH10'")
    s, r = api(ctx, "POST", "/api/quote", {"items": big, "pincode": "121006", "couponCode": "FRESH10"})
    rec("TC-009", "expired coupon refused with a clear message", r["quote"]["discount"] == 0 and "expired" in r["messages"].get("_coupon", "").lower(), r["messages"])
    sql("update coupons set ends_at = null where code='FRESH10'")
    ctx.close()

    # ---------------- TC-010 / TC-011 / TC-012 checkout UI ----------------
    ctx = b.new_context(viewport={"width": 1366, "height": 900}); page = ctx.new_page()
    login(ctx, f"qa-ui-{RUN}@example.com")  # a fresh customer: no saved addresses, empty checkout form
    before = int(sql(f"select stock from product_variants where id='{POTATO1}'"))
    page.goto(f"{BASE}/product/potato")
    page.get_by_role("radio", name=re.compile(r"^1 kg")).check(force=True)
    for _ in range(2):
        page.get_by_role("button", name=re.compile(r"^Increase")).first.click()
    page.get_by_role("button", name=re.compile("Add to Cart")).click()
    page.goto(f"{BASE}/checkout"); page.wait_for_load_state("networkidle")
    # TC-011: blank required fields
    for sel in ["#fullName", "#name", "input[autocomplete='name']"]:
        if page.locator(sel).count():
            break
    btn = page.get_by_role("button", name=re.compile(r"(Place order|Continue to payment)", re.I))
    btn.click()
    page.wait_for_timeout(800)
    errs = page.locator("[role=alert], [aria-invalid=true]").count()
    rec("TC-011", "submitting a blank address shows field errors (no order)", errs > 0 and int(sql(f"select count(*) from orders where address->>'fullName' = 'QA UI Customer {RUN}'")) == 0, f"{errs} error markers")
    form = page.locator("form").first
    page.locator("main").get_by_label("Full name", exact=True).fill(f"QA UI Customer {RUN}")
    page.locator("main").get_by_label("Mobile number", exact=True).fill("98765")
    page.locator("main").get_by_label("PIN code", exact=True).fill("121006")
    page.locator("main").get_by_label("Flat / house no., building, street", exact=True).fill(f"QA UI House {RUN}")
    page.locator("main").get_by_label("City", exact=True).fill("Faridabad")
    page.locator("main").get_by_label("State", exact=True).fill("Haryana")
    btn.click(); page.wait_for_timeout(800)
    rec("TC-011", "malformed mobile number rejected with a message", page.get_by_text(re.compile("valid 10-digit mobile", re.I)).count() > 0)
    page.locator("main").get_by_label("Mobile number", exact=True).fill("9876512345")
    # Pick the first open slot and cash on delivery (click the visible card; the radio itself may be hidden).
    for rx in [re.compile("Evening|Afternoon|Morning"), re.compile("Cash on delivery")]:
        radios = page.get_by_role("radio", name=rx)
        for i in range(radios.count()):
            rd = radios.nth(i)
            if rd.is_enabled():
                try:
                    rd.check(force=True, timeout=3000)
                except Exception:
                    page.locator(f"label:has(#{rd.get_attribute('id')})").click() if rd.get_attribute("id") else rd.click(force=True)
                break
    n0 = int(sql(f"select count(*) from orders where address->>'fullName' = 'QA UI Customer {RUN}'"))
    btn.dblclick()  # TC-012 double submit
    page.wait_for_url(re.compile(r"/orders/[0-9a-f-]{36}"), timeout=30000)
    n1 = int(sql(f"select count(*) from orders where address->>'fullName' = 'QA UI Customer {RUN}'"))
    oid = re.search(r"/orders/([0-9a-f-]{36})", page.url).group(1)
    num0 = sql(f"select order_number from orders where id='{oid}'")
    try:
        expect(page.get_by_text(num0).first).to_be_visible(timeout=15000)
        shown = True
    except Exception:
        shown = False
    rec("TC-010", "COD order placed from the UI, confirmation page with the order number", shown, num0)
    rec("TC-012", "double-clicking Place order creates exactly one order", n1 - n0 == 1, f"{n1 - n0} orders")
    o = json.loads(sql(f"select row_to_json(x) from (select status, payment_method, payment_status, subtotal, delivery_fee, total, slot_label, address->>'pincode' as pin, unavailable_item_preference from orders where id='{oid}') x"))
    items = sql(f"select string_agg(variant_label||' x'||quantity||' @'||unit_price, ', ') from order_items where order_id='{oid}'")
    rec("TC-010", "order record: COD, placed, items/qty/fee/total correct", o["status"] == "placed" and o["payment_method"] == "cod" and o["subtotal"] == 3 * prices[POTATO1] and o["total"] == o["subtotal"] + o["delivery_fee"] and o["pin"] == "121006", {**o, "items": items})
    rec("TC-010", "stock reserved (−3 × 1 kg potato)", int(sql(f"select stock from product_variants where id='{POTATO1}'")) <= before - 3)
    page.reload(); page.wait_for_load_state("networkidle")
    rec("TC-012", "refreshing the confirmation creates no new order", int(sql(f"select count(*) from orders where address->>'fullName' = 'QA UI Customer {RUN}'")) == n1)
    # TC-016 history + tracking
    page.goto(f"{BASE}/account/orders"); page.wait_for_load_state("networkidle")
    num = sql(f"select order_number from orders where id='{oid}'")
    rec("TC-016", "order appears in the customer's order history", page.get_by_text(num).count() > 0, num)
    ctx_anon = b.new_context(); pa = ctx_anon.new_page()
    r = pa.goto(f"{BASE}/track/{oid}"); pa.wait_for_timeout(1500)
    rec("TC-016", "tracking without the secret key → 'not found' page, no order data", pa.get_by_text("couldn't find that page").count() > 0 and pa.get_by_text(f"QA UI Customer {RUN}").count() == 0, f"HTTP {r.status}")
    r = pa.goto(f"{BASE}/track/{uuid.uuid4()}?k={'a'*32}"); pa.wait_for_timeout(1500)
    rec("TC-016", "unknown order reference → safe 'not found' page", pa.get_by_text("couldn't find that page").count() > 0, f"HTTP {r.status}")
    rec("TC-016", "HTTP status of the 'not found' tracking page", None, f"{r.status} (soft 404 while streaming locally; the live site returned 404)")
    pa.goto(f"{BASE}/orders/{oid}")
    try:
        pa.wait_for_url(re.compile(r"/login"), timeout=10000)
    except Exception:
        pass
    rec("TC-016", "logged-out visitor is sent to sign in for a private order", "/login" in pa.url and pa.get_by_text(f"QA UI Customer {RUN}").count() == 0, pa.url)
    ctx_anon.close()
    # TC-017 cancellation rules
    s, r = api(ctx, "POST", f"/api/orders/{oid}/cancel")
    rec("TC-017", "customer can cancel a placed order; stock returned", s == 200 and int(sql(f"select stock from product_variants where id='{POTATO1}'")) == before and sql(f"select status from orders where id='{oid}'") == "cancelled", (s, r and r.get("error")))
    s, r = api(ctx, "POST", "/api/orders", order_body([{"variantId": POTATO1, "quantity": 2}]))
    if s not in (200, 201):
        raise SystemExit(f"setup order for TC-017 failed: {s} {r}")
    o2 = r["order"]["id"]
    sql(f"update orders set status='packed' where id='{o2}'")
    s, r = api(ctx, "POST", f"/api/orders/{o2}/cancel")
    rec("TC-017", "packed order can't be cancelled by the customer", s == 409, (s, r and r.get("error")))
    # TC-014 logout
    page.goto(f"{BASE}/account")
    api(ctx, "POST", "/api/auth/logout")
    page.goto(f"{BASE}/account/orders")
    try:
        page.wait_for_url(re.compile(r"/login"), timeout=10000)
    except Exception:
        pass
    rec("TC-014", "after logout an account page requires sign-in", "/login" in page.url, page.url)
    s, r = api(ctx, "GET", "/api/orders")
    rec("TC-014", "after logout the orders API answers 401", s == 401, s)
    ctx.close()

    # ---------------- TC-019 / TC-020 / TC-021 authorization ----------------
    a, bb = b.new_context(), b.new_context()
    login(a, f"qa-iso-a-{RUN}@example.com"); login(bb, f"qa-iso-b-{RUN}@example.com")
    s, r = api(a, "POST", "/api/orders", order_body([{"variantId": POTATO1, "quantity": 2}], address={**ADDR, "fullName": "Customer A Private", "line1": f"A House {RUN}"}))
    oa = r["order"]["id"]
    for m, path in [("GET", f"/api/orders/{oa}"), ("POST", f"/api/orders/{oa}/cancel"), ("POST", f"/api/orders/{oa}/reorder"), ("POST", f"/api/orders/{oa}/pay")]:
        s, r = api(bb, m, path)
        leaked = "Customer A Private" in json.dumps(r or {})
        rec("TC-020", f"customer B: {m} {path.replace(oa, '<A>')} → denied, nothing leaked", s in (403, 404) and not leaked, (s, r and r.get("error")))
    pb = bb.new_page(); pb.goto(f"{BASE}/orders/{oa}")
    rec("TC-020", "customer B opening A's order page sees no A data", pb.get_by_text("Customer A Private").count() == 0)
    s, r = api(bb, "GET", "/api/orders")
    rec("TC-020", "B's order list doesn't contain A's order", s == 200 and oa not in json.dumps(r))
    rec("TC-020", "A's order still placed after B's attempts", sql(f"select status from orders where id='{oa}'") == "placed")
    for m, path, body in [("GET", "/api/admin/stats", None), ("GET", "/api/admin/orders", None), ("GET", "/api/admin/users", None),
                          ("PATCH", f"/api/admin/orders/{oa}", {"status": "delivered"}), ("PATCH", f"/api/admin/orders/{oa}", {"paymentStatus": "refunded"}),
                          ("PUT", "/api/admin/settings", {"storeName": "Hacked"}), ("PATCH", "/api/admin/inventory", {"updates": []})]:
        s, r = api(bb, m, path, body)
        rec("TC-019", f"customer → {m} {path.replace(oa, '<A>')} denied", s in (401, 403), s)
    s, r = api(bb, "PUT", "/api/me", {"fullName": "B", "role": "admin", "email": "admin@freshbasket.local"})
    me = api(bb, "GET", "/api/me")[1]["profile"]
    rec("TC-021", "customer can't make themselves admin or change email via profile update", me["role"] == "customer" and me["email"] != "admin@freshbasket.local", me)
    rec("TC-021", "order status unchanged after customer requests", sql(f"select status||'/'||payment_status from orders where id='{oa}'") == "placed/cod_pending")
    pg = bb.new_page(); pg.goto(f"{BASE}/admin"); pg.wait_for_timeout(1500)
    rec("TC-019", "customer opening /admin gets 'for store staff' (403), not the panel", pg.get_by_text("This area is for store staff").count() > 0 and pg.get_by_text("Recent orders").count() == 0, pg.url)
    anon = b.new_context()
    s, r = api(anon, "GET", "/api/admin/orders")
    rec("TC-019", "no session → admin API 401", s == 401, s)
    pa = anon.new_page(); pa.goto(f"{BASE}/admin")
    rec("TC-019", "no session → /admin redirects to staff sign-in", "/admin/login" in pa.url, pa.url)
    events = sql(f"select count(*) from order_events where order_id='{oa}'")
    rec("TC-021", "order history (audit) has only the system 'placed' event", events == "1", events)
    a.close(); bb.close(); anon.close()

    # ---------------- TC-013 concurrency ----------------
    one = sql(f"insert into products (slug, name, category_id) select 'qa-one-{RUN}', 'QA One Unit', id from categories limit 1 returning id").splitlines()[0]
    vone = sql(f"insert into product_variants (product_id, label, price, stock) values ('{one}', '1 pc', 15000, 1) returning id").splitlines()[0]
    ctxs = [b.new_context() for _ in range(2)]
    for i, c in enumerate(ctxs):
        login(c, f"qa-conc-{i}-{RUN}@example.com")
    bodies = [order_body([{"variantId": vone, "quantity": 1}]) for _ in ctxs]
    # Two genuinely parallel requests (two browsers' request contexts on separate threads is not allowed;
    # use the server's own concurrency: fire both via one page with Promise.all).
    pg = ctxs[0].new_page(); pg.goto(f"{BASE}/contact"); pg.wait_for_load_state("networkidle")
    cookie_b = "; ".join(f"{c['name']}={c['value']}" for c in ctxs[1].cookies())
    res = pg.evaluate("""async ([bodies, cb]) => {
        const send = (b) => fetch('/api/orders', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(b)}).then(r => r.status);
        return Promise.all([send(bodies[0]), send(bodies[1])]);
    }""", [bodies, cookie_b])
    stock_after = int(sql(f"select stock from product_variants where id='{vone}'"))
    placed = int(sql(f"select count(*) from order_items where variant_id='{vone}'"))
    rec("TC-013", "two simultaneous orders for the last unit: one succeeds, stock never negative", stock_after == 0 and placed == 1 and sorted(res) in ([201, 409], [200, 409]), {"statuses": res, "stock": stock_after, "orders": placed})
    s, r = api(ctxs[1], "POST", "/api/orders", order_body([{"variantId": vone, "quantity": 1}]))
    rec("TC-013", "sold-out item clearly reported", s == 409 and "stock" in json.dumps(r).lower(), (s, r and r.get("error")))
    for c in ctxs:
        c.close()

    # ---------------- TC-018 contact + newsletter ----------------
    ctx = b.new_context()
    s, r = api(ctx, "POST", "/api/contact", {"name": "QA Test Customer", "email": "qa.customer@example.com", "message": "QA test message — please ignore.", "phone": None, "orderNumber": None})
    rec("TC-018", "valid contact message accepted and stored", s in (200, 201) and sql("select count(*) from support_messages where email='qa.customer@example.com'") != "0", (s, r))
    for bad, why in [({"name": "", "email": "qa.customer@example.com", "message": "QA test message"}, "missing name"),
                     ({"name": "QA", "email": "bad", "message": "QA test message"}, "bad email"),
                     ({"name": "QA", "email": "qa.customer@example.com", "message": "x" * 5000}, "oversized")]:
        s, r = api(ctx, "POST", "/api/contact", bad)
        rec("TC-018", f"contact {why} rejected", s == 400, s)
    s1, r1 = api(ctx, "POST", "/api/newsletter", {"email": f"qa-news-{RUN}@example.com"})
    s2, r2 = api(ctx, "POST", "/api/newsletter", {"email": f"qa-news-{RUN}@example.com"})
    rec("TC-018", "newsletter signup + duplicate handled (one row, no error)", s1 in (200, 201) and s2 in (200, 201) and sql(f"select count(*) from newsletter_subscribers where email='qa-news-{RUN}@example.com'") == "1", (s1, r1, s2, r2))
    leak = json.dumps([r1, r2])
    rec("TC-018", "public responses don't echo other subscribers' data", "@" not in leak.replace(f"qa-news-{RUN}@example.com", ""), leak)
    ctx.close()

    # ---------------- TC-023 abuse protection ----------------
    ctx = b.new_context()
    codes = []
    for i in range(35):
        s, _ = api(ctx, "POST", "/api/quote", {"items": [{"variantId": POTATO1, "quantity": 1}], "couponCode": f"GUESS{i}"})
        codes.append(s)
    rec("TC-023", "coupon guessing is rate-limited (30/min per IP)", 429 in codes, f"first 429 at request {codes.index(429) + 1 if 429 in codes else '-'}")
    c2 = []
    for i in range(7):
        s, _ = api(ctx, "POST", "/api/contact", {"name": "QA Test", "email": "qa.customer@example.com", "message": f"QA rate test {i} please ignore"})
        c2.append(s)
    rec("TC-023", "contact form is rate-limited", 429 in c2, c2)
    s, r = api(ctx, "POST", "/api/quote", None)
    rec("TC-023", "empty body → 400 JSON error, no stack trace", s == 400 and "at " not in json.dumps(r), (s, r))
    r = ctx.request.fetch(f"{BASE}/api/quote", method="POST", headers={"Origin": "https://evil.example", "content-type": "application/json"}, data="{}")
    rec("TC-023", "cross-site POST (foreign Origin) refused", r.status == 403, r.status)
    s, r = api(ctx, "GET", "/api/orders/not-a-uuid")
    rec("TC-023", "invalid identifier → safe error", s in (400, 401, 404), (s, r))
    ctx.close()

    # ---------------- TC-024 / TC-025 / TC-026 / TC-027 UI ----------------
    ctx = b.new_context(); page = ctx.new_page()
    errors = []
    # (The local test data points one product at a missing image on purpose, to test the fallback.)
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "404" not in m.text else None)
    page.on("response", lambda r: errors.append(f"404 {r.url}") if r.status == 404 and "does-not-exist" not in r.url else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    for w in [360, 390, 768, 1024, 1366]:
        page.set_viewport_size({"width": w, "height": 850})
        for path in ["/", "/shop", "/product/carrot", "/cart", "/checkout", "/login", "/delivery-policy", "/contact"]:
            page.goto(f"{BASE}{path}"); page.wait_for_load_state("networkidle")
            sw = page.evaluate("document.scrollingElement.scrollWidth")
            if sw > w + 1:
                rec("TC-024", f"{w}px {path}: no horizontal scroll", False, f"page is {sw}px wide")
    rec("TC-024", "no horizontal overflow at 360/390/768/1024/1366 on 8 core pages", not any(r["tc"] == "TC-024" and r["status"] == "FAIL" for r in results))
    page.set_viewport_size({"width": 1366, "height": 850})
    for q, expect_any in [("Carrot", True), ("carrot", True), ("CARROT", True), ("car", True), ("gajar", True), ("xyzzyq", False)]:
        page.goto(f"{BASE}/shop?q={q}"); page.wait_for_load_state("networkidle")
        has = page.get_by_role("link", name=re.compile("Carrot", re.I)).count() > 0
        none_msg = page.get_by_text("No products found").count() > 0
        rec("TC-025", f"search '{q}'", (has if expect_any else none_msg), f"carrot shown={has} no-results msg={none_msg}")
    login(ctx, f"qa-a11y-{RUN}@example.com")
    page.goto(f"{BASE}/contact"); page.wait_for_load_state("networkidle")
    page.evaluate("(v) => localStorage.setItem('fb_cart_v1', JSON.stringify({lines:[{variantId:v, quantity:3, productName:'Potato', productSlug:'potato', variantLabel:'1 kg', imageUrl:null, priceHint:7000}], couponCode:null}))", POTATO1)
    unlabeled = []
    for path in ["/checkout", "/login", "/contact"]:
        page.goto(f"{BASE}{path}"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(800)
        unlabeled += [f"{path}: {x}" for x in page.evaluate("""[...document.querySelectorAll('main input, main select, main textarea')].filter(e => e.type !== 'hidden' && !e.labels?.length && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')).map(e => e.name || e.id || e.type)""")]
    rec("TC-026", "checkout, login and contact form controls all have accessible names", not unlabeled, unlabeled)
    page.wait_for_timeout(1000)
    page.goto(f"{BASE}/contact"); page.wait_for_load_state("networkidle")
    page.goto(f"{BASE}/")
    noalt = page.evaluate("[...document.images].filter(i => !i.hasAttribute('alt')).length")
    rec("TC-026", "all images have alt attributes", noalt == 0, noalt)
    page.keyboard.press("Tab")
    first = page.evaluate("document.activeElement && (document.activeElement.textContent || document.activeElement.getAttribute('aria-label') || '').trim().slice(0,40)")
    rec("TC-026", "first Tab stop is the skip link / first control", None, first)
    rec("TC-027", "no JavaScript errors on the visited pages", not errors, errors[:5])
    ctx.close()
    b.close()

# ---------------- TC-022 secrets in what the browser downloads ----------------
import glob, os
# Secret VALUES, not variable names (the admin help text names env vars on purpose).
pats = {"Supabase secret key": re.compile(r"sb_secret_[A-Za-z0-9_-]{16,}"), "Razorpay live key": re.compile(r"rzp_live_[A-Za-z0-9]{10,}"),
        "database URL with password": re.compile(r"postgres(ql)?://[^:/\s\"']+:[^@\s\"']+@"), "private key": re.compile(r"BEGIN (RSA |EC )?PRIVATE KEY"),
        "service-role JWT": re.compile(r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl")}
hits = {}
for f in glob.glob(os.path.join(os.path.dirname(__file__), "..", ".next", "static", "**", "*.js"), recursive=True):
    t = open(f, encoding="utf-8", errors="ignore").read()
    for k, rx in pats.items():
        if rx.search(t):
            hits.setdefault(k, []).append(os.path.basename(f))
rec("TC-022", "no server secrets / DB URLs / private keys in the browser JavaScript", not hits, hits)
json.dump(results, open(OUT, "w"), indent=1, ensure_ascii=False)
fails = [r for r in results if r["status"] == "FAIL"]
print(f"\n{sum(r['status'] == 'PASS' for r in results)} pass, {len(fails)} fail, {sum(r['status'] == 'INFO' for r in results)} info")
