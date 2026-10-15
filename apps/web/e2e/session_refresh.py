"""Session-refresh test: admin pages must keep working across access-token expiries.

Setup (see header of e2e/fake-supabase-auth.mjs):
  USER_ID=<uuid of an admin profile> TTL=60 node e2e/fake-supabase-auth.mjs &
  NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=x npx next build
  NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=x APP_SECRET=<32+ chars> npx next start -p 3100
  python3 e2e/session_refresh.py 3
The fake server signs in admin@test.local / Secret123!, rotates refresh tokens and revokes the
session on refresh-token reuse after 10 s, like Supabase."""
import re, json, time, urllib.request, sys
from playwright.sync_api import sync_playwright, expect
B="http://localhost:3100"; ROUNDS=int(sys.argv[1]) if len(sys.argv)>1 else 3
stats=lambda: json.loads(urllib.request.urlopen("http://localhost:54399/stats").read())
APIS=["/api/admin/stats","/api/admin/orders","/api/admin/products","/api/admin/categories","/api/admin/inventory","/api/admin/banners","/api/me"]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    pg=b.new_page(viewport={"width":1280,"height":900})
    pg.goto(B+"/login"); pg.wait_for_load_state("networkidle")
    pg.get_by_role("tab", name="Password").click()
    pg.locator("#email").fill("admin@test.local"); pg.locator("#password").fill("Secret123!")
    pg.locator("form").get_by_role("button", name="Sign in").click()
    pg.wait_for_url(re.compile(r"/admin"), timeout=20000); print("signed in ->", pg.url.split("3100")[1])
    ok=True
    for r in range(ROUNDS):
        print(f"round {r+1}: waiting 65 s for the access token to expire…", flush=True)
        time.sleep(65)
        for path in ["/admin","/admin/orders","/admin/products","/admin/inventory"]:
            pg.goto(B+path); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(500)
            bad=pg.get_by_text(re.compile("Please sign in|Couldn't load this")).count()
            if "/login" in pg.url or bad: ok=False; print("  FAIL on", path, "->", pg.url, "bad text:", bad)
        codes=pg.evaluate("async (apis)=>Promise.all(apis.map(a=>fetch(a,{cache:'no-store'}).then(r=>r.status)))", APIS)
        print("  parallel API statuses:", codes, "| auth stats:", stats())
        if any(c==401 for c in codes): ok=False
    print("RESULT:", "OK - stayed signed in" if ok else "FAILED")
    b.close()
