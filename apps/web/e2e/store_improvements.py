"""Browser checks for the store-improvement changes, against a LOCAL production build in dev-login mode
(no Supabase; local seeded Postgres). Nothing here touches production.

Needs (see the commit / report): a 'mint' product with 100 g / 250 g / 500 g / 1 kg sizes and 2 kg shared
stock, area 560034 with min_order 0 and a store-wide minimum of ₹99, area 121006 (Faridabad), and the
'beetroot' product pointing at a missing image file.

Usage: python3 e2e/store_improvements.py http://localhost:3200 <screenshot-dir>"""
import os, re, sys
from playwright.sync_api import sync_playwright, expect

BASE, SHOTS = sys.argv[1], sys.argv[2]
os.makedirs(SHOTS, exist_ok=True)
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))


def no_overflow(page):
    return page.evaluate("document.scrollingElement.scrollWidth <= window.innerWidth + 1")


def dev_login(page, who):
    page.goto(f"{BASE}/login")
    page.get_by_role("button", name=re.compile(who)).click()
    page.wait_for_url(re.compile(r"/(account|admin)"), timeout=20000)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"))

    # ---------- Shared stock: product page + cart (desktop) ----------
    ctx = b.new_context(viewport={"width": 1366, "height": 900}); page = ctx.new_page()
    page.goto(f"{BASE}/product/mint")
    page.get_by_role("radio", name=re.compile(r"^1 kg")).check(force=True)
    page.get_by_role("button", name=re.compile("Add to Cart")).click()
    page.get_by_role("radio", name=re.compile(r"^500 g")).check(force=True)
    stepper_max = page.locator("[aria-label*='Increase'], button[aria-label^='Add one']").count()
    # 1 kg in cart → at most 2 × 500 g
    for _ in range(4):
        inc = page.get_by_role("button", name=re.compile(r"(Increase|More|\+|Add one)", re.I)).first
        if inc.is_enabled():
            inc.click()
    page.get_by_role("button", name=re.compile("Add to Cart")).click()
    page.get_by_role("radio", name=re.compile(r"^250 g")).check(force=True)
    full = page.get_by_role("button", name=re.compile("Maximum in cart")).count() > 0
    check("product page: after 1 kg + 2 × 500 g of 2 kg mint, no more 250 g can be added", full)
    check("…explains that other sizes use the shared stock", page.get_by_text(re.compile("Other sizes in your cart already use")).count() > 0)
    page.goto(f"{BASE}/cart")
    page.wait_for_load_state("networkidle")
    qty = page.evaluate("JSON.parse(localStorage.getItem('fb_cart_v1')).lines.map(l => [l.variantLabel, l.quantity])")
    grams = sum({"1 kg": 1000, "500 g": 500, "250 g": 250, "100 g": 100}[l] * q for l, q in qty)
    check("cart never holds more mint than the 2 kg in stock", grams <= 2000, qty)
    page.screenshot(path=f"{SHOTS}/cart-desktop.png", full_page=True)

    # ---------- Minimum order before a PIN is known ----------
    page.evaluate("localStorage.setItem('fb_cart_v1', JSON.stringify({lines:[{variantId: JSON.parse(localStorage.getItem('fb_cart_v1')).lines.find(l=>l.variantLabel==='1 kg').variantId, quantity:1, productName:'Mint (Pudina)', productSlug:'mint', variantLabel:'1 kg', imageUrl:null, priceHint:8500}], couponCode:null}))")
    page.reload(); page.wait_for_load_state("networkidle")
    check("cart (no PIN yet) shows the store-wide ₹99 minimum and the shortfall", page.get_by_text(re.compile(r"Minimum order is ₹99\. Add ₹14 more")).count() > 0)

    # ---------- PIN check details ----------
    page.get_by_role("button", name=re.compile(r"^(Add|Change)$")).first.click()
    page.locator("dialog[open] #pin-check").fill("560034")
    page.locator("dialog[open]").get_by_role("button", name=re.compile(r"^Check")).click()
    expect(page.get_by_text(re.compile("We deliver to"))).to_be_visible(timeout=10000)
    dlg = page.locator("dialog[open]").inner_text()
    check("PIN check shows fee, the effective minimum (₹99, area has none) and next slots", "Delivery fee" in dlg and "₹99" in dlg and "Next slots" in dlg, dlg)
    page.screenshot(path=f"{SHOTS}/pin-check.png")
    ctx.close()

    # ---------- Delivery policy minimum ----------
    ctx = b.new_context(); page = ctx.new_page()
    page.goto(f"{BASE}/delivery-policy")
    row = page.locator("tr", has_text="560034").inner_text()
    check("delivery policy shows ₹99 for 560034 (area 'none' + store ₹99), not 'None'", "₹99" in row and "None" not in row, row)

    # ---------- Search sync ----------
    page.goto(f"{BASE}/shop?q=tomato")
    box = page.locator("header input[type=search]:visible").first
    check("search box shows the URL's query", box.input_value() == "tomato", box.input_value())
    page.get_by_role("button", name="Clear search").first.click()
    page.wait_for_url(re.compile(r"/shop$"), timeout=10000)
    check("✕ clears the box AND the results (back to all products)", box.input_value() == "" and page.url.endswith("/shop"), page.url)
    page.goto(f"{BASE}/shop?q=zzzznothing")
    page.get_by_role("link", name="See all products").click()
    page.wait_for_url(re.compile(r"/shop$"), timeout=10000)
    check("'See all products' empties the search box too", page.locator("header input[type=search]:visible").first.input_value() == "")

    # ---------- Sticky header / anchors ----------
    page.goto(f"{BASE}/product/tomato#reviews")
    page.wait_for_timeout(800)
    top = page.evaluate("document.querySelector('[role=tablist][aria-label=\"Product details\"]').getBoundingClientRect().top")
    hdr = page.evaluate("document.querySelector('header').getBoundingClientRect().bottom")
    check("#reviews lands below the sticky header (not hidden under it)", top >= hdr - 1, f"tabs top {top}, header bottom {hdr}")

    # ---------- Nutrition tab, broken photo, labels ----------
    page.goto(f"{BASE}/product/mint")
    check("no empty Nutrition tab", page.get_by_role("tab", name="Nutrition").count() == 0)
    page.goto(f"{BASE}/product/beetroot")
    page.wait_for_timeout(1000)
    check("missing photo file → clean placeholder", page.get_by_role("img", name=re.compile("photo coming soon")).count() > 0)
    page.set_viewport_size({"width": 1366, "height": 900})
    page.goto(f"{BASE}/")
    acct = page.locator("header a[href='/login']")
    check("signed out: header link says 'Sign in' visibly and to screen readers", acct.get_attribute("aria-label") == "Sign in" and "Sign in" in acct.inner_text(), acct.inner_text())
    ctx.close()

    # ---------- Mobile layout ----------
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); page = ctx.new_page()
    for path in ["/", "/shop", "/product/mint", "/cart", "/delivery-policy", "/contact"]:
        page.goto(f"{BASE}{path}"); page.wait_for_load_state("networkidle")
        check(f"mobile {path}: no horizontal overflow", no_overflow(page))
        page.screenshot(path=f"{SHOTS}/mobile{path.replace('/', '_') or '_home'}.png", full_page=False)
    tab = page.locator("nav[aria-label=Primary] a[href='/login']")
    check("mobile tab bar: signed out shows 'Sign in'", tab.count() == 1 and "Sign in" in tab.inner_text())
    ctx.close()

    # ---------- Checkout preference + buy again (customer) ----------
    ctx = b.new_context(viewport={"width": 1366, "height": 900}); page = ctx.new_page()
    dev_login(page, "Sample customer")
    page.goto(f"{BASE}/product/tomato")
    for _ in range(3):
        page.get_by_role("button", name=re.compile(r"(Increase|More|\+|Add one)", re.I)).first.click()
    page.get_by_role("button", name=re.compile("Add to Cart")).click()
    page.goto(f"{BASE}/checkout")
    expect(page.get_by_text("If an item isn't available")).to_be_visible(timeout=15000)
    check("checkout offers call-first (default) / remove+refund — no auto-substitute",
          page.get_by_role("radio", name=re.compile("Call me about unavailable items")).is_checked()
          and page.get_by_role("radio", name=re.compile("Remove unavailable items")).count() == 1
          and page.get_by_text(re.compile("substitute", re.I)).count() >= 1)
    page.get_by_role("radio", name=re.compile("Remove unavailable items")).check()
    page.screenshot(path=f"{SHOTS}/checkout-preference.png", full_page=True)
    ctx.close()

    # ---------- Admin ----------
    ctx = b.new_context(viewport={"width": 1366, "height": 900}); page = ctx.new_page()
    dev_login(page, "Sample admin")
    page.goto(f"{BASE}/admin"); page.wait_for_load_state("networkidle")
    page.screenshot(path=f"{SHOTS}/admin-dashboard.png", full_page=True)
    check("dashboard flags Bengaluru areas vs the Faridabad (Haryana) service area", page.get_by_text(re.compile("outside your service area")).count() > 0)
    check("dashboard lists missing support details", page.get_by_text("Customer support details missing").count() > 0)
    check("dashboard says WhatsApp updates are off + which settings are missing", page.get_by_text(re.compile("WhatsApp order updates are off")).count() > 0 and page.get_by_text("WHATSAPP_CLOUD_ACCESS_TOKEN").count() > 0)
    page.goto(f"{BASE}/admin/products?q=mint"); page.wait_for_load_state("networkidle")
    check("admin products: mint shows '2 kg in stock'-style weight, not a summed pack count", page.get_by_text(re.compile(r"\d+(\.\d+)? (kg|g) in stock")).count() > 0 and page.get_by_text("34 in stock").count() == 0)
    page.goto(f"{BASE}/admin/delivery"); page.wait_for_load_state("networkidle")
    row = page.locator("tr", has_text="560034").inner_text()
    check("admin delivery: effective minimum shown (₹99 store-wide)", "₹99" in row and "store-wide" in row, row)
    check("admin delivery: Bengaluru PIN flagged", page.get_by_text(re.compile("PIN in Karnataka")).count() > 0)
    # Delivery-area draft + Escape → asks before discarding.
    page.locator("tr", has_text="560034").get_by_role("button", name=re.compile("Edit")).click()
    page.locator("#a-min").fill("150")
    page.keyboard.press("Escape")
    check("area editor: Escape with a draft asks 'Discard your changes?'", page.get_by_text("Discard your changes?").is_visible())
    page.get_by_role("button", name="Keep editing").click()
    check("…Keep editing keeps the draft", page.locator("#a-min").input_value() == "150")
    page.keyboard.press("Escape")
    page.get_by_role("button", name="Discard", exact=True).click()
    page.wait_for_timeout(300)
    check("…Discard closes without saving", page.locator("dialog[open]").count() == 0 and "₹99" in page.locator("tr", has_text="560034").inner_text())
    # Settings draft + sidebar navigation → Save / Discard / Stay.
    page.goto(f"{BASE}/admin/settings"); page.wait_for_load_state("networkidle")
    page.locator("#st-supportHours").fill("8 AM – 8 PM (test)")
    page.locator("aside a[href='/admin/orders'], nav a[href='/admin/orders']").first.click()
    check("settings draft + sidebar link → 'You have unsaved changes'", page.get_by_text("You have unsaved changes").is_visible())
    page.get_by_role("button", name="Stay").click()
    check("…Stay keeps the page and the draft", "/admin/settings" in page.url and page.locator("#st-supportHours").input_value() == "8 AM – 8 PM (test)")
    page.locator("aside a[href='/admin/orders'], nav a[href='/admin/orders']").first.click()
    page.get_by_role("button", name="Discard").click()
    page.wait_for_url(re.compile(r"/admin/orders"), timeout=10000)
    check("…Discard leaves without saving", "/admin/orders" in page.url)
    ctx.close()
    b.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
