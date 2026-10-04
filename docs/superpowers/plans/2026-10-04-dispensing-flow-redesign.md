# 发药流程图重构（04 门诊 + 04b 住院）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按已拍板设计稿 `docs/superpowers/specs/2026-10-03-dispensing-flow-redesign-design.md` 重绘发药流程图：04=门诊（三模式+当场降级+逆向），新增 04b=住院摆药（先拿后匹配+事后补绑+逆向），共享异常台账互链。

**Architecture:** fireworks-tech-graph Style 1 泳道模板（architecture 模式，text_policy=strict）。每图 4 泳道：医生/HIS → 药房·药师 → 药房·异常补救 → 患者/病区。颜色约定：蓝=已定主干、橙=取药绑定模式差异段、红虚线=逆向回流、紫=异常补救。原 04 的备选方案 a/c 分支与「系统·映射」泳道删除，锁数量降级为 D1 节点备注。

**Tech Stack:** fireworks-tech-graph skill（`C:/Users/游开龙/.claude/skills/fireworks-tech-graph/scripts/fireworks.py`，python3）；JSON → validate → render SVG → check → export-html / export-png。

**通用命令模板**（`<name>` ∈ `04-dispensing` / `04b-inpatient-dispensing`，工作目录 = 仓库根 `d:/Claude-code/PUL-FMS/PUL-FMS`）：

```bash
SKILL_ROOT="C:/Users/游开龙/.claude/skills/fireworks-tech-graph"
FW=prototypes/shared/diagrams/fireworks
python3 "$SKILL_ROOT/scripts/fireworks.py" validate architecture "$FW/<name>.json"
python3 "$SKILL_ROOT/scripts/fireworks.py" render architecture "$FW/<name>.json" "$FW/<name>.svg" --report "$FW/<layout-report>.json"
python3 "$SKILL_ROOT/scripts/fireworks.py" check "$FW/<name>.svg"
python3 "$SKILL_ROOT/scripts/fireworks.py" export-html "$FW/<name>.svg" "$FW/<name>.html"
python3 "$SKILL_ROOT/scripts/fireworks.py" export-png "$FW/<name>.svg" "$FW/<name>.png" --width 1920
```

04 的 layout report 沿用既有名 `04-layout.json`；04b 用 `04b-layout.json`。

---

## 布局网格（两图共用约定）

- 画布：width 1680；height 按内容定（预计 04 ≈ 1560，04b ≈ 1380）
- 泳道 container：x=40，width=1600，label 左对齐；相邻泳道间隔 20
- 节点标准尺寸：rect 300×70（模式卡可 320×90）；hexagon 决策 220×80
- 列位（中心线 x）：左列 260，中左 620，中右 980，右列 1340
- 逆向节点 fill `#fdecea` / stroke `#d63939`，箭头 flow 用 data + 红色系；异常补救 fill `#f3e8ff` / stroke `#7c3aed`（紫）；主干橙 `#fff7e6`/`#d48806`；已定蓝 `#e6f4ff`/`#206bc4`
- 每图右下角 footer：「PUL-FMS · <图名> · 蓝=已定 橙=模式差异 红虚线=逆向 紫=异常补救（不卡流程）· fireworks-tech-graph Style 1」
- 每图 legend：主流程 / 模式差异段 / 逆向回流（红虚线）/ 异常补救（事后·不卡流程）
- 铁律角标节点（两图同挂，放异常泳道或 footer 上方）：rect「铁律：药必须发得出优先 · 码账事后补平 · 全程留痕」

---

### Task 1: 重写 04-dispensing.json（门诊发药流程）

**Files:**
- Modify: `prototypes/shared/diagrams/fireworks/04-dispensing.json`（整体重写）
- Create/Update: `04-dispensing.svg`、`04-dispensing.html`、`04-dispensing.png`、`04-layout.json`（渲染产物）

**泳道**（id / label / y×h）：
1. `lane-doc` 医生 / HIS（y=100, h=150）
2. `lane-pha` 药房 · 药师（y=270, h=620）
3. `lane-exc` 药房 · 异常补救（当场降级 · 不卡流程）（y=910, h=230）
4. `lane-pat` 患者（y=1160, h=110）

**节点清单**（全部 text_policy=strict 可见）：

| id | kind | 泳道 | type_label | label | sublabel | 颜色 |
|---|---|---|---|---|---|---|
| D1 | rect | doc | RX | 开处方 · 药名+规格+数量 | 只到药品级 · 系统锁药品级数量、调剂时 FEFO+货位配码（已定方案 b） | 橙 |
| R1 | hexagon | doc | DECISION · 逆向 | HIS 退方 · 已发药？ | — | 红 |
| R1A | rect | doc | REVERSE | 未发：释放锁定 + 解绑回架 | 码复用 · 写台账 | 红 |
| M1 | rect | pha | DISPENSE | 调剂：接收处方 | 系统推送候选码（FEFO+货位） | 橙 |
| M2A | rect | pha | 模式① · T2 | 边扫边拿 | 扫一盒拿一盒 · 码实同步 | 橙 |
| M2B | rect | pha | 模式② · T2 常用 | 窗口先抓后扫 | 抓药入篮 → 逐盒扫码赋码 | 橙 |
| SP1 | rect | pha | SPLIT · 拆零 | 拆零：扫整盒码累加 | 1 码=1 基本单位（盒） | 橙 |
| SP2 | hexagon | pha | DECISION | 累计 ≥ 处方量？ | — | 橙 |
| SP3 | rect | pha | SPLIT | 末盒标记拆零 · 余量回记在架 | 下次发药优先消耗 | 橙 |
| M2C | rect | pha | 模式③ · T1 | 药柜预设顺序取药 | 上架预贴码+货位物理/规则序 · 扫码=确认 | 橙 |
| DEC | hexagon | pha | DECISION | 扫码核对成功？ | — | 橙 |
| OUT | rect | pha | SCAN OUT | 出库扣账 | 码绑处方 · 逐码确认 | 蓝 |
| BK | rect | pha | RESTOCK | 码回架复用 | 逆向公共终点 | 红 |
| R2 | rect | pha | REVERSE | 窗口退药 | 扫原码退→码回架复用；拆零药退→记拆零退回不回码；已结算走既有冲正通道 | 红 |
| RULE | rect | exc | RULE · 铁律 | 药必须发得出优先 · 码账事后补平 | 异常不卡流程 · 全程留痕 | 紫 |
| E1 | rect | exc | MANUAL BIND · T3 | 手动补绑 · 当场完成 | 系统推荐（药柜=货位序→FEFO / 非药柜=FIFO）+人工选定 · bindType=manual | 紫 |
| E2 | rect | exc | LEDGER · 日结 | 赋码异常台账 · 日结复核（与 04b 共用） | 待复核→确认/改绑/关闭 · 超 24h 升级院区管理员 | 紫 |
| W1 | rect | pat | PATIENT | 窗口签收 · 患者已绑 | 结算上传医保（先扫码后结算） | 橙 |

**箭头清单**（source→target / flow / label；逆向用 data + 红）：

1. D1→M1 control
2. M1→M2A control；M1→M2B control；M1→M2C control（三模式并列）
3. M2A→DEC control；M2C→DEC control
4. M2B→SP1 control；SP1→SP2 control；SP2→SP1 data「否·继续扫下一盒」（拆零回路）；SP2→SP3 data「是」；SP3→DEC control
5. DEC→OUT control「成功」；OUT→W1 control
6. DEC→E1 data「失败 · 当场降级」
7. E1→OUT control「当场完成绑定 · 不卡流程」（**回归线，本图关键表达**）
8. E1→E2 data「写台账待复核」
9. E2→BK data「改绑：释放错绑码回架」
10. R1→R1A data「未发」；R1A→BK data；R1→R2 data「已发·转退药」
11. W1→R2 data「患者退药」（红虚线回流）
12. R2→BK data「原码回架复用」

- [ ] **Step 1: 重写 04-dispensing.json**——按上表；title=「药房发药流程 · 门诊（三模式 · 当场降级 · 逆向）」，subtitle=「实物=码账+异常待补 · 异常不卡流程、事后台账补平 · 拆零扫整盒码累加持平 · 2026-10-03 拍板分图」
- [ ] **Step 2: validate + render + check**

```bash
SKILL_ROOT="C:/Users/游开龙/.claude/skills/fireworks-tech-graph"
FW=prototypes/shared/diagrams/fireworks
python3 "$SKILL_ROOT/scripts/fireworks.py" validate architecture "$FW/04-dispensing.json"
python3 "$SKILL_ROOT/scripts/fireworks.py" render architecture "$FW/04-dispensing.json" "$FW/04-dispensing.svg" --report "$FW/04-layout.json"
python3 "$SKILL_ROOT/scripts/fireworks.py" check "$FW/04-dispensing.svg"
```

预期：validate 通过；check 无交叉/无截断（有截断警告必须修，text_policy=strict 下不允许藏文案）

- [ ] **Step 3: export HTML + PNG，Read PNG 目检**（文字完整、箭头方向、线条不交叉、泳道对齐）

```bash
python3 "$SKILL_ROOT/scripts/fireworks.py" export-html "$FW/04-dispensing.svg" "$FW/04-dispensing.html"
python3 "$SKILL_ROOT/scripts/fireworks.py" export-png "$FW/04-dispensing.svg" "$FW/04-dispensing.png" --width 1920
```

- [ ] **Step 4: Commit**

```bash
git add prototypes/shared/diagrams/fireworks/04-dispensing.json prototypes/shared/diagrams/fireworks/04-dispensing.svg prototypes/shared/diagrams/fireworks/04-dispensing.html prototypes/shared/diagrams/fireworks/04-dispensing.png prototypes/shared/diagrams/fireworks/04-layout.json
git commit -m "feat: 04图纸重构——门诊发药三模式+拆零扫到持平+当场降级+逆向回流"
```

---

### Task 2: 新增 04b-inpatient-dispensing.json（住院摆药流程）

**Files:**
- Create: `prototypes/shared/diagrams/fireworks/04b-inpatient-dispensing.json`
- Create: `04b-inpatient-dispensing.svg` / `.html` / `.png`、`04b-layout.json`

**泳道**：
1. `lane-doc` 医生 / HIS
2. `lane-pha` 药房 · 药师（摆药）
3. `lane-exc` 药房 · 异常补救（事后专区 · 不卡流程）
4. `lane-ward` 病区 · 护士

**节点清单**：

| id | kind | 泳道 | type_label | label | sublabel | 颜色 |
|---|---|---|---|---|---|---|
| D1 | rect | doc | ORDER | 医嘱汇总 → 生成摆药单 | 按顿拆分 · 拆零为常态 · 系统锁药品级数量 | 橙 |
| R1 | rect | doc | REVERSE | 医嘱撤销 | 未摆药=释放锁定 · 已摆药=转摆药退回 | 红 |
| M1 | rect | pha | PICK | 先拿药 | 摆药单驱动 · 按货位顺序 | 橙 |
| M2 | rect | pha | MATCH | 后匹配码 | 规则自动匹配：FEFO+货位序 | 橙 |
| DEC | hexagon | pha | DECISION | 规则匹配命中？ | 规则≠实际为常态偏差 | 橙 |
| OUT | rect | pha | SCAN OUT | 出库扣账 · 在途 | 码绑摆药单 | 蓝 |
| BK | rect | pha | RESTOCK | 码回架复用 | 逆向公共终点 | 红 |
| R3A | rect | pha | REVERSE | 摆药退回（未签收） | 解绑回架 | 红 |
| RULE | rect | exc | RULE · 铁律 | 药必须发得出优先 · 码账事后补平 | 异常不卡流程 · 全程留痕 | 紫 |
| E2 | rect | exc | LEDGER · 日结 | 赋码异常台账（与 04 共用） | 偏差自动生成「待补绑」→ 确认/改绑/关闭 · 超 24h 升级 | 紫 |
| E1 | rect | exc | MANUAL BIND | 日结前手动补绑 | 系统推荐+人工选定 · bindType=manual | 紫 |
| W1 | rect | ward | WARD | 病区签收 · 在途→闭环 | 码随发药单绑患者 | 橙 |
| R3B | rect | ward | REVERSE | 病区退回（已签收） | 转退药流程 rx-ret | 红 |

**箭头清单**：

1. D1→M1 control；M1→M2 control；M2→DEC control
2. DEC→OUT control「命中 · 绑定」
3. DEC→OUT data「偏差 · 药照发不卡流程」（**命中/偏差都通向 OUT，本图关键表达**）
4. DEC→E2 data「偏差 · 自动生成待补绑」
5. E2→E1 data「日结前补绑」；E1→E2 data「补绑完成 · 待复核」
6. E2→BK data「改绑：释放错绑码回架」
7. OUT→W1 control「在途 → 签收闭环」
8. R1→R3A data「已摆药 · 转退回」
9. OUT→R3A data「摆药退回（未签收）」（红虚线）；R3A→BK data
10. W1→R3B data「病区退回（已签收）」（红虚线）

- [ ] **Step 1: 新增 04b-inpatient-dispensing.json**——title=「摆药发药流程 · 住院（先拿后匹配 · 事后补绑 · 逆向）」，subtitle=「摆药单驱动 · 规则匹配偏差=默认出口 · 异常日结闭环 · 与图 04 共用台账 · 2026-10-03 拍板分图」
- [ ] **Step 2: validate + render + check**（命令同 Task 1 模板，`<name>=04b-inpatient-dispensing`，report=`04b-layout.json`）
- [ ] **Step 3: export HTML + PNG，Read PNG 目检**
- [ ] **Step 4: Commit**

```bash
git add prototypes/shared/diagrams/fireworks/04b-inpatient-dispensing.* prototypes/shared/diagrams/fireworks/04b-layout.json
git commit -m "feat: 新增04b图纸——住院摆药先拿后匹配+偏差默认出口+事后补绑+逆向回流"
```

---

### Task 3: 图纸索引页登记

**Files:**
- Modify: `prototypes/shared/diagrams/index.html:76`（04 条目改写 + 其后插入 04b 条目）

- [ ] **Step 1: 改 04 条目 + 新增 04b 条目**（「发药管理」分组内）

```js
{ f: '04-dispensing',  t: '门诊发药（三模式 · 当场降级 · 逆向）', c: '边扫边拿/窗口先抓后扫(拆零扫到持平)/药柜预设 · 异常当场补绑不卡流程' },
{ f: '04b-inpatient-dispensing', t: '住院摆药（先拿后匹配 · 事后补绑 · 逆向）', c: '摆药单驱动先拿药 · 规则匹配偏差=默认出口 · 台账日结闭环 · 与04共用台账' },
```

同时把头部「共 15 张 + 1 份实例」改为「共 16 张 + 1 份实例」（先 grep 确认实际文案再改）。

- [ ] **Step 2: 浏览器打开 `prototypes/shared/diagrams/index.html` 确认 04/04b 条目可点开**（或起本地服务截图）
- [ ] **Step 3: Commit**

```bash
git add prototypes/shared/diagrams/index.html
git commit -m "docs: 图纸索引登记04b住院摆药图（15+1→16+1）"
```

---

### Task 4: 收尾

- [ ] **Step 1: 全量复查**——两张 PNG 并排目检；`git status` 确认无遗漏产物
- [ ] **Step 2: 更新记忆**——`pul-fms-prototype-state.md`：图纸 16+1，04 重构+04b 新增，本轮只动图纸未动 PRD/原型
- [ ] **Step 3: 复盘四步小结交付用户**（回顾目标→评估结果→分析原因→沉淀规律）；部署与否询问用户（本轮范围=图纸，默认不跑 npm run deploy）

---

## Self-Review 记录

- Spec 覆盖：设计稿第四/五节节点 → Task 1/2 节点清单全覆盖（含拆零回路、E1 回归线、DEC 双出口、三类逆向）；第六节工程约定 → 通用命令模板+布局网格；索引登记 → Task 3。
- 占位符：无 TBD；命令均为可执行完整命令。
- 一致性：两图节点 id 命名一致（D1/M1/M2/DEC/OUT/BK/E1/E2/W1/R*）；04b 文件名与 index.html 条目的 `f` 字段一致（`04b-inpatient-dispensing`）。
