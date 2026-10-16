"""Browser test of the WhatsApp checkout (no real message is sent: window.open is intercepted).
Requires NEXT_PUBLIC_WHATSAPP_NUMBER to be set when the app was built.
Usage: python3 apps/web/e2e/whatsapp.py [base_url] [expected_number]"""
import os, re, sys
from urllib.parse import unquote
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
NUMBER = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("NEXT_PUBLIC_WHATSAPP_NUMBER", "")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"))
    page = b.new_page(viewport={"width": 390, "height": 860})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script("window.__opened=[]; window.open=(u)=>{window.__opened.push(u); return {closed: false, location: {}}};")

    # Add two products from the shop
    page.goto(f"{BASE}/shop")
    cards = page.locator("article")
    expect(cards.first).to_be_visible()
    # Compact cards: ADD puts one pack in the cart, then − / + change the cart quantity.
    cards.nth(0).get_by_role("button", name=re.compile(r"^Add .+ to cart$")).click()
    cards.nth(0).get_by_role("button", name=re.compile("Increase")).click()
    cards.nth(1).get_by_role("button", name=re.compile(r"^Add .+ to cart$")).click()
    expect(page.get_by_role("link", name=re.compile(r"Cart, 3 items")).first).to_be_visible()

    page.goto(f"{BASE}/cart")
    page.get_by_role("button", name="Order on WhatsApp").click()
    page.wait_for_url(re.compile(r"/order$"))

    # Validation
    page.get_by_role("button", name="Review order").click()
    expect(page.get_by_text("Enter your full name")).to_be_visible()
    expect(page.get_by_text("Enter a valid 10-digit mobile number")).to_be_visible()
    expect(page.get_by_text("Enter a valid 6-digit PIN code")).to_be_visible()
    assert page.evaluate("window.__opened.length") == 0

    page.locator("#wa-name").fill("Test *Customer*")
    page.locator("#wa-phone").fill("98765 43210")
    page.locator("#wa-address").fill("H.No 12, Sector 7, near the park")
    page.locator("#wa-area").fill("Sector 7")
    # A PIN code we don't deliver to: no order can be placed, customer can ask on WhatsApp instead.
    page.locator("#wa-pincode").fill("121006")
    expect(page.get_by_text("We don't deliver to this PIN code yet")).to_be_visible(timeout=10000)
    page.get_by_role("button", name="Review order").click()
    expect(page.get_by_text("We don't deliver to this PIN code yet. Message us")).to_be_visible()

    # Known delivery area (local sample data: 560034, ₹25 below ₹499)
    page.locator("#wa-pincode").fill("560034")
    expect(page.get_by_text(re.compile("Delivery to Koramangala"))).to_be_visible(timeout=10000)
    page.locator("#wa-notes").fill("Call before coming")
    page.get_by_text("Cash on delivery").first.click()
    page.get_by_role("button", name="Review order").click()

    # Review step: full summary before anything is sent or saved
    expect(page.get_by_role("heading", name="Check your order")).to_be_visible()
    assert page.evaluate("window.__opened.length") == 0
    page.get_by_role("button", name=re.compile("Confirm & send on WhatsApp")).click()
    expect(page.get_by_text(re.compile(r"Order FB\d{6}-\d+ is saved"))).to_be_visible(timeout=15000)
    assert page.evaluate("window.__opened.length") == 1  # WhatsApp tab opened inside the click

    url = page.get_by_role("link", name="Open WhatsApp again").get_attribute("href")
    assert url.startswith(f"https://wa.me/{NUMBER}?text="), url
    msg = unquote(url.split("?text=", 1)[1])
    print("---- message ----\n" + msg + "\n-----------------")
    assert re.search(r"Order ID: FB\d{6}-\d+", msg), msg
    assert "Name: Test Customer" in msg and "*Customer*" in msg  # customer's own * stripped, our heading kept
    assert "Mobile: +91 9876543210" in msg
    assert "City / PIN: Bengaluru - 560034" in msg or "- 560034" in msg
    assert "Payment: Cash on delivery\n" in msg and "(Cash on delivery)" not in msg
    assert re.search(r"Delivery slot: \w{3}, \d{1,2} \w{3} · ", msg), "slot line missing"
    assert "Notes: Call before coming" in msg
    assert "Track order: " in msg
    items = [int(x.replace(",", "")) for x in re.findall(r"= ₹([\d,]+)", msg)]
    sub = int(re.search(r"Subtotal: ₹([\d,]+)", msg).group(1).replace(",", ""))
    fee = re.search(r"Delivery: (Free|₹([\d,]+))", msg)
    total = int(re.search(r"\*Total: ₹([\d,]+)\*", msg).group(1).replace(",", ""))
    assert sum(items) == sub, (items, sub)
    assert total == sub + (0 if fee.group(1) == "Free" else int(fee.group(2))), (total, sub, fee.group(0))
    expect(page.get_by_role("link", name=re.compile(r"Cart, 0 items")).first).to_be_visible()

    # Secret tracking link works without signing in and masks the address
    page.get_by_role("link", name="Track this order").click()
    page.wait_for_url(re.compile(r"/track/[0-9a-f-]{36}\?k="))
    expect(page.get_by_text("Order tracking")).to_be_visible()
    expect(page.get_by_text("H.No 12")).to_have_count(0)
    expect(page.get_by_text("98••••••10").first).to_be_visible()
    # A wrong key shows "not found" (no order data); the status code may be 200 because the shop layout streams.
    page.goto(page.url[:-4] + "zzzz")
    expect(page.get_by_text("We couldn't find that page")).to_be_visible()
    expect(page.get_by_text("Order tracking")).to_have_count(0)
    print("WHATSAPP E2E OK")
    if errors:
        print("PAGE ERRORS:", errors)
        sys.exit(1)
    b.close()
