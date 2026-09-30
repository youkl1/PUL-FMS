/**
 * disp.js — 处方发药扫码：HIS 拉取锁数量 → 发药中扫码绑码 → 已完成扣在架（方案 b）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'disp', crumb: ['出库管理', '处方发药扫码'] });
  if (!content) return;

  var W = window.PUL_WH, R = window.PUL_RX, UI = window.PchUI, esc = UI.esc;
  var WH = W.load(), S = R.load();
  var tab = '待发药', sel = null, kw = '';

  function save() { R.save(S); }
  function ph() { return W.curPharm(); }
  function curUser() { return window.store.load().currentUser || {}; }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function drugName(dc) { var d = R.drugOf(dc); return d ? d.drugName : dc; }
  function formSpec(dc) { var d = R.drugOf(dc); return d ? d.formSpec : ''; }
  function selDoc() {
    for (var i = 0; i < S.rxDocs.length; i++) if (S.rxDocs[i].rxNo === sel) return S.rxDocs[i];
    return null;
  }
  function hisOf(rxNo) {
    for (var i = 0; i < S.hisPool.length; i++) if (S.hisPool[i].rxNo === rxNo) return S.hisPool[i];
    return null;
  }
  function list() {
    var p = ph();
    return S.rxDocs.filter(function (d) {
      if (d.pharmacy !== p) return false;
      if (d.status !== tab) return false;
      if (kw && (d.rxNo + d.patient).indexOf(kw) === -1) return false;
      return true;
    });
  }
  function stHtml(st) {
    if (st === '已完成') return '<span class="pch-light ok"><i class="pch-dot"></i>已完成</span>';
    if (st === '发药中') return '<span class="pch-light" style="color:#206bc4;"><i class="pch-dot" style="background:#206bc4;"></i>发药中</span>';
    return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待发药</span>';
  }
  function counts() {
    var p = ph(), c = { 待发药: 0, 发药中: 0, 已完成: 0 };
    S.rxDocs.forEach(function (d) { if (d.pharmacy === p && c[d.status] != null) c[d.status]++; });
    return c;
  }

  function filterBar() {
    var c = counts();
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:180px;" placeholder="处方号 / 姓名" value="' + esc(kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(ph()) + '</span>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnHis">HIS 拉取</button></div>' +
      '</div></div></div>' +
      UI.tabsHeader([
        { key: '待发药', name: '待发药', badge: c['待发药'] || '' },
        { key: '发药中', name: '发药中', badge: c['发药中'] || '' },
        { key: '已完成', name: '已完成', badge: c['已完成'] || '' }
      ], tab);
  }

  function docsCard() {
    var rows = list().map(function (d) {
      var items = d.items.map(function (it) { return drugName(it.drugCode) + '×' + it.qty; }).join('、');
      var short = d.items.some(function (it) { return it.shortage; });
      return '<tr class="pch-doc-row' + (d.rxNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.rxNo) + '">' +
        '<td><b>' + esc(d.rxNo) + '</b></td><td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td>' + esc(d.patient) + ' / ' + esc(d.sex) + ' / ' + d.age + '</td>' +
        '<td>' + esc(d.dept) + '</td><td>' + esc(items) + '</td>' +
        '<td>' + stHtml(d.status) + (short ? ' <span class="badge bg-red-lt">无库存</span>' : '') + '</td>' +
        '<td onclick="event.stopPropagation()">' + ops(d) + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="7" class="text-center text-secondary" style="padding:28px;">本页签无单据——点右上「HIS 拉取」</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>处方号</th><th>开方时间</th><th>患者</th><th>科室</th><th>药品</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }
  function ops(d) {
    if (d.status === '待发药') {
      var can = !d.items.some(function (it) { return it.shortage; });
      return '<button class="btn btn-sm btn-primary" data-start="' + esc(d.rxNo) + '"' + (can ? '' : ' disabled') + '>开始发药</button> ' +
        '<button class="btn btn-sm btn-outline-danger" data-void="' + esc(d.rxNo) + '">处理无库存</button>';
    }
    if (d.status === '发药中') return '<button class="btn btn-sm btn-primary" data-scan="' + esc(d.rxNo) + '">▸ 扫码绑码</button>';
    return '<span class="text-secondary" style="font-size:12.5px;">' + esc(d.dispenser || '') + '</span>';
  }

  function itemsCard() {
    var d = selDoc();
    if (!d) return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点选处方行，查看药品清单 / 已扫应扫 / 建议货位</div></div>';
    var rows = d.items.map(function (it, i) {
      var scanned = (it.codes || []).filter(function (c) { return c.split !== '是'; }).length;
      var sug = (it.suggest || [])[0];
      var loc = sug && sug.phLoc ? sug.phLoc : (sug ? '（不入槽）' : '—');
      var sugCode = sug ? sug.code : '—';
      var onh = R.availableQty(WH, S, ph(), it.drugCode) + (d.status === '待发药' ? it.qty - scanned : 0);
      if (d.status !== '待发药') onh = R.availableQty(WH, S, ph(), it.drugCode);
      var canBind = d.status === '发药中' && !R.itemDone(it);
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(drugName(it.drugCode)) + '</b></td>' +
        '<td class="text-secondary">' + esc(formSpec(it.drugCode)) + '</td>' +
        '<td>' + it.qty + esc(it.unit) + '</td>' +
        '<td>' + scanned + ' / ' + it.qty + '</td>' +
        '<td>' + (it.shortage ? '<span class="badge bg-red-lt">无库存</span>' : ('锁 ' + it.qty + ' · 在架 ' + onh)) + '</td>' +
        '<td>' + esc(loc) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12px;">' + esc(sugCode) + '</td>' +
        '<td>' + (canBind ? '<button class="btn btn-sm btn-outline-primary" data-mbind="' + i + '">手动补绑</button>' : '') + '</td></tr>';
    }).join('');
    var extra = '';
    if (d.status === '发药中' || d.status === '已完成') {
      var codes = [];
      d.items.forEach(function (it) { (it.codes || []).forEach(function (c) { codes.push(c); }); });
      extra = '<div class="card-header"><b>已绑码</b><span class="text-secondary ms-2" style="font-size:12.5px;">' + codes.length + ' 个 · 患者已随单绑定</span></div>' +
        '<div class="table-responsive"><table class="table table-vcenter card-table"><thead><tr><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>货位</th></tr></thead><tbody>' +
        (codes.length ? codes.map(function (c) {
          var p = R.parse(c.code);
          return '<tr><td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) +
            (c.bindType === 'manual' ? ' <span class="badge bg-orange-lt">手动补绑·' + esc(c.verified || '待复核') + '</span>' : '') + '</td>' +
            '<td>' + esc(p.dict ? p.dict.drugName : '—') + '</td><td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td>' +
            '<td>' + esc(c.phLoc || '—') + '</td></tr>';
        }).join('') : '<tr><td colspan="5" class="text-center text-secondary">尚未绑码</td></tr>') +
        '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>药品清单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.rxNo) + ' · ' + esc(d.patient) + '</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>#</th><th>药品</th><th>规格</th><th>应发</th><th>已扫/应扫</th><th>锁 / 在架</th><th>建议货位</th><th>建议码</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' + extra + '</div>';
  }

  function openHis() {
    var pool = S.hisPool.filter(function (h) { return !h.pulled && h.pharmacy === ph(); });
    var body;
    if (!pool.length) {
      body = '<div class="text-secondary" style="padding:12px 0;">HIS 池已空。演示种子：张伟唯可来 / 李敏健脾 / 王芳依姆多（无库存）。</div>';
    } else {
      body = '<div class="table-responsive" style="max-height:360px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
        '<thead><tr><th></th><th>处方号</th><th>开方时间</th><th>患者</th><th>科室</th><th>药品</th></tr></thead><tbody>' +
        pool.map(function (h, i) {
          var items = h.items.map(function (it) { return drugName(it.drugCode) + '×' + it.qty; }).join('、');
          return '<tr><td><input type="radio" name="hisPick" value="' + esc(h.rxNo) + '"' + (i === 0 ? ' checked' : '') + '></td>' +
            '<td><b>' + esc(h.rxNo) + '</b></td><td class="text-secondary">' + esc(h.date) + '</td>' +
            '<td>' + esc(h.patient) + '</td><td>' + esc(h.dept) + '</td><td>' + esc(items) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    UI.modalShell('rxHis', 'HIS 拉取 · 转入待发药', body,
      '<button class="btn btn-outline-secondary" data-mclose>关闭</button>' +
      (pool.length ? '<button class="btn btn-primary" id="hisOk">转入待发</button>' : ''), 760);
    var el = UI.open('rxHis');
    var ok = el.querySelector('#hisOk');
    if (!ok) return;
    ok.addEventListener('click', function () {
      var radio = el.querySelector('input[name="hisPick"]:checked');
      if (!radio) { window.showToast('请选择处方'); return; }
      pullHis(radio.value);
      UI.close('rxHis');
    });
  }

  function pullHis(rxNo) {
    var h = hisOf(rxNo);
    if (!h || h.pulled) return;
    var items = h.items.map(function (it) {
      var av = R.availableQty(WH, S, ph(), it.drugCode);
      return { drugCode: it.drugCode, qty: it.qty, unit: it.unit, shortage: av < it.qty, codes: [], suggest: [] };
    });
    var doc = {
      rxNo: h.rxNo, hisNo: h.hisNo, date: h.date, pharmacy: h.pharmacy, dept: h.dept,
      patientId: h.patientId, patient: h.patient, sex: h.sex, age: h.age,
      status: '待发药', items: items, lockTime: R.now(), startTime: '', doneTime: '', dispenser: ''
    };
    S.rxDocs.unshift(doc);
    h.pulled = true;
    sel = doc.rxNo; tab = '待发药';
    save(); renderAll();
    var short = items.filter(function (it) { return it.shortage; }).length;
    window.showToast(short ? '已转入待发，' + short + ' 行无库存，不能开始发药' : '已锁数量，进入待发药');
  }

  function startDisp(d) {
    if (d.items.some(function (it) { return it.shortage; })) { window.showToast('有无库存明细，先处理无库存'); return; }
    d.items.forEach(function (it) {
      it.suggest = R.suggestCodes(WH, ph(), it.drugCode, it.qty).map(function (c) { return Object.assign({}, c); });
    });
    d.status = '发药中'; d.startTime = R.now();
    tab = '发药中'; sel = d.rxNo;
    save(); renderAll();
    window.showToast('已按 FEFO+货位给出建议码，请扫码绑码');
  }

  function voidDisp(d) {
    UI.confirm('作废 <b>' + esc(d.rxNo) + '</b>：只释放药品级数量锁，不涉码。处方退回 HIS 池可再拉。', function () {
      var h = hisOf(d.rxNo); if (h) h.pulled = false;
      S.rxDocs = S.rxDocs.filter(function (x) { return x.rxNo !== d.rxNo; });
      if (sel === d.rxNo) sel = null;
      save(); renderAll();
      window.showToast('已放锁，处方退回 HIS 池');
    }, '确认作废');
  }

  function openScan(d) {
    UI.openScan({
      title: '扫码绑码 · ' + d.rxNo,
      hint: '扫建议码（FEFO+货位）。齐了自动完成。扫不出可回明细行点「手动补绑」。拆零不扣整码。',
      gate: 'out', node: ph(),
      flags: [{ key: 'split', label: '拆零' }],
      onScan: function (code, flags) {
        var p = R.parse(code);
        if (!p.dict) return { level: 'bad', msg: '无法解析' };
        var it = null;
        d.items.forEach(function (x) { if (x.drugCode === p.dict.drugCode) it = x; });
        if (!it) return { level: 'bad', msg: '本方不含此药' };
        if ((it.codes || []).some(function (c) { return c.code === code; })) return { level: 'warn', msg: '重复扫码' };
        if ((it.codes || []).filter(function (c) { return c.split !== '是'; }).length >= it.qty) return { level: 'warn', msg: '该药已扫齐' };
        var onh = null;
        W.pharmacyStock(WH, ph()).forEach(function (c) { if (c.code === code) onh = c; });
        if (!onh) return { level: 'bad', msg: '不在本药房在架（或已被占用）' };
        if (!flags.split && onh.split === '是') return { level: 'bad', msg: '已拆零，只能继续拆零' };
        var rec = Object.assign({}, onh);
        if (flags.split) {
          if ((R.drugOf(it.drugCode) || {}).opUnpack !== '是') return { level: 'bad', msg: '该药门诊不允许拆零' };
          rec.split = '是'; rec.splitQty = '1';
        }
        it.codes.push(rec);
        if (R.rxDone(d)) {
          d.status = '已完成'; d.doneTime = R.now(); d.dispenser = curUser().name || '陈静';
          tab = '已完成';
          save(); renderAll();
          return { level: 'ok', msg: '已齐，进入已完成 · 药房在架已扣' };
        }
        save(); renderAll();
        var whole = (it.codes || []).filter(function (c) { return c.split !== '是'; }).length;
        return { level: 'ok', msg: drugName(it.drugCode) + (flags.split ? ' 拆零仍在架 ' : ' ') + whole + '/' + it.qty +
          (onh.phLoc ? ' · ' + onh.phLoc : ' · 不入槽') };
      },
      onClose: renderAll
    });
  }

  function openBind(d, idx) {
    if (R.itemDone(d.items[idx])) return; // 双保险：行已齐不应出现按钮
    window.RxBind.open({
      wh: WH, state: S, pharmacy: ph(), refKind: 'rx', refNo: d.rxNo, item: d.items[idx],
      onDone: function () {
        if (R.rxDone(d)) {
          d.status = '已完成'; d.doneTime = R.now(); d.dispenser = curUser().name || '陈静';
          tab = '已完成';
        }
        save(); renderAll();
        window.showToast(d.status === '已完成' ? '已补绑并进入已完成，异常台账待日结复核' : '已补绑，异常台账待日结复核');
      }
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
        var d = null; S.rxDocs.forEach(function (x) { if (x.rxNo === b.getAttribute('data-start')) d = x; });
        if (d) { sel = d.rxNo; startDisp(d); }
      });
    });
    content.querySelectorAll('[data-void]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = null; S.rxDocs.forEach(function (x) { if (x.rxNo === b.getAttribute('data-void')) d = x; });
        if (d) voidDisp(d);
      });
    });
    content.querySelectorAll('[data-scan]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = null; S.rxDocs.forEach(function (x) { if (x.rxNo === b.getAttribute('data-scan')) d = x; });
        if (d) { sel = d.rxNo; openScan(d); }
      });
    });
    content.querySelectorAll('[data-mbind]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = selDoc();
        if (d) openBind(d, +b.getAttribute('data-mbind'));
      });
    });
  }

  if (S.rxDocs.length) sel = S.rxDocs[0].rxNo;
  renderAll();
})();
