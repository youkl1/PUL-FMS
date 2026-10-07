/**
 * purchase-in.js — 采购入库单：结果台账 + 推送/流转（2026-10-03 补老系统缺失功能）
 * 入库单在「采购到货单」审核时直接生成（已审核·在架·HIS 已推送），本页做查询 + 只读明细 + 四个行内操作：
 * 推送HIS（推送/无码推送/不推送，对齐老系统图二）· 推送医保（图三）· 流转（领用出库/采购退货，图四）· 反审核
 * 反审核 = 删除入库单（码撤出架、HIS 撤回）+ 回链到货单退「待审核」；防呆：被已审核退货单引用的码拦截
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pin', crumb: ['采购管理', '采购入库单', '采购入库单'] });
  if (!content) return;

  var P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = P.load();
  var sel = null, tab = 'codes';
  var filters = { billNo: '', supplier: '', invoice: '', dateFrom: '', dateTo: '' };

  function selDoc() {
    for (var i = 0; i < S.inDocs.length; i++) if (S.inDocs[i].billNo === sel) return S.inDocs[i];
    return null;
  }
  function filtered() {
    return S.inDocs.filter(function (d) {
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
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(d.billNo) + '</b>' + (d.source === '手动' ? ' <span class="badge bg-orange-lt">手动</span>' : '') + '</td>' +
        '<td class="text-secondary">' + esc(d.date) + '</td><td>' + esc(d.supplier) + '</td>' +
        '<td>' + esc(d.warehouse) + (d.location ? '<br><span class="text-secondary" style="font-size:12px;">库位 ' + esc(d.location) + '</span>' : '') + '</td>' +
        '<td class="text-secondary">' + esc(d.invoice || '—') + '</td>' +
        '<td><b>' + d.codes.length + '</b></td>' +
        '<td>' + esc(d.auditor) + '</td><td class="text-secondary">' + esc(d.auditDate) + '</td>' +
        '<td>' + UI.light(d.hisPush || '未推送') + '</td>' +
        '<td>' + UI.light(d.miPush || '未推送') + '</td>' +
        '<td onclick="event.stopPropagation()" style="white-space:nowrap;">' +
          '<button class="btn btn-sm btn-outline-primary" data-push-his="' + esc(d.billNo) + '">推送HIS</button> ' +
          '<button class="btn btn-sm btn-outline-success" data-push-mi="' + esc(d.billNo) + '">推送医保</button> ' +
          '<button class="btn btn-sm btn-outline-azure" data-flow="' + esc(d.billNo) + '">流转</button> ' +
          '<button class="btn btn-sm btn-outline-warning" data-unaudit="' + esc(d.billNo) + '">反审核</button></td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="12" class="text-center text-secondary" style="padding:32px;">暂无入库单——到货单在「采购到货单」页审核后自动生成（已审核·在架·HIS 已推送）</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据日期</th><th>供应商</th><th>库房</th><th>发票号</th><th>码数</th><th>审核人</th><th>审核时间</th><th>HIS推送</th><th>医保推送</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer" style="font-size:12.5px;"><span class="text-secondary">共 ' + list.length + ' 条 · 推送HIS/推送医保=补推或重推两通道；流转=以本单码直接生成领用出库草稿或采购退货单；反审核后入库单消失、码撤出架、HIS 撤回，对应到货单退回「采购到货单」待审核</span></div></div>';
  }

  // ===== 两只读页签：码详情（带药名通用名）/ 药品清单 =====
  function tabSection() {
    var d = selDoc();
    var tabs = [{ key: 'codes', name: '码详情' }, { key: 'drugs', name: '药品清单' }];
    var body;
    if (!d) body = '<div class="text-center text-secondary" style="padding:40px;">点击上方单据行，查看码详情</div>';
    else if (tab === 'codes') body = codesPanel(d);
    else body = drugsPanel(d);
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
        '<td>' + esc(r.packSpec) + '</td><td>' + esc(r.batch) + '</td><td>' + esc(r.prodDate) + '</td><td>' + esc(r.expDate) + '</td>' +
        '<td><b>' + r.qty + '</b></td><td>' + esc(r.unit) + '</td>' +
        '<td class="text-secondary">' + esc(r.approval) + '</td><td class="text-secondary">' + esc(r.maker) + '</td></tr>';
    }).join('');
    return '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药名通用名</th><th>制剂规格</th><th>包装规格</th><th>批次号</th><th>生产日期</th><th>有效期至</th><th>数量</th><th>单位</th><th>批准文号</th><th>生产企业</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function renderAll() {
    content.innerHTML = filterBar() + docTable() + tabSection();
    bind();
  }

  function docByNo(billNo) {
    for (var i = 0; i < S.inDocs.length; i++) if (S.inDocs[i].billNo === billNo) return S.inDocs[i];
    return null;
  }
  function now() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  // ===== 推送HIS（老系统图二：推送=含码明细 / 无码推送=只推单据头 / 不推送=人工标记跳过） =====
  function openPushHis(billNo) {
    var d = docByNo(billNo);
    if (!d) return;
    UI.modalShell('pchPushHis', '提示',
      '<div style="font-size:14px;line-height:1.8;">当前单据：<b>' + esc(billNo) + '</b>，是否推送 HIS？' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:6px;">推送=单据头 + ' + d.codes.length + ' 个追溯码明细；无码推送=只推单据头与药品汇总；不推送=标记本单跳过（可稍后重推）。</div></div>',
      '<button class="btn btn-primary" data-his="已推送">推送</button>' +
      '<button class="btn btn-outline-primary" data-his="无码推送">无码推送</button>' +
      '<button class="btn btn-outline-secondary" data-his="不推送">不推送</button>' +
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>', 460);
    var el = UI.open('pchPushHis');
    el.querySelectorAll('[data-his]').forEach(function (b) {
      b.addEventListener('click', function () {
        d.hisPush = b.getAttribute('data-his');
        P.save(S); UI.close('pchPushHis'); renderAll();
        window.showToast(d.hisPush === '不推送' ? '已标记 ' + billNo + ' 不推送 HIS' : '已推送 HIS（' + d.hisPush + '）：' + billNo);
      });
    });
  }

  // ===== 推送医保（老系统图三） =====
  function openPushMi(billNo) {
    var d = docByNo(billNo);
    if (!d) return;
    UI.modalShell('pchPushMi', '信息',
      '<div style="font-size:14px;line-height:1.8;">当前单据：<b>' + esc(billNo) + '</b>，是否推送 医保？</div>',
      '<button class="btn btn-primary" data-ok>推送</button>' +
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>', 420);
    var el = UI.open('pchPushMi');
    el.querySelector('[data-ok]').addEventListener('click', function () {
      d.miPush = '已推送';
      P.save(S); UI.close('pchPushMi'); renderAll();
      window.showToast('已推送医保：' + billNo);
    });
  }

  // ===== 流转（老系统图四）：以本单码直接生成下游单据 =====
  function openFlow(billNo) {
    var d = docByNo(billNo);
    if (!d) return;
    UI.modalShell('pchFlow', '选择流转类型',
      '<div class="d-grid gap-2">' +
      '<button class="btn btn-primary" id="flLy" style="padding:10px;">↪ 领用出库</button>' +
      '<button class="btn btn-warning" id="flTh" style="padding:10px;">↩ 采购退货</button>' +
      '</div>' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:10px;">领用出库=本单 ' + d.codes.length + ' 个码生成「待出库」领用单草稿，去快捷扫码页核对出库；采购退货=本单码生成「未审核」退货单，去采购退货单页删减后审核。</div>',
      '', 400);
    var el = UI.open('pchFlow');
    el.querySelector('#flLy').addEventListener('click', function () { UI.close('pchFlow'); flowToPick(d); });
    el.querySelector('#flTh').addEventListener('click', function () { UI.close('pchFlow'); flowToReturn(d); });
  }

  // 流转 → 领用出库：选领用药房 → 建「待出库」草稿（码预填，可剔除）→ 跳快捷扫码续作
  function flowToPick(d) {
    var W = window.PUL_WH;
    if (!W) { window.showToast('库房模块未加载，无法流转领用出库'); return; }
    var phs = [];
    try {
      (window.PUL_FACILITY.load().pharmacies || []).forEach(function (p) {
        if (p.status === '启用') phs.push(p);
      });
    } catch (e) { /* facility 缺失 */ }
    if (!phs.length) phs = [{ name: '门诊药房' }];
    UI.modalShell('pchFlowPick', '流转 · 领用出库',
      '<div class="mb-3"><label class="form-label required">领用药房</label><select class="form-select" id="fpPh">' +
      phs.map(function (p) { return '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">按入库单 <b>' + esc(d.billNo) + '</b> 的 ' + d.codes.length + ' 个在架码预填出库草稿（直接出库·无申请单），不需要的码可在下一页剔除；审核出库即扣账进在途。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="fpOk">创建草稿并去扫码</button>', 440);
    var el = UI.open('pchFlowPick');
    el.querySelector('#fpOk').addEventListener('click', function () {
      var wh = W.load();
      var u = window.store.load().currentUser || {};
      var billNo = W.nextNo('LYCK', wh.pickDocs);
      var t = W.now();
      wh.pickDocs.unshift({ billNo: billNo, date: t, pharmacy: el.querySelector('#fpPh').value,
        warehouse: d.warehouse || u.node || '中心库', applicant: u.name || '演示员', operator: u.name || '演示员',
        source: '库房制单', status: '待出库',
        remark: '由采购入库单 ' + d.billNo + ' 流转', shelfLoc: '',
        items: [], badCodes: [], createTime: t, submitTime: t, outTime: '', inTime: '',
        codes: d.codes.map(function (c) { return Object.assign({}, c, { scanHead: '库房备货', shelfTime: '', phLoc: c.phLoc || '', expectLoc: c.expectLoc || '' }); }) });
      W.save(wh);
      location.href = 'quick-scan.html?billNo=' + encodeURIComponent(billNo);
    });
  }

  // 流转 → 采购退货：本单码生成「未审核」库房退货单（refOrder 回链本单）→ 跳采购退货单页
  function flowToReturn(d) {
    var exist = null;
    S.outDocs.forEach(function (x) {
      if (x.refOrder === d.billNo && x.status !== '已审核' && !exist) exist = x;
    });
    if (exist) {
      window.showToast('本单已有在途退货单 ' + exist.billNo + '，直接跳转');
      location.href = 'purchase-out.html?billNo=' + encodeURIComponent(exist.billNo);
      return;
    }
    var billNo = 'TH' + String(Date.now()).slice(-10);
    S.outDocs.unshift({ billNo: billNo, date: now(), supplier: d.supplier,
      warehouse: d.warehouse || '中心库', type: '库房退货', refOrder: d.billNo,
      status: '未审核', auditTime: '',
      codes: d.codes.map(function (c) { return Object.assign({}, c); }), noStock: [] });
    P.save(S);
    window.showToast('已生成退货单 ' + billNo + '（带出 ' + d.codes.length + ' 个码），请删减后审核');
    location.href = 'purchase-out.html?billNo=' + encodeURIComponent(billNo);
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
    content.querySelectorAll('[data-push-his]').forEach(function (b) {
      b.addEventListener('click', function () { openPushHis(b.getAttribute('data-push-his')); });
    });
    content.querySelectorAll('[data-push-mi]').forEach(function (b) {
      b.addEventListener('click', function () { openPushMi(b.getAttribute('data-push-mi')); });
    });
    content.querySelectorAll('[data-flow]').forEach(function (b) {
      b.addEventListener('click', function () { openFlow(b.getAttribute('data-flow')); });
    });
    // 反审核：删入库单 + 码撤出架 + HIS 撤回 + 到货单回「待审核」；防呆——已有审核退货单引用本单码时拦截（先冲正退货单）
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
        UI.confirm('确定反审核入库单 <b>' + esc(billNo) + '</b>？<br><span class="text-secondary" style="font-size:12.5px;">反审核后入库单消失，' + d.codes.length + ' 个追溯码从在架库存撤出，HIS 推送同步撤回；对应到货单退回「采购到货单」待审核（验收记录保留）。</span>', function () {
          S.inDocs = S.inDocs.filter(function (x) { return x.billNo !== billNo; });
          var o = S.arrive.filter(function (x) { return x.orderNo === billNo; })[0];
          if (o) {
            o.downloaded = '否'; o.auditDate = ''; o.auditor = '';
          } else {
            // 兜底：到货单缺失时按入库单快照重建（验收态保留，回到待审核）
            S.arrive.unshift({ orderNo: d.billNo, orderTime: d.date, supplier: d.supplier, shipper: d.supplier,
              receiver: '云岭总医院', docType: '销售出库', source: d.source === '手动' ? '手动' : '拉取',
              confirm: '未确认', downloaded: '否', invoice: d.invoice || '',
              warehouse: d.warehouse || '', loc: d.location || '',
              codes: d.codes.map(function (c) { return Object.assign({}, c); }) });
          }
          P.save(S);
          if (sel === billNo) { sel = null; tab = 'codes'; }
          renderAll();
          window.showToast('已反审核 ' + billNo + '，到货单退回「采购到货单」待审核');
        }, '确定反审核');
      });
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  // 默认选中：支持跨页深链（台账/采购明细「查看单据」→ purchase-in.html?billNo=xxx）
  var qs = new URLSearchParams(location.search);
  if (qs.get('billNo') && S.inDocs.some(function (d) { return d.billNo === qs.get('billNo'); })) {
    sel = qs.get('billNo');
  } else if (S.inDocs.length) sel = S.inDocs[0].billNo;
  renderAll();
})();
