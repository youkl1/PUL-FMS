# 领用业务流重构（备货草稿态统一）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「备货」正名为出库单的草稿态（备货中），扫码进度落盘；新增共享药品选择器（模糊搜索+双存量+货位过滤）与库房主动制单（待提交草稿）；修复 P0 断链与流水台账未过滤草稿。

**Spec:** `docs/superpowers/specs/2026-10-01-pick-draft-unify-design.md`（V2 已批准）

**Architecture:** 单一事实源调整——备货作业从 wh-pick.js 的内存 `picked={}` 改为直接读写 `pickDocs` 草稿行的 `codes`；reqPool 加 `source`（药房申请/库房制单）与存储态 `待提交/备货中`；药品选择器做成无依赖内联组件 `PulDrugPicker.mount(container, opts)`，ph-req 与 wh-pick-out 制单共用。

**Tech Stack:** 原生 JS（IIFE + window 命名空间）、Tabler 本地化 CSS、sessionStorage store、node vm 不变量测试 + headless 截图走查。

**工作目录约定：** 以下所有相对路径均以 `prototypes/2026-09/pul-fms-base-v1/` 为根（脚本在 `scripts/` 下）。

**关键既有事实（执行者无需再查）：**
- 码对象形状：`{code(20位), level, split:'是/否', splitQty, batch, prodDate, expDate, checked, code2, code3, location}` + migrate 补 `phLoc/expectLoc`
- `W.pickPosted(d)` = `status==='已出库' || '药房已入库'`；`stockAll`/`transitByReq`/`wh-out-query` 已天然排除备货中
- `W.pharmacyStock(wh, pharmacy)` → 药房在架码数组（带 phLoc/split/splitQty）；`W.stockAll(PS, S, wh)` → 库房在架码数组
- `P.parseCode(code20, DICT)` → `{dict, idcode, code}`；`D.conv(DS, drugCode, qty, fromUnit, toUnit)` 换算
- UI 助手（purchase-shared.js）：`UI.modalShell(id,title,bodyHtml,footHtml,width)`、`UI.open(id)`、`UI.close(id)`、`UI.confirm(html,onOk,title)`、`UI.openScan({title,hint,gate,node,onScan,onClose})`、`UI.tabsHeader(tabs,active)`、`esc`
- 测试：`node scripts/_t-invariants.node.js`（在 pul-fms-base-v1 目录跑）；headless 截图用 `msedge --headless --disable-gpu --screenshot=<out> --window-size=2000,1400 --virtual-time-budget=8000 "file:///<abs path>"`
- 加罗新在架箱码（purchase-data.js L63）：`84147840007702017701` = `code('8414784','000770201','7701','250702','2025-07-10','2027-07-09',{checked:true,location:'A-01-02'})`，1 箱=60 瓶
- quick-scan.js `openPickReq` 只列 `status==='待备货'`——req 存 `备货中` 后自动从快捷选单消失，**防重免代码**

---

### Task 1: 数据层修复——ledger 过滤备货中 + reqPool.source 迁移（TDD）

**Files:**
- Modify: `scripts/ledger-data.js:52-55`
- Modify: `scripts/wh-data.js`（migrate 函数，L91-93 区域）
- Test: `scripts/_t-invariants.node.js`

- [ ] **Step 1: 写失败测试**

在 `_t-invariants.node.js` 的 `load('inv-data.js');` 之后追加 `load('ledger-data.js');`，文件末尾追加：

```javascript
console.log('# ledger 不含备货中草稿');
window.store.update({ wh: {
  pickDocs: [
    { billNo: 'LYCK-DRAFT1', status: '备货中', warehouse: '中心库', pharmacy: '门诊药房', date: '2026-10-01 09:00', codes: [c(CODE_A)] },
    { billNo: 'LYCK-POST1', status: '已出库', warehouse: '中心库', pharmacy: '门诊药房', date: '2026-10-01 10:00', auditTime: '2026-10-01 10:05', codes: [c(CODE_B)] }
  ],
  retInDocs: [], othInDocs: [], othOutDocs: [], lossDocs: [], reqPool: [], retPool: [], phLossDocs: []
} });
var evs = window.PUL_LEDGER.collect();
ok('备货中草稿不进流水', !evs.some(function (e) { return e.billNo === 'LYCK-DRAFT1'; }));
ok('已出库进流水', evs.some(function (e) { return e.billNo === 'LYCK-POST1'; }));

console.log('# reqPool migrate 补 source');
var whMig = W.load();
ok('migrate 后 reqPool 全部有 source', (whMig.reqPool || []).every(function (r) { return !!r.source; }));
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/_t-invariants.node.js`（cwd = pul-fms-base-v1）
Expected: FAIL「备货中草稿不进流水」（ledger 未过滤）；「migrate 后 reqPool 全部有 source」FAIL（无 source 字段）

- [ ] **Step 3: 实现**

`ledger-data.js` L52 循环内第一行加过滤：

```javascript
    (wh.pickDocs || []).forEach(function (d) {
      if (d.status !== '已出库' && d.status !== '药房已入库') return;   // 备货中草稿不是出库事实
      var t = d.status === '药房已入库' ? '药房入库' : '领用出库';
```

`wh-data.js` migrate() 的 reqPool 循环（L91-93）改为：

```javascript
    (s.reqPool || []).forEach(function (r) {
      (r.items || []).forEach(function (it) { if (it.slot === undefined) it.slot = ''; });
      if (!r.source) r.source = '药房申请';   // 2026-10-01 库房制单引入 source 字段，老数据兜底
    });
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node scripts/_t-invariants.node.js`
Expected: 全部 `ok`，进程退出码 0（文件尾部原有 `process.exit(failed ? 1 : 0)` 逻辑不变）

- [ ] **Step 5: Commit**

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/ledger-data.js prototypes/2026-09/pul-fms-base-v1/scripts/wh-data.js prototypes/2026-09/pul-fms-base-v1/scripts/_t-invariants.node.js
git commit -m "fix: 流水台账过滤备货中草稿；reqPool migrate 补 source 字段"
```

---

### Task 2: seed 演示数据——备货中草稿 + 待提交制单

**Files:**
- Modify: `scripts/wh-data.js`（PICK_DOCS L44 区域、REQ_POOL L56 区域）

- [ ] **Step 1: PICK_DOCS 加备货中草稿**

在 PICK_DOCS 数组头部（第一条 `已出库` 种子之前）插入：

```javascript
    { billNo: 'LYCK20261001001', reqNo: '', date: '2026-10-01 09:40', pharmacy: '门诊药房', warehouse: '中心库',
      status: '备货中', operator: '王铁军', remark: '直接扫码出库演示（草稿）',
      codes: [{ code: '84147840007702017701', level: 1, split: '否', splitQty: '', batch: '250702',
        prodDate: '2025-07-10', expDate: '2027-07-09', checked: true, code2: '', code3: '', location: 'A-01-02' }] },
```

- [ ] **Step 2: REQ_POOL 加待提交制单 + 既有种子补 source**

REQ_POOL 头部插入：

```javascript
    { reqNo: 'LY20261001001', date: '2026-10-01 09:58', pharmacy: '门诊药房', warehouse: '中心库', applicant: '王铁军',
      source: '库房制单', items: [{ drugCode: 'YP010312', qty: 2, slot: '' }], status: '待提交', remark: '缺货驱动制单演示' },
```

既有 4 条 req 种子各加 `source: '药房申请'`（与 migrate 兜底一致，种子写全便于阅读）。

- [ ] **Step 3: 验证**

Run: `node scripts/_t-invariants.node.js`
Expected: 全 ok（备货中草稿不扣账断言继续通过）

注意：sessionStorage 老会话靠 migrate 兜底 source；种子变更需清 sessionStorage 才可见（README 惯例，走查时开新会话/隐身窗口）。

- [ ] **Step 4: Commit**

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/wh-data.js
git commit -m "feat: seed 加备货中草稿与库房制单待提交演示数据"
```

---

### Task 3: 共享药品选择器组件 drug-picker.js（新文件）

**Files:**
- Create: `scripts/drug-picker.js`
- Test: 挂到 ph-req 后随 Task 6 截图验证；本任务先交付纯组件

组件契约（无 DOM 依赖注入，挂载到调用方容器）：

```javascript
/**
 * drug-picker.js — 共享药品选择器（对齐老系统缺药领用单药品选择弹窗）
 * 搜索：名称/编码/厂家模糊匹配（字典无拼音码字段，本期不做拼音）
 * 列：药品名称/规格/剂型/药房存量/药房零头/库房存量/库房零头/生产厂家/批准文号/药品编码
 * 货位过滤：选货位 → 只显示该货位 phLoc 有药房在架的药品
 * 用法：var api = PulDrugPicker.mount(container, { warehouse, pharmacy, slots, items, showSlot });
 *       api.getItems() → [{drugCode, qty, slot}]
 */
```

实现要点（执行者照此写全文件）：
- IIFE 输出 `window.PulDrugPicker = { mount: mount }`
- `mount(container, opts)`：opts = `{warehouse, pharmacy, slots:[], items:[], showSlot:bool}`；内部状态 `items`（已选）
- 布局（Tabler 类）：上行筛选条（搜索 input + 货位 select）→ 候选表（点行加入已选，已在已选中的行置灰）→ 已选清单表（数量 number input + showSlot 时货位 select + 删除按钮）
- 存量聚合 helper：

```javascript
  function aggByDrug(codes) {   // codes: 在架码数组 → { drugCode: {qty, splitQty} }
    var m = {};
    (codes || []).forEach(function (c) {
      var p = window.PUL_PCH.parseCode(c.code, DICT);
      if (!p.dict) return;
      var dc = p.dict.drugCode;
      if (!m[dc]) m[dc] = { qty: 0, splitQty: 0 };
      var d = window.PUL_DRUG.drugOf(DS, dc);
      var v = d ? window.PUL_DRUG.conv(DS, dc, 1, p.dict.packUnit || p.dict.unit, d.baseUnit) : 1;
      m[dc].qty += (v == null ? 1 : v);
      if (c.split === '是') m[dc].splitQty += parseInt(c.splitQty || '0', 10) || 0;
    });
    return m;
  }
```

- 库房存量 = `aggByDrug(W.stockAll(P.load(), S, opts.warehouse))`；药房存量 = `aggByDrug(W.pharmacyStock(S, opts.pharmacy))`（S=W.load()、P=PUL_PCH、W=PUL_WH、DS=PUL_DRUG.load()、DICT=PUL_DRUG.flat(DS)）
- 候选药品源 = `DS.drugs.filter(d => d.status==='启用' && (!opts.warehouse || d.warehouse===opts.warehouse))`
- 货位过滤：opts.pharmacy 的 `pharmacyStock` 码中 `phLoc===所选货位` 的 drugCode 集合
- `getItems()` 读取已选表当前 input 值返回
- 全文件 < 250 行；样式复用 Tabler 类，不自写 css

- [ ] **Step 1: 写组件文件**（按上述契约与要点）
- [ ] **Step 2: 语法自检**

Run: `node -e "require('vm').runInNewContext(require('fs').readFileSync('scripts/drug-picker.js','utf8'),{window:{},console:console})"`（cwd = scripts/ 的上一级，即 pul-fms-base-v1；若路径不对调整）
Expected: 无语法错误抛出

- [ ] **Step 3: Commit**

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/drug-picker.js
git commit -m "feat: 共享药品选择器组件（模糊搜索+双存量+货位过滤，对齐老系统缺药领用单）"
```

---

### Task 4: wh-pick.js 重构——备货=草稿单上扫码（核心）

**Files:**
- Modify: `scripts/wh-pick.js`（全文件重构，保持 IIFE 与外部行为契约：`?billNo=` 深链、`[data-pickreq]` 测试钩子、`btnScan/btnAudit` id）

改动清单（按函数）：

1. **删除** `picked={}`、`quickPharm`、`sel.kind==='quick'` 全部分支；新工作台事实源 = 当前选中草稿 doc 的 `codes`
2. **rows()**：状态派生改为 `doc ? doc.status : '待备货'`（req 无 doc 时）；无申请 pickDoc 行 `src` 文案：`reqNo` 空 → badge「直接出库」；**不显示** reqPool 中 `status==='待提交'` 的行（filter 掉）
3. **docsTable()**：
   - 状态四档渲染：待备货（蓝）/ 备货中（琥珀）/ 已出库·在途（琥珀沿用现「已出库·在途」样式）/ 药房已入库（绿）
   - 行 op：待备货 → `<button class="btn btn-sm btn-primary" data-pickreq="REQNO">备货</button>`（保持钩子名）；备货中 → `<button class="btn btn-sm btn-primary" data-resume="BILLNO">继续备货</button>`；已出库 → 确认药房入库（现状）；已入库 → 「闭环」
   - 状态筛选选项改为 `['全部','待备货','备货中','已出库','药房已入库']`（已出库显示「已出库·在途」）
4. **btnQuick → 直接扫码出库**：按钮文案 `⚡ 直接扫码出库`；点击弹窗（领用药房 select（PUL_FACILITY 启用药房）+ 备注 input + 说明「无申请单、不带上架货位；扫码进度实时保存，可离开后继续」）→ 确认即建草稿：

```javascript
S.pickDocs.unshift({ billNo: W.nextNo('LYCK', S.pickDocs), reqNo: '', date: W.now(),
  pharmacy: ph, warehouse: curWh(), status: '备货中', operator: curUserName(), remark: remark, codes: [] });
save(); sel = { kind: 'doc', key: billNo }; renderAll();
```

5. **备货/继续备货入口**：`data-pickreq` 点击 → `docOfReq(reqNo)` 有草稿则选之；无则建草稿 `{billNo: nextNo, reqNo, pharmacy: req.pharmacy, warehouse: curWh(), status:'备货中', codes:[]}` 并把 `req.status='备货中'`，save 后选中进工作台。`data-resume` 点击 → 选对应 doc
6. **selRow/selDoc 统一**：`sel.kind` 只留 `'req'`（无草稿的待备货申请，明细只读+备货按钮）与 `'doc'`；doc 是否可作业 = `doc.status==='备货中'`
7. **codePanel()**：备货中 doc → 可编辑（移除按钮 `data-unpick` 从 `doc.codes` splice + save + renderAll；清空=codes 清空 + save）；已出库/已入库 → 只读（现状）。底部按钮组仅备货中可见：扫码备货 / 清空 / ✓ 审核出库（codes 空时 disabled）
8. **openScanModal() onScan**：拦截逻辑不变（非在架 bad / 重复 warn / req 关联时非本单药品 bad / 超申请 warn）；通过时：

```javascript
doc.codes.push(Object.assign({}, c));   // c 来自 stockMap
save(); renderAll();
```

反馈消息沿用「已备 got/申请 qty」口径（got 由 doc.codes 聚合）
9. **openAudit()**：仅备货中 doc 可进；**先重验在架**：

```javascript
var sm = stockMap();
var lost = doc.codes.filter(function (c) { return !sm[c.code]; });
if (lost.length) {
  UI.confirm('以下 ' + lost.length + ' 个码已不在在架（可能被其他单据出库）：<br>' +
    lost.map(function (c) { return esc(c.code); }).join('<br>') +
    '<br>请先在码清单移除后再审核。', function () {}, '审核被拦截');
  return;
}
```

通过后：`doc.status='已出库'; doc.auditTime=W.now(); doc.operator=当前人;` 每码 `c.expectLoc = req ? slotOfItem(req, drugOfCode(c.code)) : '';`；`if (req) req.status='已完成';` save + toast（不再 unshift 新单）
10. **drugPanel()**：备货中 doc 且有关联 req → 现「申请数 vs 已备数」表，已备数改从 `doc.codes` 聚合；无 req → 现 quick 汇总表（列头「差额」列改「—」，副标题改「直接扫码出库 · 药房名」）；已出库/已入库只读分支不变
11. **深链/初始选中**：`qsBill` doc 存在 → 选中（备货中=工作台，其余只读）；否则第一张待备货申请（现状）；**删除**「已扫 N 个码请清空再切换」拦截（进度已落盘，自由切换）
12. **renderAll 布局不变**：filterBar + docsTable + 双栏

- [ ] **Step 1: 按清单改 wh-pick.js**
- [ ] **Step 2: 更新自动交互测试 `_t-wh-pick.js`**

流程不变（点 `[data-pickreq="LY20260914002"]` → btnScan → 扫箱码 → 扫非在架码），头部注释改为：备货即建草稿、扫码实时落盘；追加第三步断言——扫码后 `window.store.load().wh.pickDocs` 存在 `reqNo==='LY20260914002' && status==='备货中' && codes.length===1` 的草稿，并把结果 `console.log`（截图时可见 console 不必须，DOM 已反映）

- [ ] **Step 3: headless 截图走查**

```bash
msedge --headless --disable-gpu --screenshot=_shots/wh-pick-draft-r1.png --window-size=2000,1400 --virtual-time-budget=8000 "file:///D:/Claude-code/PUL-FMS/PUL-FMS/prototypes/2026-09/pul-fms-base-v1/_t-wh-pick.html"
```

（无 msedge 则换 chrome；路径按实际）Expected: 截图中反馈条「✓ 加罗新 +60瓶（已备 60/60）」+ 非在架红拦截；单据列表出现「备货中」状态行

- [ ] **Step 4: 手动走查**（起 9990 服务或 file:// 直接开 wh-pick.html）
① 待备货→备货→扫 1 码→**刷新页面**→码仍在（落盘验证）② 直接扫码出库建草稿→列表见备货中行 ③ 审核空草稿按钮 disabled
- [ ] **Step 5: Commit**

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/wh-pick.js prototypes/2026-09/pul-fms-base-v1/scripts/_t-wh-pick.js prototypes/2026-09/pul-fms-base-v1/_shots/wh-pick-draft-r1.png
git commit -m "refactor: 备货=出库单草稿上扫码（进度落盘/刷新续作/断链修复/直接扫码出库）"
```

---

### Task 5: wh-pick-out.js——台账化 + 库房制单

**Files:**
- Modify: `scripts/wh-pick-out.js`
- Modify: `wh-pick-out.html`（引入 drug-picker.js）

- [ ] **Step 1: 状态词统一**

删 `stText` 映射；`stHtml` 加备货中分支（琥珀 `备货中`）；筛选选项 `['备货中','已出库','药房已入库']`；`list()` 过滤直接用 `d.status===f.status`

- [ ] **Step 2: 行操作改造**

`ops(d)`：备货中 →

```javascript
return '<a class="btn btn-sm btn-primary" href="wh-pick.html?billNo=' + encodeURIComponent(d.billNo) + '">继续备货 →</a> ' +
  '<button class="btn btn-sm btn-outline-danger" data-void="' + esc(d.billNo) + '">✗ 作废</button>';
```

- [ ] **Step 3: 作废放宽 + 回写申请**

`voidDoc(d)` 删除「有码请到备货单处理」拦截，改为：

```javascript
UI.confirm('作废 <b>' + esc(d.billNo) + '</b>？' + ((d.codes || []).length ? '已扫 ' + d.codes.length + ' 个码未扣账，作废即释放。' : '空单直接删除。') , function () {
  wh.pickDocs = wh.pickDocs.filter(function (x) { return x.billNo !== d.billNo; });
  if (d.reqNo) (wh.reqPool || []).forEach(function (r) { if (r.reqNo === d.reqNo) r.status = '待备货'; });
  if (sel === d.billNo) sel = null;
  save(); renderAll(); window.showToast('已作废');
}, '确认作废');
```

- [ ] **Step 4: 列表合并待提交制单行**

`list()` 返回前 concat：`(wh.reqPool||[]).filter(r => r.source==='库房制单' && r.status==='待提交' && r.warehouse===curNode())` 映射为 `{isReqDraft:true, billNo:r.reqNo, date:r.date, warehouse:r.warehouse, pharmacy:r.pharmacy, operator:r.applicant, status:'待提交', reqNo:'', _req:r}`；行渲染状态列显示灰 badge「待提交」、来源列「库房制单」、操作列：「编辑」（重开制单弹窗预填）/「提交」（confirm 后 `_req.status='待备货'`，save，toast「已提交，库房备货队列可见」）/「删除」（confirm 后从 reqPool 删除）；明细区对 isReqDraft 行只渲染药品清单页签（items），码详情显示「待提交单尚未备货」

- [ ] **Step 5: 新增单据升级完整制单**

`openNew()` 弹窗加宽至 1100，内容：领用药房 select（必选）+ 备注 + `PulDrugPicker.mount(容器, {warehouse:curNode(), pharmacy:选中药房, slots:该药房slots, showSlot:true, items:已有items})`；保存：`api.getItems()` 非空校验（空→toast「请至少选择 1 个药品」）→

```javascript
wh.reqPool.unshift({ reqNo: W.nextNo('LY', wh.reqPool, 'reqNo'), date: W.now(), pharmacy: ph,
  warehouse: curNode(), applicant: curUser(), source: '库房制单', items: items, status: '待提交', remark: remark });
```

保存后 toast「已保存待提交，提交后进入备货队列」（**不跳工作台**——待提交先制单后提交，对齐老系统）

- [ ] **Step 6: wh-pick-out.html 引入组件**

在 `purchase-shared.js` script 标签后加 `<script src="scripts/drug-picker.js"></script>`

- [ ] **Step 7: 验证 + Commit**

手动走查：新增单据→选择器选 2 药填数量→保存→列表见待提交行→提交→wh-pick 列表出现该申请待备货行；备货中行「继续备货 →」跳 wh-pick 进工作台可扫码（**P0 断链修复验证**）；作废有码草稿→关联申请回待备货

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/wh-pick-out.js prototypes/2026-09/pul-fms-base-v1/wh-pick-out.html
git commit -m "feat: 领用出库单台账化——待提交制单/继续备货跳转/作废放宽回写/状态词统一"
```

---

### Task 6: ph-req.js——换选择器 + 备货中锁定

**Files:**
- Modify: `scripts/ph-req.js`
- Modify: `ph-req.html`（引入 drug-picker.js）

- [ ] **Step 1: 编辑器换共享选择器**

`openEdit` 弹窗加宽至 1100；删 `drugOpts` 与 per-row `<select data-drug>` 行结构；申请明细区改为 `PulDrugPicker.mount(el.querySelector('#rqPicker'), { warehouse: 选中供货库房, pharmacy: curPharm(), slots: 当前药房slots, showSlot: true, items: req?req.items:[] })`；供货库房 select 变更时重挂 picker（warehouse 影响药品源与库房存量列）；`rqOk` 校验改为 `api.getItems()` 非空且 qty≥1

- [ ] **Step 2: 备货中状态显示与锁定**

列表 `st`：加 `r.status==='备货中'` 分支（蓝 badge「备货中」）；`op`：`status==='待备货'` 才显示编辑/撤销（现状逻辑已满足），备货中显示 `<span class="text-secondary">库房备货中</span>`；筛选选项 `['全部','待备货','备货中','已完成']`

- [ ] **Step 3: ph-req.html 引入 drug-picker.js**（同 Task 5 Step 6）
- [ ] **Step 4: 验证 + Commit**

走查：新增申请→选择器搜索「加罗新」→存量列有值→选药填数量选货位→提交；备货中申请编辑/撤销按钮消失

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/ph-req.js prototypes/2026-09/pul-fms-base-v1/ph-req.html
git commit -m "feat: 领用申请换共享药品选择器（模糊搜索+双存量）；备货中状态锁定编辑"
```

---

### Task 7: quick-scan 提示 + 回归

**Files:**
- Modify: `scripts/quick-scan.js`（openPickReq 一处文案）
- Test: `_t-wh-pick.html` 截图、node 不变量

- [ ] **Step 1: openPickReq 空态文案**

`reqs` 过滤补注释 + 空态文案改为：`本库房暂无待备货申请单（备货中的申请请到「领用备货单」继续）`。过滤条件 `status==='待备货'` **不改**——备货中自动消失即防重

- [ ] **Step 2: 全量回归**

Run: `node scripts/_t-invariants.node.js`（全 ok）
Run: headless 截图 `_t-wh-pick.html`（Task 4 已跑可复跑确认无回归）
手动：quick-scan.html 打开选单弹窗确认备货中申请不出现

- [ ] **Step 3: Commit**

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/quick-scan.js
git commit -m "feat: 快捷扫码选单空态提示备货中去向（存储态防重免拦截代码）"
```

---

### Task 8: 文档同步 + 部署

**Files:**
- Modify: `README.md`（pul-fms-base-v1，追加 Round AB 节）
- Modify: `plan.html` / `scripts/guide-data.js`（wh-pick/wh-pick-out 描述中「一步式」相关文案改「直接扫码出库」；先 grep 定位）
- Modify: `../`（若 `prototypes/` 根 index 有计数/描述涉及，跑现有校验脚本确认）

- [ ] **Step 1: README 追加 Round AB**

```markdown
## 十六、Round AB：领用业务流重构——备货草稿态统一 + 老系统对齐（2026-10-01）

起因：备货/出库双页逻辑混乱（P0 断链：新增空单跳备货页只读）+ 申请药品选择器全量下拉不可用。设计稿 docs/superpowers/specs/2026-10-01-pick-draft-unify-design.md（老系统截图证据：缺药领用单四态/备货=数量确认/领用扫码=直接出库）。

| 改动 | 文件 | 说明 |
|------|------|------|
| 备货草稿态 | wh-pick.js | 备货=备货中出库单上扫码，进度落盘（废弃内存 picked），刷新/换班可续；审核时重验在架 |
| 双页分工 | wh-pick-out.js | 台账+制单：待提交制单行（编辑/提交/删除）、继续备货跳工作台、作废放宽回写申请 |
| 共享选择器 | drug-picker.js（新） | 模糊搜索+药房/库房双存量+货位过滤；ph-req 与制单共用 |
| 领用单来源 | wh-data.js ph-req.js | reqPool 加 source（药房申请/库房制单）+ 待提交态（仅制单）；药房申请维持提交即待备货 |
| 防重 | quick-scan.js | 备货中申请自动从快捷选单消失（存储态防重） |
| 流水修复 | ledger-data.js | 备货中草稿不进流水台账 |
| 更名 | wh-pick.js | 一步式→直接扫码出库（跳过的是申请不是备货） |
```

- [ ] **Step 2: plan.html / guide-data.js 文案同步**（grep「一步式」「备货」逐处核对改「直接扫码出库」）
- [ ] **Step 3: 校验脚本**

Run: `node scripts/_t-guide.node.js` 与 menu 同步校验（若存在 check-prd-menu-sync.js 按 memory 口径跑）
Expected: 全过

- [ ] **Step 4: Commit + 部署**（项目约定生成即部署）

```bash
git add -A prototypes/2026-09/pul-fms-base-v1
git commit -m "docs: Round AB 记录 + plan/guide 文案同步（直接扫码出库）"
npm run deploy
```

Expected: deploy/sync.js 输出上传成功清单；线上 http://youkailong.cn/pul-fms/ 可访问新页面

---

## Self-Review 记录

- Spec 覆盖：§二状态机→T1/T4/T5/T6；§三入口同构→T4/T5；§四双页分工→T4/T5；§五选择器→T3/T5/T6；§六制单→T5；§七联动→T1(ledger)/T6(ph-req锁)/T7(quick-scan)/T4(审核重验)；§八种子→T2；§九边界→T4/T5 各步；§十一验证→T4/T7/T8。无遗漏
- quick-scan 与 spec §七 差异说明：spec 写「拦截文案」，实现为「存储态防重（备货中申请不出现在选单）+ 空态提示」，更简且不漏；已在本计划 Task 7 注明
- 类型一致：`PulDrugPicker.mount(container, opts)` / `api.getItems()` 在 T3 定义、T5/T6 使用一致；req.source 取值 `药房申请/库房制单` 全文一致
- 部署步骤属项目 CLAUDE.md「生成即部署」既有授权，仍列明命令供确认
