/**
 * wh-pick-out.js — 领用出库单（2026-10-01 台账化）：全部出库单（含备货中草稿）+ 库房制单（待提交）管理
 * 数据：wh.pickDocs ⋈ reqPool（reqNo→申请明细）；备货作业唯一源在 wh-pick（本页「继续备货 →」跳转载货）
 * 状态口径统一：待提交（制单草稿，仅 source=库房制单）/ 备货中 / 已出库 / 药房已入库（不再做显示映射）
 * 作废放宽：备货中草稿有无码均可作废（未扣账无库存副作用），有关联申请回写「待备货」
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

  function save() { W.save(wh); }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function curNode() { return (window.store.load().currentUser || {}).node || '中心库'; }
  function curUser() { return (window.store.load().currentUser || {}).name || '演示员'; }
  function drug(dc) { return R.drugOf(dc) || {}; }
  function drugName(dc) { return drug(dc).drugName || dc; }
  function reqOf(d) {
    var req = null;
    (wh.reqPool || []).forEach(function (r) { if (r.reqNo === d.reqNo) req = r; });
    return req;
  }
  function stHtml(d) {
    var st = d.status;
    if (st === '药房已入库') return '<span class="pch-light ok"><i class="pch-dot"></i>药房已入库</span>';
    if (st === '已出库') return '<span class="pch-light" style="color:#206bc4;"><i class="pch-dot" style="background:#206bc4;"></i>已出库</span>';
    if (st === '备货中') return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>备货中</span>';
    return '<span class="badge bg-secondary-lt">待提交</span>';
  }
  function srcHtml(d) {
    if (d._reqDraft) return '<span class="badge bg-purple-lt">库房制单</span>';
    if (!d.reqNo) return '<span class="badge bg-orange-lt">直接出库</span>';
    var req = reqOf(d);
    return req && req.source === '库房制单'
      ? '<span class="badge bg-purple-lt">库房制单</span>'
      : '<span class="badge bg-azure-lt">领用申请</span>';
  }
  function locOf(d) {
    var locs = [];
    (d.codes || []).forEach(function (c) { if (c.expectLoc && locs.indexOf(c.expectLoc) < 0) locs.push(c.expectLoc); });
    var req = d._reqDraft ? d : reqOf(d);
    var items = d._reqDraft ? (reqItemsOf(d) || []) : ((req && req.items) || []);
    items.forEach(function (it) { if (it.slot && locs.indexOf(it.slot) < 0) locs.push(it.slot); });
    return locs.join('、') || '-';
  }
  function reqItemsOf(d) {
    var r = null;
    (wh.reqPool || []).forEach(function (x) { if (x.reqNo === d.billNo) r = x; });
    return r ? r.items : null;
  }
  function pharmacyOpts() {
    var names = [];
    try {
      (window.PUL_FACILITY.load().pharmacies || []).forEach(function (p) { if (names.indexOf(p.name) < 0) names.push(p.name); });
    } catch (e) { /* facility 缺失时退回单据出现过的药房 */ }
    (wh.pickDocs || []).forEach(function (d) { if (d.pharmacy && names.indexOf(d.pharmacy) < 0) names.push(d.pharmacy); });
    return names;
  }
  function slotsOf(phName) {
    try {
      var ph = null;
      (window.PUL_FACILITY.load().pharmacies || []).forEach(function (p) { if (p.name === phName) ph = p; });
      return ph ? (ph.slots || []) : [];
    } catch (e) { return []; }
  }
  function locOpts() {
    var locs = [];
    (wh.pickDocs || []).forEach(function (d) {
      (d.codes || []).forEach(function (c) { if (c.expectLoc && locs.indexOf(c.expectLoc) < 0) locs.push(c.expectLoc); });
    });
    return locs;
  }
  // 全部出库单（本库房）+ 待提交制单草稿（source=库房制单）
  function allDocs() {
    var out = [];
    (wh.pickDocs || []).forEach(function (d) {
      if (d.warehouse !== curNode()) return;
      out.push(d);
    });
    (wh.reqPool || []).forEach(function (r) {
      if (r.source !== '库房制单' || r.status !== '待提交') return;
      if (r.warehouse !== curNode()) return;
      out.push({ _reqDraft: true, billNo: r.reqNo, reqNo: r.reqNo, date: r.date, pharmacy: r.pharmacy,
        warehouse: r.warehouse, operator: r.applicant, status: '待提交', codes: [], remark: r.remark || '' });
    });
    out.sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; });
    return out;
  }
  function list() {
    return allDocs().filter(function (d) {
      if (f.billNo && d.billNo.indexOf(f.billNo) === -1 && (d.reqNo || '').indexOf(f.billNo) === -1) return false;
      if (f.pharmacy && d.pharmacy !== f.pharmacy) return false;
      if (f.loc && locOf(d).indexOf(f.loc) === -1) return false;
      if (f.status && d.status !== f.status) return false;
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
      '<select class="form-select" id="fSt" style="width:110px;"><option value="">状态：全部</option>' +
      ['待提交', '备货中', '已出库', '药房已入库'].map(function (s) { return '<option' + (f.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<input type="date" class="form-control" id="fD1" style="width:150px;" value="' + esc(f.d1) + '">' +
      '<span class="text-secondary">-</span>' +
      '<input type="date" class="form-control" id="fD2" style="width:150px;" value="' + esc(f.d2) + '">' +
      '<button class="btn btn-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-success" id="btnNew">+ 新增单据</button></div>' +
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
        '<td onclick="event.stopPropagation()">' + ops(d) + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="10" class="text-center text-secondary" style="padding:28px;">无出库单——点右上「+ 新增单据」制单，或到「领用备货单」备货生成</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据时间</th><th>出库库房</th><th>领用药房</th><th>上架货位</th><th>创建人</th><th>单据来源</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }
  function ops(d) {
    if (d._reqDraft) {
      return '<button class="btn btn-sm btn-outline-primary" data-editreq="' + esc(d.billNo) + '">编辑</button> ' +
        '<button class="btn btn-sm btn-success" data-submitreq="' + esc(d.billNo) + '">提交</button> ' +
        '<button class="btn btn-sm btn-outline-danger" data-delreq="' + esc(d.billNo) + '">删除</button>';
    }
    if (d.status === '备货中') {
      return '<a class="btn btn-sm btn-primary" href="wh-pick.html?billNo=' + encodeURIComponent(d.billNo) + '" title="跳转领用备货单工作台继续扫码">继续备货 →</a> ' +
        '<button class="btn btn-sm btn-outline-danger" data-void="' + esc(d.billNo) + '">✗ 作废</button>';
    }
    return '<span class="text-secondary" style="font-size:12.5px;">' + esc(d.auditTime || '') + '</span>';
  }

  // —— 明细三页签 ——
  function drugRows(d) {
    var req = reqOf(d);
    if (req) {
      return (req.items || []).map(function (it, i) {
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
      if (!rows) rows = '<tr><td colspan="7" class="text-center text-secondary">' + (d._reqDraft ? '待提交制单尚未备货' : '尚未扫码') + '</td></tr>';
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

  // ===== 库房制单（缺药领用单）：待提交草稿 =====
  function openNew(reqNo) {
    var editing = null;
    if (reqNo) (wh.reqPool || []).forEach(function (r) { if (r.reqNo === reqNo) editing = r; });
    var ph = editing ? editing.pharmacy : pharmacyOpts()[0];
    var body = '<div class="row g-3 mb-2">' +
      '<div class="col-6"><label class="form-label required">领用药房</label><select class="form-select" id="newPh">' +
      pharmacyOpts().map(function (p) { return '<option' + (ph === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select></div>' +
      '<div class="col-6"><label class="form-label">备注</label><input class="form-control" id="newRemark" value="' + esc(editing ? (editing.remark || '') : '') + '" placeholder="选填"></div></div>' +
      '<div id="npPick"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">保存为「待提交」制单草稿；提交后进入「领用备货单」备货队列。存量列口径：选中药房 / 当前库房（基本单位）</div>';
    UI.modalShell('pkNew', editing ? ('编辑制单 · ' + editing.reqNo) : '新增领用单（库房制单）', body,
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="newOk">保存（待提交）</button>', 1100);
    var el = UI.open('pkNew');
    var picker = window.PulDrugPicker.mount(el.querySelector('#npPick'), {
      warehouse: curNode(), pharmacy: ph, slots: slotsOf(ph), showSlot: true,
      items: editing ? editing.items : []
    });
    el.querySelector('#newPh').addEventListener('change', function () {
      var p2 = el.querySelector('#newPh').value;
      picker.reload({ pharmacy: p2, slots: slotsOf(p2) });
    });
    el.querySelector('#newOk').addEventListener('click', function () {
      var phVal = el.querySelector('#newPh').value;
      var items = picker.getItems();
      if (!phVal) { window.showToast('请选择领用药房'); return; }
      if (!items.length) { window.showToast('请至少选择 1 个药品（数量需 ≥1）'); return; }
      if (editing) {
        editing.pharmacy = phVal;
        editing.items = items;
        editing.remark = el.querySelector('#newRemark').value.trim();
        window.showToast('制单 ' + editing.reqNo + ' 已更新');
      } else {
        var reqNo2 = W.nextNo('LY', wh.reqPool, 'reqNo');
        wh.reqPool.unshift({ reqNo: reqNo2, date: W.now(), pharmacy: phVal, warehouse: curNode(),
          applicant: curUser(), source: '库房制单', items: items, status: '待提交',
          remark: el.querySelector('#newRemark').value.trim() });
        sel = reqNo2;
        window.showToast('已保存待提交制单 ' + reqNo2 + '，提交后进入备货队列');
      }
      save(); UI.close('pkNew'); renderAll();
    });
  }
  function submitReq(reqNo) {
    var r = null;
    (wh.reqPool || []).forEach(function (x) { if (x.reqNo === reqNo) r = x; });
    if (!r) return;
    UI.confirm('提交制单 <b>' + esc(reqNo) + '</b>？提交后进入「领用备货单」备货队列，不可再编辑。', function () {
      r.status = '待备货';
      save(); renderAll();
      window.showToast('已提交，备货队列可见');
    }, '提交制单');
  }
  function delReq(reqNo) {
    UI.confirm('删除待提交制单 <b>' + esc(reqNo) + '</b>？未提交不产生影响。', function () {
      wh.reqPool = wh.reqPool.filter(function (x) { return x.reqNo !== reqNo; });
      if (sel === reqNo) sel = null;
      save(); renderAll();
      window.showToast('已删除');
    }, '确认删除');
  }
  function voidDoc(d) {
    UI.confirm('作废 <b>' + esc(d.billNo) + '</b>？' + ((d.codes || []).length ? '已扫 ' + d.codes.length + ' 个码未扣账，作废即释放。' : '空单直接删除，不影响库存。'), function () {
      wh.pickDocs = wh.pickDocs.filter(function (x) { return x.billNo !== d.billNo; });
      if (d.reqNo) (wh.reqPool || []).forEach(function (r) { if (r.reqNo === d.reqNo) r.status = '待备货'; });
      if (sel === d.billNo) sel = null;
      save(); renderAll();
      window.showToast('已作废' + (d.reqNo ? '，关联申请已回到待备货' : ''));
    }, '确认作废');
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
    document.getElementById('btnNew').addEventListener('click', function () { openNew(); });
    content.querySelectorAll('[data-ptab]').forEach(function (b) {
      b.addEventListener('click', function () { dtab = b.getAttribute('data-ptab'); renderAll(); });
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-void]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = null;
        (wh.pickDocs || []).forEach(function (x) { if (x.billNo === b.getAttribute('data-void')) d = x; });
        if (d) voidDoc(d);
      });
    });
    content.querySelectorAll('[data-editreq]').forEach(function (b) {
      b.addEventListener('click', function () { openNew(b.getAttribute('data-editreq')); });
    });
    content.querySelectorAll('[data-submitreq]').forEach(function (b) {
      b.addEventListener('click', function () { submitReq(b.getAttribute('data-submitreq')); });
    });
    content.querySelectorAll('[data-delreq]').forEach(function (b) {
      b.addEventListener('click', function () { delReq(b.getAttribute('data-delreq')); });
    });
    content.querySelectorAll('[data-codes]').forEach(function (b) {
      b.addEventListener('click', function () { openCodes(b.getAttribute('data-codes')); });
    });
  }

  if (!sel && list().length) sel = list()[0].billNo;
  renderAll();
})();
