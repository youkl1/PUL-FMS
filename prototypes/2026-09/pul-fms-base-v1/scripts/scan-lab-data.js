/**
 * scan-lab-data.js — 统一扫码验证（沙盒页）场景与种子数据
 * 2026-10-11 Round BF 重构：矩阵转置 = 六业务场景 × 清单四态
 *   用户拍板：每个场景都可能遇到清单四态（采购入库：平台下载=数量>0有码单、人工新增=无清单），
 *   清单四态是每次扫码都要过的通用判断；场景只决定 方向/节点/动作/特有点（拆零·自动赋码）
 * 纯数据无 DOM，node 可直接加载；消费方 scan-lab.js（逻辑）/ scan-lab-ui.js（渲染）
 */
(function () {
  'use strict';

  var V = window.PUL_VOCAB.ST;   // 状态词表常量（store.js 先行加载）

  // ===== 清单四态（列）：list=校验分支，src=码源（pre=有码单核对 / none=无码单录入） =====
  var COLS = [
    { k: 'none', t: '无清单', list: 'none', src: 'none', rule: '无先验清单：通过即录入，码驱动建药品行；审核后计划数量←扫码数量' },
    { k: 'zero', t: '数量=0', list: 'zero', src: 'none', rule: '清单只有品种没有量：+归属校验（不在清单内×），扫码即计数；审核后计划数量←扫码数量' },
    { k: 'planPre', t: '数量>0 · 有码单', list: 'plan', src: 'pre', rule: '码已随单预置：扫码=核对验收（码单外=多送/串货×，重复扫=重复验收⚠），不新增码' },
    { k: 'planManual', t: '数量>0 · 无码单', list: 'plan', src: 'none', rule: '有计划量无码：扫码=录入 + 归属校验 + 超量校验（申请=销售单位、扫码=库存单位，先换算再比较）' }
  ];

  // ===== 六业务场景（行）：dir=in/out/shelf（移位·不动库存）；verb=审核动作名（shelf 无审核） =====
  // split=拆零一等公民；auto=有「⚡ 自动赋码」动作（FIFO 整码配齐，超额不硬塞）
  var SCENES = [
    { key: 'pur-in', name: '采购入库', dir: 'in', node: '中心库', verb: '审核入库', example: '采购到货单',
      rule: '入库方向闸门：码不能已在库存（重复入库×）' },
    { key: 'pick-out', name: '库房备货出库', dir: 'out', node: '中心库', verb: '审核出库', example: '领用备货出库单',
      rule: '出库方向闸门：码须在本节点在架（不在库房内×）' },
    { key: 'req-in', name: '药房领用入库', dir: 'in', node: '门诊药房', verb: '审核入库', example: '领用入库单',
      rule: '库房已扫在途单 → 直接审核（信任短路）或扫码复核；审核后码落本药房「待上架」（③→④ 连演）' },
    { key: 'shelf', name: '药房药品上架', dir: 'shelf', node: '门诊药房', verb: '', example: '待上架清单',
      rule: '移位 · 不动库存无审核：码须在本药房「待上架」集，扫码 = 写货位 + 标已上架；已上架重扫=⚠' },
    { key: 'disp-out', name: '门诊出药', dir: 'out', node: '门诊药房', verb: '完成发药', example: '门诊处方单', split: true,
      rule: '调剂时绑码（方案 b）；拆零一等公民：勾拆零扫整盒 = 只取差额、余量回架（拆零不扣整码）；异常去向 = 异常赋码台账（补绑/重新赋码）' },
    { key: 'tray-out', name: '住院摆药出药', dir: 'out', node: '住院药房', verb: '完成摆药', example: '住院摆药单', split: true, auto: true,
      rule: '先拿药扣账、后赋码：「⚡ 自动赋码」FIFO 整码配齐（超额不硬塞），配不齐 → 异常赋码台账补绑' }
  ];

  // ===== 单元格开放矩阵：缺省开放；grey=置灰理由（业务上不存在该形态） =====
  var CELL_GREY = {
    'pick-out:planPre': '指定码出库（拣货单 / FEFO 指定批号）：本系统暂无',
    'shelf:planManual': '在架即有码，不存在「有量无码」',
    'disp-out:none': '处方必有清单',
    'disp-out:zero': '处方必带数量',
    'tray-out:none': '摆药单必有清单',
    'tray-out:zero': '摆药单必带数量'
  };
  // 单元格一句话规则覆盖（未登记 = 场景 rule + 清单态通用 rule 拼接）
  var CELL_RULE = {
    'req-in:planPre': '库房备货已逐码扫码：可整单直接审核（信任短路），也可逐码复核；审核后码落「待上架」',
    'shelf:none': '扫本药房「待上架」码直接上架（码驱动建清单），选货位后扫即生效',
    'shelf:zero': '只告品种待上架：在架且品种在清单才放行',
    'shelf:planPre': '待上架清单逐码扫：写货位 + 标已上架，扫完自动「全部上架」',
    'disp-out:planPre': '预赋码处方（T1 药柜预设顺序）：扫码=核对预赋码单，外码=多赋×',
    'disp-out:planManual': '调剂扫码绑码主线：边扫边拿；拆零演示——不勾拆零扫第 3 盒=超量×，勾拆零=只取差额 1 片',
    'tray-out:planPre': '自动赋码已配齐：逐码复核（重复=⚠，单外=×）',
    'tray-out:planManual': '先点「⚡ 自动赋码」FIFO 配码：尿素支码配 3、盒码超额跳过、加罗新无码 warn；再拆零补 2 支收尾'
  };

  // 单元格按钮短名（矩阵格内显示；缺省用列名）
  var CELL_LABEL = {
    'pur-in:none': '人工新增', 'pur-in:zero': '只告品种', 'pur-in:planPre': '码单下载', 'pur-in:planManual': '按申请量收货',
    'pick-out:none': '直接出库', 'pick-out:zero': '只告品种', 'pick-out:planManual': '按申请量拣货 ·主',
    'req-in:none': '库房直发无单', 'req-in:zero': '只告品种', 'req-in:planPre': '在途单复核 ·主', 'req-in:planManual': '按申请量收货',
    'shelf:none': '扫在架码直上架', 'shelf:zero': '只告品种', 'shelf:planPre': '待上架清单 ·主',
    'disp-out:planPre': '预赋码核对（药柜）', 'disp-out:planManual': '调剂扫码绑码 ·主+拆零',
    'tray-out:planPre': '配码后复核', 'tray-out:planManual': '先拿药后赋码 ·主+自动赋码'
  };

  // ===== 沙盒设施：20 位码（标识码7+序列9+校验4） =====
  function mk(idc, serial, chk) { return idc + serial + chk; }
  function C(idc, serial) { return mk(idc, serial, '0001'); }
  // 沙盒库存快照：code → { node, shelf }（shelf 仅药房节点有：待上架/已上架；入库审核落药房自动带「待上架」）
  var STOCK_SEED = {};
  function stock(code, node, shelf) { STOCK_SEED[code] = { node: node, shelf: shelf || '' }; }
  // 中心库
  ['000000001', '000000002', '000000003', '000000004', '000000005'].forEach(function (s) { stock(C('8148790', s), '中心库'); });
  stock(C('8852478', '000000001'), '中心库'); stock(C('8852478', '000000002'), '中心库');
  stock(C('8461935', '000000001'), '中心库'); stock(C('8461935', '000000002'), '中心库');
  stock(C('8416917', '000000001'), '中心库');
  stock(C('8400431', '000000201'), '中心库');          // 乳酸依沙吖啶（同时被占用）
  // 门诊药房：已上架集 + 待上架集（③→④ 连演的初始货源）
  stock(C('8148790', '000000101'), '门诊药房', V.SHELVED);
  stock(C('8416917', '000000101'), '门诊药房', V.SHELVED); stock(C('8416917', '000000102'), '门诊药房', V.SHELVED);
  stock(C('8461935', '000000101'), '门诊药房', V.SHELVED); stock(C('8461935', '000000102'), '门诊药房', V.SHELVED); stock(C('8461935', '000000103'), '门诊药房', V.SHELVED);
  stock(C('8433386', '000000101'), '门诊药房', '待上架'); stock(C('8433386', '000000102'), '门诊药房', '待上架');
  stock(C('8852478', '000000101'), '门诊药房', '待上架');
  stock(C('8461935', '000000104'), '门诊药房', '待上架');
  // 住院药房（支码只放 3 支：planManual 格自动赋码配不齐 → 缺数 warn + 拆零收尾演示；加罗新不在 → 无码可赋）
  ['000000201', '000000202', '000000203'].forEach(function (s) { stock(C('8148790', s), '住院药房'); });
  stock(C('8852478', '000000201'), '住院药房');
  stock(C('8416917', '000000201'), '住院药房');
  // 占用池：码已挂其他未完结单据（「被占用」拦截演示）；在途码不在库存 → 入库场景能走到占用校验
  var OCCUPIED = {};
  OCCUPIED[C('8400431', '000000201')] = 'LAB-QT-0001 其他出库单（未完结）';
  OCCUPIED[C('8148790', '000000399')] = 'LAB-LY-999 领用出库单（在途）';
  // 演示三期（沙盒固定值）
  var DEMO_BATCH = { batch: '260501', prodDate: '2026-05-01', expDate: '2028-04-30' };
  function mkCode(idc, serial, chk, extra) {
    return Object.assign({ code: mk(idc, serial, chk), batch: DEMO_BATCH.batch,
      prodDate: DEMO_BATCH.prodDate, expDate: DEMO_BATCH.expDate,
      checked: false, split: '否', splitQty: '', time: '' }, extra || {});
  }
  // 药房货位（上架场景扫码即写）
  var SHELF_LOCS = ['M-01', 'M-02', 'M-03'];

  // ===== 单据种子（key = 场景:清单态；item.planQty 一律销售单位；有码单格预置 codes） =====
  function seedDocs() {
    var D = {};
    function doc(scene, col, billNo, items, codes) {
      var sc = null;
      SCENES.forEach(function (s) { if (s.key === scene) sc = s; });
      D[scene + ':' + col] = { billNo: billNo, title: sc.example + '（' + colTitle(col) + '）', node: sc.node,
        status: V.PENDING_AUDIT, items: items || [], codes: codes || [], badCodes: [], auditTime: '', auditor: '', curLoc: 'M-01' };
    }
    function colTitle(k) { for (var i = 0; i < COLS.length; i++) if (COLS[i].k === k) return COLS[i].t; return k; }
    var U = 'YP010601', YM = 'YP010245', LS = 'YP010201', WK = 'YP010401', JS = 'YP010312', JL = 'YP010388';
    // ①采购入库（中心库·入）
    doc('pur-in', 'none', 'LAB-CG-101');
    doc('pur-in', 'zero', 'LAB-CG-102', [{ drugCode: U, planQty: 0 }, { drugCode: LS, planQty: 0 }]);
    doc('pur-in', 'planPre', 'LAB-CG-103', [{ drugCode: U, planQty: 2 }, { drugCode: YM, planQty: 7 }],
      [mkCode('8148790', '000000401', '0001'), mkCode('8148790', '000000402', '0001'), mkCode('8461935', '000000401', '0001')]);
    doc('pur-in', 'planManual', 'LAB-CG-104', [{ drugCode: YM, planQty: 14 }, { drugCode: U, planQty: 20 }]);
    // ②库房备货出库（中心库·出）
    doc('pick-out', 'none', 'LAB-BH-201');
    doc('pick-out', 'zero', 'LAB-BH-202', [{ drugCode: U, planQty: 0 }, { drugCode: YM, planQty: 0 }]);
    doc('pick-out', 'planManual', 'LAB-BH-203', [{ drugCode: U, planQty: 20 }, { drugCode: YM, planQty: 7 }]);
    // ③药房领用入库（门诊药房·入；planPre=在途单复核，预置码不在库存=在途）
    doc('req-in', 'none', 'LAB-LY-301');
    doc('req-in', 'zero', 'LAB-LY-302', [{ drugCode: U, planQty: 0 }, { drugCode: LS, planQty: 0 }]);
    doc('req-in', 'planPre', 'LAB-LY-303', [{ drugCode: U, planQty: 2 }, { drugCode: YM, planQty: 7 }],
      [mkCode('8148790', '000000301', '0001'), mkCode('8148790', '000000302', '0001'), mkCode('8461935', '000000301', '0001')]);
    doc('req-in', 'planManual', 'LAB-LY-304', [{ drugCode: YM, planQty: 14 }, { drugCode: U, planQty: 20 }]);
    // ④药房药品上架（门诊药房·移位；planPre 预置码=待上架集）
    doc('shelf', 'none', 'LAB-SJ-401');
    doc('shelf', 'zero', 'LAB-SJ-402', [{ drugCode: U, planQty: 0 }, { drugCode: JS, planQty: 0 }]);
    doc('shelf', 'planPre', 'LAB-SJ-403', [{ drugCode: JS, planQty: 72 }, { drugCode: U, planQty: 10 }],
      [mkCode('8433386', '000000101', '0001'), mkCode('8433386', '000000102', '0001'), mkCode('8852478', '000000101', '0001')]);
    // ⑤门诊出药（门诊药房·出；planPre=预赋码处方核对）
    doc('disp-out', 'planPre', 'LAB-RX-501', [{ drugCode: WK, planQty: 1 }],
      [mkCode('8416917', '000000102', '0001')]);
    doc('disp-out', 'planManual', 'LAB-RX-502', [{ drugCode: WK, planQty: 2 }, { drugCode: YM, planQty: 15 }]);
    // ⑥住院摆药出药（住院药房·出；planPre=自动赋码已配齐·逐码复核：支码×3+盒码×1=13 支、唯可来 1 盒）
    doc('tray-out', 'planPre', 'LAB-BY-601', [{ drugCode: U, planQty: 13 }, { drugCode: WK, planQty: 1 }],
      [mkCode('8148790', '000000201', '0001'), mkCode('8148790', '000000202', '0001'), mkCode('8148790', '000000203', '0001'),
       mkCode('8852478', '000000201', '0001'), mkCode('8416917', '000000201', '0001')]);
    doc('tray-out', 'planManual', 'LAB-BY-602', [{ drugCode: U, planQty: 5 }, { drugCode: WK, planQty: 1 }, { drugCode: JL, planQty: 1 }]);
    return D;
  }

  // ===== 演示码速查（key = 场景:清单态；tag=首扫预期 ok/warn/bad；split=点击时自动勾拆零；auto=触发自动赋码） =====
  var DEMO_CODES = {
    'pur-in:none': [
      { code: C('8148790', '000000501'), tag: 'ok', label: '✓ 尿素乳膏 支码（+1 支，自动建药品行）' },
      { code: C('8400431', '000000501'), tag: 'ok', label: '✓ 乳酸依沙吖啶 盒码（再建一行）' },
      { code: C('8852478', '000000501'), tag: 'ok', label: '✓ 尿素乳膏 盒码（层级换算 +10 支）' },
      { code: C('8148790', '000000501'), tag: 'warn', label: '! 重复扫码（上方 ✓ 支码再扫一次）' },
      { code: C('8999999', '000000501'), tag: 'bad', label: '× 解析失败（标识码 8999999 未维护）' },
      { code: C('8148790', '000000001'), tag: 'bad', label: '× 重复入库（该码已在中心库在架）' },
      { code: C('8148790', '000000399'), tag: 'bad', label: '× 被占用（已挂在途单 LAB-LY-999）' }
    ],
    'pur-in:zero': [
      { code: C('8148790', '000000601'), tag: 'ok', label: '✓ 尿素乳膏 支码（在清单，+1 支）' },
      { code: C('8852478', '000000601'), tag: 'ok', label: '✓ 尿素乳膏 盒码（+10 支，累计 11 支）' },
      { code: C('8148790', '000000601'), tag: 'warn', label: '! 重复扫码' },
      { code: C('8416917', '000000602'), tag: 'bad', label: '× 不在清单内（唯可来不在本单清单）' },
      { code: C('8148790', '000000001'), tag: 'bad', label: '× 重复入库（该码已在中心库在架）' }
    ],
    'pur-in:planPre': [
      { code: C('8148790', '000000401'), tag: 'ok', label: '✓ 码单内 支码（标记已验收）' },
      { code: C('8461935', '000000401'), tag: 'ok', label: '✓ 码单内 依姆多盒码（+1 盒=7 片，备齐）' },
      { code: C('8148790', '000000401'), tag: 'warn', label: '! 重复验收（该码已核对过）' },
      { code: C('8433386', '000000401'), tag: 'bad', label: '× 不在码单内（多送/串货，登记异常码）' },
      { code: C('8148790', '000000001'), tag: 'bad', label: '× 重复入库（在架码扫到，先拦截）' }
    ],
    'pur-in:planManual': [
      { code: C('8461935', '000000402'), tag: 'ok', label: '✓ 依姆多 盒码（+1 盒=7 片，7/14 片）' },
      { code: C('8852478', '000000402'), tag: 'ok', label: '✓ 尿素乳膏 盒码（+10 支，10/20 支）' },
      { code: C('8852478', '000000403'), tag: 'ok', label: '✓ 尿素乳膏 盒码（+10 支，20/20 ✓备齐）' },
      { code: C('8852478', '000000404'), tag: 'bad', label: '× 超数量（再 +10 支 = 超 10 支）' },
      { code: C('8414784', '000000401'), tag: 'bad', label: '× 不在清单内（加罗新不在申请清单）' },
      { code: C('8461935', '000000402'), tag: 'warn', label: '! 重复扫码' }
    ],
    'pick-out:none': [
      { code: C('8148790', '000000001'), tag: 'ok', label: '✓ 尿素乳膏 支码（中心库在架，+1 支）' },
      { code: C('8148790', '000000002'), tag: 'ok', label: '✓ 尿素乳膏 支码（再扫一支）' },
      { code: C('8148790', '000000001'), tag: 'warn', label: '! 重复扫码' },
      { code: C('8148790', '000000101'), tag: 'bad', label: '× 不在库房内（该码在门诊药房）' },
      { code: C('8148790', '000000199'), tag: 'bad', label: '× 不在库房内（无库存记录）' },
      { code: C('8400431', '000000201'), tag: 'bad', label: '× 被占用（已挂 LAB-QT-0001 未完结单）' }
    ],
    'pick-out:zero': [
      { code: C('8148790', '000000003'), tag: 'ok', label: '✓ 尿素乳膏 支码（在架且在清单）' },
      { code: C('8461935', '000000001'), tag: 'ok', label: '✓ 依姆多 盒码（在架且在清单）' },
      { code: C('8148790', '000000003'), tag: 'warn', label: '! 重复扫码' },
      { code: C('8416917', '000000001'), tag: 'bad', label: '× 不在清单内（唯可来在架但不在清单）' },
      { code: C('8148790', '000000199'), tag: 'bad', label: '× 不在库房内（无库存记录）' }
    ],
    'pick-out:planManual': [
      { code: C('8148790', '000000004'), tag: 'ok', label: '✓ 尿素乳膏 支码（+1 支，1/20 支）' },
      { code: C('8852478', '000000001'), tag: 'ok', label: '✓ 尿素乳膏 盒码（+10 支，11/20 支）' },
      { code: C('8461935', '000000002'), tag: 'ok', label: '✓ 依姆多 盒码（+1 盒=7 片，备齐）' },
      { code: C('8852478', '000000002'), tag: 'bad', label: '× 超数量（再 +10 支 = 21/20 超 1 支）' },
      { code: C('8148790', '000000101'), tag: 'bad', label: '× 不在库房内（该码在门诊药房）' },
      { code: C('8148790', '000000004'), tag: 'warn', label: '! 重复扫码' }
    ],
    'req-in:none': [
      { code: C('8148790', '000000701'), tag: 'ok', label: '✓ 尿素乳膏 支码（库房直发无单，录入建行）' },
      { code: C('8400431', '000000701'), tag: 'ok', label: '✓ 乳酸依沙吖啶 盒码' },
      { code: C('8148790', '000000701'), tag: 'warn', label: '! 重复扫码' },
      { code: C('8148790', '000000101'), tag: 'bad', label: '× 重复入库（该码已在门诊药房在架）' },
      { code: C('8148790', '000000399'), tag: 'bad', label: '× 被占用（已挂在途单 LAB-LY-999）' }
    ],
    'req-in:zero': [
      { code: C('8148790', '000000702'), tag: 'ok', label: '✓ 尿素乳膏 支码（在清单，+1 支）' },
      { code: C('8852478', '000000702'), tag: 'ok', label: '✓ 尿素乳膏 盒码（+10 支）' },
      { code: C('8148790', '000000702'), tag: 'warn', label: '! 重复扫码' },
      { code: C('8416917', '000000701'), tag: 'bad', label: '× 不在清单内（唯可来不在本单清单）' },
      { code: C('8148790', '000000101'), tag: 'bad', label: '× 重复入库（该码已在门诊药房在架）' }
    ],
    'req-in:planPre': [
      { code: C('8148790', '000000301'), tag: 'ok', label: '✓ 在途码 支码（复核验收 1/3）' },
      { code: C('8461935', '000000301'), tag: 'ok', label: '✓ 在途码 依姆多盒码（+1 盒=7 片，备齐）' },
      { code: C('8148790', '000000301'), tag: 'warn', label: '! 重复验收（该码已核对过）' },
      { code: C('8433386', '000000301'), tag: 'bad', label: '× 不在码单内（多送/串货，登记异常码）' },
      { code: C('8148790', '000000101'), tag: 'bad', label: '× 重复入库（该码已在门诊药房在架）' }
    ],
    'req-in:planManual': [
      { code: C('8461935', '000000701'), tag: 'ok', label: '✓ 依姆多 盒码（+1 盒=7 片，7/14 片）' },
      { code: C('8852478', '000000701'), tag: 'ok', label: '✓ 尿素乳膏 盒码（+10 支，10/20 支）' },
      { code: C('8852478', '000000703'), tag: 'ok', label: '✓ 尿素乳膏 盒码（+10 支，20/20 ✓备齐）' },
      { code: C('8852478', '000000704'), tag: 'bad', label: '× 超数量（再 +10 支 = 超 10 支）' },
      { code: C('8852478', '000000701'), tag: 'warn', label: '! 重复扫码（上方 ✓ 盒码再扫一次）' }
    ],
    'shelf:none': [
      { code: C('8461935', '000000104'), tag: 'ok', label: '✓ 依姆多 盒码（待上架 → 写货位已上架，建行）' },
      { code: C('8433386', '000000101'), tag: 'ok', label: '✓ 健脾生血片 盒码（待上架 → 已上架）' },
      { code: C('8461935', '000000104'), tag: 'warn', label: '! 重复上架（该码已上架）' },
      { code: C('8148790', '000000001'), tag: 'bad', label: '× 不在本药房（该码在中心库）' },
      { code: C('8999999', '000000801'), tag: 'bad', label: '× 解析失败（标识码 8999999 未维护）' }
    ],
    'shelf:zero': [
      { code: C('8433386', '000000102'), tag: 'ok', label: '✓ 健脾生血片 盒码（在清单待上架）' },
      { code: C('8852478', '000000101'), tag: 'ok', label: '✓ 尿素乳膏 盒码（在清单待上架，+10 支）' },
      { code: C('8433386', '000000102'), tag: 'warn', label: '! 重复上架' },
      { code: C('8461935', '000000104'), tag: 'bad', label: '× 不在清单内（依姆多待上架但不在本单）' },
      { code: C('8148790', '000000001'), tag: 'bad', label: '× 不在本药房（该码在中心库）' }
    ],
    'shelf:planPre': [
      { code: C('8433386', '000000101'), tag: 'ok', label: '✓ 健脾生血片 盒码（待上架 → M-01）' },
      { code: C('8433386', '000000102'), tag: 'ok', label: '✓ 健脾生血片 盒码（备齐 2/2 盒）' },
      { code: C('8852478', '000000101'), tag: 'ok', label: '✓ 尿素乳膏 盒码（备齐 10/10 支）' },
      { code: C('8433386', '000000101'), tag: 'warn', label: '! 重复上架' },
      { code: C('8148790', '000000101'), tag: 'warn', label: '! 重复上架（该码已在架上）' },
      { code: C('8148790', '000000001'), tag: 'bad', label: '× 不在本药房（该码在中心库）' }
    ],
    'disp-out:planPre': [
      { code: C('8416917', '000000102'), tag: 'ok', label: '✓ 预赋码 唯可来盒码（核对验收）' },
      { code: C('8416917', '000000102'), tag: 'warn', label: '! 重复验收' },
      { code: C('8461935', '000000101'), tag: 'bad', label: '× 不在码单内（多赋/串货，登记异常码）' },
      { code: C('8148790', '000000001'), tag: 'bad', label: '× 不在库房内（该码在中心库）' }
    ],
    'disp-out:planManual': [
      { code: C('8416917', '000000101'), tag: 'ok', label: '✓ 唯可来 盒码（1/2 盒）' },
      { code: C('8416917', '000000102'), tag: 'ok', label: '✓ 唯可来 盒码（2/2 ✓备齐）' },
      { code: C('8461935', '000000101'), tag: 'ok', label: '✓ 依姆多 盒码（+1 盒=7 片，7/15 片）' },
      { code: C('8461935', '000000102'), tag: 'ok', label: '✓ 依姆多 盒码（14/15 片）' },
      { code: C('8461935', '000000103'), tag: 'bad', label: '× 超数量（不勾拆零扫第 3 盒：+7 片=超 6 片）' },
      { code: C('8461935', '000000103'), tag: 'ok', split: true, label: '✓ 拆零扫码（点我自动勾拆零：只取差额 1 片、余 6 片回架 → 备齐）' },
      { code: C('8416917', '000000101'), tag: 'warn', label: '! 重复扫码' },
      { code: C('8999999', '000000901'), tag: 'bad', label: '× 解析失败（去向：异常赋码台账 → 补绑/重新赋码）' },
      { code: C('8148790', '000000001'), tag: 'bad', label: '× 不在库房内（该码在中心库）' }
    ],
    'tray-out:planPre': [
      { code: C('8148790', '000000201'), tag: 'ok', label: '✓ 已配码 支码（复核 1/5）' },
      { code: C('8852478', '000000201'), tag: 'ok', label: '✓ 已配码 尿素乳膏盒码（+10 支）' },
      { code: C('8148790', '000000201'), tag: 'warn', label: '! 重复验收' },
      { code: C('8461935', '000000301'), tag: 'bad', label: '× 不在本房在架（先被方向闸门拦）' }
    ],
    'tray-out:planManual': [
      { auto: true, tag: 'warn', label: '⚡ 自动赋码（点我 = FIFO 整码配齐：尿素支码×3、唯可来盒码✓；尿素缺 2 支 + 加罗新无码 ⚠）' },
      { code: C('8148790', '000000201'), tag: 'warn', label: '! 重复扫码（自动赋码已配过该码）' },
      { code: C('8852478', '000000201'), tag: 'bad', label: '× 超数量（盒码 +10 支 > 缺 2 支，整码塞不进）' },
      { code: C('8852478', '000000201'), tag: 'ok', split: true, label: '✓ 拆零扫码（点我自动勾拆零：只取差额 2 支、余 8 支回架 → 备齐）' },
      { code: C('8999999', '000000902'), tag: 'bad', label: '× 解析失败（去向：异常赋码台账 → 补绑/重新赋码）' }
    ]
  };

  window.PUL_SCAN_LAB_DATA = { COLS: COLS, SCENES: SCENES, CELL_GREY: CELL_GREY, CELL_RULE: CELL_RULE, CELL_LABEL: CELL_LABEL,
    mk: mk, mkCode: mkCode, STOCK_SEED: STOCK_SEED, OCCUPIED: OCCUPIED, SHELF_LOCS: SHELF_LOCS, DEMO_BATCH: DEMO_BATCH,
    seedDocs: seedDocs, DEMO_CODES: DEMO_CODES };
})();
