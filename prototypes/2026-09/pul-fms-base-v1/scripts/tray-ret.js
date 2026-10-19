/**
 * tray-ret.js — 摆药单退药：已完成摆药单还码；码回本药房在架（住院逆向闭环）
 * 场景：病区拒收 / 患者出院 / 医嘱停改。勾选退药（可部分退），退药原因必填。
 * 整单退完单据置「已退药」；部分退从单上摘除退回码，剩余码继续占用
 * （occupiedRxCodes / splitUsedMap 只统计 发药中/摆药中/已完成，口径与处方单退药一致）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'trayRet', crumb: ['出库管理', '摆药单退药'] });
  if (!content) return;

  var W = window.PUL_WH, R = window.PUL_RX, UI = window.PchUI, esc = UI.esc;
  var S = R.load();
  var sel = null, kw = '';
  var picked = {};           // code → true（切单清空；按码字符串 key 存，勿按下标）
  var reason = '';           // 退药原因（必填）
  var RET_REASONS = ['病区拒收', '患者出院', '医嘱停改', '其他'];

  function save() { R.save(S); }
  function ph() { return W.curPharm(); }
  function curUser() { return window.store.load().currentUser || {}; }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function drugName(dc) { var d = R.drugOf(dc); return d ? d.drugName : dc; }
  function doneList() {
    return S.trayDocs.filter(function (d) {
      if (d.pharmacy !== ph()) return false;
      if (d.status !== '已完成' && d.status !== '已退药') return false;
      if (kw && (d.trayNo + d.patient + d.inpatientNo + d.ward).indexOf(kw) === -1) return false;
      return true;
    });
  }
  function selDoc() {
    for (var i = 0; i < S.trayDocs.length; i++) if (S.trayDocs[i].trayNo === sel) return S.trayDocs[i];
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
      '<input class="form-control" id="fKw" style="width:200px;" placeholder="摆药单号 / 住院号 / 病区 / 姓名" value="' + esc(kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(ph()) + ' · 只列出已摆完 / 已退</span>' +
      '</div></div></div>';
  }

  function docsCard() {
    var list = doneList();
    var rows = list.map(function (d) {
      var n = allCodes(d).length;
      var st = d.status === '已退药'
        ? '<span class="pch-light mute"><i class="pch-dot"></i>已退药</span>'
        : '<span class="pch-light ok"><i class="pch-dot"></i>已完成</span>';
      return '<tr class="pch-doc-row' + (d.trayNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.trayNo) + '">' +
        '<td><b>' + esc(d.trayNo) + '</b></td><td>摆药退药</td><td class="text-secondary">' + esc(d.doneTime || d.date) + '</td>' +
        '<td>' + esc(d.inpatientNo) + '</td><td>' + esc(d.ward) + ' / ' + esc(d.bed) + '</td>' +
        '<td>' + esc(d.patient) + '</td><td>' + n + '</td><td>' + st + '</td>' +
        '<td onclick="event.stopPropagation()">' +
          (d.status === '已完成'
            ? '<button class="btn btn-sm btn-outline-danger" data-ret="' + esc(d.trayNo) + '">选码退药</button>'
            : '<span class="text-secondary">—</span>') +
        '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="9" class="text-center text-secondary" style="padding:28px;">暂无已摆完摆药单——先在「摆药单批量赋码」走完一张（HIS 拉取 → 开始摆药 → 扫码绑码）</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>摆药单号</th><th>单据类型</th><th>完成时间</th><th>住院号</th><th>病区/床</th><th>患者</th><th>码数</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  // 2026-10-18 Task5：已绑码表迁移 PulDocDetail.renderCodes 独立表格（退药勾选 data-pick / 全选 / 原因选择监听不动；
  // 勾选列因组件扩展列固定后置移到表尾，属性与监听保持原样；卡片壳/pch-tabbar 操作条保留）
  function codesCard() {
    var d = selDoc();
    if (!d) return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点选摆药单行查看当时绑定的码</div></div>';
    var codes = allCodes(d);
    var active = d.status === '已完成';   // 已退药终态不再给勾选
    var rows = codes.map(function (c) {
      return {
        code: c.code, drugName: drugName(c._drug), batch: c.batch, location: c.phLoc || '—',
        _splitCell: c.split === '是' ? '<span class="badge bg-orange-lt">拆零 ' + esc(c.splitQty || '') + '</span>' : '整盒',
        _pickCell: active ? '<input class="form-check-input" type="checkbox" data-pick="' + esc(c.code) + '"' + (picked[c.code] ? ' checked' : '') + '>' : ''
      };
    });
    var extras = [{ key: 'split', title: '拆零', cell: function (r) { return r._splitCell; } }];
    if (active) extras.push({ key: 'pick', title: '退药', cell: function (r) { return r._pickCell; } });
    var table = window.PulDocDetail.renderCodes({ codes: rows }, {
      columns: ['seq', 'code', 'drugName', 'batch', 'expDate', 'location'],
      extraColumns: extras,
      emptyText: '无码（已全部退回）'
    });
    var bar = '';
    if (active && codes.length) {
      var n = codes.filter(function (c) { return picked[c.code]; }).length;
      bar = '<div class="pch-tabbar">' +
        '<label class="form-check" style="margin:0;"><input class="form-check-input" type="checkbox" id="ckAll"' + (n === codes.length ? ' checked' : '') + '><span class="form-check-label">全选</span></label>' +
        '<span class="text-secondary" style="font-size:12.5px;">已选 <b>' + n + '</b> / ' + codes.length + '</span>' +
        '<select class="form-select" id="retReason" style="width:160px;">' +
          '<option value="">退药原因 *</option>' +
          RET_REASONS.map(function (r) { return '<option' + (reason === r ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select>' +
        '<div class="ms-auto"><button class="btn btn-danger" id="btnRet"' + (n ? '' : ' disabled') + '>↩ 退药 ' + (n || '') + ' 个码</button></div></div>';
    }
    return '<div class="card" id="codesCard"><div class="card-header"><b>已绑码</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.trayNo) + ' · ' + esc(d.patient) + ' · ' + esc(d.ward) + esc(d.bed) +
      (active ? ' · 勾选要退的码（可部分退）' : ' · 已退药终态') + '</span></div>' +
      table + bar + '</div>';
  }

  function doRet(d) {
    var all = allCodes(d);
    var codes = all.filter(function (c) { return picked[c.code]; });
    if (!codes.length) { window.showToast('请先勾选要退的码'); return; }
    if (!reason) { window.showToast('请选择退药原因'); return; }
    var isAll = codes.length === all.length;
    UI.confirm('确认摆药单退药 <b>' + esc(d.trayNo) + '</b> · ' + esc(d.patient) + '（' + esc(d.ward) + esc(d.bed) + '）？<div style="margin-top:8px;">' +
      '退回 <b>' + codes.length + '</b> / ' + all.length + ' 个码（原因：' + esc(reason) + '），码回本药房在架（货位保留）。<br>' +
      (isAll ? '整单退完：单据置「已退药」，退出病区签收范围。' : '部分退：单据仍为「已完成」，剩余码继续占用、可再次退。') + '</div>', function () {
      var retSet = {};
      codes.forEach(function (c) { retSet[c.code] = true; });
      (d.items || []).forEach(function (it) {
        it.codes = (it.codes || []).filter(function (c) { return !retSet[c.code]; });
      });
      if (isAll) { d.status = '已退药'; d.retTime = R.now(); }
      S.trayRetDocs.unshift({
        retNo: R.nextNo('BYTH', S.trayRetDocs, 'retNo'), trayNo: d.trayNo, date: R.now(),
        pharmacy: ph(), ward: d.ward, bed: d.bed, inpatientNo: d.inpatientNo,
        patient: d.patient, operator: curUser().name || '陈静',
        reason: reason, type: isAll ? '整单退' : '部分退', status: '已退药',
        codes: codes.map(function (c) { return Object.assign({}, c); })
      });
      picked = {}; reason = '';
      save(); renderAll();
      window.showToast('已退药 ' + codes.length + ' 个码（' + (isAll ? '整单退' : '部分退') + '），码回在架');
    }, '确认退药');
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + codesCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () { kw = v('fKw'); renderAll(); });
    document.getElementById('btnReset').addEventListener('click', function () { kw = ''; renderAll(); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); picked = {}; reason = ''; renderAll(); });
    });
    content.querySelectorAll('[data-ret]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = null; S.trayDocs.forEach(function (x) { if (x.trayNo === b.getAttribute('data-ret')) d = x; });
        if (!d) return;
        sel = d.trayNo; picked = {}; reason = '';
        renderAll();
        var cc = document.getElementById('codesCard');
        if (cc) cc.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        window.showToast('已选中 ' + d.trayNo + '：在码清单勾选要退的码，选原因后确认');
      });
    });
    content.querySelectorAll('[data-pick]').forEach(function (ck) {
      ck.addEventListener('change', function () {
        var c = ck.getAttribute('data-pick');
        if (ck.checked) picked[c] = true; else delete picked[c];
        renderAll();
      });
    });
    var ckAll = document.getElementById('ckAll');
    if (ckAll) ckAll.addEventListener('change', function () {
      var d = selDoc(); if (!d) return;
      allCodes(d).forEach(function (c) { if (ckAll.checked) picked[c.code] = true; else delete picked[c.code]; });
      renderAll();
    });
    var rs = document.getElementById('retReason');
    if (rs) rs.addEventListener('change', function () { reason = rs.value; });
    var br = document.getElementById('btnRet');
    if (br) br.addEventListener('click', function () { var d = selDoc(); if (d) doRet(d); });
  }

  var first = doneList()[0];
  if (first) sel = first.trayNo;
  renderAll();
})();
