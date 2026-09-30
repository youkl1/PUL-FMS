/**
 * rx-data.js — 出库管理 Mock（store 命名空间 rx）
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
    if (!s.trayRetDocs) s.trayRetDocs = [];
    if (!s.excDocs) s.excDocs = [];
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
  // 在架码匹配口径：排除拆零 + 解析后 drugCode 一致（onHandOf/suggestCodes/bindSuggest 共用）
  function codeMatch(c, drugCode) {
    if (c.split === '是') return false;
    var p = parse(c.code);
    return !!(p.dict && p.dict.drugCode === drugCode);
  }
  function onHandOf(wh, pharmacy, drugCode) {
    var n = 0;
    window.PUL_WH.pharmacyStock(wh, pharmacy).forEach(function (c) {
      if (codeMatch(c, drugCode)) n += 1;
    });
    return n;
  }
  function availableQty(wh, state, pharmacy, drugCode) {
    return Math.max(0, onHandOf(wh, pharmacy, drugCode) - reservedUnbound(state, pharmacy, drugCode));
  }
  function suggestCodes(wh, pharmacy, drugCode, need) {
    var list = window.PUL_WH.pharmacyStock(wh, pharmacy).filter(function (c) {
      return codeMatch(c, drugCode);
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

  // —— T3 手动补绑 + 赋码异常台账 ——
  function ruleOf(rec) { return rec && rec.phLoc ? '货位FEFO' : 'FIFO'; }
  function srcDateMap(wh) {
    var m = {};
    (wh.pickDocs || []).forEach(function (d) { m[d.billNo] = d.auditTime || d.date || ''; });
    return m;
  }
  // 补绑推荐：有货位（药柜）按 货位序→FEFO→入库先后；无货位按入库先后 FIFO
  function bindSuggest(wh, pharmacy, drugCode) {
    var dates = srcDateMap(wh);
    var list = window.PUL_WH.pharmacyStock(wh, pharmacy).filter(function (c) {
      return codeMatch(c, drugCode);
    });
    var withLoc = [], noLoc = [];
    list.forEach(function (c) { (c.phLoc ? withLoc : noLoc).push(c); });
    withLoc.sort(function (a, b) {
      var t = String(a.phLoc).localeCompare(String(b.phLoc));
      if (t) return t;
      t = String(a.expDate || '').localeCompare(String(b.expDate || ''));
      if (t) return t;
      return String(dates[a._src] || '').localeCompare(String(dates[b._src] || ''));
    });
    noLoc.sort(function (a, b) {
      var t = String(dates[a._src] || '').localeCompare(String(dates[b._src] || ''));
      if (t) return t;
      return String(a.expDate || '').localeCompare(String(b.expDate || ''));
    });
    return withLoc.concat(noLoc);
  }
  function makeExc(state, f) {
    var e = {
      excNo: nextNo('EXC', state.excDocs, 'excNo'),
      type: f.type, refKind: f.refKind, refNo: f.refNo, pharmacy: f.pharmacy,
      drugCode: f.drugCode, code: f.code || '', rule: f.rule || '',
      operator: f.operator || '', time: now(),
      status: f.status || '待复核', confirmBy: '', confirmTime: '', oldCode: ''
    };
    state.excDocs.unshift(e);
    return e;
  }
  function excOf(state, excNo) {
    for (var i = 0; i < state.excDocs.length; i++) if (state.excDocs[i].excNo === excNo) return state.excDocs[i];
    return null;
  }
  function excPendingFor(state, refNo, drugCode) {
    for (var i = 0; i < state.excDocs.length; i++) {
      var e = state.excDocs[i];
      if (e.refNo === refNo && e.drugCode === drugCode && e.status === '待补绑') return e;
    }
    return null;
  }
  function docOf(state, refKind, refNo) {
    var docs = refKind === 'tray' ? state.trayDocs : state.rxDocs;
    for (var i = 0; i < docs.length; i++) if ((docs[i].rxNo || docs[i].trayNo) === refNo) return docs[i];
    return null;
  }
  // 手动补绑：码必须在本药房在架且与药品匹配；绑定打 bindType/verified 标记；写或更新台账
  // 时序约定：占用由 occupiedRxCodes 从 store 派生，页面层每次绑定成功后必须先 save(state) 再查在架
  function bindManual(wh, state, pharmacy, refKind, refNo, drugCode, codeStr, opts) {
    opts = opts || {};
    var doc = docOf(state, refKind, refNo);
    if (!doc) return { ok: false, msg: '单据不存在' };
    var it = null;
    (doc.items || []).forEach(function (x) { if (x.drugCode === drugCode) it = x; });
    if (!it) return { ok: false, msg: '单据不含此药' };
    if ((it.codes || []).some(function (c) { return c.code === codeStr; })) return { ok: false, msg: '该码已绑定' };
    var onh = null;
    window.PUL_WH.pharmacyStock(wh, pharmacy).forEach(function (c) { if (c.code === codeStr) onh = c; });
    if (!onh) return { ok: false, msg: '不在本药房在架（或已被占用）' };
    if (onh.split === '是') return { ok: false, msg: '拆零码不能补绑，拆零走豁免通道' };
    var pm = parse(codeStr);
    if (!pm.dict || pm.dict.drugCode !== drugCode) return { ok: false, msg: '码与药品不符' };
    var exc;
    if (opts.excNo) {
      exc = excOf(state, opts.excNo);
      // 非待补绑（如已被首码转待复核/已确认）不报错、不重置原记录：
      // 置空后落到 makeExc 新建一条待复核记录——同单多码补绑每码各一条台账
      if (exc && exc.status !== '待补绑') exc = null;
    }
    it.codes = it.codes || [];
    it.codes.push(Object.assign({}, onh, { bindType: 'manual', verified: '待复核' }));
    if (exc) {
      exc.code = codeStr; exc.rule = ruleOf(onh); exc.operator = opts.operator || '';
      exc.time = now(); exc.status = '待复核';
    } else {
      exc = makeExc(state, { type: opts.type || '扫码失败', refKind: refKind, refNo: refNo,
        pharmacy: pharmacy, drugCode: drugCode, code: codeStr, rule: ruleOf(onh),
        operator: opts.operator || '', status: '待复核' });
    }
    return { ok: true, msg: '已补绑，待日结复核', excNo: exc.excNo };
  }
  // 日结复核确认：台账转已确认 + 码核验标记转已复核
  function confirmExc(state, excNo, operator) {
    var e = excOf(state, excNo);
    if (!e || e.status !== '待复核') return { ok: false, msg: '记录不存在或状态不可确认' };
    e.status = '已确认'; e.confirmBy = operator || ''; e.confirmTime = now();
    var doc = docOf(state, e.refKind, e.refNo);
    if (doc) (doc.items || []).forEach(function (it) {
      (it.codes || []).forEach(function (c) { if (c.code === e.code) c.verified = '已复核'; });
    });
    return { ok: true, msg: '已确认' };
  }
  // 关闭：药已退等无需补绑情形，码池不动
  function closeExc(state, excNo, operator) {
    var e = excOf(state, excNo);
    if (!e || e.status === '已确认' || e.status === '已关闭') return { ok: false, msg: '当前状态不可关闭' };
    e.status = '已关闭'; e.confirmBy = operator || ''; e.confirmTime = now();
    return { ok: true, msg: '已关闭' };
  }
  // 改绑：摘除旧码即回架（占用由 it.codes 派生），绑新码；改绑=人工校正，新码直接已复核
  function rebindExc(wh, state, pharmacy, excNo, newCode, operator) {
    var e = excOf(state, excNo);
    if (!e || (e.status !== '待复核' && e.status !== '已确认')) return { ok: false, msg: '当前状态不可改绑' };
    var doc = docOf(state, e.refKind, e.refNo);
    if (!doc) return { ok: false, msg: '单据不存在' };
    var it = null;
    (doc.items || []).forEach(function (x) { if (x.drugCode === e.drugCode) it = x; });
    if (!it) return { ok: false, msg: '单据不含此药' };
    var idx = -1;
    (it.codes || []).forEach(function (c, i) { if (c.code === e.code) idx = i; });
    if (idx < 0) return { ok: false, msg: '原码已不在单据上（可能已退药）' };
    var onh = null;
    window.PUL_WH.pharmacyStock(wh, pharmacy).forEach(function (c) { if (c.code === newCode) onh = c; });
    if (!onh) return { ok: false, msg: '新码不在本药房在架' };
    it.codes.splice(idx, 1);
    it.codes.push(Object.assign({}, onh, { bindType: 'manual', verified: '已复核' }));
    e.oldCode = e.code; e.code = newCode; e.rule = ruleOf(onh);
    e.status = '已改绑'; e.confirmBy = operator || ''; e.confirmTime = now();
    return { ok: true, msg: '已改绑：原码回架，新码已复核' };
  }
  // 超 24h 未处理（待补绑/待复核）
  var OVERDUE_MS = 24 * 3600 * 1000;
  function overdue(e) {
    if (e.status !== '待补绑' && e.status !== '待复核') return false;
    var t = new Date(String(e.time).replace(' ', 'T')).getTime();
    return !!t && (Date.now() - t) > OVERDUE_MS;
  }

  window.PUL_RX = {
    load: load, save: save, now: now, nextNo: nextNo, drugOf: drugOf, parse: parse,
    availableQty: availableQty, suggestCodes: suggestCodes, itemDone: itemDone, rxDone: rxDone,
    bindSuggest: bindSuggest, makeExc: makeExc, excOf: excOf, excPendingFor: excPendingFor,
    docOf: docOf, bindManual: bindManual, confirmExc: confirmExc, closeExc: closeExc,
    rebindExc: rebindExc, overdue: overdue
  };
})();
