"""Policy pages + Admin → Settings → Legal & policies on a local dev-mode build.

Usage: python3 e2e/policy_pages.py http://localhost:3200
- Privacy / Terms / Returns show no "[placeholder]" text and no "Template" banner, with or without details.
- Business details typed in Admin → Settings appear on the pages (and the "Last updated" date).
- The production Content-Security-Policy header is sent and the pages log no CSP violations.
Leaves the legal details EMPTY again at the end.
"""
import re, sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1]
PAGES = ["/privacy", "/terms", "/returns"]
res = []
def check(name, ok, detail=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""), flush=True)

FIELDS = {
    "Registered business name": "Test Traders", "Registration numbers (optional)": "GSTIN TEST123",
    "Registered address": "Shop 1, Test Market", "Grievance officer name": "Test Officer",
    "Grievance / privacy email": "grievance@x.example", "Courts for disputes (city, state)": "Test City",
}

def fill_legal(pg, values, date):
    pg.goto(BASE + "/admin/settings", wait_until="networkidle")
    for label, v in values.items():
        pg.get_by_label(label, exact=True).fill(v)
    pg.get_by_label("Policies last updated", exact=True).fill(date)
    pg.get_by_role("button", name="Save settings").click()
    expect(pg.get_by_text("All changes saved")).to_be_visible()

def sweep(c, tag, expect_text):
    for path in PAGES:
        pg = c.new_page(); errs = []
        pg.on("console", lambda m: m.type == "error" and errs.append(m.text[:160]))
        r = pg.goto(BASE + path, wait_until="networkidle")
        text = pg.locator("main").inner_text()
        left = re.findall(r"\[[A-Za-z][^\]]{2,80}\]", text)
        check(f"{tag} {path}: no [placeholder] text", not left, str(left[:3]))
        check(f"{tag} {path}: no Template banner", "Template" not in text)
        for t in expect_text.get(path, []):
            check(f"{tag} {path}: shows {t!r}", t in text)
        check(f"{tag} {path}: CSP header sent", "frame-ancestors 'self'" in (r.headers.get("content-security-policy") or ""))
        check(f"{tag} {path}: no console/CSP errors", not errs, str(errs[:2]))
        pg.close()

with sync_playwright() as p:
    b = p.chromium.launch()
    c = b.new_context(); pg = c.new_page()
    pg.goto(BASE + "/admin/login?next=%2Fadmin", wait_until="networkidle")
    pg.locator("main").get_by_label("Email").first.fill("admin@freshbasket.local")
    pg.get_by_role("button", name="Sign in").first.click()
    pg.wait_for_url(re.compile(r"/admin/?$"))

    fill_legal(pg, {k: "" for k in FIELDS}, "")
    pg.goto(BASE + "/admin", wait_until="networkidle")
    check("dashboard lists missing business details", pg.get_by_text("Business details missing on your policy pages").is_visible())
    anon = b.new_context()
    sweep(anon, "empty", {"/terms": ["governed by the laws of India."]})

    fill_legal(pg, FIELDS, "2026-10-27")
    pg.goto(BASE + "/admin", wait_until="networkidle")
    check("dashboard notice gone once filled in", pg.get_by_text("Business details missing on your policy pages").count() == 0)
    anon2 = b.new_context()
    sweep(anon2, "filled", {
        "/privacy": ["is operated by Test Traders (GSTIN TEST123), Shop 1, Test Market.", "Last updated: 27 October 2026", "Test Officer", "grievance@x.example"],
        "/terms": ["courts of Test City", "Test Officer"],
        "/returns": ["(Test Traders)", "Test Officer"],
    })

    fill_legal(pg, {k: "" for k in FIELDS}, "")
    b.close()

print(f"\n{sum(res)}/{len(res)} checks passed")
sys.exit(0 if all(res) else 1)
