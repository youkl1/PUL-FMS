/**
 * wh-other-out.js — 其他出库：无下游单据的通用出库（借出/样品/其他）
 * 扫码选在架码（非在架硬拦截，同采购退货「无库存码」模式）；审核后码出库房（终态扣减）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'othOut', crumb: ['库房管理', '库房业务', '其他出库'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load(), PS = P.load();
  var DICT = D.flat(DS);
  var sel = null;
  var filters = { type: '全部', kw: '' };

  function save() { W.save(S); }
  function curUser() { return window.store.load().currentUser || {}; }
  function curWh() { return curUser().warehouse || '中心库'; }
  function stockMap() {
    var m = {};
    W.stockAll(PS, S, curWh()).forEach(function (c) { m[c.code] = c; });
    return m;
  }
  function selDoc() {
    for (var i = 0; i < S.othOutDocs.length; i++) if (S.othOutDocs[i].billNo === sel) return S.othOutDocs[i];
    return null;
  }
  function filtered() {
    return S.othOutDocs.filter(function (d) {
      if (filters.type !== '全部' && d.type !== filters.type) return false;
      if (filters.kw && d.billNo.indexOf(filters.kw) === -1) return false;
      return true;
    });
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fType" style="width:120px;">' +
        ['全部'].concat(W.OTH_OUT_TYPES).map(function (o) { return opt(filters.type, o, o === '全部' ? '出库类型' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fKw" style="width:170px;" placeholder="单据编号" value="' + esc(filters.kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增出库单</button></div>' +
      '</div></div></div>';
  }

  function docsCard() {
    var list = filtered();
    var rowsHtml = list.map(function (d) {
      var audited = d.status === '已审核';
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td><b>' + esc(d.billNo) + '</b></td><td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td><span class="badge bg-orange-lt">' + esc(d.type) + '</span></td>' +
        '<td>' + esc(d.receiver || '—') + '</td><td>' + esc(d.warehouse) + '</td><td>' + d.codes.length + '</td>' +
        '<td>' + (audited ? UI.light('已审核') : '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>未审核</span>') + '</td>' +
        '<td onclick="event.stopPropagation()">' + (audited
          ? '<span class="text-secondary" style="font-size:12.5px;">' + esc(d.auditor || '') + '</span>'
          : '<button class="btn btn-sm btn-success" data-audit="' + esc(d.billNo) + '"' + (d.codes.length ? '' : ' disabled title="请先扫码选码"') + '>审核出库</button>') + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">暂无出库单——点右上「新增出库单」</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>单据编号</th><th>日期</th><th>出库类型</th><th>接收方</th><th>库房</th><th>码数</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' +
      '<div class="card-footer" style="font-size:12.5px;"><span class="text-secondary">共 ' + list.length + ' 条 · 审核后码出库房（终态）；借出归还请走「其他入库」回补</span></div></div>';
  }

  // 码清单卡（未审核单可扫码/移除）
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
          '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td><td>' + esc(c.location || '—') + '</td>' +
          (d.status === '已审核' ? '<td class="text-secondary">—</td>'
            : '<td><button class="btn btn-sm btn-outline-danger" data-del="' + esc(c.code) + '">移除</button></td>') + '</tr>';
      }).join('');
      if (!d.codes.length) rowsHtml = '<tr><td colspan="7" class="text-center text-secondary" style="padding:24px;">码清单为空——点右上「扫码选码」</td></tr>';
      body = '<div class="table-responsive" style="max-height:340px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>库位</th><th>操作</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>码清单</b>' +
      (d ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · 共 ' + d.codes.length + ' 个码</span>' : '') +
      (d && d.status !== '已审核' ? '<div class="ms-auto"><button class="btn btn-sm btn-primary" id="btnScan">▸ 扫码选码</button></div>' : '') +
      '</div>' + body + '</div>';
  }

  // ===== 新增出库单 =====
  function openAdd() {
    var typeOpts = W.OTH_OUT_TYPES.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
    UI.modalShell('othOutAdd', '新增其他出库单',
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">出库类型</label><select class="form-select" id="obType">' + typeOpts + '</select></div>' +
      '<div class="col-6"><label class="form-label required">接收方</label><input class="form-control" id="obReceiver" placeholder="如 药事会 / 某科室"></div></div>' +
      '<div class="mb-3"><label class="form-label required">库房</label><input class="form-control" value="' + esc(curWh()) + '" disabled></div>' +
      '<div class="mb-2"><label class="form-label">备注</label><input class="form-control" id="obRemark"></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="obOk">保存</button>', 480);
    var el = UI.open('othOutAdd');
    el.querySelector('#obOk').addEventListener('click', function () {
      var receiver = el.querySelector('#obReceiver').value.trim();
      if (!receiver) { window.showToast('接收方为必填项'); return; }
      var d = { billNo: W.nextNo('QTCK', S.othOutDocs), date: W.now(), type: el.querySelector('#obType').value,
        receiver: receiver, warehouse: curWh(), remark: el.querySelector('#obRemark').value.trim(),
        status: '未审核', auditTime: '', auditor: '', codes: [] };
      S.othOutDocs.unshift(d);
      sel = d.billNo;
      save(); UI.close('othOutAdd'); renderAll();
      window.showToast('已创建出库单 ' + d.billNo + '，请扫码选码');
    });
  }

  // ===== 扫码选码（在架码√加入 / 非在架×拦截） =====
  function openScanModal() {
    var d = selDoc();
    if (!d || d.status === '已审核') return;
    UI.openScan({
      title: '扫码选码 · ' + d.billNo,
      hint: '扫在架追溯码加入出库单；非在架码（未入库/已出库/在途）拦截',
      gate: 'out', node: curWh(),
      onScan: function (code) {
        var c = stockMap()[code];
        if (!c) return { level: 'bad', msg: '不在在架库存（未入库或已出库）' };
        if (d.codes.some(function (x) { return x.code === code; })) return { level: 'warn', msg: '重复扫码，已在清单' };
        d.codes.push(Object.assign({}, c));
        save(); renderAll();
        var p = P.parseCode(code, DICT);
        return { level: 'ok', msg: '已加入：' + (p.dict ? p.dict.drugName : code) };
      },
      onClose: renderAll
    });
  }

  // ===== 审核出库 =====
  function openAudit(d) {
    if (!W.assertUnfrozen(curWh())) return;
    if (!d.codes.length) { window.showToast('请先扫码选码'); return; }
    UI.confirm('审核出库 <b>' + esc(d.billNo) + '</b>（' + esc(d.type) + ' → ' + esc(d.receiver || '') + '）？共 ' + d.codes.length + ' 个码出库房。' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:6px;">审核后码从在架扣除（终态），库房库存即时扣减。</div>',
      function () {
        d.status = '已审核'; d.auditTime = W.now(); d.auditor = curUser().name || '演示员';
        save(); renderAll();
        window.showToast('已审核出库，' + d.codes.length + ' 个码出库房');
      }, '审核出库');
  }

  function renderAll() {
    content.innerHTML = filterBar() + docsCard() + codesCard();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { type: v('fType'), kw: v('fKw') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { type: '全部', kw: '' };
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
        S.othOutDocs.forEach(function (x) { if (x.billNo === no) d = x; });
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

  if (S.othOutDocs.length) sel = S.othOutDocs[0].billNo;
  renderAll();
})();
