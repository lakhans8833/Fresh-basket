"""Password sign-up with the "Confirm signup" CODE (verifyOtp type "signup") through the REAL app, against
e2e/fake-supabase-auth-otp.mjs (no email is sent; the code is read from the fake's /inbox).
Covers: sign-up → wrong code → right code → signed in → intended page; an unconfirmed account signing in
later gets the code screen, "Send a new code" (cooldown), the old code stops working, the new one signs in.
Usage: python3 e2e/signup_code.py http://localhost:3100 http://localhost:54397"""
import json, os, re, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE, AUTH = sys.argv[1], sys.argv[2]
RUN = str(int(time.time()))
results = []
WRONG = "That code is wrong, has expired or was already used"


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))


def fake(path, method="GET"):
    return json.loads(urllib.request.urlopen(urllib.request.Request(f"{AUTH}{path}", method=method, data=b"" if method == "POST" else None)).read())


def inbox(email):
    return fake(f"/inbox?email={email}")["code"]


def me(page):
    return page.evaluate("fetch('/api/me',{cache:'no-store'}).then(r=>r.json())").get("profile")

results.clear()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"))
    fake("/reset-limits", "POST")
    email = f"signup-{RUN}@test.local"
    ctx = b.new_context(); page = ctx.new_page()
    page.clock.install()
    page.goto(f"{BASE}/login?next=%2Faccount%2Forders")
    page.get_by_role("tab", name=re.compile("Password")).click()
    page.get_by_role("tab", name="Create account").click()
    page.locator("#name").fill("New Customer")
    page.locator("#email").fill(email)
    page.locator("#password").fill("Secret123!")
    page.locator("form").get_by_role("button", name="Create account").click()
    expect(page.get_by_text("Confirm your email")).to_be_visible(timeout=10000)
    check("password sign-up → code screen (no admin 'Confirm email' needed)", page.locator("#signup-code").is_visible())
    page.locator("#signup-code").fill("000000" if inbox(email) != "000000" else "111111")
    page.get_by_role("button", name=re.compile("Confirm & sign in")).click()
    expect(page.get_by_text(WRONG)).to_be_visible(timeout=10000)
    check("wrong signup code → clear message, not signed in", me(page) is None)
    page.locator("#signup-code").fill(inbox(email))
    page.get_by_role("button", name=re.compile("Confirm & sign in")).click()
    page.wait_for_url(re.compile(r"/account/orders"), timeout=20000)
    check("right signup code → signed in, sent to the intended page", me(page) is not None and "/account/orders" in page.url, page.url)
    ctx.close()

    # Unconfirmed account trying to sign in later.
    fake("/reset-limits", "POST")
    email2 = f"unconfirmed-{RUN}@test.local"
    ctx = b.new_context(); page = ctx.new_page()
    page.clock.install()
    page.goto(f"{BASE}/login")
    page.get_by_role("tab", name=re.compile("Password")).click()
    page.get_by_role("tab", name="Create account").click()
    page.locator("#name").fill("Later Customer"); page.locator("#email").fill(email2); page.locator("#password").fill("Secret123!")
    page.locator("form").get_by_role("button", name="Create account").click()
    expect(page.get_by_text("Confirm your email")).to_be_visible(timeout=10000)
    old = inbox(email2)
    page.get_by_role("button", name="Back").click()
    page.locator("#email").fill(email2); page.locator("#password").fill("Secret123!")
    page.locator("form").get_by_role("button", name="Sign in", exact=True).click()
    expect(page.get_by_text(re.compile("isn't confirmed yet"))).to_be_visible(timeout=10000)
    check("unconfirmed sign-in → code screen (not a dead end)", page.locator("#signup-code").is_visible())
    fake("/reset-limits", "POST")
    page.get_by_role("button", name="Send a new code").click()
    expect(page.get_by_text(re.compile("New code sent"))).to_be_visible(timeout=10000)
    check("…'Send a new code' sends a fresh code (cooldown starts)", inbox(email2) != old and page.get_by_role("button", name=re.compile(r"Resend code in \d+s")).is_disabled())
    page.locator("#signup-code").fill(old)
    page.get_by_role("button", name=re.compile("Confirm & sign in")).click()
    expect(page.get_by_text(WRONG)).to_be_visible(timeout=10000)
    check("…the old code no longer works", me(page) is None)
    page.locator("#signup-code").fill(inbox(email2))
    page.get_by_role("button", name=re.compile("Confirm & sign in")).click()
    page.wait_for_url(re.compile(r"/account"), timeout=20000)
    check("…the new code signs in", me(page) is not None)
    ctx.close(); b.close()
failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
