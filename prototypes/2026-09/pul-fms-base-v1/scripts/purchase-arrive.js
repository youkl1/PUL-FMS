/**
 * purchase-arrive.js — 采购到货：到货单是入库的业务源头
 * 双通道建到货单：供应商平台中继拉取（种子数据）+ 本页手动新增（人工录入码明细，断网兜底）
 * 每行「到货入库」→ 填入库信息（库房/库位/发票号）→ 生成入库单；字段对齐老系统「药品销售管理」
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'arrive', crumb: ['库房管理', '采购管理', '采购到货'] });
  if (!content) return;

  var P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = P.load();
  var sel = null;
  var filters = { orderNo: '', supplier: '', code: '', confirm: '全部', source: '全部', dateFrom: '', dateTo: '' };

  function save() { P.save(S); }
  function now() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function selOrder() {
    for (var i = 0; i < S.arrive.length; i++) if (S.arrive[i].orderNo === sel) return S.arrive[i];
    return null;
  }
  function filtered() {
    return S.arrive.filter(function (o) {
      if (filters.orderNo && o.orderNo.indexOf(filters.orderNo) === -1) return false;
      if (filters.supplier && o.supplier.indexOf(filters.supplier) === -1) return false;
      if (filters.confirm !== '全部' && o.confirm !== filters.confirm) return false;
      if (filters.source !== '全部' && o.source !== filters.source) return false;
      if (filters.dateFrom && o.orderTime.slice(0, 10) < filters.dateFrom) return false;
      if (filters.dateTo && o.orderTime.slice(0, 10) > filters.dateTo) return false;
      if (filters.code) {
        var hit = (o.codes || []).some(function (c) { return c.code.indexOf(filters.code) !== -1; });
        if (!hit) return false;
      }
      return true;
    });
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fOrderNo" style="width:150px;" placeholder="单据编号" value="' + esc(filters.orderNo) + '">' +
      '<input class="form-control" id="fCode" style="width:160px;" placeholder="追溯码" value="' + esc(filters.code) + '">' +
      '<input class="form-control" id="fSupplier" style="width:160px;" placeholder="发货企业 / 供应商" value="' + esc(filters.supplier) + '">' +
      '<select class="form-select" id="fSource" style="width:90px;">' +
        ['全部', '拉取', '手动'].map(function (o) { return opt(filters.source, o, o === '全部' ? '来源' : o); }).join('') + '</select>' +
      '<select class="form-select" id="fConfirm" style="width:110px;">' +
        ['全部', '已确认', '未确认', '已退货'].map(function (o) { return opt(filters.confirm, o, o === '全部' ? '确认状态' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fDateFrom" type="date" style="width:145px;" value="' + filters.dateFrom + '">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fDateTo" type="date" style="width:145px;" value="' + filters.dateTo + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增到货单</button></div>' +
      '</div></div></div>';
  }

  function srcBadge(o) {
    return o.source === '手动' ? '<span class="badge bg-orange-lt">手动</span>' : '<span class="badge bg-blue-lt">拉取</span>';
  }
  function confirmTxt(o) {
    if (o.confirm === '已退货') return '<span class="text-secondary">已退货</span>';
    return o.confirm === '已确认' ? '<span class="text-success">已确认</span>' : '<span class="text-danger">未确认</span>';
  }

  function orderTable() {
    var list = filtered();
    var rows = list.map(function (o, i) {
      var un = o.confirm === '未确认';
      var op = o.downloaded === '是'
        ? '<span class="text-secondary" style="font-size:12.5px;">已入库</span>'
        : '<button class="btn btn-sm btn-primary" data-in="' + esc(o.orderNo) + '"' + (o.codes.length ? '' : ' disabled title="请先录入码明细"') + '>到货入库</button>';
      return '<tr class="pch-doc-row' + (o.orderNo === sel ? ' pch-doc-sel' : '') + (un ? ' pch-row-unconfirmed' : '') + '" data-sel="' + esc(o.orderNo) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(o.orderNo) + '</b></td>' +
        '<td class="text-secondary">' + esc(o.orderTime) + '</td><td>' + esc(o.docType) + '</td>' +
        '<td>' + esc(o.shipper) + '</td><td>' + esc(o.receiver) + '</td>' +
        '<td>' + srcBadge(o) + '</td><td>' + confirmTxt(o) + '</td>' +
        '<td onclick="event.stopPropagation()">' + op + '</td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="9" class="text-center text-secondary" style="padding:32px;">暂无到货单——供应商码单经中继服务传入，或点右上角「新增到货单」手动建单</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据时间</th><th>单据类型</th><th>发货企业</th><th>收货企业</th><th>来源</th><th>确认状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer" style="font-size:12.5px;"><span class="text-secondary">共 ' + list.length + ' 条 · 红底=医院未确认 · 「到货入库」生成入库单后不可重复入库</span></div></div>';
  }

  // 到货明细：药品行 + 每行「码明细」弹窗；未入库单可「录入码明细」
  function detailCard() {
    var o = selOrder();
    var body;
    if (!o) {
      body = '<div class="text-center text-secondary" style="padding:36px;">点击到货单行，预览到货明细</div>';
    } else {
      var list = P.summarize(o.codes, S.dict);
      var rows = list.map(function (r, i) {
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.drugName) + '</b></td><td>' + esc(r.formSpec) + '</td>' +
          '<td>' + esc(r.packSpec) + '</td><td><b>' + r.qty + '</b></td><td>' + esc(r.unit) + '</td>' +
          '<td class="text-secondary">' + esc(r.approval) + '</td><td class="text-secondary">' + esc(r.maker) + '</td>' +
          '<td><button class="btn btn-sm btn-outline-primary" data-codes="' + esc(r.idcode) + '|' + esc(r.batch) + '">码明细</button></td></tr>';
      }).join('');
      if (!list.length) rows = '<tr><td colspan="9" class="text-center text-secondary" style="padding:28px;">暂无码明细' + (o.downloaded === '是' ? '' : '——点右上「录入码明细」逐条人工录入') + '</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>药品通用名</th><th>制剂规格</th><th>包装规格</th><th>数量</th><th>单位</th><th>批准文号</th><th>生产企业</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>到货明细</b>' +
      (o ? '<span class="text-secondary ms-2" style="font-size:12.5px;">到货单 ' + esc(o.orderNo) + ' · 共 ' + o.codes.length + ' 个追溯码</span>' : '') +
      (o && o.downloaded !== '是' ? '<div class="ms-auto"><button class="btn btn-sm btn-outline-primary" id="btnAddCodes">+ 录入码明细</button></div>' : '') +
      '</div>' + body + '</div>';
  }

  // 码明细弹窗（监管码/父码/码等级/生产日期/批次号/失效日期；未入库可删码）
  function openCodeList(key) {
    var o = selOrder();
    if (!o) return;
    var parts = key.split('|'), idcode = parts[0], batch = parts[1];
    var codes = (o.codes || []).filter(function (c) { return c.code.slice(0, 7) === idcode && c.batch === batch; });
    var dict = null;
    S.dict.forEach(function (d) { if (d.idcode === idcode) dict = d; });
    var ro = o.downloaded === '是';
    var rows = codes.map(function (c, i) {
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td class="text-secondary">' + esc(c.parentCode || '—') + '</td>' +
        '<td>' + c.level + '</td>' +
        '<td>' + esc(c.prodDate) + '</td><td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td>' +
        '<td>' + (ro ? '' : '<button class="btn btn-sm btn-outline-danger" data-delcode="' + esc(c.code) + '">删除</button>') + '</td></tr>';
    }).join('');
    UI.modalShell('pchCodes', '码明细 · ' + (dict ? dict.drugName : idcode),
      '<div class="text-secondary" style="font-size:12.5px;margin-bottom:10px;">到货单 ' + esc(o.orderNo) + ' · 批次 ' + esc(batch) + ' · 共 ' + codes.length + ' 个码</div>' +
      '<div class="table-responsive" style="max-height:420px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>监管码</th><th>父码</th><th>码等级</th><th>生产日期</th><th>批次号</th><th>失效日期</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>',
      '<button class="btn btn-outline-secondary" data-mclose>关闭</button>', 900);
    var el = UI.open('pchCodes');
    el.querySelectorAll('[data-delcode]').forEach(function (b) {
      b.addEventListener('click', function () {
        var code = b.getAttribute('data-delcode');
        o.codes = o.codes.filter(function (c) { return c.code !== code; });
        save();
        window.showToast('已删除追溯码 ' + code);
        if ((o.codes || []).some(function (c) { return c.code.slice(0, 7) === idcode && c.batch === batch; })) openCodeList(key);
        else { UI.close('pchCodes'); renderAll(); }
      });
    });
  }

  // ===== 新增到货单（手动兜底：不扫码，保存后到货明细里人工录入码明细） =====
  function openAdd() {
    var supOpts = S.arrive.map(function (o) { return o.supplier; })
      .filter(function (s, i, arr) { return arr.indexOf(s) === i; })
      .map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    var defNo = 'DH' + String(Date.now()).slice(-10);
    UI.modalShell('pchAdd', '新增到货单（手动）',
      '<div class="mb-3"><label class="form-label required">单据编号</label>' +
        '<input class="form-control" id="adNo" value="' + defNo + '"></div>' +
      '<div class="mb-2"><label class="form-label required">发货企业（供应商）</label><select class="form-select" id="adSupplier">' + supOpts + '</select></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">保存后到货单出现在本列表（来源=手动），选中后点「录入码明细」逐条人工录入药品与数量；发票号在生成入库单时填写。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>关闭</button>' +
      '<button class="btn btn-primary" id="adOk">保存</button>', 520);
    var el = UI.open('pchAdd');
    el.querySelector('#adOk').addEventListener('click', function () {
      var no = el.querySelector('#adNo').value.trim();
      if (!no) { window.showToast('单据编号为必填项'); return; }
      if (S.arrive.some(function (o) { return o.orderNo === no; })) { window.showToast('单据编号 ' + no + ' 已存在，请更换'); return; }
      var sup = el.querySelector('#adSupplier').value;
      S.arrive.unshift({ orderNo: no, orderTime: now() + ':00', supplier: sup, shipper: sup, receiver: '云岭总医院',
        docType: '销售出库', source: '手动', confirm: '未确认', downloaded: '否', invoice: '', codes: [] });
      sel = no;
      save(); UI.close('pchAdd'); renderAll();
      window.showToast('已创建到货单 ' + no + '，请在下方「到货明细」录入码明细');
    });
  }

  // ===== 人工录入码明细：选药品 + 批次效期 + 数量 → 生成码清单（不扫码） =====
  function openAddCodes() {
    var o = selOrder();
    if (!o || o.downloaded === '是') return;
    var drugOpts = S.dict.map(function (d) {
      return '<option value="' + esc(d.idcode) + '">' + esc(d.drugName) + ' · ' + esc(d.formSpec) + ' · ' + esc(d.packSpec) + '</option>';
    }).join('');
    UI.modalShell('pchAddCodes', '录入码明细 · ' + o.orderNo,
      '<div class="mb-3"><label class="form-label required">药品（标识码字典）</label><select class="form-select" id="acDrug">' + drugOpts + '</select></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-4"><label class="form-label required">批次号</label><input class="form-control" id="acBatch" placeholder="如 601753"></div>' +
      '<div class="col-4"><label class="form-label required">生产日期</label><input class="form-control" id="acProd" type="date"></div>' +
      '<div class="col-4"><label class="form-label required">有效期至</label><input class="form-control" id="acExp" type="date"></div></div>' +
      '<div class="mb-2" style="max-width:200px;"><label class="form-label required">数量</label><input class="form-control" id="acQty" type="number" min="1" value="1"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">按数量生成对应个数的追溯码记录（原型以流水号模拟真实码）；保存后可继续录入其它药品。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>完成</button>' +
      '<button class="btn btn-primary" id="acOk">保存并继续</button>', 560);
    var el = UI.open('pchAddCodes');
    el.querySelector('#acOk').addEventListener('click', function () {
      var idcode = el.querySelector('#acDrug').value;
      var batch = el.querySelector('#acBatch').value.trim();
      var prod = el.querySelector('#acProd').value;
      var exp = el.querySelector('#acExp').value;
      var qty = +el.querySelector('#acQty').value;
      if (!batch || !prod || !exp || !qty || qty < 1) { window.showToast('批次号 / 生产日期 / 有效期至 / 数量 均为必填'); return; }
      var base = String(Date.now()).slice(-6);
      for (var i = 0; i < qty; i++) {
        var serial = '9' + base + ('0' + (i % 100)).slice(-2) + (i >= 100 ? 'x' : '');
        var code20 = idcode + serial.slice(0, 9) + '0000';
        if (o.codes.some(function (c) { return c.code === code20; })) code20 = idcode + ('9' + base + String(100 + i)).slice(0, 9) + '0000';
        o.codes.push({ code: code20, level: 1, split: '否', splitQty: '', batch: batch, prodDate: prod, expDate: exp,
          checked: false, code2: '', code3: '', location: '' });
      }
      save(); renderAll();
      window.showToast('已录入 ' + qty + ' 个码（' + batch + '），本单累计 ' + o.codes.length + ' 个');
    });
  }

  // ===== 到货入库：填入库信息（库房/库位/发票号）→ 生成入库单 =====
  function openIn(o) {
    if (!o.codes.length) { window.showToast('该到货单还没有码明细，请先「录入码明细」'); return; }
    var curWh = (window.store.load().currentUser || {}).warehouse || '中心库';
    var whOpts = P.warehouses().map(function (w) {
      return '<option' + (w === curWh ? ' selected' : '') + '>' + esc(w) + '</option>';
    }).join('');
    var locOpts = '<option value="">请选择</option>' + P.LOC_PRESET.map(function (l) { return '<option>' + esc(l) + '</option>'; }).join('');
    UI.modalShell('pchIn', '到货入库 · ' + o.orderNo,
      '<div class="text-secondary" style="font-size:12.5px;margin-bottom:10px;">发货企业：' + esc(o.shipper) + ' · 共 ' + o.codes.length + ' 个追溯码，生成后请到「采购入库」核对审核。</div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">入库库房</label><select class="form-select" id="inWarehouse">' + whOpts + '</select></div>' +
      '<div class="col-6"><label class="form-label">库位</label><select class="form-select" id="inLocation">' + locOpts + '</select></div></div>' +
      '<div class="mb-2"><label class="form-label">发票号</label><input class="form-control" id="inInvoice" value="' + esc(o.invoice || '') + '" placeholder="如 FP2026091301"></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="inOk">生成入库单</button>', 520);
    var el = UI.open('pchIn');
    el.querySelector('#inOk').addEventListener('click', function () {
      o.downloaded = '是';
      o.confirm = '已确认';
      o.invoice = el.querySelector('#inInvoice').value.trim();
      S.inDocs.unshift({ billNo: o.orderNo, date: now(), supplier: o.supplier, invoice: o.invoice,
        warehouse: el.querySelector('#inWarehouse').value, location: el.querySelector('#inLocation').value,
        audit: '未审核', hisPush: '', downloadTime: now(), auditDate: '', auditor: '', source: o.source === '手动' ? '手动' : '下载',
        codes: o.codes.map(function (c) { return Object.assign({}, c); }) });
      save(); UI.close('pchIn'); renderAll();
      window.showToast('已生成入库单 ' + o.orderNo + '，请到「采购入库」核对审核');
    });
  }

  function renderAll() {
    content.innerHTML = filterBar() + orderTable() + detailCard();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { orderNo: v('fOrderNo'), supplier: v('fSupplier'), code: v('fCode'),
        confirm: v('fConfirm') === '确认状态' ? '全部' : v('fConfirm'),
        source: v('fSource') === '来源' ? '全部' : v('fSource'),
        dateFrom: v('fDateFrom'), dateTo: v('fDateTo') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { orderNo: '', supplier: '', code: '', confirm: '全部', source: '全部', dateFrom: '', dateTo: '' };
      renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', openAdd);
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-codes]').forEach(function (b) {
      b.addEventListener('click', function () { openCodeList(b.getAttribute('data-codes')); });
    });
    content.querySelectorAll('[data-in]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-in');
        var o = S.arrive.filter(function (x) { return x.orderNo === no; })[0];
        if (o) { sel = no; openIn(o); }
      });
    });
    var ac = document.getElementById('btnAddCodes');
    if (ac) ac.addEventListener('click', openAddCodes);
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  if (S.arrive.length) sel = S.arrive[0].orderNo;
  renderAll();
})();
