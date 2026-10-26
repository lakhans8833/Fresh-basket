"""Phone-app sign-in flows with Supabase Auth mocked in the browser (no real emails are sent).

Usage: python3 e2e/auth_mock.py http://localhost:8081   (same web build + local API as e2e/smoke.py)
/api/auth/config is answered with mode "supabase" and a fake Supabase URL; the Supabase endpoints
(settings, otp, verify, signup) and /api/me are answered here. Checks:
- email code: "Email me a code" → code step → wrong code shows a clear error → right code signs in;
- password sign-up that needs confirmation → code step (type "signup") → signed in;
- "Continue with Google" shows only when Google is on in Supabase.
"""
import json, re, sys
from playwright.sync_api import sync_playwright

A = sys.argv[1]
SB = "https://mock-project.supabase.co"
res = []
def check(name, ok, detail=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""), flush=True)

SESSION = {"access_token": "tok-123", "refresh_token": "ref-123", "expires_in": 3600, "token_type": "bearer",
           "user": {"id": "00000000-0000-4000-8000-0000000000e1", "email": "new@example.com", "aud": "authenticated", "role": "authenticated"}}
PROFILE = {"id": SESSION["user"]["id"], "email": "new@example.com", "fullName": "New Customer", "phone": None, "role": "customer"}

def run(google: bool):
    calls = []
    with sync_playwright() as p:
        b = p.chromium.launch(); c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); pg = c.new_page()
        J = lambda route, body, status=200: route.fulfill(status=status, content_type="application/json", body=json.dumps(body), headers={"access-control-allow-origin": "*", "access-control-allow-headers": "*"})
        pg.route("**/api/auth/config", lambda r: J(r, {"mode": "supabase", "supabaseUrl": SB, "supabaseAnonKey": "anon-key"}))
        def me(route):
            auth = route.request.headers.get("authorization", "")
            J(route, {"profile": PROFILE if auth == "Bearer tok-123" else None})
        pg.route("**/api/me", me)
        def supa(route):
            req = route.request; path = req.url.split(".supabase.co")[1]
            if req.method == "OPTIONS": return J(route, {})
            body = json.loads(req.post_data or "{}")
            calls.append((path.split("?")[0], body))
            if path.startswith("/auth/v1/settings"): return J(route, {"external": {"email": True, "google": google}})
            if path.startswith("/auth/v1/otp"): return J(route, {})
            if path.startswith("/auth/v1/signup"): return J(route, {"id": SESSION["user"]["id"], "email": body.get("email")})  # no session: needs confirmation
            if path.startswith("/auth/v1/verify"):
                if body.get("token") != "123456": return J(route, {"code": "otp_expired", "msg": "Token has expired or is invalid", "error_code": "otp_expired"}, 403)
                return J(route, SESSION)
            if path.startswith("/auth/v1/resend"): return J(route, {})
            return J(route, {})
        pg.route(SB + "/**", supa)
        pg.goto(A + "/login", wait_until="networkidle"); pg.wait_for_timeout(1500)
        out = {"google_button": pg.get_by_text("Continue with Google").count() == 1}
        if google:
            b.close(); return out, calls
        # Email code flow
        pg.get_by_label("Email", exact=True).first.fill("new@example.com")
        pg.get_by_text("Email me a code").click(); pg.wait_for_timeout(800)
        out["code_step"] = pg.get_by_text("Check your email").count() >= 1 and pg.get_by_label("Code from the email").count() == 1
        out["otp_call"] = any(p == "/auth/v1/otp" and b.get("email") == "new@example.com" and b.get("create_user") is True for p, b in calls)
        pg.get_by_label("Code from the email").fill("999999"); pg.get_by_text("Verify & sign in").click(); pg.wait_for_timeout(800)
        out["wrong_code_message"] = pg.get_by_text(re.compile("wrong or has expired")).count() == 1
        out["resend_waits"] = pg.get_by_text(re.compile(r"Resend code in \d+s")).count() == 1
        pg.get_by_label("Code from the email").fill("123456"); pg.get_by_text("Verify & sign in").click(); pg.wait_for_timeout(2000)
        out["signed_in_after_code"] = "/login" not in pg.url
        out["verify_type_email"] = any(p == "/auth/v1/verify" and b.get("type") == "email" and b.get("token") == "123456" for p, b in calls)
        c.close()
        # Password sign-up that needs confirmation → code step (type signup)
        c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); pg = c.new_page()
        pg.route("**/api/auth/config", lambda r: J(r, {"mode": "supabase", "supabaseUrl": SB, "supabaseAnonKey": "anon-key"}))
        pg.route("**/api/me", me); pg.route(SB + "/**", supa)
        pg.goto(A + "/login", wait_until="networkidle"); pg.wait_for_timeout(1500)
        pg.get_by_text("Password", exact=True).click(); pg.get_by_text("Create account", exact=True).last.click(); pg.wait_for_timeout(300)
        pg.get_by_label("Your name").fill("New Customer"); pg.get_by_label("Email", exact=True).first.fill("new@example.com"); pg.get_by_label("Password", exact=True).last.fill("secret-pass-1")
        pg.get_by_role("button", name="Create account").last.click(); pg.wait_for_timeout(1000)
        out["signup_code_step"] = pg.get_by_text("Confirm & sign in").count() == 1
        pg.get_by_label("Code from the email").fill("123456"); pg.get_by_text("Confirm & sign in").click(); pg.wait_for_timeout(2000)
        out["signed_in_after_signup_code"] = "/login" not in pg.url
        out["verify_type_signup"] = any(p == "/auth/v1/verify" and b.get("type") == "signup" for p, b in calls)
        b.close()
    return out, calls

off, _ = run(google=False)
check("Google button hidden while Google is off in Supabase", not off.pop("google_button"))
for k, v in off.items(): check(k, v)
on, _ = run(google=True)
check("Google button shown once Google is on", on["google_button"])
print(f"{sum(res)}/{len(res)} checks passed")
sys.exit(0 if all(res) else 1)
