/**
 * purchase-data.js — 采购模块 Mock 数据（字段口径对齐老系统 121.37.95.55:8090，便于后续数据迁移）
 * 覆盖：采购到货（供应商码单池）/ 采购入库 / 采购退货 / 已完成单 / 异常标识码 / 采购明细
 * 状态经 store（sessionStorage）持久化，跨页联动：到货下载→入库列表；入库审核→已完成单；异常维护→解析恢复
 */
(function () {
  'use strict';

  // ===== 标识码字典（药品主子表之"子"：一条药品 ↔ 多条标识码；前 7 位 = 产品资源码） =====
  var IDCODE_DICT = [
    { idcode: '8400431', level: 1, drugName: '乳酸依沙吖啶溶液', formSpec: '0.1%', packSpec: '盒1瓶', maker: '北京京丰制药（河北）有限公司', approval: '国药准字H23023728', drugCode: 'YP010201', ipUnpack: '否', opUnpack: '否', unit: '盒' },
    { idcode: '8461935', level: 1, drugName: '依姆多', formSpec: '60mg', packSpec: '盒7片', maker: '华益药业科技(安徽)有限公司', approval: '国药准字H20030418', drugCode: 'YP010245', ipUnpack: '否', opUnpack: '是', unit: '盒' },
    { idcode: '8433386', level: 1, drugName: '健脾生血片', formSpec: '每片含硫酸亚铁100mg', packSpec: '盒3板', maker: '健民集团叶开泰国药(随州)有限公司', approval: '国药准字Z19991066', drugCode: 'YP010312', ipUnpack: '是', opUnpack: '是', unit: '盒' },
    { idcode: '8414784', level: 1, drugName: '加罗新', formSpec: '100ml:盐酸替罗非班5mg', packSpec: '箱60瓶', maker: '四川科伦药业股份有限公司', approval: '国药准字H20203013', drugCode: 'YP010388', ipUnpack: '否', opUnpack: '否', unit: '箱' },
    { idcode: '8416917', level: 1, drugName: '唯可来', formSpec: '100mg', packSpec: '盒28片', maker: 'AbbVie Ireland NL B.V.', approval: '国药准字HJ20200055', drugCode: 'YP010401', ipUnpack: '否', opUnpack: '否', unit: '盒' },
    { idcode: '8130779', level: 1, drugName: '复方氨基酸注射液(3AA)', formSpec: '250ml:10.65g(总氨基酸)', packSpec: '箱30瓶', maker: '山东齐都药业有限公司', approval: '国药准字H20063949', drugCode: 'YP010477', ipUnpack: '否', opUnpack: '否', unit: '箱' },
    { idcode: '8441916', level: 1, drugName: '复方甘草口服溶液', formSpec: '复方', packSpec: '盒90毫升', maker: '福州海王金象中药制药有限公司', approval: '国药准字H35020932', drugCode: 'YP010529', ipUnpack: '否', opUnpack: '是', unit: '盒' }
  ];

  // 拼 20 位码：标识码(7) + 序列号(9) + 校验位(4)
  function mk(idcode, serial, check) { return idcode + serial + check; }
  // 码记录（老系统「码详情」字段：拆零/拆零数/批次号/生产日期/有效期至/已验收/二三级码/库位）
  function code(idcode, serial, check, batch, prod, exp, extra) {
    return Object.assign({ code: mk(idcode, serial, check), level: 1, split: '否', splitQty: '',
      batch: batch, prodDate: prod, expDate: exp, checked: false, code2: '', code3: '', location: '' }, extra || {});
  }

  // ===== 采购到货（供应商平台码单池，中继服务单向传入；已下载=已生成入库单） =====
  // 字段对齐老系统「药品销售管理」：单据编号/单据时间/单据类型/发货企业/收货企业/确认状态
  var ARRIVE_ORDERS = [
    { orderNo: '204-13824814', orderTime: '2026-09-11 17:13:05', supplier: '三明鹭燕医药有限公司', shipper: '三明鹭燕医药有限公司', receiver: '云岭总医院', docType: '销售出库', source: '拉取', confirm: '已确认', downloaded: '是', invoice: 'FP2026091102',
      codes: [code('8400431', '002611300', '3301', '601753', '2025-02-26', '2028-01-31'), code('8400431', '002611301', '3302', '601753', '2025-02-26', '2028-01-31')] },
    { orderNo: '204-13824815', orderTime: '2026-09-11 17:11:56', supplier: '三明鹭燕医药有限公司', shipper: '三明鹭燕医药有限公司', receiver: '云岭总医院', docType: '销售出库', source: '拉取', confirm: '已确认', downloaded: '是', invoice: 'FP2026091101',
      codes: [code('8400431', '002596926', '5126', '601753', '2025-02-26', '2028-01-31'), code('8400431', '002589002', '2853', '601753', '2025-02-26', '2028-01-31'),
              code('8461935', '000118823', '7741', '240516', '2024-06-10', '2027-06-09'), code('8461935', '000118824', '7742', '240516', '2024-06-10', '2027-06-09')] },
    { orderNo: '4VS26091000041665', orderTime: '2026-09-11 00:00:00', supplier: '国药控股三明有限公司', shipper: '国药控股三明有限公司', receiver: '云岭总医院', docType: '销售出库', source: '拉取', confirm: '已确认', downloaded: '是', invoice: 'FP2026091008',
      codes: [code('8433386', '000550101', '8801', '250302', '2025-03-15', '2028-03-14'), code('8433386', '000550102', '8802', '250302', '2025-03-15', '2028-03-14'), code('8433386', '000550103', '8803', '250302', '2025-03-15', '2028-03-14')] },
    { orderNo: 'FK5XSG01481340-1', orderTime: '2026-09-10 17:18:02', supplier: '三明九州通医药有限公司', shipper: '三明九州通医药有限公司', receiver: '云岭总医院', docType: '销售出库', source: '拉取', confirm: '未确认', downloaded: '否', invoice: 'FP2026091015',
      codes: [code('8416917', '000220045', '1201', '241105', '2024-11-20', '2027-11-19'), code('8416917', '000220046', '1202', '241105', '2024-11-20', '2027-11-19'),
              code('8130779', '000330078', '4501', '250401', '2025-04-02', '2027-04-01'), code('8130779', '000330079', '4502', '250401', '2025-04-02', '2027-04-01')] },
    { orderNo: '9384236', orderTime: '2026-09-10 16:54:41', supplier: '福建三明同春医药有限公司', shipper: '福建三明同春医药有限公司', receiver: '云岭总医院', docType: '销售出库', source: '拉取', confirm: '未确认', downloaded: '否', invoice: 'FP2026091011',
      codes: [code('8441916', '000410092', '6601', '250518', '2025-05-20', '2028-05-19'), code('8441916', '000410093', '6602', '250518', '2025-05-20', '2028-05-19')] }
  ];

  // ===== 采购入库单（下载/解析/审核三状态；异常信息记录核对差异） =====
  var IN_DOCS = [
    { billNo: '204-13824815', date: '2026-09-11 17:12', supplier: '三明鹭燕医药有限公司', invoice: 'FP2026091101', warehouse: '中心库', location: 'A-01-01',
      audit: '未审核', hisPush: '', downloadTime: '2026-09-11 17:13:20', auditDate: '', auditor: '', source: '下载',
      codes: ARRIVE_ORDERS[1].codes.map(function (c) { return Object.assign({}, c); }) },
    { billNo: '4VS26091000041665', date: '2026-09-11 08:30', supplier: '国药控股三明有限公司', invoice: 'FP2026091008', warehouse: '中心库', location: 'A-01-02',
      audit: '未审核', hisPush: '', downloadTime: '2026-09-11 08:31:02', auditDate: '', auditor: '', source: '下载',
      codes: ARRIVE_ORDERS[2].codes.map(function (c) { return Object.assign({}, c); }) },
    { billNo: '221472816', date: '2026-09-10 15:02', supplier: '华润（三明）医药有限公司', invoice: 'FP2026091003', warehouse: '中心库', location: '',
      audit: '未审核', hisPush: '', downloadTime: '2026-09-10 15:03:44', auditDate: '', auditor: '', source: '下载',
      codes: [code('8416917', '000220011', '1101', '241105', '2024-11-20', '2027-11-19'), code('8416917', '000220012', '1102', '241105', '2024-11-20', '2027-11-19'),
              code('8130779', '000330051', '4401', '250401', '2025-04-02', '2027-04-01')] },
    { billNo: '204-13809882', date: '2026-09-09 10:47', supplier: '三明鹭燕医药有限公司', invoice: 'FP2026090906', warehouse: '中心库', location: '',
      audit: '未审核', hisPush: '', downloadTime: '2026-09-09 10:48:15', auditDate: '', auditor: '', source: '下载',
      codes: [code('8441916', '000410077', '6501', '250518', '2025-05-20', '2028-05-19'),
              code('8999001', '000000001', '9999', '250600', '2025-06-01', '2028-05-31')] },
    { billNo: '204-13807319', date: '2026-09-09 09:15', supplier: '三明鹭燕医药有限公司', invoice: 'FP2026090901', warehouse: '中心库', location: 'A-01',
      audit: '已审核', hisPush: '已推送', downloadTime: '2026-09-09 09:16:30', auditDate: '2026-09-09 16:20', auditor: '王铁军', source: '下载',
      codes: [code('8414784', '000770201', '7701', '250702', '2025-07-10', '2027-07-09', { checked: true, location: 'A-01-02' }),
              code('8414784', '000770202', '7702', '250702', '2025-07-10', '2027-07-09', { checked: true, location: 'A-01-03' })] }
  ];

  // ===== 采购退货单（逆向：库房在架 → 退回供应商；无库存码 = 扫了但库存没有的码） =====
  var OUT_DOCS = [
    { billNo: '202609110002', date: '2026-09-11 14:09:59', supplier: '三明鹭燕医药有限公司', warehouse: '中心库', type: '库房退货', refOrder: '',
      status: '未审核', auditTime: '',
      codes: [code('8414784', '000770202', '7702', '250702', '2025-07-10', '2027-07-09', { checked: true, location: 'A-01-03' })],
      noStock: ['8400431002599999001'] }
  ];

  // ===== 异常标识码（跨单据台账；异常信息 = 未维护标识码：xxxxxxx） =====
  var BAD_CODES = [
    { idcode: '8631149', level: 2, drugName: '乳酸依沙吖啶溶液', formSpec: '0.1%', packSpec: '盒1瓶', maker: '北京京丰制药（河北）有限公司', approval: '国药准字H23023728', type: '未维护标识码' },
    { idcode: '8419479', level: 1, drugName: '乳酸依沙吖啶溶液', formSpec: '0.1%', packSpec: '盒1瓶', maker: '北京京丰制药（河北）有限公司', approval: '国药准字H23023728', type: '未维护标识码' },
    { idcode: '8461936', level: 1, drugName: '依姆多', formSpec: '60mg', packSpec: '盒7片', maker: '华益药业科技(安徽)有限公司', approval: '国药准字H20030418', type: '未维护标识码' },
    { idcode: '8433387', level: 2, drugName: '健脾生血片', formSpec: '每片含硫酸亚铁100mg', packSpec: '盒3板', maker: '健民集团叶开泰国药(随州)有限公司', approval: '国药准字Z19991066', type: '未维护标识码' },
    { idcode: '8999001', level: 1, drugName: '（未知药品）', formSpec: '-', packSpec: '-', maker: '-', approval: '-', type: '解析失败' }
  ];

  // ===== 状态持久化：store 命名空间 pch；首次用种子 =====
  // 迁移：老会话已存的 pch 缺新字段时补默认值（新增字段只加不改，保证迁移友好）
  function migrate(s) {
    (s.arrive || []).forEach(function (o) {
      if (!o.docType) o.docType = '销售出库';
      if (!o.receiver) o.receiver = '云岭总医院';
      if (!o.confirm) o.confirm = o.downloaded === '是' ? '已确认' : '未确认';
      if (!o.source) o.source = '拉取';
    });
    (s.outDocs || []).forEach(function (d) { if (!d.type) { d.type = '库房退货'; d.refOrder = d.refOrder || ''; } });
    (s.inDocs || []).forEach(function (d) { if (d.location === undefined) d.location = ''; });
    return s;
  }
  function load() {
    var s = window.store ? window.store.load() : {};
    // 字典唯一事实源已迁至 PUL_DRUG（drug-data.js 主子表）；s.dict 刷新为其 flat() 内存视图，调用方零改动
    if (window.PUL_DRUG && s.pch) { s.pch.dict = window.PUL_DRUG.flat(); return migrate(s.pch); }
    if (s.pch) return migrate(s.pch);
    var seed = { dict: IDCODE_DICT.slice(), arrive: ARRIVE_ORDERS, inDocs: IN_DOCS, outDocs: OUT_DOCS, badCodes: BAD_CODES };
    if (window.PUL_DRUG) seed.dict = window.PUL_DRUG.flat();
    if (window.store) window.store.update({ pch: seed });
    return seed;
  }
  function save(state) { if (window.store) window.store.update({ pch: state }); }

  // 库位预设（手动新增入库单「库位」下拉；真实场景来自库房维护的库位档案）
  var LOC_PRESET = ['A-01-01', 'A-01-02', 'A-01-03', 'B-02-01', 'B-02-02', '冷藏柜-01'];

  window.PUL_PCH = {
    load: load, save: save, LOC_PRESET: LOC_PRESET,
    // 可选入库库房 = 组织树里类型含「库」的节点（中心库/分院库/麻精专库，排除药房）
    warehouses: function () {
      var out = [];
      (window.PUL ? window.PUL.ORG_TREE.children : []).forEach(function (yq) {
        (yq.children || []).forEach(function (n) { if (n.type.indexOf('库') !== -1) out.push(n.name); });
      });
      return out;
    },
    // 解析 20 位码：前 7 位查标识码字典（命中=药品信息；未命中=null → 异常码）
    parseCode: function (code20, dict) {
      var idcode = (code20 || '').slice(0, 7);
      var hit = null;
      (dict || load().dict).forEach(function (d) { if (d.idcode === idcode) hit = d; });
      return { idcode: idcode, serial: (code20 || '').slice(7, 16), check: (code20 || '').slice(16), dict: hit };
    },
    // 单据异常码 = 码清单里解析不到字典的码
    badCodesOf: function (doc, dict) {
      var self = this;
      return (doc.codes || []).filter(function (c) { return !self.parseCode(c.code, dict).dict; });
    },
    // 药品清单 = 码清单按 标识码+批次 聚合（双层表达：码 → 人读品规数量）
    summarize: function (codes, dict) {
      var self = this, map = {};
      (codes || []).forEach(function (c) {
        var p = self.parseCode(c.code, dict);
        if (!p.dict) return;
        var key = p.idcode + '|' + c.batch;
        if (!map[key]) {
          map[key] = { idcode: p.idcode, drugName: p.dict.drugName, formSpec: p.dict.formSpec, packSpec: p.dict.packSpec, batch: c.batch,
            prodDate: c.prodDate, expDate: c.expDate, qty: 0, unit: p.dict.unit, approval: p.dict.approval, maker: p.dict.maker,
            drugCode: p.dict.drugCode, ipUnpack: p.dict.ipUnpack, opUnpack: p.dict.opUnpack };
        }
        map[key].qty += 1;
      });
      return Object.keys(map).map(function (k) { return map[k]; });
    },
    // 库房在架码 = 已审核入库 - 已审核退货（退货选码的数据源）
    stockCodes: function (state) {
      var inCodes = [];
      state.inDocs.forEach(function (d) {
        if (d.audit !== '已审核') return;
        (d.codes || []).forEach(function (c) { inCodes.push(Object.assign({}, c, { supplier: d.supplier })); });
      });
      state.outDocs.forEach(function (d) {
        if (d.status !== '已审核') return;
        (d.codes || []).forEach(function (rc) {
          inCodes = inCodes.filter(function (c) { return c.code !== rc.code; });
        });
      });
      return inCodes;
    }
  };
})();
