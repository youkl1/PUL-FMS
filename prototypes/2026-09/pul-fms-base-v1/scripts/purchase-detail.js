/**
 * purchase-detail.js — 入库明细查询：药品维度汇总（上表）→ 来源单据下钻（下表）
 * 字段对齐老系统：药名通用名/药品规格/总数/生产厂家/批准文号/住院拆零/门诊拆零/药品编码
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pquery', crumb: ['采购管理', '采购明细', '采购明细'] });
  if (!content) return;

  var P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = P.load();
  var sel = null; // 选中的药品 key：idcode|batch
  var lastGroups = [];
  var filters = { code: '', drugName: '', other: '', ipUnpack: '全部', opUnpack: '全部', billNo: '', supplier: '', dateFrom: '', dateTo: '' };

  // 全部入库单 × 码 × 解析 → 行级明细
  function allRows() {
    var rows = [];
    S.inDocs.forEach(function (d) {
      if (filters.billNo && d.billNo.indexOf(filters.billNo) === -1) return;
      if (filters.supplier && d.supplier.indexOf(filters.supplier) === -1) return;
      if (filters.dateFrom && d.date.slice(0, 10) < filters.dateFrom) return;
      if (filters.dateTo && d.date.slice(0, 10) > filters.dateTo) return;
      (d.codes || []).forEach(function (c) {
        if (filters.code && c.code.indexOf(filters.code) === -1) return;
        var p = P.parseCode(c.code, S.dict);
        if (!p.dict) return;
        if (filters.drugName && p.dict.drugName.indexOf(filters.drugName) === -1) return;
        if (filters.other && (p.dict.drugCode + p.dict.formSpec + p.dict.packSpec + p.dict.approval).indexOf(filters.other) === -1) return;
        if (filters.ipUnpack !== '全部' && p.dict.ipUnpack !== filters.ipUnpack) return;
        if (filters.opUnpack !== '全部' && p.dict.opUnpack !== filters.opUnpack) return;
        rows.push({ doc: d, code: c, dict: p.dict, idcode: p.idcode });
      });
    });
    return rows;
  }

  // 药品维度聚合
  function drugGroups(rows) {
    var map = {};
    rows.forEach(function (r) {
      var key = r.idcode + '|' + r.code.batch;
      if (!map[key]) map[key] = { key: key, dict: r.dict, batch: r.code.batch, qty: 0, docs: {} };
      map[key].qty += 1;
      map[key].docs[r.doc.billNo] = map[key].docs[r.doc.billNo] || { doc: r.doc, qty: 0 };
      map[key].docs[r.doc.billNo].qty += 1;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  // 筛选栏（2026-10-13 Round BT：统一「文本标签+控件」——PchUI.fItem）
  function filterBar() {
    var sel_ = function (cur, o) { return '<option' + (cur === o ? ' selected' : '') + '>' + o + '</option>'; };
    var F = UI.fItem;
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      F('追溯码', '<input class="form-control" id="fCode" style="width:170px;" value="' + esc(filters.code) + '">') +
      F('药品通用名', '<input class="form-control" id="fDrugName" style="width:140px;" value="' + esc(filters.drugName) + '">') +
      F('编码/规格/文号', '<input class="form-control" id="fOther" style="width:190px;" placeholder="药品编码、药品规格、批准文号" value="' + esc(filters.other) + '">') +
      F('住院拆零', '<select class="form-select" id="fIp" style="width:80px;">' + ['全部', '是', '否'].map(function (o) { return sel_(filters.ipUnpack, o); }).join('') + '</select>') +
      F('门诊拆零', '<select class="form-select" id="fOp" style="width:80px;">' + ['全部', '是', '否'].map(function (o) { return sel_(filters.opUnpack, o); }).join('') + '</select>') +
      F('单据编号', '<input class="form-control" id="fBillNo" style="width:140px;" value="' + esc(filters.billNo) + '">') +
      F('供应商', '<input class="form-control" id="fSupplier" style="width:150px;" value="' + esc(filters.supplier) + '">') +
      F('单据时间', '<input class="form-control" id="fDateFrom" type="date" style="width:138px;" value="' + filters.dateFrom + '">' +
        '<span class="text-secondary">-</span>' +
        '<input class="form-control" id="fDateTo" type="date" style="width:138px;" value="' + filters.dateTo + '">') +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-outline-primary" id="btnExport">⬇ 导出</button></div>' +
      '</div></div></div>';
  }

  // 库存四列（2026-10-13 Round BW 用户参考老系统截图补：药房存量/药房零头/库房存量/库房零头）
  // 口径：存量=整装码数（1 码=1 盒/瓶）；零头=拆零余量（最小单位，药房拆零架 splitRemain 合计；库房不拆零恒 0）
  function stockQty4(drugCode) {
    var W = window.PUL_WH || null;
    if (!W) return [0, 0, 0, 0];
    var wh = W.load();
    var phBox = 0, phLoose = 0, whBox = 0;
    W.pharmacyStock(wh).forEach(function (c) {
      var p = P.parseCode(c.code, S.dict);
      if (!p.dict || p.dict.drugCode !== drugCode) return;
      phBox++;
      if (c.split === '是' && c.splitRemain) phLoose += c.splitRemain;
    });
    P.warehouses().forEach(function (node) {
      W.stockAll(S, wh, node).forEach(function (c) {
        var p = P.parseCode(c.code, S.dict);
        if (!p.dict || p.dict.drugCode !== drugCode) return;
        whBox++;
      });
    });
    return [phBox, phLoose, whBox, 0];
  }

  function drugTable(groups) {
    var rows = groups.map(function (g, i) {
      var d = g.dict;
      var q = stockQty4(d.drugCode);
      return '<tr class="pch-doc-row' + (g.key === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(g.key) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(d.drugName) + '</b></td>' +
        '<td>' + esc(d.formSpec) + ' / ' + esc(d.packSpec) + '</td>' +
        '<td><b>' + g.qty + '</b></td><td class="text-secondary">' + esc(d.maker) + '</td>' +
        '<td class="text-secondary">' + esc(d.approval) + '</td>' +
        '<td>' + esc(d.ipUnpack) + '</td><td>' + esc(d.opUnpack) + '</td>' +
        '<td>' + q[0] + '</td><td>' + q[1] + '</td><td><b>' + q[2] + '</b></td><td>' + q[3] + '</td>' +
        '<td class="text-secondary">' + esc(d.drugCode) + '</td>' +
        '<td onclick="event.stopPropagation()"><div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-codes="' + esc(g.key) + '">码明细</button>' +
          '<button class="btn btn-sm btn-outline-secondary" data-flow="' + esc(g.key) + '">⇄ 流转</button>' +
        '</div></td></tr>';
    }).join('');
    if (!groups.length) rows = '<tr><td colspan="14" class="text-center text-secondary" style="padding:32px;">无数据——请调整筛选条件</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药名通用名</th><th>药品规格</th><th>总数</th><th>生产厂家</th><th>批准文号</th><th>住院拆零</th><th>门诊拆零</th><th>药房存量</th><th>药房零头</th><th>库房存量</th><th>库房零头</th><th>药品编码</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  function billTable(groups) {
    var g = null;
    groups.forEach(function (x) { if (x.key === sel) g = x; });
    var body;
    if (!g) {
      body = '<div class="text-center text-secondary" style="padding:32px;">点击上方药品行，查看来源单据</div>';
    } else {
      var rows = Object.keys(g.docs).map(function (billNo, i) {
        var r = g.docs[billNo];
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(billNo) + '</b></td>' +
          '<td class="text-secondary">' + esc(r.doc.date) + '</td><td>' + esc(r.doc.supplier) + '</td>' +
          '<td class="text-secondary">' + esc(r.doc.invoice || '—') + '</td><td><b>' + r.qty + '</b></td>' +
          '<td>' + UI.light(r.doc.audit) + '</td>' +
          '<td><button class="btn btn-sm btn-outline-primary" data-doccodes="' + esc(billNo) + '">码明细</button></td></tr>';
      }).join('');
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>单据编号</th><th>单据日期</th><th>供应商</th><th>发票号</th><th>数量</th><th>审核</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>来源单据</b>' +
      (g ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(g.dict.drugName) + ' · 批次 ' + esc(g.batch) + '</span>' : '') +
      '</div>' + body + '</div>';
  }

  // ===== 码明细弹窗：监管码/父码/码等级/生产日期/批次号/失效日期（跨单据时带来源单据列） =====
  function rowsOf(key, billNo) {
    var rows = [];
    allRows().forEach(function (r) {
      if (r.idcode + '|' + r.code.batch !== key) return;
      if (billNo && r.doc.billNo !== billNo) return;
      rows.push({ c: r.code, billNo: r.doc.billNo });
    });
    return rows;
  }
  function groupOf(key) {
    for (var i = 0; i < lastGroups.length; i++) if (lastGroups[i].key === key) return lastGroups[i];
    return null;
  }
  function openCodes(title, rows) {
    var body = rows.map(function (r, i) {
      var c = r.c;
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td class="text-secondary" style="font-family:Consolas,monospace;font-size:12px;">' + esc(c.code2 || '—') + '</td>' +
        '<td>' + (c.level || 1) + '</td>' +
        '<td>' + esc(c.prodDate || '—') + '</td><td>' + esc(c.batch || '—') + '</td><td>' + esc(c.expDate || '—') + '</td>' +
        '<td class="text-secondary">' + esc(r.billNo) + '</td></tr>';
    }).join('');
    UI.modalShell('pchDetCodes', title,
      '<div class="text-secondary" style="font-size:12.5px;margin-bottom:10px;">共 ' + rows.length + ' 个追溯码</div>' +
      '<div class="table-responsive" style="max-height:420px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>监管码</th><th>父码</th><th>码等级</th><th>生产日期</th><th>批次号</th><th>失效日期</th><th>来源单据</th></tr></thead>' +
      '<tbody>' + (rows.length ? body : '<tr><td colspan="8" class="text-center text-secondary" style="padding:24px;">无码明细</td></tr>') + '</tbody></table></div>',
      '<button class="btn btn-outline-secondary" data-mclose>关闭</button>', 960);
    UI.open('pchDetCodes');
  }

  // ===== 流转：从药品批次转 领用出库 / 采购退货（对齐老系统「选择流转类型」） =====
  function openTransfer(g) {
    UI.modalShell('pchTransfer', '选择流转类型',
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
      '<button class="btn btn-primary btn-lg" id="tfPick">⇨ 领用出库</button>' +
      '<button class="btn btn-warning btn-lg" id="tfOut">↩ 采购退货</button></div>' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:12px;">' + esc(g.dict.drugName) + ' · 批次 ' + esc(g.batch) + ' · 在库 ' + g.qty + '。跳转到对应单据页（原型演示跳转，不预填参数）。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>', 460);
    var el = UI.open('pchTransfer');
    el.querySelector('#tfPick').addEventListener('click', function () { window.store.go('wh-pick-out.html'); });
    el.querySelector('#tfOut').addEventListener('click', function () { window.store.go('purchase-out.html'); });
  }

  function renderAll() {
    var groups = drugGroups(allRows());
    lastGroups = groups;
    if (sel && !groups.some(function (g) { return g.key === sel; })) sel = null;
    content.innerHTML = filterBar() + drugTable(groups) + billTable(groups);
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { code: v('fCode'), drugName: v('fDrugName'), other: v('fOther'), ipUnpack: v('fIp'), opUnpack: v('fOp'),
        billNo: v('fBillNo'), supplier: v('fSupplier'), dateFrom: v('fDateFrom'), dateTo: v('fDateTo') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { code: '', drugName: '', other: '', ipUnpack: '全部', opUnpack: '全部', billNo: '', supplier: '', dateFrom: '', dateTo: '' };
      renderAll();
    });
    document.getElementById('btnExport').addEventListener('click', function () {
      window.showToast('已导出当前查询结果（原型演示）');
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-codes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-codes'), g = groupOf(key);
        if (g) openCodes('码明细 · ' + g.dict.drugName + '（批次 ' + g.batch + '）', rowsOf(key));
      });
    });
    content.querySelectorAll('[data-doccodes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var billNo = b.getAttribute('data-doccodes'), g = groupOf(sel);
        if (g) openCodes('码明细 · ' + g.dict.drugName + ' · ' + billNo, rowsOf(sel, billNo));
      });
    });
    content.querySelectorAll('[data-flow]').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = groupOf(b.getAttribute('data-flow'));
        if (g) openTransfer(g);
      });
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  renderAll();
})();
