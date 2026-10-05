/**
 * wh-data.js — 库房管理 Mock 数据（store 命名空间 wh）
 * 码状态机原型实现 = 集合推导（与 pch.stockCodes 同款扩展）：
 *   在架 = 采购入库单(已审核) + 其他入库单(已审核) + 退回入库单(已审核)
 *        − 采购退货单(已审核) − 领用单(已出库·待入库/已入库·待上架) − 其他出库单(已审核) − 损耗出库(已审核)
 *   在途 = 领用单 status='已出库·待入库'（出库审核即扣账）；'已入库·待上架' 闭环；「已上架」为推导展示态
 * 领用单 = 单池 pickDocs（2026-10-05 两池并一池：申请/备货/出库/入库全程同单同号，reqPool 已废除）
 */
(function () {
  'use strict';

  // ===== 业务枚举（基础字典 IO_TYPE 的业务化子集；损耗原因 Q7 拍板=要） =====
  var OTH_IN_TYPES = ['赠品入库', '期初补录', '其他'];
  var OTH_OUT_TYPES = ['借出', '样品', '其他'];
  var LOSS_REASONS = ['破损', '过期', '污染', '其他'];
  var LOSS_SOURCES = ['日常报损', '盘亏转入', '数据迁移'];

  // 码记录（与 pch code() 同形状）
  function code(idcode, serial, check, batch, prod, exp, extra) {
    return Object.assign({ code: idcode + serial + check, level: 1, split: '否', splitQty: '',
      batch: batch, prodDate: prod, expDate: exp, checked: false, code2: '', code3: '', location: '' }, extra || {});
  }
  function codes(idcode, from, n, batch, prod, exp, extra) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(code(idcode, String(from + i).padStart(9, '0'), '8000', batch, prod, exp, extra));
    return out;
  }

  // ===== 种子 =====
  // 其他入库单·期初补录（已审核）：让库存有非采购来源数据（依姆多/唯可来/健脾生血片）
  var OTH_IN_SEED_CODES = [].concat(
    codes('8461935', 500001, 6, '250603', '2025-06-15', '2028-06-14', { checked: true, location: 'A-02-01' }),
    codes('8416917', 500101, 3, '250704', '2025-07-20', '2027-07-19', { checked: true, location: 'A-02-02' }),
    codes('8433386', 500201, 4, '250805', '2025-08-10', '2026-12-09', { checked: true, location: 'B-02-01' })
  );
  // 2026-10-04 期初补录第三批：给领用入库单演示供码（9 码：依姆多2/唯可来1/健脾2/复方氨基酸2/复方甘草2）
  var OTH_IN3_CODES = [].concat(
    codes('8461935', 500009, 2, '250603', '2025-06-15', '2028-06-14', { checked: true, location: 'A-02-01' }),
    codes('8416917', 500105, 1, '250704', '2025-07-20', '2027-07-19', { checked: true, location: 'A-02-02' }),
    codes('8433386', 500205, 2, '250805', '2025-08-10', '2026-12-09', { checked: true, location: 'B-02-01' }),
    codes('8130779', 500501, 2, '250910', '2025-09-15', '2027-09-14', { checked: true, location: 'B-02-02' }),
    codes('8441916', 500401, 2, '250920', '2025-09-25', '2027-03-24', { checked: true, location: 'B-02-03' })
  );
  var OTH_IN_DOCS = [
    { billNo: 'QTRK20260901001', date: '2026-09-01 09:30', type: '期初补录', supplier: '', warehouse: '中心库', remark: '系统上线期初库存补录',
      status: '已审核', auditTime: '2026-09-01 10:05', auditor: '王铁军', codes: OTH_IN_SEED_CODES },
    // 未审核演示单：扫码入库入口开箱可见（码 000500301 为全新码，不在在架；批次挂码记录）
    { billNo: 'QTRK20261002001', date: '2026-10-02 14:20', type: '赠品入库', supplier: '国药控股福建有限公司', warehouse: '中心库', remark: '厂家赠品随货同行',
      status: '未审核', auditTime: '', auditor: '',
      codes: [code('8461935', '000500301', '0000', '250915', '2025-09-10', '2027-09-09', { checked: true })] },
    // 2026-10-03 期初补录第二批：给其他出库演示单供码（依姆多 500007-500008 / 唯可来 500104）
    { billNo: 'QTRK20261003001', date: '2026-10-03 09:10', type: '期初补录', supplier: '', warehouse: '中心库', remark: '期初补录第二批',
      status: '已审核', auditTime: '2026-10-03 09:25', auditor: '王铁军',
      codes: [].concat(
        codes('8461935', 500007, 2, '250603', '2025-06-15', '2028-06-14', { checked: true, location: 'A-02-01' }),
        codes('8416917', 500104, 1, '250704', '2025-07-20', '2027-07-19', { checked: true, location: 'A-02-02' })) },
    // 2026-10-04 期初补录第三批：给领用入库单演示供码（审核在架 → 被领用在途/已入库扣减）
    { billNo: 'QTRK20261004001', date: '2026-10-04 08:50', type: '期初补录', supplier: '', warehouse: '中心库', remark: '期初补录第三批（领用入库演示供码）',
      status: '已审核', auditTime: '2026-10-04 09:05', auditor: '王铁军',
      codes: OTH_IN3_CODES }
  ];
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
  // 退回单池（药房退回出库单，待库房接收入库）：码必须来自已领出（在途/药房在架）的码；splitQty>0 演示拆零退回提示
  // refNo = 来源领用出库单号（2026-10-03 拍板：药房退回必须从领用出库单发起；库房直收为空）
  var RET_POOL = [
    { retNo: 'TH20260914001', date: '2026-09-14 10:20', pharmacy: '门诊药房', warehouse: '中心库', operator: '陈静', status: '待入库',
      refNo: 'LYCK20260913001',
      codes: [Object.assign({}, OTH_IN_SEED_CODES[1], { split: '是', splitQty: 4 }), Object.assign({}, OTH_IN_SEED_CODES[2])] },
    { retNo: 'TH20260914002', date: '2026-09-14 11:05', pharmacy: '门诊药房', warehouse: '中心库', operator: '陈静', status: '待入库',
      refNo: 'LYCK20260912001',
      codes: [Object.assign({}, OTH_IN_SEED_CODES[10])] }
  ];
  // 其他出库单种子：2 条已审核（借出/样品，码出库房不再在架）+ 1 条未审核草稿（演示扫码→审核）
  // 码取 OTH_IN_SEED_CODES 未被占用者：[3][4]=唯可来 500004/500005、[12]=健脾 500204、[7]=依姆多 500102
  var OTH_OUT_DOCS = [
    { billNo: 'QTCK20260920001', date: '2026-09-20 10:15', type: '借出', receiver: '滨海院区急诊科', warehouse: '中心库',
      remark: '急诊抢救车临时借药，下周归还', status: '已审核', auditTime: '2026-09-20 10:32', auditor: '王铁军',
      codes: [Object.assign({}, OTH_IN_SEED_CODES[3]), Object.assign({}, OTH_IN_SEED_CODES[4])] },
    { billNo: 'QTCK20260928001', date: '2026-09-28 15:40', type: '样品', receiver: '市药品检验所', warehouse: '中心库',
      remark: '年度抽检送样', status: '已审核', auditTime: '2026-09-28 16:02', auditor: '王铁军',
      codes: [Object.assign({}, OTH_IN_SEED_CODES[12])] },
    { billNo: 'QTCK20261002001', date: '2026-10-02 11:10', type: '其他', receiver: '设备科', warehouse: '中心库',
      remark: '未审核草稿演示：可继续扫码、审核后扣账', status: '未审核', auditTime: '', auditor: '',
      codes: [Object.assign({}, OTH_IN_SEED_CODES[7])] },
    // 2026-10-03 补模拟数据：①已审核借出单 ②未审核带码草稿（演示行内扫码/编辑/审核/删除）
    { billNo: 'QTCK20260930001', date: '2026-09-30 16:45', type: '借出', receiver: '滨海院区骨科', warehouse: '中心库',
      remark: '骨科手术临时借药', status: '已审核', auditTime: '2026-09-30 17:02', auditor: '王铁军',
      codes: [Object.assign({}, OTH_IN_SEED_CODES[5])] },
    { billNo: 'QTCK20261001001', date: '2026-10-01 15:20', type: '样品', receiver: '省药械展组委会', warehouse: '中心库',
      remark: '展会送样，待审核', status: '未审核', auditTime: '', auditor: '',
      codes: [Object.assign({}, OTH_IN_SEED_CODES[8])] }
  ];
  // 损耗出库单种子（已审核；来源列：日常报损/盘亏转入/数据迁移 —— Q1 拍板口径）
  var LOSS_DOCS = [
    { billNo: 'SHCK20260905001', date: '2026-09-05 11:20', reason: '破损', source: '日常报损', warehouse: '中心库',
      status: '已审核', auditTime: '2026-09-05 11:40', auditor: '王铁军', remark: '搬运跌落破损',
      codes: [Object.assign({}, OTH_IN_SEED_CODES[11])] },
    { billNo: 'SHCK20260820001', date: '2026-08-20 15:30', reason: '过期', source: '数据迁移', warehouse: '中心库',
      status: '已审核', auditTime: '2026-08-20 15:45', auditor: '王铁军', remark: '老系统迁移的历史报损',
      codes: [code('8400431', '000490001', '8000', '240301', '2024-03-10', '2026-03-09', { checked: true })] }
  ];

  function migrate(s) {
    ['pickDocs', 'retInDocs', 'othInDocs', 'othOutDocs', 'lossDocs', 'reqPool', 'retPool', 'phLossDocs'].forEach(function (k) {
      if (!s[k]) s[k] = [];
    });
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
    // 2026-10-03 退回单加 refNo（来源领用出库单号），老数据兜底 + 种子两单回填
    (s.retPool || []).forEach(function (r) {
      if (r.refNo === undefined) r.refNo = '';
    });
    var RET_REF_SEED = { TH20260914001: 'LYCK20260913001', TH20260914002: 'LYCK20260912001' };
    (s.retPool || []).forEach(function (r) {
      if (!r.refNo && RET_REF_SEED[r.retNo]) r.refNo = RET_REF_SEED[r.retNo];
    });
    // 2026-10-03 其他入库单加供应商 + 单据级批次默认值（扫码随单取用），老数据兜底
    (s.othInDocs || []).forEach(function (d) {
      if (d.supplier === undefined) d.supplier = '';
      if (d.batch === undefined) d.batch = '';
      if (d.prodDate === undefined) d.prodDate = '';
      if (d.expDate === undefined) d.expDate = '';
    });
    // 老会话种子：已入库单若完全没货位，补一码已上架便于演示（不覆盖用户已上架）
    (s.pickDocs || []).forEach(function (d) {
      if (d.billNo === 'LYCK20260912001' && d.codes && d.codes[0] &&
          !d.codes.some(function (c) { return c.phLoc; })) {
        d.codes[0].phLoc = 'M-01';
      }
    });
    // 老会话补种：其他入库演示单（2026-10-03 引入，按 billNo 幂等注入，与其他出库同口径）
    OTH_IN_DOCS.forEach(function (d) {
      if (!s.othInDocs.some(function (x) { return x.billNo === d.billNo; })) s.othInDocs.push(d);
    });
    // 老会话补种：其他出库单演示数据（2026-10-03 引入，按 billNo 幂等注入，不覆盖用户已建单）
    OTH_OUT_DOCS.forEach(function (d) {
      if (!s.othOutDocs.some(function (x) { return x.billNo === d.billNo; })) s.othOutDocs.push(d);
    });
    return s;
  }
  function load() {
    var s = window.store ? window.store.load() : {};
    if (s.wh) return migrate(s.wh);
    var seed = { pickDocs: PICK_DOCS, retInDocs: [], othInDocs: OTH_IN_DOCS, othOutDocs: OTH_OUT_DOCS,
      lossDocs: LOSS_DOCS, reqPool: [], retPool: RET_POOL, phLossDocs: [] };
    if (window.store) window.store.update({ wh: seed });
    return seed;
  }
  function save(state) { if (window.store) window.store.update({ wh: state }); }

  // ===== 全局在架码集合（库房库存查询的事实源；每码带 _src 来源单据） =====
  function matchNode(d, warehouse) {
    if (!warehouse) return true;
    return d.warehouse === warehouse;
  }
  function pickPosted(d) {
    return d.status === '已出库·待入库' || d.status === '已入库·待上架' || d.status === '已上架';
  }
  // 展示态推导：已入库·待上架 且全码有 phLoc → 已上架（不落库，2026-10-05 拍板#3）
  function pickStatus(d) {
    if (d.status === '已入库·待上架' && (d.codes || []).length &&
        d.codes.every(function (c) { return c.phLoc; })) return '已上架';
    return d.status;
  }
  function stockAll(pch, wh, warehouse) {
    var map = {};
    function addIn(codes, src) { (codes || []).forEach(function (c) { map[c.code] = Object.assign({}, c, { _src: src }); }); }
    function addOut(codes) { (codes || []).forEach(function (c) { delete map[c.code]; }); }
    (pch.inDocs || []).forEach(function (d) {
      if (d.audit === '已审核' && matchNode(d, warehouse)) addIn(d.codes, '采购入库单 ' + d.billNo);
    });
    (wh.othInDocs || []).forEach(function (d) {
      if (d.status === '已审核' && matchNode(d, warehouse)) addIn(d.codes, '其他入库单 ' + d.billNo);
    });
    (wh.retInDocs || []).forEach(function (d) {
      if (d.status === '已审核' && matchNode(d, warehouse)) addIn(d.codes, '退回入库单 ' + d.billNo);
    });
    (pch.outDocs || []).forEach(function (d) {
      if (d.status === '已审核' && matchNode(d, warehouse)) addOut(d.codes);
    });
    (wh.pickDocs || []).forEach(function (d) {
      if (pickPosted(d) && matchNode(d, warehouse)) addOut(d.codes);
    });
    (wh.othOutDocs || []).forEach(function (d) {
      if (d.status === '已审核' && matchNode(d, warehouse)) addOut(d.codes);
    });
    (wh.lossDocs || []).forEach(function (d) {
      if (d.status === '已审核' && matchNode(d, warehouse)) addOut(d.codes);
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  // 在途码 = 领用单「已出库·待入库」未闭环的码（含来源单号，库房库存查询「在途数」列）
  function transitByReq(wh, warehouse) {
    var map = {};
    (wh.pickDocs || []).forEach(function (d) {
      if (d.status !== '已出库·待入库') return;
      if (warehouse && d.warehouse !== warehouse) return;
      (d.codes || []).forEach(function (c) {
        var key = c.code.slice(0, 7) + '|' + c.batch;   // 标识码+批次（2026-10-02 收口：与库存账行粒度对齐）
        map[key] = (map[key] || 0) + 1;
      });
    });
    return map;
  }
  // 在架码按 标识码+批次 聚合（复用 pch.summarize；挂库位/来源）
  function summarizeStock(codes, dict) {
    return window.PUL_PCH.summarize(codes, dict);
  }
  // 效期状态：过期 / 预警(≤180天) / 正常
  function expStatus(expDate) {
    var today = new Date('2026-09-14');
    var exp = new Date(expDate);
    if (exp < today) return '过期';
    if ((exp - today) / 86400000 <= 180) return '预警';
    return '正常';
  }
  // 新单号：前缀 + 日期 + 3 位序号（原型口径）
  function nextNo(prefix, list, field) {
    field = field || 'billNo';
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var ymd = '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var n = list.filter(function (x) { return (x[field] || '').indexOf(prefix + ymd) === 0; }).length + 1;
    return prefix + ymd + ('00' + n).slice(-3);
  }
  // 登录节点是药房则用之，否则演示兜底门诊药房（从 plan 直达/库房账号预览药房页）
  function curPharm() {
    var u = (window.store && window.store.load().currentUser) || {};
    var name = u.warehouse || '';
    var nodes = window.PUL ? window.PUL.nodesOfOrg(u.org) : [];
    var type = '';
    for (var i = 0; i < nodes.length; i++) if (nodes[i].name === name) { type = nodes[i].type; break; }
    if (window.PUL && window.PUL.nodeKind(type) === '药房') return name;
    return '门诊药房';
  }
  // 药房在架 = 领用单「已入库·待上架/已上架」− 退回单池 − 药房损耗 − 整盒已绑码
  // 拆零：码仍在架，累加 splitQty，达到 minUnit.per 才离架
  function minPerOf(code20) {
    if (!window.PUL_DRUG || !window.PUL_PCH) return 0;
    var p = window.PUL_PCH.parseCode(code20, window.PUL_DRUG.flat());
    if (!p.dict) return 0;
    var d = window.PUL_DRUG.drugOf(window.PUL_DRUG.load(), p.dict.drugCode);
    return (d && d.minUnit && d.minUnit.per) ? d.minUnit.per : 0;
  }
  function splitUsedMap() {
    var rx = window.store ? (window.store.load().rx || {}) : {};
    var used = {};
    function take(docs) {
      (docs || []).forEach(function (d) {
        if (d.status !== '发药中' && d.status !== '摆药中' && d.status !== '已完成') return;
        (d.items || []).forEach(function (it) {
          (it.codes || []).forEach(function (c) {
            if (c.split !== '是') return;
            var n = parseInt(c.splitQty, 10);
            if (!n) n = 1;
            used[c.code] = (used[c.code] || 0) + n;
          });
        });
      });
    }
    take(rx.rxDocs);
    take(rx.trayDocs);
    return used;
  }
  function occupiedRxCodes() {
    var rx = window.store ? (window.store.load().rx || {}) : {};
    var used = splitUsedMap();
    var seen = {};
    function take(docs) {
      (docs || []).forEach(function (d) {
        if (d.status !== '发药中' && d.status !== '摆药中' && d.status !== '已完成') return;
        (d.items || []).forEach(function (it) {
          (it.codes || []).forEach(function (c) {
            if (c.split === '是') {
              var per = minPerOf(c.code);
              if (per && (used[c.code] || 0) < per) return;
            }
            seen[c.code] = true;
          });
        });
      });
    }
    take(rx.rxDocs);
    take(rx.trayDocs);
    return Object.keys(seen);
  }
  function pharmacyStock(wh, pharmacy, warehouse) {
    var map = {};
    (wh.pickDocs || []).forEach(function (d) {
      if (d.status !== '已入库·待上架' && d.status !== '已上架') return;
      if (pharmacy && d.pharmacy !== pharmacy) return;
      if (warehouse && d.warehouse !== warehouse) return;
      (d.codes || []).forEach(function (c) {
        map[c.code] = Object.assign({}, c, { _src: d.billNo, pharmacy: d.pharmacy });
      });
    });
    (wh.retPool || []).forEach(function (r) {
      (r.codes || []).forEach(function (c) { delete map[c.code]; });
    });
    (wh.phLossDocs || []).forEach(function (d) {
      if (d.status !== '已审核') return;
      (d.codes || []).forEach(function (c) { delete map[c.code]; });
    });
    occupiedRxCodes().forEach(function (code) { delete map[code]; });
    var used = splitUsedMap();
    Object.keys(map).forEach(function (k) {
      var u = used[k] || 0;
      if (!u) return;
      var per = minPerOf(k);
      map[k].split = '是';
      map[k].splitQty = String(u);
      map[k].splitRemain = per ? Math.max(0, per - u) : 0;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function findPhCode(wh, code20) {
    var found = null;
    (wh.pickDocs || []).forEach(function (d) {
      if (d.status !== '已入库·待上架' && d.status !== '已上架') return;
      (d.codes || []).forEach(function (c) { if (c.code === code20) found = c; });
    });
    return found;
  }
  function setPhLoc(wh, code20, phLoc) {
    var c = findPhCode(wh, code20);
    if (!c) return false;
    c.phLoc = phLoc || '';
    c.scanHead = '药房上架';
    c.shelfTime = phLoc ? now() : '';
    return true;
  }
  function phTransit(wh, pharmacy) {
    var n = 0;
    (wh.pickDocs || []).forEach(function (d) {
      if (d.status !== '已出库·待入库') return;
      if (pharmacy && d.pharmacy !== pharmacy) return;
      n += (d.codes || []).length;
    });
    return n;
  }
  // 扫码直生（捷径C，2026-10-05 拍板）：药房上架扫到「本库房在架但无在途单」的码 → 一步建闭环单
  // status=已入库·待上架（码带 phLoc → pickStatus 推导已上架）；qty=docQty=实扫折合；四时间戳同为 now
  function directPick(pharmacy, warehouse, scannedCodes, operator) {
    var s = load();
    var t = now();
    var dict = window.PUL_DRUG ? window.PUL_DRUG.flat() : [];
    var ds = window.PUL_DRUG ? window.PUL_DRUG.load() : null;
    var items = {}, order = [];
    scannedCodes.forEach(function (cd) {
      var dc = '?', base = 1;
      if (window.PUL_PCH && window.PUL_DRUG) {
        var p = window.PUL_PCH.parseCode(cd.code, dict);
        if (p.dict) {
          dc = p.dict.drugCode;
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
  function now() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function nodeFrozen(nodeName) {
    if (!nodeName) return false;
    var inv = window.store ? (window.store.load().inv || {}) : {};
    var docs = inv.countDocs || [];
    for (var i = 0; i < docs.length; i++) {
      if (docs[i].node === nodeName && docs[i].status !== '已审核') return true;
    }
    return false;
  }
  function disabledMsg(code20) {
    if (!window.PUL_DRUG) return '';
    var ds = window.PUL_DRUG.load();
    var ic = window.PUL_DRUG.idcodeOf(ds, (code20 || '').slice(0, 7));
    if (ic && ic.status === '停用') return '标识码已停用';
    if (ic) {
      var d = window.PUL_DRUG.drugOf(ds, ic.drugCode);
      if (d && d.status === '停用') return '药品已停用';
    }
    return '';
  }
  function findOnHand(code20) {
    var pch = window.PUL_PCH ? window.PUL_PCH.load() : { inDocs: [], outDocs: [] };
    var wh = load();
    var hit = null;
    stockAll(pch, wh).forEach(function (x) { if (x.code === code20) hit = x; });
    if (!hit) pharmacyStock(wh).forEach(function (x) { if (x.code === code20) hit = x; });
    return hit;
  }
  // kind: out=领用/其他出/发药/摆药（过期+停用+冻结）；in=入库/退（只冻结）；loss=损耗（只冻结）；count=盘点（不拦）
  function blockMove(code20, nodeName, kind, extra) {
    extra = extra || {};
    kind = kind || 'out';
    if (kind !== 'count' && nodeFrozen(nodeName)) return '本节点盘点中，禁止出入库';
    if (kind === 'out') {
      var dis = disabledMsg(code20);
      if (dis) return dis;
      var exp = extra.expDate;
      if (!exp && extra.codeObj) exp = extra.codeObj.expDate;
      if (!exp) {
        var hit = findOnHand(code20);
        if (hit) exp = hit.expDate;
      }
      if (exp && expStatus(exp) === '过期') return '过期码禁止出库/发药';
    }
    return '';
  }
  function assertUnfrozen(nodeName) {
    if (!nodeFrozen(nodeName)) return true;
    if (window.showToast) window.showToast('本节点盘点中，禁止出入库');
    return false;
  }

  window.PUL_WH = { load: load, save: save, stockAll: stockAll, transitByReq: transitByReq,
    summarizeStock: summarizeStock, expStatus: expStatus, nextNo: nextNo, now: now,
    curPharm: curPharm, pharmacyStock: pharmacyStock,
    findPhCode: findPhCode, setPhLoc: setPhLoc, phTransit: phTransit,
    pickPosted: pickPosted, pickStatus: pickStatus, directPick: directPick, nodeFrozen: nodeFrozen, blockMove: blockMove, assertUnfrozen: assertUnfrozen,
    OTH_IN_TYPES: OTH_IN_TYPES, OTH_OUT_TYPES: OTH_OUT_TYPES, LOSS_REASONS: LOSS_REASONS, LOSS_SOURCES: LOSS_SOURCES,
    mkCodes: codes };
})();
