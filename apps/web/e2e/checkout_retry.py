"""Browser test: a checkout whose payment start failed (order cancelled) keeps the basket, shows a clear
message, and the next tap is a NEW attempt (new idempotency key). An ambiguous 5xx keeps the same key.
The /api/orders responses are stubbed in the browser for the first attempts; the last one goes through.
Usage: python3 apps/web/e2e/checkout_retry.py [base_url]"""
import json, os, re, sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"))
    page = b.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(f"{BASE}/login")
    page.get_by_role("button", name="Sample customer").click()
    page.wait_for_url(re.compile(r"/account"), timeout=20000)

    page.goto(f"{BASE}/product/potato")
    page.get_by_text("2 kg").first.click()
    page.get_by_role("button", name="Add to Cart").click()
    expect(page.get_by_role("link", name=re.compile(r"Cart, 1 item"))).to_be_visible()

    page.goto(f"{BASE}/checkout")
    expect(page.get_by_role("heading", name="Checkout")).to_be_visible()
    if page.get_by_label("Full name").count() == 0 and page.get_by_text("New address").count():
        page.get_by_text("New address").click()
    if page.get_by_label("Full name").count():
        page.get_by_label("Full name").fill("Retry Tester")
        page.get_by_label("Mobile number").fill("9876543210")
        page.locator("#checkout-pincode").fill("560034")
        expect(page.get_by_text("We deliver to Koramangala")).to_be_visible(timeout=10000)
        page.get_by_label("Flat / house no., building, street").fill("7, Retry Road")
        page.get_by_label("State").fill("Karnataka")
    page.get_by_text("Cash on delivery").first.click()

    keys = []
    plan = [
        (502, {"error": "We couldn't start the payment, so this order was cancelled. Your basket is unchanged — please try again.", "code": "ORDER_CANCELLED"}),
        (504, {"error": "Gateway timeout", "code": "INTERNAL"}),
        None,  # real request
    ]

    def handle(route):
        req = route.request
        if req.method != "POST":
            return route.continue_()
        keys.append(json.loads(req.post_data or "{}").get("idempotencyKey"))
        step = plan[len(keys) - 1] if len(keys) - 1 < len(plan) else None
        if step is None:
            return route.continue_()
        status, body = step
        route.fulfill(status=status, content_type="application/json", body=json.dumps(body))

    page.route("**/api/orders", handle)
    place = page.get_by_role("button", name=re.compile("Place order"))

    # 1) Confirmed cancellation: message shown, basket kept, still on checkout.
    place.click()
    expect(page.get_by_text("this order was cancelled", exact=False)).to_be_visible(timeout=10000)
    expect(page).to_have_url(re.compile(r"/checkout"))
    expect(page.get_by_role("link", name=re.compile(r"Cart, 1 item"))).to_be_visible()

    # 2) Next deliberate attempt uses a NEW key; this one gets an ambiguous 504.
    place.click()
    expect(page.get_by_text("Gateway timeout")).to_be_visible(timeout=10000)
    expect(page.get_by_role("link", name=re.compile(r"Cart, 1 item"))).to_be_visible()

    # 3) Retry after the ambiguous error keeps the SAME key; it goes through for real.
    place.click()
    page.wait_for_url(re.compile(r"/orders/[0-9a-f-]+\?placed=1"), timeout=20000)

    print("keys:", keys)
    assert len(keys) == 3, keys
    assert keys[1] != keys[0], "a confirmed cancellation must start a new attempt (new key)"
    assert keys[2] == keys[1], "an ambiguous 5xx must keep the key (no duplicate order)"
    print("CHECKOUT RETRY E2E OK")
    if errors:
        print("PAGE ERRORS:", errors)
        sys.exit(1)
    b.close()
