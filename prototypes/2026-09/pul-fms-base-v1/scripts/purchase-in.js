/**
 * purchase-in.js — 采购入库：选到货单建单 + 扫码/人工双通道验收 + 扫码直接审核 + 审核防呆
 * 字段口径对齐老系统：单据编号/供应商/发票号/下载/解析/审核/异常信息 + 码详情三页签
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pin', crumb: ['库房管理', '采购管理', '采购入库'] });
  if (!content) return;

  var P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = P.load();
  var sel = null, tab = 'codes';
  var filters = { billNo: '', supplier: '', invoice: '', exception: '全部', dateFrom: '', dateTo: '' };
  var page = 1, pageSize = 10;

  function save() { P.save(S); }
  function docBad(doc) { return P.badCodesOf(doc, S.dict); }
  function docParse(doc) { return docBad(doc).length ? '异常' : '正常'; }
  function checkedCount(doc) { return (doc.codes || []).filter(function (c) { return c.checked; }).length; }
  function selDoc() {
    for (var i = 0; i < S.inDocs.length; i++) if (S.inDocs[i].billNo === sel) return S.inDocs[i];
    return null;
  }
  function now() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function filtered() {
    return S.inDocs.filter(function (d) {
      if (filters.billNo && d.billNo.indexOf(filters.billNo) === -1) return false;
      if (filters.supplier && d.supplier.indexOf(filters.supplier) === -1) return false;
      if (filters.invoice && (d.invoice || '').indexOf(filters.invoice) === -1) return false;
      if (filters.exception === '有异常' && !docBad(d).length) return false;
      if (filters.exception === '无异常' && docBad(d).length) return false;
      if (filters.dateFrom && d.date.slice(0, 10) < filters.dateFrom) return false;
      if (filters.dateTo && d.date.slice(0, 10) > filters.dateTo) return false;
      return true;
    });
  }

  // ===== 人工验收多选：选中态存内存（selKey 切换单据时清空），勾选≠验收，统一提交 =====
  var picked = {};

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fBillNo" style="width:160px;" placeholder="单据编号" value="' + esc(filters.billNo) + '">' +
      '<input class="form-control" id="fSupplier" style="width:170px;" placeholder="供应商" value="' + esc(filters.supplier) + '">' +
      '<input class="form-control" id="fInvoice" style="width:140px;" placeholder="发票号" value="' + esc(filters.invoice) + '">' +
      '<select class="form-select" id="fException" style="width:110px;">' +
        ['全部', '有异常', '无异常'].map(function (o) { return '<option' + (filters.exception === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>' +
      '<input class="form-control" id="fDateFrom" type="date" style="width:150px;" value="' + filters.dateFrom + '">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fDateTo" type="date" style="width:150px;" value="' + filters.dateTo + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto btn-list">' +
      '<button class="btn btn-primary" id="btnDownload">+ 新增入库单</button>' +
      '</div></div></div></div>';
  }

  function docTable() {
    var list = filtered();
    var total = list.length, pages = Math.max(1, Math.ceil(total / pageSize));
    if (page > pages) page = pages;
    var slice = list.slice((page - 1) * pageSize, page * pageSize);
    var rows = slice.map(function (d, i) {
      var bad = docBad(d).length;
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td>' + ((page - 1) * pageSize + i + 1) + '</td>' +
        '<td><b>' + esc(d.billNo) + '</b>' + (d.source === '手动' ? ' <span class="badge bg-orange-lt">手动</span>' : '') + '</td>' +
        '<td class="text-secondary">' + esc(d.date) + '</td><td>' + esc(d.supplier) + '</td>' +
        '<td>' + esc(d.warehouse) + (d.location ? '<br><span class="text-secondary" style="font-size:12px;">库位 ' + esc(d.location) + '</span>' : '') + '</td>' +
        '<td>' + UI.light('完成') + '</td><td>' + UI.light(docParse(d)) + '</td><td>' + UI.light(d.audit) + '</td>' +
        '<td>' + (bad ? '<span class="text-danger" style="font-size:12.5px;">' + bad + ' 个异常码</span>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td><div class="btn-list" onclick="event.stopPropagation()">' +
          '<button class="btn btn-sm btn-outline-primary" data-scan="' + esc(d.billNo) + '"' + (d.audit !== '未审核' ? ' disabled' : '') + '>扫码</button>' +
          '<button class="btn btn-sm btn-outline-secondary" data-edit="' + esc(d.billNo) + '"' + (d.audit !== '未审核' ? ' disabled' : '') + '>编辑</button>' +
          '<button class="btn btn-sm btn-outline-success" data-audit="' + esc(d.billNo) + '"' + (d.audit !== '未审核' ? ' disabled' : '') + '>审核</button>' +
          '<button class="btn btn-sm btn-outline-danger" data-del="' + esc(d.billNo) + '"' + (d.audit !== '未审核' ? ' disabled' : '') + '>删除</button>' +
        '</div></td></tr>';
    }).join('');
    if (!slice.length) rows = '<tr><td colspan="10" class="text-center text-secondary" style="padding:32px;">暂无入库单，点右上角「+ 新增入库单」选择到货单建单（无到货单请先到「采购到货」新增）</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据日期</th><th>供应商</th><th>库房</th><th>下载</th><th>解析</th><th>审核</th><th>异常信息</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer d-flex align-items-center" style="font-size:12.5px;">' +
      '<span class="text-secondary">共 ' + total + ' 条</span>' +
      '<div class="btn-list ms-auto">' +
      '<button class="btn btn-sm btn-outline-secondary" id="pgPrev"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>' +
      '<span class="text-secondary" style="padding:0 6px;">' + page + ' / ' + pages + '</span>' +
      '<button class="btn btn-sm btn-outline-secondary" id="pgNext"' + (page >= pages ? ' disabled' : '') + '>下一页</button>' +
      '</div></div></div>';
  }

  // ===== 三页签：码详情 / 药品清单 / 异常码 =====
  function tabSection() {
    var d = selDoc();
    var bad = d ? docBad(d) : [];
    var tabs = [
      { key: 'codes', name: '码详情' },
      { key: 'drugs', name: '药品清单' },
      { key: 'bad', name: '异常码', badge: bad.length || '' }
    ];
    var body = '';
    if (!d) {
      body = '<div class="text-center text-secondary" style="padding:40px;">点击上方单据行，查看码详情</div>';
    } else if (tab === 'codes') {
      body = codesPanel(d);
    } else if (tab === 'drugs') {
      body = drugsPanel(d);
    } else {
      body = badPanel(d, bad);
    }
    return '<div class="card">' + UI.tabsHeader(tabs, tab) + '<div class="pch-tab-panel">' + body + '</div></div>';
  }

  function tabbar(d) {
    var total = d.codes.length, checked = checkedCount(d);
    var pct = total ? Math.round(checked / total * 100) : 0;
    var ro = d.audit !== '未审核';
    var pickCount = 0;
    d.codes.forEach(function (c) { if (picked[c.code] && !c.checked) pickCount++; });
    return '<div class="pch-tabbar">' +
      '<span class="pch-progress-txt">验收进度 <b>' + checked + ' / ' + total + '</b>' +
      (pickCount ? ' · 已选 <b class="text-primary">' + pickCount + '</b>' : '') + '</span>' +
      '<div class="pch-progress"><i style="width:' + pct + '%;"></i></div>' +
      '<div class="ms-auto btn-list">' +
      '<button class="btn btn-sm btn-outline-secondary" id="btnPickAll"' + (ro ? ' disabled' : '') + '>全选</button>' +
      '<button class="btn btn-sm btn-primary" id="btnManualAudit"' + (ro ? ' disabled' : '') + '>✓ 人工验收入库' + (pickCount ? '（' + pickCount + '）' : '') + '</button>' +
      '</div></div>';
  }

  // ===== 码详情 = 选择列表：点行/勾选只是「选中」，验收统一由「人工验收入库」提交 =====
  function codesPanel(d) {
    var ro = d.audit !== '未审核';
    var rows = d.codes.map(function (c, i) {
      var p = P.parseCode(c.code, S.dict);
      var bad = !p.dict;
      var pk = !!picked[c.code] && !c.checked;
      var cls = bad ? 'pch-row-bad' : (pk ? 'pch-row-picked' : (c.checked ? 'pch-row-checked' : ''));
      return '<tr class="' + cls + '"' + (ro || c.checked || bad ? '' : ' data-pickrow="' + esc(c.code) + '" style="cursor:pointer;"') + '>' +
        '<td>' + (i + 1) + '</td>' +
        '<td onclick="event.stopPropagation()"><input type="checkbox" class="pch-check" data-pick="' + esc(c.code) + '"' +
          (pk ? ' checked' : '') + (ro || c.checked || bad ? ' disabled' : '') + '></td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td>' + esc(c.split) + '</td><td>' + esc(c.splitQty || '—') + '</td>' +
        '<td>' + esc(c.batch) + '</td><td>' + esc(c.prodDate) + '</td><td>' + esc(c.expDate) + '</td>' +
        '<td>' + (c.checked ? '<span class="text-success">已验收</span>' : '<span class="text-secondary">未验收</span>') + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12px;" class="text-secondary">' + esc(c.code2 || '—') + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12px;" class="text-secondary">' + esc(c.code3 || '—') + '</td>' +
        '<td onclick="event.stopPropagation()">' + (ro ? '' : '<button class="btn btn-sm btn-outline-danger" data-delcode="' + i + '">删除</button>') + '</td></tr>';
    }).join('');
    if (!d.codes.length) rows = '<tr><td colspan="12" class="text-center text-secondary" style="padding:28px;">码清单为空——点单据行「扫码」逐码核对</td></tr>';
    return tabbar(d) +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>选择</th><th>药品追溯码(一级)</th><th>拆零</th><th>拆零数</th><th>批次号</th><th>生产日期</th><th>有效期至</th><th>验收状态</th><th>药品追溯码(二级)</th><th>药品追溯码(三级)</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function drugsPanel(d) {
    var list = P.summarize(d.codes, S.dict);
    var rows = list.map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.drugName) + '</b></td><td>' + esc(r.formSpec) + '</td>' +
        '<td>' + esc(r.packSpec) + '</td><td>' + esc(r.batch) + '</td><td>' + esc(r.prodDate) + '</td>' +
        '<td>' + esc(r.expDate) + '</td><td><b>' + r.qty + '</b></td><td>' + esc(r.unit) + '</td>' +
        '<td class="text-secondary">' + esc(r.approval) + '</td><td class="text-secondary">' + esc(r.maker) + '</td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="11" class="text-center text-secondary" style="padding:28px;">暂无可解析药品</td></tr>';
    return '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药名通用名</th><th>制剂规格</th><th>包装规格</th><th>批次号</th><th>生产日期</th><th>有效期至</th><th>数量</th><th>单位</th><th>批准文号</th><th>生产企业</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function badPanel(d, bad) {
    var rows = bad.map(function (c, i) {
      var p = P.parseCode(c.code, S.dict);
      return '<tr class="pch-row-bad"><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td>' + esc(p.idcode) + '</td>' +
        '<td><span class="text-danger">标识码未维护，无法解析药品</span></td>' +
        '<td><button class="btn btn-sm btn-outline-primary" data-gobad>去维护</button></td></tr>';
    }).join('');
    if (!bad.length) rows = '<tr><td colspan="5" class="text-center text-secondary" style="padding:28px;">无异常码，可以审核</td></tr>';
    return '<div class="pch-tabbar"><span class="pch-progress-txt">异常码 <b class="text-danger">' + bad.length + '</b> 个 · 字典维护后点右侧重新解析</span>' +
      '<div class="ms-auto btn-list"><button class="btn btn-sm btn-outline-primary" id="btnReparse"' + (d.audit !== '未审核' ? ' disabled' : '') + '>↻ 重新解析</button></div></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品追溯码</th><th>标识码</th><th>异常原因</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  // ===== 渲染与绑定 =====
  function renderAll() {
    content.innerHTML = filterBar() + docTable() + tabSection();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { billNo: v('fBillNo'), supplier: v('fSupplier'), invoice: v('fInvoice'),
        exception: v('fException'), dateFrom: v('fDateFrom'), dateTo: v('fDateTo') };
      page = 1; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { billNo: '', supplier: '', invoice: '', exception: '全部', dateFrom: '', dateTo: '' };
      page = 1; renderAll();
    });
    document.getElementById('pgPrev').addEventListener('click', function () { if (page > 1) { page--; renderAll(); } });
    document.getElementById('pgNext').addEventListener('click', function () { page++; renderAll(); });
    document.getElementById('btnDownload').addEventListener('click', openDownload);

    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var billNo = tr.getAttribute('data-sel');
        if (billNo !== sel) picked = {};   // 切换单据清空选中态
        sel = billNo; renderAll();
      });
    });
    content.querySelectorAll('[data-scan]').forEach(function (b) {
      b.addEventListener('click', function () { sel = b.getAttribute('data-scan'); picked = {}; openScanVerify(); });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { sel = b.getAttribute('data-edit'); openEdit(); });
    });
    content.querySelectorAll('[data-audit]').forEach(function (b) {
      // 审核 = 打开「扫码验收」弹窗（图一口径），弹内扫码复核后点「直接审核」
      b.addEventListener('click', function () { sel = b.getAttribute('data-audit'); openScanVerify(); });
    });
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var billNo = b.getAttribute('data-del');
        UI.confirm('确定删除入库单 <b>' + esc(billNo) + '</b>？<br><span class="text-secondary" style="font-size:12.5px;">仅未审核单据可删除，删除后不可恢复。</span>', function () {
          S.inDocs = S.inDocs.filter(function (d) { return d.billNo !== billNo; });
          if (sel === billNo) sel = null;
          save(); renderAll();
          window.showToast('已删除入库单 ' + billNo);
        });
      });
    });
    content.querySelectorAll('[data-ptab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-ptab'); renderAll(); });
    });
    // 选择列表：勾选/点行只是选中，不直接验收
    function togglePick(code) {
      if (picked[code]) delete picked[code]; else picked[code] = true;
      renderAll();
    }
    content.querySelectorAll('[data-pick]').forEach(function (c) {
      c.addEventListener('change', function () { togglePick(c.getAttribute('data-pick')); });
    });
    content.querySelectorAll('[data-pickrow]').forEach(function (tr) {
      tr.addEventListener('click', function () { togglePick(tr.getAttribute('data-pickrow')); });
    });
    content.querySelectorAll('[data-delcode]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = selDoc(); if (!d) return;
        var c = d.codes.splice(+b.getAttribute('data-delcode'), 1)[0];
        if (c) delete picked[c.code];
        save(); renderAll();
        window.showToast('已删除追溯码 ' + (c ? c.code : ''));
      });
    });
    content.querySelectorAll('[data-gobad]').forEach(function (b) {
      b.addEventListener('click', function () { window.store.go('bad-codes.html'); });
    });
    var ma = document.getElementById('btnManualAudit');
    if (ma) ma.addEventListener('click', manualAudit);
    var pa = document.getElementById('btnPickAll');
    if (pa) pa.addEventListener('click', function () {
      var d = selDoc(); if (!d) return;
      var pickable = d.codes.filter(function (c) { return !c.checked && P.parseCode(c.code, S.dict).dict; });
      var allPicked = pickable.length > 0 && pickable.every(function (c) { return picked[c.code]; });
      pickable.forEach(function (c) { if (allPicked) delete picked[c.code]; else picked[c.code] = true; });
      renderAll();
    });
    var rp = document.getElementById('btnReparse');
    if (rp) rp.addEventListener('click', reparseSel);
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  // ===== 人工验收入库：选中码标记已验收；全部验收 → 直接审核进已完成单 =====
  function manualAudit() {
    var d = selDoc();
    if (!d || d.audit !== '未审核') return;
    var keys = d.codes.filter(function (c) { return picked[c.code] && !c.checked; }).map(function (c) { return c.code; });
    if (!keys.length) { window.showToast('请先在码详情中勾选要人工验收的追溯码'); return; }
    var bad = docBad(d).length;
    if (bad) {
      window.showToast('存在 ' + bad + ' 个异常码，已拦截——请先到「异常标识码」维护字典');
      tab = 'bad'; renderAll(); return;
    }
    keys.forEach(function (k) {
      d.codes.forEach(function (c) { if (c.code === k) c.checked = true; });
      delete picked[k];
    });
    save();
    var un = d.codes.length - checkedCount(d);
    if (un === 0) { auditSel(); return; }   // 全部验收 → 走审核（进已完成单）
    renderAll();
    window.showToast('已人工验收 ' + keys.length + ' 个（' + checkedCount(d) + '/' + d.codes.length + '），剩余 ' + un + ' 个待验收');
  }

  // ===== 重新解析：字典维护后一键重跑解析，报告剩余异常 =====
  function reparseSel() {
    var d = selDoc();
    if (!d) { window.showToast('请先选择一张入库单'); return; }
    var bad = docBad(d).length;
    save(); renderAll();
    window.showToast(bad ? '重新解析完成：仍有 ' + bad + ' 个异常码未匹配字典' : '重新解析完成：全部追溯码已正常解析，可以审核');
  }

  // ===== 编辑入库单（仅未审核）：库房 / 库位 / 发票号 =====
  function openEdit() {
    var d = selDoc();
    if (!d || d.audit !== '未审核') return;
    var whOpts = P.warehouses().map(function (w) { return '<option' + (w === d.warehouse ? ' selected' : '') + '>' + esc(w) + '</option>'; }).join('');
    var locOpts = '<option value="">请选择</option>' + P.LOC_PRESET.map(function (l) { return '<option' + (l === d.location ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
    UI.modalShell('pchEdit', '编辑入库单 · ' + d.billNo,
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label">供应商</label><input class="form-control" value="' + esc(d.supplier) + '" disabled></div>' +
      '<div class="col-6"><label class="form-label required">库房</label><select class="form-select" id="edWarehouse">' + whOpts + '</select></div></div>' +
      '<div class="row g-3">' +
      '<div class="col-6"><label class="form-label">库位</label><select class="form-select" id="edLocation">' + locOpts + '</select></div>' +
      '<div class="col-6"><label class="form-label">发票号</label><input class="form-control" id="edInvoice" value="' + esc(d.invoice || '') + '"></div></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="edOk">保存</button>', 560);
    var el = UI.open('pchEdit');
    el.querySelector('#edOk').addEventListener('click', function () {
      d.warehouse = el.querySelector('#edWarehouse').value;
      d.location = el.querySelector('#edLocation').value;
      d.invoice = el.querySelector('#edInvoice').value.trim();
      save(); UI.close('pchEdit'); renderAll();
      window.showToast('入库单 ' + d.billNo + ' 已保存修改');
    });
  }

  // ===== 弹窗A：新增入库单 = 选择到货单（拉取+手动单都可选，可筛供应商）+ 入库信息（库房/库位/发票号） =====
  function openDownload() {
    var sups = S.arrive.map(function (o) { return o.supplier; }).filter(function (s, i, arr) { return arr.indexOf(s) === i; });
    var curWh = (window.store.load().currentUser || {}).warehouse || '中心库';
    var whOpts = P.warehouses().map(function (w) { return '<option' + (w === curWh ? ' selected' : '') + '>' + esc(w) + '</option>'; }).join('');
    var locOpts = '<option value="">请选择</option>' + P.LOC_PRESET.map(function (l) { return '<option>' + esc(l) + '</option>'; }).join('');

    function rowsHtml(sup) {
      var pending = S.arrive.filter(function (o) { return o.downloaded !== '是' && o.confirm !== '已退货' && (!sup || o.supplier === sup); });
      var rows = pending.map(function (o, i) {
        return '<tr><td><input type="radio" class="form-check-input" name="dlPick" value="' + esc(o.orderNo) + '"></td>' +
          '<td>' + (i + 1) + '</td><td><b>' + esc(o.orderNo) + '</b></td><td class="text-secondary">' + esc(o.orderTime) + '</td>' +
          '<td>' + esc(o.shipper) + '</td><td>' + o.codes.length + '</td>' +
          '<td>' + (o.source === '手动' ? '<span class="badge bg-orange-lt">手动</span>' : '<span class="badge bg-blue-lt">拉取</span>') + '</td>' +
          '<td>' + (o.confirm === '已确认' ? '<span class="text-success">已确认</span>' : '<span class="text-danger">未确认</span>') + '</td></tr>';
      }).join('');
      if (!pending.length) rows = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">暂无可选到货单——请先到「采购到货」新增到货单（或等供应商码单中继传入）</td></tr>';
      return rows;
    }

    UI.modalShell('pchDl', '新增入库单 · 选择到货单',
      '<div class="d-flex align-items-center mb-2" style="gap:10px;">' +
      '<span class="text-secondary" style="font-size:12.5px;">供应商</span>' +
      '<select class="form-select" id="dlSup" style="width:220px;"><option value="">全部供应商</option>' +
        sups.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('') + '</select>' +
      '<span class="text-secondary" style="font-size:12px;">一张到货单生成一张入库单（含全部追溯码）</span></div>' +
      '<div class="table-responsive" style="max-height:260px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th style="width:36px;"></th><th>序号</th><th>到货单号</th><th>到货时间</th><th>发货企业</th><th>码数</th><th>来源</th><th>确认状态</th></tr></thead>' +
      '<tbody id="dlRows">' + rowsHtml('') + '</tbody></table></div>' +
      '<div style="border-top:1px dashed #e2e8f0;margin:12px 0 10px;padding-top:10px;"><b style="font-size:13px;">入库信息</b></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">入库库房</label><select class="form-select" id="dlWarehouse">' + whOpts + '</select></div>' +
      '<div class="col-6"><label class="form-label">库位</label><select class="form-select" id="dlLocation">' + locOpts + '</select></div></div>' +
      '<div class="mb-1"><label class="form-label">发票号</label><input class="form-control" id="dlInvoice" placeholder="选择到货单后自动带入，可修改"></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="dlOk">生成入库单</button>', 860);
    var el = UI.open('pchDl');
    el.querySelector('#dlSup').addEventListener('change', function () {
      el.querySelector('#dlRows').innerHTML = rowsHtml(el.querySelector('#dlSup').value);
    });
    // 选中到货单 → 带入发票号
    el.querySelector('#dlRows').addEventListener('change', function (e) {
      var o = S.arrive.filter(function (x) { return x.orderNo === e.target.value; })[0];
      if (o) el.querySelector('#dlInvoice').value = o.invoice || '';
    });
    el.querySelector('#dlOk').addEventListener('click', function () {
      var picked = el.querySelector('input[name="dlPick"]:checked');
      if (!picked) { window.showToast('请先选择一张到货单'); return; }
      var o = S.arrive.filter(function (x) { return x.orderNo === picked.value; })[0];
      if (!o) return;
      if (!o.codes.length) { window.showToast('到货单 ' + o.orderNo + ' 还没有码明细，请先到「采购到货」录入'); return; }
      o.downloaded = '是';
      o.confirm = '已确认';
      o.invoice = el.querySelector('#dlInvoice').value.trim();
      S.inDocs.unshift({ billNo: o.orderNo, date: now(), supplier: o.supplier, invoice: o.invoice,
        warehouse: el.querySelector('#dlWarehouse').value, location: el.querySelector('#dlLocation').value,
        audit: '未审核', hisPush: '', downloadTime: now(), auditDate: '', auditor: '', source: o.source === '手动' ? '手动' : '下载',
        codes: o.codes.map(function (c) { return Object.assign({}, c); }) });
      sel = o.orderNo; tab = 'codes'; picked = {};
      save(); UI.close('pchDl'); renderAll();
      window.showToast('已按到货单 ' + o.orderNo + ' 生成入库单，请核对后审核');
    });
  }

  // ===== 弹窗C：扫码验收入库（核对模式 + 手动单录入模式；含 扫码移除 / 拆零 / 直接审核） =====
  function openScanVerify() {
    var d = selDoc();
    if (!d) { window.showToast('请先选择一张入库单'); return; }
    if (d.audit !== '未审核') { window.showToast(d.audit === '已退货' ? '该单已到货退货冲销，不可再扫码' : '已审核单据不可再扫码'); return; }
    var manual = d.source === '手动';
    UI.openScan({
      title: manual ? '扫码录入 · ' + d.billNo : '扫码验收 · ' + d.billNo,
      hint: (manual ? '手动单：扫到的码直接录入码清单' : '扫到的码与码单比对：绿=在码单内，红=不在码单（多送/串货）') + '；核对完可点「直接审核」',
      gate: 'in', node: d.warehouse,
      flags: [{ key: 'remove', label: '扫码移除' }, { key: 'split', label: '拆零' }],
      onScan: function (code, flags) {
        var i, idx = -1, c = null;
        for (i = 0; i < d.codes.length; i++) {
          if (d.codes[i].code === code) { c = d.codes[i]; idx = i; break; }
        }
        if (flags.remove) {
          if (!c) return { level: 'warn', msg: '码清单中不存在，无法移除' };
          d.codes.splice(idx, 1); save();
          return { level: 'ok', msg: '已移除' };
        }
        if (c) {
          if (c.checked) return { level: 'warn', msg: '重复扫码，已验收过' };
          c.checked = true;
          if (flags.split) { c.split = '是'; c.splitQty = c.splitQty || '1'; }
          save();
          return { level: 'ok', msg: '核对通过（' + checkedCount(d) + '/' + d.codes.length + '）' };
        }
        if (manual) {
          var p = P.parseCode(code, S.dict);
          d.codes.push({ code: code, level: 1, split: flags.split ? '是' : '否', splitQty: flags.split ? '1' : '',
            batch: '—', prodDate: '—', expDate: '—', checked: true, code2: '', code3: '', location: d.location || '' });
          save();
          return p.dict
            ? { level: 'ok', msg: '已录入：' + p.dict.drugName + ' ' + p.dict.formSpec }
            : { level: 'warn', msg: '已录入，但标识码未维护（见异常码页签）' };
        }
        return { level: 'bad', msg: '不在码单内！多送 / 串货，请转全量扫码核对' };
      },
      onAudit: function () { auditSel(); },   // 图二「直接审核」：扫码弹窗内一键审核
      onClose: function () { save(); renderAll(); }
    });
  }

  // ===== 审核：异常码硬拦截；未验收软确认 =====
  function auditSel() {
    var d = selDoc();
    if (!d) { window.showToast('请先选择一张入库单'); return; }
    if (d.audit !== '未审核') return;
    if (!W.assertUnfrozen(d.warehouse)) return;
    var bad = docBad(d).length;
    if (bad) {
      window.showToast('存在 ' + bad + ' 个异常码，已拦截审核——请先到「异常标识码」维护字典');
      tab = 'bad'; renderAll(); return;
    }
    var un = d.codes.length - checkedCount(d);
    var doAudit = function () {
      d.audit = '已审核'; d.auditDate = now();
      var u = window.store.load().currentUser || {};
      d.auditor = u.name || '王铁军';
      d.hisPush = '已推送';
      save(); renderAll();
      window.showToast('入库单 ' + d.billNo + ' 审核完成，' + d.codes.length + ' 个追溯码已入台账（库房在架），单据已进入「已完成单」');
    };
    if (un > 0) UI.confirm('还有 <b>' + un + '</b> 盒未验收（未扫码也未勾选），确定审核入库？', doAudit, '确定审核');
    else doAudit();
  }

  // 默认选中：支持跨页跳转带入（purchase-detail「查看单据」→ purchase-in.html?billNo=xxx）
  var qs = new URLSearchParams(location.search);
  if (qs.get('billNo') && S.inDocs.some(function (d) { return d.billNo === qs.get('billNo'); })) {
    sel = qs.get('billNo');
  } else if (S.inDocs.length) sel = S.inDocs[0].billNo;
  renderAll();
})();
