"""Website "Continue with Google": shown only when Google is on in Supabase; opens Supabase's Google
sign-in with the right return address. Supabase is mocked in the browser (no real sign-in).

Usage: build and start the site with a fake Supabase project, then run:
  NEXT_PUBLIC_SUPABASE_URL=https://mock-project.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key \\
  DATABASE_URL=... APP_SECRET=... npx next build && npx next start -p 3200
  python3 e2e/google_signin.py http://localhost:3200
"""
import json, re, sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
SB = "https://mock-project.supabase.co"
res = []
def check(name, ok, detail=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""), flush=True)

for google in (False, True):
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 390, "height": 844})
        def make(google):
          def supa(route, _request=None):
            path = route.request.url.split(".supabase.co")[1]
            hdr = {"access-control-allow-origin": "*", "access-control-allow-headers": "*"}
            if path.startswith("/auth/v1/settings"):
                return route.fulfill(status=200, content_type="application/json", body=json.dumps({"external": {"email": True, "google": google}}), headers=hdr)
            if path.startswith("/auth/v1/authorize"):
                return route.fulfill(status=200, content_type="text/html", body="<h1>Google (mock)</h1>")
            return route.fulfill(status=200, content_type="application/json", body="{}", headers=hdr)
          return supa
        pg.route(SB + "/**", make(google))
        pg.goto(BASE + "/login?next=%2Fcheckout", wait_until="networkidle"); pg.wait_for_timeout(800)
        btn = pg.get_by_role("button", name=re.compile("Continue with Google"))
        if not google:
            check("button hidden while Google is off", btn.count() == 0)
        else:
            check("button shown once Google is on", btn.count() == 1)
            btn.click(); pg.wait_for_url(re.compile(r"/auth/v1/authorize"))
            check("goes to Supabase's Google sign-in", "provider=google" in pg.url, pg.url)
            check("returns to /auth/callback and then the page asked for", "redirect_to=http%3A%2F%2Flocalhost%3A3200%2Fauth%2Fcallback%3Fnext%3D%252Fcheckout" in pg.url, pg.url)
        b.close()
print(f"{sum(res)}/{len(res)} checks passed")
sys.exit(0 if all(res) else 1)
