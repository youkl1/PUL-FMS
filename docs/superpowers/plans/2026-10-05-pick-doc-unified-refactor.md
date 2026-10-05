# 领用单统一重构（两池并一池 + 五态 + 扫码直生）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按设计稿 `docs/superpowers/specs/2026-10-05-pick-doc-unified-refactor-design.md`（五问已拍板）把 `reqPool ⋈ pickDocs` 两池并为单池 `pickDocs`、状态枚举换五态、新增扫码直生捷径，SQL 三文件同步 `REQ+REQ_ITEM+TRANSFER_DOC → PICK_DOC+PICK_ITEM`。

**Architecture:** wh-data.js 单池结构一处动全身（种子合并 + migrate 老数据转换 + pickStatus 推导 + directPick 直生）→ 闭环六页逐页改造 → 只读页对齐 → 校验脚本断言换血（node 脚本先红后绿）→ SQL 物理合并。菜单不动（check-prd-menu-sync 应零改动）。

**Tech Stack:** 原生 JS 原型（localStorage via store.js，node vm 跑 _t-*.node.js 校验）、MySQL 8 DDL。

**工作目录：** `d:\Claude-code\PUL-FMS\PUL-FMS`；原型目录 `prototypes/2026-09/pul-fms-base-v1/`（下称 `$BASE`）。
**提交纪律：** 每个 Task 结束文件级 `git add <具体路径>` 提交，**严禁 `git add -A`/`git add .`**（工作树压往轮未提交改动）。
**统一状态词（全计划通用）：** `待提交 / 待出库 / 已出库·待入库 / 已入库·待上架 / 已作废`，第五态「已上架」= `已入库·待上架` 且全码 `phLoc` 非空的**推导展示态**，不落库。

---

### Task 1: 校验脚本断言换血（TDD 红）

**Files:**
- Modify: `$BASE/scripts/_t-invariants.node.js`
- Modify: `$BASE/scripts/_t-post-assign.node.js`
- Modify: `$BASE/scripts/_t-ph-req.js`
- Modify: `$BASE/scripts/_t-ph-req-open.js`

- [ ] **Step 1: `_t-invariants.node.js` 状态词与迁移断言换血**

① 第 69 行测试数据 `'备货中'` → `'待出库'`，第 73 行断言名 `'未过账领用备货不扣在架'` → `'待出库未扣账不扣在架'`；第 74 行 `wh.pickDocs[0].status = '已出库'` → `= '已出库·待入库'`，第 76 行断言名 `'已出库才扣在架'` → `'已出库·待入库才扣在架'`。

② 第 80 行 `pickIn` 的 `status: '药房已入库'` → `status: '已入库·待上架'`。

③ ledger 段（第 132-143 行）：`'备货中'` → `'待出库'`（断言名 `'备货中草稿不进流水'` → `'待出库未过账不进流水'`）；`'已出库'` → `'已出库·待入库'`；删除 `reqPool: [...]` 行。

④ 「reqPool migrate 补 source」段（第 145-147 行）整段替换为：

```js
console.log('# reqPool→pickDocs 迁移（2026-10-05 领用单统一·两池并一池）');
window.store.update({ wh: {
  pickDocs: [
    { billNo: 'LYCK-T0', status: '备货中', warehouse: '中心库', pharmacy: '门诊药房', date: '2026-10-01 09:00', codes: [c(CODE_A)] },
    { billNo: 'LYCK-T1', reqNo: 'LY-T2', status: '已出库', warehouse: '中心库', pharmacy: '门诊药房', date: '2026-10-01 10:00', auditTime: '2026-10-01 10:05', codes: [c(CODE_B)] }
  ],
  reqPool: [
    { reqNo: 'LY-T1', date: '2026-10-01 08:00', pharmacy: '门诊药房', warehouse: '中心库', applicant: '陈静', source: '药房申请', items: [{ drugCode: 'YP010245', qty: 3, slot: 'M-01' }], status: '待备货' },
    { reqNo: 'LY-T2', date: '2026-10-01 09:30', pharmacy: '门诊药房', warehouse: '中心库', applicant: '陈静', source: '药房申请', items: [{ drugCode: 'YP010312', qty: 2, slot: '' }], status: '已完成' }
  ],
  retInDocs: [], othInDocs: [], othOutDocs: [], lossDocs: [], retPool: [], phLossDocs: [] } });
var mig = W.load();
var mT0 = null, mT1 = null, mNew = null;
mig.pickDocs.forEach(function (d) {
  if (d.billNo === 'LYCK-T0') mT0 = d;
  if (d.billNo === 'LYCK-T1') mT1 = d;
  if (d.billNo === 'LY-T1') mNew = d;
});
eq('老备货中→待出库', mT0 && mT0.status, '待出库');
eq('老已出库→已出库·待入库', mT1 && mT1.status, '已出库·待入库');
eq('已完成申请并入既有单（items 回填）', mT1 && mT1.items && mT1.items.length, 1);
eq('并单后废除 reqNo 字段', mT1 && mT1.reqNo, undefined);
ok('无源待备货申请→新单待出库', mNew && mNew.status === '待出库' && mNew.source === '药房申请');
eq('新单 items 带 docQty=0', mNew && mNew.items[0] && mNew.items[0].docQty, 0);
eq('reqPool 已清空', mig.reqPool, []);
var mig2 = W.load();
eq('迁移幂等（单数不变）', mig2.pickDocs.length, mig.pickDocs.length);

console.log('# pickStatus 推导：已入库·待上架 且全码有 phLoc → 已上架');
ok('全码上架推导已上架', W.pickStatus({ status: '已入库·待上架', codes: [c(CODE_A, { phLoc: 'M-01' })] }) === '已上架');
ok('部分上架仍已入库·待上架', W.pickStatus({ status: '已入库·待上架', codes: [c(CODE_A, { phLoc: 'M-01' }), c(CODE_B)] }) === '已入库·待上架');
ok('空码单不推导已上架', W.pickStatus({ status: '已入库·待上架', codes: [] }) === '已入库·待上架');
eq('pickPosted 五态口径', ['待提交', '待出库', '已出库·待入库', '已入库·待上架', '已作废'].map(function (s) {
  return W.pickPosted({ status: s });
}), [false, false, true, true, false]);
```

⑤ retPool refNo 段（第 149-156 行）**保留不动**（retPool 不在本轮范围）。

- [ ] **Step 2: `_t-post-assign.node.js` 状态词换血**

第 60 行与第 63 行两处 `status: '药房已入库'` → `status: '已入库·待上架'`。

- [ ] **Step 3: `_t-ph-req.js` / `_t-ph-req-open.js` 断言换单池**

两文件头部注释第 4 行改为 `* 断言：pickDocs 新增 source=药房申请 的待出库领用单，items[0].qty===3`；断言段（两文件相同结构）改为：

```js
var wh = window.store.load().wh || {};
var r = null;
(wh.pickDocs || []).forEach(function (d) {
  if (d.source === '药房申请' && d.status === '待出库' && (d.items || []).length === 1 && d.items[0].qty === 3) r = d;
});
console.log('[t-ph-req] 新增申请断言:',
  !!r, r && r.billNo.indexOf('LY') === 0,
  r && r.items[0].drugCode);
```

（`_t-ph-req.js` 是提交后断言；`_t-ph-req-open.js` 截图停在提交前，断言同样按新池读，允许 r 为 null 时打印 false。）

- [ ] **Step 4: 跑 node 校验确认红**

Run: `cd prototypes/2026-09/pul-fms-base-v1 && node scripts/_t-invariants.node.js`
Expected: FAIL（`W.pickStatus is not a function` 或迁移断言失败）——红即正确。

- [ ] **Step 5: Commit**

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/_t-invariants.node.js prototypes/2026-09/pul-fms-base-v1/scripts/_t-post-assign.node.js prototypes/2026-09/pul-fms-base-v1/scripts/_t-ph-req.js prototypes/2026-09/pul-fms-base-v1/scripts/_t-ph-req-open.js
git commit -m "test: 领用单统一——校验脚本断言换单池五态（先红）"
```

---

### Task 2: wh-data.js 数据层换血（种子合并 + migrate + 推导函数 + directPick）

**Files:**
- Modify: `$BASE/scripts/wh-data.js`

- [ ] **Step 1: 种子合并——REQ_POOL 废除，PICK_DOCS 换单池五态种子**

删除 `REQ_POOL` 整个数组（第 92-111 行）。`PICK_DOCS`（第 62-91 行）整段替换为（历史种子不改号：合流单保留 LYCK 号，无源单沿用 LY 号）：

```js
  // 领用单池（2026-10-05 两池并一池：申请→备货→出库→入库→上架全程同单同号）
  // 五态：待提交/待出库/已出库·待入库/已入库·待上架/已作废；「已上架」=全码 phLoc 非空推导（不落库）
  // items[].qty=计划数量 docQty=单据数量（扫码折合渐满） slot=上架货位（随单传递到码 expectLoc）
  // codes[].scanHead=扫码头（库房备货/药房上架/药房直生） phLoc=实际上架货位 shelfTime=上架时间
  var PICK_DOCS = [
    // —— 待提交草稿（药房申请 + 库房制单各 1）——
    { billNo: 'LY20261004001', date: '2026-10-04 09:20', pharmacy: '门诊药房', warehouse: '中心库',
      applicant: '陈静', operator: '陈静', source: '药房申请', status: '待提交', remark: '草稿演示：待提交库房备货',
      items: [{ drugCode: 'YP010388', qty: 10, docQty: 0, slot: 'M-02' }], codes: [], badCodes: [], shelfLoc: '',
      createTime: '2026-10-04 09:20', submitTime: '', outTime: '', inTime: '' },
    { billNo: 'LY20261001001', date: '2026-10-01 09:58', pharmacy: '门诊药房', warehouse: '中心库',
      applicant: '王铁军', operator: '王铁军', source: '库房制单', status: '待提交', remark: '缺货驱动制单演示',
      items: [{ drugCode: 'YP010312', qty: 2, docQty: 0, slot: '' }], codes: [], badCodes: [], shelfLoc: '',
      createTime: '2026-10-01 09:58', submitTime: '', outTime: '', inTime: '' },
    // —— 待出库（申请已提交，未开始备货）——
    { billNo: 'LY20260914001', date: '2026-09-14 08:40', pharmacy: '门诊药房', warehouse: '中心库',
      applicant: '陈静', operator: '陈静', source: '药房申请', status: '待出库', remark: '周末门急诊备货',
      items: [{ drugCode: 'YP010245', qty: 5, docQty: 0, slot: 'M-01' }, { drugCode: 'YP010529', qty: 2, docQty: 0, slot: 'CB01-C1-02' }],
      codes: [], badCodes: [], shelfLoc: '',
      createTime: '2026-09-14 08:40', submitTime: '2026-09-14 08:40', outTime: '', inTime: '' },
    { billNo: 'LY20260914002', date: '2026-09-14 09:15', pharmacy: '住院药房', warehouse: '中心库',
      applicant: '陈静', operator: '陈静', source: '药房申请', status: '待出库', remark: '',
      items: [{ drugCode: 'YP010388', qty: 60, docQty: 0, slot: 'Z-01' }, { drugCode: 'YP010477', qty: 10, docQty: 0, slot: '' }],
      codes: [], badCodes: [], shelfLoc: '',
      createTime: '2026-09-14 09:15', submitTime: '2026-09-14 09:15', outTime: '', inTime: '' },
    // —— 待出库（直接出库草稿，带码渐满）——
    { billNo: 'LYCK20261001001', date: '2026-10-01 09:40', pharmacy: '门诊药房', warehouse: '中心库',
      applicant: '王铁军', operator: '王铁军', source: '库房制单', status: '待出库', remark: '新增备货单演示（直接出库草稿）',
      items: [], badCodes: [], shelfLoc: '',
      codes: [{ code: '84147840007702017701', level: 1, split: '否', splitQty: '', batch: '250702',
        prodDate: '2025-07-10', expDate: '2027-07-09', checked: true, code2: '', code3: '', location: 'A-01-02',
        expectLoc: '', phLoc: '', scanHead: '库房备货', shelfTime: '' }],
      createTime: '2026-10-01 09:40', submitTime: '', outTime: '', inTime: '' },
    // —— 已出库·待入库（在途 3 + 住院隔离演示 1）——
    { billNo: 'LYCK20260913001', date: '2026-09-13 14:20', pharmacy: '门诊药房', warehouse: '中心库',
      applicant: '陈静', operator: '王铁军', source: '药房申请', status: '已出库·待入库', remark: '',
      items: [{ drugCode: 'YP010245', qty: 3, docQty: 3, slot: 'M-01' }], badCodes: [], shelfLoc: '',
      codes: OTH_IN_SEED_CODES.slice(0, 3).map(function (c) { return Object.assign({}, c, { expectLoc: 'M-01', scanHead: '库房备货', shelfTime: '' }); }),
      createTime: '2026-09-13 14:02', submitTime: '2026-09-13 14:02', outTime: '2026-09-13 14:35', inTime: '' },
    { billNo: 'LYCK20261002001', date: '2026-10-02 21:21', pharmacy: '门诊药房', warehouse: '中心库',
      applicant: '陈静', operator: '王铁军', source: '药房申请', status: '已出库·待入库', remark: '夜间急诊备货',
      items: [{ drugCode: 'YP010245', qty: 2, docQty: 2, slot: 'M-01' }, { drugCode: 'YP010401', qty: 1, docQty: 1, slot: 'M-01' }],
      badCodes: [], shelfLoc: '',
      codes: OTH_IN3_CODES.slice(0, 3).map(function (c) { return Object.assign({}, c, { expectLoc: 'M-01', scanHead: '库房备货', shelfTime: '' }); }),
      createTime: '2026-10-02 20:50', submitTime: '2026-10-02 20:50', outTime: '2026-10-02 21:30', inTime: '' },
    { billNo: 'LYCK20261003001', date: '2026-10-03 16:05', pharmacy: '门诊药房', warehouse: '中心库',
      applicant: '王铁军', operator: '王铁军', source: '库房制单', status: '已出库·待入库', remark: '效期周转主动配送',
      items: [{ drugCode: 'YP010312', qty: 2, docQty: 2, slot: 'M-03' }], badCodes: [], shelfLoc: '',
      codes: OTH_IN3_CODES.slice(3, 5).map(function (c) { return Object.assign({}, c, { expectLoc: 'M-03', scanHead: '库房备货', shelfTime: '' }); }),
      createTime: '2026-10-03 15:50', submitTime: '2026-10-03 15:50', outTime: '2026-10-03 16:20', inTime: '' },
    { billNo: 'LYCK20261003002', date: '2026-10-03 11:40', pharmacy: '住院药房', warehouse: '中心库',
      applicant: '王铁军', operator: '王铁军', source: '库房制单', status: '已出库·待入库', remark: '住院药房在途（演示药房隔离）',
      items: [], badCodes: [], shelfLoc: '',
      codes: OTH_IN3_CODES.slice(7, 9).map(function (c) { return Object.assign({}, c, { expectLoc: 'Z-01', scanHead: '库房备货', shelfTime: '' }); }),
      createTime: '2026-10-03 11:40', submitTime: '2026-10-03 11:40', outTime: '2026-10-03 11:55', inTime: '' },
    // —— 已入库·待上架（闭环 2；全码有 phLoc 时展示推导态「已上架」）——
    { billNo: 'LYCK20260912001', date: '2026-09-12 10:08', pharmacy: '门诊药房', warehouse: '中心库',
      applicant: '陈静', operator: '王铁军', source: '药房申请', status: '已入库·待上架', remark: '',
      items: [{ drugCode: 'YP010401', qty: 1, docQty: 1, slot: 'M-01' }, { drugCode: 'YP010312', qty: 2, docQty: 2, slot: 'M-03' }],
      badCodes: [], shelfLoc: '',
      codes: OTH_IN_SEED_CODES.slice(6, 7).map(function (c) { return Object.assign({}, c, { expectLoc: 'M-01', scanHead: '库房备货', shelfTime: '' }); })
        .concat(OTH_IN_SEED_CODES.slice(9, 11).map(function (c) { return Object.assign({}, c, { expectLoc: 'M-03', scanHead: '库房备货', shelfTime: '' }); })),
      createTime: '2026-09-12 09:50', submitTime: '2026-09-12 09:50', outTime: '2026-09-12 10:22', inTime: '2026-09-12 10:22' },
    { billNo: 'LYCK20261002002', date: '2026-10-02 10:15', pharmacy: '门诊药房', warehouse: '中心库',
      applicant: '王铁军', operator: '王铁军', source: '库房制单', status: '已入库·待上架', remark: '直接出库闭环演示',
      items: [], badCodes: [], shelfLoc: 'M-01',
      codes: OTH_IN3_CODES.slice(5, 7).map(function (c) { return Object.assign({}, c, { expectLoc: 'M-01', scanHead: '库房备货', shelfTime: '' }); }),
      createTime: '2026-10-02 10:15', submitTime: '2026-10-02 10:15', outTime: '2026-10-02 10:30', inTime: '2026-10-02 10:30' }
  ];
  PICK_DOCS[5].codes[0].phLoc = 'M-01';   // LYCK20260913001 在途单：预写上架货位（演示在途码已定位边界）
  PICK_DOCS[9].codes[0].phLoc = 'M-01';   // LYCK20260912001 唯可来已上架 1/3（演示上下架 + 已入库单上架进度）
  PICK_DOCS[10].codes[0].phLoc = 'M-01';  // LYCK20261002002 复方氨基酸已上架 1/2（演示 shelfLoc 与上架进度）
```

（索引口径：0-1 待提交、2-3 待出库申请、4 直出草稿、5-8 在途、9-10 已入库——与上方数组顺序一致。）

头部注释（第 1-8 行）同步改为：

```js
/**
 * wh-data.js — 库房管理 Mock 数据（store 命名空间 wh）
 * 码状态机原型实现 = 集合推导（与 pch.stockCodes 同款扩展）：
 *   在架 = 采购入库单(已审核) + 其他入库单(已审核) + 退回入库单(已审核)
 *        − 采购退货单(已审核) − 领用单(已出库·待入库/已入库·待上架) − 其他出库单(已审核) − 损耗出库(已审核)
 *   在途 = 领用单 status='已出库·待入库'（出库审核即扣账）；'已入库·待上架' 闭环；「已上架」为推导展示态
 * 领用单 = 单池 pickDocs（2026-10-05 两池并一池：申请/备货/出库/入库全程同单同号，reqPool 已废除）
 */
```

- [ ] **Step 2: migrate() 换血——reqPool 并入 + 老状态词映射 + 幂等**

`migrate(s)` 函数（第 152-205 行）中：
- 保留 `['pickDocs','retInDocs','othInDocs','othOutDocs','lossDocs','reqPool','retPool','phLossDocs']` 兜底段（reqPool 仍兜底以便读旧数据）。
- 删除「reqPool items slot 兜底 / source 兜底」段（第 163-166 行）与「REQ_POOL 补种」段（第 201-203 行）。
- 保留 retPool refNo 段、othInDocs 段、OTH_IN_DOCS/OTH_OUT_DOCS 补种段、LYCK20260912001 补货位段。
- `pickDocs` 兜底段与补种段替换为：

```js
    // ===== 2026-10-05 领用单统一：老状态词→五态 + 字段兜底 + reqPool 并入（幂等）=====
    var OLD2NEW = { '待备货': '待出库', '备货中': '待出库', '已出库': '已出库·待入库', '药房已入库': '已入库·待上架' };
    (s.pickDocs || []).forEach(function (d) {
      if (OLD2NEW[d.status]) d.status = OLD2NEW[d.status];
      if (d.shelfLoc === undefined) d.shelfLoc = '';
      if (!d.source) d.source = d.reqNo ? '药房申请' : '库房制单';
      if (!d.items) d.items = [];
      if (!d.badCodes) d.badCodes = [];
      if (d.createTime === undefined) d.createTime = d.date || '';
      if (d.submitTime === undefined) d.submitTime = d.status === '待提交' ? '' : (d.date || '');
      if (d.outTime === undefined) d.outTime = (d.status === '已出库·待入库' || d.status === '已入库·待上架') ? (d.auditTime || '') : '';
      if (d.inTime === undefined) d.inTime = d.status === '已入库·待上架' ? (d.auditTime || '') : '';
      (d.items || []).forEach(function (it) { if (it.docQty === undefined) it.docQty = 0; if (it.slot === undefined) it.slot = ''; });
      (d.codes || []).forEach(function (cd) {
        if (cd.phLoc === undefined) cd.phLoc = '';
        if (cd.expectLoc === undefined) cd.expectLoc = '';
        if (cd.scanHead === undefined) cd.scanHead = '库房备货';
        if (cd.shelfTime === undefined) cd.shelfTime = '';
      });
    });
    // reqPool 并入 pickDocs：有同号出库单（reqNo 外链）→ items/applicant/source/createTime 回填；无→按状态映射成新单
    (s.reqPool || []).forEach(function (r) {
      var doc = null;
      (s.pickDocs || []).forEach(function (d) { if (d.reqNo && d.reqNo === r.reqNo) doc = d; });
      var items = (r.items || []).map(function (it) {
        return { drugCode: it.drugCode, qty: it.qty, docQty: 0, slot: it.slot || '' };
      });
      if (doc) {
        doc.items = items;
        doc.applicant = r.applicant || '';
        doc.source = r.source || '药房申请';
        doc.createTime = r.date || doc.createTime;
        items.forEach(function (it) { it.docQty = it.qty; });   // 已合流老单按备齐口径回填
      } else {
        s.pickDocs.push({ billNo: r.reqNo, date: r.date, pharmacy: r.pharmacy, warehouse: r.warehouse,
          applicant: r.applicant || '', operator: r.applicant || '', source: r.source || '药房申请',
          status: r.status === '待提交' ? '待提交' : '待出库', remark: r.remark || '',
          items: items, codes: [], badCodes: [], shelfLoc: '',
          createTime: r.date || '', submitTime: r.status === '待提交' ? '' : (r.date || ''), outTime: '', inTime: '' });
      }
    });
    s.reqPool = [];   // 两池并一池：reqPool 废除
    (s.pickDocs || []).forEach(function (d) { delete d.reqNo; delete d.auditTime; });
    // 老会话补种：领用单演示数据（按 billNo 幂等注入，不覆盖用户已操作单）
    PICK_DOCS.forEach(function (d) {
      if (!s.pickDocs.some(function (x) { return x.billNo === d.billNo; })) s.pickDocs.push(d);
    });
```

注意：migrate 里「LYCK20260912001 补 phLoc」段在新种子里对应 `PICK_DOCS[9]`，保留原段不变（它按 billNo 判断，对新旧数据都有效）。

- [ ] **Step 3: load() 种子对象去 reqPool**

`load()`（第 206-213 行）seed 对象改为：

```js
    var seed = { pickDocs: PICK_DOCS, retInDocs: [], othInDocs: OTH_IN_DOCS, othOutDocs: OTH_OUT_DOCS,
      lossDocs: LOSS_DOCS, reqPool: [], retPool: RET_POOL, phLossDocs: [] };
```

- [ ] **Step 4: 推导/守卫函数五态化 + 新增 pickStatus/directPick**

`pickPosted`（第 221-223 行）替换为：

```js
  function pickPosted(d) {
    return d.status === '已出库·待入库' || d.status === '已入库·待上架' || d.status === '已上架';
  }
  // 展示态推导：已入库·待上架 且全码有 phLoc → 已上架（不落库，2026-10-05 拍板#3）
  function pickStatus(d) {
    if (d.status === '已入库·待上架' && (d.codes || []).length &&
        d.codes.every(function (c) { return c.phLoc; })) return '已上架';
    return d.status;
  }
```

`transitByReq`（第 255 行）`d.status !== '已出库'` → `d.status !== '已出库·待入库'`。
`pharmacyStock`（第 348 行）与 `findPhCode`（第 377 行）`d.status !== '药房已入库'` → `d.status !== '已入库·待上架' && d.status !== '已上架'`。
`phTransit`（第 391 行）`d.status !== '已出库'` → `d.status !== '已出库·待入库'`。
`setPhLoc` 追加 shelfTime 落盘：

```js
  function setPhLoc(wh, code20, phLoc) {
    var c = findPhCode(wh, code20);
    if (!c) return false;
    c.phLoc = phLoc || '';
    c.scanHead = '药房上架';
    c.shelfTime = phLoc ? now() : '';
    return true;
  }
```

`directPick` 新增（放在 `phTransit` 之后）：

```js
  // 扫码直生（捷径C，2026-10-05 拍板）：药房上架扫到「本库房在架但无在途单」的码 → 一步建闭环单
  // status=已入库·待上架（码带 phLoc → pickStatus 推导已上架）；qty=docQty=实扫折合；四时间戳同为 now
  function directPick(pharmacy, warehouse, scannedCodes, operator) {
    var s = load();
    var t = now();
    var dict = window.PUL_DRUG ? window.PUL_DRUG.flat() : [];
    var items = {}, order = [];
    scannedCodes.forEach(function (cd) {
      var dc = '?', base = 1;
      if (window.PUL_PCH && window.PUL_DRUG) {
        var p = window.PUL_PCH.parseCode(cd.code, dict);
        if (p.dict) {
          dc = p.dict.drugCode;
          var ds = window.PUL_DRUG.load();
          var dg = window.PUL_DRUG.drugOf(ds, dc);
          var v = dg ? window.PUL_DRUG.conv(ds, dc, 1, p.dict.packUnit || p.dict.unit, dg.baseUnit) : null;
          base = v == null ? 1 : v;
        }
      }
      if (!items[dc]) { items[dc] = { drugCode: dc, qty: 0, docQty: 0, slot: cd.phLoc || '' }; order.push(dc); }
      items[dc].qty += base; items[dc].docQty += base;
    });
    var doc = { billNo: nextNo('LY', s.pickDocs), date: t, pharmacy: pharmacy, warehouse: warehouse,
      applicant: operator || '', operator: operator || '', source: '扫码直生', status: '已入库·待上架',
      remark: '扫码直生（无在途单，上架扫码补建）', shelfLoc: '',
      items: order.map(function (k) { return items[k]; }),
      codes: scannedCodes.map(function (cd) { return Object.assign({}, cd, { scanHead: '药房直生', shelfTime: t }); }),
      badCodes: [], createTime: t, submitTime: t, outTime: t, inTime: t };
    s.pickDocs.unshift(doc);
    save(s);
    return doc;
  }
```

`window.PUL_WH` 导出表（第 453-459 行）追加 `pickStatus: pickStatus, directPick: directPick,`。

- [ ] **Step 5: 跑 node 校验确认绿**

Run: `cd prototypes/2026-09/pul-fms-base-v1 && node scripts/_t-invariants.node.js && node scripts/_t-post-assign.node.js`
Expected: `all passed` / `全部通过`（ledger 段此时仍红——ledger-data.js 未改，Task 3 修复；若红仅在 ledger 两行属预期，一并把 Task 3 做完再全绿亦可。**执行口径：Task 2+3 完成后必须两脚本全绿才提交 Task 3。**）

- [ ] **Step 6: Commit（与 Task 3 合并验证后分别提交）**

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/wh-data.js
git commit -m "feat: 领用单统一——wh-data 两池并一池+五态+pickStatus推导+directPick直生"
```

---

### Task 3: ledger-data.js / inv-data.js 对齐（node 校验依赖）

**Files:**
- Modify: `$BASE/scripts/ledger-data.js`
- Modify: `$BASE/scripts/inv-data.js`

- [ ] **Step 1: ledger-data.js 领用事件口径**

第 52-56 行替换为：

```js
    (wh.pickDocs || []).forEach(function (d) {
      if (!window.PUL_WH.pickPosted(d)) return;   // 待提交/待出库/已作废未过账，不是出库事实
      var t = d.status === '已出库·待入库' ? '领用出库' : '药房入库';
      out.push(ev((d.status === '已出库·待入库' ? d.outTime : d.inTime) || d.date, t, d.billNo, 'wh-pick.html', d.pharmacy || d.warehouse, codesOf(d)));
    });
```

- [ ] **Step 2: inv-data.js 药房盘盈建单状态词**

第 63-66 行 `postGain` 药房分支的 `status: '药房已入库', auditTime: W.now(), operator: ...` 改为：

```js
        status: '已入库·待上架', inTime: W.now(), outTime: W.now(), createTime: W.now(), submitTime: W.now(),
        source: '库房制单', applicant: d.auditor || '', operator: d.auditor || '',
        items: [], badCodes: [], shelfLoc: '',
```

（`billNo: W.nextNo('PYRK', ...)`、`date`、`pharmacy`、`warehouse`、`codes`、`remark` 保留。）

- [ ] **Step 3: 跑 node 校验全绿**

Run: `cd prototypes/2026-09/pul-fms-base-v1 && node scripts/_t-invariants.node.js && node scripts/_t-post-assign.node.js`
Expected: `all passed` + `全部通过`

- [ ] **Step 4: Commit**

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/ledger-data.js prototypes/2026-09/pul-fms-base-v1/scripts/inv-data.js
git commit -m "feat: 领用单统一——台账/盘盈建单对齐单池五态"
```

---

### Task 4: wh-pick.js 领用备货单——取消拼接，单池一条链一行

**Files:**
- Modify: `$BASE/scripts/wh-pick.js`

- [ ] **Step 1: 头部注释与查找函数**

头部注释（第 1-9 行）替换为：

```js
/**
 * wh-pick.js — 领用备货单（2026-10-05 单池化：两池并一池，取消 reqPool⋈pickDocs 拼接）
 * 单池 pickDocs 一条链一行：待提交(库房制单草稿,编辑/提交/删除) → 待出库(备货/继续备货=单内动作,可作废)
 *   → 已出库·待入库(库房侧只读) → 已入库·待上架/已上架(推导,闭环) ；已作废=终态
 * 「备货/继续备货/新增备货单」跳 quick-scan.html?billNo=；备货=待出库单内动作（docQty 渐满，状态不变）
 * 闭环唯一入口=药房「领用入库单」；出库台账在「领用出库单」页；作废=待出库释放码终态（已出库起走退回）
 */
```

删除 `reqOf`（第 25-28 行）与 `docOfReq`（第 33-36 行）。`sel` 简化为单号字符串：`var sel = null;`（注释：`// 选中单 billNo`）。

- [ ] **Step 2: rows() 单池化**

`rows()`（第 73-94 行）替换为：

```js
  function rows() {
    var out = [];
    S.pickDocs.forEach(function (d) {
      if (d.status === '待提交' && d.source !== '库房制单') return;   // 药房侧待提交草稿不进库房单据池
      var slots = [];
      (d.items || []).forEach(function (it) { if (it.slot && slots.indexOf(it.slot) === -1) slots.push(it.slot); });
      out.push({ key: d.billNo, doc: d, billNo: d.billNo, date: d.createTime || d.date,
        pharm: d.pharmacy, wh: d.warehouse, slots: slots, status: W.pickStatus(d),
        creator: d.applicant || d.operator || '-', src: d.source || '药房申请' });
    });
    out.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return out;
  }
```

`filteredRows` 中 `r.no` 引用删除（第 97 行改为 `if (filters.kw && r.billNo.indexOf(filters.kw) === -1) return false;`）。`selRow()` 改为：

```js
  function selRow() {
    if (!sel) return null;
    var all = rows();
    for (var i = 0; i < all.length; i++) if (all[i].key === sel) return all[i];
    return null;
  }
```

- [ ] **Step 3: 筛选栏/列表/状态徽章五态化**

`filterBar` 状态下拉（第 128 行）替换为：

```js
      '<select class="form-select" id="fStatus" style="width:150px;">' + ['全部', '待提交', '待出库', '已出库·待入库', '已入库·待上架', '已上架', '已作废'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
```

`stHtml`（第 141-147 行）替换为：

```js
  function stHtml(st) {
    if (st === '已上架') return '<span class="pch-light ok"><i class="pch-dot"></i>已上架</span>';
    if (st === '已入库·待上架') return '<span class="pch-light" style="color:#2FB344;"><i class="pch-dot" style="background:#2FB344;"></i>已入库 · 待上架</span>';
    if (st === '已出库·待入库') return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>已出库 · 待入库</span>';
    if (st === '已作废') return '<span class="pch-light mute"><i class="pch-dot"></i>已作废</span>';
    if (st === '待提交') return '<span class="badge bg-secondary-lt">待提交</span>';
    return '<span class="pch-light" style="color:#206BC4;"><i class="pch-dot" style="background:#206BC4;"></i>待出库</span>';
  }
```

`docsTable` 行渲染（第 150-180 行）：操作列与列结构替换为：

```js
    var rowsHtml = list.map(function (r, i) {
      var d = r.doc;
      var op = '';
      if (r.status === '待提交') op = '<button class="btn btn-sm btn-outline-primary" data-editreq="' + esc(r.key) + '">编辑</button> ' +
        '<button class="btn btn-sm btn-success" data-submitreq="' + esc(r.key) + '">提交</button> ' +
        '<button class="btn btn-sm btn-outline-danger" data-delreq="' + esc(r.key) + '">删除</button>';
      else if (r.status === '待出库') op = '<button class="btn btn-sm btn-primary" data-resume="' + esc(r.key) + '">' + ((d.codes || []).length ? '继续备货' : '备货') + '</button> ' +
        '<button class="btn btn-sm btn-outline-danger" data-void="' + esc(r.key) + '">✗ 作废</button>';
      else if (r.status === '已出库·待入库') op = '<span class="text-secondary" style="font-size:12.5px;">待药房入库</span>';
      else if (r.status === '已作废') op = '<span class="text-secondary" style="font-size:12.5px;">已作废（码已释放）</span>';
      else op = '<span class="text-secondary" style="font-size:12.5px;">闭环</span>';
      var srcBadge = r.src === '扫码直生' ? '<span class="badge bg-cyan-lt">扫码直生</span>'
        : (r.src === '库房制单' ? '<span class="badge bg-purple-lt">库房制单</span>' : '药房申请');
      return '<tr class="pch-doc-row' + (sel === r.key ? ' pch-doc-sel' : '') + (qsBill === r.key ? ' pch-doc-sel' : '') + '"' +
        (qsBill === r.key ? ' id="qsRow"' : '') + ' data-selkey="' + esc(r.key) + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(r.billNo) + '</b></td>' +
        '<td class="text-secondary">' + esc(r.date) + '</td>' +
        '<td>' + esc(r.wh) + '</td><td>' + esc(r.pharm) + '</td>' +
        '<td>' + (r.slots.length ? esc(r.slots.join('、')) : '<span class="text-secondary">—</span>') + '</td>' +
        '<td>' + stHtml(r.status) + '</td><td class="text-secondary">' + esc(r.creator) + '</td>' +
        '<td>' + srcBadge + '</td>' +
        '<td onclick="event.stopPropagation()">' + op + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="10" class="text-center text-secondary" style="padding:28px;">没有找到匹配的记录</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>领用单据</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">申请→上架全程同单 · ' + list.length + ' 单 · 点行查看明细；「备货 / 继续备货」进入「领用快捷扫码」作业（进度实时保存）</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据时间</th><th>出库库房</th><th>领用药房</th><th>上架货位</th><th>状态</th><th>创建人</th><th>单据来源</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
```

（原「单据编号+出库单号」两列并一列。）

- [ ] **Step 4: drugPanel / codePanel 单池化**

`slotOfItem(req, dc)` 改为读 doc：`function slotOfItem(doc, dc) { var s=''; ((doc && doc.items)||[]).forEach(function(it){ if(it.drugCode===dc && it.slot) s=it.slot; }); return s; }`

`drugPanel`（第 184-242 行）整体替换为：

```js
  function drugPanel() {
    var head = '<div class="card"><div class="card-header"><b>药品明细清单</b>';
    var foot = '</div>';
    var row = selRow();
    if (!row) {
      return head + '</div><div class="text-center text-secondary" style="padding:28px;">点选上方单据查看明细；待出库单据进入备货工作台</div>' + foot;
    }
    var d = row.doc;
    // 有计划明细（申请/制单来源）：申请数 vs 已备数（已备=doc.codes 聚合，docQty 口径一致）
    if ((d.items || []).length) {
      var gotMap = codesByDrug(d.codes);
      var rowsHtml = d.items.map(function (it, i) {
        var got = gotMap[it.drugCode] ? gotMap[it.drugCode].qty : 0;
        var diff = it.qty - got;
        var cls = diff === 0 && got > 0 ? 'full' : (diff < 0 ? 'over' : (got > 0 ? 'part' : ''));
        var diffTxt = diff === 0 && got > 0 ? '✓ 备齐' : (diff > 0 ? '缺 ' + diff : '超 ' + (-diff));
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.drugCode) + '</td><td><b>' + esc(drugName(it.drugCode)) + '</b></td><td>' + esc(drugForm(it.drugCode)) + '</td>' +
          '<td>' + esc(maker(it.drugCode)) + '</td><td>' + esc(approval(it.drugCode)) + '</td>' +
          '<td>' + (it.slot ? '<span class="badge bg-blue-lt">' + esc(it.slot) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
          '<td><b>' + it.qty + '</b></td><td><b>' + got + '</b></td><td>' + esc(baseUnit(it.drugCode)) + '</td>' +
          '<td class="wh-pick-diff ' + cls + '">' + diffTxt + '</td></tr>';
      }).join('');
      var hint = esc(d.billNo) + ' · ' + (d.status === '待提交' ? '待提交制单——提交后进入备货队列' : '计划数 vs 已备数（基本单位口径）');
      return head + '<span class="text-secondary ms-2" style="font-size:12.5px;">' + hint + '</span></div>' +
        '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>药品编码</th><th>药名通用名</th><th>制剂规格</th><th>生产厂家</th><th>批准文号</th><th>上架货位</th><th>计划数</th><th>已备数</th><th>单位</th><th>差额</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>' + foot;
    }
    // 无计划明细（直接出库/扫码直生）：按码聚合
    var byDrug = codesByDrug(d.codes);
    var qRows = Object.keys(byDrug).map(function (dc, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(dc) + '</td><td><b>' + esc(drugName(dc)) + '</b></td><td>' + esc(drugForm(dc)) + '</td>' +
        '<td>' + esc(maker(dc)) + '</td><td>' + esc(approval(dc)) + '</td><td class="text-secondary">—</td>' +
        '<td class="text-secondary">' + byDrug[dc].count + ' 码</td><td><b>' + byDrug[dc].qty + '</b></td><td>' + esc(baseUnit(dc)) + '</td>' +
        '<td class="text-secondary">' + esc(d.source || '') + '</td></tr>';
    }).join('');
    if (!qRows) qRows = '<tr><td colspan="11" class="text-center text-secondary" style="padding:28px;">直接出库：扫码后此处按药品汇总实出数</td></tr>';
    return head + '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.source || '直接出库') + ' · ' + esc(d.pharmacy) + '</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品编码</th><th>药名通用名</th><th>制剂规格</th><th>生产厂家</th><th>批准文号</th><th>上架货位</th><th>码数</th><th>折合数量</th><th>单位</th><th>来源</th></tr></thead>' +
      '<tbody>' + qRows + '</tbody></table></div>' + foot;
  }
```

`codePanel`（第 245-303 行）整体替换为：

```js
  function codePanel() {
    var row = selRow();
    var head = '<div class="card"><div class="card-header"><b>追溯码明细清单</b>';
    if (!row) return head + '</div><div class="text-center text-secondary" style="padding:28px;">点选上方单据查看码明细</div></div>';
    var d = row.doc;
    var rowsHtml = (d.codes || []).map(function (c, i) {
      var dc = drugOfCode(c.code);
      var expect = c.expectLoc || slotOfItem(d, dc);
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(drugName(dc)) + '</b></td>' +
        '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td><td>' + esc(c.location || '—') + '</td>' +
        '<td>' + (expect ? '<span class="badge bg-blue-lt">' + esc(expect) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td>' + (c.phLoc ? '<span class="badge bg-green-lt">' + esc(c.phLoc) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td class="text-secondary">' + toBase(c) + esc(baseUnit(dc)) + '</td></tr>';
    }).join('');
    if (!(d.codes || []).length) rowsHtml = '<tr><td colspan="9" class="text-center text-secondary" style="padding:28px;">码清单为空' + (d.status === '待出库' ? '——点下方「备货」到快捷扫码页逐码扫入' : '') + '</td></tr>';
    var foot = '';
    if (d.status === '待提交') foot = '<div class="pch-tabbar"><button class="btn btn-success" data-submitreq="' + esc(d.billNo) + '">✓ 提交制单（进入备货队列）</button></div>';
    else if (d.status === '待出库') foot = '<div class="pch-tabbar">' +
      '<button class="btn btn-primary" data-resume="' + esc(d.billNo) + '">▸ ' + ((d.codes || []).length ? '继续备货' : '备货') + '（快捷扫码工作台）</button>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">扫码 / 移除 / 拆零 / 审核出库均在「领用快捷扫码」完成</span></div>';
    else if (d.status === '已出库·待入库') foot = '<div class="pch-tabbar"><span class="text-secondary" style="font-size:12.5px;">在途——待药房在「领用入库单」核对后确认入库闭环（库房侧只读）</span></div>';
    return head + '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · ' + (d.codes || []).length + ' 个码</span></div>' +
      '<div class="table-responsive" style="max-height:330px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>库位</th><th>预期货位</th><th>上架货位</th><th>折合</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' + foot + '</div>';
  }
```

- [ ] **Step 5: 动作函数——startPick 删除、openQuick/openNewReq/submitReq/delReq/voidDoc 单池化**

删除 `startPick`（第 306-319 行，由 `data-resume` 直跳替代）。

`openQuick` 的 `qkOk` 回调（第 352-359 行）建单对象改为：

```js
      var billNo = W.nextNo('LYCK', S.pickDocs);
      var t = W.now();
      S.pickDocs.unshift({ billNo: billNo, date: t, pharmacy: phSel.value,
        warehouse: curWh(), applicant: curUserName(), operator: curUserName(), source: '库房制单',
        status: '待出库', remark: el.querySelector('#qkRemark').value.trim(), shelfLoc: slotSel.value,
        items: [], codes: [], badCodes: [], createTime: t, submitTime: t, outTime: '', inTime: '' });
```

`openNewReq`：函数名保留；`editing = reqNo ? docOf(reqNo) : null`（用 docOf 替代 reqOf）；`editing.reqNo` 引用改 `editing.billNo`（第 387、408 行）；`newOk` 回调（第 399-418 行）替换为：

```js
    el.querySelector('#newOk').addEventListener('click', function () {
      var phVal = el.querySelector('#newPh').value;
      var items = picker.getItems();
      if (!phVal) { window.showToast('请选择领用药房'); return; }
      if (!items.length) { window.showToast('请至少选择 1 个药品（数量需 ≥1）'); return; }
      items = items.map(function (it) { return { drugCode: it.drugCode, qty: it.qty, docQty: 0, slot: it.slot || '' }; });
      if (editing) {
        editing.pharmacy = phVal;
        editing.items = items;
        editing.remark = el.querySelector('#newRemark').value.trim();
        window.showToast('制单 ' + editing.billNo + ' 已更新');
      } else {
        var t = W.now();
        var billNo = W.nextNo('LY', S.pickDocs);
        S.pickDocs.unshift({ billNo: billNo, date: t, pharmacy: phVal, warehouse: curWh(),
          applicant: curUserName(), operator: curUserName(), source: '库房制单', status: '待提交',
          remark: el.querySelector('#newRemark').value.trim(), shelfLoc: '',
          items: items, codes: [], badCodes: [], createTime: t, submitTime: '', outTime: '', inTime: '' });
        sel = billNo;
        window.showToast('已保存待提交制单 ' + billNo + '，提交后进入备货队列');
      }
      save(); UI.close('pkNew'); renderAll();
    });
```

`submitReq/delReq/voidDoc`（第 420-447 行）替换为：

```js
  function submitReq(billNo) {
    var d = docOf(billNo);
    if (!d) return;
    UI.confirm('提交制单 <b>' + esc(billNo) + '</b>？提交后进入备货队列（待出库），不可再编辑。', function () {
      d.status = '待出库';
      d.submitTime = W.now();
      save(); renderAll();
      window.showToast('已提交，备货队列可见');
    }, '提交制单');
  }
  function delReq(billNo) {
    UI.confirm('删除待提交制单 <b>' + esc(billNo) + '</b>？未提交不产生影响。', function () {
      S.pickDocs = S.pickDocs.filter(function (x) { return x.billNo !== billNo; });
      if (sel === billNo) sel = null;
      save(); renderAll();
      window.showToast('已删除');
    }, '确认删除');
  }
  function voidDoc(billNo) {
    var d = docOf(billNo);
    if (!d) return;
    UI.confirm('作废 <b>' + esc(billNo) + '</b>？' + ((d.codes || []).length ? '已扫 ' + d.codes.length + ' 个码未扣账，作废即释放回在架。' : '空码单作废，不影响库存。') + '作废为终态，不可恢复。', function () {
      d.status = '已作废';
      if (sel === billNo) sel = null;
      save(); renderAll();
      window.showToast('已作废，码已释放');
    }, '确认作废');
  }
```

- [ ] **Step 6: bind() 与初始选中**

`bind()` 中删除 `[data-pickreq]` 绑定段；`[data-selkind]` 段改为：

```js
    content.querySelectorAll('[data-selkey]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-selkey'); renderAll(); });
    });
```

`[data-editreq]/[data-submitreq]/[data-delreq]/[data-void]/[data-resume]` 绑定保留（参数语义已是 billNo）。初始选中（第 493-501 行）改为：

```js
  if (qsBill && docOf(qsBill)) {
    sel = qsBill;
  } else {
    var all = rows();
    for (var i = 0; i < all.length; i++) {
      if (all[i].status === '待出库') { sel = all[i].key; break; }
    }
  }
```

- [ ] **Step 7: 浏览器冒烟 + Commit**

打开 `wh-pick.html`：五态行各一枚徽章正确；待出库行「备货/继续备货+作废」；作废后行变「已作废」且库房在架码恢复。然后：

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/wh-pick.js
git commit -m "feat: 领用备货单单池化——取消拼接一条链一行，待出库单内动作+作废终态"
```

---

### Task 5: quick-scan.js 快捷扫码——单池作业 + badCodes 落盘

**Files:**
- Modify: `$BASE/scripts/quick-scan.js`

- [ ] **Step 1: 头部注释与 doc 模型**

头部注释（第 1-10 行）替换为：

```js
/**
 * quick-scan.js — 领用快捷扫码（高拍仪连续作业页）
 * 单据模型（2026-10-05 单池化）：备货=待出库单内动作（docQty 渐满，状态不变）；本页=唯一扫码工作台
 * 三入口同构：?billNo= 深链续作 / 选单（待出库单）/ 新增备货单（直接出库→即建待出库单）
 * 每扫一码实时落盘；四道闸拦截码入 doc.badCodes；审核出库→已出库·待入库（重验在架，不再回写申请）
 */
```

删除 `reqOf`（第 27 行）与 `docOfReq`（第 29 行）。`doc` 模型改为直接持有单据：`doc` = pickDoc 本体。逐点替换：

- `persist()`（第 31-36 行）：`if (doc) { doc.codes = Object.keys(picked).map(function (k) { return picked[k]; }); save(); }`
- `slotOfItem(dc)`（第 53-59 行）：`(doc.items || []).forEach(function (it) { if (it.drugCode === dc && it.slot) s = it.slot; });`（去掉 `doc.kind==='req'` 判断）
- `docLabel()`：见下方代码块
- `docBar()`：删除 `L.bill` 三目与 `field('出库单号：', ...)` 展示（单池一号）
- `drugPanel()`（第 150 行）：`doc.req.items.map` → `(doc.items || []).map`；第 140 行 `doc.kind === 'quick'` 判断 → `!(doc.items || []).length`（无计划明细=直出/直生走聚合分支，有计划明细走申请数 vs 已扫数分支）
- `handleScan`（第 228-230 行）：`if (doc.kind === 'req') { doc.req.items.forEach(...)` → `(doc.items || []).forEach(...)`；`if (!it)` 拦截仅在有计划明细时生效，外套 `if ((doc.items || []).length) { ... }`
- `openAudit` 确认弹窗 lines（第 425-431 行）：`doc.kind === 'req'` → `(doc.items || []).length > 0`，`doc.req.items.forEach` → `doc.items.forEach`，`doc.slot` → `doc.shelfLoc`

```js
  function docLabel() {
    if (!doc) return null;
    var slots = [];
    (doc.items || []).forEach(function (it) { if (it.slot && slots.indexOf(it.slot) === -1) slots.push(it.slot); });
    if (!slots.length && doc.shelfLoc) slots.push(doc.shelfLoc);
    return { no: doc.billNo, bill: '', date: doc.createTime || doc.date, pharm: doc.pharmacy,
      slots: slots.join('、'), wh: doc.warehouse };
  }
```

- [ ] **Step 2: 扫码四道闸——badCodes 落盘 + 申请校验读 doc.items**

`handleScan`（第 204-241 行）中：
- 每个 `stats.blocked++` 分支追加 badCodes 落盘（在 `renderAll(); return;` 前）：

```js
    function pushBad(code, reason) {
      if (!doc) return;
      doc.badCodes = doc.badCodes || [];
      if (!doc.badCodes.some(function (b) { return b.code === code; }))
        doc.badCodes.push({ code: code, reason: reason, stage: '库房备货' });
      save();
    }
```

四处拦截分别调 `pushBad(code, '非本库房在架')` / `pushBad(code, '解析失败')` / `pushBad(code, block)`（block=冻结/停用/过期文案）/ `pushBad(code, '单外码')`（不在本申请单）。
- 申请校验段（第 227-231 行）`doc.req.items.forEach` → `(doc.items || []).forEach`；`it.qty` 口径不变。

- [ ] **Step 3: openNew 建单对象**

`openNew` 的 `qsNewOk` 回调（第 293-304 行）替换为：

```js
    el.querySelector('#qsNewOk').addEventListener('click', function () {
      var user = window.store.load().currentUser || {};
      var t = W.now();
      var draft = { billNo: W.nextNo('LYCK', S.pickDocs), date: t, pharmacy: phSel.value,
        warehouse: curWh(), applicant: user.name || '演示员', operator: user.name || '演示员',
        source: '库房制单', status: '待出库',
        remark: el.querySelector('#qsNewRmk').value.trim(), shelfLoc: slotSel.value,
        items: [], codes: [], badCodes: [], createTime: t, submitTime: t, outTime: '', inTime: '' };
      S.pickDocs.unshift(draft);
      doc = draft;
      picked = {}; feedback = null;
      save();
      UI.close('qsNewM'); renderAll();
      window.showToast('备货单 ' + draft.billNo + ' 已建（直接出库到 ' + doc.pharmacy + '），开始扫码');
    });
```

- [ ] **Step 4: openPickReq 选单——待出库池**

`openPickReq` 的 `base`（第 308 行）改为：

```js
    var base = S.pickDocs.filter(function (d) { return d.status === '待出库' && d.warehouse === curWh(); });
```

函数内 `r.reqNo` → `r.billNo`、`r.items` 引用不变、`slotsOf(r)` 不变、`r.source || '药房申请'` 不变。空列表文案改 `'本库房暂无待出库领用单'`。`qsPickOk` 回调（第 385-406 行）替换为：

```js
    el.querySelector('#qsPickOk').addEventListener('click', function () {
      if (!selNo) { window.showToast('请先选择一条待出库领用单'); return; }
      var d = null;
      base.forEach(function (x) { if (x.billNo === selNo) d = x; });
      if (!d) return;
      doc = d;
      picked = {};
      (d.codes || []).forEach(function (c) { picked[c.code] = c; });
      feedback = null;
      save();
      UI.close('qsPickM'); renderAll();
      window.showToast('已选领用单 ' + selNo + '，开始扫码备货');
    });
```

`qsPickCount` 文案 `'共 X 条待出库领用单'`。`qsPickM` 标题 `'选单（待出库领用单）'`。

- [ ] **Step 5: 审核出库→已出库·待入库 + docQty 回填**

`openAudit` 确认回调（第 434-450 行）替换为：

```js
      function () {
        var user = window.store.load().currentUser || {};
        var hasItems = (doc.items || []).length > 0;
        doc.status = '已出库·待入库';
        doc.outTime = W.now();
        doc.operator = user.name || '演示员';
        var byDrug2 = pickedByDrug();
        (doc.items || []).forEach(function (it) {
          it.docQty = byDrug2[it.drugCode] ? byDrug2[it.drugCode].qty : 0;
        });
        doc.codes = keys.map(function (k) {
          var c = picked[k];
          c.expectLoc = hasItems ? slotOfItem(drugOfCode(c.code)) : (doc.shelfLoc || '');
          c.scanHead = '库房备货';
          return c;
        });
        doc = null; picked = {}; feedback = null;
        save(); renderAll();
        window.showToast('已审核出库，' + keys.length + ' 个码进入在途（待药房入库）');
      }, '审核出库');
```

确认弹窗 lines 里 `it.qty` 口径不变（`doc.items` 已有）。

- [ ] **Step 6: qsClose 与深链**

`qsClose` 回调（第 470-482 行）替换为：

```js
    if (qc) qc.addEventListener('click', function () {
      if (doc && !(doc.codes || []).length && !(doc.items || []).length) {
        // 空直出草稿不留痕：物理删除（有计划的申请单不删，回到列表仍是待出库）
        var billNo = doc.billNo;
        S.pickDocs = S.pickDocs.filter(function (d) { return d.billNo !== billNo; });
        save();
        window.showToast('空单据已撤销');
      } else if (doc) {
        window.showToast('进度已保存在领用单 ' + doc.billNo + '，可到「领用备货单」继续');
      }
      doc = null; picked = {}; feedback = null; renderAll();
    });
```

深链 `initDeepLink`（第 510-525 行）替换为：

```js
  (function initDeepLink() {
    var no = new URLSearchParams(location.search).get('billNo');
    if (!no) return;
    var d = docOf(no);
    if (!d || d.status !== '待出库') {
      window.showToast('单据 ' + no + ' 不存在或已过账，请到「领用备货单」查看');
      return;
    }
    doc = d;
    (d.codes || []).forEach(function (c) { picked[c.code] = c; });
  })();
```

- [ ] **Step 7: 浏览器冒烟 + Commit**

`quick-scan.html?billNo=LY20260914001` 深链续作；扫一在架码 → 落盘；扫一假码 → 拦截且 `store.load().wh.pickDocs` 该单 `badCodes` 有记录；审核出库 → 状态 `已出库·待入库`、outTime 有值、items.docQty 回填。然后：

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/quick-scan.js
git commit -m "feat: 快捷扫码单池作业——待出库单内动作+badCodes落盘+审核→已出库·待入库"
```

---

### Task 6: ph-req.js 领用申请单——写 pickDocs 单池

**Files:**
- Modify: `$BASE/scripts/ph-req.js`

- [ ] **Step 1: 头部注释与数据读写**

头部注释（第 1-7 行）替换为：

```js
/**
 * ph-req.js — 领用申请单：药房按品规+数量向库房请领（药视角，不扫码）
 * 2026-10-05 单池化：读写 pickDocs（reqPool 废除）；新建=待提交草稿，提交→待出库；
 * 待出库(codes 空)可编辑/撤销(撤销=作废终态)，库房已开扫(codes 非空)锁定；已出库起只读，按 pickStatus 推导展示已上架
 * 待提交（库房制单草稿）仅库房侧可见，本页不显示；本药房待提交草稿照常显示
 */
```

`myReqs`（第 26-35 行）替换为：

```js
  function myReqs() {
    var ph = curPharm();
    return S.pickDocs.filter(function (d) {
      if (d.pharmacy !== ph) return false;
      if (d.status === '待提交' && d.source === '库房制单') return false;   // 库房制单草稿仅库房侧可见
      if (d.source === '扫码直生') return false;   // 直生单在「领用入库单/药品扫码上架」链路查看
      if (filters.status !== '全部' && W.pickStatus(d) !== filters.status) return false;
      if (filters.kw && d.billNo.indexOf(filters.kw) === -1) return false;
      return true;
    });
  }
  function selReq() {
    for (var i = 0; i < S.pickDocs.length; i++) if (S.pickDocs[i].billNo === sel) return S.pickDocs[i];
    return null;
  }
```

（删除旧 `selReq`，`reqNo` → `billNo` 全文替换。）

- [ ] **Step 2: 筛选/徽章/操作五态化**

`filterBar` 状态下拉（第 58 行）：`['全部', '待提交', '待出库', '已出库·待入库', '已入库·待上架', '已上架', '已作废']`。
`docsCard` 行渲染（第 69-93 行）中 st/op 替换为：

```js
      var pst = W.pickStatus(r);
      var st = pst === '已上架'
        ? '<span class="pch-light ok"><i class="pch-dot"></i>已上架</span>'
        : (pst === '已入库·待上架'
          ? '<span class="pch-light" style="color:#2FB344;"><i class="pch-dot" style="background:#2FB344;"></i>已入库 · 待上架</span>'
          : (pst === '已出库·待入库'
            ? '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>已出库 · 待入库</span>'
            : (pst === '已作废'
              ? '<span class="pch-light mute"><i class="pch-dot"></i>已作废</span>'
              : (pst === '待提交'
                ? '<span class="badge bg-secondary-lt">待提交</span>'
                : '<span class="pch-light" style="color:#206BC4;"><i class="pch-dot" style="background:#206BC4;"></i>待出库</span>'))));
      var locked = r.status === '待出库' && (r.codes || []).length > 0;   // 库房已开扫，锁定
      var op = r.status === '待提交'
        ? '<button class="btn btn-sm btn-outline-primary" data-edit="' + esc(r.billNo) + '">编辑</button> ' +
          '<button class="btn btn-sm btn-success" data-submit="' + esc(r.billNo) + '">提交库房备货</button> ' +
          '<button class="btn btn-sm btn-outline-danger" data-del="' + esc(r.billNo) + '">删除</button>'
        : (r.status === '待出库' && !locked
          ? '<button class="btn btn-sm btn-outline-secondary" data-edit="' + esc(r.billNo) + '">编辑</button> ' +
            '<button class="btn btn-sm btn-outline-danger" data-del="' + esc(r.billNo) + '">撤销</button>'
          : (locked
            ? '<span class="text-secondary" style="font-size:12.5px;">库房备货中</span>'
            : '<span class="text-secondary" style="font-size:12.5px;">只读</span>'));
```

行 `data-sel` 值与 `r.reqNo` 引用改 `r.billNo`；表头 `申请单号` → `单据编号`；`itemsCard` 中 `r.reqNo` → `r.billNo`，明细行 qty 列后加 docQty 展示（`<td><b>' + it.qty + '</b></td>` 后加 `<td>' + (it.docQty || 0) + '</td>`，表头 `申请数` 后加 `单据数`）。

- [ ] **Step 3: openEdit 建/改单池**

`openEdit` 中 `applyNew`（第 175-184 行）替换为：

```js
    function applyNew(status) {
      var items = collect();
      if (!items) return;
      items = items.map(function (it) { return { drugCode: it.drugCode, qty: it.qty, docQty: 0, slot: it.slot || '' }; });
      var t = W.now();
      var r = { billNo: W.nextNo('LY', S.pickDocs), date: t, pharmacy: curPharm(),
        warehouse: el.querySelector('#rqWh').value, applicant: curUser().name || '演示员',
        operator: curUser().name || '演示员', source: '药房申请', status: status, remark: el.querySelector('#rqRemark').value.trim(),
        items: items, codes: [], badCodes: [], shelfLoc: '',
        createTime: t, submitTime: status === '待提交' ? '' : t, outTime: '', inTime: '' };
      S.pickDocs.unshift(r); sel = r.billNo;
      save(); UI.close('phReqEdit'); renderAll();
      window.showToast(status === '待提交' ? '已存草稿（待提交），可在列表「提交库房备货」' : '已提交申请，库房「领用备货单」可见');
    }
```

`rqOk` 回调里 `applyNew('待备货')` → `applyNew('待出库')`；编辑分支加 items docQty 归一：

```js
      req.warehouse = el.querySelector('#rqWh').value;
      req.items = collect().map(function (it) { return { drugCode: it.drugCode, qty: it.qty, docQty: 0, slot: it.slot || '' }; });
      req.remark = el.querySelector('#rqRemark').value.trim();
```

（编辑分支先判 `var items = collect(); if (!items) return;` 保留，再赋值。）

- [ ] **Step 4: bind() 提交/删除**

`[data-submit]` 回调（第 216-225 行）：`r.status = '待备货'` → `r.status = '待出库'; r.submitTime = W.now();`，`S.reqPool.forEach` → `S.pickDocs.forEach` + `r.billNo === no`。
`[data-del]` 回调（第 226-238 行）替换为：

```js
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-del');
        var target = null;
        S.pickDocs.forEach(function (d) { if (d.billNo === no) target = d; });
        if (!target) return;
        var isDraft = target.status === '待提交';
        UI.confirm((isDraft ? '删除待提交申请 ' : '撤销申请 ') + '<b>' + esc(no) + '</b>？' + (isDraft ? '未提交不产生影响。' : '撤销=作废终态，库房单池同步可见。'), function () {
          if (isDraft) {
            S.pickDocs = S.pickDocs.filter(function (d) { return d.billNo !== no; });
          } else {
            target.status = '已作废';
          }
          if (sel === no) sel = null;
          save(); renderAll();
          window.showToast((isDraft ? '已删除 ' : '已撤销（作废）') + no);
        }, isDraft ? '确认删除' : '撤销');
      });
    });
```

末尾初始选中 `first.reqNo` → `first.billNo`。

- [ ] **Step 5: 跑 _t-ph-req 链路冒烟 + Commit**

浏览器开 `ph-req.html` 走「新增申请→提交」，控制台确认 `pickDocs` 新增 `status==='待出库'`；再编辑/撤销各一次。然后：

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/ph-req.js
git commit -m "feat: 领用申请单写单池——新建待提交/提交待出库/撤销即作废/已上架推导展示"
```

---

### Task 7: ph-req-in.js 领用入库单——五态过滤与审核

**Files:**
- Modify: `$BASE/scripts/ph-req-in.js`

- [ ] **Step 1: 状态词与来源**

- 头部注释第 3 行 `待入库=库房已出库在途` 保留语义即可，补一行 `2026-10-05 单池化：已出库·待入库→审核→已入库·待上架（已上架推导展示）`。
- 深链段（第 24 行）`d.status === '药房已入库' ? '已入库' : '待入库'` → `(d.status === '已入库·待上架' || d.status === '已上架') ? '已入库' : '待入库'`。
- `myDocs`（第 34-36 行）：`d.status !== '已出库'` → `d.status !== '已出库·待入库'`；`d.status !== '药房已入库'` → `d.status !== '已入库·待上架'`；kw 行删除 `|| (d.reqNo||'').indexOf(...)` 段。
- `sourceOf`（第 48-54 行）替换为：

```js
  function sourceOf(d) { return d.source || '药房申请'; }
```

- `docsCard`：`pending = d.status === '已出库'` → `d.status === '已出库·待入库'`；st 文案 `药房已入库` → 用 `W.pickStatus(d)` 展示（`已上架` / `已入库 · 待上架`）；`d.reqNo` 列（第 95 行）改为 `d.source === '库房制单' && !(d.items||[]).length ? '<span class="badge bg-orange-lt">直接出库</span>' : esc(d.billNo)`——**简化口径：申请单号列删除**（单池一单一号，出库单号即申请单号），表头删除「申请单号」列，colspan 11→10。
- `codesTable` 第 139 行 `d.status === '药房已入库'` → `W.pickPosted(d) && d.status !== '已出库·待入库'`（即已入库段）。

- [ ] **Step 2: 审核入库**

`openAudit`（第 174-200 行）：`d.status !== '已出库'` → `!== '已出库·待入库'`；确认回调：

```js
      d.shelfLoc = v('priShelfLoc');
      d.status = '已入库·待上架';
      d.inTime = W.now();
```

toast 文案不变。

- [ ] **Step 3: 冒烟 + Commit**

`ph-req-in.html`：待入库列表见到 LYCK 种子在途单 → 审核入库 → 状态变 `已入库 · 待上架`，全码上架后（配合 Task 8）徽章变 `已上架`。然后：

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/ph-req-in.js
git commit -m "feat: 领用入库单五态过滤——审核→已入库·待上架，来源直读 d.source"
```

---

### Task 8: ph-shelf.js 上架 + 捷径C 扫码直生

**Files:**
- Modify: `$BASE/scripts/ph-shelf.js`

- [ ] **Step 1: 头部注释**

头部注释追加两行：

```js
 * 2026-10-05 单池化：上架写码 scanHead=药房上架/shelfTime；全码上架→所在单展示推导态「已上架」
 * 捷径C 扫码直生：扫到「本库房在架但无在途单」的码 → 弹确认 → directPick() 一步建闭环单（scanHead=药房直生）
```

- [ ] **Step 2: doScan 上架分支——直生入口 + 全码上架提示**

`doScan`（第 195-234 行）改造：

① `!inStock` 分支（第 204-207 行）替换为：

```js
    if (!inStock) {
      // 捷径C：本库房在架但无在途单 → 可直生领用单；否则异常拦截
      var whHit = null;
      W.stockAll(window.PUL_PCH.load(), S, '').forEach(function (x) { if (x.code === code) whHit = x; });
      if (mode === 'up' && whHit) { openDirect(whHit); return; }
      last = { code: code, level: 'bad', msg: '不在本药房在架（未入库 / 已退 / 已报损）', dict: dictOf(code) };
      pushLog(code, 'bad', last.msg); renderAll(); return;
    }
```

② 上架成功分支末尾（第 221 行 `if (!stock().some(...))` 后）追加：

```js
      // 全码上架 → 所在单展示推导态「已上架」（pickStatus 推导，不落库）
      var doneDoc = null;
      (S.pickDocs || []).forEach(function (d) {
        if (d.pharmacy !== ph() || d.status !== '已入库·待上架') return;
        if ((d.codes || []).some(function (c) { return c.code === code; })) doneDoc = d;
      });
      if (doneDoc && W.pickStatus(doneDoc) === '已上架') window.showToast('🎉 领用单 ' + doneDoc.billNo + ' 全码上架完成（已上架）');
```

- [ ] **Step 3: openDirect 直生确认弹窗**

`undo` 函数前新增：

```js
  // 捷径C 直生确认：本库房在架码 → 一步建「已入库·待上架」领用单（码带 phLoc → 推导已上架）
  function openDirect(whCode) {
    if (!loc) { window.showToast('请先选择上架货位再直生'); return; }
    var name = drugNameOf(whCode.code);
    UI.modalShell('shDirect', '扫码直生领用单',
      '<div class="mb-2">追溯码 <b style="font-family:Consolas,monospace;">' + esc(whCode.code) + '</b>（' + esc(name) + '）' +
      '在本库房<b>在架</b>，但本药房没有对应在途/已入库领用单。</div>' +
      '<div class="text-secondary" style="font-size:12.5px;line-height:1.7;">确认后一步生成「扫码直生」领用单：库房在架同扣、本药房在架同增，' +
      '本码直接上架到货位 <b>' + esc(loc) + '</b>（批次 ' + esc(whCode.batch || '—') + ' · 效期 ' + esc(whCode.expDate || '—') + '）。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="shDirectOk">✓ 直生并上架到 ' + esc(loc) + '</button>', 480);
    var el = UI.open('shDirect');
    el.querySelector('#shDirectOk').addEventListener('click', function () {
      var user = window.store.load().currentUser || {};
      var blocked = logs.filter(function (g) { return g.level === 'bad' && !g.undone; })
        .map(function (g) { return { code: g.code, reason: g.msg, stage: '药房直生' }; });
      var doc = W.directPick(ph(), user.warehouse || '中心库',
        [Object.assign({}, whCode, { phLoc: loc })], user.name || '演示员');
      doc.badCodes = blocked;
      S = W.load();   // directPick 内部自建状态落盘，回读对齐
      save();
      scanned++;
      last = { code: whCode.code, level: 'ok', msg: name + ' 直生 ' + doc.billNo + ' 上架 ' + loc, dict: dictOf(whCode.code) };
      pushLog(whCode.code, 'ok', last.msg);
      UI.close('shDirect');
      renderAll();
      window.showToast('已直生领用单 ' + doc.billNo + '（已上架 ' + loc + '）');
    });
  }
```

> **实现注意：** `directPick` 内部 `load()` 取的是 storage 最新状态，而页面持有的 `S` 可能是旧引用——所以直生后必须 `S = W.load()` 回读再 `save()`（上方已含），否则当次上架的其他改动会覆盖直生单。

- [ ] **Step 4: 冒烟 + Commit**

`ph-shelf.html`：选货位 M-02，扫一个库房在架假码（如 OTH_IN 未占用码 `8461935 000500008` 系列先在库存查询确认）→ 弹直生确认 → 确认后库房在架减 1、药房在架增 1、新单 `source==='扫码直生'`、`scanHead==='药房直生'`、推导「已上架」；扫已在架码正常上架不受影响。然后：

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/ph-shelf.js
git commit -m "feat: 扫码上架捷径C——库房在架无单码直生领用单（scanHead=药房直生）"
```

---

### Task 9: 只读/联动页对齐（wh-pick-out / wh-out-query / ph-in-query / ph-ret-out / purchase-in / ph-stock 注释）

**Files:**
- Modify: `$BASE/scripts/wh-pick-out.js`
- Modify: `$BASE/scripts/wh-out-query.js`
- Modify: `$BASE/scripts/ph-in-query.js`
- Modify: `$BASE/scripts/ph-ret-out.js`
- Modify: `$BASE/scripts/purchase-in.js`
- Modify: `$BASE/scripts/ph-stock.js`

- [ ] **Step 1: wh-pick-out.js 领用出库单台账（设计稿页面清单第 4 行，探索确认需同步改）**

- 头部注释（第 1-6 行）改为：

```js
/**
 * wh-pick-out.js — 领用出库单（纯出库台账）
 * 口径：只列过账领用单（已出库·待入库 / 已入库·待上架 / 已上架推导），与药房「领用入库单」一一对应
 * 待提交/待出库/作废归「领用备货单」页；2026-10-05 单池化：来源/明细直读单据本体（reqPool 已废除）
 * 明细三页签：码详情/药品清单/无库存码
 */
```

- 删除 `reqOf`（第 22-26 行）。
- `stHtml`（第 27-30 行）替换为：

```js
  function stHtml(d) {
    var st = W.pickStatus(d);
    if (st === '已上架') return '<span class="pch-light ok"><i class="pch-dot"></i>已上架</span>';
    if (st === '已入库·待上架') return '<span class="pch-light" style="color:#2FB344;"><i class="pch-dot" style="background:#2FB344;"></i>已入库 · 待上架</span>';
    return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>已出库 · 待入库</span>';
  }
```

- `srcHtml`（第 31-37 行）替换为：

```js
  function srcHtml(d) {
    if (d.source === '扫码直生') return '<span class="badge bg-cyan-lt">扫码直生</span>';
    if (d.source === '库房制单' && !(d.items || []).length) return '<span class="badge bg-orange-lt">直接出库</span>';
    if (d.source === '库房制单') return '<span class="badge bg-purple-lt">库房制单</span>';
    return '<span class="badge bg-azure-lt">领用申请</span>';
  }
```

- `locOf`（第 38-44 行）：`var req = reqOf(d); ((req && req.items) || [])` → `(d.items || [])`。
- `allDocs`（第 61-70 行）：`if (d.status !== '已出库' && d.status !== '药房已入库') return;` → `if (!W.pickPosted(d)) return;   // 待提交/待出库/已作废归「领用备货单」页`。
- `list`（第 73 行）：kw 中 `&& (d.reqNo || '').indexOf(f.billNo) === -1` 段删除；第 76 行 `if (f.status && d.status !== f.status)` → `if (f.status && W.pickStatus(d) !== f.status)`。
- 状态下拉（第 100 行）：`['已出库', '药房已入库'].map(...)` → `['已出库·待入库', '已入库·待上架', '已上架'].map(function (s) { return '<option' + (f.status === s ? ' selected' : '') + '>' + s + '</option>'; })`。
- `docsCard` 行（第 119-121 行）：`d.status === '已出库'` → `d.status === '已出库·待入库'`；`闭环 ' + esc(d.auditTime||'')` → `闭环 ' + esc(d.inTime || '')`。
- `drugRows`（第 130-173 行）：`var req = reqOf(d); if (req) { return (req.items||[]).map(...) }` → `if ((d.items || []).length) { return d.items.map(...) }`（函数体其余不变，`it.qty`/`it.slot` 字段同名）；无 items 聚合分支不变。
- 第 247 行注释 `深链指向未过账单（备货中/待提交）时回落` → `（待出库/待提交）`。

- [ ] **Step 2: wh-out-query.js**

第 35 行 `refNo: d.reqNo` → `refNo: ''`（reqNo 已废除；pickPosted 已由 wh-data 对齐五态，无需改）。

- [ ] **Step 3: ph-in-query.js**

第 23 行 `d.status !== '药房已入库'` → `d.status !== '已入库·待上架'`；第 25 行 kw 中 `|| (d.reqNo||'')...` 段删除；第 134 行 `d.reqNo ? esc(d.reqNo) : '<span class="badge bg-orange-lt">直接出库</span>'` → `(d.source === '库房制单' && !(d.items||[]).length) ? '<span class="badge bg-orange-lt">直接出库</span>' : esc(d.billNo)`；第 2、20 行注释状态词同步。

- [ ] **Step 4: ph-ret-out.js**

第 65 行 `d.status === '药房已入库'` → `(d.status === '已入库·待上架' || d.status === '已上架')`；第 3、61、207、269 行注释/文案中「药房已入库」→「已入库·待上架」（refNo 字段名与值不变——历史种子 LYCK 号仍有效）。

- [ ] **Step 5: purchase-in.js 流转建单**

第 173 行文案 `生成「备货中」出库草稿` → `生成「待出库」领用单草稿`；第 180 行注释 `建「备货中」草稿` → `建「待出库」草稿`；第 201-205 行建单对象替换为：

```js
      var billNo = W.nextNo('LYCK', wh.pickDocs);
      var t = W.now();
      wh.pickDocs.unshift({ billNo: billNo, date: t, pharmacy: el.querySelector('#fpPh').value,
        warehouse: d.warehouse || u.node || '中心库', applicant: u.name || '演示员', operator: u.name || '演示员',
        source: '库房制单', status: '待出库',
        remark: '由采购入库单 ' + d.billNo + ' 流转', shelfLoc: '',
        items: [], badCodes: [], createTime: t, submitTime: t, outTime: '', inTime: '',
        codes: d.codes.map(function (c) { return Object.assign({}, c, { scanHead: '库房备货', shelfTime: '', phLoc: c.phLoc || '', expectLoc: c.expectLoc || '' }); }) });
```

- [ ] **Step 6: ph-stock.js 注释**

第 3 行 `待收=pickDocs 已出库` → `待收=pickDocs 已出库·待入库`（逻辑由 phTransit 已对齐，无代码改动）。

- [ ] **Step 7: Commit**

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/wh-pick-out.js prototypes/2026-09/pul-fms-base-v1/scripts/wh-out-query.js prototypes/2026-09/pul-fms-base-v1/scripts/ph-in-query.js prototypes/2026-09/pul-fms-base-v1/scripts/ph-ret-out.js prototypes/2026-09/pul-fms-base-v1/scripts/purchase-in.js prototypes/2026-09/pul-fms-base-v1/scripts/ph-stock.js
git commit -m "feat: 领用单统一——出库台账/只读/联动页状态词对齐五态（含采购流转建单）"
```

---

### Task 10: 浏览器自动化脚本注释/断言对齐 + 全量 node 校验

**Files:**
- Modify: `$BASE/scripts/_t-wh-pick.js`
- Modify: `$BASE/scripts/_t-quick-scan.js`

- [ ] **Step 1: `_t-wh-pick.js` / `_t-quick-scan.js`**

`_t-wh-pick.js`（全文 12 行）：头部注释 `建/复用备货中草稿` → `直跳快捷扫码续作（待出库单内动作）`；第 8 行选择器 `[data-pickreq="LY20260914002"]` → `[data-resume="LY20260914002"]`（新 wh-pick 备货按钮统一 data-resume；该单在新种子中为待出库，单号不变）。

`_t-quick-scan.js`：选择器全部仍有效（选单弹窗行沿用 `data-pickreq`、单号 LY20260914002 不变、qsPick/qsPickOk/qsInput/qsModeRm/qsAudit 不变），仅头部注释（第 3、6 行）`建/复用备货中草稿` → `选中待出库单`、`推进同一草稿为已出库` → `推进同一单为已出库·待入库`、第 40 行注释 `已出库·在途` → `已出库·待入库`。逻辑零改动。

- [ ] **Step 2: 全量 node 校验 + menu-sync 零改动**

Run（仓库根）:
```bash
cd prototypes/2026-09/pul-fms-base-v1 && node scripts/_t-invariants.node.js && node scripts/_t-post-assign.node.js && node scripts/_t-guide.node.js
cd d:/Claude-code/PUL-FMS/PUL-FMS && node scripts/check-prd-menu-sync.js
```
Expected: 三校验脚本全绿；menu-sync 零改动（菜单未动）。

- [ ] **Step 3: Commit**

```bash
git add prototypes/2026-09/pul-fms-base-v1/scripts/_t-wh-pick.js prototypes/2026-09/pul-fms-base-v1/scripts/_t-quick-scan.js
git commit -m "test: 浏览器自动化脚本注释/断言对齐单池五态"
```

---

### Task 11: SQL 三文件物理合并

**Files:**
- Modify: `prototypes/shared/diagrams/er/pul-fms-full.sql`
- Modify: `prototypes/shared/diagrams/er/pul-fms-code-status.sql`
- Modify: `prototypes/shared/diagrams/er/pul-fms-core.sql`

- [ ] **Step 1: pul-fms-full.sql——REQ/REQ_ITEM/TRANSFER_DOC → PICK_DOC/PICK_ITEM + PICK_BAD_CODE**

① 文件头第 10 行注释 `拆 PURCHASE_DOC / TRANSFER_DOC / LOSS_DOC / MISC_DOC 四张` → `拆 PURCHASE_DOC / PICK_DOC / LOSS_DOC / MISC_DOC 四张`。
② `REQ`（第 343-355 行）、`REQ_ITEM`（第 357-365 行）、`TRANSFER_DOC`（第 367-381 行）三段整体替换为设计稿 §4.1 的 `PICK_DOC` + `PICK_ITEM` 两段 DDL（原文照录，含 `PICK_BAD_CODE`）：

```sql
CREATE TABLE `PICK_DOC` (            -- 领用单表头（REQ+TRANSFER_DOC 合并，2026-10-05 两池并一池）
  `billNo`     VARCHAR(20) NOT NULL COMMENT '领用单号 LY…（一单一号全程不换；历史数据保留 LYCK 原号）',
  `date`       VARCHAR(20) DEFAULT NULL COMMENT '单据日期',
  `pharmacy`   VARCHAR(20) DEFAULT NULL COMMENT '申请/收货药房',
  `warehouse`  VARCHAR(20) DEFAULT NULL COMMENT '供货库房',
  `applicant`  VARCHAR(30) DEFAULT NULL COMMENT '申请人',
  `source`     VARCHAR(10) DEFAULT NULL COMMENT '来源：药房申请/库房制单/扫码直生',
  `status`     VARCHAR(20) DEFAULT NULL COMMENT '待提交/待出库/已出库·待入库/已入库·待上架/已上架/已作废',
  `shelfLoc`   VARCHAR(20) DEFAULT NULL COMMENT '入库时选填整单上架货位（仅提示）',
  `createTime` VARCHAR(20) DEFAULT NULL COMMENT '创建时间',
  `submitTime` VARCHAR(20) DEFAULT NULL COMMENT '提交时间',
  `outTime`    VARCHAR(20) DEFAULT NULL COMMENT '出库审核时间（审核即扣库房账）',
  `inTime`     VARCHAR(20) DEFAULT NULL COMMENT '入库审核时间（加药房账）',
  `operator`   VARCHAR(30) DEFAULT NULL COMMENT '最近经办人',
  `remark`     VARCHAR(200) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`billNo`),
  CONSTRAINT `fk_PICK_ph_PHARMACY`  FOREIGN KEY (`pharmacy`)  REFERENCES `PHARMACY` (`code`),
  CONSTRAINT `fk_PICK_wh_WAREHOUSE` FOREIGN KEY (`warehouse`) REFERENCES `WAREHOUSE` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领用单（一套四表之表头，申请→上架全程同单）';

CREATE TABLE `PICK_ITEM` (           -- 药品清单明细
  `billNo`   VARCHAR(20) NOT NULL COMMENT '所属领用单',
  `drugCode` VARCHAR(20) NOT NULL COMMENT '药品（药品口径 · 无码）',
  `qty`      INT         DEFAULT NULL COMMENT '计划数量（申请填；扫码直生=实扫回填）',
  `docQty`   INT         DEFAULT NULL COMMENT '单据数量（扫码折合渐满）',
  `slot`     VARCHAR(20) DEFAULT NULL COMMENT '上架货位（可空；随单传递到码 expectLoc）',
  PRIMARY KEY (`billNo`, `drugCode`),
  CONSTRAINT `fk_PICK_ITEM_doc_PICK_DOC`   FOREIGN KEY (`billNo`)   REFERENCES `PICK_DOC` (`billNo`),
  CONSTRAINT `fk_PICK_ITEM_drugCode_DRUGS` FOREIGN KEY (`drugCode`) REFERENCES `DRUGS` (`drugCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领用单药品清单明细';

CREATE TABLE `PICK_BAD_CODE` (       -- 异常码明细（审核闸门拦截依据）
  `billNo` VARCHAR(20) NOT NULL COMMENT '所属领用单',
  `code`   VARCHAR(20) NOT NULL COMMENT '异常追溯码',
  `reason` VARCHAR(50) DEFAULT NULL COMMENT '单外码/解析失败/冻结/非本库房在架',
  `stage`  VARCHAR(10) DEFAULT NULL COMMENT '出现环节：库房备货/药房上架/药房直生',
  PRIMARY KEY (`billNo`, `code`),
  CONSTRAINT `fk_PICK_BAD_doc_PICK_DOC` FOREIGN KEY (`billNo`) REFERENCES `PICK_DOC` (`billNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领用单异常追溯码明细';
```

③ `RET_DOC` 在 `remark` 前补一列（现 DDL 无 refNo 列，本轮新增）：

```sql
  `refNo`     VARCHAR(20) DEFAULT NULL COMMENT '来源领用单号（PICK_DOC.billNo；库房直收为空）',
```

④ `DOC_CODE` 在 `expectLoc` 后补一列；注释「四张单据表共用」保留：

```sql
  `scanHead` VARCHAR(10) DEFAULT NULL COMMENT '扫码头：库房备货/药房上架/药房直生',
```

⑤ `DOC_CODE` 的 `phLoc` 注释改 `'药房货位（领用闭环上架后）'` 保留不变。

- [ ] **Step 2: pul-fms-code-status.sql——TRANSFER_DOC→PICK_DOC 五态推导**

- 头部第 11 行注释：`TRANSFER_DOC.billNo   领用出库：备货中(草稿,不扣账)/已出库(在途)/药房已入库(闭环)` → `PICK_DOC.billNo   领用单：待提交/待出库(备货单内动作,不扣账)/已出库·待入库(在途)/已入库·待上架(闭环)/已上架/已作废(释放码)`；第 28 行 `备货中草稿【不扣账】` → `待出库未过账【不扣账】`。
- CTE 改动：

```sql
ph_in AS (                                     -- ④ 领用闭环（已入库·待上架/已上架）
  SELECT dc.code, dc.phLoc, d.pharmacy FROM DOC_CODE dc
  JOIN PICK_DOC d ON d.billNo = dc.billNo
  WHERE d.status IN ('已入库·待上架', '已上架')
),
tf_out AS (                                    -- ⑤ 领用在途（已出库·待入库）
  SELECT dc.code, d.billNo, d.pharmacy FROM DOC_CODE dc
  JOIN PICK_DOC d ON d.billNo = dc.billNo
  WHERE d.status = '已出库·待入库'
),
```

- `draft` CTE：`JOIN TRANSFER_DOC` → `JOIN PICK_DOC`，`d.status = '备货中'` → `d.status = '待出库'`，注释 `备货中草稿（不扣账，仅标注）` → `待出库未过账（不扣账，仅标注）`。
- `wh_out` CTE 第二段：`JOIN TRANSFER_DOC` → `JOIN PICK_DOC`，`d.status IN ('已出库', '药房已入库')` → `d.status IN ('已出库·待入库', '已入库·待上架', '已上架')`。
- 单码履历查询：`LEFT JOIN TRANSFER_DOC tf` → `LEFT JOIN PICK_DOC tf`；`CONCAT('领用出库·', tf.status)` → `CONCAT('领用·', tf.status)`。
- `draft_bill` 列注释 `备货中草稿锁定单号` → `待出库锁定单号（不扣账，账上仍在架）`；文末变体注释 `备货中草稿锁定的码` → `待出库锁定的码`。

- [ ] **Step 3: pul-fms-core.sql 概念版同步**

- `REQ`（第 151-163 行）改名 `PICK_DOC`：主键 `billNo`、注释 `领用单号 LY…（一单一号全程不换）`、`status` 注释改 `'待提交/待出库/已出库·待入库/已入库·待上架/已上架/已作废'`、`source` 注释补 `/扫码直生`、表注释 `'领用单（药品口径申请+出库合并，一套四表之表头）'`、外键约束名 `fk_REQ_*` → `fk_PICK_*`，补 `applicant`/`operator` 保留，追加 `shelfLoc/createTime/submitTime/outTime/inTime` 五列（与 full 口径一致，类型 VARCHAR(20) DEFAULT NULL + 中文注释）。
- `REQ_ITEM`（第 165-173 行）改名 `PICK_ITEM`：`reqNo` → `billNo`、`qty` 注释改 `计划数量`、补 `` `docQty` INT DEFAULT NULL COMMENT '单据数量（扫码折合渐满）' ``、主键 (`billNo`,`drugCode`)、约束名 `fk_PICK_ITEM_*`、表注释 `'领用单药品清单明细'`。
- `DOC.status` 注释（第 123 行）`备货中(领用出库草稿,不扣账)/…/已出库·在途/药房已入库…` → `待提交/待出库(领用备货单内动作,不扣账)/未审核/已审核/已出库·待入库/已入库·待上架/已上架/已作废…`。
- `DOC_CODE` 在 `expectLoc` 后补 `` `scanHead` VARCHAR(10) DEFAULT NULL COMMENT '扫码头：库房备货/药房上架/药房直生', ``。

- [ ] **Step 4: DrawDB 导入验证 + ER README 登记**

DrawDB 导入 `pul-fms-full.sql`（MySQL 方言 + COMMENT 中文口径沿用）确认无报错、`REQ/TRANSFER_DOC` 消失、`PICK_DOC/PICK_ITEM/PICK_BAD_CODE` 出现、`DOC_CODE.scanHead` 存在。`prototypes/shared/diagrams/er/README.md` 第 15 行 `拆 PURCHASE_DOC/TRANSFER_DOC/LOSS_DOC/MISC_DOC` → `拆 PURCHASE_DOC/PICK_DOC/LOSS_DOC/MISC_DOC`，补一行变更记录（2026-10-05 REQ+REQ_ITEM+TRANSFER_DOC→PICK_DOC+PICK_ITEM，新增 PICK_BAD_CODE、DOC_CODE.scanHead、RET_DOC.refNo）。

- [ ] **Step 5: Commit**

```bash
git add prototypes/shared/diagrams/er/pul-fms-full.sql prototypes/shared/diagrams/er/pul-fms-code-status.sql prototypes/shared/diagrams/er/pul-fms-core.sql prototypes/shared/diagrams/er/README.md
git commit -m "feat: SQL领用单物理合并——PICK_DOC+PICK_ITEM+PICK_BAD_CODE，V_CODE_STATUS五态推导"
```

---

### Task 12: 端到端冒烟 + 迁移验证 + 复盘

**Files:** 无新增（验证 + 文档）

- [ ] **Step 1: 清空 localStorage 全新种子走查**

清 storage → 依次走：ph-req 新增申请并提交 → wh-pick 见待出库行 → 备货跳 quick-scan 扫码 → 审核出库（已出库·待入库，库房在架扣减）→ ph-req-in 审核入库（已入库·待上架）→ ph-shelf 全码上架（推导已上架 toast）→ ph-ret-out 从该单发起退回（锚点可见）。直生捷径单独走：ph-shelf 扫库房在架无单码 → 直生确认 → 已上架。

- [ ] **Step 2: 旧数据迁移验证（幂等）**

用旧版（git stash 或上一版）造一份含 reqPool + 老状态词的 localStorage，再切新版打开任意页：reqPool 清空、老单状态按映射表转换、再刷新一次单数不变（幂等）。

- [ ] **Step 3: 全量校验收尾**

```bash
cd prototypes/2026-09/pul-fms-base-v1 && node scripts/_t-invariants.node.js && node scripts/_t-post-assign.node.js && node scripts/_t-guide.node.js
cd d:/Claude-code/PUL-FMS/PUL-FMS && node scripts/check-prd-menu-sync.js
```
Expected: 全绿、menu-sync 零改动。

- [ ] **Step 4: 复盘四步 + 会话记录**

回顾目标 → 评估结果 → 分析原因 → 沉淀规律；写 `.claude/sessions/` 会话记录；更新 memory 索引（PUL-FMS 原型项目状态：Round AR 领用单统一落地）。
线上部署（`npm run deploy`）属生产操作，单独征求用户确认后执行。

---

## 设计稿外补充（探索中发现的联动，已并入对应 Task）

| 点 | 处理 | Task |
|---|---|---|
| `purchase-in.js` 流转建「备货中」pickDoc（设计稿未列） | 同步改「待出库」单池结构 | 9 |
| `inv-data.js` 药房盘盈建「药房已入库」pickDoc（设计稿未列） | 同步改「已入库·待上架」 | 3 |
| `RET_DOC` 现 DDL **无 refNo 列**（设计稿假设存在） | 本轮新增列 + 注释 | 11 |
| quick-scan 四道闸拦截码落 badCodes（设计稿仅提 ph-shelf） | 两页都落（stage=库房备货/药房直生），PICK_BAD_CODE 才有数据源 | 5、8 |
| quick-scan qsClose 空草稿：有计划单不删（防删药房申请），空直出草稿物理删（沿旧不留痕口径） | 判定条件 `codes空 && items空` | 5 |
