# 图24 药房管理全流程泳道图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增图 24「药房管理 · 全流程泳道图（领用→上架→逆向）」（三泳道、长画布、全直线布局），图 03/21 从图纸浏览器与导览隐藏（文件保留），图 22 保留互链。

**Architecture:** 纯图纸任务，不动原型业务代码。设计稿：`docs/superpowers/specs/2026-10-05-ph-full-loop-design.md`（三问已拍板：正向+逆向全画 / 取代 03/21 隐藏 / 长画布全直线）。

**Tech Stack:** fireworks-tech-graph（`C:/Users/游开龙/.claude/skills/fireworks-tech-graph/scripts/fireworks.py`）、Node 校验脚本、无头 Edge 截图。

**⚠️ 提交纪律（硬规则）：** 工作树压着往轮未提交改动。每个 commit 只 `git add` 本任务列出的具体文件，**禁止 `git add -A` / `git add .`**。

**通用命令前缀：**

```bash
FW="C:/Users/游开龙/.claude/skills/fireworks-tech-graph/scripts/fireworks.py"
cd "d:/Claude-code/PUL-FMS/PUL-FMS/prototypes/shared/diagrams/fireworks"
python "$FW" validate architecture 24-ph-full-loop.json
python "$FW" render architecture 24-ph-full-loop.json 24-ph-full-loop.svg --report 24-layout.json
python "$FW" check 24-ph-full-loop.svg
python "$FW" export-html 24-ph-full-loop.svg 24-ph-full-loop.html
# PNG（无 CairoSVG，无头 Edge；--screenshot 必须绝对路径）：
"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless --disable-gpu \
  --screenshot="d:/Claude-code/PUL-FMS/PUL-FMS/prototypes/shared/diagrams/fireworks/24-ph-full-loop.png" \
  --window-size=1600,1000 \
  "file:///d:/Claude-code/PUL-FMS/PUL-FMS/prototypes/shared/diagrams/fireworks/24-ph-full-loop.html"
```

**几何军规（本项目沉淀，执行时遵守）：** 垂直/水平边两端节点中心必须对齐（否则 EDGE_MICRO_SEGMENT）；节点间隙 ≥40px；边标签 >4~6 字放不进 60px 边隙（长文案挪 sublabel）；副标题 ≤100 字（check 不拦溢出，靠 PNG 目检）；showcase 预算不够就按 04/04b 先例用 standard 档（临时放行→layout 报告逐边看交叉→微调→恢复正式档复验）。**禁止手改 SVG**，一切改动走 JSON 重渲。

---

### Task 1: 图 24 新图——药房管理全流程泳道图

**Files:**
- Create: `prototypes/shared/diagrams/fireworks/24-ph-full-loop.json`
- Create（流水线产出）: 同名 `.svg` `.html` `.png` + `24-layout.json`

- [ ] **Step 1: 写 24-ph-full-loop.json（完整内容如下）**

布局要点：三泳道容器（沿用 03/21 的泳道配色：药房 #eef4fb/#b7cdf0、库房 #eef8f0/#b7e0c4、系统 #f6f8fb/#d0d5dd）；药房道两行（主链行 y=170 / 逆向行 y=300）；四组垂直通道严格同列（c2: P2↓K1↓X1；c4: K2↑P5；c5: P6↓P9↓K3；c6: P7↓P10）；下架=唯一折线（P7→P6 顶部回线）。

```json
{
  "schema_version": 1,
  "mode": "architecture",
  "template_type": "architecture",
  "style": 1,
  "quality_profile": "showcase",
  "text_policy": "strict",
  "width": 1560,
  "height": 960,
  "title": "药房管理 · 全流程泳道图（领用 → 上架 → 逆向）",
  "subtitle": "三泳道：药房/库房/系统；正向：申请→备货→审核出库→审核入库→上架→在架；捷径：扫码直生已审核单；逆向：下架/退回/报损；单据状态口径见图23",
  "containers": [
    { "id": "lane-ph",  "x": 40, "y": 90,  "width": 1480, "height": 330, "label": "药房 · 药师", "stroke": "#b7cdf0", "fill": "#eef4fb" },
    { "id": "lane-wh",  "x": 40, "y": 430, "width": 1480, "height": 170, "label": "库房 · 库管员", "stroke": "#b7e0c4", "fill": "#eef8f0" },
    { "id": "lane-sys", "x": 40, "y": 610, "width": 1480, "height": 150, "label": "系统 · 码⇄药转换引擎", "stroke": "#d0d5dd", "fill": "#f6f8fb" }
  ],
  "nodes": [
    { "id": "P1", "kind": "rect", "x": 60, "y": 170, "width": 200, "height": 70, "label": "新增领用申请", "sublabel": "草稿 · 计划数量", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "P2", "kind": "rect", "x": 320, "y": 170, "width": 200, "height": 70, "label": "提交申请", "sublabel": "草稿 → 待出库", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "P5", "kind": "rect", "x": 640, "y": 170, "width": 200, "height": 70, "label": "审核入库", "sublabel": "整单 · 货位可选", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "P6", "kind": "rect", "x": 900, "y": 170, "width": 200, "height": 70, "label": "已入库 · 待上架", "sublabel": "码进本房在架", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "P7", "kind": "rect", "x": 1160, "y": 170, "width": 200, "height": 70, "label": "已上架 · 可发药", "sublabel": "写货位 phLoc", "fill": "#ffffff", "stroke": "#2fb344" },
    { "id": "E3", "kind": "rect", "x": 1380, "y": 170, "width": 160, "height": 70, "label": "扫码直生", "sublabel": "无在途单 · 直生已审核", "fill": "#ffffff", "stroke": "#626976", "flat": true },
    { "id": "P9", "kind": "rect", "x": 900, "y": 300, "width": 200, "height": 70, "label": "退回出库", "sublabel": "按单选码预占 · 逐码核对", "fill": "#f6f8fb", "stroke": "#626976" },
    { "id": "P10", "kind": "rect", "x": 1160, "y": 300, "width": 200, "height": 70, "label": "报损出库", "sublabel": "已审核=已销毁 · 详见图22", "fill": "#f6f8fb", "stroke": "#626976" },
    { "id": "K1", "kind": "rect", "x": 320, "y": 480, "width": 200, "height": 70, "label": "备货扫码", "sublabel": "单内动作 · 码渐满", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "K2", "kind": "rect", "x": 640, "y": 480, "width": 200, "height": 70, "label": "审核出库", "sublabel": "四道闸 · 扣账在途", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "K3", "kind": "rect", "x": 900, "y": 480, "width": 200, "height": 70, "label": "库房验收", "sublabel": "核对 → 审核入库 · 在架回补", "fill": "#ffffff", "stroke": "#206bc4" },
    { "id": "X1", "kind": "rect", "x": 320, "y": 660, "width": 200, "height": 70, "label": "解析匹配", "sublabel": "码⇄药换算 · 反解析匹配申请", "fill": "#ffffff", "stroke": "#626976" },
    { "id": "G1", "kind": "rect", "x": 60, "y": 790, "width": 440, "height": 76, "label": "出库守卫（四道闸）", "sublabel": "失效码剔除 · 非申请药品禁止 · 过期/停用 · 盘点冻结", "fill": "#fff7e6", "stroke": "#d48806" },
    { "id": "G2", "kind": "rect", "x": 540, "y": 790, "width": 440, "height": 76, "label": "上架 · 直生守卫", "sublabel": "仅本房在架码 · 直生须在架非冻结 · 异常码拦截", "fill": "#fff7e6", "stroke": "#d48806" },
    { "id": "G3", "kind": "rect", "x": 1020, "y": 790, "width": 440, "height": 76, "label": "逆向口径", "sublabel": "退回=预占不扣账·全核对才审核；报损=已销毁不可恢复", "fill": "#fdecea", "stroke": "#d63939" }
  ],
  "arrows": [
    { "id": "a1", "source": "P1", "target": "P2", "source_port": "right", "target_port": "left", "flow": "control", "label": "提交" },
    { "id": "a2", "source": "P2", "target": "K1", "source_port": "bottom", "target_port": "top", "flow": "control", "label": "库房接单" },
    { "id": "a3", "source": "K1", "target": "X1", "source_port": "bottom", "target_port": "top", "flow": "control", "label": "码解析·反解析匹配" },
    { "id": "a4", "source": "K1", "target": "K2", "source_port": "right", "target_port": "left", "flow": "control", "label": "备齐审核" },
    { "id": "a5", "source": "K2", "target": "P5", "source_port": "top", "target_port": "bottom", "flow": "control", "label": "在途·收货" },
    { "id": "a6", "source": "P5", "target": "P6", "source_port": "right", "target_port": "left", "flow": "control", "label": "入库完成" },
    { "id": "a7", "source": "P6", "target": "P7", "source_port": "right", "target_port": "left", "flow": "control", "label": "扫码上架" },
    { "id": "a8", "source": "E3", "target": "P7", "source_port": "left", "target_port": "right", "flow": "control" },
    { "id": "a9", "source": "P7", "target": "P6", "source_port": "top", "target_port": "top", "flow": "feedback", "label": "扫码下架·回待上架" },
    { "id": "a10", "source": "P6", "target": "P9", "source_port": "bottom", "target_port": "top", "flow": "feedback", "label": "按单退回" },
    { "id": "a11", "source": "P9", "target": "K3", "source_port": "bottom", "target_port": "top", "flow": "feedback", "label": "全核对·确认出库" },
    { "id": "a12", "source": "P7", "target": "P10", "source_port": "bottom", "target_port": "top", "flow": "feedback", "label": "报损" }
  ],
  "legend_orientation": "horizontal",
  "legend_x": 48,
  "legend_y": 895,
  "legend": [
    { "flow": "control", "label": "正向流转（事件驱动）" },
    { "flow": "feedback", "label": "逆向 · 下架 / 退回 / 报损" }
  ],
  "footer": "PUL-FMS · 24 药房管理全流程泳道图（正向+捷径+逆向 · 单据状态口径见图23 · 报损详见图22）· fireworks-tech-graph Style 1",
  "footer_x": 48,
  "footer_y": 925
}
```

- [ ] **Step 2: 跑流水线**（通用命令前缀）

Expected：validate 无 ERROR；check 全 ok、零截断、零交叉。若 showcase 报 bends/交叉超标 → 按军规诊断微调坐标（保持直线原则：只动列对齐与间距）→ 仍不可达则整图改 `"quality_profile": "standard"` 复验（04/04b 先例），并在报告中说明。

- [ ] **Step 3: PNG 截图 + Read 目检**

重点看：①主链一条水平直线；②四组垂直通道全直；③下架回线不压泳道标签；④副标题不溢出；⑤E3→P7 右进终态清晰。

- [ ] **Step 4: Commit（只加 5 个文件）**

```bash
cd "d:/Claude-code/PUL-FMS/PUL-FMS"
git add prototypes/shared/diagrams/fireworks/24-ph-full-loop.json \
        prototypes/shared/diagrams/fireworks/24-ph-full-loop.svg \
        prototypes/shared/diagrams/fireworks/24-ph-full-loop.html \
        prototypes/shared/diagrams/fireworks/24-ph-full-loop.png \
        prototypes/shared/diagrams/fireworks/24-layout.json
git commit -m "feat: 图24 药房管理全流程泳道图——三泳道长画布全直线（正向+直生捷径+逆向）"
```

---

### Task 2: 隐藏图 03/21 + 登记图 24（index.html + guide-data.js + README）

**Files:**
- Modify: `prototypes/shared/diagrams/index.html`（计数 22→21；库房组删 03 行；药房组删 21 行、置首插入 24）
- Modify: `prototypes/2026-09/pul-fms-base-v1/scripts/guide-data.js`（wh 组删 03；ph 组删 03/21 不存在只删 03、置首 24）
- Modify: `prototypes/2026-09/pul-fms-base-v1/README.md`（追加 Round AQ）

- [ ] **Step 1: 引用排查（先查后改）**

```bash
cd "d:/Claude-code/PUL-FMS/PUL-FMS"
grep -rn "图03\|图21\|03-pick-loop\|21-ph-ret-loop" prototypes/shared/diagrams/index.html prototypes/2026-09/pul-fms-base-v1/scripts/guide-data.js
```
可见面（index.html 条目文案、guide-data）若有 03/21 引用一并改指图 24；`fireworks/` 目录下隐藏文件的内部引用**不改**（留档口径）。把 grep 结果贴进报告。

- [ ] **Step 2: index.html 三处**

① 计数行「共 22 张 + 1 份实例」→「共 21 张 + 1 份实例」。
② 库房管理组：删除 `{ f: '03-pick-loop', ... },` 整行（23/15/08 保留——图 15 是 Mermaid 时序图，不在本轮取代范围）。
③ 药房管理组：删除 `{ f: '21-ph-ret-loop', ... },` 整行；在 `{ grp: '药房管理' },` 行后插入：
```js
  { f: '24-ph-full-loop', t: '药房管理 · 全流程泳道图', c: '三泳道长画布全直线：申请→备货→审核出库→审核入库→上架→在架 + 捷径扫码直生 + 逆向下架/退回/报损（原图03/21 已并入本图；报损详见图22）' },
```

- [ ] **Step 3: guide-data.js 两处**

wh 组 diagrams（当前 23/03/08）→
```js
      diagrams: [
        { f: '23-pick-unified-state-machine.svg', t: '领用单全链统一状态机', note: '五态主流水线+三入口+扫码直生捷径（原图18已并入）' },
        { f: '08-stock-derivation.svg', t: '库存推导（集合加减法）',   note: '库存=入库集合−出库集合' }
      ],
```
ph 组 diagrams（当前 23/03/20/08）→
```js
      diagrams: [
        { f: '24-ph-full-loop.svg', t: '药房管理全流程泳道图', note: '三泳道全直线：正向+直生捷径+逆向（原图03/21已并入）' },
        { f: '23-pick-unified-state-machine.svg', t: '领用单全链统一状态机', note: '一套单据五态走全程 · 含扫码直生捷径（原图19已并入）' },
        { f: '20-ph-ret-state-machine.svg', t: '退回出库单进度状态机', note: '逆向 · 进度一维三态 + 撤销回路 · 草稿不扣账' },
        { f: '08-stock-derivation.svg', t: '库存推导（集合加减法）',   note: '药房库存同样按集合算' }
      ],
```

- [ ] **Step 4: 校验**

```bash
cd "d:/Claude-code/PUL-FMS/PUL-FMS/prototypes/2026-09/pul-fms-base-v1"
node --check scripts/guide-data.js
node scripts/_t-guide.node.js
node scripts/_t-invariants.node.js
cd "d:/Claude-code/PUL-FMS/PUL-FMS" && node scripts/check-prd-menu-sync.js
```
Expected：全绿。另无头 Edge 截 index.html（`_shots/diagrams-index-aq.png`，不 add）目检：计数 21、药房组首条=图24、无 03/21。

- [ ] **Step 5: README 追加 Round AQ**

```markdown
## 二十四、Round AQ：图24 药房管理全流程泳道图 + 图03/21 隐藏（2026-10-05）

起因：药房管理缺「一张图讲完」的全流程泳道图；用户拍板布局原则「画布可以长一点，线条尽量用直线，流程图直观一点」。设计稿 `docs/superpowers/specs/2026-10-05-ph-full-loop-design.md`。

| 改动 | 文件 | 说明 |
|---|---|---|
| 图24 新增 | `24-ph-full-loop.{json,svg,html,png}` | 三泳道（药房两行/库房/系统）1560×960 长画布；主链单行横贯全直线，逆向行在主链正下方，四组垂直通道同列对齐；捷径=扫码直生右进终态；唯二折线=下架顶部回线 |
| 图03/21 隐藏 | `diagrams/index.html` `guide-data.js` | 从侧栏与导览清单移除（文件保留，口径并入图24）；图15（Mermaid 时序图）保留；可见图纸 22+1 → 21+1 |

验证：图24 fireworks validate/render/check 全绿零截断零交叉；PNG 目检（直线/回线/副标题）；`_t-guide`/`_t-invariants`/`check-prd-menu-sync` 全绿。
```

- [ ] **Step 6: Commit（只加 3 个文件）**

```bash
cd "d:/Claude-code/PUL-FMS/PUL-FMS"
git add prototypes/shared/diagrams/index.html \
        prototypes/2026-09/pul-fms-base-v1/scripts/guide-data.js \
        prototypes/2026-09/pul-fms-base-v1/README.md
git commit -m "docs: 登记图24并隐藏图03/21（文件保留），README记Round AQ"
```

---

## Self-Review 记录

- **Spec 覆盖**：设计稿 §二（节点/边/说明框）→ Task 1 JSON 逐字对应（12 节点+3 守卫+12 边）；§三（几何）→ JSON 坐标 + 军规；§四（图纸组织）→ Task 2；§五（验证口径）→ 两任务流水线+校验。
- **占位符**：无；图 24 JSON 完整可渲染。
- **一致性**：节点 id（P1-P10/K1-K3/X1/E3/G1-G3）与边引用逐一对齐；计数 21+1 在 index/README 一致；E3→P7 无边标签（20px 间隙放不下，直生语义在 E3 sublabel）——与设计稿 §2.2 表「直生已审核单」标签的取舍已在本条说明。
