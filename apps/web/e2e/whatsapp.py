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
    page.add_init_script("window.__opened=[]; window.open=(u)=>{window.__opened.push(u); return {}};")

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
    page.get_by_role("button", name="Proceed to WhatsApp").click()
    expect(page.get_by_text("Enter your full name")).to_be_visible()
    expect(page.get_by_text("Enter a valid 10-digit mobile number")).to_be_visible()
    expect(page.get_by_text("Enter a valid 6-digit PIN code")).to_be_visible()
    assert page.evaluate("window.__opened.length") == 0

    page.locator("#wa-name").fill("Test *Customer*")
    page.locator("#wa-phone").fill("98765 43210")
    page.locator("#wa-address").fill("H.No 12, Sector 7, near the park")
    page.locator("#wa-area").fill("Sector 7")
    page.locator("#wa-pincode").fill("121006")
    expect(page.get_by_text("Not in our delivery list yet")).to_be_visible(timeout=10000)
    expect(page.get_by_text("Confirmed on WhatsApp")).to_be_visible()
    page.locator("#wa-notes").fill("Call before coming")
    page.get_by_role("button", name="Proceed to WhatsApp").click()
    expect(page.get_by_text("Almost done — tap Send in WhatsApp")).to_be_visible()

    url = page.evaluate("window.__opened[0]")
    assert url.startswith(f"https://wa.me/{NUMBER}?text="), url
    msg = unquote(url.split("?text=", 1)[1])
    print("---- message ----\n" + msg + "\n-----------------")
    assert "Name: Test Customer" in msg and "*Customer*" in msg  # customer's own * stripped, our heading kept
    assert "Mobile: +91 9876543210" in msg
    assert "City / PIN: Faridabad - 121006" in msg
    assert "Delivery: to be confirmed" in msg
    assert "Notes: Call before coming" in msg
    # line totals add up to subtotal and total
    items = [int(x.replace(",", "")) for x in re.findall(r"= ₹([\d,]+)", msg)]
    sub = int(re.search(r"Subtotal: ₹([\d,]+)", msg).group(1).replace(",", ""))
    total = int(re.search(r"\*Total: ₹([\d,]+)\*", msg).group(1).replace(",", ""))
    assert sum(items) == sub == total, (items, sub, total)

    # Known delivery area adds its fee (local sample data: 560034 = ₹25 below ₹499)
    page.get_by_role("button", name="Edit my details").click()
    page.locator("#wa-pincode").fill("560034")
    expect(page.get_by_text(re.compile("Delivery to Koramangala"))).to_be_visible(timeout=10000)
    page.get_by_role("button", name="Proceed to WhatsApp").click()
    msg2 = unquote(page.evaluate("window.__opened[1]").split("?text=", 1)[1])
    fee = re.search(r"Delivery: (Free|₹([\d,]+))", msg2)
    total2 = int(re.search(r"\*Total: ₹([\d,]+)\*", msg2).group(1).replace(",", ""))
    expected = sub + (0 if fee.group(1) == "Free" else int(fee.group(2)))
    assert total2 == expected, (total2, expected)

    page.get_by_role("button", name=re.compile("I've sent it")).click()
    page.wait_for_url(re.compile(r"/$"))
    expect(page.get_by_role("link", name=re.compile(r"Cart, 0 items")).first).to_be_visible()
    print("WHATSAPP E2E OK")
    if errors:
        print("PAGE ERRORS:", errors)
        sys.exit(1)
    b.close()
