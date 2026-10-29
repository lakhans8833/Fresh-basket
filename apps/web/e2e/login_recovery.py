"""Combined browser test of sign-in, email-link errors and password recovery through the REAL app
(proxy → /auth/callback → /login → /reset-password), against e2e/fake-supabase-auth-recovery.mjs.

What is real: the Next.js production build, proxy, callback route, pages, cookies, the session check
(/api/me) and the database. What is faked: Supabase Auth itself (the fake GoTrue server), and in the
"temporary failure" cases the /api/me response is replaced in the browser with a 503.

Setup (see the README block at the top of the fake server):
  USER_A_ID=<uuid> USER_B_ID=<uuid> node e2e/fake-supabase-auth-recovery.mjs &
  NEXT_PUBLIC_SUPABASE_URL=http://localhost:54398 NEXT_PUBLIC_SUPABASE_ANON_KEY=x next build && next start
  (A must be role 'staff' and B role 'customer' in profiles.)
Usage: python3 apps/web/e2e/login_recovery.py <base_url> <fake_auth_url>"""
import json, os, re, sys, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1]
AUTH = sys.argv[2]
A, B, PW = "a@test.local", "b@test.local", "Secret123!"
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))


def changes():
    return json.loads(urllib.request.urlopen(f"{AUTH}/changes").read())


def password_form(page, email, pw):
    page.get_by_role("tab", name=re.compile("Password")).click()
    page.locator("#email").fill(email)
    page.locator("#password").fill(pw)
    page.locator("form").get_by_role("button", name="Sign in", exact=True).click()


def customer_login(page, email, pw=PW):
    page.goto(f"{BASE}/login")
    password_form(page, email, pw)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"))

    # 1. Account A signed in + EXPIRED recovery link for B (Supabase error redirect to the callback).
    ctx = b.new_context(); page = ctx.new_page()
    customer_login(page, A)
    page.wait_for_url(re.compile(r"/account"), timeout=20000)
    page.goto(f"{BASE}/auth/callback?error=access_denied&error_code=otp_expired&error_description=expired&next=%2Freset-password")
    page.wait_for_load_state("networkidle")
    check("A signed in + expired link → stays on /login (not /reset-password)", "/login" in page.url and "/reset-password" not in page.url.split("?")[0], page.url)
    check("…shows the expired-link error", page.get_by_text("expired or was already used").count() > 0)
    check("…says which account is still signed in", page.get_by_text(f"still signed in as {A}").count() > 0)
    # Same through the token_hash flow (verify → 403 otp_expired).
    page.goto(f"{BASE}/auth/callback?token_hash=stale-token&type=recovery")
    page.wait_for_load_state("networkidle")
    check("A signed in + expired token_hash → /login?error=expired", re.search(r"/login\?.*error=expired", page.url) is not None, page.url)
    check("…error URL carries no token", "stale-token" not in page.url and "token_hash" not in page.url, page.url)
    # A opening /reset-password directly is a NORMAL password change for A, clearly labelled.
    page.goto(f"{BASE}/reset-password")
    check("/reset-password while signed in as A is labelled as A's password", page.locator("#main").get_by_test_id("password-account").inner_text() == A and page.get_by_text(f"You're signed in as {A}").count() > 0)
    ctx.close()

    # 2. Expired recovery link with NO session.
    ctx = b.new_context(); page = ctx.new_page()
    page.goto(f"{BASE}/auth/callback?token_hash=old&type=recovery")
    page.wait_for_load_state("networkidle")
    check("no session + expired link → /login with error", "error=expired" in page.url and page.get_by_text("expired or was already used").count() > 0, page.url)
    check("…no 'still signed in' notice", page.get_by_text("still signed in").count() == 0)
    page.goto(f"{BASE}/reset-password")
    check("/reset-password without a session says the link didn't work", page.get_by_text("has expired or was already used").count() > 0)

    # 3. Successful recovery for B and password update (applies to B, not anyone else).
    page.goto(f"{BASE}/auth/callback?token_hash=good-b&type=recovery")
    page.wait_for_url(re.compile(r"/reset-password"), timeout=20000)
    check("valid recovery link → reset page for B", page.locator("#main").get_by_test_id("password-account").inner_text() == B)
    check("…in recovery mode (no 'signed in as' warning)", page.get_by_text("You're signed in as").count() == 0)
    page.locator("#new-password").fill("NewSecret456!")
    page.locator("#confirm-password").fill("NewSecret456!")
    page.get_by_role("button", name="Save new password").click()
    expect(page.get_by_text("Password updated")).to_be_visible(timeout=10000)
    check("password change applied to B only", changes()[-1:] == [B], changes())
    ctx.close()

    # 4. Correct staff password + temporary /api/me failure → retry, session kept, no "no access".
    ctx = b.new_context(); page = ctx.new_page()
    fail = {"n": 1}
    def me(route):
        if route.request.method == "GET" and fail["n"] > 0:
            return route.fulfill(status=503, content_type="application/json", body=json.dumps({"error": "Service unavailable"}))
        return route.continue_()
    page.route("**/api/me*", me)
    page.goto(f"{BASE}/admin/login")
    page.locator("#admin-email").fill(A)
    page.locator("#admin-password").fill(PW)
    page.get_by_role("button", name="Sign in").click()
    expect(page.get_by_text("couldn't check your staff access")).to_be_visible(timeout=15000)
    check("staff + /api/me 503 → retryable error, not 'no admin access'", page.get_by_text("doesn't have admin access").count() == 0)
    check("…still on the sign-in page (no silent redirect)", "/admin/login" in page.url)
    fail["n"] = 0  # the server is reachable again
    page.get_by_role("button", name="Try again").click()
    page.wait_for_url(re.compile(r"/admin(?!/login)"), timeout=20000)
    check("…retry confirms staff and opens the panel (session was kept)", "/admin/login" not in page.url, page.url)
    ctx.close()

    # 5. Authenticated customer attempting admin access → confirmed no access, signed out.
    ctx = b.new_context(); page = ctx.new_page()
    page.goto(f"{BASE}/admin/login")
    page.locator("#admin-email").fill(B)
    page.locator("#admin-password").fill("NewSecret456!")
    page.get_by_role("button", name="Sign in").click()
    expect(page.get_by_text("doesn't have admin access")).to_be_visible(timeout=15000)
    me_json = page.evaluate("fetch('/api/me',{cache:'no-store'}).then(r=>r.json())")
    check("customer at admin login → 'no admin access' and signed out", me_json.get("profile") is None, me_json)
    ctx.close()

    # 6. Successful customer login + failed profile loading → no silent navigation, retry works.
    ctx = b.new_context(); page = ctx.new_page()
    fail2 = {"n": 1}
    def me2(route):
        if route.request.method == "GET" and fail2["n"] > 0:
            return route.fulfill(status=500, content_type="application/json", body=json.dumps({"error": "Something went wrong"}))
        return route.continue_()
    page.route("**/api/me*", me2)
    page.goto(f"{BASE}/login?next=%2Fcheckout")
    password_form(page, B, "NewSecret456!")
    expect(page.get_by_text("couldn't load your account")).to_be_visible(timeout=15000)
    check("customer login + /api/me 500 → stays on /login with a retry", "/login" in page.url)
    fail2["n"] = 0
    page.get_by_role("button", name="Try again").click()
    page.wait_for_url(re.compile(r"/checkout"), timeout=20000)
    check("…retry continues to the original destination (/checkout)", "/checkout" in page.url)
    ctx.close()

    # 7. Error links through the PROXY keep a validated next; malicious next stays on this site.
    ctx = b.new_context(); page = ctx.new_page()
    page.goto(f"{BASE}/?error=access_denied&error_code=otp_expired&next=%2Fcheckout")
    check("proxy: error link keeps next=/checkout", re.search(r"/login\?.*next=%2Fcheckout", page.url) is not None, page.url)
    page.goto(f"{BASE}/auth/callback?error=access_denied&error_code=otp_expired&next=%2Freset-password%3Fnext%3D%252Fadmin%252Flogin")
    check("callback: nested admin reset destination kept", "next=%2Freset-password%3Fnext%3D%252Fadmin%252Flogin" in page.url, page.url)
    for bad in ["%2F.%2F%2Fevil.com", "https%3A%2F%2Fevil.com", "%2F%2Fevil.com", "%2Fx%2F..%2F%2Fevil.com"]:
        page.goto(f"{BASE}/?error_code=otp_expired&next={bad}")
        check(f"proxy: malicious next {bad} dropped/same-origin", page.url.startswith(BASE) and "evil.com" not in page.url, page.url)
        page.goto(f"{BASE}/auth/callback?error_code=otp_expired&next={bad}")
        check(f"callback: malicious next {bad} not forwarded", page.url.startswith(BASE) and "evil.com" not in page.url, page.url)
    ctx.close()
    b.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
