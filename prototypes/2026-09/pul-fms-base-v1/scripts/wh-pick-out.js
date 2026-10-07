/**
 * wh-pick-out.js — 领用出库单（纯出库台账）
 * 口径：只列过账领用单（已出库·待入库 / 已入库·待上架 / 已上架推导），与药房「领用入库单」一一对应
 * 待提交/待出库/作废归「领用备货单」页；2026-10-05 单池化：来源/明细直读单据本体（reqPool 已废除）
 * 明细三页签：码详情/药品清单/无库存码
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pickOut', crumb: ['库房管理', '领用出库单'] });
  if (!content) return;

  var W = window.PUL_WH, R = window.PUL_RX, UI = window.PchUI, esc = UI.esc;
  var wh = W.load();
  var sel = new URLSearchParams(location.search).get('billNo') || null;
  var dtab = 'drug';
  var f = { billNo: '', pharmacy: '', loc: '', status: '', d1: '', d2: '' };

  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function curNode() { return (window.store.load().currentUser || {}).node || '中心库'; }
  function drug(dc) { return R.drugOf(dc) || {}; }
  function drugName(dc) { return drug(dc).drugName || dc; }
  function stHtml(d) {
    var st = W.pickStatus(d);
    if (st === '已上架') return '<span class="pch-light ok"><i class="pch-dot"></i>已上架</span>';
    if (st === '已入库·待上架') return '<span class="pch-light" style="color:#2FB344;"><i class="pch-dot" style="background:#2FB344;"></i>已入库 · 待上架</span>';
    return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>已出库 · 待入库</span>';   // TODO(light): 待 PchUI.light 扩展收编
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
  // 纯出库台账：只列过账领用单（已出库·待入库 / 已入库·待上架 / 已上架推导）
  function allDocs() {
    var out = [];
    (wh.pickDocs || []).forEach(function (d) {
      if (d.warehouse !== curNode()) return;
      if (!W.pickPosted(d)) return;   // 待提交/待出库/已作废归「领用备货单」页
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
      if (f.status && W.pickStatus(d) !== f.status) return false;
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
      ['已出库·待入库', '已入库·待上架', '已上架'].map(function (s) { return '<option' + (f.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<input type="date" class="form-control" id="fD1" style="width:150px;" value="' + esc(f.d1) + '">' +
      '<span class="text-secondary">-</span>' +
      '<input type="date" class="form-control" id="fD2" style="width:150px;" value="' + esc(f.d2) + '">' +
      '<button class="btn btn-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary ms-auto" style="font-size:12.5px;">备货/制单/作废在「领用备货单」页；本页单据由药房在「领用入库单」逐码核对闭环</span>' +
      '</div></div></div>';
  }

  function docsCard() {
    var rows = list().map(function (d, i) {
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(d.billNo) + '</b></td>' +
        '<td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td>' + esc(d.warehouse) + '</td><td>' + esc(d.pharmacy || '—') + '</td>' +
        '<td>' + esc(locOf(d)) + '</td><td>' + esc(d.operator || '-') + '</td>' +
        '<td>' + srcHtml(d) + '</td>' +
        '<td>' + stHtml(d) + '</td>' +
        '<td>' + (d.status === '已出库·待入库'
          ? '<span class="text-secondary" style="font-size:12.5px;">待药房入库</span>'
          : '<span class="text-secondary" style="font-size:12.5px;">闭环 ' + esc(d.inTime || '') + '</span>') + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="10" class="text-center text-secondary" style="padding:28px;">暂无出库单——「领用备货单」备货审核出库后出现在此</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据时间</th><th>出库库房</th><th>领用药房</th><th>上架货位</th><th>创建人</th><th>单据来源</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  // —— 明细三页签 ——
  function drugRows(d) {
    if ((d.items || []).length) {
      return d.items.map(function (it, i) {
        var dcs = (d.codes || []).filter(function (c) {
          var p = R.parse(c.code);
          return p.dict && p.dict.drugCode === it.drugCode;
        });
        var whole = dcs.filter(function (c) { return c.split !== '是'; }).length;
        var splitQty = 0;
        dcs.forEach(function (c) { if (c.split === '是') splitQty += parseInt(c.splitQty || '0', 10); });
        var dg = drug(it.drugCode);
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.slot || '—') + '</td>' +
          '<td><b>' + esc(dg.drugName || it.drugCode) + '</b></td><td class="text-secondary">' + esc(dg.formSpec || '') + '</td>' +
          '<td>' + whole + '</td><td>' + (splitQty || '') + '</td><td>' + esc(dg.baseUnit || '') + '</td>' +
          '<td>' + it.qty + '</td><td>0</td>' +
          '<td class="text-secondary">' + esc(dg.maker || '-') + '</td>' +
          '<td class="text-secondary">' + esc(dg.approval || '-') + '</td>' +
          '<td>' + esc(it.drugCode) + '</td>' +
          '<td><button class="btn btn-sm btn-outline-primary" data-codes="' + esc(it.drugCode) + '">码列表</button></td></tr>';
      }).join('');
    }
    // 无申请（直接出库）：从 codes 聚合
    var map = {};
    (d.codes || []).forEach(function (c) {
      var p = R.parse(c.code);
      var dc = p.dict ? p.dict.drugCode : '';
      if (!dc) return;
      if (!map[dc]) map[dc] = { drugCode: dc, whole: 0, splitQty: 0 };
      if (c.split === '是') map[dc].splitQty += parseInt(c.splitQty || '0', 10);
      else map[dc].whole += 1;
    });
    return Object.keys(map).map(function (dc, i) {
      var m = map[dc], dg = drug(dc);
      return '<tr><td>' + (i + 1) + '</td><td>—</td>' +
        '<td><b>' + esc(dg.drugName || dc) + '</b></td><td class="text-secondary">' + esc(dg.formSpec || '') + '</td>' +
        '<td>' + m.whole + '</td><td>' + (m.splitQty || '') + '</td><td>' + esc(dg.baseUnit || '') + '</td>' +
        '<td>' + m.whole + '</td><td>' + m.splitQty + '</td>' +
        '<td class="text-secondary">' + esc(dg.maker || '-') + '</td>' +
        '<td class="text-secondary">' + esc(dg.approval || '-') + '</td>' +
        '<td>' + esc(dc) + '</td>' +
        '<td><button class="btn btn-sm btn-outline-primary" data-codes="' + esc(dc) + '">码列表</button></td></tr>';
    }).join('');
  }
  function detailCard() {
    var d = selDoc();
    if (!d) return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点选上方单据行，查看码详情 / 药品清单 / 无库存码</div></div>';
    var body = '';
    if (dtab === 'code') {
      var rows = (d.codes || []).map(function (c, i) {
        var p = R.parse(c.code);
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
          '<td>' + esc(p.dict ? p.dict.drugName : '—') + '</td><td>' + esc(c.batch || '—') + '</td>' +
          '<td>' + esc(c.expDate || '—') + '</td><td>' + esc(c.expectLoc || '—') + '</td>' +
          '<td>' + esc(c.phLoc || '待上架') + '</td></tr>';
      }).join('');
      if (!rows) rows = '<tr><td colspan="7" class="text-center text-secondary">尚未扫码</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>预期货位</th><th>上架货位</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    } else if (dtab === 'drug') {
      var rows2 = drugRows(d);
      if (!rows2) rows2 = '<tr><td colspan="13" class="text-center text-secondary">无药品明细</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>取药槽编码</th><th>药名通用名</th><th>药品规格</th><th>扫码数量</th><th>扫码零头</th><th>单位</th><th>实物数量</th><th>实物零头</th><th>生产厂家</th><th>批准文号</th><th>药品编码</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows2 + '</tbody></table></div>';
    } else {
      body = '<div class="card-body text-center text-secondary" style="padding:28px;">本单无无库存码——非在架码在备货扫码时已被拦截，此处保留页签对齐老系统。</div>';
    }
    return '<div class="card">' +
      UI.tabsHeader([
        { key: 'code', name: '码详情', badge: (d.codes || []).length || '' },
        { key: 'drug', name: '药品清单' },
        { key: 'nocode', name: '无库存码' }
      ], dtab) + body + '</div>';
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
    content.querySelectorAll('[data-ptab]').forEach(function (b) {
      b.addEventListener('click', function () { dtab = b.getAttribute('data-ptab'); renderAll(); });
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-codes]').forEach(function (b) {
      b.addEventListener('click', function () { openCodes(b.getAttribute('data-codes')); });
    });
  }

  if (!sel && list().length) sel = list()[0].billNo;
  if (sel && !selDoc()) sel = list().length ? list()[0].billNo : null;   // 深链指向未过账单（待出库/待提交）时回落
  renderAll();
})();
