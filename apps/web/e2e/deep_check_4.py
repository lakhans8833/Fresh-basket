"""Front-end fixes from the 28 Oct 2026 deep check, on a local production build.

Usage: python3 e2e/deep_check_4.py http://localhost:3200
- Phone: the Price / Discount filter menus open on screen (not clipped by the scrolling filter row).
- Cart drawer: pressing "+" with the keyboard keeps focus on "+" (it used to jump to "Close cart").
- Toasts on a phone don't cover the "View cart" bar.
- Printing: the site header, footer and bottom bars are hidden.
- Short screens (laptop at 200% zoom): the header scrolls away instead of covering the page.
"""
import re, sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1]
res = []
def check(name, ok, detail=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""), flush=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    # 1. Filters on a phone
    c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); pg = c.new_page()
    pg.goto(BASE + "/shop", wait_until="networkidle")
    for name in ("Price", "Discount"):
        pg.locator("summary", has_text=name).first.click()
        panel = pg.locator("details[open] > div").first
        expect(panel).to_be_visible()
        box = panel.bounding_box() or {"x": -1, "y": -1, "width": 0, "height": 0}
        inside = box["x"] >= 0 and box["y"] >= 0 and box["x"] + box["width"] <= 390 and box["y"] + box["height"] <= 844 and box["height"] > 60
        top = pg.evaluate("([x,y]) => document.elementFromPoint(x, y)?.closest('details[open]') !== null", [box["x"] + box["width"] / 2, box["y"] + box["height"] / 2])
        check(f"phone: {name} menu is on screen and on top", inside and top, str(box))
        pg.locator("summary", has_text=name).first.click()
    # 3. Toast vs cart bar
    pg.goto(BASE + "/product/tomato", wait_until="networkidle")
    pg.get_by_role("button", name=re.compile("Add to Cart", re.I)).first.click()
    toast = pg.locator('[aria-live="polite"] > div').first
    bar = pg.get_by_role("link", name=re.compile("View cart", re.I)).first
    if toast.count() and bar.count():
        t, cb = toast.bounding_box(), bar.bounding_box()
        overlap = t and cb and not (t["y"] + t["height"] <= cb["y"] or cb["y"] + cb["height"] <= t["y"])
        check("phone: toast doesn't cover the View cart bar", not overlap, f"{t} {cb}")
    else:
        check("phone: toast and cart bar shown", False, f"toast={toast.count()} bar={bar.count()}")
    c.close()

    # 2. Cart drawer keyboard focus (desktop)
    c = b.new_context(viewport={"width": 1366, "height": 900}); pg = c.new_page()
    pg.goto(BASE + "/product/tomato", wait_until="networkidle")
    pg.get_by_role("button", name=re.compile("Add to Cart", re.I)).first.click()
    pg.locator('header [aria-label^="Cart, "]:visible').first.click()
    inc = pg.get_by_role("dialog").get_by_role("button", name=re.compile("^Increase", re.I)).first
    inc.focus(); pg.keyboard.press("Enter"); pg.wait_for_timeout(800)
    focused = pg.evaluate("document.activeElement?.getAttribute('aria-label') || ''")
    check("drawer: focus stays on + after pressing it", focused.lower().startswith("increase"), focused)
    # 4. Print
    pg.keyboard.press("Escape")
    pg.emulate_media(media="print")
    hidden = pg.evaluate("""() => ['header', 'footer'].every(s => { const el = document.querySelector(s); return !el || getComputedStyle(el).display === 'none'; })""")
    check("print: site header and footer hidden", hidden)
    pg.emulate_media(media="screen")
    c.close()

    # 5. Short screen (1280x800 at 200% zoom ≈ 640x400)
    c = b.new_context(viewport={"width": 640, "height": 400}); pg = c.new_page()
    pg.goto(BASE + "/shop", wait_until="networkidle")
    pg.mouse.wheel(0, 900); pg.wait_for_timeout(400)
    pos = pg.evaluate("getComputedStyle(document.querySelector('header')).position")
    check("short screen: header is not sticky", pos == "static", pos)
    c.close()
    b.close()

print(f"\n{sum(res)}/{len(res)} checks passed")
sys.exit(0 if all(res) else 1)
