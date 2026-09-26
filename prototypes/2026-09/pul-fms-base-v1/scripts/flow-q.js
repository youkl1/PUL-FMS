/**
 * flow-q.js — 药品流向查询：按药/时间列出单据流水
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'flowQ', crumb: ['台账管理', '药品流向查询'] });
  if (!content) return;

  var L = window.PUL_LEDGER, UI = window.PchUI, esc = UI.esc;
  var kw = '', sel = null;

  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function list() {
    return L.collect().filter(function (e) {
      if (!kw) return true;
      var names = (e.codes || []).map(function (c) { return L.drugName(c.code); }).join(' ');
      return names.indexOf(kw) !== -1 || (e.billNo || '').indexOf(kw) !== -1 || (e.type || '').indexOf(kw) !== -1;
    }).slice().reverse();
  }

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:200px;" placeholder="药品 / 单据号 / 类型" value="' + esc(kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">只读 · 点行看码</span>' +
      '</div></div></div>';
  }

  function docsCard() {
    var rows = list().map(function (e, i) {
      var key = e.type + '|' + e.billNo + '|' + i;
      return '<tr class="pch-doc-row' + (key === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(key) + '">' +
        '<td class="text-secondary">' + esc(e.time) + '</td><td>' + esc(e.type) + '</td>' +
        '<td>' + (e.href ? '<a href="' + esc(e.href) + '" onclick="event.stopPropagation()">' + esc(e.billNo) + '</a>' : esc(e.billNo)) + '</td>' +
        '<td>' + esc(e.node) + '</td><td>' + (e.codes || []).length + '</td>' +
        '<td>' + esc(e.patient || '—') + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="6" class="text-center text-secondary" style="padding:28px;">无匹配流水</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive" style="max-height:420px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>时间</th><th>类型</th><th>单据</th><th>节点</th><th>码数</th><th>患者</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function codesCard() {
    var ev = null;
    list().forEach(function (e, i) {
      if (e.type + '|' + e.billNo + '|' + i === sel) ev = e;
    });
    if (!ev) return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点选流水行看码清单</div></div>';
    var rows = (ev.codes || []).map(function (c, i) {
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;"><a href="trace-q.html?code=' + encodeURIComponent(c.code) + '">' + esc(c.code) + '</a></td>' +
        '<td>' + esc(L.drugName(c.code)) + '</td><td>' + esc(c.batch || '—') + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="4" class="text-center text-secondary">无码</td></tr>';
    return '<div class="card"><div class="card-header"><b>码清单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(ev.type) + ' · ' + esc(ev.billNo) + '</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>#</th><th>追溯码（点去查询）</th><th>药品</th><th>批次</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + codesCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () { kw = v('fKw'); sel = null; renderAll(); });
    document.getElementById('btnReset').addEventListener('click', function () { kw = ''; sel = null; renderAll(); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
  }

  renderAll();
})();
