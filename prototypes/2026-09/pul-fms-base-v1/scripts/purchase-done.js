/**
 * purchase-done.js — 已完成单：已审核入库单只读档案
 * 字段对齐老系统：发票号/库房/HIS推送/下载时间/审核日期/审核人/异常信息 + 三页签（只读，码详情带药名通用名）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pdone', crumb: ['库房管理', '采购管理', '已完成单'] });
  if (!content) return;

  var P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = P.load();
  var sel = null, tab = 'codes';
  var filters = { billNo: '', supplier: '', invoice: '', dateFrom: '', dateTo: '' };

  function doneDocs() {
    return S.inDocs.filter(function (d) { return d.audit === '已审核'; });
  }
  function selDoc() {
    var list = doneDocs();
    for (var i = 0; i < list.length; i++) if (list[i].billNo === sel) return list[i];
    return null;
  }
  function filtered() {
    return doneDocs().filter(function (d) {
      if (filters.billNo && d.billNo.indexOf(filters.billNo) === -1) return false;
      if (filters.supplier && d.supplier.indexOf(filters.supplier) === -1) return false;
      if (filters.invoice && (d.invoice || '').indexOf(filters.invoice) === -1) return false;
      if (filters.dateFrom && d.date.slice(0, 10) < filters.dateFrom) return false;
      if (filters.dateTo && d.date.slice(0, 10) > filters.dateTo) return false;
      return true;
    });
  }

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fBillNo" style="width:160px;" placeholder="单据编号" value="' + esc(filters.billNo) + '">' +
      '<input class="form-control" id="fSupplier" style="width:170px;" placeholder="供应商" value="' + esc(filters.supplier) + '">' +
      '<input class="form-control" id="fInvoice" style="width:140px;" placeholder="发票号" value="' + esc(filters.invoice) + '">' +
      '<input class="form-control" id="fDateFrom" type="date" style="width:150px;" value="' + filters.dateFrom + '">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fDateTo" type="date" style="width:150px;" value="' + filters.dateTo + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-outline-primary" id="btnPrint">⎙ 打印</button></div>' +
      '</div></div></div>';
  }

  function docTable() {
    var list = filtered();
    var rows = list.map(function (d, i) {
      var bad = P.badCodesOf(d, S.dict).length;
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(d.billNo) + '</b></td>' +
        '<td class="text-secondary">' + esc(d.date) + '</td><td>' + esc(d.supplier) + '</td>' +
        '<td class="text-secondary">' + esc(d.invoice || '—') + '</td><td>' + esc(d.warehouse) + '</td>' +
        '<td>' + UI.light(d.hisPush || '未推送') + '</td>' +
        '<td class="text-secondary">' + esc(d.downloadTime || '—') + '</td>' +
        '<td class="text-secondary">' + esc(d.auditDate) + '</td><td>' + esc(d.auditor) + '</td>' +
        '<td>' + (bad ? '<span class="text-danger" style="font-size:12.5px;">' + bad + ' 个异常码</span>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td onclick="event.stopPropagation()"><button class="btn btn-sm btn-outline-warning" data-unaudit="' + esc(d.billNo) + '">反审核</button></td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="12" class="text-center text-secondary" style="padding:32px;">暂无已审核单据——采购入库审核后归档到这里</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据日期</th><th>供应商</th><th>发票号</th><th>库房</th><th>HIS推送</th><th>下载时间</th><th>审核日期</th><th>审核人</th><th>异常信息</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer" style="font-size:12.5px;"><span class="text-secondary">共 ' + list.length + ' 条 · 反审核后单据退回「采购入库」重新核对，HIS 推送同步撤回</span></div></div>';
  }

  function tabSection() {
    var d = selDoc();
    var bad = d ? P.badCodesOf(d, S.dict) : [];
    var tabs = [
      { key: 'codes', name: '码详情' },
      { key: 'drugs', name: '药品清单' },
      { key: 'bad', name: '异常码', badge: bad.length || '' }
    ];
    var body;
    if (!d) body = '<div class="text-center text-secondary" style="padding:40px;">点击上方单据行，查看码详情</div>';
    else if (tab === 'codes') body = codesPanel(d);
    else if (tab === 'drugs') body = drugsPanel(d);
    else body = badPanel(d, bad);
    return '<div class="card">' + UI.tabsHeader(tabs, tab) + '<div class="pch-tab-panel">' + body + '</div></div>';
  }

  function codesPanel(d) {
    var rows = d.codes.map(function (c, i) {
      var p = P.parseCode(c.code, S.dict);
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td>' + esc(c.split) + '</td><td>' + esc(c.splitQty || '—') + '</td>' +
        '<td>' + esc(c.batch) + '</td><td>' + esc(c.prodDate) + '</td><td>' + esc(c.expDate) + '</td>' +
        '<td>' + esc(p.dict ? p.dict.drugName : '—') + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12px;" class="text-secondary">' + esc(c.code2 || '—') + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12px;" class="text-secondary">' + esc(c.code3 || '—') + '</td></tr>';
    }).join('');
    return '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品追溯码(一级)</th><th>拆零</th><th>拆零数</th><th>批次号</th><th>生产日期</th><th>有效期至</th><th>药名通用名</th><th>药品追溯码(二级)</th><th>药品追溯码(三级)</th></tr></thead>' +
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
    return '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药名通用名</th><th>制剂规格</th><th>包装规格</th><th>批次号</th><th>生产日期</th><th>有效期至</th><th>数量</th><th>单位</th><th>批准文号</th><th>生产企业</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function badPanel(d, bad) {
    var rows = bad.map(function (c, i) {
      var p = P.parseCode(c.code, S.dict);
      return '<tr class="pch-row-bad"><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td>' + esc(p.idcode) + '</td><td><span class="text-danger">标识码未维护，无法解析药品</span></td></tr>';
    }).join('');
    if (!bad.length) rows = '<tr><td colspan="4" class="text-center text-secondary" style="padding:28px;">无异常码</td></tr>';
    return '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品追溯码</th><th>标识码</th><th>异常原因</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function renderAll() {
    content.innerHTML = filterBar() + docTable() + tabSection();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { billNo: v('fBillNo'), supplier: v('fSupplier'), invoice: v('fInvoice'),
        dateFrom: v('fDateFrom'), dateTo: v('fDateTo') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { billNo: '', supplier: '', invoice: '', dateFrom: '', dateTo: '' };
      renderAll();
    });
    document.getElementById('btnPrint').addEventListener('click', function () {
      window.showToast('已生成打印预览（原型演示）');
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-ptab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-ptab'); renderAll(); });
    });
    // 反审核：退回「采购入库」重新核对；防呆——已有审核退货单引用本单码时拦截（先冲正退货单）
    content.querySelectorAll('[data-unaudit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var billNo = b.getAttribute('data-unaudit');
        var d = S.inDocs.filter(function (x) { return x.billNo === billNo; })[0];
        if (!d) return;
        var consumed = [];
        S.outDocs.forEach(function (od) {
          if (od.status !== '已审核') return;
          (od.codes || []).forEach(function (rc) {
            if ((d.codes || []).some(function (c) { return c.code === rc.code; })) consumed.push(rc.code);
          });
        });
        if (consumed.length) {
          window.showToast('不可反审核：' + consumed.length + ' 个码已被已审核退货单引用，请先处理退货单');
          return;
        }
        UI.confirm('确定反审核入库单 <b>' + esc(billNo) + '</b>？<br><span class="text-secondary" style="font-size:12.5px;">反审核后单据退回「采购入库」重新核对，' + d.codes.length + ' 个追溯码从在架库存撤出，HIS 推送同步撤回。</span>', function () {
          d.audit = '未审核'; d.auditDate = ''; d.auditor = ''; d.hisPush = '';
          P.save(S);
          sel = null; tab = 'codes';
          renderAll();
          window.showToast('已反审核 ' + billNo + '，请到「采购入库」重新核对');
        }, '确定反审核');
      });
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  var first = doneDocs()[0];
  if (first) sel = first.billNo;
  renderAll();
})();
