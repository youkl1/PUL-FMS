#!/usr/bin/env python3
# _shot-12.py — playwright 截图 12-er-fields.svg → _shots/_shot-12.png（2x 清晰度）
import pathlib
from playwright.sync_api import sync_playwright

svg = pathlib.Path("12-er-fields.svg").resolve()
out = pathlib.Path("_shots/_shot-12.png")
out.parent.mkdir(exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(device_scale_factor=2)
    pg.goto(svg.as_uri())
    pg.locator("svg").first.screenshot(path=str(out))
    b.close()
print("wrote", out, out.stat().st_size, "bytes")
