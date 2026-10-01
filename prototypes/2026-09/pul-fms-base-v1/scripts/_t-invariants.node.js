/**
 * 库存不变量：拆零不扣整码 / 按节点+过账单扣账 / 过期停用冻结
 * 跑：node scripts/_t-invariants.node.js（在 pul-fms-base-v1 目录）
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
load('inv-data.js');
load('ledger-data.js');

var W = window.PUL_WH;
var R = window.PUL_RX;
var failed = 0;
function eq(name, got, exp) {
  var g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g === e) {
    console.log('  ok  ' + name);
  } else {
    failed++;
    console.log('  FAIL ' + name + '\n       got ' + g + '\n       exp ' + e);
  }
}
function ok(name, cond) {
  if (cond) console.log('  ok  ' + name);
  else { failed++; console.log('  FAIL ' + name); }
}

var CODE_A = '8461935999000018000';
var CODE_B = '8416917999000018000';
function c(code, extra) {
  return Object.assign({ code: code, level: 1, split: '否', splitQty: '',
    batch: '250603', prodDate: '2025-06-15', expDate: '2028-06-14', checked: true, location: 'A-01' }, extra || {});
}

console.log('# stockAll 按节点 + 过账');
var pch = {
  inDocs: [
    { audit: '已审核', warehouse: '中心库', codes: [c(CODE_A)] },
    { audit: '已审核', warehouse: '分院库（东）', codes: [c(CODE_B)] }
  ],
  outDocs: []
};
var wh = {
  othInDocs: [], retInDocs: [], othOutDocs: [], lossDocs: [],
  pickDocs: [{ status: '备货中', warehouse: '中心库', codes: [c(CODE_A)] }]
};
var zx = W.stockAll(pch, wh, '中心库').map(function (x) { return x.code; });
ok('中心库看不到分院码', zx.indexOf(CODE_B) < 0);
ok('未过账领用备货不扣在架', zx.indexOf(CODE_A) >= 0);
wh.pickDocs[0].status = '已出库';
zx = W.stockAll(pch, wh, '中心库').map(function (x) { return x.code; });
ok('已出库才扣在架', zx.indexOf(CODE_A) < 0);

console.log('# 拆零不扣整码');
var pickIn = {
  billNo: 'LYCK1', status: '药房已入库', pharmacy: '门诊药房', warehouse: '中心库',
  codes: [c(CODE_A)]
};
var wh2 = { pickDocs: [pickIn], retPool: [], phLossDocs: [] };
window.store.update({
  rx: {
    rxDocs: [{
      status: '已完成', pharmacy: '门诊药房',
      items: [{ drugCode: 'YP010245', qty: 1, codes: [c(CODE_A, { split: '是', splitQty: '1' })] }]
    }],
    trayDocs: []
  }
});
var ph = W.pharmacyStock(wh2, '门诊药房');
ok('拆 1 片码仍在药房在架', ph.some(function (x) { return x.code === CODE_A; }));
var opened = ph.filter(function (x) { return x.code === CODE_A; })[0];
ok('在架码带剩余片', opened && opened.splitRemain === 6);

window.store.update({
  rx: {
    rxDocs: [{
      status: '已完成', pharmacy: '门诊药房',
      items: [{ drugCode: 'YP010245', qty: 1, codes: [c(CODE_A, { split: '是', splitQty: '7' })] }]
    }],
    trayDocs: []
  }
});
ph = W.pharmacyStock(wh2, '门诊药房');
ok('拆尽才离架', !ph.some(function (x) { return x.code === CODE_A; }));

ok('itemDone 不计拆零码', !R.itemDone({ qty: 1, codes: [c(CODE_A, { split: '是', splitQty: '1' })] }));
ok('itemDone 整盒码算完成', R.itemDone({ qty: 1, codes: [c(CODE_A)] }));

console.log('# 过期 / 停用 / 冻结');
ok('blockMove 存在', typeof W.blockMove === 'function');
if (typeof W.blockMove === 'function') {
  eq('过期出库拦截', W.blockMove(CODE_A, '中心库', 'out', { expDate: '2026-01-01' }), '过期码禁止出库/发药');
  eq('过期损耗放行', W.blockMove(CODE_A, '中心库', 'loss', { expDate: '2026-01-01' }), '');
  var ds = window.PUL_DRUG.load();
  var ic = window.PUL_DRUG.idcodeOf(ds, '8461935');
  var old = ic.status;
  ic.status = '停用';
  window.PUL_DRUG.save(ds);
  eq('停用标识码拦截', W.blockMove(CODE_A, '中心库', 'out', { expDate: '2028-06-14' }), '标识码已停用');
  ic.status = old;
  window.PUL_DRUG.save(ds);
  window.store.update({ inv: { countDocs: [{ node: '中心库', status: '未审核' }] } });
  eq('盘点冻结拦截', W.blockMove(CODE_A, '中心库', 'out', { expDate: '2028-06-14' }), '本节点盘点中，禁止出入库');
  eq('盘点页自己不拦', W.blockMove(CODE_A, '中心库', 'count', { expDate: '2028-06-14' }), '');
  window.store.update({ inv: { countDocs: [] } });
}

console.log('# ledger 不含备货中草稿（2026-10-01 备货草稿态统一）');
window.store.update({ wh: {
  pickDocs: [
    { billNo: 'LYCK-DRAFT1', status: '备货中', warehouse: '中心库', pharmacy: '门诊药房', date: '2026-10-01 09:00', codes: [c(CODE_A)] },
    { billNo: 'LYCK-POST1', status: '已出库', warehouse: '中心库', pharmacy: '门诊药房', date: '2026-10-01 10:00', auditTime: '2026-10-01 10:05', codes: [c(CODE_B)] }
  ],
  retInDocs: [], othInDocs: [], othOutDocs: [], lossDocs: [], retPool: [], phLossDocs: [],
  reqPool: [{ reqNo: 'LY-T1', date: '2026-10-01 08:00', pharmacy: '门诊药房', warehouse: '中心库', items: [], status: '待备货' }]
} });
var evs = window.PUL_LEDGER.collect();
ok('备货中草稿不进流水', !evs.some(function (e) { return e.billNo === 'LYCK-DRAFT1'; }));
ok('已出库进流水', evs.some(function (e) { return e.billNo === 'LYCK-POST1'; }));

console.log('# reqPool migrate 补 source');
var whMig = W.load();
eq('无 source 老数据兜底药房申请', whMig.reqPool[0] && whMig.reqPool[0].source, '药房申请');

if (failed) {
  console.log('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nall passed');
