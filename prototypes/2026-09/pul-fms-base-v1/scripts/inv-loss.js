/**
 * inv-loss.js — 盘亏出库单：已审核药品盘点单的盘亏码过账（销毁）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'invLoss', crumb: ['盘点管理', '盘亏出库单'] });
  if (!content) return;
  var I = window.PUL_INV, P = window.PUL_PCH, D = window.PUL_DRUG, UI = window.PchUI, esc = UI.esc;
  var S = I.load(), DICT = D.flat(D.load());
  var sel = null;
  function save() { I.save(S); }
  function node() { return I.curNode(); }
  function drugName(code) {
    var p = P.parseCode(code, DICT);
    return p.dict ? p.dict.drugName : '未解析';
  }
  function list() {
    var n = node();
    return S.countDocs.filter(function (d) {
      return d.status === '已审核' && d.node === n.name && I.diff(d).loss.length;
    });
  }
  function selDoc() {
    for (var i = 0; i < S.countDocs.length; i++) if (S.countDocs[i].billNo === sel) return S.countDocs[i];
    return null;
  }
  function renderAll() {
    var rows = list().map(function (d) {
      var g = I.diff(d).loss;
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td><b>' + esc(d.billNo) + '</b></td><td>盘亏出库</td><td>' + esc(d.type) + '</td><td>' + esc(d.node) + '</td>' +
        '<td class="text-danger"><b>' + g.length + '</b></td>' +
        '<td>' + (d.lossPosted ? '<span class="pch-light mute"><i class="pch-dot"></i>已出库</span>'
          : '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待出库</span>') + '</td>' +
        '<td onclick="event.stopPropagation()">' +
          (d.lossPosted ? '—' : '<button class="btn btn-sm btn-danger" data-post="' + esc(d.billNo) + '">确认出库</button>') +
        '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="7" class="text-center text-secondary" style="padding:28px;">无盘亏——盘点时少扫的码才会出现</td></tr>';
    var d = selDoc(), extra = '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点选行看盘亏码</div></div>';
    if (d) {
      var g = I.diff(d).loss;
      extra = '<div class="card"><div class="card-header"><b>盘亏码（过账后从在架扣除）</b></div><div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>#</th><th>追溯码</th><th>药品</th></tr></thead><tbody>' +
        (g.length ? g.map(function (c, i) {
          return '<tr><td>' + (i + 1) + '</td><td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td><td>' + esc(drugName(c.code)) + '</td></tr>';
        }).join('') : '<tr><td colspan="3" class="text-center text-secondary">无</td></tr>') +
        '</tbody></table></div></div>';
    }
    content.innerHTML = '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>药品盘点单</th><th>单据类型</th><th>类型</th><th>节点</th><th>盘亏数</th><th>状态</th><th></th></tr></thead><tbody>' + rows +
      '</tbody></table></div></div>' + extra;
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-post]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d0 = null; S.countDocs.forEach(function (x) { if (x.billNo === b.getAttribute('data-post')) d0 = x; });
        if (!d0) return;
        UI.confirm('<span class="text-danger">确认盘亏出库单</span> <b>' + esc(d0.billNo) + '</b>？' + I.diff(d0).loss.length + ' 个码将从在架扣除。', function () {
          I.postLoss(d0); save(); renderAll(); window.showToast('已盘亏出库单');
        }, '确认出库');
      });
    });
  }
  if (list().length) sel = list()[0].billNo;
  renderAll();
})();
