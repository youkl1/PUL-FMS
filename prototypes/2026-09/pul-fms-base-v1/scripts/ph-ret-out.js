/**
 * ph-ret-out.js — 退回出库单：从领用出库单申请退回 → 扫码核对 → 确认出库 → 库房退回单池
 * 口径（2026-10-03 拍板）：药房退回必须锚定领用出库单（仅「已入库 / 已上架」可退；在途货未到手不退）
 * 交互对齐采购退货单：选单选码（从来源单勾选补入）+ 扫码核对实物；全部核对完才能确认出库
 * 未出库=草稿（可编辑备注/移除码/撤销）；确认后 status=待入库，库房「领用退回」可见
 * 一码不能同时在两张退回单；已审核损耗码不可退
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'retOut', crumb: ['药房管理', '退回出库单'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load();
  var DICT = D.flat(DS);
  var sel = null;
  var checked = {};   // code → true（已扫码核对；切单清空）
  var filters = { status: '全部', kw: '' };

  function save() { W.save(S); }
  function curUser() { return window.store.load().currentUser || {}; }
  function curPharm() { return W.curPharm(); }
  function myRets() {
    var ph = curPharm();
    return S.retPool.filter(function (r) {
      if (r.pharmacy !== ph) return false;
      if (filters.status !== '全部' && r.status !== filters.status) return false;
      if (filters.kw && r.retNo.indexOf(filters.kw) === -1) return false;
      return true;
    });
  }
  function selRet() {
    for (var i = 0; i < S.retPool.length; i++) if (S.retPool[i].retNo === sel) return S.retPool[i];
    return null;
  }
  function drugNameOf(code20) {
    var p = P.parseCode(code20, DICT);
    return p.dict ? p.dict.drugName : '未解析';
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function stHtml(st) {
    if (st === '已入库') return '<span class="pch-light ok"><i class="pch-dot"></i>已入库</span>';
    if (st === '待入库') return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待入库</span>';
    return '<span class="pch-light mute"><i class="pch-dot"></i>未出库</span>';
  }
  // 已占用码：任何退回单（含已入库）+ 已审核损耗 → 不可再退
  function occupiedSet() {
    var m = {};
    (S.retPool || []).forEach(function (r) { (r.codes || []).forEach(function (c) { m[c.code] = 1; }); });
    (S.phLossDocs || []).forEach(function (d) {
      if (d.status !== '已审核') return;
      (d.codes || []).forEach(function (c) { m[c.code] = 1; });
    });
    return m;
  }
  // 某张领用出库单的可退码（排除已占用）
  function retirableOfDoc(doc) {
    var occ = occupiedSet();
    return (doc.codes || []).filter(function (c) { return !occ[c.code]; });
  }
  // 可发起退回的领用出库单：本药房 · 已入库/已上架 · 有可退码（在途=货未到手，不退）
  function returnableDocs() {
    var ph = curPharm();
    return (S.pickDocs || []).filter(function (d) {
      return d.pharmacy === ph && (d.status === '已入库' || d.status === '已上架') && retirableOfDoc(d).length > 0;
    });
  }
  function pickDocOf(billNo) {
    for (var i = 0; i < (S.pickDocs || []).length; i++) if (S.pickDocs[i].billNo === billNo) return S.pickDocs[i];
    return null;
  }

  function filterBar() {
    var opt = function (cur, o, label) {
      return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>';
    };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fStatus" style="width:120px;">' +
        ['全部', '未出库', '待入库', '已入库'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fKw" style="width:170px;" placeholder="退回单号 / 来源出库单号" value="' + esc(filters.kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(curPharm()) + '</span>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增退回</button></div>' +
      '</div></div></div>';
  }

  function docsCard() {
    var list = myRets().filter(function (r) {
      return !filters.kw || r.retNo.indexOf(filters.kw) !== -1 || (r.refNo || '').indexOf(filters.kw) !== -1;
    });
    var rowsHtml = list.map(function (r) {
      var draft = r.status === '未出库';
      var op = draft
        ? '<button class="btn btn-sm btn-outline-primary" data-scan="' + esc(r.retNo) + '">扫码核对</button> ' +
          '<button class="btn btn-sm btn-outline-primary" data-edit="' + esc(r.retNo) + '">编辑</button> ' +
          '<button class="btn btn-sm btn-success" data-audit="' + esc(r.retNo) + '"' + (r.codes.length ? '' : ' disabled') + '>确认出库</button> ' +
          '<button class="btn btn-sm btn-outline-danger" data-del="' + esc(r.retNo) + '">撤销</button>'
        : '<span class="text-secondary">—</span>';
      return '<tr class="pch-doc-row' + (r.retNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(r.retNo) + '">' +
        '<td><b>' + esc(r.retNo) + '</b></td><td>退回出库</td><td class="text-secondary">' + esc(r.date) + '</td>' +
        '<td>' + (r.refNo ? '<b>' + esc(r.refNo) + '</b>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td>' + esc(r.warehouse) + '</td><td>' + esc(r.operator) + '</td><td>' + r.codes.length + '</td>' +
        '<td>' + stHtml(r.status) + '</td>' +
        '<td onclick="event.stopPropagation()">' + op + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="9" class="text-center text-secondary" style="padding:28px;">暂无退回单——点右上「新增退回」，从领用出库单发起</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>退回出库单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">从领用出库单申请退回 · 确认后进入库房「领用退回」单池 · 本药房 ' + list.length + ' 单</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>退回单号</th><th>单据类型</th><th>时间</th><th>来源出库单</th><th>退回库房</th><th>经手人</th><th>码数</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // ===== 工作台（对齐领用备货单：下左药品明细 / 下右追溯码明细 + 底部进度条）
  // 2026-10-18 Task5：双表迁移 PulDocDetail 独立表格 API（应退/已核对聚合 extraColumns 对齐 wh-other-out 先例；
  // data-uncode 移除监听不动；卡片壳/选单选码按钮/进度条保留） =====
  function checkedCount(r) {
    return r.codes.filter(function (c) { return checked[c.code]; }).length;
  }
  function drugsCard(r, draft) {
    var map = {};
    r.codes.forEach(function (c) {
      var key = c.code.slice(0, 7) + '|' + c.batch;
      if (!map[key]) map[key] = { code: c, qty: 0, done: 0 };
      map[key].qty += 1;
      if (checked[c.code]) map[key].done += 1;
    });
    var rows = Object.keys(map).map(function (k) {
      var g = map[k], p = P.parseCode(g.code.code, DICT), d = p.dict || {};
      return { raw: g, drugName: d.drugName || '未解析', formSpec: d.formSpec || '-', batch: g.code.batch, qty: g.qty };
    });
    var table = window.PulDocDetail.renderDrugs({ drugs: rows }, {
      columns: ['seq', 'drugName', 'formSpec', 'batch'],
      extraColumns: [
        { key: 'planQty', title: '应退', cell: function (row) { return '<b>' + row.qty + '</b>'; } },
        { key: 'doneQty', title: '已核对', cell: function (row) {
            if (!draft) return '<span class="text-secondary">—</span>';
            return '<b class="' + (row.raw.done === row.raw.qty ? 'text-success' : 'text-warning') + '">' + row.raw.done + '</b>';
          } }
      ],
      emptyText: '暂无药品'
    });
    return '<div class="card" style="height:100%;"><div class="card-header"><b>药品明细清单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">应退 vs 已核对</span></div>' +
      table + '</div>';
  }
  function codesCard(r, draft) {
    var rows = r.codes.map(function (c) {
      var ck = !!checked[c.code];
      return {
        raw: c,
        className: ck && draft ? 'pch-row-picked' : '',
        code: c.code, drugName: drugNameOf(c.code), batch: c.batch, expDate: c.expDate,
        _splitCell: +c.splitQty > 0 ? '<span class="wh-exp-badge warn">已拆零发出 ' + esc(c.splitQty) + '</span>' : '<span class="text-secondary">—</span>',
        status: draft ? { kind: ck ? 'done' : 'todo', text: ck ? '✓ 已核对' : '未核对' } : null,
        _opCell: draft ? '<button class="btn btn-sm btn-outline-danger" data-uncode="' + esc(c.code) + '">移除</button>' : ''
      };
    });
    var extras = [{ key: 'splitTip', title: '拆零提示', cell: function (row) { return row._splitCell; } }];
    if (draft) extras.push({ key: 'op', title: '操作', cell: function (row) { return row._opCell; } });
    var table = window.PulDocDetail.renderCodes({ codes: rows }, {
      columns: ['seq', 'code', 'drugName', 'batch', 'expDate', 'checkStatus'],
      extraColumns: extras,
      emptyText: '码清单为空——用「选单选码」' + (r.refNo ? '从来源出库单勾选' : '绑定来源出库单并勾选')
    });
    var bar = '';
    if (draft) {
      var done = checkedCount(r), all = r.codes.length;
      bar = '<div class="pch-tabbar">' +
        '<div class="pch-progress"><i style="width:' + (all ? Math.round(done / all * 100) : 0) + '%;"></i></div>' +
        '<span class="pch-progress-txt">已核对 ' + done + ' / ' + all + '</span>' +
        '<div class="ms-auto"><button class="btn btn-success" id="btnOut"' + (all && done === all ? '' : ' disabled title="全部核对完成才能确认出库"') + '>✓ 确认出库</button></div>' +
        '</div>';
    }
    return '<div class="card" style="height:100%;"><div class="card-header"><b>追溯码明细清单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(r.retNo) + ' · ' + r.codes.length + ' 个码' + (r.refNo ? ' · 来源 ' + esc(r.refNo) : '') + '</span>' +
      (draft ? '<div class="ms-auto"><button class="btn btn-sm btn-outline-primary" id="btnPick">☰ 选单选码</button></div>' : '') + '</div>' +
      table + bar + '</div>';
  }
  function workbench() {
    var r = selRet();
    if (!r) return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点选上方退回单，查看明细</div></div>';
    var draft = r.status === '未出库';
    return '<div style="display:grid;grid-template-columns:1fr 1.6fr;gap:12px;align-items:start;">' +
      drugsCard(r, draft) + codesCard(r, draft) + '</div>';
  }

  // ===== 新增退回：选领用出库单 → 勾选要退的码（默认全选）→ 生成草稿 =====
  function defaultWh() {
    var org = window.PUL.orgOfNode(curPharm()) || (curUser().org || '');
    var nodes = window.PUL.nodesOfOrg(org);
    for (var i = 0; i < nodes.length; i++) if (window.PUL.nodeKind(nodes[i].type) === '库房') return nodes[i].name;
    return '中心库';
  }
  function openAdd() {
    var docs = returnableDocs();
    var docOpts = docs.map(function (d) {
      return '<option value="' + esc(d.billNo) + '">' + esc(d.billNo) + ' · ' + esc(d.date.slice(0, 10)) + ' · 可退 ' + retirableOfDoc(d).length + ' 码</option>';
    }).join('');
    function codeRows(billNo) {
      var doc = pickDocOf(billNo);
      if (!doc) return '<tr><td colspan="5" class="text-center text-secondary" style="padding:20px;">请选择领用出库单</td></tr>';
      return retirableOfDoc(doc).map(function (c) {
        return '<tr><td><input type="checkbox" class="form-check-input" data-pk="' + esc(c.code) + '" checked></td>' +
          '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
          '<td><b>' + esc(drugNameOf(c.code)) + '</b></td><td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td></tr>';
      }).join('');
    }
    UI.modalShell('phRetAdd', '新增退回 · 从领用出库单发起',
      (docs.length
        ? '<div class="mb-2"><label class="form-label required">来源领用出库单（本药房 · 已入库）</label>' +
          '<select class="form-select" id="raDoc">' + docOpts + '</select></div>' +
          '<div class="table-responsive" style="max-height:260px;overflow-y:auto;"><table class="table table-vcenter table-sm card-table">' +
          '<thead><tr><th style="width:36px;"></th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th></tr></thead>' +
          '<tbody id="raRows">' + codeRows(docs[0].billNo) + '</tbody></table></div>' +
          '<div class="text-secondary" style="font-size:12.5px;">勾选本次要退的码（默认全选）；创建后扫码核对实物，全部核对完成才能确认出库。在途（已出库未入库）的单不可退。</div>'
        : '<div class="text-center text-secondary" style="padding:24px;">本药房暂无可退的领用出库单<br><span style="font-size:12px;">仅「已入库/已上架」且码未被其他退回单占用的领用出库单可发起退回</span></div>'),
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      (docs.length ? '<button class="btn btn-primary" id="raOk">创建退回单</button>' : ''), 760);
    var el = UI.open('phRetAdd');
    var ok = el.querySelector('#raOk');
    if (!ok) return;
    el.querySelector('#raDoc').addEventListener('change', function () {
      el.querySelector('#raRows').innerHTML = codeRows(el.querySelector('#raDoc').value);
    });
    ok.addEventListener('click', function () {
      var billNo = el.querySelector('#raDoc').value;
      var doc = pickDocOf(billNo);
      if (!doc) return;
      var pool = {};
      retirableOfDoc(doc).forEach(function (c) { pool[c.code] = c; });
      var picked = [];
      el.querySelectorAll('[data-pk]:checked').forEach(function (cb) {
        var c = pool[cb.getAttribute('data-pk')];
        if (c) picked.push(Object.assign({}, c));
      });
      if (!picked.length) { window.showToast('请先勾选要退的追溯码'); return; }
      var r = { retNo: W.nextNo('TH', S.retPool, 'retNo'), date: W.now(), pharmacy: curPharm(),
        warehouse: defaultWh(), operator: curUser().name || '演示员', status: '未出库',
        refNo: billNo, remark: '', codes: picked };
      S.retPool.unshift(r);
      sel = r.retNo; checked = {};
      save(); UI.close('phRetAdd'); renderAll();
      window.showToast('已创建 ' + r.retNo + '（来源 ' + billNo + '），请扫码核对实物');
    });
  }

  // ===== 选单选码：从来源出库单补选（该单剩余可退码）；老数据草稿缺来源单 → 弹窗内先绑定 =====
  function openPickModal() {
    var r = selRet();
    if (!r || r.status !== '未出库') return;
    var inDoc = {};
    r.codes.forEach(function (c) { inDoc[c.code] = 1; });
    function rowsFor(billNo) {
      var doc = pickDocOf(billNo);
      if (!doc) return { html: '<tr><td colspan="5" class="text-center text-secondary" style="padding:24px;">请选择来源领用出库单</td></tr>', avail: [] };
      var avail = retirableOfDoc(doc).filter(function (c) { return !inDoc[c.code]; });
      var html = avail.map(function (c) {
        return '<tr><td><input class="form-check-input" type="checkbox" data-pk="' + esc(c.code) + '"></td>' +
          '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
          '<td><b>' + esc(drugNameOf(c.code)) + '</b></td>' +
          '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td></tr>';
      }).join('');
      if (!avail.length) html = '<tr><td colspan="5" class="text-center text-secondary" style="padding:24px;">来源单 ' + esc(billNo) + ' 没有更多可退的码</td></tr>';
      return { html: html, avail: avail };
    }
    var doc = pickDocOf(r.refNo);
    var needBind = !doc;   // 老数据兜底：2026-10-03 前的草稿没有 refNo
    var docs = needBind ? returnableDocs() : [];
    var firstNo = doc ? r.refNo : (docs.length ? docs[0].billNo : '');
    var head = doc
      ? '<div class="text-secondary mb-2" style="font-size:12.5px;">来源出库单 <b>' + esc(r.refNo) + '</b> 的剩余可退码：</div>'
      : (docs.length
        ? '<div class="mb-2"><label class="form-label required">绑定来源领用出库单（本药房 · 已入库）</label>' +
          '<select class="form-select" id="pkDoc">' + docs.map(function (d2) {
            return '<option value="' + esc(d2.billNo) + '">' + esc(d2.billNo) + ' · ' + esc(d2.date.slice(0, 10)) + ' · 可退 ' + retirableOfDoc(d2).length + ' 码</option>';
          }).join('') + '</select></div>' +
          '<div class="text-secondary mb-2" style="font-size:12.5px;">该退回单为老数据、未绑定来源单；勾选加入后自动绑定。</div>'
        : '<div class="text-center text-secondary" style="padding:24px;">本药房暂无可退的领用出库单<br><span style="font-size:12px;">仅「已入库/已上架」且码未被其他退回单占用的领用出库单可作为来源；也可直接「撤销」该草稿</span></div>');
    var init = rowsFor(firstNo);
    var canPick = doc || docs.length;
    UI.modalShell('phRetPick', '选单选码 · ' + r.retNo,
      head + (canPick ? '<div class="table-responsive" style="max-height:320px;overflow-y:auto;"><table class="table table-vcenter table-sm card-table">' +
        '<thead><tr><th></th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th></tr></thead>' +
        '<tbody id="pkRows">' + init.html + '</tbody></table></div>' : ''),
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      (canPick ? '<button class="btn btn-primary" id="pkOk">加入清单</button>' : ''), 720);
    var el = UI.open('phRetPick');
    var ok = el.querySelector('#pkOk');
    if (!ok) return;
    var availNow = init.avail;
    var selDocEl = el.querySelector('#pkDoc');
    if (selDocEl) selDocEl.addEventListener('change', function () {
      var rr = rowsFor(selDocEl.value);
      availNow = rr.avail;
      el.querySelector('#pkRows').innerHTML = rr.html;
    });
    ok.addEventListener('click', function () {
      var pool = {};
      availNow.forEach(function (c) { pool[c.code] = c; });
      var added = 0;
      el.querySelectorAll('[data-pk]:checked').forEach(function (cb) {
        var c = pool[cb.getAttribute('data-pk')];
        if (c && !inDoc[c.code]) { r.codes.push(Object.assign({}, c)); inDoc[c.code] = 1; added++; }
      });
      if (!added) { window.showToast('请先勾选要补入的码'); return; }
      if (needBind && selDocEl) r.refNo = selDocEl.value;   // 老数据兜底：补绑来源单
      save(); UI.close('phRetPick'); renderAll();
      window.showToast('已加入 ' + added + ' 个码' + (needBind ? '，并绑定来源单 ' + r.refNo : ''));
    });
  }

  // 二期 Task B：openScan 大版面接线适配——退回码按 药品+批次 聚合（与 drugsCard 同源口径），仅视图模型不改业务
  function scanDrugRows(r) {
    var map = {};
    r.codes.forEach(function (c) {
      var key = c.code.slice(0, 7) + '|' + c.batch;
      if (!map[key]) map[key] = { qty: 0, done: 0, drugName: '—', formSpec: '—', batch: c.batch };
      map[key].qty += 1;
      if (checked[c.code]) map[key].done += 1;
      if (map[key].drugName === '—') {
        var p = P.parseCode(c.code, DICT);
        if (p.dict) { map[key].drugName = p.dict.drugName; map[key].formSpec = p.dict.formSpec || '—'; }
      }
    });
    return Object.keys(map).map(function (k) {
      var g = map[k];
      return { drugName: g.drugName, formSpec: g.formSpec, batch: g.batch, qty: g.qty,
        scanText: g.done + ' / ' + g.qty,
        diff: g.done === g.qty ? { kind: 'full', text: '核对齐' } : { kind: 'short', text: '缺 ' + (g.qty - g.done) } };
    });
  }

  // ===== 扫码核对：单内码√已核对 / 来源单内未勾选⚠提示选单选码 / 单外码×拦截 =====
  function openScanModal() {
    var r = selRet();
    if (!r || r.status !== '未出库') return;
    var srcDoc = pickDocOf(r.refNo);
    UI.openScan({
      title: '扫码核对 · ' + r.retNo,
      headerHtml: '<div class="pch-scan-fields">' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">单据类型</span>退回出库</span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">单据单号</span><b>' + esc(r.retNo) + '</b></span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">单据时间</span>' + esc(r.date) + '</span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">发货方</span>' + esc(r.pharmacy) + '</span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">收货方</span>' + esc(r.warehouse) + '</span></div>',
      drugsRows: function () { return scanDrugRows(r); },
      drugsOptions: { columns: ['seq', 'drugName', 'formSpec', 'batch', 'qty', 'scanQty', 'diff'], emptyText: '码清单为空' },
      hint: '扫退回实物码：清单内码标记已核对；来源单内但未勾选的码请用「选单选码」补入；无关码拦截',
      gate: 'in', node: curPharm(),
      onScan: function (code) {
        var inList = null;
        r.codes.forEach(function (c) { if (c.code === code) inList = c; });
        if (!inList) {
          if (!srcDoc) return { level: 'bad', msg: '该退回单未绑定来源出库单——请先用「选单选码」绑定并勾选' };
          var inSrc = (srcDoc.codes || []).some(function (c) { return c.code === code; });
          if (inSrc) return { level: 'warn', msg: '该码在来源单内但未勾选退回——请用「选单选码」补入清单' };
          return { level: 'bad', msg: '不在来源出库单 ' + (r.refNo || '') + '，禁止混入' };
        }
        if (checked[code]) return { level: 'warn', msg: '重复扫码，已核对' };
        checked[code] = true;
        renderAll();
        return { level: 'ok', msg: drugNameOf(code) + ' 已核对（' + checkedCount(r) + '/' + r.codes.length + '）' + (+inList.splitQty > 0 ? '（注意：已拆零发出 ' + inList.splitQty + '）' : '') };
      },
      onClose: renderAll
    });
  }

  // ===== 确认出库：全部核对完成才放行 → 待入库（库房「领用退回」可见） =====
  function confirmOut(r) {
    if (!r.codes.length) { window.showToast('请先用「选单选码」加入退回码'); return; }
    var done = checkedCount(r);
    if (done < r.codes.length) { window.showToast('还有 ' + (r.codes.length - done) + ' 个码未扫码核对，找不到的码请先「移除」'); return; }
    UI.confirm('确认退回出库单 <b>' + esc(r.retNo) + '</b> 到 ' + esc(r.warehouse) + '？共 ' + r.codes.length + ' 个码（来源 ' + esc(r.refNo || '—') + '）。' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:6px;">确认后进入库房「领用退回」单池，本药房在架扣除。</div>',
      function () {
        r.status = '待入库'; r.date = W.now();
        save(); renderAll();
        window.showToast('已出库，库房「领用退回」可见');
      }, '确认出库');
  }

  // ===== 编辑（未出库草稿可改备注） =====
  function openEdit(r) {
    UI.modalShell('phRetEdit', '编辑退回单 · ' + r.retNo,
      '<div class="mb-3"><label class="form-label">退回单号</label><input class="form-control" value="' + esc(r.retNo) + '" disabled></div>' +
      '<div class="mb-3"><label class="form-label">来源出库单</label><input class="form-control" value="' + esc(r.refNo || '—') + '" disabled></div>' +
      '<div class="mb-2"><label class="form-label">备注</label><input class="form-control" id="reRemark" value="' + esc(r.remark || '') + '" placeholder="如：近效期退回"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">码清单用「选单选码 / 扫码核对 / 移除」调整。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="reOk">保存</button>', 480);
    var el = UI.open('phRetEdit');
    el.querySelector('#reOk').addEventListener('click', function () {
      r.remark = el.querySelector('#reRemark').value.trim();
      save(); UI.close('phRetEdit'); renderAll();
      window.showToast('已保存 ' + r.retNo);
    });
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + workbench(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { status: v('fStatus'), kw: v('fKw') }; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { status: '全部', kw: '' }; renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', openAdd);
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); checked = {}; renderAll(); });
    });
    content.querySelectorAll('[data-audit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-audit');
        S.retPool.forEach(function (r) { if (r.retNo === no) { sel = no; confirmOut(r); } });
      });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-edit');
        S.retPool.forEach(function (r) { if (r.retNo === no) { sel = no; openEdit(r); } });
      });
    });
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-del');
        UI.confirm('撤销退回单 <b>' + esc(no) + '</b>？码回到药房在架。', function () {
          S.retPool = S.retPool.filter(function (r) { return r.retNo !== no; });
          if (sel === no) sel = null;
          save(); renderAll();
          window.showToast('已撤销 ' + no);
        }, '撤销');
      });
    });
    content.querySelectorAll('[data-scan]').forEach(function (b) {
      b.addEventListener('click', function () { sel = b.getAttribute('data-scan'); openScanModal(); });
    });
    content.querySelectorAll('[data-uncode]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = selRet(); if (!r) return;
        var code = b.getAttribute('data-uncode');
        r.codes = r.codes.filter(function (c) { return c.code !== code; });
        delete checked[code];
        save(); renderAll();
      });
    });
    var bp = document.getElementById('btnPick');
    if (bp) bp.addEventListener('click', openPickModal);
    var bo = document.getElementById('btnOut');
    if (bo) bo.addEventListener('click', function () { var r = selRet(); if (r) confirmOut(r); });
  }

  var first = myRets()[0];
  if (first) sel = first.retNo;
  renderAll();
})();
