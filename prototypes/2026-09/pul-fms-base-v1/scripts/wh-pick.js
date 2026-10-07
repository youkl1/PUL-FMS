/**
 * wh-pick.js — 领用备货单（2026-10-05 单池化：两池并一池，取消 reqPool⋈pickDocs 拼接）
 * 单池 pickDocs 一条链一行：待提交(库房制单草稿,编辑/提交/删除) → 待出库(备货/继续备货=单内动作,可作废)
 *   → 已出库·待入库(库房侧只读) → 已入库·待上架/已上架(推导,闭环) ；已作废=终态
 * 「备货/继续备货/新增备货单」跳 quick-scan.html?billNo=；备货=待出库单内动作（docQty 渐满，状态不变）
 * 闭环唯一入口=药房「领用入库单」；出库台账在「领用出库单」页；作废=待出库释放码终态（已出库起走退回）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pick', crumb: ['库房管理', '领用备货单', '领用备货单'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load();
  var DICT = D.flat(DS);
  var sel = null;            // 选中单 billNo
  var filters = { kw: '', pharm: '全部', slot: '全部', status: '全部', dFrom: '', dTo: '' };
  var qsBill = new URLSearchParams(location.search).get('billNo');   // 深链：出库明细查询/领用出库单跳转

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

  // ===== 统一单据视图：单池 pickDocs 一条链一行 =====
  function rows() {
    var out = [];
    S.pickDocs.forEach(function (d) {
      if (d.status === '待提交' && d.source !== '库房制单') return;   // 药房侧待提交草稿不进库房单据池
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
      '<select class="form-select" id="fStatus" style="width:150px;">' + ['全部', '待提交', '待出库', '已出库·待入库', '已入库·待上架', '已上架', '已作废'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fFrom" type="date" style="width:140px;" value="' + esc(filters.dFrom) + '" title="单据日期从">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fTo" type="date" style="width:140px;" value="' + esc(filters.dTo) + '" title="单据日期至">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto">' +
      '<button class="btn btn-outline-primary" id="btnReq">＋ 新增领用单（库房制单）</button> ' +
      '<button class="btn btn-warning" id="btnQuick">＋ 新增备货单（直接出库）</button></div>' +
      '</div></div></div>';
  }

  // ===== 上：领用单据列表 =====
  function stHtml(st) {
    if (st === '已上架') return '<span class="pch-light ok"><i class="pch-dot"></i>已上架</span>';
    if (st === '已入库·待上架') return '<span class="pch-light" style="color:#2FB344;"><i class="pch-dot" style="background:#2FB344;"></i>已入库 · 待上架</span>';   // TODO(light): 待 PchUI.light 扩展收编
    if (st === '已出库·待入库') return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>已出库 · 待入库</span>';
    if (st === '已作废') return '<span class="pch-light mute"><i class="pch-dot"></i>已作废</span>';
    if (st === '待提交') return '<span class="badge bg-secondary-lt">待提交</span>';
    return '<span class="pch-light" style="color:#206BC4;"><i class="pch-dot" style="background:#206BC4;"></i>待出库</span>';
  }
  function docsTable() {
    var list = filteredRows();
    var rowsHtml = list.map(function (r, i) {
      var d = r.doc;
      var op = '';
      if (r.status === '待提交') op = '<button class="btn btn-sm btn-outline-primary" data-editreq="' + esc(r.key) + '">编辑</button> ' +
        '<button class="btn btn-sm btn-success" data-submitreq="' + esc(r.key) + '">提交</button> ' +
        '<button class="btn btn-sm btn-outline-danger" data-delreq="' + esc(r.key) + '">删除</button>';
      else if (r.status === '待出库') op = '<button class="btn btn-sm btn-primary" data-resume="' + esc(r.key) + '">' + ((d.codes || []).length ? '继续备货' : '备货') + '</button> ' +
        '<button class="btn btn-sm btn-outline-danger" data-void="' + esc(r.key) + '">✗ 作废</button>';
      else if (r.status === '已出库·待入库') op = '<span class="text-secondary" style="font-size:12.5px;">待药房入库</span>';
      else if (r.status === '已作废') op = '<span class="text-secondary" style="font-size:12.5px;">已作废（码已释放）</span>';
      else op = '<span class="text-secondary" style="font-size:12.5px;">闭环</span>';
      var srcBadge = r.src === '扫码直生' ? '<span class="badge bg-cyan-lt">扫码直生</span>'
        : (r.src === '库房制单' ? '<span class="badge bg-purple-lt">库房制单</span>' : '药房申请');
      return '<tr class="pch-doc-row' + (sel === r.key ? ' pch-doc-sel' : '') + (qsBill === r.key ? ' pch-doc-sel' : '') + '"' +
        (qsBill === r.key ? ' id="qsRow"' : '') + ' data-selkey="' + esc(r.key) + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(r.billNo) + '</b></td>' +
        '<td class="text-secondary">' + esc(r.date) + '</td>' +
        '<td>' + esc(r.wh) + '</td><td>' + esc(r.pharm) + '</td>' +
        '<td>' + (r.slots.length ? esc(r.slots.join('、')) : '<span class="text-secondary">—</span>') + '</td>' +
        '<td>' + stHtml(r.status) + '</td><td class="text-secondary">' + esc(r.creator) + '</td>' +
        '<td>' + srcBadge + '</td>' +
        '<td onclick="event.stopPropagation()">' + op + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="10" class="text-center text-secondary" style="padding:28px;">没有找到匹配的记录</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>领用单据</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">申请→上架全程同单 · ' + list.length + ' 单 · 点行查看明细；「备货 / 继续备货」进入「领用快捷扫码」作业（进度实时保存）</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据时间</th><th>出库库房</th><th>领用药房</th><th>上架货位</th><th>状态</th><th>创建人</th><th>单据来源</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // ===== 下左：药品明细（计划数 vs 已备数 / 无计划明细按码聚合） =====
  function drugPanel() {
    var head = '<div class="card"><div class="card-header"><b>药品明细清单</b>';
    var foot = '</div>';
    var row = selRow();
    if (!row) {
      return head + '</div><div class="text-center text-secondary" style="padding:28px;">点选上方单据查看明细；待出库单据进入备货工作台</div>' + foot;
    }
    var d = row.doc;
    // 有计划明细（申请/制单来源）：申请数 vs 已备数（已备=doc.codes 聚合，docQty 口径一致）
    if ((d.items || []).length) {
      var gotMap = codesByDrug(d.codes);
      var rowsHtml = d.items.map(function (it, i) {
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
      var hint = esc(d.billNo) + ' · ' + (d.status === '待提交' ? '待提交制单——提交后进入备货队列' : '计划数 vs 已备数（基本单位口径）');
      return head + '<span class="text-secondary ms-2" style="font-size:12.5px;">' + hint + '</span></div>' +
        '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>药品编码</th><th>药名通用名</th><th>制剂规格</th><th>生产厂家</th><th>批准文号</th><th>上架货位</th><th>计划数</th><th>已备数</th><th>单位</th><th>差额</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>' + foot;
    }
    // 无计划明细（直接出库/扫码直生）：按码聚合
    var byDrug = codesByDrug(d.codes);
    var qRows = Object.keys(byDrug).map(function (dc, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(dc) + '</td><td><b>' + esc(drugName(dc)) + '</b></td><td>' + esc(drugForm(dc)) + '</td>' +
        '<td>' + esc(maker(dc)) + '</td><td>' + esc(approval(dc)) + '</td><td class="text-secondary">—</td>' +
        '<td class="text-secondary">' + byDrug[dc].count + ' 码</td><td><b>' + byDrug[dc].qty + '</b></td><td>' + esc(baseUnit(dc)) + '</td>' +
        '<td class="text-secondary">' + esc(d.source || '') + '</td></tr>';
    }).join('');
    if (!qRows) qRows = '<tr><td colspan="11" class="text-center text-secondary" style="padding:28px;">直接出库：扫码后此处按药品汇总实出数</td></tr>';
    return head + '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.source || '直接出库') + ' · ' + esc(d.pharmacy) + '</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品编码</th><th>药名通用名</th><th>制剂规格</th><th>生产厂家</th><th>批准文号</th><th>上架货位</th><th>码数</th><th>折合数量</th><th>单位</th><th>来源</th></tr></thead>' +
      '<tbody>' + qRows + '</tbody></table></div>' + foot;
  }

  // ===== 下右：追溯码明细清单 =====
  function codePanel() {
    var row = selRow();
    var head = '<div class="card"><div class="card-header"><b>追溯码明细清单</b>';
    if (!row) return head + '</div><div class="text-center text-secondary" style="padding:28px;">点选上方单据查看码明细</div></div>';
    var d = row.doc;
    var rowsHtml = (d.codes || []).map(function (c, i) {
      var dc = drugOfCode(c.code);
      var expect = c.expectLoc || slotOfItem(d, dc);
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(drugName(dc)) + '</b></td>' +
        '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td><td>' + esc(c.location || '—') + '</td>' +
        '<td>' + (expect ? '<span class="badge bg-blue-lt">' + esc(expect) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td>' + (c.phLoc ? '<span class="badge bg-green-lt">' + esc(c.phLoc) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td class="text-secondary">' + toBase(c) + esc(baseUnit(dc)) + '</td></tr>';
    }).join('');
    if (!(d.codes || []).length) rowsHtml = '<tr><td colspan="9" class="text-center text-secondary" style="padding:28px;">码清单为空' + (d.status === '待出库' ? '——点下方「备货」到快捷扫码页逐码扫入' : '') + '</td></tr>';
    var foot = '';
    if (d.status === '待提交') foot = '<div class="pch-tabbar"><button class="btn btn-success" data-submitreq="' + esc(d.billNo) + '">✓ 提交制单（进入备货队列）</button></div>';
    else if (d.status === '待出库') foot = '<div class="pch-tabbar">' +
      '<button class="btn btn-primary" data-resume="' + esc(d.billNo) + '">▸ ' + ((d.codes || []).length ? '继续备货' : '备货') + '（快捷扫码工作台）</button>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">扫码 / 移除 / 拆零 / 审核出库均在「领用快捷扫码」完成</span></div>';
    else if (d.status === '已出库·待入库') foot = '<div class="pch-tabbar"><span class="text-secondary" style="font-size:12.5px;">在途——待药房在「领用入库单」核对后确认入库闭环（库房侧只读）</span></div>';
    return head + '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · ' + (d.codes || []).length + ' 个码</span></div>' +
      '<div class="table-responsive" style="max-height:330px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>库位</th><th>预期货位</th><th>上架货位</th><th>折合</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' + foot + '</div>';
  }

  // ===== 新增备货单（直接出库）：建待出库单 → 跳转领用快捷扫码 =====
  function openQuick() {
    var phs = [];
    try {
      (window.PUL_FACILITY.load().pharmacies || []).forEach(function (p) {
        if (p.status === '启用') phs.push(p);
      });
    } catch (e) { /* facility 缺失 */ }
    if (!phs.length) phs = [{ name: '门诊药房', slots: [] }];
    UI.modalShell('pkQuick', '新增备货单（直接出库）',
      '<div class="mb-3"><label class="form-label required">出库库房</label>' +
      '<select class="form-select" disabled title="出库库房=当前登录库房，只能出本库房的货"><option>' + esc(curWh()) + '</option></select></div>' +
      '<div class="mb-3"><label class="form-label required">领用药房</label><select class="form-select" id="qkPh">' +
      phs.map(function (p) { return '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="mb-3"><label class="form-label">上架货位</label><select class="form-select" id="qkSlot"></select>' +
      '<div class="text-secondary mt-1" style="font-size:12px;">整单默认上架货位，随码传递为预期货位；留空=药房入库后再定</div></div>' +
      '<div class="mb-2"><label class="form-label">备注</label><input class="form-control" id="qkRemark" placeholder="选填"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">无申请单直出；创建即建备货单草稿并进入「领用快捷扫码」扫码，进度实时保存，审核出库即扣账</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="qkOk">创建并去扫码</button>', 440);
    var el = UI.open('pkQuick');
    var phSel = el.querySelector('#qkPh'), slotSel = el.querySelector('#qkSlot');
    function fillSlots() {
      var ph = null;
      phs.forEach(function (p) { if (p.name === phSel.value) ph = p; });
      var opts = ['<option value="">—（入库后再定）</option>'];
      ((ph && ph.slots) || []).forEach(function (s) { opts.push('<option value="' + esc(s.code) + '">' + esc(s.code) + ' ' + esc(s.name) + '</option>'); });
      slotSel.innerHTML = opts.join('');
    }
    phSel.addEventListener('change', fillSlots);
    fillSlots();
    el.querySelector('#qkOk').addEventListener('click', function () {
      var billNo = W.nextNo('LYCK', S.pickDocs);
      var t = W.now();
      S.pickDocs.unshift({ billNo: billNo, date: t, pharmacy: phSel.value,
        warehouse: curWh(), applicant: curUserName(), operator: curUserName(), source: '库房制单',
        status: '待出库', remark: el.querySelector('#qkRemark').value.trim(), shelfLoc: slotSel.value,
        items: [], codes: [], badCodes: [], createTime: t, submitTime: t, outTime: '', inTime: '' });
      save();
      location.href = 'quick-scan.html?billNo=' + encodeURIComponent(billNo);
    });
  }

  // ===== 库房制单（缺药领用单）：待提交草稿 新增/编辑/提交/删除（2026-10-02 自领用出库单页收编回本页） =====
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
      return ph ? (ph.slots || []) : [];
    } catch (e) { return []; }
  }
  function openNewReq(reqNo) {
    var editing = reqNo ? docOf(reqNo) : null;
    var ph = editing ? editing.pharmacy : phList()[0];
    var body = '<div class="row g-3 mb-2">' +
      '<div class="col-6"><label class="form-label required">领用药房</label><select class="form-select" id="newPh">' +
      phList().map(function (p) { return '<option' + (ph === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select></div>' +
      '<div class="col-6"><label class="form-label">备注</label><input class="form-control" id="newRemark" value="' + esc(editing ? (editing.remark || '') : '') + '" placeholder="选填"></div></div>' +
      '<div id="npPick"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">保存为「待提交」制单草稿；提交后进入本页备货队列（待出库）。存量列口径：选中药房 / 当前库房（基本单位）</div>';
    UI.modalShell('pkNew', editing ? ('编辑制单 · ' + editing.billNo) : '新增领用单（库房制单）', body,
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="newOk">保存（待提交）</button>', 1100);
    var el = UI.open('pkNew');
    var picker = window.PulDrugPicker.mount(el.querySelector('#npPick'), {
      warehouse: curWh(), pharmacy: ph, slots: slotsOfPh(ph), showSlot: true,
      items: editing ? editing.items : []
    });
    el.querySelector('#newPh').addEventListener('change', function () {
      var p2 = el.querySelector('#newPh').value;
      picker.reload({ pharmacy: p2, slots: slotsOfPh(p2) });
    });
    el.querySelector('#newOk').addEventListener('click', function () {
      var phVal = el.querySelector('#newPh').value;
      var items = picker.getItems();
      if (!phVal) { window.showToast('请选择领用药房'); return; }
      if (!items.length) { window.showToast('请至少选择 1 个药品（数量需 ≥1）'); return; }
      items = items.map(function (it) { return { drugCode: it.drugCode, qty: it.qty, docQty: 0, slot: it.slot || '' }; });
      if (editing) {
        editing.pharmacy = phVal;
        editing.items = items;
        editing.remark = el.querySelector('#newRemark').value.trim();
        window.showToast('制单 ' + editing.billNo + ' 已更新');
      } else {
        var t = W.now();
        var billNo = W.nextNo('LY', S.pickDocs);
        S.pickDocs.unshift({ billNo: billNo, date: t, pharmacy: phVal, warehouse: curWh(),
          applicant: curUserName(), operator: curUserName(), source: '库房制单', status: '待提交',
          remark: el.querySelector('#newRemark').value.trim(), shelfLoc: '',
          items: items, codes: [], badCodes: [], createTime: t, submitTime: '', outTime: '', inTime: '' });
        sel = billNo;
        window.showToast('已保存待提交制单 ' + billNo + '，提交后进入备货队列');
      }
      save(); UI.close('pkNew'); renderAll();
    });
  }
  function submitReq(billNo) {
    var d = docOf(billNo);
    if (!d) return;
    UI.confirm('提交制单 <b>' + esc(billNo) + '</b>？提交后进入备货队列（待出库），不可再编辑。', function () {
      d.status = '待出库';
      d.submitTime = W.now();
      save(); renderAll();
      window.showToast('已提交，备货队列可见');
    }, '提交制单');
  }
  function delReq(billNo) {
    UI.confirm('删除待提交制单 <b>' + esc(billNo) + '</b>？未提交不产生影响。', function () {
      S.pickDocs = S.pickDocs.filter(function (x) { return x.billNo !== billNo; });
      if (sel === billNo) sel = null;
      save(); renderAll();
      window.showToast('已删除');
    }, '确认删除');
  }
  function voidDoc(billNo) {
    var d = docOf(billNo);
    if (!d) return;
    UI.confirm('作废 <b>' + esc(billNo) + '</b>？' + ((d.codes || []).length ? '已扫 ' + d.codes.length + ' 个码未扣账，作废即释放回在架。' : '空码单作废，不影响库存。') + '作废为终态，不可恢复。', function () {
      d.status = '已作废';
      if (sel === billNo) sel = null;
      save(); renderAll();
      window.showToast('已作废，码已释放');
    }, '确认作废');
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
    document.getElementById('btnReq').addEventListener('click', function () { openNewReq(); });
    content.querySelectorAll('[data-editreq]').forEach(function (b) {
      b.addEventListener('click', function () { openNewReq(b.getAttribute('data-editreq')); });
    });
    content.querySelectorAll('[data-submitreq]').forEach(function (b) {
      b.addEventListener('click', function () { submitReq(b.getAttribute('data-submitreq')); });
    });
    content.querySelectorAll('[data-delreq]').forEach(function (b) {
      b.addEventListener('click', function () { delReq(b.getAttribute('data-delreq')); });
    });
    content.querySelectorAll('[data-void]').forEach(function (b) {
      b.addEventListener('click', function () { voidDoc(b.getAttribute('data-void')); });
    });
    content.querySelectorAll('[data-selkey]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-selkey'); renderAll(); });
    });
    // 备货/继续备货 → 跳转领用快捷扫码（深链续作）
    content.querySelectorAll('[data-resume]').forEach(function (b) {
      b.addEventListener('click', function () {
        location.href = 'quick-scan.html?billNo=' + encodeURIComponent(b.getAttribute('data-resume'));
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
