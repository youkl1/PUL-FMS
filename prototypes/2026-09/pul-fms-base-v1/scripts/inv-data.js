/**
 * inv-data.js — 盘点 Mock（store 命名空间 inv）
 * 药品盘点单扫码对照在架快照：多扫=盘盈，少扫=盘亏；审核后到盘盈入库单/盘亏出库单过账
 */
(function () {
  'use strict';

  var NOCODE_SEED = [
    { recNo: 'WM20260901001', date: '2026-09-01 10:00', node: '中心库', drugCode: 'YP010201', qty: 2, unit: '盒', reason: '中药饮片无码', remark: '演示' },
    { recNo: 'WM20260910002', date: '2026-09-10 15:20', node: '门诊药房', drugCode: 'YP010529', qty: 6, unit: '盒', reason: '拆零制剂无独立码', remark: '' }
  ];

  function migrate(s) {
    if (!s.countDocs) s.countDocs = [];
    if (!s.nocode) s.nocode = NOCODE_SEED.map(function (x) { return Object.assign({}, x); });
    return s;
  }
  function load() {
    var raw = window.store ? window.store.load() : {};
    if (raw.inv) return migrate(raw.inv);
    var seed = migrate({});
    if (window.store) window.store.update({ inv: seed });
    return seed;
  }
  function save(state) { if (window.store) window.store.update({ inv: state }); }

  function curNode() {
    var u = (window.store && window.store.load().currentUser) || {};
    var name = u.warehouse || '';
    var nodes = window.PUL ? window.PUL.nodesOfOrg(u.org) : [];
    var type = '';
    for (var i = 0; i < nodes.length; i++) if (nodes[i].name === name) { type = nodes[i].type; break; }
    var kind = (window.PUL && window.PUL.nodeKind(type)) || '';
    if (kind === '药房') return { name: name || window.PUL_WH.curPharm(), kind: '药房' };
    return { name: name || '中心库', kind: '库房' };
  }

  function snapshot(kind, nodeName) {
    var wh = window.PUL_WH.load();
    var pch = window.PUL_PCH.load();
    var list = kind === '药房'
      ? window.PUL_WH.pharmacyStock(wh, nodeName)
      : window.PUL_WH.stockAll(pch, wh, nodeName);
    return list.map(function (c) { return Object.assign({}, c); });
  }

  function diff(d) {
    var sys = {}, sc = {};
    (d.sysCodes || []).forEach(function (c) { sys[c.code] = c; });
    (d.scanned || []).forEach(function (c) { sc[c.code] = c; });
    var gain = [], loss = [], match = 0;
    Object.keys(sc).forEach(function (k) { if (!sys[k]) gain.push(sc[k]); else match++; });
    Object.keys(sys).forEach(function (k) { if (!sc[k]) loss.push(sys[k]); });
    return { gain: gain, loss: loss, match: match };
  }

  function postGain(d) {
    var W = window.PUL_WH, wh = W.load();
    var df = diff(d);
    if (!df.gain.length) return;
    if (d.kind === '药房') {
      wh.pickDocs = wh.pickDocs || [];
      wh.pickDocs.unshift({
        billNo: W.nextNo('PYRK', wh.pickDocs, 'billNo'), date: W.now(), pharmacy: d.node, warehouse: '中心库',
        status: '已入库·待上架', inTime: W.now(), outTime: W.now(), createTime: W.now(), submitTime: W.now(),
        source: '库房制单', applicant: d.auditor || '', operator: d.auditor || '',
        items: [], badCodes: [], shelfLoc: '',
        codes: df.gain.map(function (c) { return Object.assign({}, c); }), remark: '盘盈入库单 ' + d.billNo
      });
    } else {
      wh.othInDocs = wh.othInDocs || [];
      wh.othInDocs.unshift({
        billNo: W.nextNo('PYRK', wh.othInDocs, 'billNo'), date: W.now(), type: '盘盈入库单', warehouse: d.node,
        remark: '盘点 ' + d.billNo, status: '已审核', auditTime: W.now(), auditor: d.auditor || '',
        codes: df.gain.map(function (c) { return Object.assign({}, c, { checked: true }); })
      });
    }
    W.save(wh);
    d.gainPosted = true;
  }

  function postLoss(d) {
    var W = window.PUL_WH, wh = W.load();
    var df = diff(d);
    if (!df.loss.length) return;
    if (d.kind === '药房') {
      wh.phLossDocs = wh.phLossDocs || [];
      wh.phLossDocs.unshift({
        billNo: W.nextNo('YFSH', wh.phLossDocs, 'billNo'), date: W.now(), reason: '其他', pharmacy: d.node,
        remark: '盘亏转入 ' + d.billNo, status: '已审核', auditTime: W.now(), auditor: d.auditor || '',
        codes: df.loss.map(function (c) { return Object.assign({}, c); })
      });
    } else {
      wh.lossDocs = wh.lossDocs || [];
      wh.lossDocs.unshift({
        billNo: W.nextNo('SHCK', wh.lossDocs, 'billNo'), date: W.now(), reason: '其他', source: '盘亏转入',
        warehouse: d.node, status: '已审核', auditTime: W.now(), auditor: d.auditor || '',
        remark: '盘点 ' + d.billNo, codes: df.loss.map(function (c) { return Object.assign({}, c); })
      });
    }
    W.save(wh);
    d.lossPosted = true;
  }

  window.PUL_INV = { load: load, save: save, curNode: curNode, snapshot: snapshot, diff: diff, postGain: postGain, postLoss: postLoss };
})();
