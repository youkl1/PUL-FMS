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
load('facility-data.js');
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

console.log('# 药品字典 /api/DM_DrugInfo 必填字段（2026-10-16）');
var DRUG_REQUIRED = ['drugCode', 'medCode', 'drugName', 'medListCodg', 'minPackUnit', 'formSpec', 'dosForm',
  'dosageUnit', 'saleUnit', 'priceUnitType', 'minPackQty', 'approval', 'maker', 'supCode', 'supName', 'rxFlag',
  'price', 'retailPrice', 'storeCode', 'warehouse', 'coded', 'opUnpack', 'ipUnpack', 'drugcate', 'drugType',
  'status', 'medWhCode', 'medWhName', 'lastUpdateTime', 'tracUnit', 'tracRate', 'selUnTrac', 'meaUnit', 'meaRatio'];
function drugMissing(d) {
  return DRUG_REQUIRED.filter(function (k) { return d[k] === undefined || d[k] === null || d[k] === ''; })
    .map(function (k) { return d.drugCode + '.' + k; });
}
var drugSeed = window.PUL_DRUG.load();
eq('种子主表必填字段完整', drugSeed.drugs.reduce(function (a, d) { return a.concat(drugMissing(d)); }, []), []);
ok('一级标识码与包装规格完整', drugSeed.drugs.every(function (d) {
  return drugSeed.idcodes.some(function (c) { return c.drugCode === d.drugCode && +c.level === 1 && c.idcode && c.packSpec; });
}));
var legacyDrug = window.PUL_DRUG.normalizeDrug({ drugCode: 'OLD001' });
eq('老记录幂等补齐必填字段', drugMissing(legacyDrug), []);
var legacyMedCode = legacyDrug.medCode;
window.PUL_DRUG.normalizeDrug(legacyDrug);
eq('重复迁移不覆盖已补值', legacyDrug.medCode, legacyMedCode);

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
  pickDocs: [{ status: '待出库', warehouse: '中心库', codes: [c(CODE_A)] }]
};
var zx = W.stockAll(pch, wh, '中心库').map(function (x) { return x.code; });
ok('中心库看不到分院码', zx.indexOf(CODE_B) < 0);
ok('待出库未扣账不扣在架', zx.indexOf(CODE_A) >= 0);
wh.pickDocs[0].status = '已出库';
zx = W.stockAll(pch, wh, '中心库').map(function (x) { return x.code; });
ok('已出库才扣在架', zx.indexOf(CODE_A) < 0);

console.log('# 拆零不扣整码');
var pickIn = {
  billNo: 'LYCK1', status: '已入库', pharmacy: '门诊药房', warehouse: '中心库',
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

console.log('# ledger 不含待出库未过账单（2026-10-05 领用单五态统一）');
window.store.update({ wh: {
  pickDocs: [
    { billNo: 'LYCK-DRAFT1', status: '待出库', warehouse: '中心库', pharmacy: '门诊药房', date: '2026-10-01 09:00', codes: [c(CODE_A)] },
    { billNo: 'LYCK-POST1', status: '已出库', warehouse: '中心库', pharmacy: '门诊药房', date: '2026-10-01 10:00', outTime: '2026-10-01 10:05', codes: [c(CODE_B)] }
  ],
  retInDocs: [], othInDocs: [], othOutDocs: [], lossDocs: [], retPool: [], phLossDocs: []
} });
var evs = window.PUL_LEDGER.collect();
ok('待出库未过账不进流水', !evs.some(function (e) { return e.billNo === 'LYCK-DRAFT1'; }));
ok('已出库进流水', evs.some(function (e) { return e.billNo === 'LYCK-POST1'; }));

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
eq('老已出库→已出库', mT1 && mT1.status, '已出库');
eq('已完成申请并入既有单（items 回填）', mT1 && mT1.items && mT1.items.length, 1);
eq('并单后废除 reqNo 字段', mT1 && mT1.reqNo, undefined);
eq('并单 items docQty 按备齐回填', mT1 && mT1.items[0] && mT1.items[0].docQty, 2);
ok('并单 outTime 从 auditTime 回填', mT1 && mT1.outTime === '2026-10-01 10:05');
ok('无源待备货申请→新单待出库', mNew && mNew.status === '待出库' && mNew.source === '药房申请');
eq('新单 items 带 docQty=0', mNew && mNew.items[0] && mNew.items[0].docQty, 0);
eq('reqPool 已清空', mig.reqPool, []);
var mig2 = W.load();
eq('迁移幂等（单数不变）', mig2.pickDocs.length, mig.pickDocs.length);

console.log('# pickStatus 推导：已入库 且全码有 phLoc → 推导已上架（展示在独立上架状态列）');
ok('全码上架推导已上架', W.pickStatus({ status: '已入库', codes: [c(CODE_A, { phLoc: 'M-01' })] }) === '已上架');
ok('部分上架仍已入库', W.pickStatus({ status: '已入库', codes: [c(CODE_A, { phLoc: 'M-01' }), c(CODE_B)] }) === '已入库');
ok('空码单不推导已上架', W.pickStatus({ status: '已入库', codes: [] }) === '已入库');
eq('pickPosted 五态口径（词表 v3）', ['草稿', '待出库', '已出库', '已入库', '已作废'].map(function (s) {
  return W.pickPosted({ status: s });
}), [false, false, true, true, false]);

console.log('# OLD2NEW v3 迁移：旧复合词/旧词表 → 新五态（2026-10-08）');
var OLD2NEW = { '待提交': '草稿', '待备货': '待出库', '备货中': '待出库', '已出库·待入库': '已出库', '已出库': '已出库', '药房已入库': '已入库', '已入库·待上架': '已入库', '已完成': '已入库' };
var oldWords = ['待提交', '待备货', '备货中', '已出库·待入库', '药房已入库', '已入库·待上架', '已完成'];
var badMig = oldWords.filter(function (w) {
  var st = OLD2NEW[w];
  return !st || ['草稿', '待出库', '已出库', '已入库', '已作废'].indexOf(st) < 0;
});
ok('旧词映射全部落在五态内', badMig.length === 0);
eq('迁移后过账口径不变（已出库·待入库→已出库仍过账）', W.pickPosted({ status: OLD2NEW['已出库·待入库'] }), true);
eq('迁移后过账口径不变（已入库·待上架→已入库仍过账）', W.pickPosted({ status: OLD2NEW['已入库·待上架'] }), true);

console.log('# retPool migrate 补 refNo（2026-10-03 药房退回锚定领用出库单）');
window.store.update({ wh: {
  pickDocs: [], retInDocs: [], othInDocs: [], othOutDocs: [], lossDocs: [], reqPool: [], phLossDocs: [],
  retPool: [{ retNo: 'TH20260914001', codes: [] }, { retNo: 'TH20260999001', codes: [] }]
} });
var whMig2 = W.load();
eq('种子退回单回填来源出库单', whMig2.retPool[0].refNo, 'LYCK20260913001');
eq('无来源退回单兜底空串', whMig2.retPool[1].refNo, '');

// ===== Round AT（2026-10-05）：取药柜物理/逻辑 + 基站灯组 + 对照绑定 =====
console.log('# Round AT 设施字典种子完整性');
window.store.update({ facility: null });
var F = window.PUL_FACILITY;
var fs0 = F.load();
eq('灯组上限常量', F.MAX_LAMPS, 200);
ok('灯组全部平铺', fs0.lamps.length >= 9 && !fs0.stations.some(function (s) { return s.lamps; }));
ok('lamp.stationCode 引用合法', fs0.lamps.every(function (l) {
  return !l.stationCode || fs0.stations.some(function (s) { return s.code === l.stationCode; });
}));
eq('游离灯组可表达', F.looseLamps(fs0).length, 2);
var cb04 = F.cabinetOf(fs0, 'CB04');
ok('逻辑柜存在且仅 1 层', cb04 && cb04.ctype === '逻辑' && cb04.layers.length === 1);
ok('逻辑柜槽全部建槽即对照药品', cb04.layers[0].cells.every(function (cl) { return cl.drugCode && cl.drugName; }));
ok('逻辑柜槽均无灯组对照', cb04.layers[0].cells.every(function (cl) { return !cl.lampAddr; }));
ok('柜↔灯双向一致（种子）', fs0.cabinets.every(function (c) {
  return c.layers.every(function (l) {
    return l.cells.every(function (cl) {
      if (!cl.lampAddr) return true;
      var lp = F.findLamp(fs0, cl.lampAddr);
      return lp && lp.cellCode === cl.code;
    });
  });
}));

console.log('# Round AT v1→v2 迁移');
// 先置空再写旧版数据（store 为深合并，不置空会把旧数据并进带 v:2 的种子导致迁移被跳过）
window.store.update({ facility: null });
window.store.update({ facility: {
  warehouses: [], pharmacies: [],
  cabinets: [{ code: 'CBX', name: '旧柜', org: '中心院区', pharmacy: '门诊药房', status: '启用',
    layers: [{ code: 'L1', name: '第 1 摆药层', cells: [{ code: 'C1-01', name: '1 槽', status: '空闲' }] }] }],
  stations: [{ code: 'BSX', name: '旧基站', org: '中心院区', pharmacy: '门诊药房', status: '在线',
    lamps: [{ addr: 'BSX-L01', name: '灯组 1', status: '在线' }] }]
} });
var mig = F.load();
eq('迁移补物理类型', mig.cabinets[0].ctype, '物理');
eq('迁移补槽对照字段', mig.cabinets[0].layers[0].cells[0].lampAddr, '');
ok('迁移灯组平铺且带基站', mig.lamps.length === 1 && mig.lamps[0].stationCode === 'BSX');
ok('迁移删除嵌套 lamps', !mig.stations[0].lamps);
eq('迁移补基站类型', mig.stations[0].stype, '灯组基站');

console.log('# Round AT 取药槽↔灯组 一对一');
window.store.update({ facility: null });
var fs1 = F.load();
eq('逻辑柜槽绑灯拦截', F.bindLamp(fs1, 'L1-C001', 'BS01-L02'), '逻辑取药柜的取药槽无需对照灯组');
eq('不存在槽拦截', F.bindLamp(fs1, 'C9-99', 'BS01-L02'), '取药槽 C9-99 不存在');
eq('未登记灯组拦截', F.bindLamp(fs1, 'C1-02', 'NOPE-01'), '灯组 NOPE-01 不存在（请先在基站灯组维护扫码登记）');
eq('正常绑定', F.bindLamp(fs1, 'C1-02', 'BS01-L02'), '');
ok('绑定后双向同步', F.findCell(fs1, 'C1-02').cell.lampAddr === 'BS01-L02' && F.findLamp(fs1, 'BS01-L02').cellCode === 'C1-02');
// 灯组换槽：BS01-L02 改绑 C1-03 → C1-02 应被释放
eq('灯组换绑到新槽', F.bindLamp(fs1, 'C1-03', 'BS01-L02'), '');
ok('换绑后旧槽释放', F.findCell(fs1, 'C1-02').cell.lampAddr === '' && F.findCell(fs1, 'C1-03').cell.lampAddr === 'BS01-L02');
// 槽换灯：C1-01 已绑 BS01-L01，改绑 BS01-L03 → BS01-L01 应被释放
eq('槽换绑新灯', F.bindLamp(fs1, 'C1-01', 'BS01-L03'), '');
ok('旧灯组释放', F.findLamp(fs1, 'BS01-L01').cellCode === '' && F.findLamp(fs1, 'BS01-L03').cellCode === 'C1-01');
eq('重复绑定拦截', F.bindLamp(fs1, 'C1-01', 'BS01-L03'), '该取药槽已绑定此灯组，无需重复操作');
eq('解绑', F.unbindLamp(fs1, 'C1-01'), '');
ok('解绑后双向清空', F.findCell(fs1, 'C1-01').cell.lampAddr === '' && F.findLamp(fs1, 'BS01-L03').cellCode === '');

console.log('# Round AT 药品↔取药槽 一对多');
var drugYMD = { drugCode: 'YP010245', drugName: '依姆多' };
eq('物理柜绑药', F.bindDrug(fs1, 'C1-04', drugYMD), '');
eq('一药多槽允许', F.bindDrug(fs1, 'C1-05', drugYMD), '');
ok('绑药后槽占用', F.findCell(fs1, 'C1-04').cell.status === '占用');
eq('同药重复对照拦截', F.bindDrug(fs1, 'C1-04', drugYMD), '该取药槽已对照此药品，无需重复操作');
ok('逻辑柜绑药拦截', F.bindDrug(fs1, 'L1-C001', drugYMD).indexOf('逻辑取药柜') === 0);
eq('物理柜解绑药品', F.unbindDrug(fs1, 'C1-04'), '');
ok('解绑后槽空闲', F.findCell(fs1, 'C1-04').cell.status === '空闲' && !F.findCell(fs1, 'C1-04').cell.drugCode);
ok('逻辑柜解绑拦截', F.unbindDrug(fs1, 'L1-C001').indexOf('逻辑取药柜') === 0);

console.log('# Round AT 逻辑柜选药品生成取药槽');
var r1 = F.genLogicCells(F.cabinetOf(fs1, 'CB04'), [
  { drugCode: 'YP010201', drugName: '乳酸依沙吖啶溶液' },
  { drugCode: 'YP010245', drugName: '依姆多' } // 已对照 → 跳过
]);
eq('新生成 1 槽', r1.added, 1);
eq('重复药品跳过', r1.skipped, 1);
eq('新槽编号自增', F.cabinetOf(fs1, 'CB04').layers[0].cells[3].code, 'L1-C004');
ok('新槽建槽即对照', F.cabinetOf(fs1, 'CB04').layers[0].cells[3].drugCode === 'YP010201');

if (failed) {
  console.log('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nall passed');
