/**
 * ph-req-in.js — 调拨入库单（原「领用入库单」，2026-10-12 按方案 v2.1 改名）：库房出库在途 → 药房在架
 * 口径（2026-10-08 对齐拍板）：待入库=库房已出库（已出库）；库房备货已逐码扫码——
 * 审核入库（2026-10-12 统一判定，方案 v2.1）：行内「扫码录入」跳统一扫码页复核 /「审核入库」判定 计划数量=扫码数量 才放行（不一致报异常；无码审核=码空∧计划>0）。直接入库信任短路已取消
 * 词表 v3：已出库（在途）→ 已入库（闭环）；直接领用（无在途单）走新页「新增领用单」
 * 2026-10-09 拍板：列表增实物数量/扫码数量列（扫码数量=审核入库后=实物数量，待入库=0——扫码是全部提交）
 * 2026-10-12 拍板：实物数量列删除（与扫码数量同源冗余）——列表/明细只留 计划数量/扫码数量；菜单随方案 v2.1 改名「调拨入库单」
 * 2026-10-18 Task4：明细双页签迁移 PulDocDetail 共享组件（renderTabs/bind；行内「扫码录入」深链与「审核入库」统一判定监听不动）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'reqIn', crumb: ['药房管理', '调拨入库单'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load();
  var DICT = D.flat(DS);
  var sel = null;
  var tab = 'drugs';   // 明细卡页签：drugs=药品清单 / codes=码详情（2026-10-18 Task4 迁移 PulDocDetail 组件标准页签）
  var filters = { status: '待入库', kw: '' };
  // 入库明细查询深链：按单据状态落到对应页签
  var qsBill = new URLSearchParams(location.search).get('billNo');
  if (qsBill) {
    sel = qsBill;
    filters.kw = qsBill;
    S.pickDocs.forEach(function (d) {
      if (d.billNo === qsBill) filters.status = (d.status === '已入库' || d.status === '已上架') ? '已入库' : '待入库';
    });
  }

  function save() { W.save(S); }
  function curPharm() { return W.curPharm(); }
  function myDocs() {
    var ph = curPharm();
    return S.pickDocs.filter(function (d) {
      if (d.pharmacy !== ph) return false;
      if (filters.status === '全部' && !W.pickPosted(d)) return false;   // 草稿/作废单不进本页
      if (filters.status === '待入库' && d.status !== '已出库') return false;
      if (filters.status === '已入库' && d.status !== '已入库') return false;
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
      var pending = d.status === '已出库';
      var shelf = W.pickShelf(d);
      var st = pending
        ? '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待入库</span>' // TODO(light): 待 PchUI.light 扩展收编
        : '<span class="pch-light ok"><i class="pch-dot"></i>已入库</span>';
      var shelfHtml = pending ? '<span class="text-secondary">—</span>'
        : (shelf === '已上架'
          ? '<span class="pch-light ok"><i class="pch-dot"></i>已上架</span>'
          : '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待上架</span>'); // TODO(light): 待 PchUI.light 扩展收编
      var src = sourceOf(d);
      // 2026-10-09 拍板：三单列表统一补齐 出库库房/领用药房/上架货位 + 计划数量列
      var slots = [];
      (d.items || []).forEach(function (it) { if (it.slot && slots.indexOf(it.slot) === -1) slots.push(it.slot); });
      var planQty = (d.items || []).reduce(function (n, it) { return n + (it.qty || 0); }, 0);
      // 2026-10-12 统一（方案 v2.1）：行内=「扫码录入」（跳统一扫码页复核）+「审核入库」（统一判定：计划数量=扫码数量才放行，无码审核=码空∧计划>0）
      var op = pending
        ? '<button class="btn btn-sm btn-outline-primary" data-scan="' + esc(d.billNo) + '">扫码录入</button> ' +
          '<button class="btn btn-sm btn-primary" data-audit="' + esc(d.billNo) + '">审核入库</button>'
        : '<span class="text-secondary">—</span>';
      // 2026-10-09 拍板：扫码是全部提交，没有扫一部分提交的——扫码数量=药房审核入库后=实物数量，待入库=0
      var scanQty = pending ? 0 : docBaseQty(d);
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(d.billNo) + '</b></td>' +
        '<td>调拨入库</td>' +
        '<td class="text-secondary">' + esc(d.outTime || d.date) + '</td>' +
        '<td>' + esc(d.warehouse) + '</td><td>' + esc(d.pharmacy) + '</td>' +
        '<td>' + (slots.length ? esc(slots.join('、')) : '<span class="text-secondary">—</span>') + '</td>' +
        '<td>' + esc(src) + '</td>' +
        '<td class="text-secondary">' + esc(d.operator || '-') + '</td>' +
        '<td><b>' + (planQty || '<span class="text-secondary">—</span>') + '</b></td>' +
        '<td><b>' + scanQty + '</b></td><td>' + st + '</td><td>' + shelfHtml + '</td><td>' + op + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="14" class="text-center text-secondary" style="padding:28px;">暂无出库单——库房「调拨出库单」审核后会出现在此</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>库房出库单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">待入库=在途 · 本药房 ' + list.length + ' 单</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>出库单号</th><th>单据类型</th><th>出库时间</th><th>出库库房</th><th>领用药房</th><th>上架货位</th><th>单据来源</th><th>创建人</th><th>计划数量</th><th>扫码数量</th><th>状态</th><th>上架状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // 药品清单行适配：计划数量（计划）+ 扫码数量（码数；拆零按零头折计）——2026-10-12 拍板：实物数量列删除（与扫码数量同源冗余）
  // 2026-10-18 Task4：明细迁移 PulDocDetail 共享组件——原业务计算 → 组件标准 model；计划/扫码数量列经 extraColumns 保留
  function toBase(d, c) {
    var p = P.parseCode(c.code, DICT);
    if (!p.dict) return 1;
    var dc = p.dict.drugCode;
    var dg = D.drugOf(DS, dc);
    if (c.split === '是') {
      var per = dg && dg.minUnit ? dg.minUnit.per : 0;
      if (per) return Math.round((parseInt(c.splitQty, 10) || 0) / per * 10) / 10;
    }
    var val = dg ? D.conv(DS, dc, 1, p.dict.packUnit || p.dict.unit, dg.baseUnit) : null;
    return val == null ? 1 : val;
  }
  // 单据级扫码数量（码折合基本单位合计）：待入库=0、审核入库后=全码折合（扫码是全部提交）
  function docBaseQty(d) {
    var n = 0;
    (d.codes || []).forEach(function (c) { n += toBase(d, c); });
    return Math.round(n * 10) / 10;
  }
  // 药房复核已核对折合（phChecked；2026-10-12 统一审核判定的「扫码数量」口径）
  function phScanQty(d) {
    var n = 0;
    (d.codes || []).forEach(function (c) { if (c.phChecked) n += toBase(d, c); });
    return Math.round(n * 100) / 100;
  }
  function itemsTable(d) {
    var agg = {}, order = [];
    var byDrug = {};
    d.codes.forEach(function (c) {
      var t = dictOf(c.code);
      var key = t ? t.drugCode : '未知';
      if (!byDrug[key]) byDrug[key] = { qty: 0 };
      byDrug[key].qty += toBase(d, c);
    });
    ((d.items || []).length ? d.items : []).forEach(function (it) {
      agg[it.drugCode] = { plan: it.qty };
      order.push(it.drugCode);
    });
    Object.keys(byDrug).forEach(function (dc) {
      if (!agg[dc]) { agg[dc] = { plan: 0 }; order.push(dc); }
    });
    return order.map(function (dc) {
      var t = null;
      DS.drugs.forEach(function (x) { if (x.drugCode === dc) t = x; });
      var cnt = d.codes.filter(function (c) {
        var p = dictOf(c.code);
        return p && p.drugCode === dc;
      }).length;
      return {
        raw: agg[dc],
        drugCode: dc,
        drugName: t ? t.drugName : '未解析',
        formSpec: t ? t.formSpec : '—',
        maker: t ? t.maker : '—',
        approval: t ? t.approval : '—',
        unit: t ? t.baseUnit : '—',
        planQty: agg[dc].plan || 0,
        scanCnt: cnt
      };
    });
  }

  // 码详情行适配：逐码只读（入库核对在统一扫码页「调拨入库」，上架在「药品上架」场景）→ 组件标准 model
  function codesTable(d) {
    var done = d.status !== '已出库';
    return d.codes.map(function (c) {
      return {
        raw: c,
        code: c.code,
        drugName: drugNameOf(c.code),
        batch: c.batch,
        expDate: c.expDate,
        expectLoc: c.expectLoc || '',
        status: { kind: done ? 'done' : 'todo', text: done ? '✓ 已入库' : '在途' }
      };
    });
  }

  var detailModel = { drugs: [], codes: [], bad: [], activeTab: tab, empty: true };
  function detailCard() {
    var d = selDoc();
    if (!d) {
      detailModel = { drugs: [], codes: [], bad: [], activeTab: tab, empty: true };
      return window.PulDocDetail.renderTabs(detailModel, {
        title: '单据明细',
        emptyText: '点选出库单，查看药品清单'
      });
    }
    detailModel = { drugs: itemsTable(d), codes: codesTable(d), bad: [], activeTab: tab };
    return window.PulDocDetail.renderTabs(detailModel, {
      title: '单据明细',
      metaHtml: '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · ' + esc(d.warehouse) + '</span>',
      tabs: ['drugs', 'codes'],
      counts: { codes: 'rows' },
      drugs: {
        // 药品公共列 + 计划/扫码数量页面专属列（extraColumns 保留，审核判定口径文案与列名不动）
        columns: ['seq', 'drugCode', 'drugName', 'formSpec', 'maker', 'approval', 'unit'],
        extraColumns: [
          { key: 'planQty', title: '计划数量', cell: function (r) { return '<b>' + r.planQty + '</b>'; } },
          { key: 'scanCnt', title: '扫码数量', cell: function (r) { return '<b>' + r.scanCnt + '</b>'; } }
        ],
        emptyText: '暂无药品明细'
      },
      codes: {
        // 码表公共列子集（预期货位公共列；状态列=核对状态公共口径，在途/已入库语义不变）
        columns: ['seq', 'code', 'drugName', 'batch', 'expDate', 'expectLoc', 'checkStatus'],
        emptyText: '码清单为空'
      },
      footerHtml: '<span class="text-secondary" style="font-size:12.5px;">库房备货已逐码扫码：行内「扫码录入」跳统一扫码页逐码复核（phChecked）；计划数量=扫码数量后点「审核入库」落账——不一致报异常、不允许审核（2026-10-12 统一判定）。</span>'
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
    // 扫码录入：直跳统一扫码页（深链续作，逐码复核；ph-scan-in 壳保留兼容旧链接）
    content.querySelectorAll('[data-scan]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        location.href = 'scan-hub.html?billNo=' + encodeURIComponent(btn.getAttribute('data-scan'));
      });
    });
    // 审核入库（2026-10-12 统一审核判定，方案 v2.1）：计划数量=扫码数量（phChecked 复核折合）才放行，不一致报异常；
    // 无码审核=码清单空∧计划数量>0（在途单码恒非空，理论不可达，口径与全单据统一）
    content.querySelectorAll('[data-audit]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var no = btn.getAttribute('data-audit');
        var d = null;
        S.pickDocs.forEach(function (x) { if (x.billNo === no) d = x; });
        if (!d || d.status !== '已出库') { window.showToast('单据不在待入库状态'); return; }
        if (!W.assertUnfrozen(curPharm())) return;
        var plan = (d.items || []).reduce(function (n, it) { return n + (it.qty || 0); }, 0);
        var got = phScanQty(d);
        if (!(d.codes || []).length) {
          if (!(plan > 0)) { window.showToast('计划数量为 0 且码清单为空，不允许审核（空单无意义）'); return; }
        } else if (Math.abs(plan - got) > 0.001) {
          var diff = Math.round(Math.abs(plan - got) * 100) / 100;
          window.showToast('计划数量 ' + plan + ' ≠ 扫码数量 ' + got + '（基本单位），不一致不允许审核——点行内「扫码录入」继续复核' + (plan > got ? '（缺 ' + diff + '）' : '（超 ' + diff + '）'));
          return;
        }
        var noCode = !(d.codes || []).length;
        UI.confirm((noCode ? '<b>无码审核入库</b> ' : '审核入库 ') + '<b>' + esc(d.billNo) + '</b>？' + (noCode ? '码清单为空，按计划数量 <b>' + plan + '</b>（基本单位）落账' : '共 ' + d.codes.length + ' 个码（计划数量=扫码数量=' + plan + ' 基本单位，已一致）') + '：' +
          '<div class="text-secondary" style="font-size:12.5px;margin-top:8px;">审核后整单进入本药房在架、库房在途清零；如需逐码复核请先点「扫码录入」。</div>',
          function () {
            W.auditPickIn(d);
            save(); renderAll();
            window.showToast('已入库 ' + d.billNo + (noCode ? '（无码入库）' : '') + '，药房在架已增加，库房在途清零');
          }, '审核入库');
      });
    });
    // 明细页签切换统一走 PulDocDetail.bind（替代原按钮式页签监听；本页明细只读，无行级操作回调）
    window.PulDocDetail.bind(content, {
      model: detailModel,
      onTab: function (key) { tab = key; renderAll(); }
    });
  }

  var first = myDocs()[0];
  if (first && !sel) sel = first.billNo;
  renderAll();
})();
