/**
 * facility-data.js — 设施字典唯一事实源（客户新版 2026-09-21 + Round AT 对照绑定提前 2026-10-05）
 * 库房（挂院区）→ 库位 ｜ 药房（挂院区）→ 货位 ｜ 取药柜（挂院区→药房→货位，分物理/逻辑）→ 摆药层 → 取药槽
 * 基站（挂院区→药房→货位，分灯组基站/单灯基站）；灯组平铺顶级、stationCode 可空=游离
 * 绑定：药品↔取药槽一对多（cell.drugCode）；取药槽↔灯组一对一（cell.lampAddr ↔ lamp.cellCode 双向同步）
 * 逻辑柜：建柜自动 1 层；取药槽靠选药品生成（一药一槽、建槽即对照）；取药槽无需灯组
 * 持久化：store 命名空间 facility；v=2 起灯组平铺（旧嵌套数据 load 时自动迁移）
 */
(function () {
  'use strict';

  var V = 2;
  var MAX_LAMPS = 200; // 一个基站最多 200 个灯组（客户新版 #6）

  function locs(prefix, n) {
    var out = [];
    for (var i = 1; i <= n; i++) out.push({ code: prefix + '-' + ('0' + i).slice(-2), name: prefix + ' 区 ' + i + ' 位', status: '启用' });
    return out;
  }
  function cell(code, name, extra) {
    return Object.assign({ code: code, name: name, status: '空闲', drugCode: '', drugName: '', lampAddr: '' }, extra || {});
  }
  function layers(n, cellsPer) {
    var out = [];
    for (var i = 1; i <= n; i++) {
      var cells = [];
      for (var j = 1; j <= cellsPer; j++) cells.push(cell('C' + i + '-' + ('0' + j).slice(-2), i + ' 层 ' + j + ' 槽'));
      out.push({ code: 'L' + i, name: '第 ' + i + ' 摆药层', high: false, cells: cells });
    }
    return out;
  }
  function lamp(addr, stationCode, extra) {
    return Object.assign({ addr: addr, name: '灯组 ' + addr.slice(-2), status: '在线', stationCode: stationCode, cellCode: '', remark: '' }, extra || {});
  }

  var SEED = {
    v: V,
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
      { code: 'CB01', name: '门诊取药柜 1 号', org: '中心院区', pharmacy: '门诊药房', slot: 'M-01', ctype: '物理', seq: 1, remark: '', status: '启用',
        layers: (function () { var ls = layers(3, 6);
          // 预置一条对照演示：C1-01 ↔ 依姆多 + 灯组 BS01-L01
          ls[0].cells[0] = cell('C1-01', '1 层 1 槽', { status: '占用', drugCode: 'YP010245', drugName: '依姆多', lampAddr: 'BS01-L01' });
          return ls; })() },
      { code: 'CB02', name: '门诊取药柜 2 号', org: '中心院区', pharmacy: '门诊药房', slot: 'M-02', ctype: '物理', seq: 2, remark: '', status: '启用', layers: layers(4, 6) },
      { code: 'CB03', name: '住院取药柜 1 号', org: '中心院区', pharmacy: '住院药房', slot: 'Z-01', ctype: '物理', seq: 3, remark: '', status: '停用', layers: layers(3, 4) },
      { code: 'CB04', name: '门诊拆零逻辑柜 1 号', org: '中心院区', pharmacy: '门诊药房', slot: 'M-03', ctype: '逻辑', seq: 4, remark: '拆零药品虚拟长柜', status: '启用',
        layers: [{ code: 'L1', name: '第 1 摆药层', high: false, cells: [
          cell('L1-C001', '依姆多',     { status: '占用', drugCode: 'YP010245', drugName: '依姆多' }),
          cell('L1-C002', '健脾生血片', { status: '占用', drugCode: 'YP010312', drugName: '健脾生血片' }),
          cell('L1-C003', '唯可来',     { status: '占用', drugCode: 'YP010401', drugName: '唯可来' })
        ] }] }
    ],
    stations: [
      { code: 'BS01', name: '门诊基站 1 号', org: '中心院区', pharmacy: '门诊药房', slot: 'M-01', stype: '灯组基站', ip: '192.168.0.15', port: '8886', remark: '', status: '在线' },
      { code: 'BS02', name: '住院基站 1 号', org: '中心院区', pharmacy: '住院药房', slot: 'Z-01', stype: '灯组基站', ip: '192.168.0.9',  port: '8886', remark: '', status: '在线' }
    ],
    lamps: [
      lamp('BS01-L01', 'BS01', { cellCode: 'C1-01' }),
      lamp('BS01-L02', 'BS01'), lamp('BS01-L03', 'BS01'), lamp('BS01-L04', 'BS01'),
      lamp('BS02-L01', 'BS02'), lamp('BS02-L02', 'BS02'), lamp('BS02-L03', 'BS02'),
      lamp('BS99-L01', '', { name: '灯组 01', remark: '新到未上架' }),   // 游离：无所属基站
      lamp('BS99-L02', '', { name: '灯组 02', remark: '新到未上架' })
    ]
  };

  // ===== v1 → v2 迁移：灯组嵌套→平铺；取药柜补 ctype/slot/seq/remark/high/对照字段；基站补 stype/ip/port/slot/remark =====
  function migrate(s) {
    (s.cabinets || []).forEach(function (c) {
      if (!c.ctype) c.ctype = '物理';
      if (c.slot === undefined) c.slot = '';
      if (c.seq === undefined) c.seq = 1000;
      if (c.remark === undefined) c.remark = '';
      (c.layers || []).forEach(function (l) {
        if (l.high === undefined) l.high = false;
        (l.cells || []).forEach(function (cl) {
          if (cl.drugCode === undefined) cl.drugCode = '';
          if (cl.drugName === undefined) cl.drugName = '';
          if (cl.lampAddr === undefined) cl.lampAddr = '';
        });
      });
    });
    if (!Array.isArray(s.lamps)) {
      var flat = [];
      (s.stations || []).forEach(function (st) {
        (st.lamps || []).forEach(function (l) {
          flat.push({ addr: l.addr || l.code, name: l.name || '', status: l.status || '在线',
            stationCode: st.code, cellCode: l.cellCode || '', remark: l.remark || '' });
        });
      });
      s.lamps = flat;
    }
    (s.stations || []).forEach(function (st) {
      delete st.lamps;
      if (!st.stype) st.stype = '灯组基站';
      if (st.ip === undefined) st.ip = '';
      if (st.port === undefined) st.port = '8886';
      if (st.slot === undefined) st.slot = '';
      if (st.remark === undefined) st.remark = '';
    });
    s.v = V;
    return s;
  }

  function load() {
    var raw = window.store ? window.store.load() : {};
    if (raw.facility) {
      if (raw.facility.v !== V) { migrate(raw.facility); if (window.store) window.store.update({ facility: raw.facility }); }
      return raw.facility;
    }
    var seed = JSON.parse(JSON.stringify(SEED));
    if (window.store) window.store.update({ facility: seed });
    return seed;
  }
  function save(state) { if (window.store) window.store.update({ facility: state }); }

  // ===== 查询与绑定纯函数（页面与 node 校验共用；返回 ''=成功，否则=拦截原因） =====
  function cabinetOf(s, code) {
    for (var i = 0; i < s.cabinets.length; i++) if (s.cabinets[i].code === code) return s.cabinets[i];
    return null;
  }
  function stationOf(s, code) {
    for (var i = 0; i < s.stations.length; i++) if (s.stations[i].code === code) return s.stations[i];
    return null;
  }
  function stationLamps(s, stationCode) {
    return s.lamps.filter(function (l) { return l.stationCode === stationCode; });
  }
  function looseLamps(s) {
    return s.lamps.filter(function (l) { return !l.stationCode; });
  }
  function findLamp(s, addr) {
    for (var i = 0; i < s.lamps.length; i++) if (s.lamps[i].addr === addr) return s.lamps[i];
    return null;
  }
  // 全设施范围按取药槽编号定位（槽号全局唯一：物理 C层-槽 / 逻辑 L1-Cnnn）
  function findCell(s, cellCode) {
    for (var i = 0; i < s.cabinets.length; i++) {
      var c = s.cabinets[i];
      for (var j = 0; j < c.layers.length; j++) {
        var l = c.layers[j];
        for (var k = 0; k < l.cells.length; k++) {
          if (l.cells[k].code === cellCode) return { cabinet: c, layer: l, cell: l.cells[k] };
        }
      }
    }
    return null;
  }

  // 取药槽 ↔ 灯组 一对一（仅物理柜；换绑自动释放旧关系）
  function bindLamp(s, cellCode, addr) {
    var f = findCell(s, cellCode);
    if (!f) return '取药槽 ' + cellCode + ' 不存在';
    if (f.cabinet.ctype === '逻辑') return '逻辑取药柜的取药槽无需对照灯组';
    var lp = findLamp(s, addr);
    if (!lp) return '灯组 ' + addr + ' 不存在（请先在基站灯组维护扫码登记）';
    if (f.cell.lampAddr === addr) return '该取药槽已绑定此灯组，无需重复操作';
    if (f.cell.lampAddr) { var old = findLamp(s, f.cell.lampAddr); if (old) old.cellCode = ''; }
    if (lp.cellCode) { var oldCell = findCell(s, lp.cellCode); if (oldCell) oldCell.cell.lampAddr = ''; }
    f.cell.lampAddr = addr;
    lp.cellCode = cellCode;
    return '';
  }
  function unbindLamp(s, cellCode) {
    var f = findCell(s, cellCode);
    if (!f || !f.cell.lampAddr) return '该取药槽未绑定灯组';
    var lp = findLamp(s, f.cell.lampAddr);
    if (lp) lp.cellCode = '';
    f.cell.lampAddr = '';
    return '';
  }

  // 药品 ↔ 取药槽 一对多（一槽一药；逻辑柜建槽即对照，事后不可改）
  function bindDrug(s, cellCode, drug) {
    var f = findCell(s, cellCode);
    if (!f) return '取药槽 ' + cellCode + ' 不存在';
    if (f.cabinet.ctype === '逻辑') return '逻辑取药柜的取药槽在建槽时已对照药品，如需变更请删除取药槽后重建';
    if (!drug || !drug.drugCode) return '药品不存在';
    if (f.cell.drugCode === drug.drugCode) return '该取药槽已对照此药品，无需重复操作';
    f.cell.drugCode = drug.drugCode;
    f.cell.drugName = drug.drugName;
    f.cell.status = '占用';
    return '';
  }
  function unbindDrug(s, cellCode) {
    var f = findCell(s, cellCode);
    if (!f || !f.cell.drugCode) return '该取药槽未对照药品';
    if (f.cabinet.ctype === '逻辑') return '逻辑取药柜的取药槽不支持解绑药品，请删除取药槽后重建';
    f.cell.drugCode = '';
    f.cell.drugName = '';
    f.cell.status = '空闲';
    return '';
  }

  // 逻辑柜选药品生成取药槽：一药一槽、建槽即对照；编号 L1-Cnnn 自增；本柜已对照的药品跳过
  function genLogicCells(cabinet, drugs) {
    var layer = cabinet.layers[0];
    var max = 0, added = 0, skipped = 0;
    layer.cells.forEach(function (cl) {
      var m = /C(\d+)$/.exec(cl.code);
      if (m) max = Math.max(max, +m[1]);
    });
    drugs.forEach(function (d) {
      var dup = layer.cells.some(function (cl) { return cl.drugCode === d.drugCode; });
      if (dup) { skipped++; return; }
      max++;
      layer.cells.push(cell('L1-C' + ('00' + max).slice(-3), d.drugName,
        { status: '占用', drugCode: d.drugCode, drugName: d.drugName }));
      added++;
    });
    return { added: added, skipped: skipped };
  }

  window.PUL_FACILITY = {
    load: load, save: save, MAX_LAMPS: MAX_LAMPS,
    cabinetOf: cabinetOf, stationOf: stationOf, stationLamps: stationLamps, looseLamps: looseLamps,
    findLamp: findLamp, findCell: findCell,
    bindLamp: bindLamp, unbindLamp: unbindLamp, bindDrug: bindDrug, unbindDrug: unbindDrug,
    genLogicCells: genLogicCells
  };
})();
