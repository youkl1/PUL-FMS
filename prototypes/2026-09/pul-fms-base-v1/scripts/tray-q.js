/**
 * tray-q.js — HIS 摆药单查询（只读）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'trayQ', crumb: ['发药管理', 'HIS摆药单查询'] });
  if (!content) return;

  var W = window.PUL_WH, R = window.PUL_RX, UI = window.PchUI, esc = UI.esc;
  var S = R.load();
  var kw = '', sel = null;

  function ph() { return W.curPharm(); }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function drugName(dc) { var d = R.drugOf(dc); return d ? d.drugName : dc; }
  function trayOf(trayNo) {
    for (var i = 0; i < S.trayDocs.length; i++) if (S.trayDocs[i].trayNo === trayNo) return S.trayDocs[i];
    return null;
  }
  function rows() {
    var p = ph();
    return S.hisTrayPool.filter(function (h) {
      if (h.pharmacy !== p) return false;
      if (kw && (h.trayNo + h.patient + h.inpatientNo + h.ward).indexOf(kw) === -1) return false;
      return true;
    });
  }
  function bizSt(h) {
    if (!h.pulled) return '<span class="pch-light mute"><i class="pch-dot"></i>未拉</span>';
    var d = trayOf(h.trayNo);
    if (!d) return '<span class="pch-light mute"><i class="pch-dot"></i>已拉</span>';
    if (d.signedAt) return '<span class="pch-light ok"><i class="pch-dot"></i>病区已签收</span>';
    if (d.status === '已完成') return '<span class="pch-light ok"><i class="pch-dot"></i>待签收</span>';
    if (d.status === '摆药中') return '<span class="pch-light" style="color:#206bc4;"><i class="pch-dot" style="background:#206bc4;"></i>摆药中</span>';
    return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待摆药</span>';
  }

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:220px;" placeholder="单号 / 住院号 / 病区 / 姓名" value="' + esc(kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(ph()) + ' · 只读</span>' +
      '</div></div></div>';
  }

  function docsCard() {
    var list = rows();
    var html = list.map(function (h) {
      var items = h.items.map(function (it) { return drugName(it.drugCode) + '×' + it.qty; }).join('、');
      var d = trayOf(h.trayNo);
      var go = h.pulled
        ? '<a class="btn btn-sm btn-outline-primary" href="tray.html?trayNo=' + encodeURIComponent(h.trayNo) + '">去摆药单</a>'
        : '<span class="text-secondary" style="font-size:12.5px;">在业务页拉取</span>';
      return '<tr class="pch-doc-row' + (h.trayNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(h.trayNo) + '">' +
        '<td><b>' + esc(h.trayNo) + '</b></td><td class="text-secondary">' + esc(h.date) + '</td>' +
        '<td>' + esc(h.inpatientNo) + '</td><td>' + esc(h.ward) + ' / ' + esc(h.bed) + '</td>' +
        '<td>' + esc(h.patient) + '</td><td>' + esc(items) + '</td>' +
        '<td>' + bizSt(h) + '</td>' +
        '<td onclick="event.stopPropagation()">' + go + '</td></tr>';
    }).join('');
    if (!html) html = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">无 HIS 摆药单</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>摆药单号</th><th>开单时间</th><th>住院号</th><th>病区/床</th><th>患者</th><th>药品</th><th>状态</th><th></th></tr></thead>' +
      '<tbody>' + html + '</tbody></table></div></div>';
  }

  function detailCard() {
    var h = null;
    S.hisTrayPool.forEach(function (x) { if (x.trayNo === sel) h = x; });
    if (!h) return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点选一行看药品明细</div></div>';
    var d = trayOf(h.trayNo);
    var rows = h.items.map(function (it, i) {
      var scanned = 0;
      if (d) d.items.forEach(function (x) { if (x.drugCode === it.drugCode) scanned = (x.codes || []).length; });
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(drugName(it.drugCode)) + '</b></td>' +
        '<td>' + it.qty + esc(it.unit) + '</td><td>' + scanned + ' / ' + it.qty + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="card-header"><b>药品明细</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(h.trayNo) + ' · ' + esc(h.patient) + '</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>#</th><th>药品</th><th>应摆</th><th>已扫/应扫</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + detailCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () { kw = v('fKw'); renderAll(); });
    document.getElementById('btnReset').addEventListener('click', function () { kw = ''; renderAll(); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
  }

  var first = rows()[0];
  if (first) sel = first.trayNo;
  renderAll();
})();
