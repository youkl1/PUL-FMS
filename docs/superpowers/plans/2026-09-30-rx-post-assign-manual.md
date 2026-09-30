# 后置赋码（T3 手动补绑）+ 赋码异常台账 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「码进药出」主干上加 T3 降级通道：门诊扫码失败/住院无扫码条件时手动补绑（系统按规则推荐码、人工选定），全部补绑记录进「赋码异常台账」日结复核，逆向流程 R3–R7 收口。

**Architecture:** 数据层 `rx-data.js` 加 `excDocs` 台账与 bindManual/confirmExc/rebindExc/closeExc 纯函数（不入 UI）；共用弹窗 `rx-bind.js`（补绑/改绑）供 disp/tray/rx-exc 三页复用；新页面 `rx-exc.html` 挂出库管理组（自主新增 origin='n'）；库存占用仍由 `occupiedRxCodes` 派生（摘除 it.codes 即回架），不加库存字段。设计稿：`docs/superpowers/specs/2026-09-30-rx-post-assign-manual-design.md`。

**Tech Stack:** 原生 JS + Tabler（本地化），vm 沙箱 node 测试（`_t-*.node.js`），fireworks-tech-graph 出图。

**工作目录：** 除特别注明外，均在 `D:/Claude-code/PUL-FMS/PUL-FMS/prototypes/2026-09/pul-fms-base-v1/`。

---

### Task 1: rx-data.js 数据层（TDD）

**Files:**
- Test: `scripts/_t-post-assign.node.js`（新建）
- Modify: `scripts/rx-data.js`

- [ ] **Step 1: 写失败测试**

新建 `scripts/_t-post-assign.node.js`：

```js
/**
 * T3 手动补绑：推荐排序 / 补绑占用 / 台账状态机（确认/改绑/关闭）/ 超时判定
 * 跑：node scripts/_t-post-assign.node.js（在 pul-fms-base-v1 目录）
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var dir = __dirname;

var sessionStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};
var window = { sessionStorage: sessionStorage, console: console };
var ctx = vm.createContext({
  window: window, console: console, Date: Date, Object: Object, Array: Array,
  String: String, Math: Math, JSON: JSON, parseInt: parseInt, Number: Number,
  parseFloat: parseFloat, isNaN: isNaN, Boolean: Boolean
});
window.window = window;
function load(f) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
}
load('store.js');
load('drug-data.js');
load('purchase-data.js');
load('wh-data.js');
load('rx-data.js');

var W = window.PUL_WH;
var R = window.PUL_RX;
var failed = 0;
function eq(name, got, exp) {
  var g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g === e) console.log('  ok  ' + name);
  else { failed++; console.log('  FAIL ' + name + '\n       got ' + g + '\n       exp ' + e); }
}
function ok(name, cond) {
  if (cond) console.log('  ok  ' + name);
  else { failed++; console.log('  FAIL ' + name); }
}

// 唯可来标识码 8416917（字典种子内存在），尾部流水区分 4 个码
var C_M02 = '84169170000000020001'; // 有货位 M-02，效期远
var C_M01 = '84169170000000010002'; // 有货位 M-01，效期近
var C_N1  = '84169170000000010003'; // 无货位，入库单早（FIFO 先）
var C_N2  = '84169170000000020004'; // 无货位，入库单晚
function c(code, extra) {
  return Object.assign({ code: code, level: 1, split: '否', splitQty: '',
    batch: '250603', prodDate: '2025-06-15', expDate: '2028-06-14', checked: true, phLoc: '' }, extra || {});
}
var wh = W.load();
wh.pickDocs = [
  { billNo: 'LY20260920001', status: '药房已入库', pharmacy: '门诊药房', date: '2026-09-20 09:00',
    codes: [c(C_N1), c(C_M01, { phLoc: 'M-01', expDate: '2027-01-01' })] },
  { billNo: 'LY20260925001', status: '药房已入库', pharmacy: '门诊药房', date: '2026-09-25 09:00',
    codes: [c(C_N2), c(C_M02, { phLoc: 'M-02', expDate: '2028-06-14' })] }
];
W.save(wh);

var S = R.load();
S.rxDocs = []; S.trayDocs = []; S.excDocs = [];
var dc = R.parse(C_M01).dict.drugCode;
S.rxDocs.push({ rxNo: 'CF-T1', pharmacy: '门诊药房', status: '发药中', patient: '测试',
  items: [{ drugCode: dc, qty: 2, unit: '盒', codes: [] }] });
R.save(S);

console.log('# bindSuggest 推荐排序：货位序→FEFO→入库先后；无货位 FIFO');
var sug = R.bindSuggest(wh, '门诊药房', dc).map(function (x) { return x.code; });
eq('推荐顺序', sug, [C_M01, C_M02, C_N1, C_N2]);

console.log('# bindManual 补绑');
var r1 = R.bindManual(wh, S, '门诊药房', 'rx', 'CF-T1', dc, C_M01, { type: '扫码失败', operator: '陈静' });
ok('补绑成功', r1.ok);
R.save(S); // 占用由 occupiedRxCodes 从 store 派生，断言在架前必须先存
eq('码已绑定且打标', [S.rxDocs[0].items[0].codes.length, S.rxDocs[0].items[0].codes[0].bindType, S.rxDocs[0].items[0].codes[0].verified], [1, 'manual', '待复核']);
eq('台账产生待复核记录', [S.excDocs.length, S.excDocs[0].status, S.excDocs[0].rule], [1, '待复核', '货位FEFO']);
ok('补绑码离开药房在架', !W.pharmacyStock(wh, '门诊药房').some(function (x) { return x.code === C_M01; }));
ok('重复绑同码拦截', !R.bindManual(wh, S, '门诊药房', 'rx', 'CF-T1', dc, C_M01, {}).ok);
ok('非在架码拦截', !R.bindManual(wh, S, '门诊药房', 'rx', 'CF-T1', dc, '99999999999999999999', {}).ok);

console.log('# confirmExc 日结确认');
var excNo = S.excDocs[0].excNo;
ok('确认成功', R.confirmExc(S, excNo, '吴琳').ok);
eq('台账已确认+码已复核', [S.excDocs[0].status, S.rxDocs[0].items[0].codes[0].verified], ['已确认', '已复核']);
ok('重复确认拦截', !R.confirmExc(S, excNo, '吴琳').ok);

console.log('# rebindExc 改绑：旧码回架、新码占用');
var r2 = R.bindManual(wh, S, '门诊药房', 'rx', 'CF-T1', dc, C_N1, { type: '住院后置', operator: '陈静' });
ok('第二行补绑成功', r2.ok);
R.save(S);
var e2 = R.excOf(S, r2.excNo);
var rb = R.rebindExc(wh, S, '门诊药房', e2.excNo, C_N2, '吴琳');
ok('改绑成功', rb.ok);
R.save(S);
ok('旧码回架', W.pharmacyStock(wh, '门诊药房').some(function (x) { return x.code === C_N1; }));
ok('新码离架', !W.pharmacyStock(wh, '门诊药房').some(function (x) { return x.code === C_N2; }));
eq('台账已改绑且留旧码', [e2.status, e2.oldCode, e2.code], ['已改绑', C_N1, C_N2]);
eq('新码已复核（改绑=人工校正）', S.rxDocs[0].items[0].codes[1].verified, '已复核');

console.log('# 待补绑（住院后置）+ closeExc + 超时');
R.makeExc(S, { type: '住院后置', refKind: 'tray', refNo: 'BY-T1', pharmacy: '门诊药房', drugCode: dc, status: '待补绑', operator: '陈静' });
ok('excPendingFor 找得到', !!R.excPendingFor(S, 'BY-T1', dc));
var pend = R.excPendingFor(S, 'BY-T1', dc);
ok('待补绑可关闭', R.closeExc(S, pend.excNo, '吴琳').ok);
eq('已关闭', pend.status, '已关闭');
ok('已确认不可关闭', !R.closeExc(S, excNo, '吴琳').ok);
ok('超时判定：2020 年记录超期', R.overdue({ time: '2020-01-01 00:00', status: '待复核' }));
ok('超时判定：已确认不超期', !R.overdue({ time: '2020-01-01 00:00', status: '已确认' }));

console.log(failed ? '\n' + failed + ' 项失败' : '\n全部通过');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/_t-post-assign.node.js`
Expected: FAIL — `R.bindSuggest is not a function`

- [ ] **Step 3: 实现 rx-data.js 扩展**

`scripts/rx-data.js` 三处改动：

① `migrate(s)` 里 `if (!s.trayRetDocs) s.trayRetDocs = [];` 后追加：

```js
    if (!s.excDocs) s.excDocs = [];
```

② `window.PUL_RX = {...}` 之前插入：

```js
  // —— T3 手动补绑 + 赋码异常台账 ——
  function ruleOf(rec) { return rec && rec.phLoc ? '货位FEFO' : 'FIFO'; }
  function srcDateMap(wh) {
    var m = {};
    (wh.pickDocs || []).forEach(function (d) { m[d.billNo] = d.auditTime || d.date || ''; });
    return m;
  }
  // 补绑推荐：有货位（药柜）按 货位序→FEFO→入库先后；无货位按入库先后 FIFO
  function bindSuggest(wh, pharmacy, drugCode) {
    var dates = srcDateMap(wh);
    var list = window.PUL_WH.pharmacyStock(wh, pharmacy).filter(function (c) {
      if (c.split === '是') return false;
      var p = parse(c.code);
      return p.dict && p.dict.drugCode === drugCode;
    });
    var withLoc = [], noLoc = [];
    list.forEach(function (c) { (c.phLoc ? withLoc : noLoc).push(c); });
    withLoc.sort(function (a, b) {
      var t = String(a.phLoc).localeCompare(String(b.phLoc));
      if (t) return t;
      t = String(a.expDate || '').localeCompare(String(b.expDate || ''));
      if (t) return t;
      return String(dates[a._src] || '').localeCompare(String(dates[b._src] || ''));
    });
    noLoc.sort(function (a, b) {
      var t = String(dates[a._src] || '').localeCompare(String(dates[b._src] || ''));
      if (t) return t;
      return String(a.expDate || '').localeCompare(String(b.expDate || ''));
    });
    return withLoc.concat(noLoc);
  }
  function makeExc(state, f) {
    var e = {
      excNo: nextNo('EXC', state.excDocs, 'excNo'),
      type: f.type, refKind: f.refKind, refNo: f.refNo, pharmacy: f.pharmacy,
      drugCode: f.drugCode, code: f.code || '', rule: f.rule || '',
      operator: f.operator || '', time: now(),
      status: f.status || '待复核', confirmBy: '', confirmTime: '', oldCode: ''
    };
    state.excDocs.unshift(e);
    return e;
  }
  function excOf(state, excNo) {
    for (var i = 0; i < state.excDocs.length; i++) if (state.excDocs[i].excNo === excNo) return state.excDocs[i];
    return null;
  }
  function excPendingFor(state, refNo, drugCode) {
    for (var i = 0; i < state.excDocs.length; i++) {
      var e = state.excDocs[i];
      if (e.refNo === refNo && e.drugCode === drugCode && e.status === '待补绑') return e;
    }
    return null;
  }
  function docOf(state, refKind, refNo) {
    var docs = refKind === 'tray' ? state.trayDocs : state.rxDocs;
    for (var i = 0; i < docs.length; i++) if ((docs[i].rxNo || docs[i].trayNo) === refNo) return docs[i];
    return null;
  }
  // 手动补绑：码必须在本药房在架；绑定打 bindType/verified 标记；写或更新台账
  function bindManual(wh, state, pharmacy, refKind, refNo, drugCode, codeStr, opts) {
    opts = opts || {};
    var doc = docOf(state, refKind, refNo);
    if (!doc) return { ok: false, msg: '单据不存在' };
    var it = null;
    (doc.items || []).forEach(function (x) { if (x.drugCode === drugCode) it = x; });
    if (!it) return { ok: false, msg: '单据不含此药' };
    if ((it.codes || []).some(function (c) { return c.code === codeStr; })) return { ok: false, msg: '该码已绑定' };
    var onh = null;
    window.PUL_WH.pharmacyStock(wh, pharmacy).forEach(function (c) { if (c.code === codeStr) onh = c; });
    if (!onh) return { ok: false, msg: '不在本药房在架（或已被占用）' };
    it.codes.push(Object.assign({}, onh, { bindType: 'manual', verified: '待复核' }));
    var exc;
    if (opts.excNo) {
      exc = excOf(state, opts.excNo);
      if (exc) {
        exc.code = codeStr; exc.rule = ruleOf(onh); exc.operator = opts.operator || '';
        exc.time = now(); exc.status = '待复核';
      }
    }
    if (!exc) {
      exc = makeExc(state, { type: opts.type || '扫码失败', refKind: refKind, refNo: refNo,
        pharmacy: pharmacy, drugCode: drugCode, code: codeStr, rule: ruleOf(onh),
        operator: opts.operator || '', status: '待复核' });
    }
    return { ok: true, msg: '已补绑，待日结复核', excNo: exc.excNo };
  }
  // 日结复核确认：台账转已确认 + 码核验标记转已复核
  function confirmExc(state, excNo, operator) {
    var e = excOf(state, excNo);
    if (!e || e.status !== '待复核') return { ok: false, msg: '记录不存在或状态不可确认' };
    e.status = '已确认'; e.confirmBy = operator || ''; e.confirmTime = now();
    var doc = docOf(state, e.refKind, e.refNo);
    if (doc) (doc.items || []).forEach(function (it) {
      (it.codes || []).forEach(function (c) { if (c.code === e.code) c.verified = '已复核'; });
    });
    return { ok: true, msg: '已确认' };
  }
  // 关闭：药已退等无需补绑情形，码池不动
  function closeExc(state, excNo, operator) {
    var e = excOf(state, excNo);
    if (!e || e.status === '已确认' || e.status === '已关闭') return { ok: false, msg: '当前状态不可关闭' };
    e.status = '已关闭'; e.confirmBy = operator || ''; e.confirmTime = now();
    return { ok: true, msg: '已关闭' };
  }
  // 改绑：摘除旧码即回架（占用由 it.codes 派生），绑新码；改绑=人工校正，新码直接已复核
  function rebindExc(wh, state, pharmacy, excNo, newCode, operator) {
    var e = excOf(state, excNo);
    if (!e || (e.status !== '待复核' && e.status !== '已确认')) return { ok: false, msg: '当前状态不可改绑' };
    var doc = docOf(state, e.refKind, e.refNo);
    if (!doc) return { ok: false, msg: '单据不存在' };
    var it = null;
    (doc.items || []).forEach(function (x) { if (x.drugCode === e.drugCode) it = x; });
    if (!it) return { ok: false, msg: '单据不含此药' };
    var idx = -1;
    (it.codes || []).forEach(function (c, i) { if (c.code === e.code) idx = i; });
    if (idx < 0) return { ok: false, msg: '原码已不在单据上（可能已退药）' };
    var onh = null;
    window.PUL_WH.pharmacyStock(wh, pharmacy).forEach(function (c) { if (c.code === newCode) onh = c; });
    if (!onh) return { ok: false, msg: '新码不在本药房在架' };
    it.codes.splice(idx, 1);
    it.codes.push(Object.assign({}, onh, { bindType: 'manual', verified: '已复核' }));
    e.oldCode = e.code; e.code = newCode; e.rule = ruleOf(onh);
    e.status = '已改绑'; e.confirmBy = operator || ''; e.confirmTime = now();
    return { ok: true, msg: '已改绑：原码回架，新码已复核' };
  }
  // 超 24h 未处理（待补绑/待复核）
  function overdue(e) {
    if (e.status !== '待补绑' && e.status !== '待复核') return false;
    var t = new Date(String(e.time).replace(' ', 'T')).getTime();
    return !!t && (Date.now() - t) > 24 * 3600 * 1000;
  }
```

③ `window.PUL_RX` 导出对象改为：

```js
  window.PUL_RX = {
    load: load, save: save, now: now, nextNo: nextNo, drugOf: drugOf, parse: parse,
    availableQty: availableQty, suggestCodes: suggestCodes, itemDone: itemDone, rxDone: rxDone,
    bindSuggest: bindSuggest, makeExc: makeExc, excOf: excOf, excPendingFor: excPendingFor,
    docOf: docOf, bindManual: bindManual, confirmExc: confirmExc, closeExc: closeExc,
    rebindExc: rebindExc, overdue: overdue
  };
```

- [ ] **Step 4: 跑测试确认通过 + 回归**

Run: `node scripts/_t-post-assign.node.js` → Expected: 全部通过
Run: `node scripts/_t-invariants.node.js` → Expected: all passed（migrate 只加字段，旧断言不破）

- [ ] **Step 5: Commit**

```bash
git add scripts/_t-post-assign.node.js scripts/rx-data.js
git commit -m "feat: T3 手动补绑数据层——bindSuggest 推荐序/excDocs 台账/确认改绑关闭状态机"
```

---

### Task 2: 共用补绑/改绑弹窗 rx-bind.js

**Files:**
- Create: `scripts/rx-bind.js`

- [ ] **Step 1: 新建共用弹窗脚本**

```js
/**
 * rx-bind.js — 手动补绑/改绑共用弹窗：系统按规则推荐码清单，人工勾选确认（T3 首版手动）
 * 复用方：disp.js / tray.js（补绑）、rx-exc.js（改绑）
 */
(function () {
  'use strict';
  var UI = window.PchUI, esc = UI.esc;
  function me() { return (window.store.load().currentUser || {}).name || '演示员'; }
  function drugName(dc) { var d = window.PUL_RX.drugOf(dc); return d ? d.drugName : dc; }

  function candRows(cands, inputType) {
    return cands.map(function (c) {
      return '<tr><td><input type="' + inputType + '" name="bindPick" value="' + esc(c.code) + '"></td>' +
        '<td style="font-family:Consolas,monospace;font-size:12px;">' + esc(c.code) + '</td>' +
        '<td>' + esc(c.batch || '—') + '</td><td>' + esc(c.expDate || '—') + '</td>' +
        '<td>' + esc(c.phLoc || '不入槽') + '</td>' +
        '<td><span class="badge bg-azure-lt">' + (c.phLoc ? '货位FEFO' : 'FIFO') + '</span></td></tr>';
    }).join('');
  }
  function ruleNote() {
    return '<div class="text-secondary" style="font-size:12.5px;margin-bottom:8px;">' +
      '推荐序：有货位按 货位→FEFO→入库先后；无货位按入库先后 FIFO。' +
      '系统与实物可能不一致，请按手中实物勾选，差异由盘点/台账复核修补。</div>';
  }
  var EMPTY = '<div class="text-secondary" style="padding:12px 0;">本药房在架无码可绑——该药可能入库无码，' +
    '请走「处方取药赋码」生成院内码（占位功能）。</div>';

  // 补绑 opts: { wh, state, pharmacy, refKind, refNo, item, excNo?, onDone }
  function open(opts) {
    var R = window.PUL_RX;
    var it = opts.item;
    var cands = R.bindSuggest(opts.wh, opts.pharmacy, it.drugCode);
    var bound = (it.codes || []).filter(function (c) { return c.split !== '是'; }).length;
    var remain = it.qty - bound;
    var body = !cands.length ? EMPTY :
      ruleNote() + '<div class="text-secondary" style="font-size:12.5px;margin-bottom:8px;">还需 <b>' + remain + '</b> 个码，勾选后确认。</div>' +
      '<div class="table-responsive" style="max-height:320px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th></th><th>追溯码</th><th>批次</th><th>效期</th><th>货位</th><th>推荐规则</th></tr></thead>' +
      '<tbody>' + candRows(cands, 'checkbox') + '</tbody></table></div>' +
      '<div style="margin-top:10px;"><label class="text-secondary" style="font-size:12.5px;margin-right:6px;">补绑原因</label>' +
      '<select class="form-select" id="bindReason" style="width:auto;display:inline-block;">' +
      '<option>扫码失败</option><option>码不符</option><option>住院后置</option></select></div>';
    UI.modalShell('rxBind', '手动补绑 · ' + drugName(it.drugCode) + ' · ' + opts.refNo, body,
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      (cands.length ? '<button class="btn btn-primary" id="bindOk">确认绑定</button>' : ''), 860);
    var el = UI.open('rxBind');
    var ok = el.querySelector('#bindOk');
    if (!ok) return;
    ok.addEventListener('click', function () {
      var picks = [];
      el.querySelectorAll('input[name="bindPick"]:checked').forEach(function (cb) { picks.push(cb.value); });
      if (!picks.length) { window.showToast('请勾选要绑定的码'); return; }
      if (picks.length > remain) { window.showToast('只需再绑 ' + remain + ' 个，请减少勾选'); return; }
      var reason = el.querySelector('#bindReason').value;
      var fail = '';
      picks.forEach(function (code) {
        var r = R.bindManual(opts.wh, opts.state, opts.pharmacy, opts.refKind, opts.refNo,
          it.drugCode, code, { type: reason, operator: me(), excNo: opts.excNo });
        if (!r.ok) fail = r.msg;
      });
      if (fail) { window.showToast(fail); return; }
      UI.close('rxBind');
      if (opts.onDone) opts.onDone();
    });
  }

  // 改绑 opts: { wh, state, pharmacy, exc, onDone }
  function rebind(opts) {
    var R = window.PUL_RX;
    var e = opts.exc;
    var cands = R.bindSuggest(opts.wh, opts.pharmacy, e.drugCode);
    var body = '<div class="text-secondary" style="font-size:12.5px;margin-bottom:8px;">原绑定码 <b style="font-family:Consolas,monospace;">' +
      esc(e.code) + '</b> 将回架；单选新码后确认。</div>' +
      (!cands.length ? EMPTY :
      ruleNote() +
      '<div class="table-responsive" style="max-height:320px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th></th><th>追溯码</th><th>批次</th><th>效期</th><th>货位</th><th>推荐规则</th></tr></thead>' +
      '<tbody>' + candRows(cands, 'radio') + '</tbody></table></div>');
    UI.modalShell('rxRebind', '改绑 · ' + e.excNo, body,
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      (cands.length ? '<button class="btn btn-primary" id="rebindOk">确认改绑</button>' : ''), 860);
    var el = UI.open('rxRebind');
    var ok = el.querySelector('#rebindOk');
    if (!ok) return;
    ok.addEventListener('click', function () {
      var radio = el.querySelector('input[name="bindPick"]:checked');
      if (!radio) { window.showToast('请选择新码'); return; }
      var r = R.rebindExc(opts.wh, opts.state, opts.pharmacy, e.excNo, radio.value, me());
      if (!r.ok) { window.showToast(r.msg); return; }
      UI.close('rxRebind');
      if (opts.onDone) opts.onDone();
    });
  }

  window.RxBind = { open: open, rebind: rebind };
})();
```

- [ ] **Step 2: 语法检查**

Run: `node --check scripts/rx-bind.js`
Expected: 无输出（通过）

- [ ] **Step 3: Commit**

```bash
git add scripts/rx-bind.js
git commit -m "feat: 补绑/改绑共用弹窗 rx-bind.js（系统推荐+人工勾选）"
```

---

### Task 3: disp.js 门诊手动补绑入口

**Files:**
- Modify: `scripts/disp.js`
- Modify: `disp.html`（脚本引用 + intro 文案）

- [ ] **Step 1: itemsCard 加「操作」列 + 已绑码来源徽标**

`scripts/disp.js` itemsCard 药品清单 rows 的 return 语句改为（加第 9 列）：

```js
      var canBind = d.status === '发药中' && !R.itemDone(it);
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(drugName(it.drugCode)) + '</b></td>' +
        '<td class="text-secondary">' + esc(formSpec(it.drugCode)) + '</td>' +
        '<td>' + it.qty + esc(it.unit) + '</td>' +
        '<td>' + scanned + ' / ' + it.qty + '</td>' +
        '<td>' + (it.shortage ? '<span class="badge bg-red-lt">无库存</span>' : ('锁 ' + it.qty + ' · 在架 ' + onh)) + '</td>' +
        '<td>' + esc(loc) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12px;">' + esc(sugCode) + '</td>' +
        '<td>' + (canBind ? '<button class="btn btn-sm btn-outline-primary" data-mbind="' + i + '">手动补绑</button>' : '') + '</td></tr>';
```

表头行改为：

```js
      '<thead><tr><th>#</th><th>药品</th><th>规格</th><th>应发</th><th>已扫/应扫</th><th>锁 / 在架</th><th>建议货位</th><th>建议码</th><th>操作</th></tr></thead>' +
```

「已绑码」表的码单元格加来源徽标（`esc(c.code)` 后追加）：

```js
            '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) +
            (c.bindType === 'manual' ? ' <span class="badge bg-orange-lt">手动补绑·' + esc(c.verified || '待复核') + '</span>' : '') + '</td>' +
```

- [ ] **Step 2: 绑定弹窗接线**

`openScan(d)` 之后新增函数：

```js
  function openBind(d, idx) {
    window.RxBind.open({
      wh: WH, state: S, pharmacy: ph(), refKind: 'rx', refNo: d.rxNo, item: d.items[idx],
      onDone: function () {
        if (R.rxDone(d)) {
          d.status = '已完成'; d.doneTime = R.now(); d.dispenser = curUser().name || '陈静';
          tab = '已完成';
        }
        save(); renderAll();
        window.showToast(d.status === '已完成' ? '已补绑并进入已完成，异常台账待日结复核' : '已补绑，异常台账待日结复核');
      }
    });
  }
```

`bind()` 末尾追加：

```js
    content.querySelectorAll('[data-mbind]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = selDoc();
        if (d) openBind(d, +b.getAttribute('data-mbind'));
      });
    });
```

openScan 的 hint 改为：`'扫建议码（FEFO+货位）。齐了自动完成。扫不出可回明细行点「手动补绑」。拆零不扣整码。'`

- [ ] **Step 3: disp.html 脚本引用 + intro 文案**

`disp.html` 第 93 行 `<script src="scripts/app-shell.js"></script>` 前插入：

```html
  <script src="scripts/rx-bind.js"></script>
```

intro 弹窗「场景呼应」example-item-desc 文案由 `赋码/处方单批量赋码菜单仍占位。入槽亮灯本轮不做。` 改为 `扫码失败可走行内「手动补绑」（系统推荐+人工选定），记录进赋码异常台账日结复核。赋码/批量赋码菜单仍占位。`；「如何使用」第 3 步 step-desc 改为 `齐了自动完成；扫不出点行内「手动补绑」兜底`。

- [ ] **Step 4: 验证**

Run: `node --check scripts/disp.js && node scripts/_t-post-assign.node.js && node scripts/_t-invariants.node.js`
Expected: 全部通过

- [ ] **Step 5: Commit**

```bash
git add scripts/disp.js disp.html
git commit -m "feat: 门诊发药行内手动补绑（扫码失败降级 T3）"
```

---

### Task 4: tray.js 住院事后补绑

**Files:**
- Modify: `scripts/tray.js`
- Modify: `tray.html`（脚本引用）

- [ ] **Step 1: itemsCard 加「操作」列（摆药中 + 已完成待补绑均可补绑）**

`scripts/tray.js` itemsCard rows return 改为：

```js
      var done = R.itemDone(it);
      var pend = R.excPendingFor(S, d.trayNo, it.drugCode);
      var canBind = !done && (d.status === '摆药中' || (d.status === '已完成' && pend));
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(drugName(it.drugCode)) + '</b></td>' +
        '<td class="text-secondary">' + esc(formSpec(it.drugCode)) + '</td>' +
        '<td>' + it.qty + esc(it.unit) + '</td><td>' + scanned + ' / ' + it.qty + '</td>' +
        '<td>' + (it.shortage ? '<span class="badge bg-red-lt">无库存</span>' : ('锁 ' + it.qty + ' · 在架 ' + onh)) + '</td>' +
        '<td>' + esc(loc) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12px;">' + esc(sugCode) + '</td>' +
        '<td>' + (canBind ? '<button class="btn btn-sm btn-outline-primary" data-mbind="' + i + '">手动补绑</button>' : '') +
        (done || d.status !== '已完成' ? '' : '<span class="badge bg-orange-lt">待补绑</span>') + '</td></tr>';
```

表头加 `<th>操作</th>`（同 disp）。

- [ ] **Step 2: 「完成摆药·事后补绑」入口**

`ops(d)` 摆药中分支改为：

```js
    if (d.status === '摆药中') return '<button class="btn btn-sm btn-primary" data-scan="' + esc(d.trayNo) + '">▸ 扫码绑码</button> ' +
      '<button class="btn btn-sm btn-outline-warning" data-finish="' + esc(d.trayNo) + '">完成摆药·事后补绑</button>';
```

`voidDisp(d)` 之后新增：

```js
  function finishTray(d) {
    var unbound = d.items.filter(function (it) { return !R.itemDone(it); });
    if (!unbound.length) { window.showToast('全部明细已绑码，直接扫码收尾即可'); return; }
    UI.confirm('确认 <b>' + esc(d.trayNo) + '</b> 摆药完成？<div style="margin-top:8px;">' + unbound.length +
      ' 行未绑码，药先发往病区，将生成「待补绑」异常记录，事后在赋码异常台账补绑复核。</div>', function () {
      var me = curUser().name || '陈静';
      unbound.forEach(function (it) {
        if (!R.excPendingFor(S, d.trayNo, it.drugCode)) {
          R.makeExc(S, { type: '住院后置', refKind: 'tray', refNo: d.trayNo, pharmacy: d.pharmacy,
            drugCode: it.drugCode, status: '待补绑', operator: me });
        }
      });
      d.status = '已完成'; d.doneTime = R.now(); d.dispenser = me;
      tab = '已完成'; sel = d.trayNo;
      save(); renderAll();
      window.showToast('已完成摆药，' + unbound.length + ' 行待补绑，请到赋码异常台账处理');
    }, '确认完成');
  }

  function openBind(d, idx) {
    var it = d.items[idx];
    var pend = R.excPendingFor(S, d.trayNo, it.drugCode);
    window.RxBind.open({
      wh: WH, state: S, pharmacy: ph(), refKind: 'tray', refNo: d.trayNo, item: it,
      excNo: pend ? pend.excNo : undefined,
      onDone: function () {
        save(); renderAll();
        window.showToast('已补绑，异常台账转待复核');
      }
    });
  }
```

`bind()` 末尾追加：

```js
    content.querySelectorAll('[data-finish]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = null; S.trayDocs.forEach(function (x) { if (x.trayNo === b.getAttribute('data-finish')) d = x; });
        if (d) finishTray(d);
      });
    });
    content.querySelectorAll('[data-mbind]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = selDoc();
        if (d) openBind(d, +b.getAttribute('data-mbind'));
      });
    });
```

openScan 的 hint 改为：`'扫建议码。齐了自动完成。病区无扫码条件可走「完成摆药·事后补绑」。'`

- [ ] **Step 3: tray.html 脚本引用**

`<script src="scripts/app-shell.js"></script>` 前插入 `<script src="scripts/rx-bind.js"></script>`。

- [ ] **Step 4: 验证**

Run: `node --check scripts/tray.js && node scripts/_t-post-assign.node.js && node scripts/_t-invariants.node.js`
Expected: 全部通过（已完成摆药单的码仍被 occupiedRxCodes 占用——该函数含已完成态，无需改）

- [ ] **Step 5: Commit**

```bash
git add scripts/tray.js tray.html
git commit -m "feat: 摆药单事后补绑——完成摆药先生成待补绑记录，台账驱动补绑"
```

---

### Task 5: 赋码异常台账页 rx-exc

**Files:**
- Create: `rx-exc.html`
- Create: `scripts/rx-exc.js`

- [ ] **Step 1: 新建页面 HTML**

复制 `disp.html` 骨架，改 4 处：
- `<meta name="business-category" content="PUL-FMS 药品精细化管理系统 · 出库管理">`（与 disp 相同，不动）
- `<title>赋码异常台账 · PUL-FMS</title>`、`<h1 class="pi-title">赋码异常台账</h1>`、`<span class="pi-subtitle">原型页 · T3 手动补绑记录 · 日结复核 · 超 24h 升级</span>`
- intro 弹窗内容：标题「赋码异常台账」，subtitle「出库管理 · 自主新增 · 先药后码的修补闭环」，lead「一句话概括：手动补绑（未实物扫码核验）的记录全部在此日结复核：确认 / 改绑 / 关闭，超 24 小时升级提醒院区管理员。」，步骤 3 步（①待补绑去补绑 ②待复核逐条确认或改绑 ③账实争议走盘点校准）
- 脚本引用：`scripts/store.js` / `data.js` / `drug-data.js` / `purchase-data.js` / `purchase-shared.js` / `wh-data.js` / `rx-data.js` / `rx-bind.js` / `app-shell.js` / `rx-exc.js`

- [ ] **Step 2: 新建 scripts/rx-exc.js**

```js
/**
 * rx-exc.js — 赋码异常台账：待补绑 → 待复核 → 已确认/已改绑/已关闭；日结制，超 24h 升级提醒
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'rxExc', crumb: ['出库管理', '赋码异常台账'] });
  if (!content) return;

  var W = window.PUL_WH, R = window.PUL_RX, UI = window.PchUI, esc = UI.esc;
  var WH = W.load(), S = R.load();
  var tab = '待处理', kw = '';

  function save() { R.save(S); }
  function ph() { return W.curPharm(); }
  function me() { return (window.store.load().currentUser || {}).name || '演示员'; }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function drugName(dc) { var d = R.drugOf(dc); return d ? d.drugName : dc; }

  function list() {
    return S.excDocs.filter(function (e) {
      if (e.pharmacy !== ph()) return false;
      if (tab === '待处理') { if (e.status !== '待补绑' && e.status !== '待复核') return false; }
      else if (tab !== '全部' && e.status !== tab) return false;
      if (kw && (e.excNo + e.refNo + e.code + drugName(e.drugCode)).indexOf(kw) === -1) return false;
      return true;
    });
  }
  function counts() {
    var c = { 待处理: 0, 已确认: 0, 已改绑: 0, 已关闭: 0, 全部: 0 };
    S.excDocs.forEach(function (e) {
      if (e.pharmacy !== ph()) return;
      if (e.status === '待补绑' || e.status === '待复核') c['待处理']++;
      else if (c[e.status] != null) c[e.status]++;
      c['全部']++;
    });
    return c;
  }
  function overdueCount() {
    var n = 0;
    S.excDocs.forEach(function (e) { if (e.pharmacy === ph() && R.overdue(e)) n++; });
    return n;
  }
  function stHtml(e) {
    var od = R.overdue(e) ? ' <span class="badge bg-red-lt">超24h</span>' : '';
    if (e.status === '已确认') return '<span class="pch-light ok"><i class="pch-dot"></i>已确认</span>' + od;
    if (e.status === '已改绑') return '<span class="pch-light" style="color:#206bc4;"><i class="pch-dot" style="background:#206bc4;"></i>已改绑</span>' + od;
    if (e.status === '已关闭') return '<span class="pch-light" style="color:#667085;"><i class="pch-dot" style="background:#667085;"></i>已关闭</span>';
    return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>' + esc(e.status) + '</span>' + od;
  }

  function filterBar() {
    var c = counts();
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:220px;" placeholder="异常单号 / 单据号 / 码 / 药品" value="' + esc(kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(ph()) + ' · 日结制：当日班后复核，超 24h 升级院区管理员</span>' +
      '</div></div></div>' +
      UI.tabsHeader([
        { key: '待处理', name: '待处理', badge: c['待处理'] || '' },
        { key: '已确认', name: '已确认', badge: c['已确认'] || '' },
        { key: '已改绑', name: '已改绑', badge: c['已改绑'] || '' },
        { key: '已关闭', name: '已关闭', badge: c['已关闭'] || '' },
        { key: '全部', name: '全部', badge: c['全部'] || '' }
      ], tab);
  }

  function banner() {
    var n = overdueCount();
    if (!n) return '';
    return '<div class="alert alert-danger" style="padding:10px 16px;">⚠ ' + n +
      ' 条补绑记录超 24h 未处理，已升级提醒院区管理员（原型仅文案演示）。</div>';
  }

  function ops(e) {
    if (e.status === '待补绑') {
      var href = e.refKind === 'tray' ? 'tray.html?trayNo=' + encodeURIComponent(e.refNo) : 'disp.html';
      return '<a class="btn btn-sm btn-primary" href="' + esc(href) + '">去补绑</a> ' +
        '<button class="btn btn-sm btn-outline-secondary" data-close="' + esc(e.excNo) + '">关闭</button>';
    }
    if (e.status === '待复核') {
      return '<button class="btn btn-sm btn-primary" data-confirm="' + esc(e.excNo) + '">确认</button> ' +
        '<button class="btn btn-sm btn-outline-warning" data-rebind="' + esc(e.excNo) + '">改绑</button> ' +
        '<button class="btn btn-sm btn-outline-secondary" data-close="' + esc(e.excNo) + '">关闭</button>';
    }
    return '<span class="text-secondary" style="font-size:12.5px;">' + esc(e.confirmBy || '') + (e.confirmTime ? ' · ' + esc(e.confirmTime) : '') + '</span>';
  }

  function excCard() {
    var rows = list().map(function (e) {
      var codeCell = e.code
        ? '<span style="font-family:Consolas,monospace;font-size:12px;">' + esc(e.code) + '</span>' +
          (e.oldCode ? '<div class="text-secondary" style="font-size:11.5px;">原 <s>' + esc(e.oldCode) + '</s> 已回架</div>' : '')
        : '<span class="text-secondary">—</span>';
      return '<tr><td><b>' + esc(e.excNo) + '</b></td>' +
        '<td><span class="badge bg-azure-lt">' + esc(e.type) + '</span></td>' +
        '<td>' + esc(e.refNo) + '<div class="text-secondary" style="font-size:11.5px;">' + (e.refKind === 'tray' ? '摆药单' : '处方') + '</div></td>' +
        '<td>' + esc(drugName(e.drugCode)) + '</td>' +
        '<td>' + codeCell + '</td>' +
        '<td>' + esc(e.rule || '—') + '</td>' +
        '<td>' + esc(e.operator) + '<div class="text-secondary" style="font-size:11.5px;">' + esc(e.time) + '</div></td>' +
        '<td>' + stHtml(e) + '</td>' +
        '<td>' + ops(e) + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="9" class="text-center text-secondary" style="padding:28px;">本页签无记录——手动补绑（disp/tray 行内按钮）后记录出现在这里</td></tr>';
    return '<div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>异常单号</th><th>类型</th><th>来源单据</th><th>药品</th><th>补绑码</th><th>推荐规则</th><th>操作人/时间</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function doConfirm(excNo) {
    var r = R.confirmExc(S, excNo, me());
    if (!r.ok) { window.showToast(r.msg); return; }
    save(); renderAll();
    window.showToast('已确认，码核验标记转「已复核」');
  }
  function doClose(excNo) {
    UI.confirm('关闭 <b>' + esc(excNo) + '</b>？适用于药已退等无需补绑情形，码池不动。', function () {
      var r = R.closeExc(S, excNo, me());
      if (!r.ok) { window.showToast(r.msg); return; }
      save(); renderAll();
      window.showToast('已关闭');
    }, '确认关闭');
  }
  function doRebind(excNo) {
    var e = R.excOf(S, excNo);
    if (!e) return;
    window.RxBind.rebind({
      wh: WH, state: S, pharmacy: ph(), exc: e,
      onDone: function () {
        save(); renderAll();
        window.showToast('已改绑：原码回架，新码已复核');
      }
    });
  }

  function renderAll() { content.innerHTML = filterBar() + banner() + excCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () { kw = v('fKw'); renderAll(); });
    document.getElementById('btnReset').addEventListener('click', function () { kw = ''; renderAll(); });
    content.querySelectorAll('[data-ptab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-ptab'); renderAll(); });
    });
    content.querySelectorAll('[data-confirm]').forEach(function (b) {
      b.addEventListener('click', function () { doConfirm(b.getAttribute('data-confirm')); });
    });
    content.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { doClose(b.getAttribute('data-close')); });
    });
    content.querySelectorAll('[data-rebind]').forEach(function (b) {
      b.addEventListener('click', function () { doRebind(b.getAttribute('data-rebind')); });
    });
  }

  renderAll();
})();
```

- [ ] **Step 3: 验证**

Run: `node --check scripts/rx-exc.js`
Expected: 无输出（页面接线在 Task 7 同步面后由浏览器验证）

- [ ] **Step 4: Commit**

```bash
git add rx-exc.html scripts/rx-exc.js
git commit -m "feat: 赋码异常台账页——待补绑/待复核/已确认/已改绑/已关闭，日结+超时升级"
```

---

### Task 6: trace-q / ledger-data 核验标记 + inv 盘点差异提示

**Files:**
- Modify: `scripts/ledger-data.js`（locate 附绑定来源）
- Modify: `scripts/trace-q.js`（流水行展示补绑徽标）
- Modify: `scripts/inv.js`（审核弹窗盘亏疑似错绑提示）

- [ ] **Step 1: ledger-data.js locate() 附绑定来源**

`locate(code20)` 中 `var hist = collect().filter(...)` 之后追加：

```js
    hist.forEach(function (e) {
      (e.codes || []).forEach(function (c) {
        if (c.code === code20) { e.bindType = c.bindType || 'scan'; e.verified = c.verified || ''; }
      });
    });
```

- [ ] **Step 2: trace-q.js 流水行加补绑徽标**

`resultCard()` 的 rows map 中，类型单元格由 `'<td>' + esc(e.type) + '</td>'` 改为：

```js
        '<td>' + esc(e.type) +
        (e.bindType === 'manual' ? ' <span class="badge bg-orange-lt">手动补绑' + (e.verified === '已复核' ? '·已复核' : '·待复核') + '</span>' : '') + '</td>' +
```

- [ ] **Step 3: inv.js 审核弹窗疑似错绑提示**

`scripts/inv.js` 的 `audit(d)` 函数中，`var df = I.diff(d);` 之后、`UI.confirm(...)` 之前插入：

```js
    var excs = (window.PUL_RX.load().excDocs || []);
    var suspect = df.loss.filter(function (c) {
      return excs.some(function (e) { return e.code === c.code && (e.status === '待复核' || e.status === '已确认'); });
    });
```

confirm 文案的 `' · 盘亏 ' + df.loss.length + '<br>过账请到...` 段后拼接：

```js
      (suspect.length ? '<br><span style="color:#d63939;">盘亏中 ' + suspect.length +
        ' 个码有手动补绑记录，疑似错绑 → 请先到「赋码异常台账」改绑后再过账。</span>' : '') +
```

（inv.js 需已引用 rx-data.js——查 inv.html 脚本引用，缺则补上 `scripts/rx-data.js`。）

- [ ] **Step 4: 验证 + Commit**

Run: `node --check scripts/ledger-data.js && node --check scripts/trace-q.js && node --check scripts/inv.js && node scripts/_t-invariants.node.js`
Expected: 全绿

```bash
git add scripts/ledger-data.js scripts/trace-q.js scripts/inv.js inv.html
git commit -m "feat: 追溯查询展示手动补绑核验标记；盘点审核提示疑似错绑"
```

---

### Task 7: 菜单/权限/导览/plan 同步面

**Files:**
- Modify: `scripts/app-shell.js`（NAV）
- Modify: `scripts/data.js`（MENU_TREE + PERM_MAP）
- Modify: `scripts/guide-data.js`（导览菜单 + disp note）
- Modify: `scripts/_t-guide.node.js`（断言 6 同步）
- Modify: `plan.html`、`index.html`
- Modify: `../../../specs/2026-09/pul-fms/README.md`（总映射表）

- [ ] **Step 1: NAV 加 rxExc（出库管理组，assignQ 之后）**

`scripts/app-shell.js` 第 112 行 assignQ 行之后插入：

```js
      { key: 'rxExc', name: '赋码异常台账', icon: 'clipboard', href: 'rx-exc.html', origin: 'n' },
```

- [ ] **Step 2: data.js MENU_TREE + PERM_MAP**

`scripts/data.js` MENU_TREE 出库管理组 assignQ 行之后插入：

```js
    { code: 'rxExc',      name: '赋码异常台账',   ops: ['查看', '复核', '改绑'], origin: 'n' },
```

PERM_MAP 三处：
- `SYS_ADMIN` 块加 `rxExc: ['查看','复核','改绑'],`（接在 `assignQ: ['查看'],` 前）
- `YQ_ADMIN` 块加 `rxExc: ['查看'],`
- `PHARM` 块加 `rxExc: ['查看','复核','改绑'],`

- [ ] **Step 3: guide-data.js 导览**

disp 模块 menus 中 `assignQ` 行之后插入：

```js
        rxExc:       { desc: '补绑日结·改绑纠错', cat: 'fix' },
```

disp 菜单 note 由 `'仅扫码 · 人工通道规划中'` 改为 `'扫码为主 · 手动补绑兜底'`。

- [ ] **Step 4: _t-guide.node.js 断言 6 同步**

`['pick', 'disp', 'wardSign']` 改为 `['pick', 'wardSign']`，行注释改为 `// 6) 「仅扫码·人工通道规划中」标注落在约定两处（pick/wardSign；disp 已于 T3 补手动补绑）`。

- [ ] **Step 5: plan.html / index.html 口径**

- plan.html 第 45 行：`10 大模块 77 项<br>已交付 53 · 待补 20 · 占位 3 · 预留 1` → `10 大模块 78 项<br>已交付 54 · 待补 20 · 占位 3 · 预留 1`
- plan.html 功能矩阵出库管理行：`<td>11</td>` → `<td>12</td>`，desc 尾部 `赋码占位、摆药三查询待补` → `手动补绑+异常台账已交付；赋码占位、摆药三查询待补`
- plan.html 出库管理卡片网格 disp 卡片之后插入：

```html
<a class="plan-page-card" href="rx-exc.html">
          <div class="plan-page-card-name">赋码异常台账</div>
          <div class="plan-page-card-desc">rx-exc.html · 补绑日结 · 改绑纠错 · 自主新增</div>
          <div class="plan-page-card-cta">进入 →</div>
        </a>
```

- index.html 第 61 行：`全部 10 大模块 77 项（已交付 53 项` → `全部 10 大模块 78 项（已交付 54 项`

- [ ] **Step 6: specs README 总映射表**

`specs/2026-09/pul-fms/README.md` 映射表 assignQ 行之后插入一行（列格式对齐现有行）：

```markdown
| 出库管理 | 赋码异常台账 | rxExc | rx-exc.html | （待写） | 🚧 |
```

- [ ] **Step 7: 全套校验**

Run:
```bash
node scripts/_t-guide.node.js
node scripts/_t-invariants.node.js
node scripts/_t-post-assign.node.js
cd ../../.. && node scripts/check-prd-menu-sync.js
```
（check-prd-menu-sync.js 若在别的路径，先 `ls ../../../scripts/` 定位。）
Expected: 导览 41+ 项全绿；不变量 passed；补绑全过；菜单 73 · PRD 15 · 无失配（rxExc 列待写）

- [ ] **Step 8: Commit**

```bash
git add scripts/app-shell.js scripts/data.js scripts/guide-data.js scripts/_t-guide.node.js plan.html index.html ../../../specs/2026-09/pul-fms/README.md
git commit -m "feat: 同步面——NAV/权限树/导览/plan 接入赋码异常台账（自主新增）"
```

---

### Task 8: 浏览器截图验证（演示链路全走通）

**Files:** 无改动，只验证

- [ ] **Step 1: 起本地服务**

```bash
cd D:/Claude-code/PUL-FMS/PUL-FMS/prototypes && python -m http.server 9990
```

- [ ] **Step 2: Edge headless 截图（演示链：发药中补绑 → 台账复核）**

```bash
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
OUT="$(pwd -W)/2026-09/pul-fms-base-v1/_shots"
"$EDGE" --headless=new --user-data-dir="$(pwd -W)/_shots/.prof-$RANDOM" --window-size=1440,900 --screenshot="$OUT/rx-exc.png" "http://localhost:9990/2026-09/pul-fms-base-v1/rx-exc.html"
"$EDGE" --headless=new --user-data-dir="$(pwd -W)/_shots/.prof-$RANDOM" --window-size=1440,900 --screenshot="$OUT/disp-t3.png" "http://localhost:9990/2026-09/pul-fms-base-v1/disp.html"
"$EDGE" --headless=new --user-data-dir="$(pwd -W)/_shots/.prof-$RANDOM" --window-size=1440,900 --screenshot="$OUT/tray-t3.png" "http://localhost:9990/2026-09/pul-fms-base-v1/tray.html"
```

逐张肉眼走查：rx-exc 空态正常、侧边栏「赋码异常台账」带「新」chip、disp/tray 药品清单多「操作」列。
注意：headless 截图无法点击，交互链（HIS 拉取→开始发药→手动补绑→台账确认）用浏览器手测一次，或写 `_t-rx-exc.html` 自动点击测试页（沿用已删 `_t-wh-pick` 的模式）——本轮手测即可，截图只验渲染。

- [ ] **Step 3: Commit 截图说明（若有修复）**

```bash
git add -A && git commit -m "test: T3 三页 headless 截图走查"
```

---

### Task 9: 图 04 发药主流程加降级分支（fireworks）

**Files:**
- Modify: `../../../prototypes/shared/diagrams/fireworks/04-dispensing.json`（+ 重出 .svg/.html/.layout.json）

- [ ] **Step 1: 加载 fireworks-tech-graph skill，改图源**

调用 `Skill: fireworks-tech-graph`。对 `04-dispensing.json` 加降级分支：
- 「出库扫码 · 逐码确认 → 扣账」节点后加判断分支：「扫码失败 / 病区无扫码条件」→「手动补绑（系统推荐 + 人工选定）」→「赋码异常台账 · 日结复核」→ 汇合回发药完成
- 遵守军规：节点间隙 ≥40px、垂直/水平边两端节点中心对齐（防 EDGE_MICRO_SEGMENT）、容器出血 ≥20px、泳道标签写短词

- [ ] **Step 2: 渲染 + 几何校验 + 截图走查**

按 skill 流程 render + check：零交叉、`complete_text: true` 零截断；Python playwright 截图肉眼走查。

- [ ] **Step 3: Commit**

```bash
git add prototypes/shared/diagrams/fireworks/04-dispensing.*
git commit -m "docs: 图04 发药主流程加 T3 手动补绑降级分支"
```

---

### Task 10: rx-code-assign-flow 加补绑泳道 + 图 05/09 加注（fireworks）

**Files:**
- Modify: `../../../specs/2026-09/pul-fms/assets/rx-code-assign-flow.json`（+ 重出 .svg/.png）
- Modify: `../../../prototypes/shared/diagrams/fireworks/05-manual-ops.json`、`09-state-machine.json`

- [ ] **Step 1: rx-code-assign-flow 扩展**

现状只画「无码药造码」。加「有码未扫 → 手动补绑」分支：发药扫码失败/住院摆药无扫码条件 → 手动补绑（推荐：货位FEFO / FIFO）→ 异常台账日结（确认/改绑/关闭）→ 写追溯台账（bindType=manual）。同走 fireworks validate/render/check。

- [ ] **Step 2: 图 05 加一行**

`05-manual-ops.json` 人工维护入口加一行：「发药补绑 / 赋码异常台账（rx-exc 页）」→「单据 + 码清单（DOC_CODE）」，sublabel「补绑·复核·改绑」。

- [ ] **Step 3: 图 09 加脚注**

`09-state-machine.json` 加脚注文本节点：「绑定带核验维度：扫码核验 / 手动补绑（待复核）/ 已复核——状态机不变」。

- [ ] **Step 4: 渲染校验 + 截图走查 + Commit**

三张图 render + check 零交叉零截断，截图走查后：

```bash
git add specs/2026-09/pul-fms/assets/rx-code-assign-flow.* prototypes/shared/diagrams/fireworks/05-manual-ops.* prototypes/shared/diagrams/fireworks/09-state-machine.*
git commit -m "docs: 赋码流程图加手动补绑泳道；图05/09 补绑入口与核验维度加注"
```

---

### Task 11: PRD 合并稿 assign.md

**Files:**
- Create: `../../../specs/2026-09/pul-fms/05-rx/assign.md`

- [ ] **Step 1: 合并写 PRD**

以 `specs/2026-09/20260926-rx-code-assign-prd-preview.md`（V0.2，无码药造码）为底，版本升 V1.0，合并 T3 设计。frontmatter：

```yaml
---
menu_key: assign
menu_group: 出库管理
menu_sub: ''
menu_name: 处方取药赋码
prototype: disp.html / tray.html / rx-exc.html
script: scripts/rx-data.js / scripts/rx-bind.js / scripts/rx-exc.js
template: flow
status: md
---
```

结构与改动：
- 一、背景：保留 V0.2 三痛点，新增痛点 4「扫码失败卡流程」——门诊扫不出/住院无扫码条件时发药被卡，药必须发得出
- 二、用户故事：保留 US1-US3，新增 US4（P1）手动补绑不卡流程（独立验收：含扫码失败的处方可走补绑完成发药并入台账）、US5（P2）异常台账日结复核（独立验收：补绑记录当日可确认/改绑/关闭，超时升级提醒）
- 三、方案概述：核心一句话改为「T1 事前批量赋码 / T2 事中扫码 / T3 事后手动补绑 三时点全覆盖，异常日结闭环」；流程图更新为新的 rx-code-assign-flow.svg；流程节点表加 3 行（扫码失败降级→手动补绑→台账日结）
- 四、功能需求：保留 4.1/4.2/4.3，新增：
  - **4.4 手动补绑（T3）**：入口（disp 发药中行内按钮 / tray 摆药中行内按钮 + 「完成摆药·事后补绑」）、推荐规则（药柜=货位序→FEFO→入库先后；非药柜=FIFO）、字段（补绑原因下拉：扫码失败/码不符/住院后置；候选码清单勾选不得超剩余应发数）、核验标记（bindType=manual，verified：待复核/已复核）、空态（在架无码→引导走 4.1 造码）
  - **4.5 赋码异常台账（rx-exc）**：字段清单（异常单号/类型/来源单据/药品/补绑码/推荐规则/操作人/时间/状态）、状态机（待补绑→待复核→已确认/已改绑/已关闭）、日结制（当日班后复核，超 24h 升级院区管理员）、三动作语义（确认=verified 转已复核；改绑=旧码回架+绑新码+记录 oldCode；关闭=药已退等码池不动）
- 边界与异常：保留 1-6，新增 7（补绑后退药走既有退药流程解绑回架，台账记录关闭留痕）、8（HIS 撤销分时点：未发药放锁解绑回架/已发药转退药）、9（绑错双通道：台账改绑 + 盘点差异提示）、10（门诊补绑当下同步完成，结算时已有码，不碰医保「先扫码后结算」红线）
- Non-Goals：加「自动化补绑引擎（后续迭代）」「医保冲正接口」
- 开放问题：保留 1-3，加「4. 门诊补绑码上传医保是否带未实物核验口径（待医保办）」「5. 异常台账为自主新增菜单，需向客户报备」
- 假设清单：保留并加「[假设] 补绑推荐规则与药柜物理顺序一致时账实命中率最高，残余差异由盘点校准（见 4.4）」

- [ ] **Step 2: 校验 + Commit**

Run: `cd specs/2026-09/pul-fms` 上一级仓库根 `node scripts/check-prd-menu-sync.js`
Expected: 无失配，PRD 计数 15→16
README 映射表 assign 行状态 🚧→✅（prototype 列同步填 disp/tray/rx-exc）。

```bash
git add specs/2026-09/pul-fms/05-rx/assign.md specs/2026-09/pul-fms/README.md
git commit -m "docs: 赋码 PRD V1.0 合并稿——无码造码 + T3 手动补绑 + 异常台账"
```

---

### Task 12: 领用出库单 pickOut（参考老系统截图，用户 2026-09-30 追加）

> 参考：老系统「领用出库」截图——上=单据列表（单据编号/出库库房/领用药房/上架货位/状态/单据日期筛选 + 新增单据），下=码详情/药品清单/无库存码三页签。数据用现有 `wh.pickDocs ⋈ reqPool`，审核逻辑不重复实现（唯一源在 wh-pick，本页跳转）。

**Files:**
- Create: `wh-pick-out.html`
- Create: `scripts/wh-pick-out.js`
- Modify: `scripts/app-shell.js`、`scripts/data.js`、`scripts/guide-data.js`、`plan.html`、`index.html`、`../../../specs/2026-09/pul-fms/README.md`

- [ ] **Step 1: 新建 scripts/wh-pick-out.js**

```js
/**
 * wh-pick-out.js — 领用出库单（对齐老系统）：上=出库单列表（筛选+新增+审核跳转），下=码详情/药品清单/无库存码
 * 数据：wh.pickDocs ⋈ reqPool（reqNo→申请明细）；审核出库唯一源在 wh-pick（本页 ✓ 跳转载货）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pickOut', crumb: ['库房管理', '领用出库单'] });
  if (!content) return;

  var W = window.PUL_WH, R = window.PUL_RX, UI = window.PchUI, esc = UI.esc;
  var wh = W.load();
  var sel = new URLSearchParams(location.search).get('billNo') || null;
  var dtab = 'drug';
  var f = { billNo: '', pharmacy: '', loc: '', status: '', d1: '', d2: '' };

  function save() { W.save(wh); }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function curNode() { return (window.store.load().currentUser || {}).node || '中心库'; }
  function curUser() { return (window.store.load().currentUser || {}).name || '演示员'; }
  function drug(dc) { return R.drugOf(dc) || {}; }
  function drugName(dc) { return drug(dc).drugName || dc; }
  function reqOf(d) {
    var req = null;
    (wh.reqPool || []).forEach(function (r) { if (r.reqNo === d.reqNo) req = r; });
    return req;
  }
  function stText(st) { return st === '备货中' ? '待出库' : st; }
  function stHtml(st) {
    if (st === '药房已入库') return '<span class="pch-light ok"><i class="pch-dot"></i>药房已入库</span>';
    if (st === '已出库') return '<span class="pch-light" style="color:#206bc4;"><i class="pch-dot" style="background:#206bc4;"></i>已出库</span>';
    return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待出库</span>';
  }
  function locOf(d) {
    var locs = [];
    (d.codes || []).forEach(function (c) { if (c.expectLoc && locs.indexOf(c.expectLoc) < 0) locs.push(c.expectLoc); });
    var req = reqOf(d);
    if (req) (req.items || []).forEach(function (it) { if (it.slot && locs.indexOf(it.slot) < 0) locs.push(it.slot); });
    return locs.join('、') || '-';
  }
  function pharmacyOpts() {
    var names = [];
    try {
      (window.PUL_FACILITY.load().pharmacies || []).forEach(function (p) { if (names.indexOf(p.name) < 0) names.push(p.name); });
    } catch (e) { /* facility 缺失时退回单据出现过的药房 */ }
    (wh.pickDocs || []).forEach(function (d) { if (d.pharmacy && names.indexOf(d.pharmacy) < 0) names.push(d.pharmacy); });
    return names;
  }
  function locOpts() {
    var locs = [];
    (wh.pickDocs || []).forEach(function (d) {
      (d.codes || []).forEach(function (c) { if (c.expectLoc && locs.indexOf(c.expectLoc) < 0) locs.push(c.expectLoc); });
    });
    return locs;
  }
  function list() {
    return (wh.pickDocs || []).filter(function (d) {
      if (d.warehouse !== curNode()) return false;
      if (f.billNo && d.billNo.indexOf(f.billNo) === -1) return false;
      if (f.pharmacy && d.pharmacy !== f.pharmacy) return false;
      if (f.loc && locOf(d).indexOf(f.loc) === -1) return false;
      if (f.status && stText(d.status) !== f.status) return false;
      var day = (d.date || '').slice(0, 10);
      if (f.d1 && day < f.d1) return false;
      if (f.d2 && day > f.d2) return false;
      return true;
    });
  }
  function selDoc() {
    var hit = null;
    (wh.pickDocs || []).forEach(function (d) { if (d.billNo === sel) hit = d; });
    return hit;
  }

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fNo" style="width:170px;" placeholder="单据编号" value="' + esc(f.billNo) + '">' +
      '<span class="text-secondary" style="font-size:12.5px;">出库库房</span>' +
      '<input class="form-control" style="width:110px;" value="' + esc(curNode()) + '" disabled>' +
      '<select class="form-select" id="fPh" style="width:130px;"><option value="">领用药房：全部</option>' +
      pharmacyOpts().map(function (p) { return '<option' + (f.pharmacy === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select>' +
      '<select class="form-select" id="fLoc" style="width:130px;"><option value="">上架货位：全部</option>' +
      locOpts().map(function (l) { return '<option' + (f.loc === l ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>' +
      '<select class="form-select" id="fSt" style="width:110px;"><option value="">状态：全部</option>' +
      ['待出库', '已出库', '药房已入库'].map(function (s) { return '<option' + (f.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<input type="date" class="form-control" id="fD1" style="width:150px;" value="' + esc(f.d1) + '">' +
      '<span class="text-secondary">-</span>' +
      '<input type="date" class="form-control" id="fD2" style="width:150px;" value="' + esc(f.d2) + '">' +
      '<button class="btn btn-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-success" id="btnNew">+ 新增单据</button></div>' +
      '</div></div></div>';
  }

  function docsCard() {
    var rows = list().map(function (d, i) {
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(d.billNo) + '</b></td>' +
        '<td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td>' + esc(d.warehouse) + '</td><td>' + esc(d.pharmacy || '—') + '</td>' +
        '<td>' + esc(locOf(d)) + '</td><td>' + esc(d.operator || '-') + '</td>' +
        '<td><span class="badge ' + (d.reqNo ? 'bg-azure-lt' : 'bg-purple-lt') + '">' + (d.reqNo ? '领用申请' : '一步式') + '</span></td>' +
        '<td>' + stHtml(d.status) + '</td>' +
        '<td onclick="event.stopPropagation()">' + ops(d) + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="10" class="text-center text-secondary" style="padding:28px;">无出库单——点右上「+ 新增单据」或到「领用备货单」备货生成</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据时间</th><th>出库库房</th><th>领用药房</th><th>上架货位</th><th>创建人</th><th>单据来源</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }
  function ops(d) {
    if (d.status === '备货中') {
      return '<a class="btn btn-sm btn-success" href="wh-pick.html?billNo=' + encodeURIComponent(d.billNo) + '" title="跳转领用备货单完成审核出库">✓ 审核出库</a> ' +
        '<button class="btn btn-sm btn-outline-danger" data-void="' + esc(d.billNo) + '">✗ 作废</button>';
    }
    return '<span class="text-secondary" style="font-size:12.5px;">' + esc(d.auditTime || '') + '</span>';
  }

  // —— 明细三页签 ——
  function drugRows(d) {
    var req = reqOf(d);
    if (req) {
      return (req.items || []).map(function (it, i) {
        var dcs = (d.codes || []).filter(function (c) {
          var p = R.parse(c.code);
          return p.dict && p.dict.drugCode === it.drugCode;
        });
        var whole = dcs.filter(function (c) { return c.split !== '是'; }).length;
        var splitQty = 0;
        dcs.forEach(function (c) { if (c.split === '是') splitQty += parseInt(c.splitQty || '0', 10); });
        var dg = drug(it.drugCode);
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.slot || '—') + '</td>' +
          '<td><b>' + esc(dg.drugName || it.drugCode) + '</b></td><td class="text-secondary">' + esc(dg.formSpec || '') + '</td>' +
          '<td>' + whole + '</td><td>' + (splitQty || '') + '</td><td>' + esc(dg.baseUnit || '') + '</td>' +
          '<td>' + it.qty + '</td><td>0</td>' +
          '<td class="text-secondary">' + esc(dg.maker || '-') + '</td>' +
          '<td class="text-secondary">' + esc(dg.approval || '-') + '</td>' +
          '<td>' + esc(it.drugCode) + '</td>' +
          '<td><button class="btn btn-sm btn-outline-primary" data-codes="' + esc(it.drugCode) + '">码列表</button></td></tr>';
      }).join('');
    }
    // 一步式：无申请单，从 codes 聚合
    var map = {};
    (d.codes || []).forEach(function (c) {
      var p = R.parse(c.code);
      var dc = p.dict ? p.dict.drugCode : '';
      if (!dc) return;
      if (!map[dc]) map[dc] = { drugCode: dc, whole: 0, splitQty: 0 };
      if (c.split === '是') map[dc].splitQty += parseInt(c.splitQty || '0', 10);
      else map[dc].whole += 1;
    });
    return Object.keys(map).map(function (dc, i) {
      var m = map[dc], dg = drug(dc);
      return '<tr><td>' + (i + 1) + '</td><td>—</td>' +
        '<td><b>' + esc(dg.drugName || dc) + '</b></td><td class="text-secondary">' + esc(dg.formSpec || '') + '</td>' +
        '<td>' + m.whole + '</td><td>' + (m.splitQty || '') + '</td><td>' + esc(dg.baseUnit || '') + '</td>' +
        '<td>' + m.whole + '</td><td>' + m.splitQty + '</td>' +
        '<td class="text-secondary">' + esc(dg.maker || '-') + '</td>' +
        '<td class="text-secondary">' + esc(dg.approval || '-') + '</td>' +
        '<td>' + esc(dc) + '</td>' +
        '<td><button class="btn btn-sm btn-outline-primary" data-codes="' + esc(dc) + '">码列表</button></td></tr>';
    }).join('');
  }
  function detailCard() {
    var d = selDoc();
    if (!d) return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点选上方单据行，查看码详情 / 药品清单 / 无库存码</div></div>';
    var body = '';
    if (dtab === 'code') {
      var rows = (d.codes || []).map(function (c, i) {
        var p = R.parse(c.code);
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
          '<td>' + esc(p.dict ? p.dict.drugName : '—') + '</td><td>' + esc(c.batch || '—') + '</td>' +
          '<td>' + esc(c.expDate || '—') + '</td><td>' + esc(c.expectLoc || '—') + '</td>' +
          '<td>' + esc(c.phLoc || '待上架') + '</td></tr>';
      }).join('');
      if (!rows) rows = '<tr><td colspan="7" class="text-center text-secondary">尚未扫码</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>预期货位</th><th>上架货位</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    } else if (dtab === 'drug') {
      var rows2 = drugRows(d);
      if (!rows2) rows2 = '<tr><td colspan="13" class="text-center text-secondary">无药品明细</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>取药槽编码</th><th>药名通用名</th><th>药品规格</th><th>扫码数量</th><th>扫码零头</th><th>单位</th><th>实物数量</th><th>实物零头</th><th>生产厂家</th><th>批准文号</th><th>药品编码</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows2 + '</tbody></table></div>';
    } else {
      body = '<div class="card-body text-center text-secondary" style="padding:28px;">本单无无库存码——非在架码在备货扫码时已被拦截，此处保留页签对齐老系统。</div>';
    }
    return '<div class="card">' +
      UI.tabsHeader([
        { key: 'code', name: '码详情', badge: (d.codes || []).length || '' },
        { key: 'drug', name: '药品清单' },
        { key: 'nocode', name: '无库存码' }
      ], dtab) + body + '</div>';
  }

  function openNew() {
    var body = '<div class="mb-3"><label class="form-label">领用药房 <span class="text-danger">*</span></label>' +
      '<select class="form-select" id="newPh">' +
      pharmacyOpts().map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('') + '</select></div>' +
      '<div class="mb-2"><label class="form-label">备注</label><input class="form-control" id="newRemark" placeholder="选填"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">保存后生成「待出库」空单，请到「领用备货单」扫码备货并审核出库。</div>';
    UI.modalShell('pkNew', '新增领用出库单', body,
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="newOk">保存</button>', 520);
    var el = UI.open('pkNew');
    el.querySelector('#newOk').addEventListener('click', function () {
      var ph = el.querySelector('#newPh').value;
      if (!ph) { window.showToast('请选择领用药房'); return; }
      var billNo = W.nextNo('LYCK', wh.pickDocs, 'billNo');
      wh.pickDocs.unshift({
        billNo: billNo, reqNo: '', date: W.now(), pharmacy: ph, warehouse: curNode(),
        status: '备货中', codes: [], operator: curUser(), remark: el.querySelector('#newRemark').value.trim()
      });
      save(); UI.close('pkNew');
      sel = billNo; renderAll();
      window.showToast('已生成 ' + billNo + '（待出库），请到领用备货单备货');
    });
  }
  function voidDoc(d) {
    if ((d.codes || []).length) { window.showToast('已有扫码明细，请到「领用备货单」处理'); return; }
    UI.confirm('作废 <b>' + esc(d.billNo) + '</b>？空单直接删除，不影响库存。', function () {
      wh.pickDocs = wh.pickDocs.filter(function (x) { return x.billNo !== d.billNo; });
      if (sel === d.billNo) sel = null;
      save(); renderAll();
      window.showToast('已作废');
    }, '确认作废');
  }
  function openCodes(drugCode) {
    var d = selDoc();
    if (!d) return;
    var rows = (d.codes || []).filter(function (c) {
      var p = R.parse(c.code);
      return p.dict && p.dict.drugCode === drugCode;
    }).map(function (c) {
      return '<tr><td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td>' + esc(c.batch || '—') + '</td><td>' + esc(c.expDate || '—') + '</td><td>' + esc(c.expectLoc || '—') + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="4" class="text-center text-secondary">该药尚未扫码</td></tr>';
    UI.modalShell('pkCodes', '码列表 · ' + drugName(drugCode) + ' · ' + d.billNo,
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>追溯码</th><th>批次</th><th>效期</th><th>预期货位</th></tr></thead><tbody>' + rows + '</tbody></table></div>',
      '<button class="btn btn-outline-secondary" data-mclose>关闭</button>', 720);
    UI.open('pkCodes');
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + detailCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      f = { billNo: v('fNo'), pharmacy: v('fPh'), loc: v('fLoc'), status: v('fSt'), d1: v('fD1'), d2: v('fD2') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      f = { billNo: '', pharmacy: '', loc: '', status: '', d1: '', d2: '' }; renderAll();
    });
    document.getElementById('btnNew').addEventListener('click', openNew);
    content.querySelectorAll('[data-ptab]').forEach(function (b) {
      b.addEventListener('click', function () { dtab = b.getAttribute('data-ptab'); renderAll(); });
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-void]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = null;
        (wh.pickDocs || []).forEach(function (x) { if (x.billNo === b.getAttribute('data-void')) d = x; });
        if (d) voidDoc(d);
      });
    });
    content.querySelectorAll('[data-codes]').forEach(function (b) {
      b.addEventListener('click', function () { openCodes(b.getAttribute('data-codes')); });
    });
  }

  if (!sel && list().length) sel = list()[0].billNo;
  renderAll();
})();
```

- [ ] **Step 2: 新建 wh-pick-out.html**

复制 `disp.html` 骨架，改：`<title>领用出库单 · PUL-FMS</title>`、`pi-title` 领用出库单、`pi-subtitle`「原型页 · 对齐老系统：出库单列表 + 码详情/药品清单/无库存码」、intro 弹窗（角色=库管员；步骤：筛选单据→点选看明细→待出库单 ✓ 跳领用备货单审核；场景呼应：单据来源=领用申请/一步式）、脚本引用 store/data/drug-data/purchase-data/purchase-shared/wh-data/rx-data/facility-data/app-shell/wh-pick-out。

- [ ] **Step 3: 同步面**

- `scripts/app-shell.js` NAV：`{ key: 'pickOut', name: '领用出库单', icon: 'box', href: null, badge: '待补' }` → `href: 'wh-pick-out.html'` 去 badge
- `scripts/data.js` MENU_TREE：pickOut 行 name 去「（待补）」，ops `['查看', '新增', '审核']`；PERM_MAP `KEEPER` 加 `pickOut: ['查看','新增','审核'],`（无此行则新增）
- `scripts/guide-data.js` wh 模块 menus 的 pickOut 条目 desc 改「出库单台账·审核跳转」（保留原 cat）
- `plan.html`：头部口径 `已交付 54 · 待补 20` → `已交付 55 · 待补 19`（Task 7 已改 53→54，本任务再接）；库房管理矩阵行 `<td>6</td>` → `<td>7</td>`，desc 去掉「领用出库单待补」；库房管理卡片网格加卡：

```html
<a class="plan-page-card" href="wh-pick-out.html">
          <div class="plan-page-card-name">领用出库单</div>
          <div class="plan-page-card-desc">wh-pick-out.html · 出库单台账 + 三页签明细</div>
          <div class="plan-page-card-cta">进入 →</div>
        </a>
```

- `index.html` lead：`已交付 54 项` → `已交付 55 项`
- specs README 映射表 pickOut 行：prototype 列填 `wh-pick-out.html`，状态 🚧→待写 PRD（菜单已交付）

- [ ] **Step 4: 验证**

Run:
```bash
node --check scripts/wh-pick-out.js
node scripts/_t-guide.node.js
node scripts/_t-invariants.node.js
node scripts/_t-post-assign.node.js
cd ../../.. && node scripts/check-prd-menu-sync.js
```
Expected: 全绿；菜单总数不变（pickOut 原已在 NAV，仅接通 href）
截图：Edge headless 截 `wh-pick-out.html` 走查列表+三页签。

- [ ] **Step 5: Commit**

```bash
git add wh-pick-out.html scripts/wh-pick-out.js scripts/app-shell.js scripts/data.js scripts/guide-data.js plan.html index.html ../../../specs/2026-09/pul-fms/README.md
git commit -m "feat: 领用出库单页（对齐老系统：筛选+新增+审核跳转+码详情/药品清单/无库存码）"
```

---

### Task 13: 部署 + 线上复核

- [ ] **Step 1: 部署**

```bash
cd D:/Claude-code/PUL-FMS/PUL-FMS && npm run deploy
```

- [ ] **Step 2: curl 内容复核（nginx 对不存在路径兜底 200，必须 grep 内容）**

```bash
curl -s http://youkailong.cn/pul-fms/prototypes/2026-09/pul-fms-base-v1/scripts/rx-data.js | grep -c bindManual   # ≥1
curl -s http://youkailong.cn/pul-fms/prototypes/2026-09/pul-fms-base-v1/rx-exc.html | grep -c "赋码异常台账"      # ≥1
curl -s http://youkailong.cn/pul-fms/prototypes/2026-09/pul-fms-base-v1/scripts/app-shell.js | grep -c rxExc     # ≥1
```

- [ ] **Step 3: Commit + 记忆回写**

更新 `memory/pul-fms-prototype-state.md`（新增 Round Z 节：T3 手动补绑交付清单 + 验证结果），`docs/decisions/2026-09/` 落决策文件（可并入选型记录）。

---

## Self-Review 记录

- **Spec 覆盖**：§3.1 触发流转→Task 3/4；§3.2 选码规则→Task 1 bindSuggest；§3.3 核验维度→Task 1/6；§4 台账→Task 5；§5 R3-R7→Task 1（closeExc/rebindExc）+ Task 6（盘点提示）+ PRD 4.5 边界；§6 图纸→Task 9/10；§7 改动面→Task 2-7；PRD 合并→Task 11。✅
- **类型一致**：`bindManual(wh,state,pharmacy,refKind,refNo,drugCode,codeStr,opts)`、`RxBind.open/rebind` 的 opts 键在 Task 1/2/3/4/5 间一致；`excPendingFor` 返回记录或 null，tray.js 用 `pend ? pend.excNo : undefined` 传递。✅
- **已知取舍**：补绑只绑整码不绑拆零（拆零走豁免通道）；已完成摆药单补绑靠行内按钮而非单据级批操作（YAGNI，演示够用）。
- **pickOut（Task 12，用户追加）**：审核逻辑不复制，✓ 跳 wh-pick 载货（DRY）；无库存码页签恒空仅对齐老系统版式；新增单据只生成空单，备货仍在 wh-pick。
