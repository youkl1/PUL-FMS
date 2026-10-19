/**
 * _t-scan-hub.node.js — 统一扫码工作台（scan-hub）：七场景队列派生 + 真实池扫码 + 审核落账断言
 * 跑：node scripts/_t-scan-hub.node.js（在 pul-fms-base-v1 目录）
 * 口径：真实种子数据驱动（wh/pch/rx 池）；codes/badCodes 与池内单据共享引用，审核真落账（wh.save/pch.save）
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
load('data.js');
load('drug-data.js');
load('purchase-data.js');
load('wh-data.js');
load('rx-data.js');
load('scan-core.js');
load('scan-hub.js');

var HUB = window.PUL_SCAN_HUB, W = window.PUL_WH, P2 = window.PUL_PCH;
var failed = 0;
function ok(name, cond) { console.log((cond ? '  ok   ' : '  FAIL ') + name); if (!cond) failed++; }
function eq(name, got, exp) {
  var g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g === e) console.log('  ok   ' + name);
  else { failed++; console.log('  FAIL ' + name + '\n       got ' + g + '\n       exp ' + e); }
}

// ===== 1. 队列派生（真实种子） =====
var cnt = HUB.counts();
eq('备货出库队列=3（待出库）', cnt['pick-out'], 3);
eq('领用入库队列=4（已出库在途）', cnt['req-in'], 4);
eq('药品上队列=2（门诊药房已入库有待上架码）', cnt['shelf'], 2);
eq('采购入库队列=4（待审核到货单 3 + 清单录入演示单 1；Round DB 退役 204-13825501/FK5XSG01484628-1，下载失败 9419121 不进队列）', cnt['pur-in'], 4);
eq('采购退货队列=3（库房退货未审核；Round CB 两张演示单 TH20261014002/14003 直出）', cnt['pur-out'], 3);
ok('门诊/住院队列可读（处方域跳外链）', cnt['disp-out'] >= 0 && cnt['tray-out'] >= 0);

// ===== 2. 备货出库（出库·无码单·计划量）：在架/占用/不在清单内/不在库房内 + 审核扣账 =====
var hd1 = HUB.openDoc('pick-out', 'LY20260914001');
eq('规范化：依姆多计划 5 盒 → 35 片（销售单位）', hd1.items[0].planQty, 35);
eq('首扫在架依姆多盒码', HUB.scan(hd1, '8461935000500007' + '8000', {}).level, 'ok');
eq('扫码数量 1 盒', HUB.ctxOf(hd1) && window.PUL_SCAN.scannedBase(HUB.ctxOf(hd1), 'YP010245'), 1);
eq('不在清单内×（健脾 000550201 在架自由码但不在申请；2026-10-12 占用面扩三池后唯可来 500103 已属其他出库单预占，换码）', HUB.scan(hd1, '8433386000550201' + '8801', {}).level, 'bad');
eq('不在库房内×（健脾码在门诊药房）', HUB.scan(hd1, '8433386000500201' + '8000', {}).level, 'bad');
eq('被占用×（加罗新箱码挂另一张待出库单）', HUB.scan(hd1, '8414784000770201' + '7701', {}).level, 'bad');
var pre1 = HUB.auditDoc(hd1);
ok('不一致硬拦：计划（依姆多 5 盒+复方甘草 2 盒）≠ 已扫 1 盒（2026-10-12 统一审核判定）', !!pre1.block && pre1.block.indexOf('不一致') > -1);
// 换可扫齐的单走完整审核：LYCK20261001001（加罗新 60 瓶，流转预填箱码 → 有码单核对）
var hd1b = HUB.openDoc('pick-out', 'LYCK20261001001');
eq('预填码单=有码单核对（src=pre）', hd1b.src, 'pre');
eq('预填箱码种子态=已核对（进度落盘）', !!hd1b.codes[0].checked, true);
eq('码单外码×（770202 在架但未预填）', HUB.scan(hd1b, '8414784000770202' + '7702', {}).level, 'bad');
hd1b.badCodes.length = 0;   // 模拟「移除异常码」（异常码硬拦优先于一致性判定）
ok('一致后放行（计划=扫码=60 瓶，预填码已核对）', !HUB.auditDoc(hd1b).block);
HUB.auditCommit(hd1b);
eq('审核后=已出库', hd1b._real.status, '已出库');
eq('实物数量落账（加罗新 docQty=60）', hd1b._real.items[0].docQty, 60);
ok('出库扣账：箱码离架', !W.stockAll(P2.load(), W.load(), '中心库').some(function (c) { return c.code === '8414784000770201' + '7701'; }));

// ===== 3. 领用入库（入库·有码单·在途复核）：phChecked 复核态 + auditPickIn 落账 =====
var hit3 = HUB.findDoc('LYCK20260913001');
eq('深链反查：LYCK20260913001 → 领用入库', hit3 && hit3.scene, 'req-in');
var hd3 = HUB.openDoc('req-in', 'LYCK20260913001');
eq('在途单=有码单核对', hd3.src, 'pre');
eq('库房 checked 不干扰药房复核', HUB.scan(hd3, hd3.codes[0].code, {}).level, 'ok');
eq('重复复核 warn', HUB.scan(hd3, hd3.codes[0].code, {}).level, 'warn');
eq('复核态写 phChecked', !!hd3.codes[0].phChecked, true);
eq('已在药房库存的码=重复入库×', HUB.scan(hd3, '8416917000500101' + '8000', {}).level, 'bad');
HUB.auditCommit(hd3);
eq('auditPickIn 落账=已入库', hd3._real.status, '已入库');
ok('③→④ 连演：该单进上架队列', HUB.queues('shelf').some(function (r) { return r.billNo === 'LYCK20260913001'; }));

// ===== 4. 药品上架（移位）：扫码即写货位、重复上架 warn、无审核 =====
var hd4 = HUB.openDoc('shelf', 'LYCK20260912001');
eq('上架清单=单内全部码（含已上架）', hd4.codes.length, 3);
eq('扫待上架码=ok', HUB.scan(hd4, '8433386000500201' + '8000', {}).level, 'ok');
eq('货位落账 M-01（setPhLoc）', W.findPhCode(W.load(), '8433386000500201' + '8000').phLoc, 'M-01');
eq('重复上架 warn', HUB.scan(hd4, '8433386000500201' + '8000', {}).level, 'warn');
eq('上架场景无审核', !!HUB.auditDoc(hd4).block, true);
eq('移位不动库存（在架码数不变）', W.pharmacyStock(W.load(), '门诊药房').length > 0, true);

// ===== 5. 采购入库（入库·有码单）：多送串货登记 + 异常码硬拦 + 审核生成入库单 =====
var inBefore = P2.load().inDocs.length;
var hd5 = HUB.openDoc('pur-in', '204-13824814');
eq('到货单=有码单核对', hd5.src, 'pre');
eq('多送/串货×（别单码）', HUB.scan(hd5, '8433386000550101' + '8801', {}).level, 'bad');
eq('异常码登记', hd5.badCodes.length, 1);
ok('异常码硬拦审核', !!HUB.auditDoc(hd5).block);
hd5.badCodes.length = 0;   // 模拟「移除异常码」
// 2026-10-12 统一审核判定：下载单必须扫码核对到 计划=扫码 才放行（扫码从可选变有码必核）
ok('未扫码硬拦（扫码总量为 0，Round CS）', !!HUB.auditDoc(hd5).block && HUB.auditDoc(hd5).block.indexOf('扫码总量为 0') > -1);
eq('扫码核对码 1', HUB.scan(hd5, '8400431002611300' + '3301', {}).level, 'ok');
eq('扫码核对码 2', HUB.scan(hd5, '8400431002611301' + '3302', {}).level, 'ok');
ok('一致后放行（计划=扫码=2）', !HUB.auditDoc(hd5).block);
HUB.auditCommit(hd5);
eq('到货单=已下载（已审核）', hd5._real.downloaded, '是');
eq('入库单生成（inDocs +1）', P2.load().inDocs.length, inBefore + 1);

// ===== 6. 采购入库·人工新增（无清单格，真实池） =====
// 造一张人工单：无码 → 扫码录入建行
var pchS = P2.load();
pchS.arrive.unshift({ orderNo: 'LAB-MANUAL-1', orderTime: window.PUL_SCAN.nowStr(), supplier: '演示供应商', shipper: '演示供应商',
  receiver: '中心院区', docType: '销售出库', source: '手动', confirm: '未确认', downloaded: '否',
  invoice: '', warehouse: '中心库', loc: '', codes: [] });
P2.save(pchS);
var hd6 = HUB.openDoc('pur-in', 'LAB-MANUAL-1');
eq('人工单=无码单录入', hd6.src, 'none');
eq('人工单=无清单', hd6.list, 'none');
eq('扫码录入建行', HUB.scan(hd6, '8148790000900001' + '0001', {}).level, 'ok');
eq('码驱动建药品行', hd6.items.length, 1);
eq('已在架码=重复入库×', HUB.scan(hd6, '8416917000500102' + '8000', {}).level, 'bad');

// ===== 7. 采购入库·清单录入单（2026-10-11 Round BI：有清单无码单格 = plan + src恒none） =====
var hd7 = HUB.openDoc('pur-in', 'DH20261011001');
eq('清单单=有清单 plan', hd7.list, 'plan');
eq('清单单=码源恒 none（扫新码允许进单，不误判多送/串货）', hd7.src, 'none');
eq('清单单=计划清单直映射 2 行（不被码聚合覆盖）', hd7.items.length, 2);
eq('清单内新码 ok 录入', HUB.scan(hd7, '8400431002611500' + '3301', {}).level, 'ok');
eq('重复扫码 warn', HUB.scan(hd7, '8400431002611500' + '3301', {}).level, 'warn');
eq('不在清单内×（复方甘草不在计划清单）', HUB.scan(hd7, '8441916000410200' + '6601', {}).level, 'bad');
eq('清单内第 2 码 ok（计划 2 基本单位）', HUB.scan(hd7, '8400431002611501' + '3302', {}).level, 'ok');
eq('第 3 码=已备齐超量×（入库无拆零）', HUB.scan(hd7, '8400431002611502' + '3303', {}).level, 'bad');

// ===== 8. 扫码移除通用化（2026-10-11 Round BI：前置通用分支，录入/核对同口径） =====
eq('清单单移除已扫码 ok', HUB.scan(hd7, '8400431002611500' + '3301', { remove: true }).level, 'ok');
eq('移除后码清单 2→1', hd7.codes.length, 1);
eq('移除不存在码 warn', HUB.scan(hd7, '8400431002999000' + '3301', { remove: true }).level, 'warn');
eq('移除模式解析失败=warn', HUB.scan(hd7, '8999001000000001' + '9999', { remove: true }).level, 'warn');
eq('移除模式不登记异常码', hd7.badCodes.length, 0);
// 核对模式（下载单）：移除已核对码 → 验收进度回落
var hd8 = HUB.openDoc('pur-in', '223342530');   // Round CA：原 4VS26091000041665 冗余精简，换 4 码拉取单（204-13824814 已被第 5 节审核消费）
eq('下载单=有码单核对', hd8.src, 'pre');
eq('核对模式扫清单内码 ok', HUB.scan(hd8, hd8.codes[0].code, {}).level, 'ok');
eq('核对模式扫码移除 ok（多送/串货/冲突码剔除）', HUB.scan(hd8, hd8.codes[0].code, { remove: true }).level, 'ok');
eq('移除后进度回落（剩 5 码 0 核对）', hd8.codes.length === 5 && hd8.codes.filter(function (c) { return c.checked; }).length === 0, true);
eq('核对模式移除不存在码 warn', HUB.scan(hd8, '8400431002999000' + '3301', { remove: true }).level, 'warn');

// ===== 9. 采购退货（出库·无码单·无清单，2026-10-12 Round BL）：在架加入/无库存码登记/占用拦截/审核扣账 =====
var hd9 = HUB.openDoc('pur-out', '202609110002');
eq('退货单=无清单', hd9.list, 'none');
eq('退货单=无码单录入', hd9.src, 'none');
eq('种子无库存码=统一异常码（badCodes）', hd9.badCodes.length, 1);
ok('异常码硬拦审核', !!HUB.auditDoc(hd9).block);
hd9.badCodes.length = 0;   // 模拟「移除异常码」
eq('单内已有码=重复扫码 warn', HUB.scan(hd9, '8414784000770202' + '7702', {}).level, 'warn');
eq('在架自由码加入退货清单 ok（健脾 000550201·中心库 B-01-01）', HUB.scan(hd9, '8433386000550201' + '8801', {}).level, 'ok');
eq('被占用×（唯可来 500102 挂未审核其他出库单 QTCK20261001001，占用面扩三池）', HUB.scan(hd9, '8416917000500102' + '8000', {}).level, 'bad');
eq('不在库房内×（健脾 500201 在门诊药房）', HUB.scan(hd9, '8433386000500201' + '8000', {}).level, 'bad');
eq('无库存码经 onDirBad 登记异常码', hd9.badCodes.length, 1);
ok('无库存码硬拦审核', !!HUB.auditDoc(hd9).block);
hd9.badCodes.length = 0;
ok('清零后放行（无清单单 计划=扫码自证一致）', !HUB.auditDoc(hd9).block);
var outBefore = W.stockAll(P2.load(), W.load(), '中心库').length;
HUB.auditCommit(hd9);
eq('退货单=已审核', hd9._real.status, '已审核');
eq('审核人/审核时间落账', hd9._real.auditor.length > 0 && hd9._real.auditTime.length > 0, true);
ok('加罗新 770202 离架（退货扣账）', !W.stockAll(P2.load(), W.load(), '中心库').some(function (c) { return c.code === '8414784000770202' + '7702'; }));
ok('健脾 000550201 同步离架', !W.stockAll(P2.load(), W.load(), '中心库').some(function (c) { return c.code === '8433386000550201' + '8801'; }));
eq('在架码数 -2', W.stockAll(P2.load(), W.load(), '中心库').length, outBefore - 2);
eq('审核后出队列（剩 Round CB 两张演示单）', HUB.counts()['pur-out'], 2);

// ===== 10. 单据级计划覆盖值 + 落账只入已核对码（2026-10-13 Round BU：到货单编辑弹窗计划可改，页面/扫码页审核判定一致） =====
var pchS3 = P2.load();
var cloneCodes = JSON.parse(JSON.stringify(pchS3.arrive.filter(function (x) { return x.orderNo === '223342530'; })[0].codes.slice(0, 2)));   // Round CA：第 8 节移除后剩 5 码（Round CO 异常集中 6 码），取前 2 干净码（000118830/000118831）
cloneCodes[0].checked = true;   // 2 码只核对 1 码
pchS3.arrive.unshift({ orderNo: 'LAB-PLAN-1', orderTime: window.PUL_SCAN.nowStr(), supplier: '演示供应商', shipper: '演示供应商',
  receiver: '中心院区', docType: '销售出库', source: '手动', confirm: '未确认', downloaded: '否',
  invoice: '', warehouse: '中心库', loc: '', codes: cloneCodes, planQty: 1 });
P2.save(pchS3);
var hd10 = HUB.openDoc('pur-in', 'LAB-PLAN-1');
eq('计划覆盖值带到 hubDoc（planQtyTotal 优先于码聚合计划 2）', hd10.planQtyTotal, 1);
ok('计划 1 = 已扫 1（2 码核 1）放行——无覆盖值时此态会判「不一致」硬拦', !HUB.auditDoc(hd10).block);
HUB.auditCommit(hd10);
eq('入库单只入已核对码（2 码进 1）', P2.load().inDocs[0].codes.length, 1);
eq('未扫残留码留在到货单', P2.load().arrive.filter(function (x) { return x.orderNo === 'LAB-PLAN-1'; })[0].codes.length, 2);
ok('残留码未进在架', !W.stockAll(P2.load(), W.load(), '中心库').some(function (c) { return c.code === cloneCodes[1].code; }));

// ===== 11. 扫码暂存-提交制（2026-10-14 Round CC）：草稿隔离 / 恢复 / 提交 / 清空重扫 / 数量一致自动提交 =====
// 第 8 节 hd8（223342530）的 scan+remove 已走草稿（persist=saveDraft）——直接作为草稿态样本
var ccReal0 = P2.load().arrive.filter(function (x) { return x.orderNo === '223342530'; })[0];
ok('未提交不落池（real.codes 仍 6 码）', ccReal0.codes.length === 6);
ok('草稿已暂存（第 8 节 persist 所落）', !!HUB.loadDraft('pur-in', '223342530'));
var ccHd = HUB.openDoc('pur-in', '223342530');
eq('重开弹窗恢复草稿（5 码=第 8 节移除后）', ccHd.codes.length, 5);
ok('恢复标记 _restored', !!ccHd._restored);
HUB.commitDraft(ccHd);
eq('提交后 real.codes=草稿（5 码整组写回）', P2.load().arrive.filter(function (x) { return x.orderNo === '223342530'; })[0].codes.length, 5);
ok('提交后草稿清除', !HUB.loadDraft('pur-in', '223342530'));
// 清空重扫：核对清单内首码（核对态落草稿副本）→ clearDraft 回滚到已提交基线（核对态一并回滚）
var ccHd2 = HUB.openDoc('pur-in', '223342530');
var ccScanRes = HUB.scan(ccHd2, ccHd2.codes[0].code, {});
ok('核对清单内码 ok（核对态落草稿副本）', ccScanRes.level === 'ok' && ccHd2.codes[0].checked);
HUB.clearDraft(ccHd2);
var ccReal1 = P2.load().arrive.filter(function (x) { return x.orderNo === '223342530'; })[0];
eq('清空后 real 回到已提交基线（5 码）', ccReal1.codes.length, 5);
ok('清空后草稿清除且核对态回滚', !HUB.loadDraft('pur-in', '223342530') && !ccReal1.codes[0].checked);
// 数量一致自动提交：清单单（1 药 1 盒）扫齐即自动落池
var pchCC = P2.load();
pchCC.arrive.unshift({ orderNo: 'LAB-CC-1', orderTime: window.PUL_SCAN.nowStr(), supplier: '演示供应商', shipper: '演示供应商',
  receiver: '中心院区', docType: '销售出库', source: '手动', confirm: '未确认', downloaded: '否',
  invoice: '', warehouse: '中心库', loc: '', items: [{ drugCode: 'YP010245', qty: 1 }], codes: [] });
P2.save(pchCC);
var ccHd3 = HUB.openDoc('pur-in', 'LAB-CC-1');
var ccRes = HUB.scan(ccHd3, '8461935000118898' + '0001', {});   // 全新码（不在架可入库）
ok('数量一致自动提交（res.autoCommit）', !!ccRes.autoCommit);
eq('自动提交后 real.codes 已落池（1 码）', P2.load().arrive.filter(function (x) { return x.orderNo === 'LAB-CC-1'; })[0].codes.length, 1);
ok('自动提交后草稿清除', !HUB.loadDraft('pur-in', 'LAB-CC-1'));

// ===== 12. 方案 §3.1/§3.3 判定树落地（2026-10-15 Round CJ）：清单开关默认 + 行级超量 + 审核页扫码插入 =====
// 12.1 开关默认值（§3.1：有码单/清单单=是、人工单=否；pre 审核扫码固定=是且 UI 不出开关）
eq('开关默认：清单录入单=开（DH20261011001）', HUB.openDoc('pur-in', 'DH20261011001').matchList, true);
eq('开关默认：下载码单核对=开（223342530）', HUB.openDoc('pur-in', '223342530').matchList, true);
var pchCI = P2.load();
pchCI.arrive.unshift({ orderNo: 'LAB-MANUAL-CI', orderTime: window.PUL_SCAN.nowStr(), supplier: '演示供应商', shipper: '演示供应商',
  receiver: '中心院区', docType: '销售出库', source: '手动', confirm: '未确认', downloaded: '否',
  invoice: '', warehouse: '中心库', loc: '', codes: [] });   // 干净人工单（LAB-MANUAL-1 已被第 6 节 tryAutoCommit 带码，重开即有码单核对=是，规格正确）
P2.save(pchCI);
eq('开关默认：人工无清单单=关（LAB-MANUAL-CI）', HUB.openDoc('pur-in', 'LAB-MANUAL-CI').matchList, false);
eq('开关默认：无清单退货单=关（TH20261014002）', HUB.openDoc('pur-out', 'TH20261014002').matchList, false);
// 12.2 开关=否（真实池）：清单外药品放行建行（planQty=null 自证行），审核计划行+自证行合并判定放行
var hd12 = HUB.openDoc('pur-in', 'DH20261011001');   // 恢复第 7/8 节草稿（依沙吖啶 1 码已核对）
hd12.matchList = false;   // 操作员切「按药品清单扫码」=否
eq('开关=否：清单外药品（复方甘草）放行建行', HUB.scan(hd12, '8441916000410200' + '6601', {}).level, 'ok');
eq('清单外行 planQty=null（自证行）', (hd12.items[2] || {}).planQty || null, null);
eq('开关=否后：清单内行照常录入（依沙吖啶补齐）', HUB.scan(hd12, '8400431002611502' + '3303', {}).level, 'ok');
eq('开关=否后：清单内依姆多行录入（全新码 000118898）', HUB.scan(hd12, '8461935000118898' + '0001', {}).level, 'ok');
ok('审核放行：计划行 + 自证行 planTotal 回退一致（计划 4 = 扫码 4）', !HUB.auditDoc(hd12).block);
HUB.auditCommit(hd12);
// 12.3 行级判定树（合成 ctx 直测主干）：计划=0 行不限制总数（§3.1「计划≤0 → 能插入」；旧单据级口径误判「已备齐」）
function mkCtx(doc, dir, list, src, matchList, inStockRec) {
  var c = { dir: dir, list: list, src: src, node: '中心库', doc: doc,
    frozen: function () { return false; },
    inStock: function () { return inStockRec || null; },
    occupied: function () { return null; }, stockCodes: function () { return []; }, persist: function () {} };
  if (matchList !== undefined) c.matchList = matchList;   // 不传=验证缺省推导（list!=='none'）
  return c;
}
var docZ = { status: '未审核', items: [{ drugCode: 'YP010245', planQty: 0 }], codes: [], badCodes: [] };
eq('计划=0 行：首码放行（旧口径误判已备齐×）', window.PUL_SCAN.scanCore('8461935000500007' + '8000', {}, mkCtx(docZ, 'in', 'plan', 'none', true)).level, 'ok');
eq('计划=0 行：第二码仍放行（不限制总数）', window.PUL_SCAN.scanCore('8461935000500007' + '8001', {}, mkCtx(docZ, 'in', 'plan', 'none', true)).level, 'ok');
// 12.4 §3.1 开关=否（合成 ctx）：清单外插入 + planTotal 自证回退审核放行；对照开关=是拦截
var docZ2 = { status: '未审核', items: [{ drugCode: 'YP010245', planQty: 7 }], codes: [], badCodes: [] };   // 依姆多 1 盒（销售单位=片）
var ctxZ2 = mkCtx(docZ2, 'in', 'plan', 'none', false);
eq('开关=否：清单内依姆多录入 ok', window.PUL_SCAN.scanCore('8461935000500007' + '8000', {}, ctxZ2).level, 'ok');
eq('开关=否：清单外（健脾）插入 ok', window.PUL_SCAN.scanCore('8433386000550101' + '8801', {}, ctxZ2).level, 'ok');
eq('插入行 planQty=null', (docZ2.items[1] || {}).planQty || null, null);
ok('planTotal 自证回退：审核放行（计划 2 盒 = 扫码 2 盒）', !window.PUL_SCAN.auditPrecheck(ctxZ2).block);
eq('开关=否建行后再扫同药品码：已属清单内（自证行≤0 不限）', window.PUL_SCAN.scanCore('8433386000550101' + '8803', {}, mkCtx(docZ2, 'in', 'plan', 'none', true)).level, 'ok');
eq('对照 开关=是：清单外码拦截（fresh doc；自证行建行后即属清单内，不入对照）', window.PUL_SCAN.scanCore('8433386000550102' + '8802', {}, mkCtx({ status: '未审核', items: [{ drugCode: 'YP010245', planQty: 7 }], codes: [], badCodes: [] }, 'in', 'plan', 'none', true)).level, 'bad');
// 12.4 末尾追加（最终评审 Finding 1 配套）：清单内行超量仍拦（超量与开关无关）——经探针调整用 docZ2 续扫
// （原拟 fresh doc 首扫 1 盒码恰=计划 1 盒「✓备齐」不触发超量=ok，无法演示超量拦；docZ2 依姆多行已备齐，开关=否再扫仍 bad）
eq('开关=否：清单内行超量仍拦（超量与开关无关）', window.PUL_SCAN.scanCore('8461935000500007' + '8001', {}, mkCtx(docZ2, 'in', 'plan', 'none', false)).level, 'bad');
// 12.5 §3.3 审核页扫码（pre）插入：码单外同药品码按判定树插入+直接核对；树拦下按原口径留多送/串货痕
var docY = { status: '未审核', items: [{ drugCode: 'YP010245', planQty: 14 }],   // 依姆多 2 盒
  codes: [{ code: '8461935000500007' + '8000', checked: true, split: '否', splitQty: '' }], badCodes: [] };
var ctxY = mkCtx(docY, 'in', 'plan', 'pre');   // matchList 不传：pre 场景默认推导=是（list==='plan'）
eq('审核页扫码：码单外同药品码插入=ok（§3.3）', window.PUL_SCAN.scanCore('8461935000500007' + '8001', {}, ctxY).level, 'ok');
eq('插入码直接标已核对（§3.3）', !!(docY.codes[1] || {}).checked, true);
eq('备齐后同药品码=bad（超量拦）', window.PUL_SCAN.scanCore('8461935000500007' + '8002', {}, ctxY).level, 'bad');
eq('树拦下仍留多送/串货痕（1 条，插入码不留痕）', docY.badCodes.length, 1);
ok('留痕原因保持原词', ((docY.badCodes[0] || {}).reason || '').indexOf('多送/串货') > -1);
eq('清单外码=bad（原口径）', window.PUL_SCAN.scanCore('8433386000550101' + '8801', {}, ctxY).level, 'bad');
ok('清单外码 msg 保持原词', ((docY.badCodes[1] || {}).reason || '').indexOf('多送/串货') > -1);
// shelf 移位无审核语义：码单外码维持原就地拦截（在架事实注入，走 §3 shelf 分支）
var docS = { status: '作业中', items: [{ drugCode: 'YP010245', planQty: 7 }], codes: [], badCodes: [] };
eq('shelf 码单外码仍拦', window.PUL_SCAN.scanCore('8433386000550101' + '8801', {}, mkCtx(docS, 'shelf', 'plan', 'pre', undefined, { node: '中心库', shelf: '待上架' })).level, 'bad');

// 12.6 单据级计划覆盖值（planQtyTotal，Round BU）× 开关=否 自证行：plan = planQtyTotal + 自证行扫码（质量评审 Important 1 补钉）
var docZ3 = { status: '未审核', planQtyTotal: 1, items: [{ drugCode: 'YP010245', planQty: 7 }], codes: [], badCodes: [] };
var ctxZ3 = mkCtx(docZ3, 'in', 'plan', 'none', false);
window.PUL_SCAN.scanCore('8461935000500007' + '8000', {}, ctxZ3);   // 清单内 1 盒（=覆盖值）
window.PUL_SCAN.scanCore('8433386000550101' + '8801', {}, ctxZ3);   // 开关=否 清单外自证行 +1
ok('planQtyTotal 覆盖值 + 自证行：审核放行（计划 1+1 = 扫码 2）', !window.PUL_SCAN.auditPrecheck(ctxZ3).block);

// ===== 12.7 最终评审 Finding 1 修复（Round CJ 方案 A）：自证行落库回写 + openDoc 码聚合补行 =====
// 种子码经 node 探针按 12.6 节后状态核实（2026-10-15）：A 扫入码 8461935000500008'8000（依姆多 YP010245，中心库在架、
// 占用 null、全测试无消费——原候选 '8461935000500007'8000 已被第 2 节 hd1 auditDoc 入口 commitDraft 落池占用×）；
// B 清单外码 '6602（复方甘草 YP010529，同药换串号——'6601 已被 12.2 auditCommit 消费进在架=重复入库×）；B 清单行 qty:0
// （计划 0=自证行语义，审核与计划外扫码一致放行——qty:1 时重开审核判缺 1 硬拦，与放行断言冲突，探针对照实测）
// A. pick-out 开关=否：计划外药审核出库 → 回写 real.items → 药房复核不再误判串货
var whCI = W.load();
whCI.pickDocs.unshift({ billNo: 'LYCK-CI-A', date: window.PUL_SCAN.nowStr(), warehouse: '中心库', pharmacy: '门诊药房',
  status: '待出库', operator: '演示员', shelfLoc: 'S-01', items: [{ drugCode: 'YP010201', qty: 0, slot: 'A-01' }], codes: [] });
W.save(whCI);
var hdCI = HUB.openDoc('pick-out', 'LYCK-CI-A');
hdCI.matchList = false;
eq('开关=否：计划外在架药扫入建行', HUB.scan(hdCI, '8461935000500008' + '8000', {}).level, 'ok');
ok('审核放行（计划行 qty=0 自证一致）', !HUB.auditDoc(hdCI).block);
HUB.auditCommit(hdCI);
var ciReal = W.load().pickDocs.filter(function (d) { return d.billNo === 'LYCK-CI-A'; })[0];
eq('自证行落库回写（real.items 1→2 行）', ciReal.items.length, 2);
ok('回写行 qty=实际扫码折合（基本单位，>0）', (ciReal.items.filter(function (r) { return r.drugCode === 'YP010245'; })[0] || { qty: 0 }).qty > 0);
eq('审核出库状态落账', ciReal.status, '已出库');
var hdCI2 = HUB.openDoc('req-in', 'LYCK-CI-A');   // 已出库 → 进药房复核队列
eq('req-in 重开：清单含回写行（2 行）', hdCI2.items.length, 2);
eq('药房复核扫该码=ok（不再「不在码单内」）', HUB.scan(hdCI2, '8461935000500008' + '8000', {}).level, 'ok');
// B. pur-in 清单单：开关=否提交草稿后重开——码聚合补行，审核判定与提交当刻一致
var pchCJ = P2.load();
pchCJ.arrive.unshift({ orderNo: 'LAB-CJ-B', orderTime: window.PUL_SCAN.nowStr(), supplier: '演示供应商', shipper: '演示供应商',
  receiver: '中心院区', docType: '销售出库', source: '手动', confirm: '未确认', downloaded: '否',
  invoice: '', warehouse: '中心库', loc: '', items: [{ drugCode: 'YP010201', qty: 0 }], codes: [] });
P2.save(pchCJ);
var hdB = HUB.openDoc('pur-in', 'LAB-CJ-B');
hdB.matchList = false;
HUB.scan(hdB, '8441916000410200' + '6602', {});   // 清单外复方甘草 → 自证行（恒自证一致=每扫即自动提交）
HUB.commitDraft(hdB);                              // 提交：只写回 codes（复现「有码无行」孤儿态）
var hdB2 = HUB.openDoc('pur-in', 'LAB-CJ-B');      // 重开
eq('重开：码聚合补行（items 1→2 行）', hdB2.items.length, 2);
ok('重开后审核放行（与提交当刻判定一致）', !HUB.auditDoc(hdB2).block);
// C. pick-out 跨会话路径（复审 repro4 收口）：提交→关闭→重开（码聚合补行 planQty=码聚合≠null 自证行）→审核——
// 回写按纯存在性判定，union 行一并落库，ph-req-in 页内公式与 hub 审核同源不分叉。
// C 码经探针核实：'8461935000118830'7741（依姆多 YP010245，12.7-A/B 后状态在架中心库、占用 null；
// 复审建议码 '8461935000500009'8000 全新种子态即不在架，不可用）
var whC3 = W.load();
whC3.pickDocs.unshift({ billNo: 'LYCK-CI-C', date: window.PUL_SCAN.nowStr(), warehouse: '中心库', pharmacy: '门诊药房',
  status: '待出库', operator: '演示员', shelfLoc: 'S-01', items: [{ drugCode: 'YP010201', qty: 0, slot: 'A-01' }], codes: [] });
W.save(whC3);
var hdC3 = HUB.openDoc('pick-out', 'LYCK-CI-C');
hdC3.matchList = false;
eq('C 跨会话：开关=否清单外在架药扫入 ok', HUB.scan(hdC3, '8461935000118830' + '7741', {}).level, 'ok');
HUB.commitDraft(hdC3);   // 提交关闭（只写回 codes，自证行丢失）；不审核
var hdC4 = HUB.openDoc('pick-out', 'LYCK-CI-C');   // 跨会话重开
eq('C 重开：聚合补行 planQty=码聚合（≠null）', (hdC4.items.filter(function (r) { return r.drugCode === 'YP010245'; })[0] || {}).planQty != null, true);
ok('C 重开审核放行', !HUB.auditDoc(hdC4).block);
HUB.auditCommit(hdC4);
var ciRealC = W.load().pickDocs.filter(function (d) { return d.billNo === 'LYCK-CI-C'; })[0];
eq('C 跨会话回写：real.items 1→2 行', ciRealC.items.length, 2);
ok('C 跨会话回写：union 行落库 qty>0（基本单位）', (ciRealC.items.filter(function (r) { return r.drugCode === 'YP010245'; })[0] || { qty: 0 }).qty > 0);

console.log(failed ? ('\nFAILED ' + failed) : '\nall passed');
process.exit(failed ? 1 : 0);
