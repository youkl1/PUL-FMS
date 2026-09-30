/**
 * ledger-data.js — 台账查询：从 pch/wh/rx 单据派生流水（不另存状态）
 */
(function () {
  'use strict';

  function dict() { return window.PUL_DRUG.flat(window.PUL_DRUG.load()); }
  function parse(code) { return window.PUL_PCH.parseCode(code, dict()); }
  function drugName(code) {
    var p = parse(code);
    return p.dict ? p.dict.drugName : '未解析';
  }
  function drugCodeOf(code) {
    var p = parse(code);
    return p.dict ? p.dict.drugCode : '';
  }

  function ev(time, type, billNo, href, node, codes, extra) {
    return Object.assign({ time: time || '', type: type, billNo: billNo || '', href: href || '',
      node: node || '', codes: codes || [] }, extra || {});
  }
  function codesOf(d) { return (d && d.codes) || []; }

  function collect() {
    var pch = window.PUL_PCH.load();
    var wh = window.PUL_WH.load();
    var rx = window.PUL_RX.load();
    var out = [];

    (pch.inDocs || []).forEach(function (d) {
      if (d.audit !== '已审核') return;
      out.push(ev(d.auditDate || d.date, '采购入库单', d.billNo, 'purchase-in.html?billNo=' + encodeURIComponent(d.billNo),
        d.warehouse, codesOf(d)));
    });
    (pch.outDocs || []).forEach(function (d) {
      if (d.status !== '已审核') return;
      out.push(ev(d.auditTime || d.date, '采购退货单', d.billNo, 'purchase-out.html', d.warehouse, codesOf(d)));
    });
    (wh.othInDocs || []).forEach(function (d) {
      if (d.status !== '已审核') return;
      out.push(ev(d.auditTime || d.date, '其他入库单', d.billNo, 'wh-other-in.html', d.warehouse, codesOf(d)));
    });
    (wh.othOutDocs || []).forEach(function (d) {
      if (d.status !== '已审核') return;
      out.push(ev(d.auditTime || d.date, '其他出库单', d.billNo, 'wh-other-out.html', d.warehouse, codesOf(d)));
    });
    (wh.lossDocs || []).forEach(function (d) {
      if (d.status !== '已审核') return;
      out.push(ev(d.auditTime || d.date, '库房损耗', d.billNo, 'wh-loss-out.html?billNo=' + encodeURIComponent(d.billNo),
        d.warehouse, codesOf(d)));
    });
    (wh.pickDocs || []).forEach(function (d) {
      var t = d.status === '药房已入库' ? '药房入库' : '领用出库';
      out.push(ev(d.auditTime || d.date, t, d.billNo, 'wh-pick.html', d.pharmacy || d.warehouse, codesOf(d)));
    });
    (wh.retPool || []).forEach(function (d) {
      out.push(ev(d.date, '药房退回', d.retNo, 'ph-ret-out.html', d.pharmacy, codesOf(d)));
    });
    (wh.phLossDocs || []).forEach(function (d) {
      if (d.status !== '已审核') return;
      out.push(ev(d.auditTime || d.date, '药房损耗', d.billNo, 'ph-loss.html', d.pharmacy, codesOf(d)));
    });
    (rx.rxDocs || []).forEach(function (d) {
      if (d.status !== '发药中' && d.status !== '已完成' && d.status !== '已退药') return;
      var cs = [];
      (d.items || []).forEach(function (it) { (it.codes || []).forEach(function (c) { cs.push(c); }); });
      if (!cs.length) return;
      out.push(ev(d.doneTime || d.startTime || d.date, '处方发药', d.rxNo, 'disp.html', d.pharmacy, cs,
        { patient: d.patient }));
    });
    (rx.retDocs || []).forEach(function (d) {
      out.push(ev(d.date, '处方单退药', d.retNo, 'rx-ret.html', d.pharmacy, codesOf(d), { patient: d.patient }));
    });
    (rx.trayDocs || []).forEach(function (d) {
      if (d.status !== '摆药中' && d.status !== '已完成') return;
      var cs = [];
      (d.items || []).forEach(function (it) { (it.codes || []).forEach(function (c) { cs.push(c); }); });
      if (!cs.length) return;
      out.push(ev(d.doneTime || d.startTime || d.date, '住院摆药', d.trayNo, 'tray.html?trayNo=' + encodeURIComponent(d.trayNo),
        d.pharmacy, cs, { patient: d.patient, ward: d.ward }));
      if (d.signedAt) {
        out.push(ev(d.signedAt, '病区签收', d.trayNo, 'ward-sign.html?trayNo=' + encodeURIComponent(d.trayNo),
          d.ward, cs, { patient: d.patient }));
      }
    });
    out.sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); });
    return out;
  }

  function locate(code20) {
    var hist = collect().filter(function (e) {
      return (e.codes || []).some(function (c) { return c.code === code20; });
    });
    // 附加绑定来源：把单条流水里该码的 bindType/verified 提到事件级（供 trace-q 徽标展示）
    hist.forEach(function (e) {
      (e.codes || []).forEach(function (c) {
        if (c.code === code20) { e.bindType = c.bindType || 'scan'; e.verified = c.verified || ''; }
      });
    });
    var pch = window.PUL_PCH.load();
    var wh = window.PUL_WH.load();
    var where = '已出系统';
    var loc = '';
    window.PUL_WH.stockAll(pch, wh).forEach(function (c) {
      if (c.code === code20) { where = '库房在架'; loc = c.location || ''; }
    });
    window.PUL_WH.pharmacyStock(wh, null).forEach(function (c) {
      if (c.code === code20) { where = '药房在架'; loc = c.phLoc || ''; }
    });
    if (where === '已出系统' && hist.length) where = hist[hist.length - 1].type;
    return { code: code20, parse: parse(code20), where: where, loc: loc, hist: hist };
  }

  function ledgerRows() {
    var pch = window.PUL_PCH.load();
    var wh = window.PUL_WH.load();
    var map = {};
    function add(code, field) {
      var p = parse(code);
      if (!p.dict) return;
      var k = p.dict.drugCode;
      if (!map[k]) map[k] = { drugCode: k, drugName: p.dict.drugName, formSpec: p.dict.formSpec,
        unit: p.dict.unit || p.dict.packUnit, wh: 0, ph: 0 };
      map[k][field] += 1;
    }
    window.PUL_WH.stockAll(pch, wh).forEach(function (c) { add(c.code, 'wh'); });
    window.PUL_WH.pharmacyStock(wh, null).forEach(function (c) { add(c.code, 'ph'); });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return a.drugName.localeCompare(b.drugName, 'zh'); });
  }

  window.PUL_LEDGER = { collect: collect, locate: locate, ledgerRows: ledgerRows, parse: parse, drugName: drugName, drugCodeOf: drugCodeOf };
})();
