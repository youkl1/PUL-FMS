/**
 * rx-data.js — 发药管理 Mock（store 命名空间 rx）
 * 方案 b：HIS 拉取只锁药品级数量；调剂扫码才绑码；已完成码从药房在架扣除
 */
(function () {
  'use strict';

  var HIS_SEED = [
    { hisNo: 'HIS20260924001', rxNo: 'CF20260924001', date: '2026-09-24 08:42', pharmacy: '门诊药房',
      visitType: '门诊', dept: '呼吸内科', patientId: 'P10021', patient: '张伟', sex: '男', age: 46, phone: '13800001001',
      items: [{ drugCode: 'YP010401', qty: 1, unit: '盒' }], pulled: false },
    { hisNo: 'HIS20260924002', rxNo: 'CF20260924002', date: '2026-09-24 09:05', pharmacy: '门诊药房',
      visitType: '门诊', dept: '消化内科', patientId: 'P10022', patient: '李敏', sex: '女', age: 38, phone: '13800001002',
      items: [{ drugCode: 'YP010312', qty: 1, unit: '盒' }], pulled: false },
    { hisNo: 'HIS20260924003', rxNo: 'CF20260924003', date: '2026-09-24 09:18', pharmacy: '门诊药房',
      visitType: '门诊', dept: '心内科', patientId: 'P10023', patient: '王芳', sex: '女', age: 61, phone: '13800001003',
      items: [{ drugCode: 'YP010245', qty: 1, unit: '盒' }], pulled: false }
  ];
  var HIS_TRAY_SEED = [
    { hisNo: 'HISBY20260924001', trayNo: 'BY20260924001', date: '2026-09-24 10:12', pharmacy: '门诊药房',
      ward: '呼吸内科病区', bed: '3床', inpatientNo: 'ZY10031',
      patientId: 'P20031', patient: '赵强', sex: '男', age: 67,
      items: [{ drugCode: 'YP010312', qty: 1, unit: '盒' }], pulled: false },
    { hisNo: 'HISBY20260924002', trayNo: 'BY20260924002', date: '2026-09-24 10:28', pharmacy: '门诊药房',
      ward: '消化内科病区', bed: '5床', inpatientNo: 'ZY10032',
      patientId: 'P20032', patient: '孙丽', sex: '女', age: 54,
      items: [{ drugCode: 'YP010245', qty: 1, unit: '盒' }], pulled: false }
  ];

  function migrate(s) {
    if (!s.hisPool) s.hisPool = HIS_SEED.map(function (h) { return JSON.parse(JSON.stringify(h)); });
    if (!s.hisTrayPool) s.hisTrayPool = HIS_TRAY_SEED.map(function (h) { return JSON.parse(JSON.stringify(h)); });
    if (!s.rxDocs) s.rxDocs = [];
    if (!s.trayDocs) s.trayDocs = [];
    if (!s.retDocs) s.retDocs = [];
    return s;
  }
  function load() {
    var raw = window.store ? window.store.load() : {};
    if (raw.rx) return migrate(raw.rx);
    var seed = migrate({});
    if (window.store) window.store.update({ rx: seed });
    return seed;
  }
  function save(state) { if (window.store) window.store.update({ rx: state }); }

  function now() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function nextNo(prefix, list, field) {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var ymd = '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var n = list.filter(function (x) { return (x[field] || '').indexOf(prefix + ymd) === 0; }).length + 1;
    return prefix + ymd + ('00' + n).slice(-3);
  }
  function dict() { return window.PUL_DRUG.flat(window.PUL_DRUG.load()); }
  function drugOf(dc) { return window.PUL_DRUG.drugOf(window.PUL_DRUG.load(), dc); }
  function parse(code20) { return window.PUL_PCH.parseCode(code20, dict()); }

  function addReserved(docs, pending, pharmacy, drugCode) {
    var n = 0;
    (docs || []).forEach(function (d) {
      if (d.pharmacy !== pharmacy) return;
      if (pending.indexOf(d.status) < 0) return;
      (d.items || []).forEach(function (it) {
        if (it.drugCode !== drugCode) return;
        n += Math.max(0, it.qty - (it.codes || []).length);
      });
    });
    return n;
  }
  function reservedUnbound(state, pharmacy, drugCode) {
    return addReserved(state.rxDocs, ['待发药', '发药中'], pharmacy, drugCode) +
      addReserved(state.trayDocs, ['待摆药', '摆药中'], pharmacy, drugCode);
  }
  function onHandOf(wh, pharmacy, drugCode) {
    var n = 0;
    window.PUL_WH.pharmacyStock(wh, pharmacy).forEach(function (c) {
      if (c.split === '是') return;
      var p = parse(c.code);
      if (p.dict && p.dict.drugCode === drugCode) n += 1;
    });
    return n;
  }
  function availableQty(wh, state, pharmacy, drugCode) {
    return Math.max(0, onHandOf(wh, pharmacy, drugCode) - reservedUnbound(state, pharmacy, drugCode));
  }
  function suggestCodes(wh, pharmacy, drugCode, need) {
    var list = window.PUL_WH.pharmacyStock(wh, pharmacy).filter(function (c) {
      if (c.split === '是') return false;
      var p = parse(c.code);
      return p.dict && p.dict.drugCode === drugCode;
    });
    list.sort(function (a, b) {
      var al = a.phLoc ? 0 : 1, bl = b.phLoc ? 0 : 1;
      if (al !== bl) return al - bl;
      return String(a.expDate || '').localeCompare(String(b.expDate || ''));
    });
    return list.slice(0, need);
  }
  function itemDone(it) {
    var n = 0;
    (it.codes || []).forEach(function (c) { if (c.split !== '是') n++; });
    return n >= it.qty;
  }
  function rxDone(d) { return (d.items || []).every(itemDone); }

  window.PUL_RX = {
    load: load, save: save, now: now, nextNo: nextNo, drugOf: drugOf, parse: parse,
    availableQty: availableQty, suggestCodes: suggestCodes, itemDone: itemDone, rxDone: rxDone
  };
})();
