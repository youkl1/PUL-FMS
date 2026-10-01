/**
 * wh-pick.js — 领用备货单（2026-10-01 重构：备货=出库单草稿态，扫码进度落盘）
 * 统一单据视图：领用单(reqPool，不含待提交) ⋈ 出库单(pickDocs) 一条链一行 + 直接扫码出库草稿
 * 状态机：待备货（领用单无草稿）→ 备货中（草稿，codes 实时落盘可续作）→ 已出库·在途（审核扣账）→ 药房已入库（闭环）
 * 工作台事实源 = 选中草稿 doc.codes（废弃内存 picked）；?billNo= 深链：备货中→工作台，已过账→只读
 * 待提交制单草稿不进本页（wh-pick-out 管理）；出库码带 expectLoc = 申请行上架货位随单传递
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pick', crumb: ['库房管理', '领用备货单', '领用备货单'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load(), PS = P.load();
  var DICT = D.flat(DS);
  var sel = null;            // {kind:'req',key:reqNo} 无草稿申请（只读+备货入口）| {kind:'doc',key:billNo} 出库单（备货中=工作台，其余只读）
  var filters = { kw: '', pharm: '全部', slot: '全部', status: '全部', dFrom: '', dTo: '' };
  var qsBill = new URLSearchParams(location.search).get('billNo');   // 深链：出库明细查询/领用出库单跳转

  function save() { W.save(S); }
  function curWh() { return (window.store.load().currentUser || {}).warehouse || '中心库'; }
  function curUserName() { return (window.store.load().currentUser || {}).name || '演示员'; }
  function stockMap() {
    var m = {};
    W.stockAll(PS, S, curWh()).forEach(function (c) { m[c.code] = c; });
    return m;
  }
  function reqOf(no) {
    for (var i = 0; i < S.reqPool.length; i++) if (S.reqPool[i].reqNo === no) return S.reqPool[i];
    return null;
  }
  function docOf(no) {
    for (var i = 0; i < S.pickDocs.length; i++) if (S.pickDocs[i].billNo === no) return S.pickDocs[i];
    return null;
  }
  function docOfReq(reqNo) {
    for (var i = 0; i < S.pickDocs.length; i++) if (S.pickDocs[i].reqNo === reqNo) return S.pickDocs[i];
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
  function slotOfItem(req, dc) {
    var s = '';
    ((req && req.items) || []).forEach(function (it) { if (it.drugCode === dc && it.slot) s = it.slot; });
    return s;
  }
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

  // ===== 统一单据视图：领用单链（不含待提交）+ 直接出库草稿 =====
  function rows() {
    var out = [];
    S.reqPool.forEach(function (r) {
      if (r.status === '待提交') return;   // 库房制单草稿不进备货队列（wh-pick-out 管理）
      var doc = docOfReq(r.reqNo);
      var slots = [];
      r.items.forEach(function (it) { if (it.slot && slots.indexOf(it.slot) === -1) slots.push(it.slot); });
      out.push({ selKind: doc ? 'doc' : 'req', selKey: doc ? doc.billNo : r.reqNo,
        req: r, doc: doc, no: r.reqNo, billNo: doc ? doc.billNo : '',
        date: doc ? doc.date : r.date, pharm: r.pharmacy, wh: doc ? doc.warehouse : r.warehouse,
        slots: slots, status: doc ? doc.status : '待备货', creator: r.applicant || '-',
        src: r.source === '库房制单' ? '库房制单' : '药房申请' });
    });
    S.pickDocs.forEach(function (d) {
      if (d.reqNo) return;
      out.push({ selKind: 'doc', selKey: d.billNo, req: null, doc: d, no: '', billNo: d.billNo,
        date: d.date, pharm: d.pharmacy, wh: d.warehouse, slots: [], status: d.status,
        creator: d.operator || '-', src: '直接出库' });
    });
    out.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return out;
  }
  function filteredRows() {
    return rows().filter(function (r) {
      if (filters.kw && r.no.indexOf(filters.kw) === -1 && r.billNo.indexOf(filters.kw) === -1) return false;
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
    for (var i = 0; i < all.length; i++) if (all[i].selKind === sel.kind && all[i].selKey === sel.key) return all[i];
    return null;
  }
  function selDoc() {
    if (!sel || sel.kind !== 'doc') return null;
    return docOf(sel.key);
  }
  // 当前可作业草稿（备货中才允许扫码/移除/审核）
  function workDoc() {
    var d = selDoc();
    return (d && d.status === '备货中') ? d : null;
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
      '<input class="form-control" id="fKw" style="width:150px;" placeholder="单据编号 / 出库单号" value="' + esc(filters.kw) + '">' +
      '<select class="form-select" id="fPharm" style="width:120px;">' + ['全部'].concat(pharms).map(function (o) { return opt(filters.pharm, o, o === '全部' ? '领用药房' : o); }).join('') + '</select>' +
      '<select class="form-select" id="fSlot" style="width:120px;">' + ['全部'].concat(slots).map(function (o) { return opt(filters.slot, o, o === '全部' ? '上架货位' : o); }).join('') + '</select>' +
      '<select class="form-select" id="fStatus" style="width:130px;">' + ['全部', '待备货', '备货中', '已出库', '药房已入库'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : (o === '已出库' ? '已出库·在途' : o)); }).join('') + '</select>' +
      '<input class="form-control" id="fFrom" type="date" style="width:140px;" value="' + esc(filters.dFrom) + '" title="单据日期从">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fTo" type="date" style="width:140px;" value="' + esc(filters.dTo) + '" title="单据日期至">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-warning" id="btnQuick">⚡ 直接扫码出库</button></div>' +
      '</div></div></div>';
  }

  // ===== 上：领用单据列表 =====
  function stHtml(st) {
    if (st === '药房已入库') return '<span class="pch-light ok"><i class="pch-dot"></i>药房已入库</span>';
    if (st === '已出库') return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>已出库 · 在途</span>';
    if (st === '备货中') return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>备货中</span>';
    return '<span class="pch-light" style="color:#206BC4;"><i class="pch-dot" style="background:#206BC4;"></i>待备货</span>';
  }
  function docsTable() {
    var list = filteredRows();
    var rowsHtml = list.map(function (r, i) {
      var op = '';
      if (r.status === '待备货') op = '<button class="btn btn-sm btn-primary" data-pickreq="' + esc(r.selKey) + '">备货</button>';
      else if (r.status === '备货中') op = '<button class="btn btn-sm btn-primary" data-resume="' + esc(r.billNo) + '">继续备货</button>';
      else if (r.status === '已出库') op = '<button class="btn btn-sm btn-outline-success" data-phin="' + esc(r.billNo) + '">确认药房入库</button>';
      else op = '<span class="text-secondary" style="font-size:12.5px;">闭环</span>';
      var isSel = sel && sel.kind === r.selKind && sel.key === r.selKey;
      var srcBadge = r.src === '直接出库' ? '<span class="badge bg-orange-lt">直接出库</span>'
        : (r.src === '库房制单' ? '<span class="badge bg-purple-lt">库房制单</span>' : '药房申请');
      return '<tr class="pch-doc-row' + (isSel ? ' pch-doc-sel' : '') + (qsBill === r.billNo ? ' pch-doc-sel' : '') + '"' +
        (qsBill === r.billNo ? ' id="qsRow"' : '') + ' data-selkind="' + r.selKind + '" data-selkey="' + esc(r.selKey) + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td><b>' + (r.no ? esc(r.no) : '<span class="text-secondary">—</span>') + '</b></td>' +
        '<td>' + (r.billNo ? esc(r.billNo) : '<span class="text-secondary">—</span>') + '</td>' +
        '<td class="text-secondary">' + esc(r.date) + '</td>' +
        '<td>' + esc(r.wh) + '</td><td>' + esc(r.pharm) + '</td>' +
        '<td>' + (r.slots.length ? esc(r.slots.join('、')) : '<span class="text-secondary">—</span>') + '</td>' +
        '<td>' + stHtml(r.status) + '</td><td class="text-secondary">' + esc(r.creator) + '</td>' +
        '<td>' + srcBadge + '</td>' +
        '<td onclick="event.stopPropagation()">' + op + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="11" class="text-center text-secondary" style="padding:28px;">没有找到匹配的记录</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>领用单据</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">申请→出库一条链一行 · ' + list.length + ' 单 · 点行查看明细，待备货/备货中行点行进入工作台（进度实时保存）</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>出库单号</th><th>单据时间</th><th>出库库房</th><th>领用药房</th><th>上架货位</th><th>状态</th><th>创建人</th><th>单据来源</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // ===== 下左：药品明细（申请数 vs 已备数 / 直接出库汇总 / 过账只读） =====
  function drugPanel() {
    var head = '<div class="card"><div class="card-header"><b>申请药品明细清单</b>';
    var foot = '</div>';
    var row = selRow();
    if (!row) {
      return head + '</div><div class="text-center text-secondary" style="padding:28px;">点选上方单据查看明细；待备货/备货中单据进入备货工作台</div>' + foot;
    }
    // 已过账：按出库码聚合只读
    if (row.doc && row.doc.status !== '备货中') {
      var agg = codesByDrug(row.doc.codes);
      var dRows = Object.keys(agg).map(function (dc, i) {
        var slot = slotOfItem(row.req, dc);
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(dc) + '</td><td><b>' + esc(drugName(dc)) + '</b></td><td>' + esc(drugForm(dc)) + '</td>' +
          '<td>' + esc(maker(dc)) + '</td><td>' + esc(approval(dc)) + '</td>' +
          '<td>' + (slot ? '<span class="badge bg-blue-lt">' + esc(slot) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
          '<td class="text-secondary">' + agg[dc].count + ' 码</td><td><b>' + agg[dc].qty + '</b></td><td>' + esc(baseUnit(dc)) + '</td>' +
          '<td class="text-secondary">—</td></tr>';
      }).join('');
      return head + '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(row.billNo) + ' · 实出口径（只读）</span></div>' +
        '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>药品编码</th><th>药名通用名</th><th>制剂规格</th><th>生产厂家</th><th>批准文号</th><th>上架货位</th><th>码数</th><th>折合数量</th><th>单位</th><th>差额</th></tr></thead>' +
        '<tbody>' + dRows + '</tbody></table></div>' + foot;
    }
    // 备货中草稿·无申请（直接出库）：按已扫码汇总
    if (row.doc && !row.req) {
      var byDrug = codesByDrug(row.doc.codes);
      var qRows = Object.keys(byDrug).map(function (dc, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(dc) + '</td><td><b>' + esc(drugName(dc)) + '</b></td><td>' + esc(drugForm(dc)) + '</td>' +
          '<td>' + esc(maker(dc)) + '</td><td>' + esc(approval(dc)) + '</td><td class="text-secondary">—</td>' +
          '<td class="text-secondary">—</td><td><b>' + byDrug[dc].qty + '</b></td><td>' + esc(baseUnit(dc)) + '</td>' +
          '<td class="text-secondary">直接出库</td></tr>';
      }).join('');
      if (!qRows) qRows = '<tr><td colspan="11" class="text-center text-secondary" style="padding:28px;">直接扫码出库：扫码后此处按药品汇总实出数</td></tr>';
      return head + '<span class="text-secondary ms-2" style="font-size:12.5px;">直接出库 · ' + esc(row.pharm) + '（无申请单，不带上架货位）</span></div>' +
        '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>药品编码</th><th>药名通用名</th><th>制剂规格</th><th>生产厂家</th><th>批准文号</th><th>上架货位</th><th>申请数</th><th>实出数</th><th>单位</th><th>备注</th></tr></thead>' +
        '<tbody>' + qRows + '</tbody></table></div>' + foot;
    }
    // 申请单（含备货中草稿）：申请数 vs 已备数（已备=草稿 codes 聚合）
    var req = row.req;
    var gotMap = codesByDrug(row.doc ? row.doc.codes : []);
    var rowsHtml = req.items.map(function (it, i) {
      var got = gotMap[it.drugCode] ? gotMap[it.drugCode].qty : 0;
      var diff = it.qty - got;
      var cls = diff === 0 && got > 0 ? 'full' : (diff < 0 ? 'over' : (got > 0 ? 'part' : ''));
      var diffTxt = diff === 0 && got > 0 ? '✓ 备齐' : (diff > 0 ? '缺 ' + diff : '超 ' + (-diff));
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.drugCode) + '</td><td><b>' + esc(drugName(it.drugCode)) + '</b></td><td>' + esc(drugForm(it.drugCode)) + '</td>' +
        '<td>' + esc(maker(it.drugCode)) + '</td><td>' + esc(approval(it.drugCode)) + '</td>' +
        '<td>' + (it.slot ? '<span class="badge bg-blue-lt">' + esc(it.slot) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td><b>' + it.qty + '</b></td><td><b>' + got + '</b></td><td>' + esc(baseUnit(it.drugCode)) + '</td>' +
        '<td class="wh-pick-diff ' + cls + '">' + diffTxt + '</td></tr>';
    }).join('');
    var hint = row.doc ? (esc(req.reqNo) + ' · 申请数 vs 已备数（基本单位口径）') : (esc(req.reqNo) + ' · 未开始备货——点列表「备货」建草稿开始作业');
    return head + '<span class="text-secondary ms-2" style="font-size:12.5px;">' + hint + '</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品编码</th><th>药名通用名</th><th>制剂规格</th><th>生产厂家</th><th>批准文号</th><th>上架货位</th><th>申请数</th><th>已备数</th><th>单位</th><th>差额</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' + foot;
  }

  // ===== 下右：追溯码明细清单 =====
  function codePanel() {
    var row = selRow();
    var head = '<div class="card"><div class="card-header"><b>追溯码明细清单</b>';
    // 已过账只读
    if (row && row.doc && row.doc.status !== '备货中') {
      var d = row.doc;
      var rRows = d.codes.map(function (c, i) {
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
          '<td><b>' + esc(drugName(drugOfCode(c.code))) + '</b></td>' +
          '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td><td>' + esc(c.location || '—') + '</td>' +
          '<td>' + (c.expectLoc ? '<span class="badge bg-blue-lt">' + esc(c.expectLoc) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
          '<td>' + (c.phLoc ? '<span class="badge bg-green-lt">' + esc(c.phLoc) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
          '<td class="text-secondary">' + toBase(c) + esc(baseUnit(drugOfCode(c.code))) + '</td></tr>';
      }).join('');
      if (!d.codes.length) rRows = '<tr><td colspan="9" class="text-center text-secondary" style="padding:28px;">本单无码</td></tr>';
      return head + '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · ' + d.codes.length + ' 个码（只读）</span></div>' +
        '<div class="table-responsive" style="max-height:330px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>库位</th><th>预期货位</th><th>上架货位</th><th>折合</th></tr></thead>' +
        '<tbody>' + rRows + '</tbody></table></div>' +
        (d.status === '已出库'
          ? '<div class="pch-tabbar"><div class="ms-auto"><button class="btn btn-outline-success" data-phin="' + esc(d.billNo) + '">确认药房入库（演示闭环）</button></div></div>'
          : '') + '</div>';
    }
    // 无草稿的申请：备货入口
    if (row && !row.doc) {
      return head + '<span class="text-secondary ms-2" style="font-size:12.5px;">申请单 ' + esc(row.no) + ' · 尚未建备货草稿</span></div>' +
        '<div class="text-center text-secondary" style="padding:28px;">点击下方「备货」创建出库单草稿并开始扫码；扫码进度实时保存，可离开后继续</div>' +
        '<div class="pch-tabbar"><button class="btn btn-primary" data-pickreq="' + esc(row.selKey) + '">备货</button></div></div>';
    }
    // 备货中工作台：doc.codes 为事实源
    var d = row ? row.doc : null;
    var keys = d ? d.codes : [];
    var rowsHtml = keys.map(function (c, i) {
      var dc = drugOfCode(c.code);
      var expect = row.req ? slotOfItem(row.req, dc) : '';
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(drugName(dc)) + '</b></td>' +
        '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td><td>' + esc(c.location || '—') + '</td>' +
        '<td>' + (expect ? '<span class="badge bg-blue-lt">' + esc(expect) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td class="text-secondary">' + toBase(c) + esc(baseUnit(dc)) + '</td>' +
        '<td><button class="btn btn-sm btn-outline-danger" data-unpick="' + esc(c.code) + '">移除</button></td></tr>';
    }).join('');
    if (!keys.length) rowsHtml = '<tr><td colspan="9" class="text-center text-secondary" style="padding:28px;">码清单为空——点下方「扫码备货」逐码扫入</td></tr>';
    var title = d ? (row.req ? '申请单 ' + esc(row.req.reqNo) : '直接出库 · ' + esc(d.pharmacy)) : '未选单';
    return head + '<span class="text-secondary ms-2" style="font-size:12.5px;">' + title + ' · 已扫 ' + keys.length + ' 个码（实时保存）</span></div>' +
      '<div class="table-responsive" style="max-height:330px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>库位</th><th>预期货位</th><th>折合</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' +
      (d ? '<div class="pch-tabbar">' +
      '<button class="btn btn-primary" id="btnScan">▸ 扫码备货</button>' +
      '<button class="btn btn-outline-secondary" id="btnClear"' + (keys.length ? '' : ' disabled') + '>清空</button>' +
      '<div class="ms-auto"><button class="btn btn-success" id="btnAudit"' + (keys.length ? '' : ' disabled') + '>✓ 审核出库</button></div>' +
      '</div></div>' : '</div>');
  }

  // ===== 备货入口：建/复用草稿（回写申请状态） =====
  function startPick(reqNo) {
    var req = reqOf(reqNo);
    if (!req) return;
    var doc = docOfReq(reqNo);
    if (!doc) {
      doc = { billNo: W.nextNo('LYCK', S.pickDocs), reqNo: req.reqNo, date: W.now(),
        pharmacy: req.pharmacy, warehouse: curWh(), status: '备货中', operator: curUserName(),
        remark: req.remark || '', codes: [] };
      S.pickDocs.unshift(doc);
    }
    if (req.status === '待备货') req.status = '备货中';
    save();
    sel = { kind: 'doc', key: doc.billNo };
    renderAll();
    window.showToast('备货草稿 ' + doc.billNo + '，扫码进度实时保存');
  }

  // ===== 直接扫码出库：建无申请草稿 → 工作台 =====
  function openQuick() {
    var phOpts = [];
    try {
      (window.PUL_FACILITY.load().pharmacies || []).forEach(function (p) {
        if (p.status === '启用') phOpts.push(p.name);
      });
    } catch (e) { /* facility 缺失 */ }
    if (!phOpts.length) phOpts = ['门诊药房'];
    UI.modalShell('pkQuick', '直接扫码出库',
      '<div class="mb-3"><label class="form-label required">领用药房</label><select class="form-select" id="qkPh">' +
      phOpts.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('') + '</select></div>' +
      '<div class="mb-2"><label class="form-label">备注</label><input class="form-control" id="qkRemark" placeholder="选填"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">无申请单、不带上架货位；扫码进度实时保存为草稿，可离开后继续；审核出库即扣账</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="qkOk">创建草稿并扫码</button>', 440);
    var el = UI.open('pkQuick');
    el.querySelector('#qkOk').addEventListener('click', function () {
      var billNo = W.nextNo('LYCK', S.pickDocs);
      S.pickDocs.unshift({ billNo: billNo, reqNo: '', date: W.now(), pharmacy: el.querySelector('#qkPh').value,
        warehouse: curWh(), status: '备货中', operator: curUserName(),
        remark: el.querySelector('#qkRemark').value.trim(), codes: [] });
      save();
      UI.close('pkQuick');
      sel = { kind: 'doc', key: billNo };
      renderAll();
      window.showToast('已建草稿 ' + billNo + '（直接出库），开始扫码');
    });
  }

  // ===== 扫码备货（在架码√加入 / 非在架×拦截 / 超申请!提示；写盘实时保存） =====
  function openScanModal() {
    var d = workDoc();
    if (!d) return;
    var req = d.reqNo ? reqOf(d.reqNo) : null;
    UI.openScan({
      title: '扫码备货 · ' + (req ? req.reqNo : d.billNo + '（直接出库）'),
      hint: '扫在架追溯码加入备货；扫箱码自动按换算链折合基本单位（如 1箱=60瓶）；进度实时保存',
      gate: 'out', node: curWh(),
      onScan: function (code) {
        var doc = workDoc();
        if (!doc) return { level: 'bad', msg: '草稿已不可作业' };
        var sm = stockMap();
        var c = sm[code];
        if (!c) return { level: 'bad', msg: '不在在架库存（未入库或已出库）' };
        if (doc.codes.some(function (x) { return x.code === code; })) return { level: 'warn', msg: '重复扫码，已在码清单' };
        var p = P.parseCode(code, DICT);
        if (!p.dict) return { level: 'bad', msg: '标识码未维护，无法解析' };
        var dc = p.dict.drugCode;
        var it = null;
        ((req && req.items) || []).forEach(function (x) { if (x.drugCode === dc) it = x; });
        if (req && !it) return { level: 'bad', msg: p.dict.drugName + ' 不在本申请单，禁止加入' };
        doc.codes.push(Object.assign({}, c));
        save();
        renderAll();
        var add = toBase(c);
        var got = codesByDrug(doc.codes)[dc].qty;
        if (it && got > it.qty) return { level: 'warn', msg: p.dict.drugName + ' +' + add + baseUnit(dc) + '（已备 ' + got + '/' + it.qty + '，超申请数）' };
        return { level: 'ok', msg: p.dict.drugName + ' +' + add + baseUnit(dc) + (it ? '（已备 ' + got + '/' + it.qty + '）' : '') };
      },
      onClose: renderAll
    });
  }

  // ===== 审核出库：重验在架 → 草稿推进已出库（扣账），回写申请 =====
  function openAudit() {
    var d = workDoc();
    if (!d || !d.codes.length) return;
    if (!W.assertUnfrozen(curWh())) return;
    var sm = stockMap();
    var lost = d.codes.filter(function (c) { return !sm[c.code]; });
    if (lost.length) {
      UI.confirm('以下 <b>' + lost.length + '</b> 个码已不在在架（可能被其他单据出库/损耗）：<div style="margin-top:6px;font-family:Consolas,monospace;font-size:12.5px;">' +
        lost.map(function (c) { return esc(c.code); }).join('<br>') +
        '</div><div class="text-secondary" style="font-size:12.5px;margin-top:6px;">请先在码清单移除失效码后再审核。</div>',
        function () {}, '审核被拦截');
      return;
    }
    var req = d.reqNo ? reqOf(d.reqNo) : null;
    var pharmacy = req ? req.pharmacy : d.pharmacy;
    var byDrug = codesByDrug(d.codes);
    var lines = Object.keys(byDrug).map(function (dc) {
      var it = null;
      ((req && req.items) || []).forEach(function (x) { if (x.drugCode === dc) it = x; });
      return '<div>· ' + esc(drugName(dc)) + '：实出 <b>' + byDrug[dc].qty + '</b> ' + esc(baseUnit(dc)) +
        (it ? '（申请 ' + it.qty + '，' + (byDrug[dc].qty === it.qty ? '一致' : '<span class="text-warning">差异 ' + (byDrug[dc].qty - it.qty) + '</span>') + ')' : '（直接出库）') +
        (it && it.slot ? '，上架货位 <b>' + esc(it.slot) + '</b>' : '') + '</div>';
    }).join('');
    UI.confirm('审核出库到 <b>' + esc(pharmacy) + '</b>？共 ' + d.codes.length + ' 个码：<div style="margin-top:8px;">' + lines + '</div>' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:8px;">审核后码从在架扣除、进入「在途」；申请的上架货位随码传递为预期货位，药房入库核对可见。</div>',
      function () {
        d.status = '已出库';
        d.auditTime = W.now();
        d.operator = curUserName();
        d.codes.forEach(function (c) { c.expectLoc = req ? slotOfItem(req, drugOfCode(c.code)) : ''; });
        if (req) req.status = '已完成';
        save();
        sel = null;
        renderAll();
        window.showToast('已审核出库，' + d.codes.length + ' 个码进入在途（待药房入库）');
      }, '审核出库');
  }

  function renderAll() {
    content.innerHTML = filterBar() + docsTable() + '<div class="wh-pick-grid">' + drugPanel() + codePanel() + '</div>';
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { kw: v('fKw'), pharm: v('fPharm'), slot: v('fSlot'), status: v('fStatus'), dFrom: v('fFrom'), dTo: v('fTo') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { kw: '', pharm: '全部', slot: '全部', status: '全部', dFrom: '', dTo: '' }; renderAll();
    });
    document.getElementById('btnQuick').addEventListener('click', openQuick);
    content.querySelectorAll('[data-selkind]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        sel = { kind: tr.getAttribute('data-selkind'), key: tr.getAttribute('data-selkey') };
        renderAll();
      });
    });
    content.querySelectorAll('[data-pickreq]').forEach(function (b) {
      b.addEventListener('click', function () { startPick(b.getAttribute('data-pickreq')); });
    });
    content.querySelectorAll('[data-resume]').forEach(function (b) {
      b.addEventListener('click', function () {
        sel = { kind: 'doc', key: b.getAttribute('data-resume') };
        renderAll();
      });
    });
    var bs = document.getElementById('btnScan');
    if (bs) bs.addEventListener('click', openScanModal);
    var bc = document.getElementById('btnClear');
    if (bc) bc.addEventListener('click', function () {
      var d = workDoc();
      if (d) { d.codes = []; save(); renderAll(); }
    });
    var ba = document.getElementById('btnAudit');
    if (ba) ba.addEventListener('click', openAudit);
    content.querySelectorAll('[data-unpick]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = workDoc();
        if (!d) return;
        d.codes = d.codes.filter(function (c) { return c.code !== b.getAttribute('data-unpick'); });
        save(); renderAll();
      });
    });
    content.querySelectorAll('[data-phin]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-phin');
        S.pickDocs.forEach(function (d) { if (d.billNo === no) d.status = '药房已入库'; });
        save(); renderAll();
        window.showToast('出库单 ' + no + ' 药房已入库，在途清零（闭环）');
      });
    });
  }

  // 初始选中：深链单据 > 第一张待备货申请
  if (qsBill && docOf(qsBill)) {
    sel = { kind: 'doc', key: qsBill };
  } else {
    var all = rows();
    for (var i = 0; i < all.length; i++) {
      if (all[i].selKind === 'req') { sel = { kind: 'req', key: all[i].selKey }; break; }
    }
  }
  renderAll();
  if (qsBill) {
    var qr = document.getElementById('qsRow');
    if (qr) qr.scrollIntoView({ block: 'center' });
  }
})();
