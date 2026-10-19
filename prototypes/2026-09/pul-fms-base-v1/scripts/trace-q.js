/**
 * trace-q.js — 追溯码查询：一码看解析 / 当前位置 / 单据流水
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'traceQ', crumb: ['台账管理', '追溯码查询'] });
  if (!content) return;

  var L = window.PUL_LEDGER, UI = window.PchUI, esc = UI.esc;
  var code = new URLSearchParams(location.search).get('code') || '';
  var result = null;

  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  function query(c) {
    code = (c || '').replace(/\s/g, '');
    if (!code) { result = null; renderAll(); return; }
    result = L.locate(code);
    renderAll();
  }

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fCode" style="width:280px;font-family:Consolas,monospace;" placeholder="20 位追溯码" value="' + esc(code) + '">' +
      '<button class="btn btn-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnDemo">填入唯可来示例</button>' +
      '</div></div></div>';
  }

  function resultCard() {
    if (!result) return '<div class="card"><div class="card-body text-center text-secondary" style="padding:32px;">输入追溯码后查询。示例：84169170005001018000</div></div>';
    var p = result.parse || {};
    var d = p.dict;
    var head = d
      ? '<b>' + esc(d.drugName) + '</b> · ' + esc(d.formSpec) + ' · 批次见流水 · 标识码 ' + esc(p.idcode)
      : '<span class="badge bg-red-lt">未解析</span> 标识码 ' + esc(p.idcode) + ' 不在字典，可去 <a href="purchase-arrive.html?view=bad">异常码台账</a>';
    var loc = result.loc ? ' · 货位/库位 ' + esc(result.loc) : '';
    var hist = (result.hist || []).slice().reverse();
    var rows = hist.map(function (e) {
      // 手动补绑的码在类型列后加橙色徽标（含核验状态）
      var bindBadge = (e.bindType === 'manual')
        ? ' <span class="badge bg-orange-lt">手动补绑' + (e.verified === '已复核' ? '·已复核' : '·待复核') + '</span>'
        : '';
      return '<tr><td class="text-secondary">' + esc(e.time) + '</td><td>' + esc(e.type) + bindBadge + '</td>' +
        '<td>' + (e.href ? '<a href="' + esc(e.href) + '">' + esc(e.billNo) + '</a>' : esc(e.billNo)) + '</td>' +
        '<td>' + esc(e.node) + '</td><td>' + esc(e.patient || '—') + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="5" class="text-center text-secondary">无单据流水（可能只在期初种子里）</td></tr>';
    return '<div class="card mb-3"><div class="card-header">' + head + '</div>' +
      '<div class="card-body" style="padding:12px 16px;">当前位置：<b>' + esc(result.where) + '</b>' + loc +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:6px;font-family:Consolas,monospace;">' + esc(result.code) + '</div></div></div>' +
      '<div class="card"><div class="card-header"><b>单据流水</b></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>时间</th><th>类型</th><th>单据</th><th>节点</th><th>患者</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function renderAll() { content.innerHTML = filterBar() + resultCard(); bind(); }
  function bind() {
    var input = document.getElementById('fCode');
    document.getElementById('btnQuery').addEventListener('click', function () { query(v('fCode')); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') query(input.value); });
    document.getElementById('btnDemo').addEventListener('click', function () { query('84169170005001018000'); });
  }

  if (code) query(code);
  else renderAll();
})();
