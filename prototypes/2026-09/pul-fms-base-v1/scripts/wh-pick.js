/**
 * wh-pick.js — 调拨出库单（原「领用备货单」，2026-10-12 按方案 v2.1 并入调拨：库房发起的跨节点出库唯一单据；2026-10-08 收口：库房不再手动新增领用单，库房制单·待提交链路删除）
 * 词表 v3：草稿(仅药房申请,本页不显示) → 待出库(调拨出库扫码=单内动作) → 已出库(库房侧只读,药房视角=待入库)
 *   → 已入库(闭环,操作栏只留按钮) ；已作废=终态（仅药房侧撤销产生，本页只读展示）
 * 「调拨出库扫码 / ＋新增调拨单（必选药品清单）」直跳 scan-hub.html?billNo=（统一扫码页；quick-scan 壳保留兼容旧链接）；扫码=待出库单内动作（docQty 渐满，状态不变）
 * 闭环唯一入口=药房「领用入库单·扫码入库/直接入库」；出库台账在「领用出库单」页
 * 2026-10-09 拍板：默认过滤状态=待出库；列表去掉上架状态列、增实物数量/扫码数量列（两列同为提交态：提交前=0、提交后=全码折合——扫码是全部提交、实物数量没有不等的时候）；操作栏只留按钮（终态行 '—'）
 * 2026-10-18 Task4：明细双页签迁移 PulDocDetail 共享组件（renderTabs/bind；「追溯码明细清单」页签名按组件标准收敛为「码详情」）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pick', crumb: ['库房管理', '调拨出库单', '调拨出库单'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load();
  var DICT = D.flat(DS);
  var sel = null;            // 选中单 billNo
  var tab = 'drugs';         // 明细页签：drugs=药品清单 / codes=追溯码明细（2026-10-10 统一为单卡双页签；2026-10-18 Task4 迁移 PulDocDetail 组件标准页签）
  var filters = { kw: '', pharm: '全部', slot: '全部', status: '待出库', dFrom: '', dTo: '' };   // 2026-10-09 拍板：默认待出库
  var qsBill = new URLSearchParams(location.search).get('billNo');   // 深链：出库明细查询/领用出库单跳转
  if (qsBill) filters.status = '全部';   // 深链单可能是任意状态：先放开状态过滤，保证目标单可见

  function save() { W.save(S); }
  function curWh() { return (window.store.load().currentUser || {}).warehouse || '中心库'; }
  function curUserName() { return (window.store.load().currentUser || {}).name || '演示员'; }
  function docOf(no) {
    for (var i = 0; i < S.pickDocs.length; i++) if (S.pickDocs[i].billNo === no) return S.pickDocs[i];
    return null;
  }
  function drugName(dc) { var d = D.drugOf(DS, dc); return d ? d.drugName : dc; }
  function drugForm(dc) { var d = D.drugOf(DS, dc); return d ? d.formSpec : ''; }
  function baseUnit(dc) { var d = D.drugOf(DS, dc); return d ? d.baseUnit : ''; }
  function maker(dc) { var d = D.drugOf(DS, dc); return d ? d.maker : ''; }
  function approval(dc) { var d = D.drugOf(DS, dc); return d ? d.approval : ''; }
  function drugOfCode(code20) {
    var p = P.parseCode(code20, DICT);
    return p.dict ? p.dict.drugCode : '?';
  }
  function slotOfItem(doc, dc) { var s=''; ((doc && doc.items)||[]).forEach(function(it){ if(it.drugCode===dc && it.slot) s=it.slot; }); return s; }
  // 码 → 折合基本单位数（换算链驱动；无链兜底 1）
  function toBase(c) {
    var p = P.parseCode(c.code, DICT);
    if (!p.dict) return 1;
    var d = D.drugOf(DS, p.dict.drugCode);
    var v = d ? D.conv(DS, d.drugCode, 1, p.dict.packUnit || p.dict.unit, d.baseUnit) : null;
    return v == null ? 1 : v;
  }
  // 已备数按药品聚合（基本单位）：数据源 = 草稿 doc.codes
  function codesByDrug(codes) {
    var m = {};
    (codes || []).forEach(function (c) {
      var dc = drugOfCode(c.code);
      if (!m[dc]) m[dc] = { drugCode: dc, qty: 0, count: 0 };
      m[dc].qty += toBase(c);
      m[dc].count += 1;
    });
    return m;
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  // 单据级实物数量 = 已扫码折合基本单位合计（与明细 docQty 渐满同口径）
  function docBaseQty(d) {
    var n = 0;
    (d.codes || []).forEach(function (c) { n += toBase(c); });
    return Math.round(n * 10) / 10;
  }
  // 单据级计划数量 = 申领清单合计（2026-10-09 拍板：调拨出库单一定有计划数量，新增必选清单）
  function docPlanQty(d) {
    var n = 0;
    (d.items || []).forEach(function (it) { n += (it.qty || 0); });
    return n;
  }

  // ===== 统一单据视图：单池 pickDocs 一条链一行 =====
  function rows() {
    var out = [];
    S.pickDocs.forEach(function (d) {
      if (d.status === '草稿') return;   // 草稿（药房申请）不进库房单据池；库房制单草稿链路 2026-10-08 删除
      var slots = [];
      (d.items || []).forEach(function (it) { if (it.slot && slots.indexOf(it.slot) === -1) slots.push(it.slot); });
      out.push({ key: d.billNo, doc: d, billNo: d.billNo, date: d.createTime || d.date,
        pharm: d.pharmacy, wh: d.warehouse, slots: slots, status: W.pickStatus(d),
        creator: d.applicant || d.operator || '-', src: d.source || '药房申请' });
    });
    out.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return out;
  }
  function filteredRows() {
    return rows().filter(function (r) {
      if (filters.kw && r.billNo.indexOf(filters.kw) === -1) return false;
      if (filters.pharm !== '全部' && r.pharm !== filters.pharm) return false;
      if (filters.slot !== '全部' && r.slots.indexOf(filters.slot) === -1) return false;
      if (filters.status !== '全部' && r.status !== filters.status) return false;
      var day = r.date.slice(0, 10);
      if (filters.dFrom && day < filters.dFrom) return false;
      if (filters.dTo && day > filters.dTo) return false;
      return true;
    });
  }
  function selRow() {
    if (!sel) return null;
    var all = rows();
    for (var i = 0; i < all.length; i++) if (all[i].key === sel) return all[i];
    return null;
  }
  // ===== 筛选栏 =====
  function filterBar() {
    var opt = function (cur, o, label) {
      return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>';
    };
    var pharms = [], slots = [];
    rows().forEach(function (r) {
      if (pharms.indexOf(r.pharm) === -1) pharms.push(r.pharm);
      r.slots.forEach(function (s) { if (slots.indexOf(s) === -1) slots.push(s); });
    });
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:150px;" placeholder="单据编号" value="' + esc(filters.kw) + '">' +
      '<select class="form-select" id="fPharm" style="width:120px;">' + ['全部'].concat(pharms).map(function (o) { return opt(filters.pharm, o, o === '全部' ? '领用药房' : o); }).join('') + '</select>' +
      '<select class="form-select" id="fSlot" style="width:120px;">' + ['全部'].concat(slots).map(function (o) { return opt(filters.slot, o, o === '全部' ? '上架货位' : o); }).join('') + '</select>' +
      '<select class="form-select" id="fStatus" style="width:150px;">' + ['全部', '待出库', '已出库', '已入库', '已作废'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fFrom" type="date" style="width:140px;" value="' + esc(filters.dFrom) + '" title="单据日期从">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fTo" type="date" style="width:140px;" value="' + esc(filters.dTo) + '" title="单据日期至">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto">' +
      '<button class="btn btn-warning" id="btnQuick">＋ 新增调拨单</button></div>' +
      '</div></div></div>';
  }

  // ===== 上：领用单据列表 =====
  function stHtml(st) {
    if (st === '已入库') return '<span class="pch-light ok"><i class="pch-dot"></i>已入库</span>';
    if (st === '已出库') return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>已出库</span>';   // TODO(light): 待 PchUI.light 扩展收编
    if (st === '已作废') return '<span class="pch-light mute"><i class="pch-dot"></i>已作废</span>';
    return '<span class="pch-light" style="color:#206BC4;"><i class="pch-dot" style="background:#206BC4;"></i>待出库</span>';   // TODO(light): 待 PchUI.light 扩展收编
  }
  function docsTable() {
    var list = filteredRows();
    var rowsHtml = list.map(function (r, i) {
      var d = r.doc;
      // 2026-10-09 拍板：操作栏只留按钮，终态行 '—'（状态在状态列表达）
      var op = r.status === '待出库'
        ? '<button class="btn btn-sm btn-primary" data-resume="' + esc(r.key) + '">调拨出库扫码</button>'
        : '<span class="text-secondary">—</span>';
      var srcBadge = r.src === '扫码直生' ? '<span class="badge bg-cyan-lt">扫码直生</span>'
        : (r.src === '库房制单' ? '<span class="badge bg-purple-lt">库房制单</span>' : '药房申请');
      // 2026-10-09 拍板：扫码是全部提交——扫码数量=提交后=全码折合，提交前=0（待出库/已作废恒 0；已出库/已入库=全码折合）
      // 2026-10-12 拍板：实物数量列删除（与扫码数量同为提交态、没有不等的时候，同源冗余）
      var postQty = W.pickPosted(d) ? docBaseQty(d) : 0;
      return '<tr class="pch-doc-row' + (sel === r.key ? ' pch-doc-sel' : '') + (qsBill === r.key ? ' pch-doc-sel' : '') + '"' +
        (qsBill === r.key ? ' id="qsRow"' : '') + ' data-selkey="' + esc(r.key) + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(r.billNo) + '</b></td>' +
        '<td>调拨出库</td>' +
        '<td class="text-secondary">' + esc(r.date) + '</td>' +
        '<td>' + esc(r.wh) + '</td><td>' + esc(r.pharm) + '</td>' +
        '<td>' + (r.slots.length ? esc(r.slots.join('、')) : '<span class="text-secondary">—</span>') + '</td>' +
        '<td><b>' + docPlanQty(d) + '</b></td><td><b>' + postQty + '</b></td>' +
        '<td>' + stHtml(r.status) + '</td><td class="text-secondary">' + esc(r.creator) + '</td>' +
        '<td>' + srcBadge + '</td>' +
        '<td onclick="event.stopPropagation()">' + op + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="13" class="text-center text-secondary" style="padding:28px;">没有找到匹配的记录</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>调拨单据</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">申请→上架全程同单 · ' + list.length + ' 单 · 点行查看明细；「调拨出库扫码」进入统一扫码页（进度实时保存）</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据类型</th><th>单据时间</th><th>出库库房</th><th>领用药房</th><th>上架货位</th><th>计划数量</th><th>扫码数量</th><th>状态</th><th>创建人</th><th>单据来源</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // ===== 单据明细（单卡双页签：药品清单 / 追溯码明细，2026-10-10 统一对齐调拨入库单；底部扫码按钮已删，入口在行内）
  // 2026-10-18 Task4：明细迁移 PulDocDetail 共享组件——原业务计算 → 组件标准 model/options；页面专属列（计划/扫码数量、差额、上架货位、折合）经 extraColumns 保留
  function itemsTable(d) {
    // 有计划明细（申请/制单来源）：计划数量 vs 扫码数量（差额=计划-扫码折合；2026-10-12 实物数量列删除，折合量并入差额计算）
    if ((d.items || []).length) {
      var gotMap = codesByDrug(d.codes);
      return d.items.map(function (it, i) {
        var got = gotMap[it.drugCode] ? gotMap[it.drugCode].qty : 0;
        var diff = it.qty - got;
        var cls = diff === 0 && got > 0 ? 'full' : (diff < 0 ? 'over' : (got > 0 ? 'part' : ''));
        var diffTxt = diff === 0 && got > 0 ? '✓ 备齐' : (diff > 0 ? '缺 ' + diff : '超 ' + (-diff));
        return {
          raw: it,
          drugCode: it.drugCode,
          drugName: drugName(it.drugCode),
          formSpec: drugForm(it.drugCode),
          maker: maker(it.drugCode),
          approval: approval(it.drugCode),
          expectLoc: it.slot || '',
          unit: baseUnit(it.drugCode),
          planQty: it.qty,
          scanCnt: gotMap[it.drugCode] ? gotMap[it.drugCode].count : 0,
          diffCell: '<td class="wh-pick-diff ' + cls + '">' + diffTxt + '</td>'
        };
      });
    }
    // 无计划明细（直接出库/扫码直生）：按码聚合
    var byDrug = codesByDrug(d.codes);
    return Object.keys(byDrug).map(function (dc) {
      return {
        raw: byDrug[dc],
        drugCode: dc,
        drugName: drugName(dc),
        formSpec: drugForm(dc),
        maker: maker(dc),
        approval: approval(dc),
        expectLoc: '',
        unit: baseUnit(dc),
        scanText: byDrug[dc].count + ' 码',
        srcCell: '<td class="text-secondary">' + esc(d.source || '') + '</td>'
      };
    });
  }

  // 追溯码明细行适配：逐码只读 → 组件标准 model
  function codesTable(d) {
    return (d.codes || []).map(function (c) {
      var dc = drugOfCode(c.code);
      var expect = c.expectLoc || slotOfItem(d, dc);
      return {
        raw: c,
        code: c.code,
        drugName: drugName(dc),
        batch: c.batch,
        expDate: c.expDate,
        location: c.location || '',
        expectLoc: expect || '',
        phLocCell: '<td>' + (c.phLoc ? '<span class="badge bg-green-lt">' + esc(c.phLoc) + '</span>' : '<span class="text-secondary">—</span>') + '</td>',
        baseCell: '<td class="text-secondary">' + toBase(c) + esc(baseUnit(dc)) + '</td>'
      };
    });
  }

  var detailModel = { drugs: [], codes: [], bad: [], activeTab: tab, empty: true };
  function detailCard() {
    var row = selRow();
    if (!row) {
      detailModel = { drugs: [], codes: [], bad: [], activeTab: tab, empty: true };
      return window.PulDocDetail.renderTabs(detailModel, {
        title: '单据明细',
        emptyText: '点选上方单据查看明细；待出库单据行内「调拨出库扫码」进入扫码作业页'
      });
    }
    var d = row.doc;
    detailModel = { drugs: itemsTable(d), codes: codesTable(d), bad: [], activeTab: tab };
    // 卡尾只留状态提示（调拨出库扫码入口在行内，2026-10-10 删底部按钮）
    var footerHtml = '';
    if (d.status === '待出库') footerHtml = '<span class="text-secondary" style="font-size:12.5px;">' +
      ((d.items || []).length ? '计划数量 vs 扫码数量（基本单位口径）；' : '') +
      '扫码 / 移除 / 拆零 / 审核出库均在统一扫码页完成（行内按钮进入）</span>';
    else if (d.status === '已出库') footerHtml = '<span class="text-secondary" style="font-size:12.5px;">在途——待药房在「领用入库单」扫码入库闭环（库房侧只读）</span>';
    return window.PulDocDetail.renderTabs(detailModel, {
      title: '单据明细',
      metaHtml: '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · ' + esc(d.warehouse) + '</span>',
      tabs: ['drugs', 'codes'],
      counts: { codes: 'rows' },
      drugs: (d.items || []).length ? {
        // 药品公共列 + 页面专属列（预期货位公共列承载上架货位；计划/扫码数量、差额原样 extraColumns 保留）
        columns: ['seq', 'drugCode', 'drugName', 'formSpec', 'maker', 'approval', 'expectLoc', 'unit'],
        extraColumns: [
          { key: 'planQty', title: '计划数量', cell: function (r) { return '<b>' + r.planQty + '</b>'; } },
          { key: 'scanCnt', title: '扫码数量', cell: function (r) { return '<b>' + r.scanCnt + '</b>'; } },
          { key: 'diff', title: '差额', cell: function (r) { return r.diffCell; } }
        ],
        emptyText: '暂无药品明细'
      } : {
        columns: ['seq', 'drugCode', 'drugName', 'formSpec', 'maker', 'approval', 'expectLoc', 'unit'],
        extraColumns: [
          { key: 'scanCnt', title: '扫码数量', cell: function (r) { return '<b>' + r.scanText + '</b>'; } },
          { key: 'src', title: '来源', cell: function (r) { return r.srcCell; } }
        ],
        emptyText: '直接出库：扫码后此处按药品汇总扫码数量'
      },
      codes: {
        // 码表公共列子集 + 页面专属列（上架货位徽标、折合 extraColumns 原样保留）
        columns: ['seq', 'code', 'drugName', 'batch', 'expDate', 'location', 'expectLoc'],
        extraColumns: [
          { key: 'phLoc', title: '上架货位', cell: function (r) { return r.phLocCell; } },
          { key: 'base', title: '折合', cell: function (r) { return r.baseCell; } }
        ],
        emptyText: '码清单为空' + (d.status === '待出库' ? '——点行内「调拨出库扫码」到扫码作业页逐码扫入' : '')
      },
      footerHtml: footerHtml
    });
  }

  // ===== 新增调拨单：建带药品清单的待出库单 → 跳统一扫码页（2026-10-08 拍板：必须选药品清单）=====
  function openQuick() {
    var phs = phList();
    UI.modalShell('pkQuick', '新增调拨单',
      '<div class="row g-3 mb-2">' +
      '<div class="col-6"><label class="form-label required">出库库房</label>' +
      '<select class="form-select" disabled title="出库库房=当前登录库房，只能出本库房的货"><option>' + esc(curWh()) + '</option></select></div>' +
      '<div class="col-6"><label class="form-label required">领用药房</label><select class="form-select" id="qkPh">' +
      phs.map(function (p) { return '<option value="' + esc(p) + '">' + esc(p) + '</option>'; }).join('') + '</select></div></div>' +
      '<div id="qkPick"></div>' +
      '<div class="mt-2 mb-2"><label class="form-label">备注</label><input class="form-control" id="qkRemark" placeholder="选填"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">药品清单必选（≥1，数量=计划数量）；行内可选上架货位（随码传递为预期货位，可留空=药房入库后再定）。创建即进统一扫码页逐码扫入，进度实时保存，审核出库即扣账</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="qkOk">创建并去扫码</button>', 1100);
    var el = UI.open('pkQuick');
    var phSel = el.querySelector('#qkPh');
    var picker = window.PulDrugPicker.mount(el.querySelector('#qkPick'), {
      warehouse: curWh(), pharmacy: phSel.value, slots: slotsOfPh(phSel.value), showSlot: true, items: []
    });
    phSel.addEventListener('change', function () {
      picker.reload({ pharmacy: phSel.value, slots: slotsOfPh(phSel.value) });
    });
    el.querySelector('#qkOk').addEventListener('click', function () {
      var items = picker.getItems();
      if (!items.length) { window.showToast('请至少选择 1 个药品（数量需 ≥1）'); return; }
      var billNo = W.nextNo('LYCK', S.pickDocs);
      var t = W.now();
      S.pickDocs.unshift({ billNo: billNo, date: t, pharmacy: phSel.value,
        warehouse: curWh(), applicant: curUserName(), operator: curUserName(), source: '库房制单',
        status: '待出库', remark: el.querySelector('#qkRemark').value.trim(), shelfLoc: '',
        items: items.map(function (it) { return { drugCode: it.drugCode, qty: it.qty, docQty: 0, slot: it.slot || '' }; }),
        codes: [], badCodes: [], createTime: t, submitTime: t, outTime: '', inTime: '' });
      save();
      location.href = 'scan-hub.html?billNo=' + encodeURIComponent(billNo);
    });
  }

  // 药房/货位下拉源（新增调拨单用）
  function phList() {
    var names = [];
    try {
      (window.PUL_FACILITY.load().pharmacies || []).forEach(function (p) { if (p.status === '启用' && names.indexOf(p.name) < 0) names.push(p.name); });
    } catch (e) { /* facility 缺失 */ }
    if (!names.length) names.push('门诊药房');
    return names;
  }
  function slotsOfPh(phName) {
    try {
      var ph = null;
      (window.PUL_FACILITY.load().pharmacies || []).forEach(function (p) { if (p.name === phName) ph = p; });
      return ph ? (ph.slots || []).filter(function (s) { return s.status === '启用'; }) : [];
    } catch (e) { return []; }
  }

  function renderAll() {
    content.innerHTML = filterBar() + docsTable() + detailCard();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { kw: v('fKw'), pharm: v('fPharm'), slot: v('fSlot'), status: v('fStatus'), dFrom: v('fFrom'), dTo: v('fTo') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { kw: '', pharm: '全部', slot: '全部', status: '待出库', dFrom: '', dTo: '' }; renderAll();
    });
    document.getElementById('btnQuick').addEventListener('click', openQuick);
    content.querySelectorAll('[data-selkey]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-selkey'); renderAll(); });
    });
    // 明细页签切换统一走 PulDocDetail.bind（替代原按钮式页签监听；本页明细只读，无行级操作回调）
    window.PulDocDetail.bind(content, {
      model: detailModel,
      onTab: function (key) { tab = key; renderAll(); }
    });
    // 调拨出库扫码 → 直跳统一扫码页（深链续作；quick-scan.html 壳保留兼容旧链接）
    content.querySelectorAll('[data-resume]').forEach(function (b) {
      b.addEventListener('click', function () {
        location.href = 'scan-hub.html?billNo=' + encodeURIComponent(b.getAttribute('data-resume'));
      });
    });
  }

  // 初始选中：深链单据 > 第一张待出库单
  if (qsBill && docOf(qsBill)) {
    sel = qsBill;
  } else {
    var all = rows();
    for (var i = 0; i < all.length; i++) {
      if (all[i].status === '待出库') { sel = all[i].key; break; }
    }
  }
  renderAll();
  if (qsBill) {
    var qr = document.getElementById('qsRow');
    if (qr) qr.scrollIntoView({ block: 'center' });
  }
})();
