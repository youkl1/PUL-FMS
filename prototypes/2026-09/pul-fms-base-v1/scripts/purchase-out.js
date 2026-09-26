/**
 * purchase-out.js — 采购退货：从库房在架码扫码选码 → 审核回退「供应商在途」
 * 字段对齐老系统：单据编号/供应商/库房/状态/审核时间 + 码详情(含库位)/药品清单/无库存码
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pout', crumb: ['库房管理', '采购管理', '采购退货'] });
  if (!content) return;

  var P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = P.load();
  var sel = null, tab = 'codes';
  var filters = { code: '', billNo: '', supplier: '', type: '全部', status: '全部', dateFrom: '', dateTo: '' };

  function save() { P.save(S); }
  function now() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function selDoc() {
    for (var i = 0; i < S.outDocs.length; i++) if (S.outDocs[i].billNo === sel) return S.outDocs[i];
    return null;
  }
  function filtered() {
    return S.outDocs.filter(function (d) {
      if (filters.billNo && d.billNo.indexOf(filters.billNo) === -1) return false;
      if (filters.supplier && d.supplier.indexOf(filters.supplier) === -1) return false;
      if (filters.type !== '全部' && d.type !== filters.type) return false;
      if (filters.status !== '全部' && d.status !== filters.status) return false;
      if (filters.code && !(d.codes || []).some(function (c) { return c.code.indexOf(filters.code) > -1; })) return false;
      if (filters.dateFrom && d.date.slice(0, 10) < filters.dateFrom) return false;
      if (filters.dateTo && d.date.slice(0, 10) > filters.dateTo) return false;
      return true;
    });
  }

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fCode" style="width:180px;" placeholder="药品追溯码" value="' + esc(filters.code) + '">' +
      '<input class="form-control" id="fBillNo" style="width:150px;" placeholder="单据编号" value="' + esc(filters.billNo) + '">' +
      '<input class="form-control" id="fSupplier" style="width:160px;" placeholder="供应商" value="' + esc(filters.supplier) + '">' +
      '<select class="form-select" id="fType" style="width:110px;">' +
        ['全部', '库房退货', '到货退货'].map(function (o) { return '<option' + (filters.type === o ? ' selected' : '') + '>' + (o === '全部' ? '全部类型' : o) + '</option>'; }).join('') + '</select>' +
      '<select class="form-select" id="fStatus" style="width:100px;">' +
        ['全部', '未审核', '已审核'].map(function (o) { return '<option' + (filters.status === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>' +
      '<input class="form-control" id="fDateFrom" type="date" style="width:150px;" value="' + filters.dateFrom + '">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fDateTo" type="date" style="width:150px;" value="' + filters.dateTo + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增</button></div>' +
      '</div></div></div>';
  }

  function docTable() {
    var list = filtered();
    var rows = list.map(function (d, i) {
      var ro = d.status === '已审核';
      var isArr = d.type === '到货退货';
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(d.billNo) + '</b></td>' +
        '<td>' + (isArr ? '<span class="badge bg-orange-lt">到货退货</span>' : '<span class="badge bg-blue-lt">库房退货</span>') + '</td>' +
        '<td class="text-secondary">' + esc(d.refOrder || '—') + '</td>' +
        '<td class="text-secondary">' + esc(d.date) + '</td><td>' + esc(d.supplier) + '</td>' +
        '<td>' + esc(d.warehouse) + '</td><td>' + UI.light(d.status) + '</td>' +
        '<td class="text-secondary">' + esc(d.auditTime || '—') + '</td>' +
        '<td><div class="btn-list" onclick="event.stopPropagation()">' +
          (isArr ? '' : '<button class="btn btn-sm btn-outline-primary" data-scan="' + esc(d.billNo) + '"' + (ro ? ' disabled' : '') + '>扫码</button>') +
          '<button class="btn btn-sm btn-outline-success" data-audit="' + esc(d.billNo) + '"' + (ro ? ' disabled' : '') + '>审核</button>' +
          '<button class="btn btn-sm btn-outline-danger" data-del="' + esc(d.billNo) + '"' + (ro ? ' disabled' : '') + '>删除</button>' +
        '</div></td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="10" class="text-center text-secondary" style="padding:32px;">暂无退货单，点右上角「+ 新增」创建（库房退货 / 到货退货）</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>类型</th><th>关联到货单</th><th>单据日期</th><th>供应商</th><th>库房</th><th>状态</th><th>审核时间</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer" style="font-size:12.5px;"><span class="text-secondary">共 ' + list.length + ' 条 · 库房退货=已入库药品扫码/选单退回供应商；到货退货=未入库到货单退回（删行=部分退）</span></div></div>';
  }

  function tabSection() {
    var d = selDoc();
    var tabs = [
      { key: 'codes', name: '码详情' },
      { key: 'drugs', name: '药品清单' },
      { key: 'nostock', name: '无库存码', badge: d && d.noStock.length ? d.noStock.length : '' }
    ];
    var body;
    if (!d) body = '<div class="text-center text-secondary" style="padding:40px;">点击上方单据行，查看码详情</div>';
    else if (tab === 'codes') body = codesPanel(d);
    else if (tab === 'drugs') body = drugsPanel(d);
    else body = noStockPanel(d);
    return '<div class="card">' + UI.tabsHeader(tabs, tab) + '<div class="pch-tab-panel">' + body + '</div></div>';
  }

  function codesPanel(d) {
    var ro = d.status === '已审核';
    var isArr = d.type === '到货退货';
    var rows = d.codes.map(function (c, i) {
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td>' + esc(c.split) + '</td><td>' + esc(c.splitQty || '—') + '</td>' +
        '<td>' + esc(c.batch) + '</td><td>' + esc(c.prodDate) + '</td><td>' + esc(c.expDate) + '</td>' +
        '<td>' + esc(c.location || '—') + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12px;" class="text-secondary">' + esc(c.code2 || '—') + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12px;" class="text-secondary">' + esc(c.code3 || '—') + '</td>' +
        '<td>' + (ro ? '' : '<button class="btn btn-sm btn-outline-danger" data-delcode="' + i + '">删除</button>') + '</td></tr>';
    }).join('');
    if (!d.codes.length) rows = '<tr><td colspan="11" class="text-center text-secondary" style="padding:28px;">退货清单为空' + (isArr ? '' : '——用「扫码选码」或「选单选码」添加退货码') + '</td></tr>';
    var barTxt = isArr
      ? '到货退货 · 关联到货单 <b>' + esc(d.refOrder || '—') + '</b> · 本单退 <b>' + d.codes.length + '</b> 盒<span class="text-secondary">（删掉不退的码 = 部分退）</span>'
      : '退货 <b>' + d.codes.length + '</b> 盒 · 库存可退 <b>' + P.stockCodes(S).length + '</b> 盒';
    return '<div class="pch-tabbar"><span class="pch-progress-txt">' + barTxt + '</span>' +
      '<div class="ms-auto btn-list">' + (isArr ? '' :
        '<button class="btn btn-sm btn-outline-primary" id="btnPickDoc"' + (ro ? ' disabled' : '') + '>☰ 选单选码</button>' +
        '<button class="btn btn-sm btn-primary" id="btnTabScan"' + (ro ? ' disabled' : '') + '>⦿ 扫码选码</button>') + '</div></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品追溯码(一级)</th><th>拆零</th><th>拆零数</th><th>批次号</th><th>生产日期</th><th>有效期至</th><th>库位</th><th>药品追溯码(二级)</th><th>药品追溯码(三级)</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function drugsPanel(d) {
    var list = P.summarize(d.codes, S.dict);
    var rows = list.map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.drugName) + '</b></td><td>' + esc(r.formSpec) + '</td>' +
        '<td>' + esc(r.packSpec) + '</td><td>' + esc(r.batch) + '</td><td><b>' + r.qty + '</b></td><td>' + esc(r.unit) + '</td>' +
        '<td class="text-secondary">' + esc(r.maker) + '</td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">暂无可解析药品</td></tr>';
    return '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药名通用名</th><th>制剂规格</th><th>包装规格</th><th>批次号</th><th>数量</th><th>单位</th><th>生产企业</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function noStockPanel(d) {
    var rows = (d.noStock || []).map(function (code, i) {
      return '<tr class="pch-row-bad"><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(code) + '</td>' +
        '<td><span class="text-danger">扫码时库房在架库存中不存在该码</span></td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="3" class="text-center text-secondary" style="padding:28px;">无记录</td></tr>';
    return '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品追溯码</th><th>说明</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  // ===== 渲染与绑定 =====
  function renderAll() {
    content.innerHTML = filterBar() + docTable() + tabSection();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { code: v('fCode'), billNo: v('fBillNo'), supplier: v('fSupplier'),
        type: v('fType') === '全部类型' ? '全部' : v('fType'),
        status: v('fStatus'), dateFrom: v('fDateFrom'), dateTo: v('fDateTo') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { code: '', billNo: '', supplier: '', type: '全部', status: '全部', dateFrom: '', dateTo: '' };
      renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', openAdd);
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-scan]').forEach(function (b) {
      b.addEventListener('click', function () { sel = b.getAttribute('data-scan'); openScanPick(); });
    });
    content.querySelectorAll('[data-audit]').forEach(function (b) {
      b.addEventListener('click', function () { sel = b.getAttribute('data-audit'); auditSel(); });
    });
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var billNo = b.getAttribute('data-del');
        UI.confirm('确定删除退货单 <b>' + esc(billNo) + '</b>？', function () {
          S.outDocs = S.outDocs.filter(function (d) { return d.billNo !== billNo; });
          if (sel === billNo) sel = null;
          save(); renderAll();
          window.showToast('已删除退货单 ' + billNo);
        });
      });
    });
    content.querySelectorAll('[data-ptab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-ptab'); renderAll(); });
    });
    content.querySelectorAll('[data-delcode]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = selDoc(); if (!d) return;
        d.codes.splice(+b.getAttribute('data-delcode'), 1);
        save(); renderAll();
      });
    });
    var ts = document.getElementById('btnTabScan');
    if (ts) ts.addEventListener('click', openScanPick);
    var pd = document.getElementById('btnPickDoc');
    if (pd) pd.addEventListener('click', openPickDoc);
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  // ===== 新增退货单：先选类型（库房退货=已入库扫码退回；到货退货=未入库整单退回） =====
  function openAdd() {
    UI.modalShell('pchOutType', '新增采购退货单 · 选择类型',
      '<div class="row g-3">' +
      '<div class="col-6"><label class="card p-3 d-block" style="cursor:pointer;" for="otKf">' +
        '<input type="radio" class="form-check-input" name="outType" id="otKf" value="库房退货" checked> <b>库房退货</b>' +
        '<div class="text-secondary mt-1" style="font-size:12.5px;">药品已入库在架，扫码从库房库存选码退回供应商</div></label></div>' +
      '<div class="col-6"><label class="card p-3 d-block" style="cursor:pointer;" for="otDh">' +
        '<input type="radio" class="form-check-input" name="outType" id="otDh" value="到货退货"> <b>到货退货</b>' +
        '<div class="text-secondary mt-1" style="font-size:12.5px;">到货未入库（未审核），选择到货单整单退回，不碰库存</div></label></div></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="otOk">下一步</button>', 640);
    var el = UI.open('pchOutType');
    el.querySelector('#otOk').addEventListener('click', function () {
      var t = el.querySelector('input[name="outType"]:checked').value;
      UI.close('pchOutType');
      if (t === '库房退货') openAddStock(); else openAddArrive();
    });
  }

  // 库房退货：录表头（对齐老系统图三：单据编号*/供应商*/库房）→ 保存后「扫码选码」或「选单选码」
  function openAddStock() {
    var supOpts = S.arrive.map(function (o) { return o.supplier; })
      .filter(function (s, i, arr) { return arr.indexOf(s) === i; })
      .map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    var wh = (window.store.load().currentUser || {}).warehouse || '中心库';
    var defNo = 'TH' + String(Date.now()).slice(-10);
    UI.modalShell('pchOutAdd', '新增退货单 · 库房退货',
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">单据编号</label><input class="form-control" id="oaBillNo" value="' + defNo + '"></div>' +
      '<div class="col-6"><label class="form-label">库房</label><input class="form-control" value="' + esc(wh) + '" disabled></div></div>' +
      '<div class="mb-3"><label class="form-label required">供应商</label><select class="form-select" id="oaSupplier">' + supOpts + '</select></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">保存后在码详情添加退货码：「扫码选码」从在架库存扫码，或「选单选码」从该供应商的已审核入库单勾选；扫到不在库存的码记入「无库存码」。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="oaOk">保存</button>', 560);
    var el = UI.open('pchOutAdd');
    el.querySelector('#oaOk').addEventListener('click', function () {
      var billNo = el.querySelector('#oaBillNo').value.trim();
      if (!billNo) { window.showToast('请填写单据编号'); return; }
      if (S.outDocs.some(function (x) { return x.billNo === billNo; })) { window.showToast('单据编号 ' + billNo + ' 已存在，请更换'); return; }
      S.outDocs.unshift({ billNo: billNo, date: now(), supplier: el.querySelector('#oaSupplier').value,
        warehouse: wh, type: '库房退货', refOrder: '', status: '未审核', auditTime: '', codes: [], noStock: [] });
      sel = billNo; tab = 'codes';
      save(); UI.close('pchOutAdd'); renderAll();
      window.showToast('退货单 ' + billNo + ' 已创建，请用「扫码选码」或「选单选码」添加退货码');
    });
  }

  // 到货退货：选择未入库到货单（未入库 = 未生成入库单 或 入库单未审核），整单退回
  function openAddArrive() {
    var inAudit = {};
    S.inDocs.forEach(function (d) { inAudit[d.billNo] = d.audit; });
    var eligible = S.arrive.filter(function (o) {
      if (o.confirm === '已退货' || !o.codes.length) return false;
      return o.downloaded !== '是' || inAudit[o.orderNo] === '未审核';
    });
    var opts = eligible.map(function (o) {
      return '<option value="' + esc(o.orderNo) + '">' + esc(o.orderNo) + ' · ' + esc(o.shipper) + ' · ' + o.codes.length + ' 个码' +
        (o.downloaded === '是' ? '（已建入库单未审核）' : '（未建入库单）') + '</option>';
    }).join('');
    UI.modalShell('pchOutArr', '新增退货单 · 到货退货',
      (eligible.length
        ? '<div class="mb-3"><label class="form-label required">选择到货单</label><select class="form-select" id="oarOrder">' + opts + '</select></div>' +
          '<div class="text-secondary" style="font-size:12.5px;">整单退回：退货单自动带出该到货单全部追溯码，无需扫码；审核后到货单标记「已退货」，未审核的入库单同步冲销。</div>'
        : '<div class="text-center text-secondary" style="padding:24px;">暂无可退的到货单（未入库且有码明细的到货单才会出现在这里）</div>'),
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      (eligible.length ? '<button class="btn btn-primary" id="oarOk">生成退货单</button>' : ''), 560);
    var el = UI.open('pchOutArr');
    var ok = el.querySelector('#oarOk');
    if (!ok) return;
    ok.addEventListener('click', function () {
      var orderNo = el.querySelector('#oarOrder').value;
      var o = S.arrive.filter(function (x) { return x.orderNo === orderNo; })[0];
      if (!o) return;
      var billNo = String(Date.now()).slice(-10);
      S.outDocs.unshift({ billNo: billNo, date: now(), supplier: o.supplier,
        warehouse: (window.store.load().currentUser || {}).warehouse || '中心库',
        type: '到货退货', refOrder: o.orderNo, status: '未审核', auditTime: '',
        codes: o.codes.map(function (c) { return Object.assign({}, c); }), noStock: [] });
      sel = billNo; tab = 'codes';
      save(); UI.close('pchOutArr'); renderAll();
      window.showToast('已生成到货退货单 ' + billNo + '（带出 ' + o.codes.length + ' 个码），请审核');
    });
  }

  // ===== 扫码选码：在库存=加入清单；不在库存=记无库存码 =====
  function openScanPick() {
    var d = selDoc();
    if (!d) { window.showToast('请先选择一张退货单'); return; }
    if (d.status === '已审核') { window.showToast('已审核单据不可再扫码'); return; }
    UI.openScan({
      title: '扫码选码 · ' + d.billNo,
      hint: '绿=在架库存，已加入退货清单；红=库存不存在，记入无库存码',
      gate: 'in', node: d.warehouse,
      flags: [{ key: 'remove', label: '扫码移除' }],
      onScan: function (code, flags) {
        var idx = -1;
        d.codes.forEach(function (c, i) { if (c.code === code) idx = i; });
        if (flags.remove) {
          if (idx === -1) return { level: 'warn', msg: '退货清单中不存在' };
          d.codes.splice(idx, 1); save();
          return { level: 'ok', msg: '已移除' };
        }
        if (idx > -1) return { level: 'warn', msg: '重复扫码，已在退货清单' };
        var stock = null;
        P.stockCodes(S).forEach(function (c) { if (c.code === code) stock = c; });
        if (!stock) {
          if (d.noStock.indexOf(code) === -1) d.noStock.push(code);
          save();
          return { level: 'bad', msg: '库存不存在该码，已记入无库存码' };
        }
        d.codes.push({ code: stock.code, level: stock.level, split: stock.split, splitQty: stock.splitQty,
          batch: stock.batch, prodDate: stock.prodDate, expDate: stock.expDate, checked: false,
          code2: stock.code2, code3: stock.code3, location: stock.location });
        save();
        var p = P.parseCode(code, S.dict);
        return { level: 'ok', msg: '已加入退货（' + (p.dict ? p.dict.drugName : '未解析') + '）' };
      },
      onClose: function () { save(); renderAll(); }
    });
  }

  // ===== 选单选码：选该供应商的已审核入库单 → 勾选仍在架的码加入退货清单 =====
  function openPickDoc() {
    var d = selDoc();
    if (!d) { window.showToast('请先选择一张退货单'); return; }
    if (d.type === '到货退货' || d.status === '已审核') return;
    var inStock = {};
    P.stockCodes(S).forEach(function (c) { inStock[c.code] = c; });
    var inRet = {};
    d.codes.forEach(function (c) { inRet[c.code] = true; });
    var docs = S.inDocs.filter(function (x) { return x.audit === '已审核' && x.supplier === d.supplier; });

    function codeRows(billNo) {
      var doc = docs.filter(function (x) { return x.billNo === billNo; })[0];
      if (!doc) return '<tr><td colspan="6" class="text-center text-secondary" style="padding:20px;">请选择入库单</td></tr>';
      var rows = doc.codes.filter(function (c) { return inStock[c.code] && !inRet[c.code]; }).map(function (c) {
        return '<tr><td><input type="checkbox" class="form-check-input" data-pk="' + esc(c.code) + '"></td>' +
          '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
          '<td>' + esc(c.batch) + '</td><td>' + esc(c.prodDate) + '</td><td>' + esc(c.expDate) + '</td><td>' + esc(c.location || '—') + '</td></tr>';
      }).join('');
      if (!rows) rows = '<tr><td colspan="6" class="text-center text-secondary" style="padding:20px;">该单没有在架可退的码（已退或已出库）</td></tr>';
      return rows;
    }

    var docOpts = '<option value="">请选择入库单</option>' + docs.map(function (x) {
      return '<option value="' + esc(x.billNo) + '">' + esc(x.billNo) + ' · ' + esc(x.date.slice(0, 10)) + ' · ' + x.codes.length + ' 个码</option>';
    }).join('');
    UI.modalShell('pchPickDoc', '选单选码 · ' + d.billNo,
      '<div class="mb-2"><label class="form-label required">入库单（' + esc(d.supplier) + '）</label>' +
      '<select class="form-select" id="pdDoc">' + docOpts + '</select></div>' +
      '<div class="table-responsive" style="max-height:280px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th style="width:36px;"></th><th>药品追溯码</th><th>批次号</th><th>生产日期</th><th>有效期至</th><th>库位</th></tr></thead>' +
      '<tbody id="pdRows">' + codeRows('') + '</tbody></table></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="pdOk">加入退货清单</button>', 760);
    var el = UI.open('pchPickDoc');
    el.querySelector('#pdDoc').addEventListener('change', function () {
      el.querySelector('#pdRows').innerHTML = codeRows(el.querySelector('#pdDoc').value);
    });
    el.querySelector('#pdOk').addEventListener('click', function () {
      var added = 0;
      el.querySelectorAll('[data-pk]:checked').forEach(function (c) {
        var code = c.getAttribute('data-pk');
        var stock = inStock[code];
        if (!stock || inRet[code]) return;
        d.codes.push({ code: stock.code, level: stock.level, split: stock.split, splitQty: stock.splitQty,
          batch: stock.batch, prodDate: stock.prodDate, expDate: stock.expDate, checked: false,
          code2: stock.code2, code3: stock.code3, location: stock.location });
        inRet[code] = true; added++;
      });
      if (!added) { window.showToast('请先勾选要退的追溯码'); return; }
      save(); UI.close('pchPickDoc'); renderAll();
      window.showToast('已加入 ' + added + ' 个追溯码到退货清单');
    });
  }

  // ===== 审核（图二「审核单据」口径）：弹窗扫码复核退货清单 → 直接审核 =====
  function auditSel() {
    var d = selDoc();
    if (!d) { window.showToast('请先选择一张退货单'); return; }
    if (d.status === '已审核') return;
    if (!d.codes.length) { window.showToast('退货清单为空，请先扫码/选单添加退货码'); return; }
    UI.openScan({
      title: '审核单据 · ' + d.billNo,
      hint: '扫退货清单内的追溯码复核（红行=不在本单）；核对无误点「直接审核」',
      gate: 'in', node: d.warehouse,
      table: true,
      onScan: function (code) {
        var c = null;
        d.codes.forEach(function (x) { if (x.code === code) c = x; });
        if (!c) return { level: 'bad', msg: '不在退货清单', row: { split: '—', splitQty: '—', lvl: '—' } };
        return { level: 'ok', msg: '在退货清单', row: { split: c.split, splitQty: c.splitQty || '—', lvl: c.level } };
      },
      onAudit: function () { doAudit(d); },
      onClose: function () { save(); renderAll(); }
    });
  }

  // 审核落库：无库存码软确认；到货退货审核后冲销到货单/未审核入库单
  function doAudit(d) {
    var run = function () {
      d.status = '已审核'; d.auditTime = now();
      var extra = '';
      if (d.type === '到货退货' && d.refOrder) {
        var o = S.arrive.filter(function (x) { return x.orderNo === d.refOrder; })[0];
        if (o) { o.confirm = '已退货'; }
        var inDoc = S.inDocs.filter(function (x) { return x.billNo === d.refOrder; })[0];
        if (inDoc && inDoc.audit === '未审核') { inDoc.audit = '已退货'; extra = '，未审核入库单 ' + d.refOrder + ' 已冲销'; }
      }
      save(); renderAll();
      window.showToast('退货单 ' + d.billNo + ' 审核完成，' + d.codes.length + ' 个追溯码已退回供应商' + extra);
    };
    if (d.noStock.length) UI.confirm('本单有 <b>' + d.noStock.length + '</b> 个无库存码未处理，确定审核？', run, '确定审核');
    else if (d.type === '到货退货') UI.confirm('审核后到货单 <b>' + esc(d.refOrder) + '</b> 将标记「已退货」并退回供应商，确定审核？', run, '确定审核');
    else run();
  }

  if (S.outDocs.length) sel = S.outDocs[0].billNo;
  renderAll();
})();
