/**
 * inv-q.js — 盈亏明细查询：已审核药品盘点单汇总
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'invQ', crumb: ['盘点管理', '盈亏明细查询'] });
  if (!content) return;
  var I = window.PUL_INV, UI = window.PchUI, esc = UI.esc;
  var S = I.load();
  var kw = '', sel = null;
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function list() {
    return S.countDocs.filter(function (d) {
      if (d.status !== '已审核') return false;
      if (kw && (d.billNo + d.node + d.type).indexOf(kw) === -1) return false;
      return true;
    });
  }
  function renderAll() {
    var rows = list().map(function (d) {
      var df = I.diff(d);
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td><b>' + esc(d.billNo) + '</b></td><td>' + esc(d.type) + '</td><td>' + esc(d.node) + '</td>' +
        '<td class="text-secondary">' + esc(d.auditTime || '') + '</td>' +
        '<td>' + df.match + '</td><td class="text-success">' + df.gain.length + '</td>' +
        '<td class="text-danger">' + df.loss.length + '</td>' +
        '<td>' + (d.gainPosted ? '盈已入' : (df.gain.length ? '盈未入' : '—')) + ' / ' +
          (d.lossPosted ? '亏已出' : (df.loss.length ? '亏未出' : '—')) + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">无已审核药品盘点单</td></tr>';
    content.innerHTML = '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex" style="gap:10px;"><input class="form-control" id="fKw" style="width:200px;" placeholder="单号 / 节点 / 类型" value="' + esc(kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button></div></div></div>' +
      '<div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>单号</th><th>类型</th><th>节点</th><th>审核时间</th><th>相符</th><th>盘盈</th><th>盘亏</th><th>过账</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
    document.getElementById('btnQuery').addEventListener('click', function () { kw = v('fKw'); renderAll(); });
    document.getElementById('btnReset').addEventListener('click', function () { kw = ''; renderAll(); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
  }
  renderAll();
})();
