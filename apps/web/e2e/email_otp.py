"""Browser test of the EMAIL CODE sign-in on /login (send → resend → verify), through the REAL app.

What is real: the Next.js production build, the login page + OtpLogin component, supabase-js in the
browser, /api/me, the session cookies and the database (a fresh account is created on first sign-in).
What is faked: Supabase Auth itself (e2e/fake-supabase-auth-otp.mjs — no email is sent; the test reads
the code from the fake's /inbox), and the two "network failure" cases (requests aborted in the browser).
This does NOT test the real Supabase project, its email templates or real email delivery.

Setup:
  DATABASE_URL=<test db> MAX_FREQUENCY=60 node e2e/fake-supabase-auth-otp.mjs &
  NEXT_PUBLIC_SUPABASE_URL=http://localhost:54397 NEXT_PUBLIC_SUPABASE_ANON_KEY=x next build && next start -p 3100
Usage: python3 e2e/email_otp.py http://localhost:3100 http://localhost:54397"""
import json, os, re, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE, AUTH = sys.argv[1], sys.argv[2]
RUN = str(int(time.time()))
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))


def fake(path, method="GET"):
    return json.loads(urllib.request.urlopen(urllib.request.Request(f"{AUTH}{path}", method=method, data=b"" if method == "POST" else None)).read())


def inbox(email):
    return fake(f"/inbox?email={email}")["code"]


def open_login(b, next_path="/account/orders"):
    ctx = b.new_context()
    page = ctx.new_page()
    page.goto(f"{BASE}/login?next={next_path.replace('/', '%2F')}")
    return ctx, page


def send(page, email):
    page.locator("#otp-email").fill(email)
    page.get_by_role("button", name=re.compile(r"^Send code")).click()


def enter(page, code):
    page.locator("#otp-code").fill(code)
    page.get_by_role("button", name=re.compile("Verify")).click()


def me(page):
    return page.evaluate("fetch('/api/me',{cache:'no-store'}).then(r=>r.json())").get("profile")


WRONG = "That code is wrong, has expired or was already used"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"))
    fake("/reset-limits", "POST")

    # 1. Fresh email: send → wrong code → right code → signed in → intended page.
    new = f"new-{RUN}@test.local"
    ctx, page = open_login(b)
    before = fake("/stats")["otpRequests"]
    page.locator("#otp-email").fill(new)
    btn = page.get_by_role("button", name=re.compile(r"^Send code"))
    btn.dblclick()  # double tap must not send two emails
    expect(page.locator("#otp-code")).to_be_visible(timeout=10000)
    check("double-click Send → exactly one code request", fake("/stats")["otpRequests"] - before == 1, fake("/stats"))
    check("code step says where the code went", page.get_by_text(f"Code sent to").count() > 0)
    check("resend is on cooldown right after sending", page.get_by_role("button", name=re.compile(r"Resend code in \d+s")).is_disabled())
    enter(page, "000000" if inbox(new) != "000000" else "111111")
    expect(page.get_by_text(WRONG)).to_be_visible(timeout=10000)
    check("wrong code → clear message, Verify usable again", page.get_by_role("button", name=re.compile("Verify")).is_enabled())
    vb = fake("/stats")["verifyRequests"]
    page.locator("#otp-code").fill(inbox(new))
    page.get_by_role("button", name=re.compile("Verify")).dblclick()
    page.wait_for_url(re.compile(r"/account/orders"), timeout=20000)
    check("right code → signed in and sent to the intended page (/account/orders)", "/account/orders" in page.url, page.url)
    check("double-click Verify → exactly one verify request", fake("/stats")["verifyRequests"] - vb == 1, fake("/stats"))
    prof = me(page)
    check("new account exists and is signed in", prof is not None and prof.get("email") == new, prof)
    used_code = inbox(new)
    ctx.close()

    # 2. Reused code (already used to sign in) and a code replaced by Resend (real Resend button,
    #    with the browser clock fast-forwarded past the 60 s cooldown).
    fake("/reset-limits", "POST")
    ctx = b.new_context(); page = ctx.new_page()
    page.clock.install()
    page.goto(f"{BASE}/login?next=%2Faccount%2Forders")
    send(page, new)
    expect(page.locator("#otp-code")).to_be_visible(timeout=10000)
    first = inbox(new)
    enter(page, used_code if used_code != first else "999999")
    expect(page.get_by_text(WRONG)).to_be_visible(timeout=10000)
    check("reused (already used) code → rejected with clear message", me(page) is None)
    fake("/reset-limits", "POST")
    for _ in range(62):  # the countdown re-arms a 1 s timer after each render
        page.clock.run_for(1000)
        page.wait_for_timeout(5)
    resend = page.get_by_role("button", name="Resend code", exact=True)
    expect(resend).to_be_enabled(timeout=5000)
    before = fake("/stats")["otpRequests"]
    resend.dblclick()
    expect(page.get_by_text("Use the code from this newest email")).to_be_visible(timeout=10000)
    check("Resend after cooldown → one new code + 'use the newest email' hint", fake("/stats")["otpRequests"] - before == 1, fake("/stats"))
    second = inbox(new)
    enter(page, first)
    expect(page.get_by_text(WRONG)).to_be_visible(timeout=10000)
    check("code replaced by a newer one → rejected", me(page) is None and first != second)
    enter(page, second)
    page.wait_for_url(re.compile(r"/account/orders"), timeout=20000)
    check("newest code → signed in", me(page) is not None)
    ctx.close()

    # 3. Expired code.
    fake("/reset-limits", "POST")
    ctx, page = open_login(b)
    send(page, new)
    expect(page.locator("#otp-code")).to_be_visible(timeout=10000)
    fake(f"/expire?email={new}", "POST")
    enter(page, inbox(new))
    expect(page.get_by_text(WRONG)).to_be_visible(timeout=10000)
    check("expired code → rejected with clear message, not signed in", me(page) is None)

    # 4. Server cooldown (Supabase 429 "after N seconds") → message with seconds + disabled button.
    page.get_by_role("button", name=re.compile("Change email")).click()
    send(page, new)  # same email again within 60 s → the server refuses
    expect(page.get_by_text(re.compile(r"Too many code requests\. Please wait \d+ seconds"))).to_be_visible(timeout=10000)
    check("server rate limit → wait message and Send disabled with countdown", page.get_by_role("button", name=re.compile(r"Send code \(wait \d+s\)")).is_disabled())
    ctx.close()

    # 5. Network failures: loading resets, message is clear, retry works.
    fake("/reset-limits", "POST")
    ctx, page = open_login(b)
    page.route("**/auth/v1/otp*", lambda r: r.abort("internetdisconnected"))
    send(page, f"net-{RUN}@test.local")
    expect(page.get_by_text("Couldn't reach the sign-in service")).to_be_visible(timeout=15000)
    check("send fails (offline) → message + Send usable again (no stuck spinner)", page.get_by_role("button", name=re.compile(r"^Send code$")).is_enabled())
    page.unroute("**/auth/v1/otp*")
    page.get_by_role("button", name=re.compile(r"^Send code$")).click()
    expect(page.locator("#otp-code")).to_be_visible(timeout=10000)
    check("…retry after the network is back sends the code", inbox(f"net-{RUN}@test.local") is not None)
    page.route("**/auth/v1/verify*", lambda r: r.abort("internetdisconnected"))
    code = inbox(f"net-{RUN}@test.local")
    enter(page, code)
    expect(page.get_by_text("Couldn't reach the sign-in service")).to_be_visible(timeout=15000)
    check("verify fails (offline) → message + Verify usable again", page.get_by_role("button", name=re.compile("Verify")).is_enabled())
    page.unroute("**/auth/v1/verify*")
    page.get_by_role("button", name=re.compile("Verify")).click()
    page.wait_for_url(re.compile(r"/account/orders"), timeout=20000)
    check("…same code works once the network is back", me(page) is not None)
    ctx.close()

    # 6. Code length: 8-digit input is accepted by the form (Supabase allows 6–10), 5 digits is not.
    fake("/reset-limits", "POST")
    ctx, page = open_login(b)
    send(page, f"len-{RUN}@test.local")
    expect(page.locator("#otp-code")).to_be_visible(timeout=10000)
    vb = fake("/stats")["verifyRequests"]
    enter(page, "12345")
    expect(page.get_by_text(re.compile(r"Enter the 6-digit code"))).to_be_visible(timeout=5000)
    check("5 digits → asked for the full code, no request sent", fake("/stats")["verifyRequests"] == vb)
    enter(page, "12345678")
    expect(page.get_by_text(WRONG)).to_be_visible(timeout=10000)
    check("8 digits → sent to the server (longer configured codes work)", fake("/stats")["verifyRequests"] == vb + 1)
    ctx.close()
    b.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
