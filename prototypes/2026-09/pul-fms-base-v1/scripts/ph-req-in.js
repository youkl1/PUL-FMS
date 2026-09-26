/**
 * ph-req-in.js — 领用入库：库房出库在途 → 药房在架
 * 双通道核对（扫码 / 点行），全部核对完才能确认；与库房退回入库同一哲学
 * 库房页「确认药房入库」一键闭环仍保留（写同一 pickDocs.status）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'reqIn', crumb: ['药房管理', '领用入库'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load();
  var DICT = D.flat(DS);
  var sel = null;
  var checked = {};
  var filters = { status: '待入库', kw: '' };

  function save() { W.save(S); }
  function curPharm() { return W.curPharm(); }
  function myDocs() {
    var ph = curPharm();
    return S.pickDocs.filter(function (d) {
      if (d.pharmacy !== ph) return false;
      if (filters.status === '待入库' && d.status !== '已出库') return false;
      if (filters.status === '已入库' && d.status !== '药房已入库') return false;
      if (filters.kw && d.billNo.indexOf(filters.kw) === -1 && (d.reqNo || '').indexOf(filters.kw) === -1) return false;
      return true;
    });
  }
  function selDoc() {
    for (var i = 0; i < S.pickDocs.length; i++) if (S.pickDocs[i].billNo === sel) return S.pickDocs[i];
    return null;
  }
  function drugNameOf(code20) {
    var p = P.parseCode(code20, DICT);
    return p.dict ? p.dict.drugName : '未解析';
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  function filterBar() {
    var opt = function (cur, o, label) {
      return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>';
    };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fStatus" style="width:120px;">' +
        ['全部', '待入库', '已入库'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fKw" style="width:180px;" placeholder="出库单号 / 申请单号" value="' + esc(filters.kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(curPharm()) + '</span>' +
      '</div></div></div>';
  }

  function docsCard() {
    var list = myDocs();
    var rowsHtml = list.map(function (d) {
      var pending = d.status === '已出库';
      var st = pending
        ? '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待入库 · 在途</span>'
        : '<span class="pch-light ok"><i class="pch-dot"></i>药房已入库</span>';
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td><b>' + esc(d.billNo) + '</b></td>' +
        '<td>' + (d.reqNo ? esc(d.reqNo) : '<span class="badge bg-orange-lt">一步式</span>') + '</td>' +
        '<td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td>' + esc(d.warehouse) + '</td><td>' + d.codes.length + '</td><td>' + st + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="6" class="text-center text-secondary" style="padding:28px;">暂无出库单——库房「领用备货出库」审核后会出现在此</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>库房出库单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">待入库=在途 · 本药房 ' + list.length + ' 单</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>出库单号</th><th>申请单号</th><th>出库时间</th><th>供货库房</th><th>码数</th><th>状态</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  function checkCard() {
    var d = selDoc();
    var body;
    if (!d) {
      body = '<div class="text-center text-secondary" style="padding:32px;">点选出库单，开始核对</div>';
    } else if (d.status === '药房已入库') {
      var rowsDone = d.codes.map(function (c, i) {
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
          '<td><b>' + esc(drugNameOf(c.code)) + '</b></td>' +
          '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td>' +
          '<td><span class="text-success">✓ 已入库</span></td></tr>';
      }).join('');
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>状态</th></tr></thead>' +
        '<tbody>' + rowsDone + '</tbody></table></div>';
    } else {
      var rowsHtml = d.codes.map(function (c, i) {
        var ck = !!checked[c.code];
        return '<tr class="pch-doc-row' + (ck ? ' pch-row-picked' : '') + '" data-ck="' + esc(c.code) + '">' +
          '<td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
          '<td><b>' + esc(drugNameOf(c.code)) + '</b></td>' +
          '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td>' +
          '<td>' + (ck ? '<span class="text-success">✓ 已核对</span>' : '<span class="text-secondary">未核对</span>') + '</td></tr>';
      }).join('');
      var done = d.codes.filter(function (c) { return checked[c.code]; }).length;
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>核对</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>' +
        '<div class="pch-tabbar">' +
        '<div class="pch-progress"><i style="width:' + (d.codes.length ? Math.round(done / d.codes.length * 100) : 0) + '%;"></i></div>' +
        '<span class="pch-progress-txt">已核对 ' + done + ' / ' + d.codes.length + '</span>' +
        '<button class="btn btn-primary" id="btnScan">▸ 扫码核对</button>' +
        '<button class="btn btn-outline-primary" id="btnAll">全选</button>' +
        '<div class="ms-auto"><button class="btn btn-success" id="btnAudit"' + (done === d.codes.length && done ? '' : ' disabled') + '>✓ 确认入库</button></div>' +
        '</div>';
    }
    return '<div class="card"><div class="card-header"><b>到货码核对</b>' +
      (d ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · ' + esc(d.warehouse) + '</span>' : '') +
      '</div>' + body + '</div>';
  }

  function openScanModal() {
    var d = selDoc();
    if (!d || d.status !== '已出库') return;
    UI.openScan({
      title: '扫码核对 · ' + d.billNo,
      hint: '扫本出库单内的追溯码：单内√核对；不在单内拦截',
      gate: 'in', node: curPharm(),
      onScan: function (code) {
        var inDoc = d.codes.some(function (c) { return c.code === code; });
        if (!inDoc) return { level: 'bad', msg: '不在本出库单，禁止混入' };
        if (checked[code]) return { level: 'warn', msg: '重复扫码，已核对' };
        checked[code] = true;
        renderAll();
        return { level: 'ok', msg: drugNameOf(code) + ' 已核对' };
      },
      onClose: renderAll
    });
  }

  function openAudit() {
    var d = selDoc();
    if (!d) return;
    if (!W.assertUnfrozen(curPharm())) return;
    var done = d.codes.filter(function (c) { return checked[c.code]; }).length;
    if (done < d.codes.length) { window.showToast('还有 ' + (d.codes.length - done) + ' 个码未核对'); return; }
    UI.confirm('确认入库 <b>' + esc(d.billNo) + '</b>？' + done + ' 个码进入本药房在架。' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:6px;">库房在途同步清零。</div>',
      function () {
        d.status = '药房已入库';
        checked = {}; sel = d.billNo;
        save(); renderAll();
        window.showToast('已入库 ' + done + ' 个码，药房在架已增加');
      }, '确认入库');
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + checkCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { status: v('fStatus'), kw: v('fKw') }; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { status: '待入库', kw: '' }; renderAll();
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); checked = {}; renderAll(); });
    });
    content.querySelectorAll('[data-ck]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var code = tr.getAttribute('data-ck');
        if (checked[code]) delete checked[code]; else checked[code] = true;
        renderAll();
      });
    });
    var bs = document.getElementById('btnScan');
    if (bs) bs.addEventListener('click', openScanModal);
    var ball = document.getElementById('btnAll');
    if (ball) ball.addEventListener('click', function () {
      var d = selDoc(); if (!d) return;
      d.codes.forEach(function (c) { checked[c.code] = true; });
      renderAll();
    });
    var ba = document.getElementById('btnAudit');
    if (ba) ba.addEventListener('click', openAudit);
  }

  var first = myDocs()[0];
  if (first) sel = first.billNo;
  renderAll();
})();
