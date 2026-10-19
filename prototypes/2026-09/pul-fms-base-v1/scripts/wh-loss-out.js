/**
 * wh-loss-out.js — 损耗出库单：报损出库（码 → 已销毁，终态分支）
 * 损耗原因字典（破损/过期/污染/其他）+ 来源列（日常报损/盘亏转入/数据迁移，Q1 拍板口径）
 * 重确认审核：终态不可反审核；支持 ?billNo= 深链预定位（损耗明细查询下钻入口）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'lossOut', crumb: ['出库管理', '损耗出库单', '损耗出库单'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load(), PS = P.load();
  var DICT = D.flat(DS);
  var sel = null;
  var filters = { reason: '全部', source: '全部', kw: '' };

  function save() { W.save(S); }
  function curUser() { return window.store.load().currentUser || {}; }
  function curWh() { return curUser().warehouse || '中心库'; }
  function stockMap() {
    var m = {};
    W.stockAll(PS, S, curWh()).forEach(function (c) { m[c.code] = c; });
    return m;
  }
  function selDoc() {
    for (var i = 0; i < S.lossDocs.length; i++) if (S.lossDocs[i].billNo === sel) return S.lossDocs[i];
    return null;
  }
  function filtered() {
    return S.lossDocs.filter(function (d) {
      if (filters.reason !== '全部' && d.reason !== filters.reason) return false;
      if (filters.source !== '全部' && d.source !== filters.source) return false;
      if (filters.kw && d.billNo.indexOf(filters.kw) === -1) return false;
      return true;
    });
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fReason" style="width:120px;">' +
        ['全部'].concat(W.LOSS_REASONS).map(function (o) { return opt(filters.reason, o, o === '全部' ? '损耗原因' : o); }).join('') + '</select>' +
      '<select class="form-select" id="fSource" style="width:120px;">' +
        ['全部'].concat(W.LOSS_SOURCES).map(function (o) { return opt(filters.source, o, o === '全部' ? '来源' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fKw" style="width:160px;" placeholder="单据编号" value="' + esc(filters.kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增损耗单</button></div>' +
      '</div></div></div>';
  }

  function docsCard() {
    var list = filtered();
    var rowsHtml = list.map(function (d) {
      var audited = d.status === '已审核';
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td><b>' + esc(d.billNo) + '</b></td><td>报损出库</td><td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td><span class="badge bg-red-lt">' + esc(d.reason) + '</span></td>' +
        '<td><span class="badge ' + (d.source === '日常报损' ? 'bg-blue-lt' : (d.source === '盘亏转入' ? 'bg-orange-lt' : 'bg-secondary-lt')) + '">' + esc(d.source) + '</span></td>' +
        '<td>' + esc(d.warehouse) + '</td><td>' + d.codes.length + '</td>' +
        '<td class="text-secondary">' + esc(d.remark || '—') + '</td>' +
        '<td>' + (audited ? '<span class="pch-light mute"><i class="pch-dot"></i>已销毁</span>' : '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>未审核</span>') + '</td>' +
        '<td onclick="event.stopPropagation()">' + (audited
          ? '<span class="text-secondary" style="font-size:12.5px;">' + esc(d.auditor || '') + '</span>'
          : '<button class="btn btn-sm btn-outline-primary" data-edit="' + esc(d.billNo) + '">编辑</button> ' +
            '<button class="btn btn-sm btn-danger" data-audit="' + esc(d.billNo) + '"' + (d.codes.length ? '' : ' disabled title="请先扫码选码"') + '>审核销毁</button>') + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="10" class="text-center text-secondary" style="padding:28px;">暂无损耗单</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>单据编号</th><th>单据类型</th><th>日期</th><th>损耗原因</th><th>来源</th><th>库房</th><th>码数</th><th>情况说明</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' +
      '</div>';
  }

  // 码清单卡（2026-10-18 Task5：迁移 PulDocDetail.renderCodes 独立表格；data-del 移除监听不动；卡片壳/扫码选码按钮保留）
  function codesCard() {
    var d = selDoc();
    var body;
    if (!d) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点选单据行，查看码清单</div>';
    } else {
      var rows = d.codes.map(function (c) {
        var p = P.parseCode(c.code, DICT);
        return {
          code: c.code, drugName: p.dict ? p.dict.drugName : '未解析', batch: c.batch, expDate: c.expDate,
          _opCell: d.status === '已审核' ? '<span class="text-secondary">—</span>'
            : '<button class="btn btn-sm btn-outline-danger" data-del="' + esc(c.code) + '">移除</button>'
        };
      });
      body = window.PulDocDetail.renderCodes({ codes: rows }, {
        columns: ['seq', 'code', 'drugName', 'batch', 'expDate'],
        extraColumns: [{ key: 'op', title: '操作', cell: function (r) { return r._opCell; } }],
        emptyText: '码清单为空——点右上「扫码选码」'
      });
    }
    return '<div class="card"><div class="card-header"><b>报损码清单</b>' +
      (d ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · 共 ' + d.codes.length + ' 个码</span>' : '') +
      (d && d.status !== '已审核' ? '<div class="ms-auto"><button class="btn btn-sm btn-primary" id="btnScan">▸ 扫码选码</button></div>' : '') +
      '</div>' + body + '</div>';
  }

  // ===== 新增损耗单 =====
  function openAdd() {
    var reasonOpts = W.LOSS_REASONS.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
    UI.modalShell('lossAdd', '新增损耗出库单',
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">损耗原因</label><select class="form-select" id="laReason">' + reasonOpts + '</select></div>' +
      '<div class="col-6"><label class="form-label required">来源</label><select class="form-select" id="laSource">' +
        W.LOSS_SOURCES.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="mb-3"><label class="form-label required">库房</label><input class="form-control" value="' + esc(curWh()) + '" disabled></div>' +
      '<div class="mb-2"><label class="form-label">情况说明</label><input class="form-control" id="laRemark" placeholder="如：搬运跌落破损 1 盒"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">盘亏差异请走「盘点管理 · 盘亏出库单」（生成后来源=盘亏转入，也入本列表）。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="laOk">保存</button>', 480);
    var el = UI.open('lossAdd');
    el.querySelector('#laOk').addEventListener('click', function () {
      var d = { billNo: W.nextNo('SHCK', S.lossDocs), date: W.now(), reason: el.querySelector('#laReason').value,
        source: el.querySelector('#laSource').value, warehouse: curWh(), remark: el.querySelector('#laRemark').value.trim(),
        status: '未审核', auditTime: '', auditor: '', codes: [] };
      S.lossDocs.unshift(d);
      sel = d.billNo;
      save(); UI.close('lossAdd'); renderAll();
      window.showToast('已创建损耗单 ' + d.billNo + '，请扫码选码');
    });
  }

  // 二期 Task B：openScan 大版面接线适配——已选码按 药品+批次 聚合成药品清单行模型（仅视图模型，不改业务）
  function scanDrugRows(d) {
    var map = {};
    d.codes.forEach(function (c) {
      var key = c.code.slice(0, 7) + '|' + c.batch;
      if (!map[key]) map[key] = { drugName: '—', formSpec: '—', batch: c.batch, qty: 0 };
      map[key].qty += 1;
      if (map[key].drugName === '—') {
        var p = P.parseCode(c.code, DICT);
        if (p.dict) { map[key].drugName = p.dict.drugName; map[key].formSpec = p.dict.formSpec || '—'; }
      }
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  // ===== 扫码选码 =====
  function openScanModal() {
    var d = selDoc();
    if (!d || d.status === '已审核') return;
    UI.openScan({
      title: '扫码选码 · ' + d.billNo,
      headerHtml: '<div class="pch-scan-fields">' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">单据类型</span>报损出库</span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">单据单号</span><b>' + esc(d.billNo) + '</b></span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">单据时间</span>' + esc(d.date) + '</span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">发货方</span>' + esc(d.warehouse) + '</span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">收货方</span>报损出库</span></div>',
      drugsRows: function () { return scanDrugRows(d); },
      drugsOptions: { columns: ['seq', 'drugName', 'formSpec', 'batch', 'qty'], emptyText: '尚未选码——扫码后自动建行' },
      hint: '扫在架追溯码加入报损清单；审核后这些码进入「已销毁」终态',
      gate: 'loss', node: curWh(),
      onScan: function (code) {
        var c = stockMap()[code];
        if (!c) return { level: 'bad', msg: '不在在架库存（未入库或已出库）' };
        if (d.codes.some(function (x) { return x.code === code; })) return { level: 'warn', msg: '重复扫码，已在清单' };
        d.codes.push(Object.assign({}, c));
        save(); renderAll();
        var p = P.parseCode(code, DICT);
        return { level: 'ok', msg: '已加入报损：' + (p.dict ? p.dict.drugName : code) };
      },
      onClose: renderAll
    });
  }

  // ===== 编辑表头（未审核：损耗原因/来源/情况说明；2026-10-03 拍板入出库退库全量补编辑） =====
  function openEdit(d) {
    UI.modalShell('lossEdit', '编辑损耗出库单 · ' + d.billNo,
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">损耗原因</label><select class="form-select" id="leReason">' +
        W.LOSS_REASONS.map(function (t) { return '<option' + (t === d.reason ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
      '<div class="col-6"><label class="form-label required">来源</label><select class="form-select" id="leSource">' +
        W.LOSS_SOURCES.map(function (s) { return '<option' + (s === d.source ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="mb-3"><label class="form-label required">库房</label><input class="form-control" value="' + esc(d.warehouse) + '" disabled></div>' +
      '<div class="mb-2"><label class="form-label">情况说明</label><input class="form-control" id="leRemark" value="' + esc(d.remark || '') + '"></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="leOk">保存</button>', 480);
    var el = UI.open('lossEdit');
    el.querySelector('#leOk').addEventListener('click', function () {
      d.reason = el.querySelector('#leReason').value;
      d.source = el.querySelector('#leSource').value;
      d.remark = el.querySelector('#leRemark').value.trim();
      save(); UI.close('lossEdit'); renderAll();
      window.showToast('已保存损耗单 ' + d.billNo);
    });
  }

  // ===== 重确认审核（终态警示） =====
  function openAudit(d) {
    if (!W.assertUnfrozen(curWh())) return;
    if (!d.codes.length) { window.showToast('请先扫码选码'); return; }
    UI.confirm('<span class="text-danger"><b>⚠ 终态操作，不可恢复</b></span><div style="margin-top:8px;">审核 <b>' + esc(d.billNo) + '</b>（' + esc(d.reason) + ' / ' + esc(d.source) + '）后，' +
      d.codes.length + ' 个码进入<b>「已销毁」终态</b>：从在架永久扣除，<span class="text-danger">不可反审核、不可恢复</span>。</div>',
      function () {
        d.status = '已审核'; d.auditTime = W.now(); d.auditor = curUser().name || '演示员';
        save(); renderAll();
        window.showToast('已审核：' + d.codes.length + ' 个码进入已销毁终态');
      }, '确认销毁');
  }

  function renderAll() {
    content.innerHTML = filterBar() + docsCard() + codesCard();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { reason: v('fReason'), source: v('fSource'), kw: v('fKw') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { reason: '全部', source: '全部', kw: '' };
      renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', openAdd);
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-audit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-audit');
        var d = null;
        S.lossDocs.forEach(function (x) { if (x.billNo === no) d = x; });
        if (d) { sel = no; openAudit(d); }
      });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-edit');
        var d = null;
        S.lossDocs.forEach(function (x) { if (x.billNo === no) d = x; });
        if (d) { sel = no; openEdit(d); }
      });
    });
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = selDoc();
        if (!d) return;
        d.codes = d.codes.filter(function (c) { return c.code !== b.getAttribute('data-del'); });
        save(); renderAll();
      });
    });
    var bs = document.getElementById('btnScan');
    if (bs) bs.addEventListener('click', openScanModal);
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  // 深链：损耗明细查询 ?billNo= 预定位
  var q = new URLSearchParams(window.location.search).get('billNo');
  if (q && S.lossDocs.some(function (d) { return d.billNo === q; })) sel = q;
  else if (S.lossDocs.length) sel = S.lossDocs[0].billNo;
  renderAll();
})();
