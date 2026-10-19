/**
 * wh-loss-query.js — 损耗明细查询：药品汇总（码 count 派生）→ 单据下钻 → 深链损耗出库单
 * 三来源合并（日常报损/盘亏转入/数据迁移）；每个数字都能点开到对应的码（推论 1 的报表面）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'lossQ', crumb: ['出库管理', '损耗明细查询', '损耗明细查询'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load();
  var DICT = D.flat(DS);
  var sel = null;   // 'idcode|batch'
  var filters = { dateFrom: '', dateTo: '', reason: '全部', source: '全部', drugName: '' };

  // 全部损耗码行（含单据归属）
  function rows() {
    var out = [];
    S.lossDocs.forEach(function (d) {
      if (d.status !== '已审核') return;
      if (filters.dateFrom && d.date.slice(0, 10) < filters.dateFrom) return;
      if (filters.dateTo && d.date.slice(0, 10) > filters.dateTo) return;
      if (filters.reason !== '全部' && d.reason !== filters.reason) return;
      if (filters.source !== '全部' && d.source !== filters.source) return;
      (d.codes || []).forEach(function (c) {
        var p = P.parseCode(c.code, DICT);
        if (filters.drugName && (!p.dict || p.dict.drugName.indexOf(filters.drugName) === -1)) return;
        out.push({ doc: d, code: c, dict: p.dict, idcode: p.idcode });
      });
    });
    return out;
  }
  // 汇总：药品×批次（qty=码 count，docs=涉及单据）
  function grouped() {
    var map = {};
    rows().forEach(function (r) {
      var key = r.idcode + '|' + r.code.batch;
      if (!map[key]) map[key] = { key: key, dict: r.dict, batch: r.code.batch, qty: 0, docs: {}, reasons: {} };
      map[key].qty += 1;
      map[key].docs[r.doc.billNo] = r.doc;
      map[key].reasons[r.doc.reason] = 1;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fDrugName" style="width:160px;" placeholder="药品通用名" value="' + esc(filters.drugName) + '">' +
      '<select class="form-select" id="fReason" style="width:120px;">' +
        ['全部'].concat(W.LOSS_REASONS).map(function (o) { return opt(filters.reason, o, o === '全部' ? '损耗原因' : o); }).join('') + '</select>' +
      '<select class="form-select" id="fSource" style="width:120px;">' +
        ['全部'].concat(W.LOSS_SOURCES).map(function (o) { return opt(filters.source, o, o === '全部' ? '来源' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fDateFrom" type="date" style="width:145px;" value="' + filters.dateFrom + '">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fDateTo" type="date" style="width:145px;" value="' + filters.dateTo + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '</div></div></div>';
  }

  function summaryCard(list) {
    var rowsHtml = list.map(function (g, i) {
      var d = g.dict || {};
      var reasons = Object.keys(g.reasons).map(function (r) { return '<span class="badge bg-red-lt">' + esc(r) + '</span>'; }).join(' ');
      return '<tr class="pch-doc-row' + (g.key === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(g.key) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(d.drugName || '（未知药品）') + '</b></td>' +
        '<td>' + esc(d.formSpec || '-') + '</td><td>' + esc(d.packSpec || '-') + '</td>' +
        '<td>' + esc(g.batch) + '</td><td><b>' + g.qty + '</b></td><td>' + esc(d.unit || '') + '</td>' +
        '<td>' + reasons + '</td><td>' + Object.keys(g.docs).length + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="9" class="text-center text-secondary" style="padding:32px;">无匹配损耗记录</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>损耗汇总（药品 × 批次）</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">数量 = 码 count 派生 · 点行下钻单据与码明细</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品通用名</th><th>制剂规格</th><th>包装规格</th><th>批次号</th><th>损耗数量</th><th>单位</th><th>损耗原因</th><th>涉及单据</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // 下钻：该批次的单据列表 + 每单码明细 + 深链
  function drillCard(list) {
    var g = null;
    list.forEach(function (x) { if (x.key === sel) g = x; });
    if (!g) {
      return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点击汇总行，下钻查看单据与码明细</div></div>';
    }
    var docs = Object.keys(g.docs).map(function (k) { return g.docs[k]; });
    var blocks = docs.map(function (doc) {
      var codes = doc.codes.filter(function (c) { return c.code.slice(0, 7) + '|' + c.batch === sel; });
      var codeRows = codes.map(function (c) {
        return '<span style="font-family:Consolas,monospace;font-size:12.5px;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:4px;padding:2px 8px;margin:2px 4px 2px 0;display:inline-block;">' + esc(c.code) + '</span>';
      }).join('');
      return '<div style="border:1px solid #EEF2F7;border-radius:8px;padding:10px 14px;margin-bottom:10px;">' +
        '<div class="d-flex align-items-center" style="gap:10px;">' +
        '<b>' + esc(doc.billNo) + '</b>' +
        '<span class="badge bg-red-lt">' + esc(doc.reason) + '</span>' +
        '<span class="badge bg-blue-lt">' + esc(doc.source) + '</span>' +
        '<span class="text-secondary" style="font-size:12.5px;">' + esc(doc.date) + ' · ' + esc(doc.auditor || '-') + '</span>' +
        '<a class="btn btn-sm btn-outline-primary ms-auto" href="wh-loss-out.html?billNo=' + encodeURIComponent(doc.billNo) + '">查看单据 →</a>' +
        '</div>' +
        (doc.remark ? '<div class="text-secondary" style="font-size:12.5px;margin-top:6px;">说明：' + esc(doc.remark) + '</div>' : '') +
        '<div style="margin-top:8px;">' + codeRows + '</div></div>';
    }).join('');
    return '<div class="card"><div class="card-header"><b>单据下钻</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(g.dict ? g.dict.drugName : '') + ' · 批次 ' + esc(g.batch) + ' · ' + docs.length + ' 张损耗单</span></div>' +
      '<div class="card-body" style="padding:12px 16px;">' + blocks + '</div></div>';
  }

  function renderAll() {
    var list = grouped();
    content.innerHTML = filterBar() + summaryCard(list) + drillCard(list);
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { drugName: v('fDrugName'), reason: v('fReason'), source: v('fSource'),
        dateFrom: v('fDateFrom'), dateTo: v('fDateTo') };
      sel = null; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { drugName: '', reason: '全部', source: '全部', dateFrom: '', dateTo: '' };
      sel = null; renderAll();
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  renderAll();
})();
