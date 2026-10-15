"""Unconfirmed email → "Resend confirmation email" (run against e2e/fake-supabase-auth.mjs, see e2e/session_refresh.py)."""
import json, urllib.request
from playwright.sync_api import sync_playwright, expect
B="http://localhost:3100"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"); pg=b.new_page()
    pg.goto(B+"/login"); pg.wait_for_load_state("networkidle"); pg.get_by_role("tab", name="Password").click()
    pg.locator("#email").fill("unconfirmed@test.local"); pg.locator("#password").fill("whatever123")
    pg.locator("form").get_by_role("button", name="Sign in").click()
    expect(pg.get_by_text("Please confirm your email first")).to_be_visible(); print("message: ok")
    pg.get_by_role("button", name="Resend confirmation email").click()
    expect(pg.get_by_text("Confirmation email sent to unconfirmed@test.local")).to_be_visible()
    print("resend calls:", json.loads(urllib.request.urlopen("http://localhost:54399/stats").read())["resends"])
    b.close()
