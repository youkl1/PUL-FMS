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
  var filters = { billNo: '', shipper: '', receiver: '', invoice: '', dateFrom: '', dateTo: '' };

  function selDoc() {
    for (var i = 0; i < S.inDocs.length; i++) if (S.inDocs[i].billNo === sel) return S.inDocs[i];
    return null;
  }
  // 扫码数量 = 已核对码数（2026-10-13 Round BV 列表补「扫码数量」列；入库单为审核通过的结果台账，码即已扫）
  function checkedCount(d) { return (d.codes || []).filter(function (c) { return c.checked; }).length; }
  function filtered() {
    return S.inDocs.filter(function (d) {
      if (filters.billNo && d.billNo.indexOf(filters.billNo) === -1) return false;
      if (filters.shipper && (d.shipper || d.supplier || '').indexOf(filters.shipper) === -1) return false;
      if (filters.receiver && (d.receiver || '').indexOf(filters.receiver) === -1) return false;
      if (filters.invoice && (d.invoice || '').indexOf(filters.invoice) === -1) return false;
      if (filters.dateFrom && d.date.slice(0, 10) < filters.dateFrom) return false;
      if (filters.dateTo && d.date.slice(0, 10) > filters.dateTo) return false;
      return true;
    });
  }

  // 筛选栏（2026-10-13 Round BT：统一「文本标签+控件」——PchUI.fItem；供应商→发货方 + 增收货方）
  function filterBar() {
    var F = UI.fItem;
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      F('单据编号', '<input class="form-control" id="fBillNo" style="width:150px;" value="' + esc(filters.billNo) + '">') +
      F('发货方', '<input class="form-control" id="fShipper" style="width:160px;" value="' + esc(filters.shipper) + '">') +
      F('收货方', '<input class="form-control" id="fReceiver" style="width:110px;" value="' + esc(filters.receiver) + '">') +
      F('发票号', '<input class="form-control" id="fInvoice" style="width:130px;" value="' + esc(filters.invoice) + '">') +
      F('单据日期', '<input class="form-control" id="fDateFrom" type="date" style="width:138px;" value="' + filters.dateFrom + '">' +
        '<span class="text-secondary">-</span>' +
        '<input class="form-control" id="fDateTo" type="date" style="width:138px;" value="' + filters.dateTo + '">') +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '</div></div></div>';
  }

  function docTable() {
    var list = filtered();
    var rows = list.map(function (d, i) {
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(d.billNo) + '</b>' + (d.source === '手动' ? ' <span class="badge bg-orange-lt">手动</span>' : '') + '</td>' +
        '<td>采购入库</td>' +
        '<td class="text-secondary">' + esc(d.date) + '</td><td>' + esc(d.shipper || d.supplier) + '</td>' +
        '<td>' + esc(d.receiver || '—') + '</td>' +
        '<td>' + esc(d.warehouse) + (d.location ? '<br><span class="text-secondary" style="font-size:12px;">库位 ' + esc(d.location) + '</span>' : '') + '</td>' +
        '<td class="text-secondary">' + esc(d.invoice || '—') + '</td>' +
        '<td><b>' + d.codes.length + '</b></td><td>' + checkedCount(d) + '</td>' +
        '<td>' + esc(d.auditor) + '</td><td class="text-secondary">' + esc(d.auditDate) + '</td>' +
        '<td>' + UI.light(d.hisPush || '未推送') + '</td>' +
        '<td>' + UI.light(d.miPush || '未推送') + '</td>' +
        '<td onclick="event.stopPropagation()" style="white-space:nowrap;">' +
          '<button class="btn btn-sm btn-outline-primary" data-push-his="' + esc(d.billNo) + '">推送HIS</button> ' +
          '<button class="btn btn-sm btn-outline-success" data-push-mi="' + esc(d.billNo) + '">推送医保</button> ' +
          '<button class="btn btn-sm btn-outline-azure" data-flow="' + esc(d.billNo) + '">流转</button> ' +
          '<button class="btn btn-sm btn-outline-warning" data-unaudit="' + esc(d.billNo) + '">反审核</button></td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="15" class="text-center text-secondary" style="padding:32px;">暂无入库单——到货单在「采购到货单」页审核后自动生成（已审核·在架·HIS 已推送）</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据类型</th><th>单据日期</th><th>发货方</th><th>收货方</th><th>库房</th><th>发票号</th><th>码数</th><th>扫码数量</th><th>审核人</th><th>审核时间</th><th>HIS推送</th><th>医保推送</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  // ===== 两只读页签：码详情 / 药品清单 → PulDocDetail 标准 model/options → 公共组件渲染 =====
  var ISSUER = { '阿里': '码上放心', 'GS1': 'GS1', 'IDCODE': 'IDCODE' };
  var LVL_TXT = { 1: '一级码', 2: '二级码', 3: '三级码' };
  var detailModel = { drugs: [], codes: [], bad: [], activeTab: tab, empty: true };
  function tabSection() {
    var d = selDoc();
    detailModel = d ? { drugs: drugsPanel(d), codes: codesPanel(d), bad: [], activeTab: tab }
      : { drugs: [], codes: [], bad: [], activeTab: tab, empty: true };
    return window.PulDocDetail.renderTabs(detailModel, {
      title: '入库明细',
      metaHtml: d ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · 共 ' + d.codes.length + ' 个追溯码</span>' : '',
      emptyText: '点击上方单据行，查看码详情',
      tabs: ['codes', 'drugs'],
      counts: { codes: 'rows' },
      codes: {
        // 码表公共 12 列子集（旧 8 列收敛：药品追溯码(一级)→药品追溯码、二级/三级码列→码层级/父级码公共口径）
        columns: ['seq', 'code', 'drugName', 'level', 'parentCode', 'batch', 'prodDate', 'expDate'],
        emptyText: '码清单为空'
      },
      drugs: {
        columns: ['seq', 'drugName', 'formSpec', 'packSpec', 'batch', 'prodDate', 'expDate', 'qty', 'unit', 'approval', 'maker'],
        emptyText: '暂无可解析药品'
      }
    });
  }

  // 码详情（2026-10-10 拍板：删 拆零/拆零数 两列——拆零信息在药品清单与库存查询表达，逐码视图不重复展示）
  function codesPanel(d) {
    return d.codes.map(function (c) {
      var p = P.parseCode(c.code, S.dict);
      return {
        raw: c,
        code: c.code,
        drugName: p.dict ? p.dict.drugName : '—',
        level: p.dict ? (LVL_TXT[p.dict.level] || (p.dict.level + '级码')) : '—',
        parentCode: c.parentCode || '—',
        batch: c.batch || '—',
        prodDate: c.prodDate || '—',
        expDate: c.expDate || '—'
      };
    });
  }

  // 药品清单（2026-10-14 需求拍板：「扫码数量」口径保留——summarize 第三参 true 只统计已核对码，与列表扫码数量列同源）
  function drugsPanel(d) {
    return P.summarize(d.codes, S.dict, true).map(function (r) {
      return {
        raw: r,
        drugName: r.drugName, formSpec: r.formSpec, packSpec: r.packSpec,
        batch: r.batch, prodDate: r.prodDate, expDate: r.expDate,
        qty: r.qty, unit: r.unit, approval: r.approval, maker: r.maker
      };
    });
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

  // ===== 推送HIS（2026-10-13 Round BV 用户拍板：只保留「推送」，无码推送/不推送两通道删除） =====
  function openPushHis(billNo) {
    var d = docByNo(billNo);
    if (!d) return;
    UI.modalShell('pchPushHis', '提示',
      '<div style="font-size:14px;line-height:1.8;">当前单据：<b>' + esc(billNo) + '</b>，是否推送 HIS？' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:6px;">推送=单据头 + ' + d.codes.length + ' 个追溯码明细。</div></div>',
      '<button class="btn btn-primary" data-his="已推送">推送</button>' +
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>', 460);
    var el = UI.open('pchPushHis');
    el.querySelectorAll('[data-his]').forEach(function (b) {
      b.addEventListener('click', function () {
        d.hisPush = b.getAttribute('data-his');
        P.save(S); UI.close('pchPushHis'); renderAll();
        window.showToast('已推送 HIS：' + billNo);
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
      UI.close('pchFlowPick');
      // 2026-10-13 Round BT：跳页改弹窗（复用 scan-hub?embed=1），关闭回本页刷新
      UI.openScanHub(billNo, renderAll);
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
      filters = { billNo: v('fBillNo'), shipper: v('fShipper'), receiver: v('fReceiver'), invoice: v('fInvoice'),
        dateFrom: v('fDateFrom'), dateTo: v('fDateTo') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { billNo: '', shipper: '', receiver: '', invoice: '', dateFrom: '', dateTo: '' };
      renderAll();
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    // 明细双页签切换统一走 PulDocDetail.bind（替代原页签行监听；只读无行级动作）
    window.PulDocDetail.bind(content, {
      model: detailModel,
      onTab: function (key) { tab = key; renderAll(); }
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
    // 反审核：删入库单 + 码撤出架 + HIS 撤回 + 到货单回「待审核」；防呆（2026-10-13 Round BV 用户拍板）：已推送 HIS / 码已入库药房 不允许反审核；
    // 已有审核退货单引用本单码时也拦截（先冲正退货单）
    content.querySelectorAll('[data-unaudit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var billNo = b.getAttribute('data-unaudit');
        var d = S.inDocs.filter(function (x) { return x.billNo === billNo; })[0];
        if (!d) return;
        if (d.hisPush === '已推送') { window.showToast('不可反审核：单据已推送 HIS，请先在 HIS 侧撤回'); return; }
        if ((d.codes || []).some(function (c) { return c.phLoc; })) { window.showToast('不可反审核：追溯码已入库药房（已上架货位），请先走退货流程'); return; }
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
              receiver: '中心院区', docType: '销售出库', source: d.source === '手动' ? '手动' : '拉取',
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
