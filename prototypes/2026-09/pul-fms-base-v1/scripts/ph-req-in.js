/**
 * ph-req-in.js — 领用入库单：库房出库在途 → 药房在架
 * 口径（2026-10-04 对齐老系统「领用入库」）：待入库=库房已出库在途；
 * 审核入库一步确认——弹窗选上架货位（非必填），确认即整单入库；
 * 2026-10-05 单池化：已出库·待入库→审核→已入库·待上架（已上架推导展示）
 * 扫码在「药品扫码上架」环节。闭环唯一入口=本页（库房侧 2026-10-02 起只读不代确认）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'reqIn', crumb: ['药房管理', '领用入库单'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load();
  var DICT = D.flat(DS);
  var sel = null;
  var tab = 'items';   // 明细卡页签：items=药品清单 / codes=码详情
  var filters = { status: '待入库', kw: '' };
  // 入库明细查询深链：按单据状态落到对应页签
  var qsBill = new URLSearchParams(location.search).get('billNo');
  if (qsBill) {
    sel = qsBill;
    filters.kw = qsBill;
    S.pickDocs.forEach(function (d) {
      if (d.billNo === qsBill) filters.status = (d.status === '已入库·待上架' || d.status === '已上架') ? '已入库' : '待入库';
    });
  }

  function save() { W.save(S); }
  function curPharm() { return W.curPharm(); }
  function myDocs() {
    var ph = curPharm();
    return S.pickDocs.filter(function (d) {
      if (d.pharmacy !== ph) return false;
      if (filters.status === '待入库' && d.status !== '已出库·待入库') return false;
      if (filters.status === '已入库' && d.status !== '已入库·待上架') return false;
      if (filters.kw && d.billNo.indexOf(filters.kw) === -1) return false;
      return true;
    });
  }
  function selDoc() {
    for (var i = 0; i < S.pickDocs.length; i++) if (S.pickDocs[i].billNo === sel) return S.pickDocs[i];
    return null;
  }
  function dictOf(code20) { return P.parseCode(code20, DICT).dict || null; }
  function drugNameOf(code20) { var t = dictOf(code20); return t ? t.drugName : '未解析'; }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  // 单据来源：单池化后直接读 d.source（库房制单 / 药房申请，无申请单概念）
  function sourceOf(d) { return d.source || '药房申请'; }
  // 本药房启用货位（上架货位下拉选项；审核入库非必填）
  function pharmSlots() {
    try {
      var FS = window.PUL_FACILITY.load(), p = null;
      (FS.pharmacies || []).forEach(function (x) { if (x.name === curPharm()) p = x; });
      return ((p && p.slots) || []).filter(function (s) { return s.status === '启用'; });
    } catch (e) { return []; }
  }

  function filterBar() {
    var opt = function (cur, o, label) {
      return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>';
    };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fStatus" style="width:120px;">' +
        ['全部', '待入库', '已入库'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fKw" style="width:180px;" placeholder="出库单号" value="' + esc(filters.kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(curPharm()) + '</span>' +
      '</div></div></div>';
  }

  function docsCard() {
    var list = myDocs();
    var rowsHtml = list.map(function (d, i) {
      var pending = d.status === '已出库·待入库';
      var pst = W.pickStatus(d);
      var st = pending
        ? '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待入库 · 在途</span>' // TODO(light): 待 PchUI.light 扩展收编
        : (pst === '已上架'
          ? '<span class="pch-light ok"><i class="pch-dot"></i>已上架</span>'
          : '<span class="pch-light ok"><i class="pch-dot"></i>已入库 · 待上架</span>');
      var src = sourceOf(d);
      var op = pending
        ? '<button class="btn btn-success btn-sm" data-audit="' + esc(d.billNo) + '">✓ 审核入库</button>'
        : '<span class="text-secondary">—</span>';
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(d.billNo) + '</b></td>' +
        '<td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td>' + esc(d.warehouse) + '</td>' +
        '<td>' + esc(src) + '</td>' +
        '<td class="text-secondary">' + esc(d.operator || '-') + '</td>' +
        '<td>' + (d.shelfLoc ? '<span class="badge bg-blue-lt">' + esc(d.shelfLoc) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td>' + d.codes.length + '</td><td>' + st + '</td><td>' + op + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="10" class="text-center text-secondary" style="padding:28px;">暂无出库单——库房「领用备货单」审核后会出现在此</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>库房出库单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">待入库=在途 · 本药房 ' + list.length + ' 单</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>出库单号</th><th>出库时间</th><th>供货库房</th><th>单据来源</th><th>创建人</th><th>上架货位</th><th>码数</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // 药品清单：按药品聚合（数量=码数，单位=基本单位）
  function itemsTable(d) {
    var agg = {}, order = [];
    d.codes.forEach(function (c) {
      var t = dictOf(c.code);
      var key = t ? t.drugCode : '未知';
      if (!agg[key]) {
        agg[key] = { dict: t, qty: 0 };
        order.push(key);
      }
      agg[key].qty++;
    });
    var trs = order.map(function (k, i) {
      var a = agg[k], t = a.dict;
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td>' + esc(t ? t.drugCode : '—') + '</td>' +
        '<td><b>' + esc(t ? t.drugName : '未解析') + '</b></td>' +
        '<td>' + esc(t ? t.formSpec : '—') + '</td>' +
        '<td>' + esc(t ? t.maker : '—') + '</td>' +
        '<td>' + esc(t ? t.approval : '—') + '</td>' +
        '<td><b>' + a.qty + '</b></td>' +
        '<td>' + esc(t ? t.baseUnit : '—') + '</td></tr>';
    }).join('');
    return '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品编码</th><th>药名通用名</th><th>规格</th><th>生产厂家</th><th>批准文号</th><th>数量</th><th>单位</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table></div>';
  }

  // 码详情：逐码只读（扫码核对在「药品扫码上架」，本页不扫）
  function codesTable(d) {
    var done = W.pickPosted(d) && d.status !== '已出库·待入库';
    var trs = d.codes.map(function (c, i) {
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(drugNameOf(c.code)) + '</b></td>' +
        '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td>' +
        '<td>' + (c.expectLoc ? '<span class="badge bg-blue-lt">' + esc(c.expectLoc) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td>' + (done ? '<span class="text-success">✓ 已入库</span>' : '<span class="text-secondary">在途</span>') + '</td></tr>';
    }).join('');
    return '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>预期货位</th><th>状态</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table></div>';
  }

  function detailCard() {
    var d = selDoc();
    var body;
    if (!d) {
      body = '<div class="text-center text-secondary" style="padding:32px;">点选出库单，查看药品清单</div>';
      return '<div class="card"><div class="card-header"><b>单据明细</b></div>' + body + '</div>';
    }
    var tabBtn = function (key, label) {
      var on = tab === key;
      return '<button class="btn btn-sm ' + (on ? 'btn-primary' : 'btn-outline-secondary') + '" data-tab="' + key + '">' + label + '</button>';
    };
    body = '<div style="padding:12px 16px 0;display:flex;gap:8px;">' +
      tabBtn('items', '药品清单') + tabBtn('codes', '码详情（' + d.codes.length + '）') + '</div>' +
      (tab === 'items' ? itemsTable(d) : codesTable(d)) +
      '<div class="text-secondary" style="padding:0 16px 12px;font-size:12.5px;">点列表「✓ 审核入库」可选上架货位（非必填）确认入库；扫码在「药品扫码上架」进行。</div>';
    return '<div class="card"><div class="card-header"><b>单据明细</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · ' + esc(d.warehouse) + '</span>' +
      '</div>' + body + '</div>';
  }

  // 审核入库：弹窗选上架货位（非必填），确认即整单入库，不扫码
  function openAudit(billNo) {
    var d = null;
    S.pickDocs.forEach(function (x) { if (x.billNo === billNo) d = x; });
    if (!d || d.status !== '已出库·待入库') return;
    if (!W.assertUnfrozen(curPharm())) return;
    var opts = '<option value="">（暂不指定，上架时再选）</option>' +
      pharmSlots().map(function (s) {
        return '<option value="' + esc(s.code) + '">' + esc(s.code) + ' · ' + esc(s.name) + '</option>';
      }).join('');
    UI.modalShell('priAudit', '审核入库 · ' + d.billNo,
      '<div class="mb-3"><label class="form-label">上架货位 <span class="text-secondary" style="font-weight:normal;">（非必填）</span></label>' +
      '<select class="form-select" id="priShelfLoc">' + opts + '</select></div>' +
      '<div class="text-secondary" style="font-size:12.5px;line-height:1.7;">确认后整单 <b>' + d.codes.length + '</b> 个码进入本药房在架，库房在途同步清零；' +
      '所选货位仅作待上架提示，扫码上架时仍可改。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-success" id="priAuditOk">✓ 确认入库</button>', 460);
    var el = UI.open('priAudit');
    el.querySelector('#priAuditOk').addEventListener('click', function () {
      d.shelfLoc = v('priShelfLoc');
      d.status = '已入库·待上架';
      d.inTime = W.now();
      sel = d.billNo;
      save();
      UI.close('priAudit');
      renderAll();
      window.showToast('已入库 ' + d.codes.length + ' 个码，药房在架已增加' + (d.shelfLoc ? '；待上架货位 ' + d.shelfLoc : ''));
    });
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + detailCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { status: v('fStatus'), kw: v('fKw') }; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { status: '待入库', kw: '' }; renderAll();
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-audit]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openAudit(btn.getAttribute('data-audit'));
      });
    });
    content.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { tab = btn.getAttribute('data-tab'); renderAll(); });
    });
  }

  var first = myDocs()[0];
  if (first && !sel) sel = first.billNo;
  renderAll();
})();
