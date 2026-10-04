# 领用单全链统一状态机（图23 新增 + 18/19 隐藏）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增图 23「领用单 · 全链统一状态机」（五态主流水线 + 三入口 + 扫码直生捷径）；图 18/19 从图纸浏览器侧栏菜单和导览数据中**隐藏**（口径修订 2026-10-04：不做切片修订，直接隐藏；文件保留在盘不删除，git 历史可查）。

**Architecture:** 纯图纸任务，不动原型业务代码。图纸源文件为 fireworks-tech-graph JSON（`prototypes/shared/diagrams/fireworks/NN-name.json`），经 validate → render(svg+layout) → check → export-html 流水线产出；PNG 因本机无 CairoSVG 用无头 Edge 截图兜底。注册点两处：`prototypes/shared/diagrams/index.html`（图纸浏览器侧栏）+ `pul-fms-base-v1/scripts/guide-data.js`（导览）。隐藏 = 从这两处清单数组移除 18/19 条目，**不删文件**。

**Tech Stack:** fireworks-tech-graph skill（`C:/Users/游开龙/.claude/skills/fireworks-tech-graph/scripts/fireworks.py`）、Node.js 校验脚本、无头 Edge 截图。

**设计稿：** `docs/superpowers/specs/2026-10-04-pick-unified-state-machine-design.md`（四问已拍板，开放问题已闭环；图纸组织口径以本计划为准：18/19 隐藏）

**⚠️ 提交纪律（硬规则）：** 工作树压着 Round AH/AL/AO 等往轮未提交改动。每个 commit 只 `git add` 本任务列出的具体文件，**禁止 `git add -A` / `git add .`**。

**通用命令前缀（渲染任务复用）：**

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
  "footer": "PUL-FMS · 23 领用单全链统一状态机（五态 + 三入口 + 扫码直生捷径 · 18/19 已并入本图）· fireworks-tech-graph Style 1",
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

### Task 2: 隐藏图 18/19——图纸浏览器侧栏（diagrams/index.html）

**Files:**
- Modify: `prototypes/shared/diagrams/index.html:39`（计数）、`:71` 与 `:76`（18/19 条目行删除）、`:70` 后（插入图 23）

隐藏口径：从 DIAGRAMS 数组删除 18/19 两行，文件保留在 `fireworks/` 目录不删。可见图纸数 24 − 2 = 22。

- [ ] **Step 1: 改计数**

Line 39 标题改为（24 张含隐藏 → 对外只算可见 22 张）：
```html
<h1>PUL-FMS 图纸<small>业务流程图 × UML · 共 22 张 + 1 份实例 · 按业务模块分组（对齐系统菜单）</small></h1>
```

- [ ] **Step 2: 库房管理组——插入图 23、删除图 18 行**

在 `{ grp: '库房管理' },` 行之后插入：
```js
  { f: '23-pick-unified-state-machine', t: '领用单 · 全链统一状态机', c: '一套单据五态走全程：待提交→待出库→已出库·待入库→已入库·待上架→已上架；三入口 + 捷径「药房扫码直生已审核单」；一套四表全程复用（药房管理同用；原图18/19 已并入本图）' },
```
同时**删除**原 18 条目整行（`{ f: '18-pick-state-machine', ... },`）。

- [ ] **Step 3: 药房管理组——删除图 19 行**

**删除** `{ f: '19-ph-in-shelf', ... },` 整行。

- [ ] **Step 4: 浏览器冒烟**

无头 Edge 截图 `diagrams/index.html`，Read 截图目检：侧栏库房组首条=图23、计数 22、18/19 不再出现、点击图23 能渲染（hint 不显示）。
```bash
"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless --disable-gpu \
  --screenshot="_shots/diagrams-index-ap.png" --window-size=1600,1000 \
  "file:///d:/Claude-code/PUL-FMS/PUL-FMS/prototypes/shared/diagrams/index.html"
```

- [ ] **Step 5: Commit**

```bash
cd "d:/Claude-code/PUL-FMS/PUL-FMS"
git add prototypes/shared/diagrams/index.html
git commit -m "docs: 图纸浏览器登记图23并隐藏图18/19（文件保留）；可见计数 22+1"
```

---

### Task 3: 隐藏图 18/19——导览数据（guide-data.js）+ 校验 + README 记轮次

**Files:**
- Modify: `prototypes/2026-09/pul-fms-base-v1/scripts/guide-data.js:63-67`（wh 组）、`:83-88`（ph 组）
- Modify: `prototypes/2026-09/pul-fms-base-v1/README.md`（追加 Round AP）

- [ ] **Step 1: wh 组 diagrams 更新（置首图23、删图18行）**

`guide-data.js` 的 `wh.diagrams` 替换为：
```js
      diagrams: [
        { f: '23-pick-unified-state-machine.svg', t: '领用单全链统一状态机', note: '五态主流水线+三入口+扫码直生捷径（原图18已并入）' },
        { f: '03-pick-loop.svg',        t: '领用出库 → 药房入库闭环', note: '库房发、药房收，库存同时动' },
        { f: '08-stock-derivation.svg', t: '库存推导（集合加减法）',   note: '库存=入库集合−出库集合' }
      ],
```

- [ ] **Step 2: ph 组 diagrams 更新（置首图23、删图19行）**

`ph.diagrams` 替换为：
```js
      diagrams: [
        { f: '23-pick-unified-state-machine.svg', t: '领用单全链统一状态机', note: '一套单据五态走全程 · 含扫码直生捷径（原图19已并入）' },
        { f: '03-pick-loop.svg',        t: '领用出库 → 药房入库闭环', note: '本模块是闭环的下半段' },
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
Expected：`node --check` 无输出；`_t-guide` 全部 ok（图23 文件存在断言通过、18/19 不再被引用所以文件保留也不报）；`_t-invariants` all passed（本计划不动业务代码，不应有 diff）。
另在仓库根跑：`node scripts/check-prd-menu-sync.js`（若该脚本存在）确认无失配。

- [ ] **Step 4: README 追加 Round AP**

在 `README.md` 末尾追加（沿用现有 Round 体例）：

```markdown
## 二十三、Round AP：图23 领用单全链统一状态机 + 图18/19 隐藏（2026-10-04）

起因：与吴毅鹏评审会拍板——领用申请/备货/出库/入库各表单表头、药品明细、追溯码明细完全一致，只是操作节点与状态不同；为省工作量，允许药房上架扫码时无单直生领用单。设计稿 `docs/superpowers/specs/2026-10-04-pick-unified-state-machine-design.md`（四问拍板：五态主流水线 / 直生已审核·库房只读 / 先出图不动代码；图纸组织后修订为 18/19 直接隐藏不做切片）。

| 改动 | 文件 | 说明 |
|---|---|---|
| 图23 新增 | `23-pick-unified-state-machine.{json,svg,html,png}` | 五态主流水线（待提交→待出库→已出库·待入库→已入库·待上架→已上架）+ 三入口（药房申请/库房制单/药房扫码直生）+ 作废终态 + 三守卫框（备货不占账/出库四道闸/直生守卫） |
| 图18/19 隐藏 | `diagrams/index.html` `guide-data.js` | 从侧栏菜单与导览清单移除（文件保留在 fireworks/ 目录不删，口径已被图23 覆盖）；可见图纸 23+1 → 22+1 |

验证：图23 fireworks validate/render/check 全绿、文字零截断、无线条交叉；PNG 无头 Edge 截图目检通过；`_t-guide` 全部通过；`_t-invariants` all passed（未动业务代码）。
```

- [ ] **Step 5: Commit**

```bash
cd "d:/Claude-code/PUL-FMS/PUL-FMS"
git add prototypes/2026-09/pul-fms-base-v1/scripts/guide-data.js \
        prototypes/2026-09/pul-fms-base-v1/README.md
git commit -m "docs: guide-data登记图23并隐藏18/19，README记Round AP"
```

---

## Self-Review 记录

- **Spec 覆盖**：设计稿 §二（状态机）→ Task 1；图纸组织（23 新增 + 18/19 隐藏，用户 2026-10-04 修订口径）→ Task 2/3；§五（验证口径）→ Task 1 流水线 + Task 3 Step 3。§三（表结构）属设计稿交付物，无代码任务，符合「先出图+设计稿」范围拍板。
- **占位符**：无 TBD/TODO；图23 JSON 为完整可渲染内容。
- **一致性**：五态命名（待提交/待出库/已出库·待入库/已入库·待上架/已上架）在图23、index 文案、guide-data、README 间一致；图23 编号与现有 22 之后顺延一致；计数口径 22+1（= 24 张文件 − 2 张隐藏）在 index.html 与 README 一致。
- **不删文件**：18/19 的 json/svg/html/png 全部保留在盘，只摘清单——符合「删除文件必须先征得同意」红线。
