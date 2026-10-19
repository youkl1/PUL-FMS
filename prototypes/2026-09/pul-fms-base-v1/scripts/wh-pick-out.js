/**
 * wh-pick-out.js — 领用出库单（纯出库台账）
 * 口径：只列过账领用单（已出库 / 已入库 / 上架状态推导），与药房「领用入库单」一一对应
 * 草稿/待出库/已作废归「领用备货单」页；2026-10-05 单池化：来源/明细直读单据本体（reqPool 已废除）
 * 明细三页签：码详情/药品清单/无库存码（2026-10-18 Task4 迁移 PulDocDetail——第三页签经 names 覆盖 bad 显示名「无库存码」，码列表按钮走 extraColumns）；
 * 药品清单列=计划数量/实物数量/扫码数量（扫码数量=实物数量，扫码是全部提交——2026-10-09 拍板）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pickOut', crumb: ['库房管理', '领用出库单'] });
  if (!content) return;

  var W = window.PUL_WH, R = window.PUL_RX, D = window.PUL_DRUG, UI = window.PchUI, esc = UI.esc;
  var DS = D.load(), DICT = D.flat(DS);
  var wh = W.load();
  var sel = new URLSearchParams(location.search).get('billNo') || null;
  var dtab = 'drugs';   // 明细页签：drugs=药品清单 / codes=码详情 / bad=无库存码（names 覆盖显示名）
  var f = { billNo: '', pharmacy: '', loc: '', status: '', d1: '', d2: '' };

  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function curNode() { return (window.store.load().currentUser || {}).node || '中心库'; }
  function drug(dc) { return R.drugOf(dc) || {}; }
  function drugName(dc) { return drug(dc).drugName || dc; }
  function stHtml(d) {
    var st = W.pickStatus(d);
    if (st === '已上架') return '<span class="pch-light" style="color:#2FB344;"><i class="pch-dot" style="background:#2FB344;"></i>已入库</span>';   // TODO(light): 待 PchUI.light 扩展收编（已上架在「上架状态」列）
    return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>已出库</span>';   // TODO(light): 待 PchUI.light 扩展收编
  }
  function shelfHtml(d) {
    var sh = W.pickShelf(d);
    if (sh === '已上架') return '<span class="pch-light ok"><i class="pch-dot"></i>已上架</span>';
    if (sh === '待上架') return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待上架</span>';   // TODO(light): 待 PchUI.light 扩展收编
    return '<span class="text-secondary">—</span>';
  }
  function srcHtml(d) {
    if (d.source === '扫码直生') return '<span class="badge bg-cyan-lt">扫码直生</span>';
    if (d.source === '库房制单' && !(d.items || []).length) return '<span class="badge bg-orange-lt">直接出库</span>';
    if (d.source === '库房制单') return '<span class="badge bg-purple-lt">库房制单</span>';
    return '<span class="badge bg-azure-lt">领用申请</span>';
  }
  function locOf(d) {
    var locs = [];
    (d.codes || []).forEach(function (c) { if (c.expectLoc && locs.indexOf(c.expectLoc) < 0) locs.push(c.expectLoc); });
    (d.items || []).forEach(function (it) { if (it.slot && locs.indexOf(it.slot) < 0) locs.push(it.slot); });
    return locs.join('、') || '-';
  }
  function pharmacyOpts() {
    var names = [];
    try {
      (window.PUL_FACILITY.load().pharmacies || []).forEach(function (p) { if (names.indexOf(p.name) < 0) names.push(p.name); });
    } catch (e) { /* facility 缺失时退回单据出现过的药房 */ }
    (wh.pickDocs || []).forEach(function (d) { if (d.pharmacy && names.indexOf(d.pharmacy) < 0) names.push(d.pharmacy); });
    return names;
  }
  function locOpts() {
    var locs = [];
    (wh.pickDocs || []).forEach(function (d) {
      (d.codes || []).forEach(function (c) { if (c.expectLoc && locs.indexOf(c.expectLoc) < 0) locs.push(c.expectLoc); });
    });
    return locs;
  }
  // 纯出库台账：只列过账领用单（已出库 / 已入库 / 上架状态推导）
  function allDocs() {
    var out = [];
    (wh.pickDocs || []).forEach(function (d) {
      if (d.warehouse !== curNode()) return;
      if (!W.pickPosted(d)) return;   // 草稿/待出库/已作废归「领用备货单」页
      out.push(d);
    });
    out.sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; });
    return out;
  }
  function list() {
    return allDocs().filter(function (d) {
      if (f.billNo && d.billNo.indexOf(f.billNo) === -1) return false;
      if (f.pharmacy && d.pharmacy !== f.pharmacy) return false;
      if (f.loc && locOf(d).indexOf(f.loc) === -1) return false;
      if (!statusMatch(d)) return false;
      var day = (d.date || '').slice(0, 10);
      if (f.d1 && day < f.d1) return false;
      if (f.d2 && day > f.d2) return false;
      return true;
    });
  }
  function selDoc() {
    var hit = null;
    allDocs().forEach(function (d) { if (d.billNo === sel) hit = d; });
    return hit;
  }
  // 状态筛选值兼容「已上架」（老筛选）；已上架归入已入库口径
  function statusMatch(d) {
    if (!f.status) return true;
    if (f.status === '已入库') return W.pickStatus(d) === '已入库' || W.pickStatus(d) === '已上架';
    return W.pickStatus(d) === f.status;
  }

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fNo" style="width:170px;" placeholder="单据编号" value="' + esc(f.billNo) + '">' +
      '<span class="text-secondary" style="font-size:12.5px;">出库库房</span>' +
      '<input class="form-control" style="width:110px;" value="' + esc(curNode()) + '" disabled>' +
      '<select class="form-select" id="fPh" style="width:130px;"><option value="">领用药房：全部</option>' +
      pharmacyOpts().map(function (p) { return '<option' + (f.pharmacy === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select>' +
      '<select class="form-select" id="fLoc" style="width:130px;"><option value="">上架货位：全部</option>' +
      locOpts().map(function (l) { return '<option' + (f.loc === l ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>' +
      '<select class="form-select" id="fSt" style="width:140px;"><option value="">状态：全部</option>' +
      ['已出库', '已入库'].map(function (s) { return '<option' + (f.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<input type="date" class="form-control" id="fD1" style="width:150px;" value="' + esc(f.d1) + '">' +
      '<span class="text-secondary">-</span>' +
      '<input type="date" class="form-control" id="fD2" style="width:150px;" value="' + esc(f.d2) + '">' +
      '<button class="btn btn-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary ms-auto" style="font-size:12.5px;">备货在「领用备货单」页；本页单据由药房在「领用入库单」扫码核对闭环</span>' +
      '</div></div></div>';
  }

  function docsCard() {
    var rows = list().map(function (d, i) {
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(d.billNo) + '</b></td>' +
        '<td>调拨出库</td>' +
        '<td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td>' + esc(d.warehouse) + '</td><td>' + esc(d.pharmacy || '—') + '</td>' +
        '<td>' + esc(locOf(d)) + '</td><td>' + esc(d.operator || '-') + '</td>' +
        '<td>' + srcHtml(d) + '</td>' +
        '<td>' + stHtml(d) + '</td><td>' + shelfHtml(d) + '</td>' +
        '<td><span class="text-secondary">—</span></td></tr>';   // 2026-10-09 拍板：操作栏只留按钮，本页纯只读台账
    }).join('');
    if (!rows) rows = '<tr><td colspan="12" class="text-center text-secondary" style="padding:28px;">暂无出库单——「领用备货单」备货审核出库后出现在此</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据类型</th><th>单据时间</th><th>出库库房</th><th>领用药房</th><th>上架货位</th><th>创建人</th><th>单据来源</th><th>状态</th><th>上架状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  // —— 明细三页签（2026-10-18 Task4 迁移 PulDocDetail；第三页签「无库存码」经 names 覆盖 bad 显示名） ——
  // 码折合基本单位数（换算链驱动；拆零按零头/per 计；无链兜底 1）
  function toBase(c) {
    var p = R.parse(c.code);
    if (!p.dict) return 1;
    var dc = p.dict.drugCode;
    var dg = D.drugOf(DS, dc);
    if (c.split === '是') {
      var per = dg && dg.minUnit ? dg.minUnit.per : 0;
      if (per) return Math.round((parseInt(c.splitQty, 10) || 0) / per * 10) / 10;
    }
    var v = dg ? D.conv(DS, dc, 1, p.dict.packUnit || p.dict.unit, dg.baseUnit) : null;
    return v == null ? 1 : v;
  }
  function drugRows(d) {
    if ((d.items || []).length) {
      return d.items.map(function (it) {
        var dcs = (d.codes || []).filter(function (c) {
          var p = R.parse(c.code);
          return p.dict && p.dict.drugCode === it.drugCode;
        });
        var got = 0;
        dcs.forEach(function (c) { got += toBase(c); });
        got = Math.round(got * 10) / 10;
        var dg = drug(it.drugCode);
        // 2026-10-09 拍板：扫码是全部提交——过账单每药扫码数量=实物数量（折合），不再是码数
        return {
          raw: it,
          drugCode: it.drugCode,
          drugName: dg.drugName || it.drugCode,
          formSpec: dg.formSpec || '',
          maker: dg.maker || '-',
          approval: dg.approval || '-',
          unit: dg.baseUnit || '',
          slot: it.slot || '—',
          planQty: it.qty,
          gotQty: got,
          scanQtyTxt: got,
          codesBtn: '<button class="btn btn-sm btn-outline-primary" data-codes="' + esc(it.drugCode) + '">码列表</button>'
        };
      });
    }
    // 无申请（直接出库）：从 codes 聚合
    var map = {}, order = [];
    (d.codes || []).forEach(function (c) {
      var p = R.parse(c.code);
      var dc = p.dict ? p.dict.drugCode : '';
      if (!dc) return;
      if (!map[dc]) { map[dc] = { drugCode: dc, qty: 0, count: 0 }; order.push(dc); }
      map[dc].qty += toBase(c);
      map[dc].count += 1;
    });
    return order.map(function (dc) {
      var m = map[dc], dg = drug(dc);
      return {
        raw: m,
        drugCode: dc,
        drugName: dg.drugName || dc,
        formSpec: dg.formSpec || '',
        maker: dg.maker || '-',
        approval: dg.approval || '-',
        unit: dg.baseUnit || '',
        slot: '—',
        planQty: m.count,
        gotQty: m.count,
        scanQtyTxt: Math.round(m.qty * 10) / 10,
        codesBtn: '<button class="btn btn-sm btn-outline-primary" data-codes="' + esc(dc) + '">码列表</button>'
      };
    });
  }
  function codesRows(d) {
    return (d.codes || []).map(function (c) {
      var p = R.parse(c.code);
      return {
        raw: c,
        code: c.code,
        drugName: p.dict ? p.dict.drugName : '—',
        batch: c.batch || '—',
        expDate: c.expDate || '—',
        expectLoc: c.expectLoc || '',
        phLocTxt: c.phLoc || '待上架'
      };
    });
  }
  var detailModel = { drugs: [], codes: [], bad: [], activeTab: dtab, empty: true };
  function detailCard() {
    var d = selDoc();
    if (!d) {
      detailModel = { drugs: [], codes: [], bad: [], activeTab: dtab, empty: true };
      return window.PulDocDetail.renderTabs(detailModel, {
        title: '单据明细',
        emptyText: '点选上方单据行，查看码详情 / 药品清单 / 无库存码'
      });
    }
    detailModel = { drugs: drugRows(d), codes: codesRows(d), bad: [], activeTab: dtab };
    return window.PulDocDetail.renderTabs(detailModel, {
      title: '单据明细',
      tabs: ['codes', 'drugs', 'bad'],
      names: { bad: '无库存码' },   // 第三页签「无库存码」非「异常码」：names 覆盖显示名，码恒空只承载静态说明
      counts: { codes: 'rows' },
      codes: {
        // 码表公共列子集 + 上架货位扩展列（原「待上架」兜底文案保留）
        columns: ['seq', 'code', 'drugName', 'batch', 'expDate', 'expectLoc'],
        extraColumns: [
          { key: 'phLoc', title: '上架货位', cell: function (r) { return esc(r.phLocTxt); } }
        ],
        emptyText: '尚未扫码'
      },
      drugs: {
        // 药品公共列 + 页面专属列（取药槽编码/计划/实物/扫码数量 + 码列表按钮经 extraColumns，data-codes 监听不动）
        columns: ['seq', 'drugCode', 'drugName', 'formSpec', 'maker', 'approval', 'unit'],
        extraColumns: [
          { key: 'slot', title: '取药槽编码', cell: function (r) { return esc(r.slot); } },
          { key: 'planQty', title: '计划数量', cell: function (r) { return '<b>' + r.planQty + '</b>'; } },
          { key: 'gotQty', title: '实物数量', cell: function (r) { return '<b>' + r.gotQty + '</b>'; } },
          { key: 'scanQty', title: '扫码数量', cell: function (r) { return '<b>' + r.scanQtyTxt + '</b>'; } },
          { key: 'codes', title: '操作', cell: function (r) { return r.codesBtn; } }
        ],
        emptyText: '无药品明细'
      },
      bad: {
        columns: ['seq'],
        emptyText: '本单无无库存码——非在架码在备货出库扫码时已被拦截，此处保留页签对齐老系统。'
      }
    });
  }

  function openCodes(drugCode) {
    var d = selDoc();
    if (!d) return;
    var rows = (d.codes || []).filter(function (c) {
      var p = R.parse(c.code);
      return p.dict && p.dict.drugCode === drugCode;
    }).map(function (c) {
      return '<tr><td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td>' + esc(c.batch || '—') + '</td><td>' + esc(c.expDate || '—') + '</td><td>' + esc(c.expectLoc || '—') + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="4" class="text-center text-secondary">该药尚未扫码</td></tr>';
    UI.modalShell('pkCodes', '码列表 · ' + drugName(drugCode) + ' · ' + d.billNo,
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>追溯码</th><th>批次</th><th>效期</th><th>预期货位</th></tr></thead><tbody>' + rows + '</tbody></table></div>',
      '<button class="btn btn-outline-secondary" data-mclose>关闭</button>', 720);
    UI.open('pkCodes');
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + detailCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      f = { billNo: v('fNo'), pharmacy: v('fPh'), loc: v('fLoc'), status: v('fSt'), d1: v('fD1'), d2: v('fD2') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      f = { billNo: '', pharmacy: '', loc: '', status: '', d1: '', d2: '' }; renderAll();
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    // 明细页签切换统一走 PulDocDetail.bind（替代原按钮式页签监听；码列表按钮 data-codes 监听保留）
    window.PulDocDetail.bind(content, {
      model: detailModel,
      onTab: function (key) { dtab = key; renderAll(); }
    });
    content.querySelectorAll('[data-codes]').forEach(function (b) {
      b.addEventListener('click', function () { openCodes(b.getAttribute('data-codes')); });
    });
  }

  if (!sel && list().length) sel = list()[0].billNo;
  if (sel && !selDoc()) sel = list().length ? list()[0].billNo : null;   // 深链指向未过账单（待出库/草稿）时回落
  renderAll();
})();
