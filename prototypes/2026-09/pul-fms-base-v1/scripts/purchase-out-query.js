/**
 * purchase-out-query.js — 退货明细查询：药品汇总（码 count 派生）→ 单据下钻 → 深链采购退货单
 * 数据源 pch.outDocs（2026-10-13 Round BU 到货退货删除，单一库房退货）；与入库明细查询同模式（汇总→下钻→深链）
 * 2026-10-12 Round BL：汇总列对齐统一标准（制剂规格/包装规格分列 + 生产企业）；下钻 noStock → badCodes 统一异常码
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pOutQ', crumb: ['采购管理', '退货明细查询', '退货明细查询'] });
  if (!content) return;

  var D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = P.load();
  var DICT = D.flat(D.load());
  var sel = null;   // 'idcode|batch'
  var filters = { billNo: '', supplier: '', status: '全部', drugName: '', dateFrom: '', dateTo: '' };

  // 全部退货码行（含单据归属）
  function rows() {
    var out = [];
    S.outDocs.forEach(function (d) {
      if (filters.billNo && d.billNo.indexOf(filters.billNo) === -1) return;
      if (filters.supplier && (d.supplier || '').indexOf(filters.supplier) === -1) return;
      if (filters.status !== '全部' && d.status !== filters.status) return;
      if (filters.dateFrom && d.date.slice(0, 10) < filters.dateFrom) return;
      if (filters.dateTo && d.date.slice(0, 10) > filters.dateTo) return;
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
      if (!map[key]) map[key] = { key: key, dict: r.dict, batch: r.code.batch, qty: 0, docs: {}, suppliers: {} };
      map[key].qty += 1;
      map[key].docs[r.doc.billNo] = r.doc;
      if (r.doc.supplier) map[key].suppliers[r.doc.supplier] = 1;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fBillNo" style="width:150px;" placeholder="单据编号" value="' + esc(filters.billNo) + '">' +
      '<input class="form-control" id="fSupplier" style="width:160px;" placeholder="供应商" value="' + esc(filters.supplier) + '">' +
      '<select class="form-select" id="fStatus" style="width:110px;">' +
        ['全部', '未审核', '已审核'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fDrugName" style="width:150px;" placeholder="药品通用名" value="' + esc(filters.drugName) + '">' +
      '<input class="form-control" id="fDateFrom" type="date" style="width:145px;" value="' + filters.dateFrom + '">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fDateTo" type="date" style="width:145px;" value="' + filters.dateTo + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-outline-primary" id="btnExport">⬇ 导出</button></div>' +
      '</div></div></div>';
  }

  function summaryCard(list) {
    var rowsHtml = list.map(function (g, i) {
      var d = g.dict || {};
      return '<tr class="pch-doc-row' + (g.key === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(g.key) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(d.drugName || '（未知药品）') + '</b></td>' +
        '<td>' + esc(d.formSpec || '-') + '</td><td>' + esc(d.packSpec || '-') + '</td>' +
        '<td>' + esc(g.batch) + '</td><td><b>' + g.qty + '</b></td><td>' + esc(d.unit || '') + '</td>' +
        '<td class="text-secondary">' + esc(d.maker || '—') + '</td>' +
        '<td class="text-secondary">' + esc(Object.keys(g.suppliers).join('、') || '—') + '</td>' +
        '<td>' + Object.keys(g.docs).length + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="10" class="text-center text-secondary" style="padding:32px;">无匹配退货记录——先在「采购退货单」做一张单</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>退货汇总（药品 × 批次）</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">数量 = 码 count 派生 · 点行下钻单据与码明细</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药名通用名</th><th>制剂规格</th><th>包装规格</th><th>批次号</th><th>退货数量</th><th>单位</th><th>生产企业</th><th>供应商</th><th>涉及单据</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // 下钻：该批次的单据列表 + 每单码明细 + 深链采购退货单
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
      var bads = (doc.badCodes && doc.badCodes.length)
        ? '<div style="margin-top:6px;"><span class="badge bg-red-lt">异常码 ' + doc.badCodes.length + '</span>' +
          '<span class="text-secondary" style="font-size:12.5px;"> ' + doc.badCodes.map(function (b) { return esc(b.code) + '（' + esc(b.reason) + '）'; }).join('、') + '</span></div>' : '';
      return '<div style="border:1px solid #EEF2F7;border-radius:8px;padding:10px 14px;margin-bottom:10px;">' +
        '<div class="d-flex align-items-center flex-wrap" style="gap:10px;">' +
        '<b>' + esc(doc.billNo) + '</b>' +
        '<span class="badge bg-blue-lt">库房退货</span>' +
        UI.light(doc.status) +
        '<span class="text-secondary" style="font-size:12.5px;">' + esc(doc.date) + ' · ' + esc(doc.supplier || '—') + '</span>' +
        '<a class="btn btn-sm btn-outline-primary ms-auto" href="purchase-out.html?billNo=' + encodeURIComponent(doc.billNo) + '">查看单据 →</a>' +
        '</div>' + bads +
        '<div style="margin-top:8px;">' + codeRows + '</div></div>';
    }).join('');
    return '<div class="card"><div class="card-header"><b>单据下钻</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(g.dict ? g.dict.drugName : '') + ' · 批次 ' + esc(g.batch) + ' · ' + docs.length + ' 张退货单</span></div>' +
      '<div class="card-body" style="padding:12px 16px;">' + blocks + '</div></div>';
  }

  function renderAll() {
    var list = grouped();
    if (sel && !list.some(function (g) { return g.key === sel; })) sel = null;
    content.innerHTML = filterBar() + summaryCard(list) + drillCard(list);
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { billNo: v('fBillNo'), supplier: v('fSupplier'), status: v('fStatus'),
        drugName: v('fDrugName'), dateFrom: v('fDateFrom'), dateTo: v('fDateTo') };
      sel = null; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { billNo: '', supplier: '', status: '全部', drugName: '', dateFrom: '', dateTo: '' };
      sel = null; renderAll();
    });
    document.getElementById('btnExport').addEventListener('click', function () {
      window.showToast('已导出当前查询结果（原型演示）');
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  renderAll();
})();
