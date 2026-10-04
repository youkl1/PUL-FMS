# 领用单全链统一状态机（图23 + 18/19 切片修订）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增图 23「领用单 · 全链统一状态机」（五态主流水线 + 三入口 + 扫码直生捷径），图 18/19 降为库房/药房视角切片并对齐五态口径，图纸浏览器与导览数据同步注册。

**Architecture:** 纯图纸任务，不动原型业务代码。图纸源文件为 fireworks-tech-graph JSON（`prototypes/shared/diagrams/fireworks/NN-name.json`），经 validate → render(svg+layout) → check → export-html 流水线产出；PNG 因本机无 CairoSVG 用无头 Edge 截图兜底。注册点两处：`prototypes/shared/diagrams/index.html`（图纸浏览器）+ `pul-fms-base-v1/scripts/guide-data.js`（导览）。

**Tech Stack:** fireworks-tech-graph skill（`C:/Users/游开龙/.claude/skills/fireworks-tech-graph/scripts/fireworks.py`）、Node.js 校验脚本、无头 Edge 截图。

**设计稿：** `docs/superpowers/specs/2026-10-04-pick-unified-state-machine-design.md`（四问已拍板，开放问题已闭环）

**⚠️ 提交纪律（硬规则）：** 工作树压着 Round AH/AL/AO 等往轮未提交改动。每个 commit 只 `git add` 本任务列出的具体文件，**禁止 `git add -A` / `git add .`**。

**通用命令前缀（每个渲染任务复用）：**

```bash
FW="C:/Users/游开龙/.claude/skills/fireworks-tech-graph/scripts/fireworks.py"
cd "d:/Claude-code/PUL-FMS/PUL-FMS/prototypes/shared/diagrams/fireworks"
python "$FW" validate architecture <name>.json          # 期望：通过，无 ERROR
python "$FW" render architecture <name>.json <name>.svg --report <NN>-layout.json   # 期望：写出 svg
python "$FW" check <name>.svg                            # 期望：geometry/collisions/composition/markers 全 ok，文字零截断
python "$FW" export-html <name>.svg <name>.html          # 期望：写出 html
```

PNG 兜底（export-png 需 CairoSVG，本机没有，用无头 Edge 截图）：

```bash
"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless --disable-gpu \
  --screenshot="<name>.png" --window-size=1400,920 \
  "file:///d:/Claude-code/PUL-FMS/PUL-FMS/prototypes/shared/diagrams/fireworks/<name>.html"
# 期望：生成 <name>.png；若 Edge 路径不对，用 where msedge 或改 "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
```

---

### Task 1: 图 23 新图——领用单全链统一状态机

**Files:**
- Create: `prototypes/shared/diagrams/fireworks/23-pick-unified-state-machine.json`
- Create（流水线产出）: 同名 `.svg` `.html` `.png` + `23-layout.json`

- [ ] **Step 1: 写 23-pick-unified-state-machine.json（完整内容如下）**

几何沿用 18/19 过检版式（镜像最稳）：入口行 y=110，主链 y=300，作废 y=560，守卫行 y=700，图例 y=812，页脚 y=840。

```json
{
  "schema_version": 1,
  "mode": "architecture",
  "template_type": "architecture",
  "style": 1,
  "quality_profile": "showcase",
  "text_policy": "strict",
  "width": 1360,
  "height": 860,
  "title": "领用单 · 全链统一状态机（申请 → 上架）",
  "subtitle": "一套单据五态走全程：待提交（草稿·计划数量）→ 待出库（扫码备货=单内动作·码渐满）→ 已出库·待入库 → 已入库·待上架 → 已上架；表头/药品明细/追溯码明细一套四表全程复用，只换状态不换单；捷径=药房扫码直生已审核单（2026-10-04 评审口径）",
  "containers": [],
  "nodes": [
    { "id": "E1", "kind": "rect", "x": 30, "y": 110, "width": 190, "height": 54, "label": "药房申请", "sublabel": "建草稿 · 填计划数量", "fill": "#ffffff", "stroke": "#626976", "flat": true },
    { "id": "E2", "kind": "rect", "x": 290, "y": 110, "width": 200, "height": 54, "label": "库房制单", "sublabel": "空单 · 直入待出库", "fill": "#ffffff", "stroke": "#626976", "flat": true },
    { "id": "E3", "kind": "rect", "x": 1070, "y": 110, "width": 200, "height": 54, "label": "药房扫码直生", "sublabel": "捷径 · 无在途单时触发", "fill": "#ffffff", "stroke": "#626976", "flat": true },
    { "id": "S1", "kind": "rect", "x": 30, "y": 300, "width": 190, "height": 70, "label": "待提交", "sublabel": "草稿 · 计划数量 · 仅本侧可见", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "S2", "kind": "rect", "x": 290, "y": 300, "width": 200, "height": 70, "label": "待出库", "sublabel": "扫码备货中 · 码渐满不占状态位", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "S3", "kind": "rect", "x": 550, "y": 300, "width": 200, "height": 70, "label": "已出库 · 待入库", "sublabel": "审核即扣账 · 码在途", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "S4", "kind": "rect", "x": 810, "y": 300, "width": 200, "height": 70, "label": "已入库 · 待上架", "sublabel": "整单审核 · 货位可选", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "S5", "kind": "rect", "x": 1070, "y": 300, "width": 200, "height": 70, "label": "已上架", "sublabel": "写货位 phLoc · 终态", "fill": "#ffffff", "stroke": "#2fb344" },
    { "id": "S6", "kind": "rect", "x": 550, "y": 560, "width": 240, "height": 70, "label": "已作废 / 已删除", "sublabel": "终态 · 不进流水不扣账", "fill": "#f6f8fb", "stroke": "#626976" },
    { "id": "G1", "kind": "rect", "x": 30, "y": 700, "width": 420, "height": 76, "label": "待出库 = 备货 · 不占在架不扣账", "sublabel": "计划数量→单据数量渐满 · 扫码落盘续作 · 作废即释放", "fill": "#fdecea", "stroke": "#d63939" },
    { "id": "G2", "kind": "rect", "x": 470, "y": 700, "width": 420, "height": 76, "label": "出库守卫（四道闸）", "sublabel": "失效码剔除 · 非申请药品禁止 · 过期/停用 · 盘点冻结", "fill": "#fff7e6", "stroke": "#d48806" },
    { "id": "G3", "kind": "rect", "x": 910, "y": 700, "width": 420, "height": 76, "label": "直生守卫", "sublabel": "码须本库房在架且非冻结 · 异常码拦截 · 计划数量=实扫回填", "fill": "#fff7e6", "stroke": "#d48806" }
  ],
  "arrows": [
    { "id": "a1", "source": "E1", "target": "S1", "source_port": "bottom", "target_port": "top", "flow": "control" },
    { "id": "a2", "source": "E2", "target": "S2", "source_port": "bottom", "target_port": "top", "flow": "control" },
    { "id": "a3", "source": "E3", "target": "S5", "source_port": "bottom", "target_port": "top", "flow": "control", "label": "直生已审核单" },
    { "id": "a4", "source": "S1", "target": "S2", "source_port": "right", "target_port": "left", "flow": "control", "label": "提交申请" },
    { "id": "a5", "source": "S2", "target": "S3", "source_port": "right", "target_port": "left", "flow": "control", "label": "审核出库" },
    { "id": "a6", "source": "S3", "target": "S4", "source_port": "right", "target_port": "left", "flow": "control", "label": "审核入库" },
    { "id": "a7", "source": "S4", "target": "S5", "source_port": "right", "target_port": "left", "flow": "control", "label": "扫码上架" },
    { "id": "a8", "source": "S1", "target": "S6", "source_port": "bottom", "target_port": "left", "flow": "feedback", "label": "删除草稿" },
    { "id": "a9", "source": "S2", "target": "S6", "source_port": "bottom", "target_port": "top", "flow": "feedback", "label": "作废·释放码" }
  ],
  "legend_orientation": "horizontal",
  "legend_x": 48,
  "legend_y": 812,
  "legend": [
    { "flow": "control", "label": "正向流转（事件驱动）" },
    { "flow": "feedback", "label": "逆向 · 删除 / 作废" }
  ],
  "footer": "PUL-FMS · 23 领用单全链统一状态机（五态 + 三入口 + 扫码直生捷径）· fireworks-tech-graph Style 1",
  "footer_x": 48,
  "footer_y": 840
}
```

- [ ] **Step 2: 跑流水线（validate → render → check → export-html）**

用「通用命令前缀」，`<name>` = `23-pick-unified-state-machine`，`<NN>` = `23`。
Expected：validate 无 ERROR；check 全 ok、文字零截断、无线条交叉。

- [ ] **Step 3: PNG 兜底截图 + 目检**

跑 PNG 兜底命令。然后用 Read 工具打开 `23-pick-unified-state-machine.png` 目检：五态链在一条直线、E3→S5 捷径箭头不压字、三个守卫框不重叠。
若 check 报截断/碰撞：只调对应节点 x/width 或 sublabel 字数，重跑流水线，禁止手改 SVG。

- [ ] **Step 4: Commit（只加本任务文件）**

```bash
cd "d:/Claude-code/PUL-FMS/PUL-FMS"
git add prototypes/shared/diagrams/fireworks/23-pick-unified-state-machine.json \
        prototypes/shared/diagrams/fireworks/23-pick-unified-state-machine.svg \
        prototypes/shared/diagrams/fireworks/23-pick-unified-state-machine.html \
        prototypes/shared/diagrams/fireworks/23-pick-unified-state-machine.png \
        prototypes/shared/diagrams/fireworks/23-layout.json
git commit -m "feat: 图23 领用单全链统一状态机——五态主流水线+三入口+扫码直生捷径"
```

---

### Task 2: 图 18 修订——降为库房侧切片

**Files:**
- Modify: `prototypes/shared/diagrams/fireworks/18-pick-state-machine.json`（整体替换为下方内容）
- Re-generate: 同名 `.svg` `.html` `.png` + `18-layout.json`

口径变化：原五态（待提交/待备货/备货中/待出库/待入库→药房已入库）→ 新五态的库房段三态（待提交/待出库/已出库·待入库）；「备货中」降级为待出库 sublabel；S4/S5 删除（药房段归图19）。

- [ ] **Step 1: 整体替换 18-pick-state-machine.json**

```json
{
  "schema_version": 1,
  "mode": "architecture",
  "template_type": "architecture",
  "style": 1,
  "quality_profile": "showcase",
  "text_policy": "strict",
  "width": 1360,
  "height": 860,
  "title": "领用单 · 进度状态机（库房侧切片）",
  "subtitle": "全链五态统一口径见图23；本图=库房段：待提交（草稿·仅本侧可见；库房制单=空单直入待出库）→ 待出库（扫码备货=单内动作不占状态位）→ 已出库·待入库；草稿不扣账，审核出库即扣账",
  "containers": [],
  "nodes": [
    { "id": "E1", "kind": "rect", "x": 40, "y": 110, "width": 200, "height": 54, "label": "药房申请", "sublabel": "建草稿 · 填计划数量", "fill": "#ffffff", "stroke": "#626976", "flat": true },
    { "id": "E2", "kind": "rect", "x": 440, "y": 110, "width": 220, "height": 54, "label": "库房制单", "sublabel": "空单 · 直接进待出库", "fill": "#ffffff", "stroke": "#626976", "flat": true },
    { "id": "S1", "kind": "rect", "x": 40, "y": 300, "width": 220, "height": 70, "label": "待提交", "sublabel": "草稿 · 计划数量 · 仅本侧可见", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "S2", "kind": "rect", "x": 440, "y": 300, "width": 260, "height": 70, "label": "待出库", "sublabel": "扫码备货中 · 码渐满 · 不占状态位", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "S3", "kind": "rect", "x": 880, "y": 300, "width": 240, "height": 70, "label": "已出库 · 待入库", "sublabel": "审核即扣账 · 码在途 · 衔接图19", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "S6", "kind": "rect", "x": 440, "y": 560, "width": 240, "height": 70, "label": "已作废 / 已删除", "sublabel": "终态 · 不进流水不扣账", "fill": "#f6f8fb", "stroke": "#626976" },
    { "id": "G1", "kind": "rect", "x": 140, "y": 700, "width": 520, "height": 76, "label": "待出库 = 备货 · 不占在架不扣账", "sublabel": "集合推导只减过账单 · 扫码落盘刷新续作 · 作废即释放", "fill": "#fdecea", "stroke": "#d63939" },
    { "id": "G2", "kind": "rect", "x": 700, "y": 700, "width": 520, "height": 76, "label": "出库守卫（四道闸）", "sublabel": "失效码剔除 · 非申请药品禁止 · 过期/停用 · 盘点冻结", "fill": "#fff7e6", "stroke": "#d48806" }
  ],
  "arrows": [
    { "id": "a1", "source": "E1", "target": "S1", "source_port": "bottom", "target_port": "top", "flow": "control" },
    { "id": "a2", "source": "E2", "target": "S2", "source_port": "bottom", "target_port": "top", "flow": "control" },
    { "id": "a4", "source": "S1", "target": "S2", "source_port": "right", "target_port": "left", "flow": "control", "label": "提交备货" },
    { "id": "a6", "source": "S2", "target": "S3", "source_port": "right", "target_port": "left", "flow": "control", "label": "审核出库" },
    { "id": "a8", "source": "S1", "target": "S6", "source_port": "bottom", "target_port": "left", "flow": "feedback", "label": "删除制单 / 删除草稿" },
    { "id": "a9", "source": "S2", "target": "S6", "source_port": "bottom", "target_port": "top", "flow": "feedback", "label": "作废·释放码" }
  ],
  "legend_orientation": "horizontal",
  "legend_x": 48,
  "legend_y": 812,
  "legend": [
    { "flow": "control", "label": "正向流转（事件驱动）" },
    { "flow": "feedback", "label": "逆向 · 删除 / 作废" }
  ],
  "footer": "PUL-FMS · 18 领用单进度状态机 · 库房侧切片（2026-10-04 五态口径 · 全链见图23）· fireworks-tech-graph Style 1",
  "footer_x": 48,
  "footer_y": 840
}
```

- [ ] **Step 2: 跑流水线 + PNG 兜底 + 目检**（同 Task 1 Step 2/3，`<name>` = `18-pick-state-machine`，`<NN>` = `18`）

- [ ] **Step 3: Commit**

```bash
cd "d:/Claude-code/PUL-FMS/PUL-FMS"
git add prototypes/shared/diagrams/fireworks/18-pick-state-machine.json \
        prototypes/shared/diagrams/fireworks/18-pick-state-machine.svg \
        prototypes/shared/diagrams/fireworks/18-pick-state-machine.html \
        prototypes/shared/diagrams/fireworks/18-pick-state-machine.png \
        prototypes/shared/diagrams/fireworks/18-layout.json
git commit -m "refactor: 图18降为库房侧切片——对齐五态口径（备货中降级为待出库sublabel），全链见图23"
```

---

### Task 3: 图 19 修订——药房侧切片 + 「扫码直生」捷径入口

**Files:**
- Modify: `prototypes/shared/diagrams/fireworks/19-ph-in-shelf.json`（整体替换为下方内容）
- Re-generate: 同名 `.svg` `.html` `.png` + `19-layout.json`

口径变化：新增入口 E2「药房扫码直生」→ S3 已上架（直生已审核单）；守卫行从两框扩为三框（加入库守卫/上架守卫/直生守卫，宽 373×3）；标题/副标题对齐图23口径。

- [ ] **Step 1: 整体替换 19-ph-in-shelf.json**

```json
{
  "schema_version": 1,
  "mode": "architecture",
  "template_type": "architecture",
  "style": 1,
  "quality_profile": "showcase",
  "text_policy": "strict",
  "width": 1360,
  "height": 860,
  "title": "领用单 · 药房侧切片（在途 → 已上架）",
  "subtitle": "全链五态统一口径见图23；本图=药房段：已出库·待入库 → 已入库·待上架 → 已上架 + 捷径「药房扫码直生已审核单」直落已上架；下架/退回/报损为逆向回路（详见图20，2026-10-04 口径）",
  "containers": [],
  "nodes": [
    { "id": "E1", "kind": "rect", "x": 60, "y": 110, "width": 220, "height": 54, "label": "库房审核出库", "sublabel": "图18 已出库 · 库房已扣账", "fill": "#ffffff", "stroke": "#626976", "flat": true },
    { "id": "E2", "kind": "rect", "x": 800, "y": 110, "width": 220, "height": 54, "label": "药房扫码直生", "sublabel": "捷径 · 无在途单 · 直生已审核单", "fill": "#ffffff", "stroke": "#626976", "flat": true },
    { "id": "S1", "kind": "rect", "x": 60, "y": 300, "width": 220, "height": 70, "label": "已出库 · 待入库", "sublabel": "在途 · 审核入库货位可选", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "S2", "kind": "rect", "x": 420, "y": 300, "width": 240, "height": 70, "label": "已入库 · 待上架", "sublabel": "确认入库 · 码进本房在架", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "S3", "kind": "rect", "x": 800, "y": 300, "width": 220, "height": 70, "label": "已上架", "sublabel": "写货位 phLoc · 可发药可退回", "fill": "#ffffff", "stroke": "#2fb344" },
    { "id": "R1", "kind": "rect", "x": 420, "y": 560, "width": 240, "height": 70, "label": "退回库房（逆向）", "sublabel": "退回出库单 · 详见图20", "fill": "#f6f8fb", "stroke": "#626976" },
    { "id": "R2", "kind": "rect", "x": 800, "y": 560, "width": 220, "height": 70, "label": "药房报损（逆向）", "sublabel": "报损单：未审核→已审核 · 已销毁终态", "fill": "#f6f8fb", "stroke": "#626976" },
    { "id": "G1", "kind": "rect", "x": 60, "y": 700, "width": 373, "height": 76, "label": "入库守卫", "sublabel": "整单审核即入库 · 货位非必填仅提示 · 盘点冻结拦截", "fill": "#fff7e6", "stroke": "#d48806" },
    { "id": "G2", "kind": "rect", "x": 453, "y": 700, "width": 373, "height": 76, "label": "上架守卫（三道闸）", "sublabel": "仅本房在架码 · 已上架再扫=换货位 · 预期货位不一致提示", "fill": "#fdecea", "stroke": "#d63939" },
    { "id": "G3", "kind": "rect", "x": 846, "y": 700, "width": 373, "height": 76, "label": "直生守卫", "sublabel": "码须本库房在架且非冻结 · 异常码拦截 · 计划数量=实扫回填", "fill": "#fff7e6", "stroke": "#d48806" }
  ],
  "arrows": [
    { "id": "a1", "source": "E1", "target": "S1", "source_port": "bottom", "target_port": "top", "flow": "control" },
    { "id": "a2", "source": "S1", "target": "S2", "source_port": "right", "target_port": "left", "flow": "control", "label": "审核入库" },
    { "id": "a3", "source": "S2", "target": "S3", "source_port": "right", "target_port": "left", "flow": "control", "label": "扫码上架" },
    { "id": "a7", "source": "E2", "target": "S3", "source_port": "bottom", "target_port": "top", "flow": "control", "label": "直生已审核单" },
    { "id": "a4", "source": "S3", "target": "S2", "source_port": "top", "target_port": "top", "flow": "feedback", "label": "扫码下架" },
    { "id": "a5", "source": "S2", "target": "R1", "source_port": "bottom", "target_port": "top", "flow": "feedback", "label": "退回出库" },
    { "id": "a6", "source": "S3", "target": "R2", "source_port": "bottom", "target_port": "top", "flow": "feedback", "label": "报损出库" }
  ],
  "legend_orientation": "horizontal",
  "legend_x": 48,
  "legend_y": 812,
  "legend": [
    { "flow": "control", "label": "正向流转（事件驱动）" },
    { "flow": "feedback", "label": "逆向 · 下架 / 退回 / 报损" }
  ],
  "footer": "PUL-FMS · 19 领用单状态机 · 药房侧切片（2026-10-04 五态口径 · 全链见图23 · 逆向图20）· fireworks-tech-graph Style 1",
  "footer_x": 48,
  "footer_y": 840
}
```

注意：a4「扫码下架」是 S3.top→S2.top 的顶部弧线，与 E2→S3 的入场箭头共用 S3 顶部区域——若 check 报重叠，把 E2 的 target_port 改为 right、source_port 保持 bottom，重跑流水线。

- [ ] **Step 2: 跑流水线 + PNG 兜底 + 目检**（同 Task 1 Step 2/3，`<name>` = `19-ph-in-shelf`，`<NN>` = `19`）

- [ ] **Step 3: Commit**

```bash
cd "d:/Claude-code/PUL-FMS/PUL-FMS"
git add prototypes/shared/diagrams/fireworks/19-ph-in-shelf.json \
        prototypes/shared/diagrams/fireworks/19-ph-in-shelf.svg \
        prototypes/shared/diagrams/fireworks/19-ph-in-shelf.html \
        prototypes/shared/diagrams/fireworks/19-ph-in-shelf.png \
        prototypes/shared/diagrams/fireworks/19-layout.json
git commit -m "refactor: 图19降为药房侧切片——新增扫码直生捷径入口+直生守卫，对齐五态口径"
```

---

### Task 4: 图纸浏览器注册（diagrams/index.html）

**Files:**
- Modify: `prototypes/shared/diagrams/index.html:39`（计数）、`:70-79`（库房/药房组条目）

- [ ] **Step 1: 改计数 23 → 24**

Line 39：
```html
<h1>PUL-FMS 图纸<small>业务流程图 × UML · 共 24 张 + 1 份实例 · 按业务模块分组（对齐系统菜单）</small></h1>
```

- [ ] **Step 2: 库房管理组插入图 23（置首）+ 更新图 18 条目文案**

在 `{ grp: '库房管理' },` 行之后、18 条目之前插入：
```js
  { f: '23-pick-unified-state-machine', t: '领用单 · 全链统一状态机', c: '一套单据五态走全程：待提交→待出库→已出库·待入库→已入库·待上架→已上架；三入口 + 捷径「药房扫码直生已审核单」；一套四表全程复用（药房管理同用）' },
```
18 条目替换为：
```js
  { f: '18-pick-state-machine', t: '领用单 · 进度状态机（库房侧切片）', c: '全链见图23；库房段：待提交（草稿）→ 待出库（备货=单内动作）→ 已出库·待入库；草稿不扣账，审核出库即扣账' },
```

- [ ] **Step 3: 更新图 19 条目文案**

```js
  { f: '19-ph-in-shelf', t: '领用单 · 药房侧切片（在途 → 已上架）', c: '全链见图23；药房段：已出库·待入库 → 已入库·待上架 → 已上架 + 捷径扫码直生；下架/退回/报损为逆向回路（详见图20）' },
```

- [ ] **Step 4: 浏览器冒烟**

无头 Edge 截图 `diagrams/index.html`，Read 截图目检：侧栏库房组首条=图23、计数 24、点击图23 能渲染（hint 不显示）。

- [ ] **Step 5: Commit**

```bash
cd "d:/Claude-code/PUL-FMS/PUL-FMS"
git add prototypes/shared/diagrams/index.html
git commit -m "docs: 图纸浏览器登记图23（23+1→24+1），18/19条目改切片口径"
```

---

### Task 5: 导览数据同步（guide-data.js）+ 校验 + README 记轮次

**Files:**
- Modify: `prototypes/2026-09/pul-fms-base-v1/scripts/guide-data.js:63-67`（wh 组）、`:83-88`（ph 组）
- Modify: `prototypes/2026-09/pul-fms-base-v1/README.md`（追加 Round AP）

- [ ] **Step 1: wh 组 diagrams 更新**

`guide-data.js` 的 `wh.diagrams` 替换为：
```js
      diagrams: [
        { f: '23-pick-unified-state-machine.svg', t: '领用单全链统一状态机', note: '五态主流水线+三入口+扫码直生捷径' },
        { f: '03-pick-loop.svg',        t: '领用出库 → 药房入库闭环', note: '库房发、药房收，库存同时动' },
        { f: '18-pick-state-machine.svg', t: '领用单进度状态机·库房侧切片', note: '待提交/待出库/已出库 · 全链见图23' },
        { f: '08-stock-derivation.svg', t: '库存推导（集合加减法）',   note: '库存=入库集合−出库集合' }
      ],
```

- [ ] **Step 2: ph 组 diagrams 更新**

`ph.diagrams` 替换为：
```js
      diagrams: [
        { f: '23-pick-unified-state-machine.svg', t: '领用单全链统一状态机', note: '一套单据五态走全程 · 含扫码直生捷径' },
        { f: '03-pick-loop.svg',        t: '领用出库 → 药房入库闭环', note: '本模块是闭环的下半段' },
        { f: '19-ph-in-shelf.svg',      t: '领用单状态机·药房侧切片',   note: '在途→待上架→已上架+直生捷径 · 全链见图23' },
        { f: '20-ph-ret-state-machine.svg', t: '退回出库单进度状态机', note: '逆向 · 进度一维三态 + 撤销回路 · 草稿不扣账' },
        { f: '08-stock-derivation.svg', t: '库存推导（集合加减法）',   note: '药房库存同样按集合算' }
      ],
```

- [ ] **Step 3: 跑校验（在 pul-fms-base-v1 目录）**

```bash
cd "d:/Claude-code/PUL-FMS/PUL-FMS/prototypes/2026-09/pul-fms-base-v1"
node --check scripts/guide-data.js
node scripts/_t-guide.node.js
node scripts/_t-invariants.node.js
```
Expected：`node --check` 无输出；`_t-guide` 全部 ok（含图23 文件存在断言）；`_t-invariants` all passed（本计划不动业务代码，不应有 diff）。
另在仓库根跑：`node scripts/check-prd-menu-sync.js`（若该脚本存在）确认无失配。

- [ ] **Step 4: README 追加 Round AP**

在 `README.md` 末尾追加（沿用现有 Round 体例）：

```markdown
## 二十三、Round AP：图23 领用单全链统一状态机 + 18/19 降为切片（2026-10-04）

起因：与吴毅鹏评审会拍板——领用申请/备货/出库/入库各表单表头、药品明细、追溯码明细完全一致，只是操作节点与状态不同；为省工作量，允许药房上架扫码时无单直生领用单。设计稿 `docs/superpowers/specs/2026-10-04-pick-unified-state-machine-design.md`（四问拍板：五态主流水线 / 直生已审核·库房只读 / 先出图不动代码 / 总图+切片）。

| 改动 | 文件 | 说明 |
|---|---|---|
| 图23 新增 | `23-pick-unified-state-machine.{json,svg,html,png}` | 五态主流水线（待提交→待出库→已出库·待入库→已入库·待上架→已上架）+ 三入口（药房申请/库房制单/药房扫码直生）+ 作废终态 + 三守卫框（备货不占账/出库四道闸/直生守卫） |
| 图18 切片化 | `18-pick-state-machine.{json,svg,html,png}` | 降为库房侧切片：待提交→待出库→已出库·待入库；「备货中」降级为待出库 sublabel，不占状态位 |
| 图19 切片化 | `19-ph-in-shelf.{json,svg,html,png}` | 降为药房侧切片：新增「药房扫码直生」入口直落已上架 + 直生守卫框（码须本库房在架·计划数量=实扫回填） |
| 注册同步 | `diagrams/index.html` `guide-data.js` | 图纸库 23+1 → 24+1；wh/ph 两组 diagrams 置首图23 |

验证：三图 fireworks validate/render/check 全绿、文字零截断、无线条交叉；PNG 无头 Edge 截图目检通过；`_t-guide` 全部通过；`_t-invariants` all passed（未动业务代码）。
```

- [ ] **Step 5: Commit**

```bash
cd "d:/Claude-code/PUL-FMS/PUL-FMS"
git add prototypes/2026-09/pul-fms-base-v1/scripts/guide-data.js \
        prototypes/2026-09/pul-fms-base-v1/README.md
git commit -m "docs: guide-data登记图23+18/19切片口径，README记Round AP"
```

---

## Self-Review 记录

- **Spec 覆盖**：设计稿 §二（状态机）→ Task 1；§四（图纸组织：23 新增、18/19 切片）→ Task 1/2/3；注册（index.html + guide-data）→ Task 4/5；§五（验证口径）→ 各 Task 流水线 + Task 5 Step 3。§三（表结构）属设计稿交付物，无代码任务，符合「先出图+设计稿」范围拍板。
- **占位符**：无 TBD/TODO；三图 JSON 为完整可渲染内容。
- **一致性**：五态命名（待提交/待出库/已出库·待入库/已入库·待上架/已上架）在三图、index 文案、guide-data、README 间一致；图23 编号与现有 22 之后顺延一致。
- **Edge 注意**：图19 a4 顶部弧线与 E2 入场箭头共用 S3 顶部的重叠风险已在 Task 3 Step 1 注明处置预案。
