"""Regression: the admin dashboard hydrates without React error #418 when a "x min ago" label ticks over
between the server render and the browser, and unknown pages get a real 404 title.

Usage: python3 e2e/admin_hydration.py http://localhost:3200 <DATABASE_URL of that local dev-mode DB>
The JavaScript is delayed 1.5 s and the newest order is made 59.2 s old, so the label is "just now" on
the server and "1 min ago" in the browser. Before the fix this failed 4 out of 4 times.
"""
import re, subprocess, sys, time
from playwright.sync_api import sync_playwright

BASE, DB = sys.argv[1], sys.argv[2]
sql = lambda q: subprocess.run(["psql", DB, "-Atc", q], capture_output=True, text=True, check=True).stdout.strip()
order = sql("select id from orders order by created_at desc limit 1")
assert order, "needs at least one order in the database"

fails = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    c = b.new_context(); pg = c.new_page()
    pg.goto(BASE + "/admin/login?next=%2Fadmin", wait_until="networkidle")
    pg.locator("main").get_by_label("Email").first.fill("admin@freshbasket.local")
    pg.get_by_role("button", name="Sign in").first.click()
    pg.wait_for_url(re.compile(r"/admin/?$"))
    state = c.storage_state(); c.close()
    for i in range(4):
        c = b.new_context(storage_state=state); pg = c.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
        pg.route(re.compile(r"/_next/static/.*\.js"), lambda r: (time.sleep(1.5), r.continue_()))
        sql(f"update orders set created_at = now() - interval '59.2 seconds' where id = '{order}'")
        pg.goto(BASE + "/admin", wait_until="networkidle"); pg.wait_for_timeout(1000)
        bad = [e for e in errs if "418" in e or "Hydration" in e]
        print(("FAIL" if bad else "PASS"), f"dashboard load {i + 1}: no hydration error", bad[:1])
        fails += bool(bad); c.close()
    pg = b.new_page()
    resp = pg.goto(BASE + "/no-such-page-" + str(int(time.time())), wait_until="networkidle")
    title_ok = resp.status == 404 and "not found" in pg.title().lower()
    print(("PASS" if title_ok else "FAIL"), "unknown page → 404 with a 'Page not found' title:", resp.status, pg.title())
    fails += not title_ok
    b.close()
print(f"{5 - fails}/5 checks passed")
sys.exit(1 if fails else 0)
