/**
 * facility-data.js — 设施字典唯一事实源（客户新版 2026-09-21）
 * 库房（挂院区）→ 库位 ｜ 药房（挂院区）→ 货位 ｜ 取药柜（挂药房）→ 摆药层 → 取药槽 ｜ 基站（挂药房）→ 灯组
 * 本期只做字典结构；药品↔取药槽↔灯组绑定关系后期再议（客户拍板：后期考虑）。
 * 持久化：store 命名空间 facility；嵌套子数组（与 drug-data 平铺不同：设施层级浅、总量小，嵌套更直观）
 */
(function () {
  'use strict';

  function locs(prefix, n) {
    var out = [];
    for (var i = 1; i <= n; i++) out.push({ code: prefix + '-' + ('0' + i).slice(-2), name: prefix + ' 区 ' + i + ' 位', status: '启用' });
    return out;
  }
  function layers(n, cellsPer) {
    var out = [];
    for (var i = 1; i <= n; i++) {
      var cells = [];
      for (var j = 1; j <= cellsPer; j++) cells.push({ code: 'C' + i + '-' + ('0' + j).slice(-2), name: i + ' 层 ' + j + ' 槽', status: '空闲' });
      out.push({ code: 'L' + i, name: '第 ' + i + ' 摆药层', cells: cells });
    }
    return out;
  }
  function lamps(prefix, n) {
    var out = [];
    for (var i = 1; i <= n; i++) out.push({ code: prefix + '-L' + ('0' + i).slice(-2), name: '灯组 ' + i, addr: prefix + '-L' + ('0' + i).slice(-2), status: '在线' });
    return out;
  }

  var SEED = {
    warehouses: [
      { code: 'WH001', name: '中心库',         org: '中心院区', type: '常温库',   status: '启用', locations: locs('A', 8) },
      { code: 'WH002', name: '分院库（东）',   org: '东院区',   type: '常温库',   status: '启用', locations: locs('B', 6) },
      { code: 'WH003', name: '分院库（滨海）', org: '滨海院区', type: '阴凉库',   status: '启用', locations: locs('C', 6) },
      { code: 'WH004', name: '麻精专库',       org: '滨海院区', type: '麻精专库', status: '启用', locations: locs('D', 4) }
    ],
    pharmacies: [
      { code: 'PH001', name: '门诊药房',       org: '中心院区', type: '门诊药房', status: '启用', slots: locs('M', 6) },
      { code: 'PH002', name: '住院药房',       org: '中心院区', type: '住院药房', status: '启用', slots: locs('Z', 6) },
      { code: 'PH003', name: '急诊药房（东）', org: '东院区',   type: '急诊药房', status: '启用', slots: locs('J', 4) }
    ],
    cabinets: [
      { code: 'CB01', name: '门诊取药柜 1 号', org: '中心院区', pharmacy: '门诊药房', status: '启用', layers: layers(3, 6) },
      { code: 'CB02', name: '门诊取药柜 2 号', org: '中心院区', pharmacy: '门诊药房', status: '启用', layers: layers(4, 6) },
      { code: 'CB03', name: '住院取药柜 1 号', org: '中心院区', pharmacy: '住院药房', status: '停用', layers: layers(3, 4) }
    ],
    stations: [
      { code: 'BS01', name: '门诊基站 1 号', org: '中心院区', pharmacy: '门诊药房', status: '在线', lamps: lamps('BS01', 4) },
      { code: 'BS02', name: '住院基站 1 号', org: '中心院区', pharmacy: '住院药房', status: '在线', lamps: lamps('BS02', 3) }
    ]
  };

  function load() {
    var raw = window.store ? window.store.load() : {};
    if (raw.facility) return raw.facility;
    var seed = JSON.parse(JSON.stringify(SEED));
    if (window.store) window.store.update({ facility: seed });
    return seed;
  }
  function save(state) { if (window.store) window.store.update({ facility: state }); }

  window.PUL_FACILITY = { load: load, save: save };
})();
