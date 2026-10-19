/**
 * purchase-out.js — 采购退货单：库房在架 → 退回供应商（2026-10-12 Round BL 全面对齐采购到货单统一标准）
 * 列表：实物数量(=码总数)/扫码数量(=已核对数) 两数量列 + 统一异常信息列 + 状态灯 + 操作栏只留按钮
 *   （2026-10-13 Round BR 删「解析数量」列，对齐 Round BL 到货单口径：审核判定看异常码硬拦，解析进度不再单列）
 * 明细：单卡三页签——码详情（12 列对齐采购到货单）/ 药品清单（13 列）/ 异常码（badge；无库存码+解析失败统一登记）
 * 扫码录入：行内按钮直跳统一扫码页（scan-hub?billNo=，第七场景 pur-out），本页扫码弹窗已下线
 *   无库存码（扫了但本库无此码）由统一扫码页登记 badCodes → 审核硬拦、移除放行（老系统「无库存码」页签的统一异常码口径）
 * 审核：行内按钮恒可点（2026-10-13 删空码前置 disabled，对齐公约 §4.2）→ 拦截弹窗级报错（auditBlock：空码/异常码，
 *   各带快捷处理入口）→ P2 审核确认弹窗（核对区：供应商 + ✓无异常码一行，对齐到货单精简版）→ 冻结硬拦 → 落账
 * 2026-10-13 Round BU：到货退货功能删除（用户拍板：到货未入库的单直接删到货单即可，不过度设计）——单一只「库房退货」类型
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pout', crumb: ['采购管理', '采购退货单', '采购退货单'] });
  if (!content) return;

  var P = window.PUL_PCH, D = window.PUL_DRUG, UI = window.PchUI, esc = UI.esc;
  var W = window.PUL_WH || null;   // 盘点冻结拦截（wh-data.js 已加载）
  var S = P.load();
  var DICT = D.flat(D.load());
  var sel = null, tab = 'codes';
  var filters = { code: '', billNo: '', shipper: '', receiver: '', status: '全部', dateFrom: '', dateTo: '' };
  var qsBill = new URLSearchParams(location.search).get('billNo');   // 退货明细查询深链
  if (qsBill) { sel = qsBill; filters.billNo = qsBill; }

  function save() { P.save(S); }
  function now() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function nowLocal() {   // datetime-local 值格式 'YYYY-MM-DDTHH:MM'
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function curUser() { return (window.store && window.store.load().currentUser) || {}; }
  function curWh() { return curUser().warehouse || '中心库'; }
  function selDoc() {
    for (var i = 0; i < S.outDocs.length; i++) if (S.outDocs[i].billNo === sel) return S.outDocs[i];
    return null;
  }
  // ===== 数量列与异常派生（口径对齐采购到货单；2026-10-13 Round BR 删「解析数量」列——异常信息列已表达，同 Round BL 到货单口径） =====
  function checkedCount(d) { return (d.codes || []).filter(function (c) { return c.checked; }).length; }
  function parseFailCodes(d) { return (d.codes || []).filter(function (c) { return !P.parseCode(c.code, DICT).dict; }); }
  function noStockCount(d) { return (d.badCodes || []).filter(function (b) { return (b.reason || '').indexOf('无库存码') === 0; }).length; }
  function issueCount(d) { return (d.badCodes || []).length + parseFailCodes(d).length; }
  function editable(d) { return d && d.status !== '已审核'; }

  function filtered() {
    return S.outDocs.filter(function (d) {
      if (filters.billNo && d.billNo.indexOf(filters.billNo) === -1) return false;
      if (filters.shipper && (d.shipper || d.supplier || '').indexOf(filters.shipper) === -1) return false;
      if (filters.receiver && (d.receiver || '').indexOf(filters.receiver) === -1) return false;
      if (filters.status !== '全部' && d.status !== filters.status) return false;
      if (filters.code && !(d.codes || []).some(function (c) { return c.code.indexOf(filters.code) > -1; })) return false;
      if (filters.dateFrom && d.date.slice(0, 10) < filters.dateFrom) return false;
      if (filters.dateTo && d.date.slice(0, 10) > filters.dateTo) return false;
      return true;
    });
  }

  // 筛选栏（2026-10-13 Round BT：统一「文本标签+控件」——PchUI.fItem；下拉占位词统一「全部」）
  function filterBar() {
    var opt = function (cur, o) { return '<option' + (cur === o ? ' selected' : '') + '>' + o + '</option>'; };
    var F = UI.fItem;
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      F('药品追溯码', '<input class="form-control" id="fCode" style="width:150px;" value="' + esc(filters.code) + '">') +
      F('单据编号', '<input class="form-control" id="fBillNo" style="width:140px;" value="' + esc(filters.billNo) + '">') +
      F('发货方', '<input class="form-control" id="fShipper" style="width:150px;" value="' + esc(filters.shipper) + '">') +
      F('收货方', '<input class="form-control" id="fReceiver" style="width:110px;" value="' + esc(filters.receiver) + '">') +
      F('状态', '<select class="form-select" id="fStatus" style="width:92px;">' +
        ['全部', '未审核', '已审核'].map(function (o) { return opt(filters.status, o); }).join('') + '</select>') +
      F('单据时间', '<input class="form-control" id="fDateFrom" type="date" style="width:138px;" value="' + filters.dateFrom + '">' +
        '<span class="text-secondary">-</span>' +
        '<input class="form-control" id="fDateTo" type="date" style="width:138px;" value="' + filters.dateTo + '">') +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增退货单</button></div>' +
      '</div></div></div>';
  }

  // 状态灯（对齐其他出库单：未审核=琥珀、已审核=绿灯）
  function statusCell(d) {
    if (d.status === '已审核') return UI.light('已审核');
    // TODO(light): 待 PchUI.light 扩展收编琥珀色
    return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>未审核</span>';
  }
  // 异常信息列（统一口径：解析失败×N / 无库存码×N；已审核显 —；点击跳「异常码」页签）
  function issueInfoCell(d) {
    if (d.status === '已审核') return '<span class="text-secondary">—</span>';
    var pf = parseFailCodes(d).length + (d.badCodes || []).length - noStockCount(d);
    var ns = noStockCount(d);
    if (!pf && !ns) return '<span class="text-secondary">—</span>';
    var parts = [];
    if (pf) parts.push('解析失败×' + pf);
    if (ns) parts.push('无库存码×' + ns);
    return '<a href="javascript:void(0)" class="text-danger" data-badtab="' + esc(d.billNo) + '" title="查看异常码明细（解析失败 / 无库存码）">' + parts.join('；') + '</a>';
  }

  function docTable() {
    var list = filtered();
    var rows = list.map(function (d, i) {
      var audited = d.status === '已审核';
      var op;
      if (audited) {
        op = '<span class="text-secondary" style="font-size:12.5px;">' + esc(d.auditor || '—') + '</span>';
      } else {
        op = '<div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-scan="' + esc(d.billNo) + '">扫码录入</button>' +
          // 2026-10-13 拍板：审核按钮恒可点（删空码前置 disabled），点入后 auditFlow 判定弹窗报异常——对齐公约 §4.2
          '<button class="btn btn-sm btn-primary" data-audit="' + esc(d.billNo) + '">审核退货</button>' +
          '<button class="btn btn-sm btn-outline-secondary" data-edit="' + esc(d.billNo) + '">编辑</button>' +
          '<button class="btn btn-sm btn-outline-danger" data-del="' + esc(d.billNo) + '">删除</button>' +
          '</div>';
      }
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(d.billNo) + '</b></td>' +
        '<td>采购退货</td>' +
        '<td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td class="text-secondary">' + esc(d.refOrder || '—') + '</td>' +
        '<td>' + esc(d.shipper || d.supplier) + '</td><td>' + esc(d.receiver || '—') + '</td><td>' + esc(d.warehouse) + '</td>' +
        '<td>' + d.codes.length + '</td><td>' + checkedCount(d) + '</td>' +
        '<td>' + statusCell(d) + '</td>' +
        '<td class="text-secondary">' + esc(d.auditTime || '—') + '</td>' +
        '<td onclick="event.stopPropagation()">' + issueInfoCell(d) + '</td>' +
        '<td onclick="event.stopPropagation()">' + op + '</td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="14" class="text-center text-secondary" style="padding:32px;">暂无退货单，点右上角「+ 新增退货单」创建</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据类型</th><th>单据时间</th><th>关联到货单</th><th>发货方</th><th>收货方</th><th>退货库房</th><th>实物数量</th><th>扫码数量</th><th>状态</th><th>审核时间</th><th>异常信息</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  // ===== 退货明细三页签：原业务计算 → PulDocDetail 标准 model/options → 公共组件渲染 =====
  var ISSUER = { '阿里': '码上放心', 'GS1': 'GS1', 'IDCODE': 'IDCODE' };
  var LVL_TXT = { 1: '一级码', 2: '二级码', 3: '三级码' };
  var detailModel = { drugs: [], codes: [], bad: [], activeTab: tab, empty: true };
  function tabSection() {
    var d = selDoc();
    var issues = d ? issueCount(d) : 0;
    detailModel = d ? {
      drugs: drugsPanel(d), codes: codesPanel(d), bad: badPanel(d), activeTab: tab
    } : { drugs: [], codes: [], bad: [], activeTab: tab, empty: true };
    return window.PulDocDetail.renderTabs(detailModel, {
      title: '退货明细',
      metaHtml: d ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · ' + esc(d.type) + ' · 共 ' + d.codes.length + ' 个码 · ' + esc(d.status) +
        (issues ? ' · <span class="text-danger">异常码 ' + issues + ' 个（审核硬拦）</span>' : '') + '</span>' : '',
      emptyText: '点击上方单据行，查看退货明细',
      tabs: ['codes', 'drugs', 'bad'],
      counts: { codes: 'rows' },
      codes: {
        columns: ['seq', 'code', 'drugName', 'level', 'parentCode', 'batch', 'prodDate', 'expDate', 'scanQty', 'checkStatus', 'idcode', 'issuer', 'actions'],
        emptyText: '退货清单为空——点行内「扫码录入」跳统一扫码页，从在架库存扫码加入'
      },
      drugs: {
        columns: ['seq', 'drugName', 'formSpec', 'packSpec', 'batch', 'prodDate', 'expDate', 'qty', 'unit', 'approval', 'maker'],
        extraColumns: [
          { key: 'locs', title: '库位', cell: function (row) { return row.locsText; } },
          { key: 'dcode', title: '药品编码', cell: function (row) { return row.drugCode; } }
        ],
        emptyText: '暂无可解析药品'
      },
      bad: {
        columns: ['seq', 'code', 'idcode', 'reason', 'time', 'actions'],
        emptyText: '无异常码，可以审核退货',
        note: '审核硬拦：无库存码=扫了但本库无此码（码明细「移除」后放行）；解析失败=删除该码或到药品字典补录标识码'
      }
    });
  }

  // 码详情 = 机器事实逐码视图（公共 12 列 + 操作列；旧口径列名按组件标准收敛：药品追溯码(一级)→药品追溯码、
  // 二级/三级码列→码层级/父级码、批次号→生产批次；行级「移除」走 PulDocDetail 动作 → 原 splice 逻辑；已审核只读无操作）
  function codesPanel(d) {
    var ro = !editable(d);
    return d.codes.map(function (c) {
      var p = P.parseCode(c.code, DICT);
      var bad = !p.dict;
      return {
        raw: c,
        className: bad ? 'pch-row-bad' : (c.checked ? 'pch-row-checked' : ''),
        code: c.code,
        drugName: bad ? '—' : p.dict.drugName,
        level: bad ? '—' : (LVL_TXT[p.dict.level] || (p.dict.level + '级码')),
        parentCode: c.parentCode || '—',
        batch: c.batch || '—',
        prodDate: c.prodDate || '—',
        expDate: c.expDate || '—',
        scanQty: 1,
        scanText: '1',
        status: { kind: c.checked ? 'done' : 'todo', text: c.checked ? '已核对' : '未核对' },
        idcode: p.idcode || c.code.slice(0, 7),
        issuer: ISSUER[p.codeType] || '—',
        actions: ro ? [] : ['removeCode']
      };
    });
  }

  // 药品清单 = 人读汇总（公共列子集 + 本页特有扩展列：库位=组内码库位去重合并、药品编码）
  function drugsPanel(d) {
    return P.summarize(d.codes, DICT).map(function (r) {
      var locs = [];
      d.codes.forEach(function (c) {
        if (c.code.slice(0, 7) === r.idcode && c.batch === r.batch && c.location && locs.indexOf(c.location) === -1) locs.push(c.location);
      });
      return {
        raw: r,
        drugName: r.drugName, formSpec: r.formSpec, packSpec: r.packSpec,
        batch: r.batch, prodDate: r.prodDate, expDate: r.expDate,
        qty: r.qty, unit: r.unit, approval: r.approval, maker: r.maker,
        locsText: locs.join('、') || '—',
        drugCode: r.drugCode || '—'
      };
    });
  }

  // 异常码 = 两类合并：① 解析失败（「移除」=删除该码）② 无库存码（「移除」）——动作按 editable 输出（已审核 disabled）
  function badPanel(d) {
    var ro = !editable(d);
    var rows = parseFailCodes(d).map(function (c) {
      return {
        raw: c,
        className: 'pch-row-bad',
        code: c.code,
        idcode: c.code.slice(0, 7),
        reason: '解析失败：标识码未维护，无法解析药品',
        time: '—',
        actions: ro ? [{ key: 'removeCode', disabled: true }] : ['removeCode']
      };
    });
    return rows.concat((d.badCodes || []).map(function (b) {
      return {
        raw: b,
        className: 'pch-row-bad',
        code: b.code,
        idcode: b.code.slice(0, 7),
        reason: b.reason,
        time: b.time || '—',
        actions: ro ? [{ key: 'removeBad', disabled: true }] : ['removeBad']
      };
    }));
  }

  // ===== 渲染与绑定 =====
  function renderAll() {
    DICT = D.flat(D.load());
    content.innerHTML = filterBar() + docTable() + tabSection();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { code: v('fCode'), billNo: v('fBillNo'), shipper: v('fShipper'), receiver: v('fReceiver'),
        type: v('fType'),
        status: v('fStatus'), dateFrom: v('fDateFrom'), dateTo: v('fDateTo') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { code: '', billNo: '', shipper: '', receiver: '', type: '全部', status: '全部', dateFrom: '', dateTo: '' };
      renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', openAdd);
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-scan]').forEach(function (b) {
      b.addEventListener('click', function () { sel = b.getAttribute('data-scan'); goScan(selDoc()); });
    });
    content.querySelectorAll('[data-audit]').forEach(function (b) {
      b.addEventListener('click', function () { sel = b.getAttribute('data-audit'); auditFlow(selDoc()); });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { sel = b.getAttribute('data-edit'); openEdit(selDoc()); });
    });
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var billNo = b.getAttribute('data-del');
        UI.confirm('确定删除退货单 <b>' + esc(billNo) + '</b>？未审核单未扣账，删除后预占码释放回在架可选。', function () {
          S.outDocs = S.outDocs.filter(function (d) { return d.billNo !== billNo; });
          if (sel === billNo) sel = null;
          save(); renderAll();
          window.showToast('已删除退货单 ' + billNo);
        }, '删除');
      });
    });
    content.querySelectorAll('[data-badtab]').forEach(function (a) {
      a.addEventListener('click', function () { sel = a.getAttribute('data-badtab'); tab = 'bad'; renderAll(); });
    });
    // 明细三页签与行级动作统一走 PulDocDetail.bind（替代原页签行/码删除/异常码删除/异常码移除四个旧监听）
    window.PulDocDetail.bind(content, {
      model: detailModel,
      onTab: function (key) { tab = key; renderAll(); },
      actions: {
        removeCode: function (ctx) {
          var d = selDoc(); if (!d || !editable(d)) return;
          if (ctx.table === 'codes') {
            // 码详情行级删除（公约 §4.3：不弹确认，可重扫）——原 data-delcode splice 逻辑
            var c = d.codes.splice(ctx.index, 1)[0];
            save(); renderAll();
            window.showToast('已删除追溯码 ' + (c ? c.code : ''));
          } else {
            // 异常码页签「删除该码」——原 data-delfail 逻辑
            var cd = ctx.row.raw.code;
            d.codes = d.codes.filter(function (x) { return x.code !== cd; });
            save(); renderAll();
            window.showToast('已删除异常码 ' + cd);
          }
        },
        removeBad: function (ctx) {
          // 异常码页签「移除」——原 data-rmbad 逻辑
          var d = selDoc(); if (!d || !editable(d)) return;
          var cd = ctx.row.raw.code;
          d.badCodes = (d.badCodes || []).filter(function (x) { return x.code !== cd; });
          save(); renderAll();
          window.showToast('已移除异常码 ' + cd + '，可继续审核');
        }
      }
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  // ===== 新增退货单（2026-10-13 Round BU 用户拍板：到货退货功能删除——到货未入库的单直接删到货单即可，不做整单退回） =====
  // 库房退货：录表头（单据编号*/单据时间*/供应商*）→ 保存后行内「扫码录入」跳统一扫码页
  function openAdd() {
    var supOpts = S.arrive.map(function (o) { return o.supplier; })
      .filter(function (s, i, arr) { return arr.indexOf(s) === i; })
      .map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    var defNo = 'TH' + String(Date.now()).slice(-10);
    UI.modalShell('pchOutAdd', '新增退货单',
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">单据编号</label><input class="form-control" id="oaBillNo" value="' + defNo + '"></div>' +
      '<div class="col-6"><label class="form-label required">单据时间</label><input class="form-control" id="oaTime" type="datetime-local" value="' + nowLocal() + '"></div></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">供应商</label><select class="form-select" id="oaSupplier">' + supOpts + '</select></div>' +
      '<div class="col-6"><label class="form-label required">退货库房</label><input class="form-control" value="' + esc(curWh()) + '" disabled></div></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">保存后点行内「扫码录入」跳统一扫码页，从本库在架扫码加入退货码；扫到本库没有的码登记「无库存码」（审核硬拦，码明细「移除」后放行）。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="oaOk">保存</button>', 560);
    var el = UI.open('pchOutAdd');
    el.querySelector('#oaOk').addEventListener('click', function () {
      var billNo = el.querySelector('#oaBillNo').value.trim();
      if (!billNo) { window.showToast('请填写单据编号'); return; }
      if (S.outDocs.some(function (x) { return x.billNo === billNo; })) { window.showToast('单据编号 ' + billNo + ' 已存在，请更换'); return; }
      var t = el.querySelector('#oaTime').value;
      if (!t) { window.showToast('请选择单据时间'); return; }
      S.outDocs.unshift({ billNo: billNo, date: t.replace('T', ' '), supplier: el.querySelector('#oaSupplier').value,
        shipper: el.querySelector('#oaSupplier').value, receiver: '中心院区',
        warehouse: curWh(), type: '库房退货', refOrder: '', status: '未审核', auditTime: '', auditor: '', codes: [], badCodes: [] });
      sel = billNo; tab = 'codes';
      save(); UI.close('pchOutAdd'); renderAll();
      window.showToast('退货单 ' + billNo + ' 已创建，请点行内「扫码录入」添加退货码');
    });
  }

  // ===== 编辑表头（未审核：单据编号 / 供应商） =====
  function openEdit(d) {
    if (!d || !editable(d)) return;
    var supOpts = S.arrive.map(function (o) { return o.supplier; })
      .filter(function (s, i, arr) { return arr.indexOf(s) === i; })
      .map(function (s) { return '<option' + (s === d.supplier ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
    UI.modalShell('pchOutEdit', '编辑退货单 · ' + d.billNo,
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">单据编号</label><input class="form-control" id="oeBillNo" value="' + esc(d.billNo) + '"></div>' +
      '<div class="col-6"><label class="form-label required">退货库房</label><input class="form-control" value="' + esc(d.warehouse) + '" disabled></div></div>' +
      '<div class="mb-3"><label class="form-label required">供应商</label><select class="form-select" id="oeSupplier">' + supOpts + '</select></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">码清单用行内「扫码录入」添加、码详情行内「删除」调整；异常码在「异常码」页签移除。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="oeOk">保存</button>', 560);
    var el = UI.open('pchOutEdit');
    el.querySelector('#oeOk').addEventListener('click', function () {
      var no = el.querySelector('#oeBillNo').value.trim();
      if (!no) { window.showToast('请填写单据编号'); return; }
      if (no !== d.billNo && S.outDocs.some(function (x) { return x.billNo === no; })) { window.showToast('单据编号 ' + no + ' 已存在，请更换'); return; }
      d.billNo = no;
      d.supplier = el.querySelector('#oeSupplier').value;
      sel = no;
      save(); UI.close('pchOutEdit'); renderAll();
      window.showToast('已保存退货单 ' + no);
    });
  }

  // ===== 扫码录入（2026-10-13 Round BT：跳页改弹窗——复用 scan-hub?embed=1 内嵌；关闭弹窗后刷新本页） =====
  // 在架加入/无库存码登记/扫码移除由统一扫码页承接（scan-core 主干 + onDirBad 钩子）
  function goScan(d) {
    if (!d || !editable(d)) return;
    UI.openScanHub(d.billNo, renderAll);
  }

  // ===== 审核异常弹窗（2026-10-13 Round BR 对齐采购到货单；Round CD 收编进 PchUI.auditBlock 共享——本地保留薄包装对齐原签名） =====
  function auditBlock(d, title, detailHtml, act) { UI.auditBlock(d.billNo, title, detailHtml, act); }

  // ===== 审核退货（对齐采购到货单口径）：守卫=无码（弹窗+去扫码录入）→ 异常码硬拦（弹窗+去异常码页签）→ P2 审核确认弹窗 → 冻结硬拦 → 码退供应商（终态） =====
  function auditFlow(d) {
    if (!d) { window.showToast('请先选择一张退货单'); return; }
    if (d.status === '已审核') { window.showToast('该退货单已审核'); return; }   // 行内无按钮，兜底
    if (!d.codes.length) {
      auditBlock(d, '退货清单为空，不允许审核', '先从本库在架扫码加入退货码。', { label: '去扫码录入', fn: function () { goScan(d); } });
      return;
    }
    var n = issueCount(d);
    if (n) {
      var pf = parseFailCodes(d).length, ns = noStockCount(d);
      auditBlock(d, '存在 ' + n + ' 个异常码，已拦截审核',
        (pf ? '解析失败×' + pf + '（删除该码或到药品字典补录标识码）' : '') + (pf && ns ? ' · ' : '') +
        (ns ? '无库存码×' + ns + '（码明细「移除」后放行）' : ''),
        { label: '去异常码页签', fn: function () { sel = d.billNo; tab = 'bad'; renderAll(); } });
      return;
    }
    openAudit(d);
  }

  function openAudit(d) {
    // 审核确认核对区（2026-10-13 Round BR 对齐采购到货单精简版：供应商 + 检查结果一行）
    var checkHtml =
      '<div class="card" style="padding:8px 14px;margin-bottom:12px;font-size:13px;line-height:1.8;box-shadow:none;">' +
      '<div class="text-secondary">供应商：' + esc(d.supplier) + '</div>' +
      '<div><span class="text-success">✓</span> 无异常码 · 共 <b>' + d.codes.length + '</b> 个追溯码（审核后码从在架扣除）</div>' +
      '</div>';
    UI.modalShell('pchOutAudit', '审核退货 · ' + d.billNo,
      checkHtml +
      '<div class="mb-2"><label class="form-label required">退货库房</label>' +
      '<input class="form-control" value="' + esc(d.warehouse) + '" disabled></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-success" id="auOk">✓ 确定审核退货</button>', 480);
    var el = UI.open('pchOutAudit');
    el.querySelector('#auOk').addEventListener('click', function () {
      if (W && W.assertUnfrozen && !W.assertUnfrozen(d.warehouse)) return;
      d.status = '已审核'; d.auditTime = now(); d.auditor = curUser().name || '演示员';
      save(); UI.close('pchOutAudit'); renderAll();
      window.showToast('退货单 ' + d.billNo + ' 审核完成，' + d.codes.length + ' 个追溯码已退回供应商');
    });
  }

  if (S.outDocs.length && !sel) sel = S.outDocs[0].billNo;
  renderAll();
})();
