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
var C_OTHER = '84619350000000010001'; // 依姆多（YP010245），用于错药码拦截
var C_SPLIT = '84169170000000010005'; // 唯可来拆零码，用于拆零拦截
var C_N3  = '84169170000000020006'; // 无货位，入库单晚，用于同 excNo 连绑第二码
function c(code, extra) {
  return Object.assign({ code: code, level: 1, split: '否', splitQty: '',
    batch: '250603', prodDate: '2025-06-15', expDate: '2028-06-14', checked: true, phLoc: '' }, extra || {});
}
var wh = W.load();
wh.pickDocs = [
  { billNo: 'LY20260920001', status: '已入库', pharmacy: '门诊药房', date: '2026-09-20 09:00',
    codes: [c(C_N1), c(C_M01, { phLoc: 'M-01', expDate: '2027-01-01' }),
      c(C_OTHER), c(C_SPLIT, { split: '是', splitQty: '10' })] },
  { billNo: 'LY20260925001', status: '已入库', pharmacy: '门诊药房', date: '2026-09-25 09:00',
    codes: [c(C_N2), c(C_N3), c(C_M02, { phLoc: 'M-02', expDate: '2028-06-14' })] }
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
eq('推荐顺序', sug, [C_M01, C_M02, C_N1, C_N2, C_N3]);

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

console.log('# bindManual 拦截补强：错药码 / 拆零码');
var rBadDrug = R.bindManual(wh, S, '门诊药房', 'rx', 'CF-T1', dc, C_OTHER, {});
ok('错药码拦截', !rBadDrug.ok && rBadDrug.msg.indexOf('码与药品不符') >= 0);
var rSplit = R.bindManual(wh, S, '门诊药房', 'rx', 'CF-T1', dc, C_SPLIT, {});
ok('拆零码拦截', !rSplit.ok && rSplit.msg.indexOf('拆零') >= 0);
eq('拦截后未污染绑定列表', S.rxDocs[0].items[0].codes.length, 2);
eq('错药码/拆零码仍在架', [C_OTHER, C_SPLIT].map(function (x) {
  return W.pharmacyStock(wh, '门诊药房').some(function (y) { return y.code === x; });
}), [true, true]);

console.log('# excNo 路径：非待补绑不拦截，新建台账记录');
var lenBefore = S.excDocs.length;
var rGuard = R.bindManual(wh, S, '门诊药房', 'rx', 'CF-T1', dc, C_M02, { excNo: excNo });
ok('已确认记录传 excNo 仍绑上', rGuard.ok);
R.save(S);
eq('原已确认记录不被改动', [R.excOf(S, excNo).status, R.excOf(S, excNo).code], ['已确认', C_M01]);
eq('新增一条待复核记录', [S.excDocs.length, S.excDocs[0].status, S.excDocs[0].code], [lenBefore + 1, '待复核', C_M02]);

console.log('# 同一待补绑 excNo 连续绑 2 码');
var pend2 = R.makeExc(S, { type: '住院后置', refKind: 'rx', refNo: 'CF-T1', pharmacy: '门诊药房', drugCode: dc, status: '待补绑', operator: '陈静' });
var len2 = S.excDocs.length;
var m1 = R.bindManual(wh, S, '门诊药房', 'rx', 'CF-T1', dc, C_N1, { excNo: pend2.excNo });
ok('首码更新待补绑记录', m1.ok && m1.excNo === pend2.excNo);
eq('首码后原记录转待复核', [pend2.status, pend2.code], ['待复核', C_N1]);
var m2 = R.bindManual(wh, S, '门诊药房', 'rx', 'CF-T1', dc, C_N3, { excNo: pend2.excNo });
ok('次码不被拦截', m2.ok);
ok('次码新建记录', m2.excNo !== pend2.excNo);
R.save(S);
eq('两码净增 1 条台账', S.excDocs.length, len2 + 1);

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
