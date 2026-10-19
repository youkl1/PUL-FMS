/**
 * tray-ret-q.js — 摆药单退药查询：trayRetDocs 只读对账（住院退药台账）
 * 数据源 rx.trayRetDocs（摆药单退药单 BYTH，带原因+整单退/部分退）；点行看退回码明细，不写数据
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'trayRetQ', crumb: ['出库管理', '摆药单退药查询'] });
  if (!content) return;

  var W = window.PUL_WH, R = window.PUL_RX, UI = window.PchUI, esc = UI.esc;
  var S = R.load();
  var sel = null;   // retNo
  var filters = { kw: '', type: '全部', dateFrom: '', dateTo: '' };

  function ph() { return W.curPharm(); }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function drugName(dc) { var d = R.drugOf(dc); return d ? d.drugName : dc; }
  function docs() {
    return (S.trayRetDocs || []).filter(function (d) {
      if (d.pharmacy !== ph()) return false;
      if (filters.kw && (d.retNo + d.trayNo + d.patient + (d.inpatientNo || '') + (d.ward || '')).indexOf(filters.kw) === -1) return false;
      if (filters.type !== '全部' && (d.type || '整单退') !== filters.type) return false;
      if (filters.dateFrom && d.date.slice(0, 10) < filters.dateFrom) return false;
      if (filters.dateTo && d.date.slice(0, 10) > filters.dateTo) return false;
      return true;
    });
  }
  function selDoc() {
    for (var i = 0; i < (S.trayRetDocs || []).length; i++) if (S.trayRetDocs[i].retNo === sel) return S.trayRetDocs[i];
    return null;
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:200px;" placeholder="退药单号 / 摆药单号 / 住院号 / 姓名" value="' + esc(filters.kw) + '">' +
      '<select class="form-select" id="fType" style="width:110px;">' +
        ['全部', '整单退', '部分退'].map(function (o) { return opt(filters.type, o, o === '全部' ? '退药类型' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fDateFrom" type="date" style="width:145px;" value="' + filters.dateFrom + '">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fDateTo" type="date" style="width:145px;" value="' + filters.dateTo + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(ph()) + ' · 只读</span>' +
      '<div class="ms-auto"><button class="btn btn-outline-primary" id="btnExport">⬇ 导出</button></div>' +
      '</div></div></div>';
  }

  function docsCard() {
    var list = docs();
    var rows = list.map(function (d) {
      var tp = (d.type || '整单退') === '部分退'
        ? '<span class="badge bg-orange-lt">部分退</span>'
        : '<span class="badge bg-blue-lt">整单退</span>';
      return '<tr class="pch-doc-row' + (d.retNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.retNo) + '">' +
        '<td><b>' + esc(d.retNo) + '</b></td><td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td>' + esc(d.trayNo) + '</td><td>' + esc(d.ward || '—') + ' / ' + esc(d.bed || '—') + '</td>' +
        '<td>' + esc(d.patient) + '</td><td>' + tp + '</td><td>' + esc(d.reason || '—') + '</td>' +
        '<td>' + esc(d.operator || '—') + '</td><td>' + (d.codes || []).length + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="9" class="text-center text-secondary" style="padding:28px;">暂无摆药单退药记录——先在「摆药单退药」做一笔</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>退药单号</th><th>退药时间</th><th>摆药单号</th><th>病区/床</th><th>患者</th><th>类型</th><th>原因</th><th>操作人</th><th>退回码数</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  function codesCard() {
    var d = selDoc();
    if (!d) return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点选退药单行查看退回的码</div></div>';
    var codes = d.codes || [];
    var rows = codes.length ? codes.map(function (c, i) {
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td>' + esc(drugName(c._drug)) + '</td><td>' + esc(c.batch) + '</td>' +
        '<td>' + esc(c.expDate) + '</td><td>' + esc(c.phLoc || '—') + '</td>' +
        '<td>' + (c.split === '是' ? '<span class="badge bg-orange-lt">拆零 ' + esc(c.splitQty || '') + '</span>' : '整盒') + '</td></tr>';
    }).join('') : '<tr><td colspan="7" class="text-center text-secondary">无码记录</td></tr>';
    return '<div class="card"><div class="card-header"><b>退回码明细</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.retNo) + ' · 摆药单 ' + esc(d.trayNo) + ' · ' + esc(d.patient) + '</span>' +
      '<div class="ms-auto"><a class="btn btn-sm btn-outline-primary" href="tray-q.html?trayNo=' + encodeURIComponent(d.trayNo) + '">查看摆药单 →</a></div></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>#</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>货位</th><th>拆零</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + codesCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { kw: v('fKw'), type: v('fType'), dateFrom: v('fDateFrom'), dateTo: v('fDateTo') }; sel = null; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { kw: '', type: '全部', dateFrom: '', dateTo: '' }; sel = null; renderAll();
    });
    document.getElementById('btnExport').addEventListener('click', function () {
      window.showToast('已导出当前查询结果（原型演示）');
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
  }

  var first = docs()[0];
  if (first) sel = first.retNo;
  renderAll();
})();
