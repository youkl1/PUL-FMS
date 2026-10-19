# mermaid/ — 时序图与轻量草图目录

> 选型组合（2026-09-28 定，权威源 `~/.claude/skills/fireworks-tech-graph/SKILL.md` 末节）：
> **评审级图纸**（泳道/流程/架构/字段级 ER）→ `../fireworks/`；
> **时序图/轻量草图**（生命线布局无交叉问题）→ 本目录 Mermaid。

## 约定

- 唯一事实源 = `NN-*.mmd`（可 git diff）；`.svg`/`.png` 为渲染产物
- 首行 `%%` 注释写：图名、口径来源、渲染命令
- 编号续接 fireworks 图纸序号（15 起），图纸库浏览壳 `../index.html` 用 `dir: 'mermaid'` 登记

## 渲染

```bash
python _render.py            # 渲染全部 .mmd → 同名 .svg + .png
python _render.py 15         # 只渲染指定前缀
```

依赖：Python playwright（已装）+ 仓库根 `node_modules/mermaid@10`（UMD 构建，file:// 直载，零外网）。
`_render.py` 会写临时 `_render.html` 引导页、跑完自删。
