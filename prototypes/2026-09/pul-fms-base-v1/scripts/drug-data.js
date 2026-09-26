/**
 * drug-data.js — 药品字典（主子表）+ 标识码字典：全系统「码⇄药」转换层的唯一事实源
 * 主表 DRUGS：药品级属性（品名/规格/厂家/批准文号/分类/基本单位/换算链/拆零标记/参考进价）
 * 子表 IDCODES：标识码（20位码的前7位=产品资源码）→ drugCode 引用 + 码等级 + 包装规格/包装单位
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
  var DRUGS = [
    { drugCode: 'YP010201', drugName: '乳酸依沙吖啶溶液', formSpec: '0.1%', dosForm: '溶液剂', maker: '北京京丰制药（河北）有限公司', approval: '国药准字H23023728', category: '西药', baseUnit: '盒', units: [{ u: '盒', eq: 1 }], minUnit: null, ipUnpack: '否', opUnpack: '否', price: 8.60, warehouse: '中心库', status: '启用' },
    { drugCode: 'YP010245', drugName: '依姆多', formSpec: '60mg', dosForm: '片剂', maker: '华益药业科技(安徽)有限公司', approval: '国药准字H20030418', category: '西药', baseUnit: '盒', units: [{ u: '箱', eq: 100 }, { u: '盒', eq: 1 }], minUnit: { u: '片', per: 7 }, ipUnpack: '否', opUnpack: '是', price: 45.00, warehouse: '中心库', status: '启用' },
    { drugCode: 'YP010312', drugName: '健脾生血片', formSpec: '每片含硫酸亚铁100mg', dosForm: '片剂', maker: '健民集团叶开泰国药(随州)有限公司', approval: '国药准字Z19991066', category: '中成药', baseUnit: '盒', units: [{ u: '盒', eq: 1 }], minUnit: { u: '片', per: 36 }, ipUnpack: '是', opUnpack: '是', price: 28.50, warehouse: '中心库', status: '启用' },
    { drugCode: 'YP010388', drugName: '加罗新', formSpec: '100ml:盐酸替罗非班5mg', dosForm: '注射剂', maker: '四川科伦药业股份有限公司', approval: '国药准字H20203013', category: '西药', baseUnit: '瓶', units: [{ u: '箱', eq: 60 }, { u: '瓶', eq: 1 }], minUnit: null, ipUnpack: '否', opUnpack: '否', price: 320.00, warehouse: '中心库', status: '启用' },
    { drugCode: 'YP010401', drugName: '唯可来', formSpec: '100mg', dosForm: '片剂', maker: 'AbbVie Ireland NL B.V.', approval: '国药准字HJ20200055', category: '西药', baseUnit: '盒', units: [{ u: '盒', eq: 1 }], minUnit: { u: '片', per: 28 }, ipUnpack: '否', opUnpack: '否', price: 1150.00, warehouse: '中心库', status: '启用' },
    { drugCode: 'YP010477', drugName: '复方氨基酸注射液(3AA)', formSpec: '250ml:10.65g(总氨基酸)', dosForm: '注射剂', maker: '山东齐都药业有限公司', approval: '国药准字H20063949', category: '西药', baseUnit: '瓶', units: [{ u: '箱', eq: 30 }, { u: '瓶', eq: 1 }], minUnit: null, ipUnpack: '否', opUnpack: '否', price: 15.80, warehouse: '分院库（东）', status: '启用' },
    { drugCode: 'YP010529', drugName: '复方甘草口服溶液', formSpec: '复方', dosForm: '口服溶液剂', maker: '福州海王金象中药制药有限公司', approval: '国药准字H35020932', category: '中成药', baseUnit: '盒', units: [{ u: '盒', eq: 1 }], minUnit: { u: '毫升', per: 90 }, ipUnpack: '否', opUnpack: '是', price: 12.30, warehouse: '分院库（东）', status: '启用' }
  ];

  // ===== 标识码子表（packUnit = 该码所在包装层级的单位，从包装规格解析） =====
  // 8461940 = 依姆多二级箱码：演示「扫箱码自动展开 100 个一级盒码」（父子码展开 T2）
  var IDCODES = [
    { idcode: '8400431', drugCode: 'YP010201', level: 1, packSpec: '盒1瓶', packUnit: '盒', status: '启用' },
    { idcode: '8461935', drugCode: 'YP010245', level: 1, packSpec: '盒7片', packUnit: '盒', status: '启用' },
    { idcode: '8461940', drugCode: 'YP010245', level: 2, packSpec: '箱100盒', packUnit: '箱', status: '启用' },
    { idcode: '8433386', drugCode: 'YP010312', level: 1, packSpec: '盒3板', packUnit: '盒', status: '启用' },
    { idcode: '8414784', drugCode: 'YP010388', level: 1, packSpec: '箱60瓶', packUnit: '箱', status: '启用' },
    { idcode: '8416917', drugCode: 'YP010401', level: 1, packSpec: '盒28片', packUnit: '盒', status: '启用' },
    { idcode: '8130779', drugCode: 'YP010477', level: 1, packSpec: '箱30瓶', packUnit: '箱', status: '启用' },
    { idcode: '8441916', drugCode: 'YP010529', level: 1, packSpec: '盒90毫升', packUnit: '盒', status: '启用' }
  ];

  // 从包装规格解析包装单位（'箱60瓶'→'箱'，'盒90毫升'→'盒'）
  function parsePackUnit(packSpec) {
    var m = String(packSpec || '').match(/^[^\d]+/);
    return m ? m[0] : '盒';
  }

  // ===== 持久化：store 命名空间 drug；首次用种子；老会话 pch.dict 增补条目幂等导入 =====
  function migrate(s) {
    (s.drugs || []).forEach(function (d) {
      if (!d.units) d.units = [{ u: d.baseUnit || '盒', eq: 1 }];
      if (d.minUnit === undefined) d.minUnit = null;
      if (!d.status) d.status = '启用';
      if (!d.warehouse) d.warehouse = '中心库';
      if (!d.dosForm) d.dosForm = '-';
    });
    (s.idcodes || []).forEach(function (c) {
      if (!c.packUnit) c.packUnit = parsePackUnit(c.packSpec);
      if (!c.status) c.status = '启用';
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
    return s;
  }
  function load() {
    var raw = window.store ? window.store.load() : {};
    if (raw.drug) return importPch(migrate(raw.drug));
    var seed = { drugs: DRUGS.slice(), idcodes: IDCODES.slice() };
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
  // 换算链人读文案：[{u:'箱',eq:60},{u:'瓶',eq:1}] → '1箱 = 60瓶'
  function unitsText(drug) {
    var us = drug.units || [];
    if (us.length < 2) return '—';
    return '1' + us[0].u + ' = ' + us[0].eq + us[us.length - 1].u;
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
    save(s);
  }

  window.PUL_DRUG = { load: load, save: save, drugOf: drugOf, idcodeOf: idcodeOf,
    conv: conv, unitsText: unitsText, parsePackUnit: parsePackUnit, flat: flat, upsertFromFix: upsertFromFix };
})();
