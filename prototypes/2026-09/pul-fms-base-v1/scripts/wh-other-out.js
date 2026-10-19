/**
 * wh-other-out.js — 其他出库单：无下游单据的通用出库（借出/样品/其他）
 * 2026-10-10 Round BC：列表与明细对齐采购到货单/其他入库单——
 *   列表：实物数量(=码总数)/解析数量(=解析成功数)/扫码数量(=已核对数) 三列 + 审核状态列
 *   明细：双卡工作台收进单卡双页签（码详情=逐码+核对进度条+审核钮 / 药品清单=应出 vs 已核对）
 *   核对态：c.checked 落码记录持久化（原会话 map 切单清空 → 现刷新/切单可续作；选在架码加入时强制未核对）
 *   审核：守卫=无码→未核对完硬拦 → P2 审核表单（出库库房确认，对齐采购到货单形态）→ 冻结硬拦 → 码出库房（终态）
 * 2026-10-18 Task4：明细双页签迁移 PulDocDetail 共享组件（renderTabs/bind；码行「移除」走 removeCode 注册操作，底部进度条+审核钮经 footerHtml，监听接 id 不变）
 * 流程：选在架码入清单（预占，其他未审核出库单不可再选）→ 扫码核对实物 → 全部核对完成才能审核出库
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'othOut', crumb: ['库房管理', '其他出库单', '其他出库单'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), PS = P.load();
  var DICT = D.flat(D.load());
  var sel = null, tab = 'codes';
  var filters = { code: '', kw: '', receiver: '', type: '全部', status: '全部', dateFrom: '', dateTo: '' };
  var qsBill = new URLSearchParams(location.search).get('billNo');   // 出库明细查询深链
  if (qsBill) { sel = qsBill; filters.kw = qsBill; }

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
  function drugNameOf(code20) {
    var p = P.parseCode(code20, DICT);
    return p.dict ? p.dict.drugName : '未解析';
  }
  // 已预占码：任何未审核其他出库单内的码 → 不可再选（一码不能同时进两张出库单，同退回单口径）
  function occupiedSet() {
    var m = {};
    (S.othOutDocs || []).forEach(function (d) {
      if (d.status !== '未审核') return;
      (d.codes || []).forEach(function (c) { m[c.code] = 1; });
    });
    return m;
  }
  // 可选在架码 = 本库在架 - 已预占
  function pickableCodes() {
    var occ = occupiedSet();
    return W.stockAll(PS, S, curWh()).filter(function (c) { return !occ[c.code]; });
  }
  // ===== 三数量列（口径对齐采购到货单；出库码全部来自在架=必已解析，解析数量恒=实物数量，列仅为跨页对齐） =====
  function checkedCount(d) { return d.codes.filter(function (c) { return c.checked; }).length; }
  function parsedCount(d) {
    return d.codes.filter(function (c) { return P.parseCode(c.code, DICT).dict; }).length;
  }
  function filtered() {
    return S.othOutDocs.filter(function (d) {
      if (filters.type !== '全部' && d.type !== filters.type) return false;
      if (filters.status !== '全部' && d.status !== filters.status) return false;
      if (filters.kw && d.billNo.indexOf(filters.kw) === -1) return false;
      if (filters.receiver && (d.receiver || '').indexOf(filters.receiver) === -1) return false;
      if (filters.code && !(d.codes || []).some(function (c) { return c.code.indexOf(filters.code) !== -1; })) return false;
      if (filters.dateFrom && d.date.slice(0, 10) < filters.dateFrom) return false;
      if (filters.dateTo && d.date.slice(0, 10) > filters.dateTo) return false;
      return true;
    });
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fCode" style="width:160px;" placeholder="药品追溯码" value="' + esc(filters.code) + '">' +
      '<input class="form-control" id="fKw" style="width:150px;" placeholder="单据编号" value="' + esc(filters.kw) + '">' +
      '<input class="form-control" id="fReceiver" style="width:150px;" placeholder="接收方" value="' + esc(filters.receiver) + '">' +
      '<select class="form-select" id="fType" style="width:110px;">' +
        ['全部'].concat(W.OTH_OUT_TYPES).map(function (o) { return opt(filters.type, o, o === '全部' ? '出库类型' : o); }).join('') + '</select>' +
      '<select class="form-select" id="fStatus" style="width:100px;">' +
        ['全部', '未审核', '已审核'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fFrom" type="date" style="width:140px;" value="' + filters.dateFrom + '">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fTo" type="date" style="width:140px;" value="' + filters.dateTo + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增出库单</button></div>' +
      '</div></div></div>';
  }

  // ===== 单据列表（数量三列相邻 + 审核状态列，2026-10-10 对齐采购到货单） =====
  function docsCard() {
    var list = filtered();
    var rowsHtml = list.map(function (d, i) {
      var audited = d.status === '已审核';
      // TODO(light): 待 PchUI.light 扩展收编琥珀色
      var stCell = audited ? UI.light('已审核')
        : '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>未审核</span>';
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(d.billNo) + '</b></td><td>其它出库</td><td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td><span class="badge bg-orange-lt">' + esc(d.type) + '</span></td>' +
        '<td>' + esc(d.receiver || '—') + '</td><td>' + esc(d.warehouse) + '</td>' +
        '<td>' + d.codes.length + '</td><td>' + parsedCount(d) + '</td><td>' + checkedCount(d) + '</td>' +
        '<td>' + stCell + '</td>' +
        '<td onclick="event.stopPropagation()"><div class="btn-list">' + (audited
          ? '<span class="text-secondary" style="font-size:12.5px;">' + esc(d.auditor || '') + '</span>'
          : '<button class="btn btn-sm btn-outline-primary" data-scan="' + esc(d.billNo) + '">扫码核对</button>' +
            '<button class="btn btn-sm btn-primary" data-audit="' + esc(d.billNo) + '"' + (d.codes.length ? '' : ' disabled title="请先在架选码"') + '>审核出库</button>' +
            '<button class="btn btn-sm btn-outline-secondary" data-edit="' + esc(d.billNo) + '">编辑</button>' +
            '<button class="btn btn-sm btn-outline-danger" data-deldoc="' + esc(d.billNo) + '">删除</button>') + '</div></td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="12" class="text-center text-secondary" style="padding:28px;">暂无出库单——点右上「新增出库单」</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据类型</th><th>日期</th><th>出库类型</th><th>接收方</th><th>库房</th><th>实物数量</th><th>解析数量</th><th>扫码数量</th><th>审核</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // ===== 出库明细双页签：原业务计算 → PulDocDetail 标准 model/options → 公共组件渲染 =====
  // 码详情=逐码机器事实（核对态落 c.checked，持久化可续作）/ 药品清单=人读汇总（应出 vs 已核对，按 标识码+批次 聚合）
  var detailModel = { drugs: [], codes: [], bad: [], activeTab: tab, empty: true };
  function detailCard() {
    var d = selDoc();
    var draft = !!d && d.status !== '已审核';
    detailModel = d ? { drugs: drugsPanel(d), codes: codesPanel(d, draft), bad: [], activeTab: tab }
      : { drugs: [], codes: [], bad: [], activeTab: tab, empty: true };
    // 卡尾（未审核）：核对进度条 + 审核出库钮（全部核对完成才放行的 disabled 语义保留，原监听接 id 不变）
    var footerHtml = '';
    if (d && draft) {
      var done = checkedCount(d), all = d.codes.length;
      footerHtml = '<div class="pch-tabbar">' +
        '<div class="pch-progress"><i style="width:' + (all ? Math.round(done / all * 100) : 0) + '%;"></i></div>' +
        '<span class="pch-progress-txt">已核对 ' + done + ' / ' + all + '</span>' +
        '<div class="ms-auto"><button class="btn btn-success" id="btnAudit"' + (all && done === all ? '' : ' disabled title="全部核对完成才能审核出库"') + '>✓ 审核出库</button></div>' +
        '</div>';
    }
    return window.PulDocDetail.renderTabs(detailModel, {
      title: '出库明细',
      metaHtml: d ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · 共 ' + d.codes.length + ' 个码 · 已核对 ' + checkedCount(d) + '/' + d.codes.length + (draft ? '' : ' · 已审核') + '</span>' +
        (draft ? '<div class="ms-auto"><button class="btn btn-sm btn-outline-primary" id="btnPick">☰ 选在架码</button></div>' : '') : '',
      emptyText: '点选上方出库单，查看明细',
      tabs: ['codes', 'drugs'],
      counts: { codes: 'rows' },
      codes: {
        // 码表公共 12 列子集（旧 8 列口径列名按组件标准收敛：追溯码→药品追溯码、效期→有效期至；未审核带「移除」操作列）
        columns: draft ? ['seq', 'code', 'drugName', 'batch', 'expDate', 'location', 'checkStatus', 'actions']
                       : ['seq', 'code', 'drugName', 'batch', 'expDate', 'location', 'checkStatus'],
        emptyText: '码清单为空——用「选在架码」勾选，或行内「扫码核对」逐码扫入'
      },
      drugs: {
        // 药品公共列 + 「应出 / 已核对」两个页面专属聚合列（extraColumns 表达，应出 vs 已核对逻辑不动）
        columns: ['seq', 'drugName', 'formSpec', 'batch'],
        extraColumns: [
          { key: 'planQty', title: '应出', cell: function (row) { return '<b>' + row.qty + '</b>'; } },
          { key: 'doneQty', title: '已核对', cell: function (row) {
              if (!draft) return '<span class="text-secondary">—</span>';
              return '<b class="' + (row.raw.done === row.raw.qty ? 'text-success' : 'text-warning') + '">' + row.raw.done + '</b>';
            } }
        ],
        emptyText: '暂无药品'
      },
      footerHtml: footerHtml
    });
  }

  // 码详情行适配：逐码机器事实 → 组件标准 model（核对态落 c.checked；已审核只读、核对列显 —）
  function codesPanel(d, draft) {
    return d.codes.map(function (c) {
      var ck = !!c.checked;
      return {
        raw: c,
        className: ck && draft ? 'pch-row-picked' : '',
        code: c.code,
        drugName: drugNameOf(c.code),
        batch: c.batch,
        expDate: c.expDate,
        location: c.location || '',
        status: draft ? { kind: ck ? 'done' : 'todo', text: ck ? '✓ 已核对' : '未核对' } : null,
        actions: draft ? ['removeCode'] : []
      };
    });
  }

  // 药品清单行适配 = 人读汇总（应出 vs 已核对；按 标识码+批次 聚合，原聚合逻辑不动）
  function drugsPanel(d) {
    var map = {};
    d.codes.forEach(function (c) {
      var key = c.code.slice(0, 7) + '|' + c.batch;
      if (!map[key]) map[key] = { code: c, qty: 0, done: 0 };
      map[key].qty += 1;
      if (c.checked) map[key].done += 1;
    });
    return Object.keys(map).map(function (k) {
      var g = map[k], p = P.parseCode(g.code.code, DICT), dd = p.dict || {};
      return { raw: g, drugName: dd.drugName || '未解析', formSpec: dd.formSpec || '-', batch: g.code.batch, qty: g.qty };
    });
  }

  // ===== 新增出库单 =====
  function openAdd() {
    var typeOpts = W.OTH_OUT_TYPES.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
    UI.modalShell('othOutAdd', '新增其他出库单',
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">出库类型</label><select class="form-select" id="obType">' + typeOpts + '</select></div>' +
      '<div class="col-6"><label class="form-label required">接收方</label><input class="form-control" id="obReceiver" placeholder="如 药事会 / 某科室"></div></div>' +
      '<div class="mb-3"><label class="form-label required">库房</label><input class="form-control" value="' + esc(curWh()) + '" disabled></div>' +
      '<div class="mb-2"><label class="form-label">备注</label><input class="form-control" id="obRemark"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">创建后用「选在架码」勾选要出的码（选入即预占），再扫码核对实物（核对进度落码记录，刷新可续作），全部核对完成才能审核出库。</div>',
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
      sel = d.billNo; tab = 'codes';
      save(); UI.close('othOutAdd'); renderAll();
      window.showToast('已创建出库单 ' + d.billNo + '，请用「选在架码」加入要出的码');
    });
  }

  // ===== 选在架码：本库在架码勾选入清单（排除本单已有 + 其他未审核出库单已预占；加入一律未核对，待扫码核对） =====
  function openPickModal() {
    var d = selDoc();
    if (!d || d.status === '已审核') return;
    var inDoc = {};
    d.codes.forEach(function (c) { inDoc[c.code] = 1; });
    var avail = pickableCodes().filter(function (c) { return !inDoc[c.code]; });
    var rows = avail.map(function (c) {
      return '<tr><td><input class="form-check-input" type="checkbox" data-pk="' + esc(c.code) + '"></td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(drugNameOf(c.code)) + '</b></td>' +
        '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td><td>' + esc(c.location || '—') + '</td></tr>';
    }).join('');
    if (!avail.length) rows = '<tr><td colspan="6" class="text-center text-secondary" style="padding:24px;">本库在架没有更多可选的码（在架码可能已被其他未审核出库单预占）</td></tr>';
    UI.modalShell('othOutPick', '选在架码 · ' + d.billNo,
      '<div class="text-secondary mb-2" style="font-size:12.5px;">' + esc(curWh()) + ' 在架可选码（选入即预占，其他出库单不可再选）：</div>' +
      '<div class="table-responsive" style="max-height:320px;overflow-y:auto;"><table class="table table-vcenter table-sm card-table">' +
      '<thead><tr><th></th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>库位</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      (avail.length ? '<button class="btn btn-primary" id="pkOk">加入清单</button>' : ''), 760);
    var el = UI.open('othOutPick');
    var ok = el.querySelector('#pkOk');
    if (!ok) return;
    ok.addEventListener('click', function () {
      var pool = {};
      avail.forEach(function (c) { pool[c.code] = c; });
      var added = 0;
      el.querySelectorAll('[data-pk]:checked').forEach(function (cb) {
        var c = pool[cb.getAttribute('data-pk')];
        if (c && !inDoc[c.code]) { d.codes.push(Object.assign({}, c, { checked: false })); inDoc[c.code] = 1; added++; }
      });
      if (!added) { window.showToast('请先勾选要加入的在架码'); return; }
      save(); UI.close('othOutPick'); renderAll();
      window.showToast('已加入 ' + added + ' 个码，请扫码核对实物');
    });
  }

  // ===== 扫码核对：单内码√已核对（落 c.checked 持久化）/ 在架未入清单⚠提示选在架码 / 非在架×拦截；弹窗附「✓ 直接审核」 =====
  function openScanModal() {
    var d = selDoc();
    if (!d || d.status === '已审核') return;
    UI.openScan({
      title: '扫码核对 · ' + d.billNo,
      headerHtml: '<div class="pch-scan-fields">' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">单据类型</span>其它出库</span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">单据单号</span><b>' + esc(d.billNo) + '</b></span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">单据时间</span>' + esc(d.date) + '</span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">发货方</span>' + esc(d.warehouse) + '</span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">收货方</span>' + esc(d.receiver || '—') + '</span></div>',
      drugsRows: function () { return drugsPanel(d); },   // 复用药品清单页签同聚合（标识码+批次，应出 vs 已核对）
      drugsOptions: {
        columns: ['seq', 'drugName', 'formSpec', 'batch', 'qty'],
        extraColumns: [{ key: 'doneQty', title: '已核对', cell: function (row) { return '<b>' + row.raw.done + '</b>'; } }],
        emptyText: '暂无药品'
      },
      hint: '扫出库实物码：清单内码标记已核对（进度落码记录，刷新可续作）；在架但未入清单的码请用「选在架码」加入；非在架码拦截；核对完可点「直接审核」',
      gate: 'out', node: curWh(),
      onScan: function (code) {
        var inList = null;
        d.codes.forEach(function (c) { if (c.code === code) inList = c; });
        if (!inList) {
          if (stockMap()[code]) return { level: 'warn', msg: '该码在架但未入清单——请用「选在架码」加入清单' };
          return { level: 'bad', msg: '不在在架库存（未入库或已出库），禁止出库' };
        }
        if (inList.checked) return { level: 'warn', msg: '重复扫码，已核对' };
        inList.checked = true;
        save(); renderAll();
        return { level: 'ok', msg: drugNameOf(code) + ' 已核对（' + checkedCount(d) + '/' + d.codes.length + '）' };
      },
      onAudit: function () { auditFlow(d); },   // 弹窗内「✓ 直接审核」（公约 §2.2 审核附随扫码）
      onClose: function () { save(); renderAll(); }
    });
  }

  // ===== 编辑表头（未审核：出库类型/接收方/备注；2026-10-03 拍板入出库退库全量补编辑） =====
  function openEdit(d) {
    var typeOpts = W.OTH_OUT_TYPES.map(function (t) { return '<option' + (t === d.type ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('');
    UI.modalShell('othOutEdit', '编辑其他出库单 · ' + d.billNo,
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">出库类型</label><select class="form-select" id="ooType">' + typeOpts + '</select></div>' +
      '<div class="col-6"><label class="form-label required">接收方</label><input class="form-control" id="ooReceiver" value="' + esc(d.receiver || '') + '"></div></div>' +
      '<div class="mb-3"><label class="form-label required">库房</label><input class="form-control" value="' + esc(d.warehouse) + '" disabled></div>' +
      '<div class="mb-2"><label class="form-label">备注</label><input class="form-control" id="ooRemark" value="' + esc(d.remark || '') + '"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">码清单用「选在架码 / 扫码核对 / 移除」调整。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="ooOk">保存</button>', 480);
    var el = UI.open('othOutEdit');
    el.querySelector('#ooOk').addEventListener('click', function () {
      var receiver = el.querySelector('#ooReceiver').value.trim();
      if (!receiver) { window.showToast('接收方为必填项'); return; }
      d.type = el.querySelector('#ooType').value;
      d.receiver = receiver;
      d.remark = el.querySelector('#ooRemark').value.trim();
      save(); UI.close('othOutEdit'); renderAll();
      window.showToast('已保存出库单 ' + d.billNo);
    });
  }

  // ===== 审核出库（对齐采购到货单形态）：守卫=无码→未核对完硬拦 → P2 审核表单（出库库房确认）→ 冻结硬拦 → 码出库房（终态）
  // Round CD：拦截弹窗化（PchUI.auditBlock 收编共享，对齐采购域口径） =====
  function auditFlow(d) {
    if (!d) { window.showToast('请先选择一张出库单'); return; }
    if (d.status === '已审核') { window.showToast('该出库单已审核'); return; }
    if (!d.codes.length) {
      UI.auditBlock(d.billNo, '码清单为空，不允许审核', '先用「选在架码」或扫码加入要出的码。', { label: '选在架码', fn: function () { openPickModal(); } });
      return;
    }
    var done = checkedCount(d);
    if (done < d.codes.length) {
      UI.auditBlock(d.billNo, '还有 ' + (d.codes.length - done) + ' 个码未扫码核对，不允许审核',
        '全部核对通过后才可审核出库；找不到的码请先「移除」。',
        { label: '去扫码核对', fn: function () { openScanModal(); } });
      return;
    }
    openAudit(d);
  }

  function openAudit(d) {
    UI.modalShell('othOutAudit', '审核出库 · ' + d.billNo,
      '<div class="text-secondary" style="font-size:12.5px;margin-bottom:10px;">' + esc(d.type) + ' → ' + esc(d.receiver || '') +
        ' · 共 <b>' + d.codes.length + '</b> 个码（实物 ' + d.codes.length + ' · 扫码核对 ' + checkedCount(d) + '/' + d.codes.length + '）；' +
        '审核后码从在架扣除（终态），库房库存查询即时扣减，不可反审核。</div>' +
      '<div class="mb-2"><label class="form-label required">出库库房</label><input class="form-control" value="' + esc(d.warehouse) + '" disabled></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-success" id="auOk">✓ 确定审核出库</button>', 480);
    var el = UI.open('othOutAudit');
    el.querySelector('#auOk').addEventListener('click', function () {
      if (!W.assertUnfrozen(d.warehouse)) return;
      d.status = '已审核'; d.auditTime = W.now(); d.auditor = curUser().name || '演示员';
      save(); UI.close('othOutAudit'); renderAll();
      window.showToast('已审核出库，' + d.codes.length + ' 个码出库房');
    });
  }

  function renderAll() {
    DICT = D.flat(D.load());
    content.innerHTML = filterBar() + docsCard() + detailCard();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { code: v('fCode'), kw: v('fKw'), receiver: v('fReceiver'), type: v('fType'),
        status: v('fStatus'), dateFrom: v('fFrom'), dateTo: v('fTo') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { code: '', kw: '', receiver: '', type: '全部', status: '全部', dateFrom: '', dateTo: '' };
      renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', openAdd);
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    // 明细页签与码行级移除统一走 PulDocDetail.bind（替代原页签行/码删除两个旧监听；公约 §4.3：移除不弹确认）
    window.PulDocDetail.bind(content, {
      model: detailModel,
      onTab: function (key) { tab = key; renderAll(); },
      actions: {
        removeCode: function (ctx) {
          var d = selDoc();
          if (!d || d.status === '已审核') return;
          var code = ctx.row.raw.code;
          d.codes = d.codes.filter(function (c) { return c.code !== code; });
          save(); renderAll();
        }
      }
    });
    content.querySelectorAll('[data-audit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-audit');
        S.othOutDocs.forEach(function (d) { if (d.billNo === no) { sel = no; auditFlow(d); } });
      });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-edit');
        S.othOutDocs.forEach(function (d) { if (d.billNo === no) { sel = no; openEdit(d); } });
      });
    });
    content.querySelectorAll('[data-scan]').forEach(function (b) {
      b.addEventListener('click', function () { sel = b.getAttribute('data-scan'); openScanModal(); });
    });
    content.querySelectorAll('[data-deldoc]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-deldoc');
        UI.confirm('确定删除出库单 <b>' + esc(no) + '</b>？未审核单未扣账，删除后预占码释放回在架可选。', function () {
          S.othOutDocs = S.othOutDocs.filter(function (x) { return x.billNo !== no; });
          if (sel === no) sel = null;
          save(); renderAll();
          window.showToast('已删除出库单 ' + no);
        }, '删除');
      });
    });
    var bp = document.getElementById('btnPick');
    if (bp) bp.addEventListener('click', openPickModal);
    var ba = document.getElementById('btnAudit');
    if (ba) ba.addEventListener('click', function () { var d = selDoc(); if (d) auditFlow(d); });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  if (S.othOutDocs.length && !sel) sel = S.othOutDocs[0].billNo;
  renderAll();
})();
