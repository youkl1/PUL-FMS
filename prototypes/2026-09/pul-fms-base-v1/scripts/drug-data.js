/**
 * drug-data.js — 药品字典（主子表）+ 标识码字典：全系统「码⇄药」转换层的唯一事实源
 * 主表 DRUGS：药品级属性（品名/规格/厂家/批准文号/分类/基本单位/换算链/拆零标记/参考进价）
 * 子表 IDCODES：标识码（20位码的前7位=产品资源码）→ drugCode 引用 + 码等级 + 包装规格/包装单位
 * 子表 PRICE_LOG：单价变更记录（价格更新记录表——老系统无此表，2026-10-15 Round CK 需求拍板新增）→ 单据药品清单「单价」取最新一条
 *
 * 单位换算（U0-U3 落地口径，2026-09-14 拍板）：
 *   units 按大到小排列 [{u:'箱',eq:60},{u:'瓶',eq:1}]，eq = 折合链尾单位数，链尾 eq=1 即库存基本单位 baseUnit
 *   minUnit {u:'片',per:7} = 拆零最小制剂单位（U0）：1 个基本单位 = per 个最小单位
 * flat()：主子表 join 成采购模块 pch.dict 老形状（parseCode/summarize 零改动兼容）
 */
(function () {
  'use strict';

  // ===== 药品主表（7 条种子与采购模块 IDCODE_DICT 同源同口径） =====
  // warehouse = 所属库房（客户新版 2026-09-21：药品必须指定所属库房，同一标识码在不同库房分别建档）
  // 2026-10-10 拍板：saleUnit=销售单位（HIS 结算单位）/ baseUnit=库存单位（追溯码最小销售包装单位）——两列独立展示
  var DRUGS = [
    { drugCode: 'YP010201', drugName: '乳酸依沙吖啶溶液', formSpec: '0.1%', dosForm: '溶液剂', maker: '北京京丰制药（河北）有限公司', approval: '国药准字H23023728', category: '西药', baseUnit: '盒', saleUnit: '盒', units: [{ u: '盒', eq: 1 }], minUnit: null, ipUnpack: '否', opUnpack: '否', price: 8.60, warehouse: '中心库', status: '启用' },
    { drugCode: 'YP010245', drugName: '依姆多', formSpec: '60mg', dosForm: '片剂', maker: '华益药业科技(安徽)有限公司', approval: '国药准字H20030418', category: '西药', baseUnit: '盒', saleUnit: '片', units: [{ u: '箱', eq: 100 }, { u: '盒', eq: 1 }], minUnit: { u: '片', per: 7 }, ipUnpack: '否', opUnpack: '是', price: 45.00, warehouse: '中心库', status: '启用' },
    { drugCode: 'YP010312', drugName: '健脾生血片', formSpec: '每片含硫酸亚铁100mg', dosForm: '片剂', maker: '健民集团叶开泰国药(随州)有限公司', approval: '国药准字Z19991066', category: '中成药', baseUnit: '盒', saleUnit: '片', units: [{ u: '盒', eq: 1 }], minUnit: { u: '片', per: 36 }, ipUnpack: '是', opUnpack: '是', price: 28.50, warehouse: '中心库', status: '启用' },
    { drugCode: 'YP010388', drugName: '加罗新', formSpec: '100ml:盐酸替罗非班5mg', dosForm: '注射剂', maker: '四川科伦药业股份有限公司', approval: '国药准字H20203013', category: '西药', baseUnit: '瓶', saleUnit: '瓶', units: [{ u: '箱', eq: 60 }, { u: '瓶', eq: 1 }], minUnit: null, ipUnpack: '否', opUnpack: '否', price: 320.00, warehouse: '中心库', status: '启用' },
    { drugCode: 'YP010401', drugName: '唯可来', formSpec: '100mg', dosForm: '片剂', maker: 'AbbVie Ireland NL B.V.', approval: '国药准字HJ20200055', category: '西药', baseUnit: '盒', saleUnit: '盒', units: [{ u: '盒', eq: 1 }], minUnit: { u: '片', per: 28 }, ipUnpack: '否', opUnpack: '否', price: 1150.00, warehouse: '中心库', status: '启用' },
    { drugCode: 'YP010477', drugName: '复方氨基酸注射液(3AA)', formSpec: '250ml:10.65g(总氨基酸)', dosForm: '注射剂', maker: '山东齐都药业有限公司', approval: '国药准字H20063949', category: '西药', baseUnit: '瓶', saleUnit: '瓶', units: [{ u: '箱', eq: 30 }, { u: '瓶', eq: 1 }], minUnit: null, ipUnpack: '否', opUnpack: '否', price: 15.80, warehouse: '分院库（东）', status: '启用' },
    { drugCode: 'YP010529', drugName: '复方甘草口服溶液', formSpec: '复方', dosForm: '口服溶液剂', maker: '福州海王金象中药制药有限公司', approval: '国药准字H35020932', category: '中成药', baseUnit: '盒', saleUnit: '毫升', units: [{ u: '盒', eq: 1 }], minUnit: { u: '毫升', per: 90 }, ipUnpack: '否', opUnpack: '是', price: 12.30, warehouse: '分院库（东）', status: '启用' },
    // 尿素乳膏：三级转换链演示（客户天泰药品数据 1:60:600 = 1箱=60盒、1盒=10支）
    { drugCode: 'YP010601', drugName: '尿素乳膏', formSpec: '10g:1g', dosForm: '乳膏剂', maker: '福建省三明天泰制药有限公司', approval: '国药准字H35020938', category: '西药', baseUnit: '支', saleUnit: '支', units: [{ u: '箱', eq: 600 }, { u: '盒', eq: 10 }, { u: '支', eq: 1 }], minUnit: null, ipUnpack: '否', opUnpack: '否', price: 6.50, warehouse: '中心库', status: '启用' }
  ];

  // ===== /api/DM_DrugInfo 必填字段（2026-10-16） =====
  // 既有字段继续沿用原型命名：formSpec=dosageSpec、dosForm=dosageForm、saleUnit=price_unit、
  // maker=manufacturer、approval=approvalNo、warehouse=storeName、status=stoped；
  // nameCode/packSpec 由 IDCODES 一级码承载，不在 DRUGS 重复存。normalizeDrug 只补空值，老会话幂等兼容。
  var HIS_DEMO = {
    YP010201: { drugcate: '消毒防腐药', dosageUnit: '瓶' },
    YP010245: { drugcate: '抗心绞痛药' },
    YP010312: { drugcate: '抗贫血药' },
    YP010388: { drugcate: '抗血小板药', dosageUnit: '瓶' },
    YP010401: { drugcate: '抗肿瘤药' },
    YP010477: { drugcate: '氨基酸类药', dosageUnit: '瓶' },
    YP010529: { drugcate: '呼吸系统用药' },
    YP010601: { drugcate: '皮肤科用药' }
  };
  function empty(v) { return v === undefined || v === null || v === ''; }
  function normalizeDrug(d) {
    if (!d) return d;
    if (empty(d.drugName)) d.drugName = '未命名药品';
    if (empty(d.formSpec)) d.formSpec = '-';
    if (empty(d.dosForm)) d.dosForm = '-';
    if (empty(d.maker)) d.maker = '-';
    if (empty(d.approval)) d.approval = '-';
    if (empty(d.category)) d.category = '未分类';
    if (empty(d.warehouse)) d.warehouse = '中心库';
    if (empty(d.status)) d.status = '启用';
    if (empty(d.opUnpack)) d.opUnpack = '否';
    if (empty(d.ipUnpack)) d.ipUnpack = '否';
    var demo = HIS_DEMO[d.drugCode] || {};
    var digits = String(d.drugCode || '').replace(/\D/g, '') || '000000';
    var wh = d.warehouse;
    var storeCode = wh === '中心库' ? 'WH001' : 'WH002';
    if (!d.baseUnit) d.baseUnit = '盒';
    if (!d.saleUnit) d.saleUnit = d.baseUnit;
    if (empty(d.medCode)) d.medCode = 'M' + digits;
    if (empty(d.medListCodg)) d.medListCodg = 'YB' + digits;
    if (empty(d.minPackUnit)) d.minPackUnit = d.baseUnit;
    if (empty(d.dosageUnit)) d.dosageUnit = demo.dosageUnit || (d.minUnit ? d.minUnit.u : d.baseUnit);
    if (empty(d.priceUnitType)) d.priceUnitType = d.minUnit && d.saleUnit === d.minUnit.u ? '1' : '2';
    if (empty(d.minPackQty)) d.minPackQty = d.minUnit && +d.minUnit.per > 0 ? +d.minUnit.per : 1;
    if (empty(d.supCode)) d.supCode = 'SUP001';
    if (empty(d.supName)) d.supName = '三明鹭燕医药有限公司';
    if (empty(d.rxFlag)) d.rxFlag = '是';
    if (empty(d.price)) d.price = 0;
    if (empty(d.retailPrice)) d.retailPrice = d.price;
    if (empty(d.storeCode)) d.storeCode = storeCode;
    if (empty(d.coded)) d.coded = '1';
    if (empty(d.drugcate)) d.drugcate = demo.drugcate || '未分类';
    if (empty(d.drugType)) d.drugType = '普通';
    if (empty(d.medWhCode)) d.medWhCode = storeCode.replace('WH', 'MW');
    if (empty(d.medWhName)) d.medWhName = wh;
    if (empty(d.lastUpdateTime)) d.lastUpdateTime = '2026-10-16 09:00:00';
    if (empty(d.tracUnit)) d.tracUnit = d.baseUnit;
    if (empty(d.tracRate)) d.tracRate = 1;
    if (empty(d.selUnTrac)) d.selUnTrac = '0';
    if (empty(d.meaUnit)) d.meaUnit = d.dosageUnit;
    if (empty(d.meaRatio)) d.meaRatio = 1;
    return d;
  }

  // ===== 标识码子表（packUnit = 该码所在包装层级的单位，从包装规格解析） =====
  // 8461940 = 依姆多二级箱码：演示「扫箱码自动展开 100 个一级盒码」（父子码展开 T2）
  // 尿素乳膏三条 = 三级链演示（客户天泰数据原码）：层级 1支 / 2盒 / 3箱
  // ratio = 换算比例「1 本级 = N 下级」（2026-10-10 拍板：换算链改由本子表分组表达，支持两级/三级任意深度；1 级=库存单位层恒为 1）
  var IDCODES = [
    { idcode: '8400431', drugCode: 'YP010201', level: 1, packSpec: '盒1瓶', packUnit: '盒', ratio: 1, status: '启用' },
    { idcode: '8461935', drugCode: 'YP010245', level: 1, packSpec: '盒7片', packUnit: '盒', ratio: 1, status: '启用' },
    { idcode: '8461940', drugCode: 'YP010245', level: 2, packSpec: '箱100盒', packUnit: '箱', ratio: 100, status: '启用' },
    { idcode: '8433386', drugCode: 'YP010312', level: 1, packSpec: '盒3板', packUnit: '盒', ratio: 1, status: '启用' },
    { idcode: '8414784', drugCode: 'YP010388', level: 1, packSpec: '箱60瓶', packUnit: '箱', ratio: 60, status: '启用' },
    { idcode: '8416917', drugCode: 'YP010401', level: 1, packSpec: '盒28片', packUnit: '盒', ratio: 1, status: '启用' },
    { idcode: '8130779', drugCode: 'YP010477', level: 1, packSpec: '箱30瓶', packUnit: '箱', ratio: 30, status: '启用' },
    { idcode: '8441916', drugCode: 'YP010529', level: 1, packSpec: '盒90毫升', packUnit: '盒', ratio: 1, status: '启用' },
    { idcode: '8148790', drugCode: 'YP010601', level: 1, packSpec: '支10克', packUnit: '支', ratio: 1, status: '启用' },
    { idcode: '8852478', drugCode: 'YP010601', level: 2, packSpec: '盒10支', packUnit: '盒', ratio: 10, status: '启用' },
    { idcode: '8852477', drugCode: 'YP010601', level: 3, packSpec: '箱60盒', packUnit: '箱', ratio: 60, status: '启用' }
  ];

  // 从包装规格解析包装单位（'箱60瓶'→'箱'，'盒90毫升'→'盒'）
  function parsePackUnit(packSpec) {
    var m = String(packSpec || '').match(/^[^\d]+/);
    return m ? m[0] : '盒';
  }

  // ===== 单价变更记录子表（价格更新记录表——老系统无此表，2026-10-15 Round CK 需求拍板新增） =====
  // drugCode → 历次调价流水；单据药品清单「单价」= 按 date 取最新一条 newPrice（推导不落库，静态种子演示）
  // newPrice 与主表 price 同值（最新调价后现行价）；无记录药品回落主表 price（如维护补录的新药）
  var PRICE_LOG = [
    { drugCode: 'YP010201', date: '2025-10-01', oldPrice: 7.90, newPrice: 8.20, oper: '林建国' },
    { drugCode: 'YP010201', date: '2026-04-01', oldPrice: 8.20, newPrice: 8.60, oper: '林建国' },
    { drugCode: 'YP010245', date: '2026-03-15', oldPrice: 43.00, newPrice: 45.00, oper: '林建国' },
    { drugCode: 'YP010312', date: '2026-05-10', oldPrice: 27.80, newPrice: 28.50, oper: '林建国' },
    { drugCode: 'YP010388', date: '2026-06-01', oldPrice: 305.00, newPrice: 320.00, oper: '林建国' },
    { drugCode: 'YP010401', date: '2026-01-20', oldPrice: 1180.00, newPrice: 1150.00, oper: '林建国' },
    { drugCode: 'YP010477', date: '2026-02-14', oldPrice: 15.20, newPrice: 15.80, oper: '林建国' },
    { drugCode: 'YP010529', date: '2026-07-01', oldPrice: 12.00, newPrice: 12.30, oper: '林建国' },
    { drugCode: 'YP010601', date: '2026-08-20', oldPrice: 6.80, newPrice: 6.50, oper: '林建国' }
  ];

  // ===== 持久化：store 命名空间 drug；首次用种子；老会话 pch.dict 增补条目幂等导入 =====
  function migrate(s) {
    (s.drugs || []).forEach(function (d) {
      if (!d.units) d.units = [{ u: d.baseUnit || '盒', eq: 1 }];
      if (d.minUnit === undefined) d.minUnit = null;
      if (!d.status) d.status = '启用';
      if (!d.warehouse) d.warehouse = '中心库';
      if (!d.dosForm) d.dosForm = '-';
      if (!d.saleUnit) d.saleUnit = d.baseUnit || '盒';   // 2026-10-10：销售单位缺省=库存单位
      normalizeDrug(d);
    });
    (s.idcodes || []).forEach(function (c) {
      if (!c.packUnit) c.packUnit = parsePackUnit(c.packSpec);
      if (!c.status) c.status = '启用';
      // 2026-10-10：ratio 换算比例回填（老会话幂等）——从药品既有 units 推相邻下级倍率，链尾/未入链 = 1
      if (c.ratio === undefined) {
        var dd = drugOf(s, c.drugCode);
        var sq = dd ? subQty(dd, c.packUnit) : '';
        c.ratio = (sq === '' || !sq) ? 1 : sq;
      }
    });
    // 2026-10-10 尿素乳膏三级链种子幂等注入老会话
    if (!(s.drugs || []).some(function (d) { return d.drugCode === 'YP010601'; })) {
      var urea = DRUGS.filter(function (d) { return d.drugCode === 'YP010601'; })[0];
      if (urea) s.drugs.push(JSON.parse(JSON.stringify(urea)));
    }
    IDCODES.forEach(function (c) {
      if (c.drugCode !== 'YP010601') return;
      if (!(s.idcodes || []).some(function (x) { return x.idcode === c.idcode; }))
        s.idcodes.push(Object.assign({}, c));
    });
    return s;
  }
  // pch.dict（老采购命名空间）里种子没有的条目 → 导入主子表（bad-codes 历史维护兜底）
  function importPch(s) {
    var pch = window.store ? (window.store.load().pch || {}) : {};
    (pch.dict || []).forEach(function (e) {
      if (s.idcodes.some(function (c) { return c.idcode === e.idcode; })) return;
      if (!s.drugs.some(function (d) { return d.drugCode === e.drugCode; })) {
        s.drugs.push({ drugCode: e.drugCode || ('YP' + String(Date.now()).slice(-6)), drugName: e.drugName,
          formSpec: e.formSpec || '-', dosForm: e.dosForm || '-', maker: e.maker || '-', approval: e.approval || '-', category: '未分类',
          baseUnit: e.unit || '盒', units: [{ u: e.unit || '盒', eq: 1 }], minUnit: null,
          ipUnpack: e.ipUnpack || '否', opUnpack: e.opUnpack || '否', price: 0, warehouse: '中心库', status: '启用' });
      }
      s.idcodes.push({ idcode: e.idcode, drugCode: e.drugCode, level: e.level || 1,
        packSpec: e.packSpec || '-', packUnit: e.unit || parsePackUnit(e.packSpec), status: '启用' });
    });
    s.drugs.forEach(normalizeDrug);
    return s;
  }
  function load() {
    var raw = window.store ? window.store.load() : {};
    if (raw.drug) return importPch(migrate(raw.drug));
    var seed = migrate({ drugs: DRUGS.slice(), idcodes: IDCODES.slice() });
    if (window.store) window.store.update({ drug: seed });
    return importPch(seed);
  }
  function save(state) { if (window.store) window.store.update({ drug: state }); }

  function drugOf(state, drugCode) {
    for (var i = 0; i < state.drugs.length; i++) if (state.drugs[i].drugCode === drugCode) return state.drugs[i];
    return null;
  }
  function idcodeOf(state, idcode) {
    for (var i = 0; i < state.idcodes.length; i++) if (state.idcodes[i].idcode === idcode) return state.idcodes[i];
    return null;
  }

  // ===== 单位换算引擎 =====
  // conv(state, drugCode, qty, fromU, toU)：qty 以 fromU 计 → 折成 toU；单位不在换算链返回 null
  function conv(state, drugCode, qty, fromU, toU) {
    var d = drugOf(state, drugCode);
    if (!d || fromU === toU) return qty;
    var eq = {};
    (d.units || []).forEach(function (u) { eq[u.u] = u.eq; });
    if (!eq[fromU] || !eq[toU]) return null;
    var r = qty * eq[fromU] / eq[toU];
    return Math.round(r * 100) / 100;
  }
  // 换算链人读文案：相邻倍率逐段 [{u:'箱',eq:60},{u:'瓶',eq:1}] → '1箱 = 60瓶'；
  // 三级链 [{u:'箱',eq:600},{u:'盒',eq:10},{u:'支',eq:1}] → '1箱 = 60盒、1盒 = 10支'（2026-10-10 拍板全链显示）
  // 单级链兜底（2026-10-10 拍板「不存在为空场景」）：有拆零最小单位 → '1盒 = 36片'；纯单包装 → '无换算（单包装）'
  function unitsText(drug) {
    var us = drug.units || [];
    if (us.length >= 2) {
      var segs = [];
      for (var i = 0; i + 1 < us.length; i++) segs.push('1' + us[i].u + ' = ' + (us[i].eq / us[i + 1].eq) + us[i + 1].u);
      return segs.join('、');
    }
    if (drug.minUnit) return '1' + (drug.baseUnit || '盒') + ' = ' + drug.minUnit.per + drug.minUnit.u;
    return '无换算（单包装）';
  }
  // 换算链比例格式（2026-10-10 拍板，对齐客户天泰台账口径）：从最大单位起累计折到各下级单位——
  // 三级链 [{u:'箱',eq:600},{u:'盒',eq:10},{u:'支',eq:1}] → '1:60:600'；两级链 [{u:'箱',eq:60},{u:'瓶',eq:1}] → '1:60'；
  // 单级链有拆零 → '1:36'（1盒=36片）；纯单包装 → '无换算（单包装）'（沿用 unitsText 拍板：不存在为空场景）
  function unitsRatio(drug) {
    var us = drug.units || [];
    if (us.length >= 2) return '1:' + us.slice(1).map(function (u) { return us[0].eq / u.eq; }).join(':');
    if (drug.minUnit) return '1:' + drug.minUnit.per;
    return '无换算（单包装）';
  }

  // ===== flat()：主子表 join 成 pch.dict 老形状（采购模块 parseCode/summarize 兼容层） =====
  function flat(state) {
    var s = state || load();
    return s.idcodes.map(function (c) {
      var d = drugOf(s, c.drugCode) || {};
      return { idcode: c.idcode, level: c.level, drugName: d.drugName || '（未知药品）',
        formSpec: d.formSpec || '-', dosForm: d.dosForm || '-', packSpec: c.packSpec, packUnit: c.packUnit,
        maker: d.maker || '-', approval: d.approval || '-', drugCode: c.drugCode,
        ipUnpack: d.ipUnpack || '否', opUnpack: d.opUnpack || '否', unit: c.packUnit, status: c.status };
    });
  }

  // bad-codes「维护」补录入口：有码则更新，无码则新建子表（主表不存在时一并新建「未分类」药品）
  function upsertFromFix(entry) {
    var s = load();
    if (!drugOf(s, entry.drugCode)) {
      s.drugs.push({ drugCode: entry.drugCode, drugName: entry.drugName, formSpec: entry.formSpec,
        dosForm: entry.dosForm || '-', maker: entry.maker, approval: entry.approval, category: '未分类', baseUnit: entry.unit || '盒',
        units: [{ u: entry.unit || '盒', eq: 1 }], minUnit: null,
        ipUnpack: entry.ipUnpack || '否', opUnpack: entry.opUnpack || '否', price: 0, warehouse: entry.warehouse || '中心库', status: '启用' });
    } else {
      var d = drugOf(s, entry.drugCode);
      d.drugName = entry.drugName; d.formSpec = entry.formSpec; d.maker = entry.maker; d.approval = entry.approval;
    }
    var c = idcodeOf(s, entry.idcode);
    if (c) { c.level = entry.level; c.packSpec = entry.packSpec; c.packUnit = entry.unit || parsePackUnit(entry.packSpec); }
    else s.idcodes.push({ idcode: entry.idcode, drugCode: entry.drugCode, level: entry.level,
      packSpec: entry.packSpec, packUnit: entry.unit || parsePackUnit(entry.packSpec), status: '启用' });
    s.drugs.forEach(normalizeDrug);
    save(s);
  }

  // 下级数量（推导不落库）：该码包装单位在换算链中的相邻下级倍率；链尾（库存单位层）= ''——2026-10-10 对齐客户标识码台账列
  function subQty(drug, packUnit) {
    var us = (drug && drug.units) || [];
    for (var i = 0; i < us.length; i++) {
      if (us[i].u !== packUnit) continue;
      if (i + 1 >= us.length) return '';
      return us[i].eq / us[i + 1].eq;
    }
    return '';
  }
  // 比例（推导不落库）：该码包装单位折到库存单位（链尾）的倍率 = units[i].eq；未入链兜底 1——2026-10-10 子表补列
  function ratioOf(drug, packUnit) {
    var us = (drug && drug.units) || [];
    for (var i = 0; i < us.length; i++) if (us[i].u === packUnit) return us[i].eq;
    return 1;
  }

  // rebuildUnits（2026-10-10 拍板：换算链由标识码子表分组推导，替代药品弹窗的「大包装」固定两字段——支持两级/三级任意深度）：
  // 该药品的标识码按层级升序排链（1 级=库存单位层 eq=1，同层级多码取首条），逐级乘 ratio 得绝对倍率 eq，大到小落 d.units。
  // 无标识码 → 不动既有 units；只折包装层级，拆零 minUnit 与本函数无关；调用方负责 save。
  function rebuildUnits(state, drugCode) {
    var d = drugOf(state, drugCode);
    if (!d) return;
    var rows = (state.idcodes || []).filter(function (c) { return c.drugCode === drugCode; });
    if (!rows.length) return;
    rows.sort(function (a, b) { return a.level - b.level; });
    var seen = {}, lvls = [];
    rows.forEach(function (c) { if (!seen[c.level]) { seen[c.level] = 1; lvls.push(c); } });
    var eq = 1, chain = [];
    lvls.forEach(function (c, i) {
      if (i > 0) eq = eq * ((+c.ratio) > 0 ? +c.ratio : 1);
      chain.push({ u: c.packUnit, eq: eq });
    });
    d.units = chain.reverse();
  }

  // 最新单价（推导不落库）：单价变更记录子表按 date 取最新一条 newPrice（YP010201 两条流水演示「最新一条生效」）；
  // 无记录回落主表 price，再无则返回 null（调用方「单价/金额」显 —）
  function latestPrice(state, drugCode) {
    var last = null;
    PRICE_LOG.forEach(function (r) {
      if (r.drugCode === drugCode && (!last || r.date > last.date)) last = r;
    });
    if (last) return last.newPrice;
    var d = drugOf(state || load(), drugCode);
    return d && d.price ? d.price : null;
  }

  window.PUL_DRUG = { load: load, save: save, drugOf: drugOf, idcodeOf: idcodeOf, normalizeDrug: normalizeDrug,
    conv: conv, unitsText: unitsText, unitsRatio: unitsRatio, subQty: subQty, ratioOf: ratioOf, rebuildUnits: rebuildUnits, parsePackUnit: parsePackUnit, flat: flat, upsertFromFix: upsertFromFix, latestPrice: latestPrice };
})();
