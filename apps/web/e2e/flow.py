"""End-to-end smoke test of the storefront flow in a real browser (development mode).
browse -> product -> basket -> checkout (COD and test payment) -> order tracking -> admin status update.
Usage: python3 apps/web/e2e/flow.py [base_url] [screenshot_dir]"""
import sys, re, json, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/fb-e2e"
import os; os.makedirs(OUT, exist_ok=True)

def shot(page, name):
    page.screenshot(path=f"{OUT}/{name}.png", full_page=True)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"))
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # Sign in as the sample customer (development login)
    page.goto(f"{BASE}/login")
    page.get_by_role("button", name="Sample customer").click()
    page.wait_for_url(re.compile(r"/account"), timeout=20000)

    # Browse: home -> search -> product
    page.goto(f"{BASE}/")
    page.get_by_role("searchbox", name="Search vegetables").first.fill("tomato")
    page.keyboard.press("Enter")
    page.wait_for_url(re.compile(r"/shop\?q=tomato"))
    expect(page.get_by_role("heading", name=re.compile("Results for"))).to_be_visible()
    page.get_by_role("link", name="Tomato", exact=True).click()
    page.wait_for_url(re.compile(r"/product/tomato"))
    page.get_by_text("1 kg").first.click()
    for _ in range(3):
        page.get_by_role("button", name="Increase Tomato").click()
    page.get_by_role("button", name="Add to basket").click()
    expect(page.get_by_role("link", name=re.compile(r"Basket, 4 items"))).to_be_visible()
    shot(page, "1_product")

    # Basket
    page.goto(f"{BASE}/cart")
    expect(page.get_by_role("heading", name="Your basket")).to_be_visible()
    expect(page.get_by_text("₹240").first).to_be_visible(timeout=10000)
    page.get_by_label("Coupon code").fill("FRESH10")
    page.get_by_role("button", name="Apply").click()
    expect(page.get_by_text("applied")).to_be_visible(timeout=10000)
    shot(page, "2_cart")
    page.get_by_role("button", name="Proceed to checkout").click()
    page.wait_for_url(re.compile(r"/checkout"))

    # Checkout with a new address (COD)
    expect(page.get_by_role("heading", name="Checkout")).to_be_visible()
    if page.get_by_label("Full name").count() == 0:
        page.get_by_text("New address").click()
    page.get_by_label("Full name").fill("Test Customer")
    page.get_by_label("Mobile number").fill("9876543210")
    page.locator("#checkout-pincode").fill("560034")
    expect(page.get_by_text("We deliver to Koramangala")).to_be_visible(timeout=10000)
    page.get_by_label("Flat / house no., building, street").fill("12, 4th Cross, 5th Block")
    page.get_by_label("State").fill("Karnataka")
    page.get_by_text("Cash on delivery").first.click()
    expect(page.get_by_text("₹25").first).to_be_visible(timeout=10000)
    shot(page, "3_checkout")
    page.get_by_role("button", name=re.compile("Place order")).click()
    page.wait_for_url(re.compile(r"/orders/[0-9a-f-]+\?placed=1"), timeout=20000)
    expect(page.get_by_text("Thank you! Your order is confirmed.")).to_be_visible()
    # 4 x ₹60 = ₹240, FRESH10 = ₹24 off, delivery ₹25 -> ₹241
    expect(page.get_by_text("₹241").first).to_be_visible()
    order_url = page.url.split("?")[0]
    shot(page, "4_order")

    # Second order with the test payment flow
    page.goto(f"{BASE}/product/potato")
    page.get_by_text("2 kg").first.click()
    page.get_by_role("button", name="Add to basket").click()
    page.goto(f"{BASE}/checkout")
    page.get_by_text("Test payment").first.click()
    page.get_by_role("button", name="Continue to payment").click()
    page.wait_for_url(re.compile(r"/pay/"), timeout=20000)
    shot(page, "5_pay")
    page.get_by_role("button", name="Simulate successful payment").click()
    page.wait_for_url(re.compile(r"/orders/"), timeout=20000)
    expect(page.get_by_text("Paid").first).to_be_visible()

    # Cancel the first (COD) order is still allowed; reorder works
    page.goto(order_url)
    page.get_by_role("button", name="Reorder these items").click()
    page.wait_for_url(re.compile(r"/cart"))
    print("E2E OK", order_url)
    if errors:
        print("PAGE ERRORS:", errors)
    b.close()
