"""Unconfirmed account signs in with a password → "Confirm your email" step → "Send a new code"
(run against e2e/fake-supabase-auth.mjs, see e2e/session_refresh.py; the fake answers email_not_confirmed
for unconfirmed@test.local and counts /auth/v1/resend calls)."""
import json, os, re, urllib.request
from playwright.sync_api import sync_playwright, expect
B = "http://localhost:3100"
stats = lambda: json.loads(urllib.request.urlopen("http://localhost:54399/stats").read())
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")); pg = b.new_page()
    pg.goto(B + "/login"); pg.wait_for_load_state("networkidle"); pg.get_by_role("tab", name="Password").click()
    pg.locator("#email").fill("unconfirmed@test.local"); pg.locator("#password").fill("whatever123")
    pg.locator("form").get_by_role("button", name="Sign in").click()
    expect(pg.get_by_role("heading", name="Confirm your email")).to_be_visible()
    expect(pg.get_by_text("This account isn't confirmed yet")).to_be_visible(); print("confirm step: ok")
    before = stats()["resends"]
    pg.get_by_role("button", name="Send a new code").click()
    expect(pg.get_by_text(re.compile(r"New code sent to unconfirmed@test\.local"))).to_be_visible()
    expect(pg.get_by_role("button", name=re.compile(r"Resend code in \d+s"))).to_be_visible()
    after = stats()["resends"]
    print("resend calls:", after - before)
    assert after - before == 1, "exactly one resend request"
    print("RESEND CONFIRMATION E2E OK")
    b.close()
