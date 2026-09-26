/**
 * purchase-detail.js — 采购明细查询：药品维度汇总（上表）→ 来源单据下钻（下表）
 * 字段对齐老系统：药名通用名/药品规格/总数/生产厂家/批准文号/住院拆零/门诊拆零/药品编码
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pquery', crumb: ['库房管理', '采购管理', '采购明细查询'] });
  if (!content) return;

  var P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = P.load();
  var sel = null; // 选中的药品 key：idcode|batch
  var filters = { code: '', drugName: '', ipUnpack: '全部', opUnpack: '全部', billNo: '', supplier: '', dateFrom: '', dateTo: '' };

  // 全部入库单 × 码 × 解析 → 行级明细
  function allRows() {
    var rows = [];
    S.inDocs.forEach(function (d) {
      if (filters.billNo && d.billNo.indexOf(filters.billNo) === -1) return;
      if (filters.supplier && d.supplier.indexOf(filters.supplier) === -1) return;
      if (filters.dateFrom && d.date.slice(0, 10) < filters.dateFrom) return;
      if (filters.dateTo && d.date.slice(0, 10) > filters.dateTo) return;
      (d.codes || []).forEach(function (c) {
        if (filters.code && c.code.indexOf(filters.code) === -1) return;
        var p = P.parseCode(c.code, S.dict);
        if (!p.dict) return;
        if (filters.drugName && p.dict.drugName.indexOf(filters.drugName) === -1) return;
        if (filters.ipUnpack !== '全部' && p.dict.ipUnpack !== filters.ipUnpack) return;
        if (filters.opUnpack !== '全部' && p.dict.opUnpack !== filters.opUnpack) return;
        rows.push({ doc: d, code: c, dict: p.dict, idcode: p.idcode });
      });
    });
    return rows;
  }

  // 药品维度聚合
  function drugGroups(rows) {
    var map = {};
    rows.forEach(function (r) {
      var key = r.idcode + '|' + r.code.batch;
      if (!map[key]) map[key] = { key: key, dict: r.dict, batch: r.code.batch, qty: 0, docs: {} };
      map[key].qty += 1;
      map[key].docs[r.doc.billNo] = map[key].docs[r.doc.billNo] || { doc: r.doc, qty: 0 };
      map[key].docs[r.doc.billNo].qty += 1;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function filterBar() {
    var sel_ = function (cur, o) { return '<option' + (cur === o ? ' selected' : '') + '>' + o + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fCode" style="width:180px;" placeholder="追溯码" value="' + esc(filters.code) + '">' +
      '<input class="form-control" id="fDrugName" style="width:150px;" placeholder="药品通用名" value="' + esc(filters.drugName) + '">' +
      '<span class="text-secondary" style="font-size:12.5px;">住院拆零</span>' +
      '<select class="form-select" id="fIp" style="width:80px;">' + ['全部', '是', '否'].map(function (o) { return sel_(filters.ipUnpack, o); }).join('') + '</select>' +
      '<span class="text-secondary" style="font-size:12.5px;">门诊拆零</span>' +
      '<select class="form-select" id="fOp" style="width:80px;">' + ['全部', '是', '否'].map(function (o) { return sel_(filters.opUnpack, o); }).join('') + '</select>' +
      '<input class="form-control" id="fBillNo" style="width:150px;" placeholder="单据编号" value="' + esc(filters.billNo) + '">' +
      '<input class="form-control" id="fSupplier" style="width:160px;" placeholder="供应商" value="' + esc(filters.supplier) + '">' +
      '<input class="form-control" id="fDateFrom" type="date" style="width:145px;" value="' + filters.dateFrom + '">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fDateTo" type="date" style="width:145px;" value="' + filters.dateTo + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-outline-primary" id="btnExport">⬇ 导出</button></div>' +
      '</div></div></div>';
  }

  function drugTable(groups) {
    var rows = groups.map(function (g, i) {
      var d = g.dict;
      return '<tr class="pch-doc-row' + (g.key === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(g.key) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(d.drugName) + '</b></td>' +
        '<td>' + esc(d.formSpec) + ' / ' + esc(d.packSpec) + '</td>' +
        '<td><b>' + g.qty + '</b></td><td class="text-secondary">' + esc(d.maker) + '</td>' +
        '<td class="text-secondary">' + esc(d.approval) + '</td>' +
        '<td>' + esc(d.ipUnpack) + '</td><td>' + esc(d.opUnpack) + '</td>' +
        '<td class="text-secondary">' + esc(d.drugCode) + '</td></tr>';
    }).join('');
    if (!groups.length) rows = '<tr><td colspan="9" class="text-center text-secondary" style="padding:32px;">无数据——请调整筛选条件</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药名通用名</th><th>药品规格</th><th>总数</th><th>生产厂家</th><th>批准文号</th><th>住院拆零</th><th>门诊拆零</th><th>药品编码</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer" style="font-size:12.5px;"><span class="text-secondary">共 ' + groups.length + ' 个药品批次 · 点行下钻来源单据</span></div></div>';
  }

  function billTable(groups) {
    var g = null;
    groups.forEach(function (x) { if (x.key === sel) g = x; });
    var body;
    if (!g) {
      body = '<div class="text-center text-secondary" style="padding:32px;">点击上方药品行，查看来源单据</div>';
    } else {
      var rows = Object.keys(g.docs).map(function (billNo, i) {
        var r = g.docs[billNo];
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(billNo) + '</b></td>' +
          '<td class="text-secondary">' + esc(r.doc.date) + '</td><td>' + esc(r.doc.supplier) + '</td>' +
          '<td class="text-secondary">' + esc(r.doc.invoice || '—') + '</td><td><b>' + r.qty + '</b></td>' +
          '<td>' + UI.light(r.doc.audit) + '</td>' +
          '<td><button class="btn btn-sm btn-outline-primary" data-godoc="' + esc(billNo) + '">查看单据</button></td></tr>';
      }).join('');
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>单据编号</th><th>单据日期</th><th>供应商</th><th>发票号</th><th>数量</th><th>审核</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>来源单据</b>' +
      (g ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(g.dict.drugName) + ' · 批次 ' + esc(g.batch) + '</span>' : '') +
      '</div>' + body + '</div>';
  }

  function renderAll() {
    var groups = drugGroups(allRows());
    if (sel && !groups.some(function (g) { return g.key === sel; })) sel = null;
    content.innerHTML = filterBar() + drugTable(groups) + billTable(groups);
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { code: v('fCode'), drugName: v('fDrugName'), ipUnpack: v('fIp'), opUnpack: v('fOp'),
        billNo: v('fBillNo'), supplier: v('fSupplier'), dateFrom: v('fDateFrom'), dateTo: v('fDateTo') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { code: '', drugName: '', ipUnpack: '全部', opUnpack: '全部', billNo: '', supplier: '', dateFrom: '', dateTo: '' };
      renderAll();
    });
    document.getElementById('btnExport').addEventListener('click', function () {
      window.showToast('已导出当前查询结果（原型演示）');
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-godoc]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        window.store.go('purchase-in.html?billNo=' + encodeURIComponent(b.getAttribute('data-godoc')));
      });
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  renderAll();
})();
