/**
 * _t-scan-lab.node.js — 统一扫码验证页（Round BF 六场景 × 清单四态）：全格码序 + 换算 + 拆零 + 自动赋码 + 上架 + 审核语义断言
 * 跑：node scripts/_t-scan-lab.node.js（在 pul-fms-base-v1 目录）
 * 口径：每格 resetCell 后按 DEMO_CODES 顺序驱动（auto=自动赋码 / split=带拆零标记），level 必须等于 tag；
 *   badCodes 只登记「需人工处置」两类（解析失败 / 不在码单内·多送串货），即时拦截类不留痕；
 *   拆零不扣整码（出库审核后拆零码仍在架）；入库审核落药房的码自动带「待上架」（③→④ 连演）
 */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
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
  String: String, Math: Math, JSON: JSON, Number: Number, Boolean: Boolean
});
window.window = window;
function load(f) { vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }); }
load('store.js');
load('drug-data.js');
load('purchase-data.js');
load('scan-lab-data.js');
load('scan-core.js');
load('scan-lab.js');

var LAB = window.PUL_SCAN_LAB;
var failed = 0;
function ok(name, cond) { console.log((cond ? '  ok   ' : '  FAIL ') + name); if (!cond) failed++; }
function eq(name, got, exp) {
  var g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g === e) console.log('  ok   ' + name);
  else { failed++; console.log('  FAIL ' + name + '\n       got ' + g + '\n       exp ' + e); }
}

LAB.load();

// ===== 0. 矩阵完整性：6 场景 × 4 清单态；置灰格 = 业务上不存在 =====
eq('6 场景 × 4 清单态', [LAB.SCENES.length, LAB.COLS.length], [6, 4]);
var greys = [];
LAB.SCENES.forEach(function (s) { LAB.COLS.forEach(function (c) { if (LAB.cellGrey(s.key, c.k)) greys.push(s.key + ':' + c.k); }); });
eq('置灰 6 格', greys.sort(), ['disp-out:none', 'disp-out:zero', 'pick-out:planPre', 'shelf:planManual', 'tray-out:none', 'tray-out:zero']);

// ===== 1. 换算与整零分解 =====
eq('依姆多 14 片 → 2 盒', LAB.toBaseQty('YP010245', 14, '片'), 2);
eq('尿素乳膏 盒码 → 10 支', LAB.toBaseQty('YP010601', 1, '盒'), 10);
eq('整零分解 15/7 盒 → 2 盒零 1 片', LAB.decomp('YP010245', 15 / 7), '2 盒零 1 片');
eq('无拆零单位不分解除', LAB.decomp('YP010601', 5), '5 支');

// ===== 2. 全格演示码序断言（tag=预期 level；auto=自动赋码 / split=拆零） =====
function runCell(key) {
  var parts = key.split(':');
  LAB.switchCell(parts[0], parts[1]);
  LAB.resetCell(parts[0], parts[1]);
  (LAB.DEMO_CODES[key] || []).forEach(function (d, i) {
    var res = d.auto ? LAB.autoAssign() : LAB.scanCore(d.code, { split: !!d.split });
    eq(key + ' 项' + (i + 1) + ' 预期 ' + d.tag, res.level, d.tag);
  });
  return LAB.curDoc();
}
Object.keys(LAB.DEMO_CODES).forEach(runCell);

// ===== 3. 采购入库·人工新增（无清单）：码驱动建行 + 审核回填 =====
LAB.switchCell('pur-in', 'none'); LAB.resetCell('pur-in', 'none');
LAB.DEMO_CODES['pur-in:none'].forEach(function (d) { LAB.scanCore(d.code, {}); });
var doc1 = LAB.curDoc();
eq('采购·无清单 建 2 行', doc1.items.length, 2);
eq('采购·无清单 异常码=仅解析失败', doc1.badCodes.length, 1);
eq('采购·无清单 尿素扫码数量 11 支', LAB.scannedBase(doc1, 'YP010601', 'none'), 11);
ok('异常码硬拦审核', !!LAB.auditPrecheck().block);
doc1.badCodes = [];
LAB.auditCommit();
eq('审核后计划数量←扫码数量（11 支）', doc1.items[0].planQty, 11);
ok('入库闭环：码进沙盒库存（中心库）', !!LAB.state().stock[doc1.codes[0].code]);

// ===== 4. 领用入库·在途单复核（有码单）：审核后码落门诊药房「待上架」（③→④ 连演） =====
LAB.switchCell('req-in', 'planPre'); LAB.resetCell('req-in', 'planPre');
LAB.DEMO_CODES['req-in:planPre'].forEach(function (d) { LAB.scanCore(d.code, {}); });
var doc3 = LAB.curDoc();
eq('领用入库 核对不新增码（仍 3 码）', doc3.codes.length, 3);
eq('领用入库 异常码=多送串货 1 条', doc3.badCodes.length, 1);
doc3.badCodes = [];
var pre3 = LAB.auditPrecheck();
ok('不一致硬拦（已扫 3 码 ≠ 计划 2，2026-10-12 统一审核判定）', !!pre3.block && pre3.block.indexOf('不一致') > -1);
LAB.auditCommit();
var inCode = doc3.codes[0].code;
ok('③→④ 连演：入库码落门诊药房·待上架',
  LAB.state().stock[inCode] && LAB.state().stock[inCode].node === '门诊药房' && LAB.state().stock[inCode].shelf === '待上架');
eq('plan 格审核不改计划数量', doc3.items[0].planQty, 2);

// ===== 5. 药品上架（移位）：扫码即生效、重复上架 warn、无审核 =====
LAB.switchCell('shelf', 'planPre'); LAB.resetCell('shelf', 'planPre');
var stockCountBefore = Object.keys(LAB.state().stock).length;
var demos5 = LAB.DEMO_CODES['shelf:planPre'];
eq('上架 ①', LAB.scanCore(demos5[0].code, {}).level, 'ok');
var shelfRec = LAB.state().stock[demos5[0].code];
ok('上架落账：已上架 + 货位 M-01', shelfRec.shelf === '已上架' && shelfRec.loc === 'M-01');
eq('重复上架 warn', LAB.scanCore(demos5[0].code, {}).level, 'warn');
eq('上架场景无审核', !!LAB.auditPrecheck().block, true);
LAB.scanCore(demos5[1].code, {}); LAB.scanCore(demos5[2].code, {});
ok('全部上架：3/3', LAB.curDoc().codes.every(function (c) { return c.checked; }));
eq('库存总量不变（移位）', Object.keys(LAB.state().stock).length, stockCountBefore);

// ===== 6. 门诊出药（拆零一等公民）：超量拦 → 拆零只取差额 → 备齐；审核拆零不扣整码 =====
LAB.switchCell('disp-out', 'planManual'); LAB.resetCell('disp-out', 'planManual');
var demos6 = LAB.DEMO_CODES['disp-out:planManual'];
demos6.forEach(function (d) { LAB.scanCore(d.code, { split: !!d.split }); });
var doc6 = LAB.curDoc();
eq('门诊 5 码入账（2 唯可来 + 3 依姆多，含 1 拆零码；超数量拦截不入账）', doc6.codes.length, 5);
var splitCode = doc6.codes[4];
eq('拆零码标记', [splitCode.split, splitCode.splitQty], ['是', '1']);
eq('依姆多 15/15 片 备齐', LAB.toSaleQty('YP010245', LAB.scannedBase(doc6, 'YP010245', 'none')), 15);
eq('门诊 异常码=解析失败 1 条', doc6.badCodes.length, 1);
doc6.badCodes = [];
var pre6 = LAB.auditPrecheck();
ok('门诊无缺量软提醒', pre6.warns.length === 0);
LAB.auditCommit();
ok('拆零不扣整码：拆零盒码仍在架', !!LAB.state().stock[splitCode.code]);
ok('整码已出库离架', !LAB.state().stock[doc6.codes[0].code]);

// ===== 7. 住院摆药（自动赋码）：FIFO 配齐 + 超额跳过 + 缺数 warn + 拆零收尾 =====
LAB.switchCell('tray-out', 'planManual'); LAB.resetCell('tray-out', 'planManual');
var auto7 = LAB.autoAssign();
eq('自动赋码配 4 码（支码×3+唯可来盒码）', auto7.added.length, 4);
eq('缺数 warn 两条（尿素缺 2 支、加罗新缺 1 瓶）', auto7.shorts.length, 2);
eq('自动赋码 level=warn', auto7.level, 'warn');
var doc7 = LAB.curDoc();
eq('尿素已配 3/5 支', LAB.scannedBase(doc7, 'YP010601', 'none'), 3);
eq('盒码超额不硬塞（盒码未入单）', !LAB.findCode(doc7, '8852478000000201' + '0001'), true);
eq('整盒强扫=超数量拦', LAB.scanCore('8852478000000201' + '0001', {}).level, 'bad');
eq('拆零扫盒码=只取差额 2 支', LAB.scanCore('8852478000000201' + '0001', { split: true }).level, 'ok');
eq('拆零后尿素备齐 5/5 支', LAB.scannedBase(doc7, 'YP010601', 'none'), 5);
var pre7 = LAB.auditPrecheck();
ok('不一致硬拦=加罗新缺 1 瓶（2026-10-12 统一审核判定）', !!pre7.block && pre7.block.indexOf('不一致') > -1);
LAB.auditCommit();
ok('住院拆零码余量回架', !!LAB.state().stock['8852478000000201' + '0001']);

// ===== 8. 冻结闸门 + 重置还原 =====
LAB.switchCell('pick-out', 'none'); LAB.resetCell('pick-out', 'none');
LAB.state().frozen = true;
eq('冻结拦截扫码', LAB.scanCore(LAB.DEMO_CODES['pick-out:none'][0].code, {}).level, 'bad');
LAB.state().frozen = false;
LAB.scanCore(LAB.DEMO_CODES['pick-out:none'][0].code, {});
LAB.resetCell('pick-out', 'none');
eq('重置后单据清空', LAB.curDoc().codes.length, 0);
ok('重置后库存还原', !!LAB.state().stock['8148790000000001' + '0001']);

// ===== 9. 无自动赋码场景拦截 =====
LAB.switchCell('pur-in', 'none');
eq('采购场景无自动赋码', LAB.autoAssign().level, 'warn');

console.log(failed ? ('\nFAILED ' + failed) : '\nall passed');
process.exit(failed ? 1 : 0);
