/**
 * wh-out-query.js — 出库明细查询：领用出库（已过账）+ 其他出库单（已审核）合并视图
 * 主从联动对齐老系统「采购明细」：药品汇总主表 → 点行下钻单据列表 → 码明细弹窗
 * 损耗出库有专页（wh-loss-query），本页不含
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'whOutQ', crumb: ['库房管理', '出库明细查询'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load();
  var DICT = D.flat(DS);
  var sel = null;   // 选中药品组 key = idcode
  var filters = { trace: '', name: '', other: '', ip: '全部', op: '全部', billNo: '', kind: '全部', target: '', dateFrom: '', dateTo: '' };

  // 登录节点是库房则用之；若是药房（从 plan 直达/药房账号预览库房页）演示兜底中心库——与 W.curPharm 对称
  function curWh() {
    var u = (window.store.load().currentUser || {});
    var name = u.warehouse || '';
    var nodes = window.PUL ? window.PUL.nodesOfOrg(u.org) : [];
    var type = '';
    for (var i = 0; i < nodes.length; i++) if (nodes[i].name === name) { type = nodes[i].type; break; }
    if (window.PUL && window.PUL.nodeKind(type) === '药房') return '中心库';
    return name || '中心库';
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  // 统一出库单视图：{ kind, billNo, refNo, date, target(药房/出库类型), status, codes, raw }
  function docs() {
    var out = [];
    (S.pickDocs || []).forEach(function (d) {
      if (!W.pickPosted(d)) return;   // 待出库/待提交未扣账，不算出库事实
      if (d.warehouse !== curWh()) return;
      out.push({ kind: '领用出库', billNo: d.billNo, refNo: '', date: d.date,
        target: d.pharmacy, status: d.status, codes: d.codes || [], raw: d });
    });
    (S.othOutDocs || []).forEach(function (d) {
      if (d.status !== '已审核') return;
      if (d.warehouse !== curWh()) return;
      out.push({ kind: '其他出库单', billNo: d.billNo, refNo: '', date: d.date,
        target: (d.type || '其他') + (d.receiver ? ' · ' + d.receiver : ''), status: d.status, codes: d.codes || [], raw: d });
    });
    return out;
  }
  function matchDoc(d) {
    if (filters.billNo && d.billNo.indexOf(filters.billNo) === -1 && (d.refNo || '').indexOf(filters.billNo) === -1) return false;
    if (filters.kind !== '全部' && d.kind !== filters.kind) return false;
    if (filters.target && (d.target || '').indexOf(filters.target) === -1) return false;
    if (filters.dateFrom && d.date.slice(0, 10) < filters.dateFrom) return false;
    if (filters.dateTo && d.date.slice(0, 10) > filters.dateTo) return false;
    return true;
  }
  function matchDict(p, c) {
    var t = p.dict;
    if (filters.trace && c.code.indexOf(filters.trace) === -1) return false;
    if (filters.name && (!t || t.drugName.indexOf(filters.name) === -1)) return false;
    if (filters.other) {
      var hay = t ? (t.drugCode + ' ' + t.formSpec + ' ' + t.approval + ' ' + t.maker) : '';
      if (hay.indexOf(filters.other) === -1) return false;
    }
    if (filters.ip !== '全部' && (!t || t.ipUnpack !== filters.ip)) return false;
    if (filters.op !== '全部' && (!t || t.opUnpack !== filters.op)) return false;
    return true;
  }
  // 药品级汇总（老系统主表无批次列）：key = idcode
  function grouped() {
    var map = {}, order = [];
    docs().forEach(function (d) {
      if (!matchDoc(d)) return;
      d.codes.forEach(function (c) {
        var p = P.parseCode(c.code, DICT);
        if (!matchDict(p, c)) return;
        var key = p.idcode || c.code.slice(0, 7);
        if (!map[key]) { map[key] = { key: key, dict: p.dict, idcode: key, qty: 0, docs: {} }; order.push(key); }
        var g = map[key];
        g.qty += 1;
        if (!g.docs[d.billNo]) g.docs[d.billNo] = { doc: d, qty: 0, codes: [] };
        g.docs[d.billNo].qty += 1;
        g.docs[d.billNo].codes.push(c);
      });
    });
    return order.map(function (k) { return map[k]; });
  }
  function selGroup(list) {
    for (var i = 0; i < list.length; i++) if (list[i].key === sel) return list[i];
    return null;
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    var cell = function (label, ctrl) {
      return '<div style="display:flex;align-items:center;gap:8px;min-width:0;">' +
        '<span class="text-secondary" style="font-size:12.5px;white-space:nowrap;flex-shrink:0;">' + label + '</span>' + ctrl + '</div>';
    };
    var unpack = function (id, cur) {
      return '<select class="form-select" id="' + id + '">' + ['全部', '是', '否'].map(function (o) { return opt(cur, o); }).join('') + '</select>';
    };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 18px;">' +
      cell('追溯码：', '<input class="form-control" id="fTrace" placeholder="追溯码" value="' + esc(filters.trace) + '">') +
      cell('药品通用名：', '<input class="form-control" id="fName" placeholder="药品通用名" value="' + esc(filters.name) + '">') +
      cell('其他条件：', '<input class="form-control" id="fOther" placeholder="药品编码 / 药品规格 / 批准文号" value="' + esc(filters.other) + '">') +
      cell('单据编号：', '<input class="form-control" id="fBillNo" placeholder="出库单号 / 申请单号" value="' + esc(filters.billNo) + '">') +
      cell('住院拆零：', unpack('fIp', filters.ip)) +
      cell('门诊拆零：', unpack('fOp', filters.op)) +
      cell('单据类型：', '<select class="form-select" id="fKind">' +
        ['全部', '领用出库', '其他出库单'].map(function (o) { return opt(filters.kind, o, o === '全部' ? '全部' : o); }).join('') + '</select>') +
      cell('单据日期：', '<input class="form-control" id="fDateFrom" type="date" value="' + filters.dateFrom + '">' +
        '<span class="text-secondary" style="flex-shrink:0;">-</span>' +
        '<input class="form-control" id="fDateTo" type="date" value="' + filters.dateTo + '">') +
      cell('去向：', '<input class="form-control" id="fTarget" placeholder="领用药房 / 接收方" value="' + esc(filters.target) + '">') +
      '</div>' +
      '<div class="d-flex align-items-center mt-2" style="gap:10px;">' +
      '<button class="btn btn-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前库房：' + esc(curWh()) + '</span>' +
      '<div class="ms-auto"><button class="btn btn-outline-primary" id="btnExport">⬇ 导出</button></div>' +
      '</div></div></div>';
  }

  function summaryCard(list) {
    var rowsHtml = list.map(function (g, i) {
      var t = g.dict || {};
      return '<tr class="pch-doc-row' + (g.key === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(g.key) + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(t.drugName || '（未知药品）') + '</b></td>' +
        '<td>' + esc(t.formSpec || '—') + '</td>' +
        '<td><b>' + g.qty + '</b></td>' +
        '<td>' + esc(t.maker || '—') + '</td>' +
        '<td>' + esc(t.approval || '—') + '</td>' +
        '<td>' + esc(t.ipUnpack || '—') + '</td>' +
        '<td>' + esc(t.opUnpack || '—') + '</td>' +
        '<td>' + esc(t.drugCode || '—') + '</td>' +
        '<td><button class="btn btn-sm btn-outline-primary" data-codes="' + esc(g.key) + '">码明细</button></td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="10" class="text-center text-secondary" style="padding:32px;">当前库房（' + esc(curWh()) + '）无匹配出库记录<br><span style="font-size:12px;">出库明细按登录上下文库房隔离 · 若刚切换过部门，请确认当前库房；其他库房的单据请到对应库房上下文查看</span></td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>出库汇总（药品级）</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">总数 = 码 count 派生 · 点行下钻单据列表 · 领用含在途（已出库未闭环）· 损耗另有专页</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药名通用名</th><th>药品规格</th><th>总数</th><th>生产厂家</th><th>批准文号</th><th>住院拆零</th><th>门诊拆零</th><th>药品编码</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // 下表：选中药品的出库单据列表（类型 badge + 去向 + 码明细 + 深链业务页）
  function docsCard(list) {
    var g = selGroup(list);
    if (!g) {
      return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点上方汇总行，下钻查看该药品的出库单据</div></div>';
    }
    var docs = Object.keys(g.docs).map(function (k) { return g.docs[k]; })
      .sort(function (a, b) { return a.doc.date < b.doc.date ? 1 : -1; });
    var trs = docs.map(function (r, i) {
      var d = r.doc;
      var link = d.kind === '其他出库单'
        ? '<a class="btn btn-sm btn-outline-secondary" href="wh-other-out.html?billNo=' + encodeURIComponent(d.billNo) + '">查看单据 →</a>'
        : '<a class="btn btn-sm btn-outline-secondary" href="wh-pick.html?billNo=' + encodeURIComponent(d.billNo) + '">查看单据 →</a>';
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(d.billNo) + '</b></td>' +
        '<td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td><span class="badge ' + (d.kind === '领用出库' ? 'bg-blue-lt' : 'bg-orange-lt') + '">' + esc(d.kind) + '</span> ' + UI.light(d.status) + '</td>' +
        '<td>' + esc(d.target) + '</td>' +
        '<td>' + (d.refNo ? esc(d.refNo) : '<span class="text-secondary">—</span>') + '</td>' +
        '<td><b>' + r.qty + '</b></td>' +
        '<td><button class="btn btn-sm btn-outline-primary" data-doccodes="' + esc(d.billNo) + '">码明细</button> ' + link + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="card-header"><b>出库单据</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(g.dict ? g.dict.drugName : g.idcode) + ' · ' + docs.length + ' 张单</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据日期</th><th>单据类型</th><th>去向</th><th>申请单号</th><th>数量</th><th>操作</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table></div></div>';
  }

  // 码明细弹窗：group=药品级全量 / 单据级该药
  function openCodes(title, codes) {
    var trs = codes.map(function (c, i) {
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td>' +
        '<td>' + (c.split === '是' ? '<span class="badge bg-yellow-lt">拆零 ' + esc(c.splitQty || '') + '</span>' : '—') + '</td></tr>';
    }).join('');
    UI.modalShell('woqCodes', '码明细 · ' + title,
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>追溯码</th><th>批次</th><th>效期</th><th>拆零</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table></div>',
      '<button class="btn btn-outline-secondary" data-mclose>关闭</button>', 760);
    UI.open('woqCodes');
  }

  function renderAll() {
    var list = grouped();
    if (sel && !list.some(function (g) { return g.key === sel; })) sel = null;
    if (!sel && list.length) sel = list[0].key;   // 默认选中首行（对齐老系统：下表随首行出数）
    content.innerHTML = filterBar() + summaryCard(list) + docsCard(list);
    bind(list);
  }

  function bind(list) {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { trace: v('fTrace'), name: v('fName'), other: v('fOther'), ip: v('fIp'), op: v('fOp'),
        billNo: v('fBillNo'), kind: v('fKind'), target: v('fTarget'), dateFrom: v('fDateFrom'), dateTo: v('fDateTo') };
      sel = null; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { trace: '', name: '', other: '', ip: '全部', op: '全部', billNo: '', kind: '全部', target: '', dateFrom: '', dateTo: '' };
      sel = null; renderAll();
    });
    document.getElementById('btnExport').addEventListener('click', function () {
      window.showToast('已导出当前查询结果（原型演示）');
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-codes]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var g = null;
        list.forEach(function (x) { if (x.key === btn.getAttribute('data-codes')) g = x; });
        if (!g) return;
        var codes = [];
        Object.keys(g.docs).forEach(function (k) { codes = codes.concat(g.docs[k].codes); });
        openCodes((g.dict ? g.dict.drugName : g.idcode) + '（共 ' + codes.length + ' 码）', codes);
      });
    });
    content.querySelectorAll('[data-doccodes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var g = selGroup(list);
        if (!g) return;
        var r = g.docs[btn.getAttribute('data-doccodes')];
        if (r) openCodes((g.dict ? g.dict.drugName : g.idcode) + ' · ' + r.doc.billNo, r.codes);
      });
    });
  }

  renderAll();
})();
