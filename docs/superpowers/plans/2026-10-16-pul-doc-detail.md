# PUL-FMS 单据明细共享组件实施计划

> **给执行代理：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务执行；步骤使用复选框跟踪。

**目标：** 用 `PulDocDetail` 统一 20 个实际使用页的药品明细、码明细和异常码渲染，公共修改只改一处，同时保证采购到货与统一扫码原业务逻辑不变。

**架构：** 新增原生 JavaScript 共享组件，输入标准化视图模型，输出完整页签或独立表格。页面只保留数据适配、专属列和原事件处理；共享组件不直接保存数据、不审核、不接管扫码草稿。

**技术栈：** HTML、原生 JavaScript、Tabler、现有 `PchUI`、Node.js `vm/assert` 测试。

**执行约束：** 工作树已有其他未提交改动，本轮只做指定文件的增量修改和验证，不自动提交；不得使用 `git add -A`，不得覆盖既有改动。

---

## 文件结构

- 新建 `prototypes/2026-09/pul-fms-base-v1/scripts/doc-detail.js`：公共列、页签、表格、空态、操作渲染与事件绑定。
- 新建 `prototypes/2026-09/pul-fms-base-v1/scripts/_t-doc-detail.node.js`：组件行为、页面接入和防回退测试。
- 修改 20 个同名页面脚本及 HTML：接入组件，保留业务数据与事件函数。
- 修改 `prototypes/2026-09/pul-fms-base-v1/README.md`：登记共享组件、使用规则和验证命令。
- 不修改 `purchase-data.js`、`scan-core.js`、`scan-hub.js`、`wh-data.js`、`drug-data.js` 或任何 SQL。

## 统一调用契约

所有任务使用同一模型和选项，禁止另行发明组件 API：

```js
var model = {
  drugs: [{ drugName: '药品A', formSpec: '10mg', qty: 2, scanText: '2 盒', unit: '盒' }],
  codes: [{ code: '20位码', drugName: '药品A', level: '一级码', scanText: '1 盒', idcode: '7位码' }],
  bad: [{ code: '20位异常码', idcode: '7位码', reason: '解析失败', actions: ['removeBad'] }],
  activeTab: 'drugs'
};

PulDocDetail.renderTabs(model, {
  title: '单据明细',
  metaHtml: '',
  footerHtml: '',
  tabs: ['drugs', 'codes', 'bad'],
  counts: { codes: 'rows' },
  emptyText: '点选上方单据行查看明细',
  drugs: { columns: ['seq', 'drugName', 'formSpec', 'qty', 'scanQty', 'unit'], emptyText: '暂无药品' },
  codes: { columns: ['seq', 'code', 'drugName', 'level', 'scanQty', 'idcode'], emptyText: '暂无码明细' },
  bad: { columns: ['seq', 'code', 'idcode', 'reason', 'actions'], emptyText: '无异常码', note: '处理后放行审核' }
});

PulDocDetail.bind(content, {
  model: model,
  onTab: function (key) { /* 更新原页面 tab 并调用原 renderAll */ },
  actions: {
    removeBad: function (ctx) { /* 调用原页面移除逻辑；ctx.row.raw 为原码记录 */ }
  }
});
```

独立表格使用 `renderDrugs(model, options.drugs)`、`renderCodes(model, options.codes)`、`renderBad(model, options.bad)`。扩展列结构固定为 `{ key, title, cell: function (row) { ... } }`；复杂展示使用结构化字段 `scanText/progress/diff/status`，不得传整表 HTML。

### Task 1：共享组件与独立测试

**文件：**
- 新建：`prototypes/2026-09/pul-fms-base-v1/scripts/doc-detail.js`
- 新建：`prototypes/2026-09/pul-fms-base-v1/scripts/_t-doc-detail.node.js`

- [ ] **步骤 1：先写组件失败测试**

测试覆盖公共 API、药品/码/异常码列序、`rows` 与 `scanQty` 计数、空态列数、扩展列、操作属性、转义及非法配置：

```js
load('purchase-shared.js');
load('doc-detail.js');
var DD = window.PulDocDetail;
eq('药品公共列', headerText(DD.renderDrugs(model, drugOpts)),
  '序号|药品名称|药品规格|生产厂家|批准文号|单价（元）|数量|扫码总量|差异|单位|金额（元）');
ok('文本转义', DD.renderDrugs(xssModel, drugOpts).indexOf('&lt;img') >= 0);
ok('码行数计数', DD.renderTabs(model, tabOpts).indexOf('码详情（2）') >= 0);
ok('扫码量计数', DD.renderTabs(qtyModel, qtyTabOpts).indexOf('码详情（3）') >= 0);
ok('未知列明确报错', throws(function () { DD.renderCodes(model, { columns: ['not-exist'] }); }, 'not-exist'));
```

- [ ] **步骤 2：运行测试确认红灯**

运行：`cd prototypes/2026-09/pul-fms-base-v1 && node scripts/_t-doc-detail.node.js`
预期：FAIL，提示找不到 `doc-detail.js` 或 `PulDocDetail` 不存在。

- [ ] **步骤 3：实现共享组件**

在 `doc-detail.js` 中实现三个列注册表、五个公开方法及以下固定行为：

```js
var DEFAULT_COLUMNS = {
  drugs: ['seq', 'drugName', 'formSpec', 'maker', 'approval', 'price', 'qty', 'scanQty', 'diff', 'unit', 'amount'],
  codes: ['seq', 'code', 'drugName', 'level', 'parentCode', 'batch', 'prodDate', 'expDate', 'scanQty', 'checkStatus', 'idcode', 'issuer'],
  bad: ['seq', 'code', 'idcode', 'reason', 'time', 'actions']
};
```

实现要求：
- 行操作按钮输出 `data-dd-action/data-dd-table/data-dd-index`，页签输出 `data-dd-tab`。
- `bind` 通过 `handlers.model` 找回行记录并调用 `handlers.actions[action](ctx)`。
- 缺少数组按空数组处理；未知列、未知计数模式、缺少操作回调立即抛出包含配置键的错误。
- 组件文件控制在 500 行内，不新增 CSS 文件，复用 `purchase.css` 的现有类。

- [ ] **步骤 4：运行组件测试确认绿灯**

运行：`node scripts/_t-doc-detail.node.js && node --check scripts/doc-detail.js`
预期：所有组件断言 `ok`，进程退出码 0，`node --check` 无输出。

### Task 2：采购到货单等价迁移

**文件：**
- 修改：`prototypes/2026-09/pul-fms-base-v1/scripts/purchase-arrive.js`
- 修改：`prototypes/2026-09/pul-fms-base-v1/purchase-arrive.html`
- 修改：`prototypes/2026-09/pul-fms-base-v1/scripts/_t-doc-detail.node.js`

- [ ] **步骤 1：增加接入与业务函数保护断言**

新增断言：HTML 在 `purchase-arrive.js` 前加载 `doc-detail.js`；页面使用 `PulDocDetail`；`docBad`、`scanTotalNum`、`scannedBase`、`auditFlow`、`openBadFix` 等原函数仍存在。运行测试，先因尚未接入而失败。

- [ ] **步骤 2：加入脚本依赖**

在 `scan-core.js` 之后、`purchase-arrive.js` 之前加入：

```html
<script src="scripts/doc-detail.js?v=20261016-1"></script>
```

- [ ] **步骤 3：只改三类渲染函数**

保留现有筛选、聚合、换算和异常判定，将其结果装入 `model`，再把函数尾部替换为：

```js
return DD.renderTabs(detailModel(o), {
  title: '到货明细', metaHtml: detailMeta(o), counts: { codes: 'scanQty' },
  drugs: drugOptions(o), codes: codeOptions(o), bad: badOptions(o)
});
```

`detailModel` 必须继续使用原 `P.summarize`、`scannedBase`、`scanTotalNum`、`docBad`、`dupCodes`、`fixedCodes` 结果；拉取单、清单单、聚合单、人工补录码的分支不得合并或改写。

- [ ] **步骤 4：把页签和操作绑定接到原处理函数**

`onTab` 只更新原 `tab` 并 `renderAll()`；`editBad` 继续调用原人工补录弹窗，`maintainBad` 继续原字典跳转，`goScan` 继续原扫码弹窗，`reparse` 继续原重新解析函数。不得把处理逻辑复制进组件。

- [ ] **步骤 5：验证**

运行：`node --check scripts/purchase-arrive.js && node scripts/_t-doc-detail.node.js`
预期：退出码 0。人工走查拉取单、清单录入单、手动扫码单、下载失败、人工补录和审核拦截，数量与迁移前一致。

### Task 3：统一扫码等价迁移

**文件：**
- 修改：`prototypes/2026-09/pul-fms-base-v1/scripts/scan-hub-ui.js`
- 修改：`prototypes/2026-09/pul-fms-base-v1/scan-hub.html`
- 修改：`prototypes/2026-09/pul-fms-base-v1/scripts/_t-doc-detail.node.js`

- [ ] **步骤 1：增加接入保护测试并确认失败**

断言 `scan-hub.html` 在 `scan-hub-ui.js` 前加载组件，脚本使用 `PulDocDetail`，且 `HUB.ctxOf(hd)`、`SC.scannedBase`、`SC.codeContrib`、草稿提交相关调用仍存在。

- [ ] **步骤 2：加载组件并转换三类表格**

脚本依赖放在 `scan-core.js` 之后、`scan-hub-ui.js` 之前。`itemsTableHtml`、`codesTableHtml`、`badTabHtml` 改为模型适配加共享渲染；`detailCardHtml` 保留原 footer 分支并传给 `renderTabs`。

```js
return DD.renderTabs(detailModel(hd, scene), {
  footerHtml: footerHtml(hd, scene), footerClass: footCls,
  counts: { codes: 'rows' },
  drugs: drugOptions(hd, scene), codes: codeOptions(hd, scene), bad: badOptions(hd, scene)
});
```

- [ ] **步骤 3：保留作业专属能力**

出库场景保留拆零扩展列，上架场景保留货位扩展列；核对状态继续取 `ctx.isChecked`；行移除继续执行原草稿写回。不得修改 `scan-hub.js` 和 `scan-core.js`。

- [ ] **步骤 4：验证**

运行：`node --check scripts/scan-hub-ui.js && node scripts/_t-doc-detail.node.js && node scripts/_t-scan-hub.node.js`
预期：组件测试与统一扫码既有断言全部通过。

### Task 4：其余三页签/双页签单据页收编

**文件：** 以下每个脚本及同名 HTML 均修改：
- `purchase-out`、`purchase-in`、`wh-other-in`、`wh-other-out`、`wh-pick-out`、`wh-pick`、`ph-req-in`

- [ ] **步骤 1：把七个页面加入防回退清单**

在 `_t-doc-detail.node.js` 的 `FULL_TAB_PAGES` 中登记以上七个名字，断言 HTML 加载组件、脚本调用 `PulDocDetail`，并禁止重新出现本地 `codesPanel/drugsPanel/badPanel/itemsTable/codesTable` 的公共表 HTML。

- [ ] **步骤 2：逐页接入完整页签组件**

每页采用以下明确映射：

| 页面 | 保留的专属数据/操作 | 共享入口 |
|---|---|---|
| purchase-out | `parseFailCodes`、退货异常原因、原删除/移除处理 | 三页签 `renderTabs` |
| purchase-in | 已审核只读、HIS/医保操作不在明细组件内 | 药品+码双页签 |
| wh-other-in | 药品批次/生产日期/效期编辑单元格、重新解析入口 | 三页签，批次列为扩展列 |
| wh-other-out | 核对进度条、审核按钮、选在架码 | 双页签，footer 保留 |
| wh-pick-out | 无库存码页签、药品行“码列表”弹窗 | 三页签，操作列为扩展列 |
| wh-pick | 申请数量、预期货位、只读码状态 | 双页签 |
| ph-req-in | `phChecked` 数量口径、审核入口 | 双页签，footer 说明保留 |

每页 HTML 都在自身页面脚本前加载 `doc-detail.js`；页签切换只更新原状态并重渲染。

- [ ] **步骤 3：运行语法与接入测试**

运行七个页面脚本的 `node --check`，再运行 `node scripts/_t-doc-detail.node.js`。
预期：全部退出码 0，七个页面无本地公共表格实现残留。

### Task 5：独立卡片与工作台收编

**文件：** 以下每个脚本及同名 HTML 均修改：
- `scan-lab-ui`（对应 `scan-lab.html`）、`ph-ret-out`、`ph-req`、`disp`、`tray`、`wh-return-in`、`wh-loss-out`、`ph-loss`、`rx-ret`、`tray-ret`、`ward-sign`

- [ ] **步骤 1：登记独立表格防回退测试**

在 `_t-doc-detail.node.js` 的 `STANDALONE_PAGES` 登记以上页面，按实际能力断言调用 `renderDrugs/renderCodes/renderBad`，不要求所有页面都有三类表。

- [ ] **步骤 2：保留原卡片壳，仅替换表格**

| 页面 | 收编内容 | 必须保留 |
|---|---|---|
| scan-lab-ui | 药品表、码表；异常行仍按原演示口径适配 | 场景矩阵、扫码结果、审核 footer |
| ph-ret-out | 药品表、码表 | 应退/已核对、拆零、底部进度 |
| ph-req | 药品表 | 申请数量、货位、编辑申请 |
| disp | 药品表、已绑码表 | 应发、锁/在架、建议货位、手动补绑 |
| tray | 药品表 | 应摆、锁/在架、建议货位、待补绑 |
| wh-return-in | 核对码表 | 直收/退回核对分支、拆零提示 |
| wh-loss-out / ph-loss | 码表 | 报损移除、终态审核 |
| rx-ret / tray-ret | 码表 | 退药勾选、货位、原因选择 |
| ward-sign | 码表 | 签收状态、患者绑定说明 |

专属字段全部通过 `extraColumns` 或结构化行字段实现；原卡片标题、按钮和保存函数不动。

- [ ] **步骤 3：验证独立页面**

运行全部改动脚本的 `node --check`，再运行组件测试、`node scripts/_t-scan-lab.node.js`。
预期：退出码 0，扫码规则演示既有断言全绿。

### Task 6：全量防回退、文档与回归

**文件：**
- 修改：`prototypes/2026-09/pul-fms-base-v1/scripts/_t-doc-detail.node.js`
- 修改：`prototypes/2026-09/pul-fms-base-v1/README.md`

- [ ] **步骤 1：完成防回退检查**

测试维护 20 页收编清单，逐页检查：HTML 引用存在且顺序正确、脚本使用组件、旧公共函数不回流。明确排除 `quick-scan/ph-scan-in` 跳转壳、查询页、字典页和跨单异常台账，避免误报。

- [ ] **步骤 2：补 README 使用规则**

登记 `PulDocDetail` 的五个入口、模型字段、扩展列、操作回调、计数模式及“新页面禁止自写三类公共表格”的规则；记录采购到货与统一扫码零逻辑变化约束和验证命令。

- [ ] **步骤 3：执行全量自动回归**

```bash
cd prototypes/2026-09/pul-fms-base-v1
node scripts/_t-doc-detail.node.js
node scripts/_t-invariants.node.js
node scripts/_t-post-assign.node.js
node scripts/_t-guide.node.js
node scripts/_t-scan-hub.node.js
node scripts/_t-scan-lab.node.js
node scripts/_t-codefmt.node.js
cd ../../..
node scripts/check-prd-menu-sync.js
```

预期：全部退出码 0；若既有测试暴露迁移问题，先修复迁移，不改业务断言来迁就新渲染。

- [ ] **步骤 4：执行语法、差异与人工验收**

对 20 个页面脚本及 `doc-detail.js` 全部执行 `node --check`；用 `git diff --` 限定本计划文件检查没有数据层/SQL改动，没有意外覆盖既有工作树修改。人工打开采购到货、统一扫码及每类代表页，确认页签、空态、专属操作、草稿恢复和控制台无错误。

- [ ] **步骤 5：交付证据**

汇总测试命令与结果、实际收编页面清单、采购到货/统一扫码逻辑未动的差异说明，以及仍需人工确认的已知限制；未实际执行的验证不得写成已通过。
