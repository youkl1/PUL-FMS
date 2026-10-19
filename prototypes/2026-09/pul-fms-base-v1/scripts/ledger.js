/**
 * ledger.js — 日记账查询：库房在架 + 药房在架（码 count），点行看该药流向
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'ledger', crumb: ['台账管理', '日记账查询'] });
  if (!content) return;

  var L = window.PUL_LEDGER, UI = window.PchUI, esc = UI.esc;
  var sel = null, kw = '';

  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function rows() {
    return L.ledgerRows().filter(function (r) {
      return !kw || r.drugName.indexOf(kw) !== -1;
    });
  }
  function eventsOf(drugCode) {
    return L.collect().filter(function (e) {
      return (e.codes || []).some(function (c) { return L.drugCodeOf(c.code) === drugCode; });
    }).slice(-12).reverse();
  }

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:180px;" placeholder="药品通用名" value="' + esc(kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">数量 = 在架码 count · 只读</span>' +
      '</div></div></div>';
  }

  function tableCard() {
    var list = rows();
    var html = list.map(function (r) {
      return '<tr class="pch-doc-row' + (r.drugCode === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(r.drugCode) + '">' +
        '<td><b>' + esc(r.drugName) + '</b></td><td class="text-secondary">' + esc(r.formSpec) + '</td>' +
        '<td>' + r.wh + '</td><td>' + r.ph + '</td><td><b>' + (r.wh + r.ph) + '</b></td>' +
        '<td>' + esc(r.unit) + '</td></tr>';
    }).join('');
    if (!html) html = '<tr><td colspan="6" class="text-center text-secondary" style="padding:28px;">无在架药品</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>药品</th><th>规格</th><th>库房在架</th><th>药房在架</th><th>合计</th><th>单位</th></tr></thead>' +
      '<tbody>' + html + '</tbody></table></div></div>';
  }

  function flowCard() {
    if (!sel) return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点选药品行，查看最近流向</div></div>';
    var evs = eventsOf(sel);
    var html = evs.map(function (e) {
      var n = (e.codes || []).filter(function (c) { return L.drugCodeOf(c.code) === sel; }).length;
      return '<tr><td class="text-secondary">' + esc(e.time) + '</td><td>' + esc(e.type) + '</td>' +
        '<td>' + (e.href ? '<a href="' + esc(e.href) + '">' + esc(e.billNo) + '</a>' : esc(e.billNo)) + '</td>' +
        '<td>' + esc(e.node) + '</td><td>' + n + '</td></tr>';
    }).join('');
    if (!html) html = '<tr><td colspan="5" class="text-center text-secondary">无流水</td></tr>';
    return '<div class="card"><div class="card-header"><b>最近流向</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">最多 12 条</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>时间</th><th>类型</th><th>单据</th><th>节点</th><th>本药码数</th></tr></thead>' +
      '<tbody>' + html + '</tbody></table></div></div>';
  }

  function renderAll() { content.innerHTML = filterBar() + tableCard() + flowCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () { kw = v('fKw'); renderAll(); });
    document.getElementById('btnReset').addEventListener('click', function () { kw = ''; renderAll(); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
  }

  var first = rows()[0];
  if (first) sel = first.drugCode;
  renderAll();
})();
