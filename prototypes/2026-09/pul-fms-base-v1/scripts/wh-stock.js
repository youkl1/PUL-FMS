/**
 * wh-stock.js — 库房库存：在架码集合的呈现层（推论 1：数量 = 码 count 派生）
 * 汇总视图（药品×批次，效期升序 FEFO）⇄ 码明细下钻；单位切换（包装单位⇄基本单位，换算链驱动）；在途数列
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'whstock', crumb: ['库房管理', '库房业务', '库房库存'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load(), PS = P.load();
  var DICT = D.flat(DS);
  var filters = { kw: '', batch: '', exp: '全部' };
  var unitView = 'pack'; // pack=包装单位（码的自然单位） / base=基本单位（换算链）

  function curWh() { return (window.store.load().currentUser || {}).warehouse || '中心库'; }
  function stock() { return W.stockAll(PS, S, curWh()); }
  function transit() { return W.transitByReq(S, curWh()); }
  function rows() {
    var list = W.summarizeStock(stock(), DICT);
    // 挂效期状态 + 排序（近效期在前，FEFO）
    list.forEach(function (r) { r.expSt = W.expStatus(r.expDate); });
    list.sort(function (a, b) { return a.expDate < b.expDate ? -1 : 1; });
    return list.filter(function (r) {
      if (filters.kw && (r.drugName + r.idcode).indexOf(filters.kw) === -1) return false;
      if (filters.batch && r.batch.indexOf(filters.batch) === -1) return false;
      if (filters.exp !== '全部' && r.expSt !== filters.exp) return false;
      return true;
    });
  }
  // 数量显示：按单位视图换算（换算链没有该单位 → —）
  function qtyText(r) {
    if (unitView === 'pack') return '<b>' + r.qty + '</b> ' + esc(r.unit);
    var d = D.drugOf(DS, r.drugCode);
    var v = D.conv(DS, r.drugCode, r.qty, r.unit, d ? d.baseUnit : r.unit);
    return v == null ? '—' : '<b>' + v + '</b> ' + esc(d.baseUnit);
  }
  function expBadge(st) {
    var cls = st === '过期' ? 'bad' : (st === '预警' ? 'warn' : 'ok');
    return '<span class="wh-exp-badge ' + cls + '">' + st + '</span>';
  }

  function statsBar(list) {
    var st = stock(), tr = transit();
    var trCount = 0; Object.keys(tr).forEach(function (k) { trCount += tr[k]; });
    var kinds = {};
    st.forEach(function (c) { kinds[c.code.slice(0, 7)] = 1; });
    var warn = 0, bad = 0;
    W.summarizeStock(st, DICT).forEach(function (r) {
      var e = W.expStatus(r.expDate);
      if (e === '预警') warn++; else if (e === '过期') bad++;
    });
    var cells = [
      { n: Object.keys(kinds).length, l: '在架品种（标识码）', cls: '' },
      { n: st.length, l: '在架追溯码（个）', cls: 'ok' },
      { n: trCount, l: '领出在途（个）', cls: trCount ? 'warn' : '' },
      { n: warn, l: '效期预警批次（≤180天）', cls: warn ? 'warn' : '' },
      { n: bad, l: '已过期批次', cls: bad ? 'bad' : '' }
    ];
    return '<div class="wh-stats">' + cells.map(function (c) {
      return '<div class="wh-stat ' + c.cls + '"><div class="wh-stat-num">' + c.n + '</div><div class="wh-stat-label">' + c.l + '</div></div>';
    }).join('') + '</div>';
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:180px;" placeholder="药品通用名 / 标识码" value="' + esc(filters.kw) + '">' +
      '<input class="form-control" id="fBatch" style="width:130px;" placeholder="批次号" value="' + esc(filters.batch) + '">' +
      '<select class="form-select" id="fExp" style="width:130px;">' + ['全部', '正常', '预警', '过期'].map(function (o) { return opt(filters.exp, o, o === '全部' ? '效期状态' : o); }).join('') + '</select>' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto d-flex align-items-center" style="gap:10px;">' +
      '<span class="text-secondary" style="font-size:12.5px;">数量口径</span>' +
      '<div class="wh-unit-toggle">' +
      '<button id="uvPack" class="' + (unitView === 'pack' ? 'active' : '') + '">包装单位</button>' +
      '<button id="uvBase" class="' + (unitView === 'base' ? 'active' : '') + '">基本单位</button>' +
      '</div></div></div></div></div>';
  }

  function table(list) {
    var tr = transit();
    var trs = list.map(function (r, i) {
      return '<tr' + (r.expSt === '过期' ? ' class="wh-row-expired"' : '') + '>' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(r.drugName) + '</b></td><td>' + esc(r.formSpec) + '</td>' +
        '<td>' + esc(r.packSpec) + '</td><td>' + esc(r.batch) + '</td>' +
        '<td>' + esc(r.expDate) + '</td><td>' + expBadge(r.expSt) + '</td>' +
        '<td>' + qtyText(r) + '</td>' +
        '<td>' + (tr[r.idcode] ? '<span class="text-warning"><b>' + tr[r.idcode] + '</b></span>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td><button class="btn btn-sm btn-outline-primary" data-codes="' + esc(r.idcode) + '|' + esc(r.batch) + '">码明细</button></td></tr>';
    }).join('');
    if (!list.length) trs = '<tr><td colspan="10" class="text-center text-secondary" style="padding:32px;">无在架库存——采购入库/其他入库/退回入库审核后自动进集合</td></tr>';
    return '<div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品通用名</th><th>制剂规格</th><th>包装规格</th><th>批次号</th><th>有效期至</th><th>效期状态</th><th>在架数</th><th>在途数</th><th>操作</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table></div>' +
      '<div class="card-footer" style="font-size:12.5px;"><span class="text-secondary">共 ' + list.length + ' 个批次 · 按效期升序（FEFO 近效期先出）· 红底=已过期 · 在架数=码 count 派生</span></div></div>';
  }

  // 码明细弹窗：该批次的每一个在架追溯码（逐码可溯 + 库位 + 来源单据）
  function openCodes(key) {
    var parts = key.split('|'), idcode = parts[0], batch = parts[1];
    var codes = stock().filter(function (c) { return c.code.slice(0, 7) === idcode && c.batch === batch; });
    var dict = null;
    DICT.forEach(function (d) { if (d.idcode === idcode) dict = d; });
    var trs = codes.map(function (c, i) {
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td>' + c.level + '</td><td>' + esc(c.prodDate) + '</td><td>' + esc(c.expDate) + '</td>' +
        '<td>' + esc(c.location || '—') + '</td><td class="text-secondary">' + esc(c._src || '—') + '</td></tr>';
    }).join('');
    UI.modalShell('whCodes', '码明细 · ' + (dict ? dict.drugName : idcode),
      '<div class="text-secondary" style="font-size:12.5px;margin-bottom:10px;">批次 ' + esc(batch) + ' · 共 ' + codes.length + ' 个在架追溯码</div>' +
      '<div class="table-responsive" style="max-height:420px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>追溯码</th><th>码等级</th><th>生产日期</th><th>有效期至</th><th>库位</th><th>来源单据</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table></div>',
      '<button class="btn btn-outline-secondary" data-mclose>关闭</button>', 900);
    UI.open('whCodes');
  }

  function renderAll() {
    var list = rows();
    content.innerHTML = statsBar(list) + filterBar() + table(list);
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { kw: v('fKw'), batch: v('fBatch'), exp: v('fExp') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { kw: '', batch: '', exp: '全部' };
      renderAll();
    });
    document.getElementById('uvPack').addEventListener('click', function () { unitView = 'pack'; renderAll(); });
    document.getElementById('uvBase').addEventListener('click', function () { unitView = 'base'; renderAll(); });
    content.querySelectorAll('[data-codes]').forEach(function (b) {
      b.addEventListener('click', function () { openCodes(b.getAttribute('data-codes')); });
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  renderAll();
})();
