"""Capture screenshots of pages for visual review.
Usage: python3 scripts/screenshot.py <out_dir> <width> <url> [<url> ...]
Set COOKIE='name=value' to send a session cookie."""
import os, sys, re
from playwright.sync_api import sync_playwright

out, width, urls = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
os.makedirs(out, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    ctx = b.new_context(viewport={"width": width, "height": 900}, device_scale_factor=1 if width > 600 else 2)
    if os.environ.get("COOKIE"):
        n, v = os.environ["COOKIE"].split("=", 1)
        ctx.add_cookies([{"name": n, "value": v, "url": urls[0]}])
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    for u in urls:
        page.goto(u, wait_until="networkidle")
        page.wait_for_timeout(int(os.environ.get("WAIT", "600")))
        name = re.sub(r"[^a-z0-9]+", "_", u.split("//", 1)[1].split("/", 1)[-1].lower()).strip("_") or "home"
        page.screenshot(path=f"{out}/{name}_{width}.png", full_page=os.environ.get("FULL", "1") == "1")
        print(f"{out}/{name}_{width}.png")
    if errors:
        print("CONSOLE ERRORS:", *errors[:10], sep="\n  ")
    b.close()
