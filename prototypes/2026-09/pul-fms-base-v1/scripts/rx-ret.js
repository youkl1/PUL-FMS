/**
 * rx-ret.js — 处方单退药：已完成处方还码；码回本药房在架
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'rxret', crumb: ['出库管理', '处方单退药'] });
  if (!content) return;

  var W = window.PUL_WH, R = window.PUL_RX, UI = window.PchUI, esc = UI.esc;
  var S = R.load();
  var sel = null, kw = '';

  function save() { R.save(S); }
  function ph() { return W.curPharm(); }
  function curUser() { return window.store.load().currentUser || {}; }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function drugName(dc) { var d = R.drugOf(dc); return d ? d.drugName : dc; }
  function doneList() {
    return S.rxDocs.filter(function (d) {
      if (d.pharmacy !== ph()) return false;
      if (d.status !== '已完成' && d.status !== '已退药') return false;
      if (kw && (d.rxNo + d.patient).indexOf(kw) === -1) return false;
      return true;
    });
  }
  function selDoc() {
    for (var i = 0; i < S.rxDocs.length; i++) if (S.rxDocs[i].rxNo === sel) return S.rxDocs[i];
    return null;
  }
  function allCodes(d) {
    var out = [];
    (d.items || []).forEach(function (it) {
      (it.codes || []).forEach(function (c) { out.push(Object.assign({ _drug: it.drugCode }, c)); });
    });
    return out;
  }

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:180px;" placeholder="处方号 / 姓名" value="' + esc(kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(ph()) + ' · 只列出已发 / 已退</span>' +
      '</div></div></div>';
  }

  function docsCard() {
    var list = doneList();
    var rows = list.map(function (d) {
      var n = allCodes(d).length;
      var st = d.status === '已退药'
        ? '<span class="pch-light mute"><i class="pch-dot"></i>已退药</span>'
        : '<span class="pch-light ok"><i class="pch-dot"></i>已完成</span>';
      return '<tr class="pch-doc-row' + (d.rxNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.rxNo) + '">' +
        '<td><b>' + esc(d.rxNo) + '</b></td><td>处方退药</td><td class="text-secondary">' + esc(d.doneTime || d.date) + '</td>' +
        '<td>' + esc(d.patient) + '</td><td>' + esc(d.dept) + '</td>' +
        '<td>' + n + '</td><td>' + st + '</td>' +
        '<td onclick="event.stopPropagation()">' +
          (d.status === '已完成'
            ? '<button class="btn btn-sm btn-outline-primary" data-ret="' + esc(d.rxNo) + '">退药</button>'
            : '<span class="text-secondary">—</span>') +
        '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">暂无已发处方——先在「处方发药扫码」走完一张</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>处方号</th><th>单据类型</th><th>发药时间</th><th>患者</th><th>科室</th><th>码数</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  // 2026-10-18 Task5：码表迁移 PulDocDetail.renderCodes 独立表格（列名按组件标准收敛：#→序号、货位→库位；卡片壳保留）
  function codesCard() {
    var d = selDoc();
    if (!d) return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点选处方行查看当时绑定的码</div></div>';
    var codes = allCodes(d);
    var rows = codes.map(function (c) {
      return { code: c.code, drugName: drugName(c._drug), batch: c.batch, expDate: c.expDate, location: c.phLoc || '—' };
    });
    var table = window.PulDocDetail.renderCodes({ codes: rows }, { emptyText: '无码（已退空）' });
    return '<div class="card"><div class="card-header"><b>已绑码</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.rxNo) + ' · ' + esc(d.patient) + '</span></div>' +
      table + '</div>';
  }

  function doRet(d) {
    var codes = allCodes(d);
    if (!codes.length) { window.showToast('没有可退的码'); return; }
    UI.confirm('确认退药 <b>' + esc(d.rxNo) + '</b> · ' + esc(d.patient) + '？<div style="margin-top:8px;">' +
      codes.length + ' 个码回到本药房在架（货位保留）。</div>', function () {
      d.status = '已退药';
      S.retDocs.unshift({
        retNo: R.nextNo('CFTH', S.retDocs, 'retNo'), rxNo: d.rxNo, date: R.now(),
        pharmacy: ph(), patient: d.patient, operator: curUser().name || '陈静',
        status: '已退药', codes: codes.map(function (c) { return Object.assign({}, c); })
      });
      save(); renderAll();
      window.showToast('已退药，码回在架');
    }, '确认退药');
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + codesCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () { kw = v('fKw'); renderAll(); });
    document.getElementById('btnReset').addEventListener('click', function () { kw = ''; renderAll(); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-ret]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = null; S.rxDocs.forEach(function (x) { if (x.rxNo === b.getAttribute('data-ret')) d = x; });
        if (d) { sel = d.rxNo; doRet(d); }
      });
    });
  }

  var first = doneList()[0];
  if (first) sel = first.rxNo;
  renderAll();
})();
