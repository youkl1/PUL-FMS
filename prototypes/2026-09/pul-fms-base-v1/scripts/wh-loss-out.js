/**
 * wh-loss-out.js — 损耗出库单：报损出库（码 → 已销毁，终态分支）
 * 损耗原因字典（破损/过期/污染/其他）+ 来源列（日常报损/盘亏转入/数据迁移，Q1 拍板口径）
 * 重确认审核：终态不可反审核；支持 ?billNo= 深链预定位（损耗明细查询下钻入口）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'lossOut', crumb: ['库房管理', '库房业务', '损耗出库单'] });
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
        '<td><b>' + esc(d.billNo) + '</b></td><td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td><span class="badge bg-red-lt">' + esc(d.reason) + '</span></td>' +
        '<td><span class="badge ' + (d.source === '日常报损' ? 'bg-blue-lt' : (d.source === '盘亏转入' ? 'bg-orange-lt' : 'bg-secondary-lt')) + '">' + esc(d.source) + '</span></td>' +
        '<td>' + esc(d.warehouse) + '</td><td>' + d.codes.length + '</td>' +
        '<td class="text-secondary">' + esc(d.remark || '—') + '</td>' +
        '<td>' + (audited ? '<span class="pch-light mute"><i class="pch-dot"></i>已销毁</span>' : '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>未审核</span>') + '</td>' +
        '<td onclick="event.stopPropagation()">' + (audited
          ? '<span class="text-secondary" style="font-size:12.5px;">' + esc(d.auditor || '') + '</span>'
          : '<button class="btn btn-sm btn-danger" data-audit="' + esc(d.billNo) + '"' + (d.codes.length ? '' : ' disabled title="请先扫码选码"') + '>审核销毁</button>') + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="9" class="text-center text-secondary" style="padding:28px;">暂无损耗单</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>单据编号</th><th>日期</th><th>损耗原因</th><th>来源</th><th>库房</th><th>码数</th><th>情况说明</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' +
      '<div class="card-footer" style="font-size:12.5px;"><span class="text-secondary">共 ' + list.length + ' 条 · 审核=码进「已销毁」终态，不可反审核、不可恢复</span></div></div>';
  }

  // 码清单卡
  function codesCard() {
    var d = selDoc();
    var body;
    if (!d) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点选单据行，查看码清单</div>';
    } else {
      var rowsHtml = d.codes.map(function (c, i) {
        var p = P.parseCode(c.code, DICT);
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
          '<td><b>' + esc(p.dict ? p.dict.drugName : '未解析') + '</b></td>' +
          '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td>' +
          (d.status === '已审核' ? '<td class="text-secondary">—</td>'
            : '<td><button class="btn btn-sm btn-outline-danger" data-del="' + esc(c.code) + '">移除</button></td>') + '</tr>';
      }).join('');
      if (!d.codes.length) rowsHtml = '<tr><td colspan="6" class="text-center text-secondary" style="padding:24px;">码清单为空——点右上「扫码选码」</td></tr>';
      body = '<div class="table-responsive" style="max-height:320px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>操作</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>';
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
      '<div class="text-secondary" style="font-size:12.5px;">盘亏差异请走「盘点管理 · 盘亏出库」（生成后来源=盘亏转入，也入本列表）。</div>',
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

  // ===== 扫码选码 =====
  function openScanModal() {
    var d = selDoc();
    if (!d || d.status === '已审核') return;
    UI.openScan({
      title: '扫码选码 · ' + d.billNo,
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
