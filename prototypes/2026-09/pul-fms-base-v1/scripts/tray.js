/**
 * tray.js — 摆药单批量赋码：HIS 拉取锁数量 → 摆药中扫码绑码（方案 b，住院通道）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'tray', crumb: ['出库管理', '摆药单批量赋码'] });
  if (!content) return;

  var W = window.PUL_WH, R = window.PUL_RX, UI = window.PchUI, esc = UI.esc;
  var WH = W.load(), S = R.load();
  var tab = '待摆药', sel = null, kw = '';
  var q = new URLSearchParams(location.search).get('trayNo');
  if (q) { sel = q; S.trayDocs.forEach(function (d) { if (d.trayNo === q) tab = d.status; }); }

  function save() { R.save(S); }
  function ph() { return W.curPharm(); }
  function curUser() { return window.store.load().currentUser || {}; }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function drugName(dc) { var d = R.drugOf(dc); return d ? d.drugName : dc; }
  function formSpec(dc) { var d = R.drugOf(dc); return d ? d.formSpec : ''; }
  function selDoc() {
    for (var i = 0; i < S.trayDocs.length; i++) if (S.trayDocs[i].trayNo === sel) return S.trayDocs[i];
    return null;
  }
  function hisOf(trayNo) {
    for (var i = 0; i < S.hisTrayPool.length; i++) if (S.hisTrayPool[i].trayNo === trayNo) return S.hisTrayPool[i];
    return null;
  }
  function list() {
    var p = ph();
    return S.trayDocs.filter(function (d) {
      if (d.pharmacy !== p) return false;
      if (d.status !== tab) return false;
      if (kw && (d.trayNo + d.patient + d.inpatientNo + d.ward).indexOf(kw) === -1) return false;
      return true;
    });
  }
  function stHtml(st) {
    if (st === '已完成') return '<span class="pch-light ok"><i class="pch-dot"></i>已完成</span>';
    if (st === '摆药中') return '<span class="pch-light" style="color:#206bc4;"><i class="pch-dot" style="background:#206bc4;"></i>摆药中</span>';
    return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待摆药</span>';
  }
  function counts() {
    var p = ph(), c = { 待摆药: 0, 摆药中: 0, 已完成: 0 };
    S.trayDocs.forEach(function (d) { if (d.pharmacy === p && c[d.status] != null) c[d.status]++; });
    return c;
  }

  function filterBar() {
    var c = counts();
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:200px;" placeholder="单号 / 住院号 / 病区 / 姓名" value="' + esc(kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(ph()) + '</span>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnHis">HIS 拉取</button></div>' +
      '</div></div></div>' +
      UI.tabsHeader([
        { key: '待摆药', name: '待摆药', badge: c['待摆药'] || '' },
        { key: '摆药中', name: '摆药中', badge: c['摆药中'] || '' },
        { key: '已完成', name: '已完成', badge: c['已完成'] || '' }
      ], tab);
  }

  function docsCard() {
    var rows = list().map(function (d) {
      var items = d.items.map(function (it) { return drugName(it.drugCode) + '×' + it.qty; }).join('、');
      var short = d.items.some(function (it) { return it.shortage; });
      return '<tr class="pch-doc-row' + (d.trayNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.trayNo) + '">' +
        '<td><b>' + esc(d.trayNo) + '</b></td><td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td>' + esc(d.inpatientNo) + '</td><td>' + esc(d.ward) + ' / ' + esc(d.bed) + '</td>' +
        '<td>' + esc(d.patient) + '</td><td>' + esc(items) + '</td>' +
        '<td>' + stHtml(d.status) + (short ? ' <span class="badge bg-red-lt">无库存</span>' : '') + '</td>' +
        '<td onclick="event.stopPropagation()">' + ops(d) + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">本页签无单据——点右上「HIS 拉取」</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>摆药单号</th><th>开单时间</th><th>住院号</th><th>病区/床</th><th>患者</th><th>药品</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }
  function ops(d) {
    if (d.status === '待摆药') {
      var can = !d.items.some(function (it) { return it.shortage; });
      return '<button class="btn btn-sm btn-primary" data-start="' + esc(d.trayNo) + '"' + (can ? '' : ' disabled') + '>开始摆药</button> ' +
        '<button class="btn btn-sm btn-outline-danger" data-void="' + esc(d.trayNo) + '">处理无库存</button>';
    }
    if (d.status === '摆药中') return '<button class="btn btn-sm btn-primary" data-scan="' + esc(d.trayNo) + '">▸ 扫码绑码</button> ' +
      '<button class="btn btn-sm btn-outline-warning" data-finish="' + esc(d.trayNo) + '">完成摆药·事后补绑</button>';
    return '<span class="text-secondary" style="font-size:12.5px;">患者已绑</span>';
  }

  function itemsCard() {
    var d = selDoc();
    if (!d) return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点选摆药单，查看药品 / 已扫应扫 / 建议货位</div></div>';
    var rows = d.items.map(function (it, i) {
      var scanned = (it.codes || []).length;
      var sug = (it.suggest || [])[0];
      var loc = sug && sug.phLoc ? sug.phLoc : (sug ? '（不入槽）' : '—');
      var sugCode = sug ? sug.code : '—';
      var onh = R.availableQty(WH, S, ph(), it.drugCode);
      if (d.status === '待摆药' && !it.shortage) onh += it.qty - scanned;
      var done = R.itemDone(it);
      var pend = R.excPendingFor(S, d.trayNo, it.drugCode);
      var canBind = !done && (d.status === '摆药中' || d.status === '已完成');
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(drugName(it.drugCode)) + '</b></td>' +
        '<td class="text-secondary">' + esc(formSpec(it.drugCode)) + '</td>' +
        '<td>' + it.qty + esc(it.unit) + '</td><td>' + scanned + ' / ' + it.qty + '</td>' +
        '<td>' + (it.shortage ? '<span class="badge bg-red-lt">无库存</span>' : ('锁 ' + it.qty + ' · 在架 ' + onh)) + '</td>' +
        '<td>' + esc(loc) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12px;">' + esc(sugCode) + '</td>' +
        '<td>' + (canBind ? '<button class="btn btn-sm btn-outline-primary" data-mbind="' + i + '">手动补绑</button>' : '') +
        (done || d.status !== '已完成' ? '' : '<span class="badge bg-orange-lt">待补绑</span>') + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="card-header"><b>药品清单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.trayNo) + ' · ' + esc(d.patient) +
      ' · ' + esc(d.ward) + esc(d.bed) + ' · 码随单绑患者</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>#</th><th>药品</th><th>规格</th><th>应摆</th><th>已扫/应扫</th><th>锁 / 在架</th><th>建议货位</th><th>建议码</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function openHis() {
    var pool = S.hisTrayPool.filter(function (h) { return !h.pulled && h.pharmacy === ph(); });
    var body;
    if (!pool.length) {
      body = '<div class="text-secondary" style="padding:12px 0;">HIS 摆药单池已空。种子：赵强健脾 / 孙丽依姆多（无库存）。</div>';
    } else {
      body = '<div class="table-responsive" style="max-height:360px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
        '<thead><tr><th></th><th>摆药单号</th><th>住院号</th><th>病区/床</th><th>患者</th><th>药品</th></tr></thead><tbody>' +
        pool.map(function (h, i) {
          var items = h.items.map(function (it) { return drugName(it.drugCode) + '×' + it.qty; }).join('、');
          return '<tr><td><input type="radio" name="hisPick" value="' + esc(h.trayNo) + '"' + (i === 0 ? ' checked' : '') + '></td>' +
            '<td><b>' + esc(h.trayNo) + '</b></td><td>' + esc(h.inpatientNo) + '</td>' +
            '<td>' + esc(h.ward) + ' / ' + esc(h.bed) + '</td><td>' + esc(h.patient) + '</td><td>' + esc(items) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    UI.modalShell('trayHis', 'HIS 拉取 · 转入待摆药', body,
      '<button class="btn btn-outline-secondary" data-mclose>关闭</button>' +
      (pool.length ? '<button class="btn btn-primary" id="hisOk">转入待摆</button>' : ''), 760);
    var el = UI.open('trayHis');
    var ok = el.querySelector('#hisOk');
    if (!ok) return;
    ok.addEventListener('click', function () {
      var radio = el.querySelector('input[name="hisPick"]:checked');
      if (!radio) { window.showToast('请选择摆药单'); return; }
      pullHis(radio.value);
      UI.close('trayHis');
    });
  }

  function pullHis(trayNo) {
    var h = hisOf(trayNo);
    if (!h || h.pulled) return;
    var items = h.items.map(function (it) {
      var av = R.availableQty(WH, S, ph(), it.drugCode);
      return { drugCode: it.drugCode, qty: it.qty, unit: it.unit, shortage: av < it.qty, codes: [], suggest: [] };
    });
    var doc = {
      trayNo: h.trayNo, hisNo: h.hisNo, date: h.date, pharmacy: h.pharmacy,
      ward: h.ward, bed: h.bed, inpatientNo: h.inpatientNo,
      patientId: h.patientId, patient: h.patient, sex: h.sex, age: h.age,
      status: '待摆药', items: items, lockTime: R.now(), startTime: '', doneTime: '', dispenser: ''
    };
    S.trayDocs.unshift(doc);
    h.pulled = true;
    sel = doc.trayNo; tab = '待摆药';
    save(); renderAll();
    var short = items.filter(function (it) { return it.shortage; }).length;
    window.showToast(short ? '已转入待摆，' + short + ' 行无库存' : '已锁数量，进入待摆药');
  }

  function startDisp(d) {
    if (d.items.some(function (it) { return it.shortage; })) { window.showToast('有无库存明细'); return; }
    d.items.forEach(function (it) {
      it.suggest = R.suggestCodes(WH, ph(), it.drugCode, it.qty).map(function (c) { return Object.assign({}, c); });
    });
    d.status = '摆药中'; d.startTime = R.now();
    tab = '摆药中'; sel = d.trayNo;
    save(); renderAll();
    window.showToast('已按 FEFO+货位给出建议码');
  }

  function voidDisp(d) {
    UI.confirm('作废 <b>' + esc(d.trayNo) + '</b>：只释放数量锁。摆药单退回 HIS 池。', function () {
      var h = hisOf(d.trayNo); if (h) h.pulled = false;
      S.trayDocs = S.trayDocs.filter(function (x) { return x.trayNo !== d.trayNo; });
      if (sel === d.trayNo) sel = null;
      save(); renderAll();
      window.showToast('已放锁，退回 HIS 池');
    }, '确认作废');
  }

  function finishTray(d) {
    var unbound = d.items.filter(function (it) { return !R.itemDone(it); });
    if (!unbound.length) { window.showToast('全部明细已绑码，直接扫码收尾即可'); return; }
    UI.confirm('确认 <b>' + esc(d.trayNo) + '</b> 摆药完成？<div style="margin-top:8px;">' + unbound.length +
      ' 行未绑码，药先发往病区，将生成「待补绑」异常记录，事后在赋码异常台账补绑复核。</div>', function () {
      var me = curUser().name || '陈静';
      unbound.forEach(function (it) {
        if (!R.excPendingFor(S, d.trayNo, it.drugCode)) {
          R.makeExc(S, { type: '住院后置', refKind: 'tray', refNo: d.trayNo, pharmacy: d.pharmacy,
            drugCode: it.drugCode, status: '待补绑', operator: me });
        }
      });
      d.status = '已完成'; d.doneTime = R.now(); d.dispenser = me;
      tab = '已完成'; sel = d.trayNo;
      save(); renderAll();
      window.showToast('已完成摆药，' + unbound.length + ' 行待补绑，请到赋码异常台账处理');
    }, '确认完成');
  }

  function openBind(d, idx) {
    var it = d.items[idx];
    if (R.itemDone(it)) return;
    var pend = R.excPendingFor(S, d.trayNo, it.drugCode);
    window.RxBind.open({
      wh: WH, state: S, pharmacy: ph(), refKind: 'tray', refNo: d.trayNo, item: it,
      excNo: pend ? pend.excNo : undefined,
      onDone: function () {
        save(); renderAll();
        window.showToast('已补绑，异常台账转待复核');
      }
    });
  }

  function openScan(d) {
    UI.openScan({
      title: '扫码绑码 · ' + d.trayNo,
      hint: '扫建议码。齐了自动完成。病区无扫码条件可走「完成摆药·事后补绑」。',
      gate: 'out', node: ph(),
      onScan: function (code) {
        var p = R.parse(code);
        if (!p.dict) return { level: 'bad', msg: '无法解析' };
        var it = null;
        d.items.forEach(function (x) { if (x.drugCode === p.dict.drugCode) it = x; });
        if (!it) return { level: 'bad', msg: '本单不含此药' };
        if ((it.codes || []).some(function (c) { return c.code === code; })) return { level: 'warn', msg: '重复扫码' };
        if ((it.codes || []).length >= it.qty) return { level: 'warn', msg: '该药已扫齐' };
        var onh = null;
        W.pharmacyStock(WH, ph()).forEach(function (c) { if (c.code === code) onh = c; });
        if (!onh) return { level: 'bad', msg: '不在本药房在架（或已被占用）' };
        it.codes.push(Object.assign({}, onh));
        if (R.rxDone(d)) {
          d.status = '已完成'; d.doneTime = R.now(); d.dispenser = curUser().name || '陈静';
          tab = '已完成';
          save(); renderAll();
          return { level: 'ok', msg: '已齐，进入已完成 · 患者已绑' };
        }
        save(); renderAll();
        return { level: 'ok', msg: drugName(it.drugCode) + ' ' + it.codes.length + '/' + it.qty };
      },
      onClose: renderAll
    });
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + itemsCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () { kw = v('fKw'); renderAll(); });
    document.getElementById('btnReset').addEventListener('click', function () { kw = ''; renderAll(); });
    document.getElementById('btnHis').addEventListener('click', openHis);
    content.querySelectorAll('[data-ptab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-ptab'); sel = null; renderAll(); });
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-start]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = null; S.trayDocs.forEach(function (x) { if (x.trayNo === b.getAttribute('data-start')) d = x; });
        if (d) { sel = d.trayNo; startDisp(d); }
      });
    });
    content.querySelectorAll('[data-void]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = null; S.trayDocs.forEach(function (x) { if (x.trayNo === b.getAttribute('data-void')) d = x; });
        if (d) voidDisp(d);
      });
    });
    content.querySelectorAll('[data-scan]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = null; S.trayDocs.forEach(function (x) { if (x.trayNo === b.getAttribute('data-scan')) d = x; });
        if (d) { sel = d.trayNo; openScan(d); }
      });
    });
    content.querySelectorAll('[data-finish]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = null; S.trayDocs.forEach(function (x) { if (x.trayNo === b.getAttribute('data-finish')) d = x; });
        if (d) finishTray(d);
      });
    });
    content.querySelectorAll('[data-mbind]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = selDoc();
        if (d) openBind(d, +b.getAttribute('data-mbind'));
      });
    });
  }

  if (!sel && S.trayDocs.length) sel = S.trayDocs[0].trayNo;
  renderAll();
})();
