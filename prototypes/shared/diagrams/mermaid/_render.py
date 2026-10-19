# -*- coding: utf-8 -*-
"""
_render.py — mermaid/ 目录图纸渲染器（唯一事实源 = 同目录 .mmd）
用法：python _render.py            # 渲染全部 .mmd → .svg + .png
      python _render.py 15-xxx     # 只渲染指定前缀
原理：playwright(chromium) + 仓库根 node_modules/mermaid@10 的 UMD 构建
（写到本地 _render.html 再 page.goto(file://)，经典 script 可跨 file:// 加载，无需外网）
"""
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
MERMAID_JS = HERE.parents[3] / 'node_modules' / 'mermaid' / 'dist' / 'mermaid.min.js'
BOOT = HERE / '_render.html'


def absolutize(svg: str) -> str:
    """mermaid 默认输出 width="100%" → <img>/file:// 场景无固有尺寸显示空白；
    从 viewBox 取绝对宽高写回根元素（2026-10-01 图纸壳空白修复）"""
    m = re.search(r'viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"', svg)
    if not m:
        return svg
    w, h = m.group(3), m.group(4)
    svg = svg.replace('width="100%"', f'width="{w}" height="{h}"', 1)
    return svg

HTML = """<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script src="{mermaid}"></script>
<script>
mermaid.initialize({{ startOnLoad: false, theme: 'default', fontFamily: '"Microsoft YaHei", sans-serif',
  sequence: {{ actorFontSize: 14, noteFontSize: 13, messageFontSize: 13 }} }});
window.renderOne = async (src) => {{
  const {{ svg }} = await mermaid.render('g' + Math.random().toString(36).slice(2), src);
  return svg;
}};
window.boot = 'ok';
</script></body></html>"""


def render(page, mmd_path: Path) -> None:
    src = mmd_path.read_text(encoding='utf-8')
    src = '\n'.join(l for l in mmd_path.read_text(encoding='utf-8').splitlines()
                    if not l.strip().startswith('%%'))
    svg = page.evaluate('(s) => window.renderOne(s)', src)
    svg = absolutize(svg)
    mmd_path.with_suffix('.svg').write_text(svg, encoding='utf-8')
    page.evaluate('(s) => { document.body.innerHTML = `<div id="container">${s}</div>`; }', svg)
    page.locator('#container svg').screenshot(path=str(mmd_path.with_suffix('.png')))
    print(f'  ok {mmd_path.name} → svg/png')


def main() -> None:
    prefix = sys.argv[1] if len(sys.argv) > 1 else ''
    targets = sorted(p for p in HERE.glob('*.mmd') if p.stem.startswith(prefix))
    if not targets:
        sys.exit('没有匹配的 .mmd')
    if not MERMAID_JS.exists():
        sys.exit(f'缺少 mermaid UMD：{MERMAID_JS}（仓库根 npm i -D mermaid@10）')
    BOOT.write_text(HTML.format(mermaid=MERMAID_JS.as_uri()), encoding='utf-8')
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})
        page.goto(BOOT.as_uri())
        page.wait_for_function('() => window.boot === "ok"')
        for t in targets:
            render(page, t)
        browser.close()
    BOOT.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
