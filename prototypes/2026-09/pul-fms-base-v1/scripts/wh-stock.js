/**
 * wh-stock.js — 库房库存查询：在架码集合的呈现层（推论 1：数量 = 码 count 派生）
 * 2026-10-01 对齐商码「库房库存查询」：标签式筛选栅格（追溯码/效期小于N天/库位）+ 主从联动
 * 2026-10-09 字段对齐商码截图：删出库在途/药房在架/效期状态列；在架总数拆为「总数(未拆)」+「拆零总数」
 * 主表 = 药品×批次汇总（效期升序 FEFO）；点行 → 下方追溯码明细子表（拆零/层级/父级码/药名/库位/来源）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'whstock', crumb: ['库房管理', '库房库存查询', '库房库存查询'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load(), PS = P.load();
  var DICT = D.flat(DS);
  var TODAY = new Date('2026-09-14'); // 与 W.expStatus 同一基准日
  var filters = { trace: '', name: '', other: '', batch: '', expDays: '', exp: '全部', loc: '全部' };
  var unitView = 'pack'; // pack=包装单位（码的自然单位） / base=基本单位（换算链）
  var sel = null;        // 选中行 idcode|batch

  function curWh() { return (window.store.load().currentUser || {}).warehouse || '中心库'; }
  function stock() { return W.stockAll(PS, S, curWh()); }
  function daysLeft(expDate) { return Math.floor((new Date(expDate) - TODAY) / 86400000); }
  function rowCodes(r) {
    return stock().filter(function (c) { return c.code.slice(0, 7) === r.idcode && c.batch === r.batch; });
  }
  function rows() {
    var list = W.summarizeStock(stock(), DICT);
    list.forEach(function (r) { r.expSt = W.expStatus(r.expDate); });
    list.sort(function (a, b) { return a.expDate < b.expDate ? -1 : 1; });
    return list.filter(function (r) {
      if (filters.trace && !rowCodes(r).some(function (c) { return c.code.indexOf(filters.trace) !== -1; })) return false;
      if (filters.name && r.drugName.indexOf(filters.name) === -1) return false;
      if (filters.other && (r.drugCode + r.formSpec + r.maker).indexOf(filters.other) === -1) return false;
      if (filters.batch && r.batch.indexOf(filters.batch) === -1) return false;
      if (filters.expDays !== '' && daysLeft(r.expDate) >= parseInt(filters.expDays, 10)) return false;
      if (filters.exp !== '全部' && r.expSt !== filters.exp) return false;
      if (filters.loc !== '全部' && !rowCodes(r).some(function (c) { return c.location === filters.loc; })) return false;
      return true;
    });
  }
  // 未拆零码数：拆零=是 的码不计入「总数(未拆)」
  function unsplitQty(r) { return rowCodes(r).filter(function (c) { return c.split !== '是'; }).length; }
  // 拆零总数：拆零码 splitQty 合计（最小制剂单位计）；无拆零码显示 —
  function splitTotal(r) {
    var n = null;
    rowCodes(r).forEach(function (c) { if (c.split === '是') n = (n || 0) + (parseInt(c.splitQty, 10) || 0); });
    return n;
  }
  // 总数(未拆)：跟随筛选区「数量口径」切换（包装单位=码自然单位 / 基本单位=换算链折算）
  function unsplitCell(r) {
    var n = unsplitQty(r);
    if (unitView === 'pack') return '<b>' + n + '</b> ' + esc(r.unit);
    var d = D.drugOf(DS, r.drugCode);
    var v = D.conv(DS, r.drugCode, n, r.unit, d ? d.baseUnit : r.unit);
    return v == null ? '—' : '<b>' + v + '</b> ' + esc(d.baseUnit);
  }
  // 拆零总数：固定最小制剂单位（片/支）
  function splitCell(r) {
    var t = splitTotal(r);
    if (t == null) return '<span class="text-secondary">—</span>';
    var d = D.drugOf(DS, r.drugCode);
    var u = d && d.minUnit ? d.minUnit.u : (d ? d.baseUnit : '');
    return '<b>' + t + '</b> ' + esc(u);
  }

  // 标签式筛选栅格（对齐商码：label + 字段四列排布）
  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    var locs = {};
    stock().forEach(function (c) { if (c.location) locs[c.location] = 1; });
    var locOpts = ['全部'].concat(Object.keys(locs).sort()).map(function (o) { return opt(filters.loc, o, o === '全部' ? '全部库位' : o); }).join('');
    var cell = function (label, ctrl) {
      return '<div style="display:flex;align-items:center;gap:8px;min-width:0;">' +
        '<span class="text-secondary" style="font-size:12.5px;white-space:nowrap;flex-shrink:0;">' + label + '</span>' + ctrl + '</div>';
    };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 18px;">' +
      cell('追溯码：', '<input class="form-control" id="fTrace" placeholder="追溯码" value="' + esc(filters.trace) + '">') +
      cell('药品通用名：', '<input class="form-control" id="fName" placeholder="药品通用名" value="' + esc(filters.name) + '">') +
      cell('其他条件：', '<input class="form-control" id="fOther" placeholder="药品编码 / 制剂规格 / 生产厂家" value="' + esc(filters.other) + '">') +
      cell('批次号：', '<input class="form-control" id="fBatch" placeholder="批次号" value="' + esc(filters.batch) + '">') +
      cell('效期小于：', '<input class="form-control" id="fExpDays" type="number" min="1" placeholder="天数" value="' + esc(filters.expDays) + '" style="max-width:90px;"><span class="text-secondary" style="font-size:12.5px;flex-shrink:0;">天</span>') +
      cell('效期状态：', '<select class="form-select" id="fExp">' + ['全部', '正常', '预警', '过期'].map(function (o) { return opt(filters.exp, o, o === '全部' ? '全部' : o); }).join('') + '</select>') +
      cell('库位：', '<select class="form-select" id="fLoc">' + locOpts + '</select>') +
      '<div style="display:flex;align-items:center;gap:8px;">' +
      '<button class="btn btn-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button></div>' +
      '</div>' +
      '<div class="d-flex align-items-center mt-2" style="gap:10px;">' +
      '<span class="text-secondary" style="font-size:12.5px;">数量口径</span>' +
      '<div class="wh-unit-toggle">' +
      '<button id="uvPack" class="' + (unitView === 'pack' ? 'active' : '') + '">包装单位</button>' +
      '<button id="uvBase" class="' + (unitView === 'base' ? 'active' : '') + '">基本单位</button>' +
      '</div></div></div></div>';
  }

  function mainTable(list) {
    var trs = list.map(function (r, i) {
      var key = r.idcode + '|' + r.batch;
      return '<tr class="pch-doc-row' + (r.expSt === '过期' ? ' wh-row-expired' : '') + (key === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(key) + '">' +
        '<td>' + (i + 1) + '</td><td>' + esc(r.drugCode) + '</td><td><b>' + esc(r.drugName) + '</b></td>' +
        '<td>' + esc(r.formSpec) + ' / ' + esc(r.packSpec) + '</td>' +
        '<td>' + esc(r.batch) + '</td><td>' + esc(r.prodDate || '—') + '</td><td>' + esc(r.expDate) + '</td>' +
        '<td>' + unsplitCell(r) + '</td>' +
        '<td>' + splitCell(r) + '</td>' +
        '<td class="text-secondary">' + esc(r.maker) + '</td></tr>';
    }).join('');
    if (!list.length) trs = '<tr><td colspan="10" class="text-center text-secondary" style="padding:32px;">无在架库存——采购入库单/其他入库单/退回入库单审核后自动进集合</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品编码</th><th>药名通用名</th><th>药品规格</th><th>批次号</th><th>生产日期</th><th>有效期至</th><th title="未拆零追溯码个数（拆零=是 的码不计入）；跟随筛选区「数量口径」切换：包装单位=码自然单位（盒/箱），基本单位=按换算链折算">总数(未拆)</th><th title="拆零码（拆零=是）的拆零数合计，按最小制剂单位（片/支）计">拆零总数</th><th>生产厂家</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table></div>' +
      '</div>';
  }

  // 追溯码明细子表（主从联动：随主表选中行刷新；追溯码/库位筛选同步生效）
  function codeTable(list) {
    var head = '<div class="card"><div class="card-header"><b>追溯码明细</b>';
    if (!list.length) {
      return head + '<span class="text-secondary ms-2" style="font-size:12.5px;">主表无匹配批次</span></div>' +
        '<div class="text-center text-secondary" style="padding:28px;">—</div></div>';
    }
    var row = null;
    list.forEach(function (r) { if (r.idcode + '|' + r.batch === sel) row = r; });
    if (!row) { row = list[0]; sel = row.idcode + '|' + row.batch; }
    var codes = rowCodes(row).filter(function (c) {
      if (filters.trace && c.code.indexOf(filters.trace) === -1) return false;
      if (filters.loc !== '全部' && c.location !== filters.loc) return false;
      return true;
    });
    var trs = codes.map(function (c, i) {
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td>' + (c.split === '是' ? '<span class="badge bg-orange-lt">是</span>' : '否') + '</td>' +
        '<td>' + (c.split === '是' ? esc(c.splitQty) : '<span class="text-secondary">—</span>') + '</td>' +
        '<td>' + c.level + '</td><td>' + esc(c.batch) + '</td><td>' + esc(c.prodDate || '—') + '</td><td>' + esc(c.expDate) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12px;">' + esc(c.parentCode || '—') + '</td>' +
        '<td>' + esc(row.drugName) + '</td>' +
        '<td>' + esc(c.location || '—') + '</td><td class="text-secondary">' + esc(c._src || '—') + '</td></tr>';
    }).join('');
    if (!codes.length) trs = '<tr><td colspan="12" class="text-center text-secondary" style="padding:24px;">无匹配追溯码（检查追溯码/库位筛选）</td></tr>';
    return head + '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(row.drugName) + ' · 批次 ' + esc(row.batch) + ' · 共 ' + codes.length + ' 个在架追溯码</span></div>' +
      '<div class="table-responsive" style="max-height:320px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品追溯码</th><th>拆零</th><th>拆零数</th><th>层级</th><th>批次号</th><th>生产日期</th><th>有效期至</th><th>父级码</th><th>药名通用名</th><th>库位</th><th>来源单据</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table></div></div>';
  }

  function renderAll() {
    var list = rows();
    if (sel && !list.some(function (r) { return r.idcode + '|' + r.batch === sel; })) sel = null;
    if (!sel && list.length) sel = list[0].idcode + '|' + list[0].batch;
    content.innerHTML = filterBar() + mainTable(list) + codeTable(list);
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { trace: v('fTrace'), name: v('fName'), other: v('fOther'), batch: v('fBatch'),
        expDays: v('fExpDays'), exp: v('fExp'), loc: v('fLoc') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { trace: '', name: '', other: '', batch: '', expDays: '', exp: '全部', loc: '全部' };
      renderAll();
    });
    document.getElementById('uvPack').addEventListener('click', function () { unitView = 'pack'; renderAll(); });
    document.getElementById('uvBase').addEventListener('click', function () { unitView = 'base'; renderAll(); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  renderAll();
})();
