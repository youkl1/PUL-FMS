/**
 * ward-sign.js — 病区签收：摆药已完成单按码核对，齐了自动签收（不扣库存，患者已绑）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'wardSign', crumb: ['发药管理', '病区签收'] });
  if (!content) return;

  var W = window.PUL_WH, R = window.PUL_RX, UI = window.PchUI, esc = UI.esc;
  var S = R.load();
  var tab = '待签收', sel = null, kw = '';
  var q = new URLSearchParams(location.search).get('trayNo');

  function save() { R.save(S); }
  function ph() { return W.curPharm(); }
  function curUser() { return window.store.load().currentUser || {}; }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function drugName(dc) { var d = R.drugOf(dc); return d ? d.drugName : dc; }
  function allCodes(d) {
    var out = [];
    (d.items || []).forEach(function (it) {
      (it.codes || []).forEach(function (c) { out.push(Object.assign({ _drug: it.drugCode }, c)); });
    });
    return out;
  }
  function signedCnt(d) {
    var n = 0;
    allCodes(d).forEach(function (c) { if (c.wardSigned) n++; });
    return n;
  }
  function markSigned(d, code) {
    (d.items || []).forEach(function (it) {
      (it.codes || []).forEach(function (c) { if (c.code === code) c.wardSigned = true; });
    });
  }
  function isDone(d) { return !!d.signedAt; }
  function list() {
    var p = ph();
    return S.trayDocs.filter(function (d) {
      if (d.pharmacy !== p) return false;
      if (d.status !== '已完成') return false;
      var done = isDone(d);
      if (tab === '待签收' && done) return false;
      if (tab === '已签收' && !done) return false;
      if (kw && (d.trayNo + d.patient + d.inpatientNo + d.ward).indexOf(kw) === -1) return false;
      return true;
    });
  }
  function selDoc() {
    for (var i = 0; i < S.trayDocs.length; i++) if (S.trayDocs[i].trayNo === sel) return S.trayDocs[i];
    return null;
  }
  function counts() {
    var p = ph(), c = { 待签收: 0, 已签收: 0 };
    S.trayDocs.forEach(function (d) {
      if (d.pharmacy !== p || d.status !== '已完成') return;
      if (isDone(d)) c['已签收']++; else c['待签收']++;
    });
    return c;
  }

  function filterBar() {
    var c = counts();
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:200px;" placeholder="单号 / 住院号 / 病区 / 姓名" value="' + esc(kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(ph()) + ' · 不扣库存</span>' +
      '</div></div></div>' +
      UI.tabsHeader([
        { key: '待签收', name: '待签收', badge: c['待签收'] || '' },
        { key: '已签收', name: '已签收', badge: c['已签收'] || '' }
      ], tab);
  }

  function docsCard() {
    var rows = list().map(function (d) {
      var n = allCodes(d).length, s = signedCnt(d);
      return '<tr class="pch-doc-row' + (d.trayNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.trayNo) + '">' +
        '<td><b>' + esc(d.trayNo) + '</b></td><td class="text-secondary">' + esc(d.doneTime || d.date) + '</td>' +
        '<td>' + esc(d.inpatientNo) + '</td><td>' + esc(d.ward) + ' / ' + esc(d.bed) + '</td>' +
        '<td>' + esc(d.patient) + '</td><td>' + s + ' / ' + n + '</td>' +
        '<td>' + (isDone(d)
          ? '<span class="pch-light ok"><i class="pch-dot"></i>已签收</span>'
          : '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待签收</span>') + '</td>' +
        '<td onclick="event.stopPropagation()">' +
          (isDone(d)
            ? '<span class="text-secondary" style="font-size:12.5px;">' + esc(d.signer || '') + '</span>'
            : '<button class="btn btn-sm btn-primary" data-scan="' + esc(d.trayNo) + '">▸ 扫码签收</button>') +
        '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">' +
      (tab === '待签收' ? '暂无待签收——先在「摆药单业务」把一张做到已完成' : '暂无已签收单') + '</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>摆药单号</th><th>摆药完成</th><th>住院号</th><th>病区/床</th><th>患者</th><th>已扫/应扫</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function codesCard() {
    var d = selDoc();
    if (!d) return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点选单据看码清单（患者已随单绑定）</div></div>';
    var rows = allCodes(d).map(function (c, i) {
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td>' + esc(drugName(c._drug)) + '</td><td>' + esc(c.batch) + '</td><td>' + esc(c.phLoc || '—') + '</td>' +
        '<td>' + (c.wardSigned || isDone(d)
          ? '<span class="pch-light ok"><i class="pch-dot"></i>已确认</span>'
          : '<span class="pch-light mute"><i class="pch-dot"></i>未扫</span>') + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="6" class="text-center text-secondary">无码</td></tr>';
    return '<div class="card"><div class="card-header"><b>码清单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.trayNo) + ' · ' + esc(d.patient) +
      ' · 患者已绑，病区只确认收到</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>#</th><th>追溯码</th><th>药品</th><th>批次</th><th>货位</th><th>签收</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function finish(d) {
    d.signedAt = R.now();
    d.signer = curUser().name || '演示护士';
    tab = '已签收';
    save(); renderAll();
  }

  function openScan(d) {
    UI.openScan({
      title: '病区签收 · ' + d.trayNo,
      hint: '扫本单追溯码确认收到。不在清单=红。齐了自动签收。',
      table: true,
      onScan: function (code) {
        var hit = null;
        allCodes(d).forEach(function (c) { if (c.code === code) hit = c; });
        if (!hit) return { level: 'bad', msg: '不在本单', row: { split: '—', splitQty: '—', lvl: '—' } };
        if (hit.wardSigned) return { level: 'warn', msg: '已确认过', row: { split: '—', splitQty: '—', lvl: '1' } };
        markSigned(d, code);
        if (signedCnt(d) >= allCodes(d).length) {
          finish(d);
          return { level: 'ok', msg: '已齐，病区签收完成', row: { split: '否', splitQty: '—', lvl: '1' } };
        }
        save(); renderAll();
        return { level: 'ok', msg: '已确认 ' + signedCnt(d) + '/' + allCodes(d).length, row: { split: '否', splitQty: '—', lvl: '1' } };
      },
      onClose: renderAll
    });
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + codesCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () { kw = v('fKw'); renderAll(); });
    document.getElementById('btnReset').addEventListener('click', function () { kw = ''; renderAll(); });
    content.querySelectorAll('[data-ptab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-ptab'); sel = null; renderAll(); });
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-scan]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = null; S.trayDocs.forEach(function (x) { if (x.trayNo === b.getAttribute('data-scan')) d = x; });
        if (d) { sel = d.trayNo; openScan(d); }
      });
    });
  }

  if (q) {
    sel = q;
    S.trayDocs.forEach(function (d) { if (d.trayNo === q) tab = isDone(d) ? '已签收' : '待签收'; });
  } else {
    var first = list()[0];
    if (first) sel = first.trayNo;
  }
  renderAll();
})();
