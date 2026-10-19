/**
 * ph-scan-in.js — 领用扫码入库（高拍仪连续作业页，2026-10-08 新增）
 * 「+ 新增领用单」= 选择本药房待入库在途单（库房已出库的备货单）→ 逐码核对 → 全部核对完才放行「审核入库」
 * 双入口：?billNo= 深链续作（领用入库单跳入）/ 新增领用单弹窗选单（2026-10-09 拍板：选择的是库房已出库的备货单，
 *   原「扫库房在架码直生」直领通道删除——药房收货必须锚定在途单）
 * 在途单核对进度仅会话内保存（不入库不上账，关单即弃）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'scanIn', crumb: ['扫码管理', '领用扫码入库'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load();
  var DICT = D.flat(DS);
  var doc = null;            // 在途单本体（选单/深链时非空）
  var scanned = {};          // code → codeObj（核对进度，仅会话内）
  var stats = { scanned: 0, blocked: 0 };
  var feedback = null;       // { level:'ok|warn|bad', msg }

  function save() { W.save(S); }
  function curPharm() { return W.curPharm(); }
  function docOf(no) { for (var i = 0; i < S.pickDocs.length; i++) if (S.pickDocs[i].billNo === no) return S.pickDocs[i]; return null; }
  function drugOfCode(code20) {
    var p = P.parseCode(code20, DICT);
    return p.dict ? p.dict.drugCode : '?';
  }
  function drugName(dc) { var d = D.drugOf(DS, dc); return d ? d.drugName : dc; }
  function drugForm(dc) { var d = D.drugOf(DS, dc); return d ? d.formSpec : ''; }
  function baseUnit(dc) { var d = D.drugOf(DS, dc); return d ? d.baseUnit : ''; }
  function maker(dc) { var d = D.drugOf(DS, dc); return d ? d.maker : ''; }
  function approval(dc) { var d = D.drugOf(DS, dc); return d ? d.approval : ''; }
  function minPer(dc) { var d = D.drugOf(DS, dc); return (d && d.minUnit) ? d.minUnit.per : 0; }
  // 折合基本单位数：拆零码按 零头/per 计（保留 1 位小数），整码按换算链
  function toBase(c) {
    var p = P.parseCode(c.code, DICT);
    if (!p.dict) return 1;
    var dc = p.dict.drugCode;
    if (c.split === '是' && minPer(dc)) {
      var n = parseInt(c.splitQty, 10) || 0;
      return Math.round(n / minPer(dc) * 10) / 10;
    }
    var d = D.drugOf(DS, dc);
    var v = d ? D.conv(DS, dc, 1, p.dict.packUnit || p.dict.unit, d.baseUnit) : null;
    return v == null ? 1 : v;
  }
  // 已核对数按药品聚合（基本单位）
  function scannedByDrug() {
    var m = {};
    Object.keys(scanned).forEach(function (k) {
      var c = scanned[k];
      var dc = drugOfCode(c.code);
      if (!m[dc]) m[dc] = { drugCode: dc, qty: 0, count: 0 };
      m[dc].qty += toBase(c);
      m[dc].count += 1;
    });
    return m;
  }
  function expectLocOf(c) {
    var dc = drugOfCode(c.code);
    var s = '';
    ((doc && doc.items) || []).forEach(function (it) { if (it.drugCode === dc && it.slot) s = it.slot; });
    return c.expectLoc || s;
  }
  function docLabel() {
    if (!doc) return null;
    var slots = [];
    ((doc && doc.items) || []).forEach(function (it) { if (it.slot && slots.indexOf(it.slot) === -1) slots.push(it.slot); });
    return { no: doc.billNo, date: doc.outTime || doc.date, pharm: doc.pharmacy,
      wh: doc.warehouse, slots: slots.join('、'), src: doc.source || '药房申请' };
  }

  // ===== 单据条（新增领用单=选库房已出库的备货单 / 关闭 + 单据字段只读条） =====
  function docBar() {
    var L = docLabel();
    var field = function (label, val) {
      return '<span class="text-secondary" style="font-size:12.5px;">' + label + '</span> <b style="font-size:13px;">' + (val || '<span class="text-secondary">—</span>') + '</b>';
    };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:14px;">' +
      '<button class="btn btn-primary" id="siNew">+ 新增领用单</button>' +
      (doc ? '<button class="btn btn-outline-secondary" id="siClose">× 关闭单据</button>' : '') +
      '<span style="width:1px;height:22px;background:#E5E7EB;"></span>' + // TODO(light): 待 PchUI.light 扩展收编
      (L
        ? field('单据编号：', esc(L.no)) + field('出库时间：', esc(L.date)) +
          field('供货库房：', esc(L.wh)) + field('单据来源：', esc(L.src)) +
          field('预期货位：', L.slots ? esc(L.slots) : '')
        : '<span class="text-secondary" style="font-size:13px;">点「+ 新增领用单」选择库房已出库的备货单，逐码扫码核对</span>') +
      '</div></div></div>';
  }

  // ===== 扫码主区（高拍仪：常驻输入框 + 大字反馈 + 统计 chips） =====
  function scanCard() {
    var keys = Object.keys(scanned);
    var total = doc ? (doc.codes || []).length : null;
    var totalBase = 0;
    keys.forEach(function (k) { totalBase += toBase(scanned[k]); });
    var fb = feedback
      ? '<div class="qs-feedback ' + feedback.level + '">' + feedback.msg + '</div>'
      : '<div class="qs-feedback idle">高拍仪/扫码枪输入，回车即扫：扫一个亮一个，全部核对完才能审核入库；重复扫码自动过滤</div>';
    return '<div class="card mb-3"><div class="card-body" style="padding:14px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:12px;">' +
      '<input class="form-control qs-input" id="siInput" style="flex:1;min-width:320px;" placeholder="请扫药品追溯码（核对模式）" autocomplete="off"' + (doc ? '' : ' disabled') + '>' +
      '<div class="qs-chips">' +
      '<span class="qs-chip">已核对 <b>' + keys.length + '</b>' + (total != null ? ' / ' + total : '') + ' 码</span>' +
      '<span class="qs-chip">折合 <b>' + (Math.round(totalBase * 10) / 10) + '</b> 基本单位</span>' +
      '<span class="qs-chip' + (stats.blocked ? ' bad' : '') + '">拦截 <b>' + stats.blocked + '</b></span>' +
      '</div></div>' + fb + '</div></div>';
  }

  // ===== 扫码处理（在途单逐码核对） =====
  function handleScan(code) {
    if (!code) return;
    if (!doc) { window.showToast('请先点「+ 新增领用单」选择库房已出库的备货单'); return; }
    function pushBad(cd, reason) {
      doc.badCodes = doc.badCodes || [];
      if (!doc.badCodes.some(function (b) { return b.code === cd; }))
        doc.badCodes.push({ code: cd, reason: reason, stage: '药房入库' });
      save();
    }
    var inDoc = (doc.codes || []).some(function (c) { return c.code === code; });
    if (!inDoc) { stats.blocked++; pushBad(code, '单外码'); feedback = { level: 'bad', msg: '× ' + esc(code) + ' 不在本单在途清单，禁止混入' }; renderAll(); return; }
    if (scanned[code]) { feedback = { level: 'warn', msg: '⚠ 该码已核对过，无需重复扫：' + esc(drugName(drugOfCode(code))) }; renderAll(); return; }
    var hit = null;
    (doc.codes || []).forEach(function (c) { if (c.code === code) hit = c; });
    scanned[code] = hit;
    stats.scanned++;
    var done = Object.keys(scanned).length;
    var left = (doc.codes || []).length - done;
    feedback = left > 0
      ? { level: 'ok', msg: '✓ ' + esc(drugName(drugOfCode(code))) + ' 核对通过（剩 ' + left + ' 码未核对）' }
      : { level: 'ok', msg: '✓ ' + esc(drugName(drugOfCode(code))) + ' 核对通过——全部 ' + done + ' 码核对完成，可审核入库' };
    renderAll();
  }

  // ===== 左：药品汇总（计划数量 / 扫码数量 / 已核对数 / 差额；2026-10-09 词表统一） =====
  function drugPanel() {
    var byDrug = scannedByDrug();
    var rowsHtml;
    var hasItems = doc && (doc.items || []).length;
    if (!doc) {
      rowsHtml = '<tr><td colspan="10" class="text-center text-secondary" style="padding:28px;">请选择在途单</td></tr>';
    } else if (hasItems) {
      rowsHtml = (doc.items || []).map(function (it, i) {
        var got = byDrug[it.drugCode] ? byDrug[it.drugCode].qty : 0;
        var cnt = byDrug[it.drugCode] ? byDrug[it.drugCode].count : 0;
        var diff = it.qty - got;
        var cls = diff === 0 && got > 0 ? 'full' : (diff < 0 ? 'over' : (got > 0 ? 'part' : ''));
        var diffTxt = diff === 0 && got > 0 ? '✓ 备齐' : (diff > 0 ? '缺 ' + diff : '超 ' + (-diff));
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.drugCode) + '</td><td><b>' + esc(drugName(it.drugCode)) + '</b></td><td>' + esc(drugForm(it.drugCode)) + '</td>' +
          '<td>' + esc(maker(it.drugCode)) + '</td><td>' + esc(approval(it.drugCode)) + '</td>' +
          '<td>' + (it.slot ? '<span class="badge bg-blue-lt">' + esc(it.slot) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
          '<td><b>' + it.qty + '</b></td><td><b>' + cnt + '</b></td><td><b>' + got + '</b></td><td>' + esc(baseUnit(it.drugCode)) + '</td>' +
          '<td class="wh-pick-diff ' + cls + '">' + diffTxt + '</td></tr>';
      }).join('');
    } else {
      var dcs = Object.keys(byDrug);
      rowsHtml = dcs.map(function (dc, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(dc) + '</td><td><b>' + esc(drugName(dc)) + '</b></td><td>' + esc(drugForm(dc)) + '</td>' +
          '<td>' + esc(maker(dc)) + '</td><td>' + esc(approval(dc)) + '</td><td class="text-secondary">—</td>' +
          '<td class="text-secondary">—</td><td><b>' + byDrug[dc].count + '</b></td><td><b>' + byDrug[dc].qty + '</b></td><td>' + esc(baseUnit(dc)) + '</td>' +
          '<td class="text-secondary">直接出库</td></tr>';
      }).join('');
      if (!dcs.length) rowsHtml = '<tr><td colspan="12" class="text-center text-secondary" style="padding:28px;">本单无计划明细——逐码核对后此处按药品汇总</td></tr>';
    }
    return '<div class="card"><div class="card-header"><b>药品汇总</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + (hasItems ? '计划数量 vs 已核对数（基本单位口径）' : '实收汇总') + '</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>ID</th><th>药品编码</th><th>药名通用名</th><th>制剂规格</th><th>生产厂家</th><th>批准文号</th><th>预期货位</th><th>计划数量</th><th>扫码数量</th><th>已核对数</th><th>单位</th><th>差额</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // ===== 右：码明细（在途单=全码+核对状态；手动剔除不弹确认） =====
  function codePanel() {
    var keys = Object.keys(scanned);
    var total = doc ? (doc.codes || []) : [];
    var rowsHtml = total.map(function (c) {
      var done = !!scanned[c.code];
      var dc = drugOfCode(c.code);
      var expect = expectLocOf(c);
      return '<tr style="' + (done ? '' : 'opacity:.55;') + '"><td></td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(drugName(dc)) + '</b></td>' +
        '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td>' +
        '<td>' + (expect ? '<span class="badge bg-blue-lt">' + esc(expect) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td>' + (done ? '<span class="text-success">✓ 已核对</span>' : '<span class="text-secondary">待核对</span>') + '</td>' +
        '<td>' + (done ? '<button class="btn btn-sm btn-outline-danger" data-unpick="' + esc(c.code) + '">撤销核对</button>' : '') + '</td></tr>';
    }).join('');
    if (!rowsHtml) rowsHtml = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">码明细为空——' + (doc ? '开始扫码' : '请先选择在途单') + '</td></tr>';
    var allDone = total.length > 0 && keys.length === total.length;
    return '<div class="card"><div class="card-header"><b>码明细</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + (doc ? esc(doc.billNo) : '未选单') + ' · 已核对 ' + keys.length + (total.length ? ' / ' + total.length : '') + ' 个码</span></div>' +
      '<div class="table-responsive" style="max-height:360px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>ID</th><th>药品追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>预期货位</th><th>核对状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' +
      '<div class="pch-tabbar">' +
      '<button class="btn btn-outline-secondary" id="siClear"' + (keys.length ? '' : ' disabled') + '>清空</button>' +
      '<div class="ms-auto"><button class="btn btn-success" id="siAudit"' + (allDone ? '' : ' disabled') + '>✓ 审核入库</button></div>' +
      '</div></div>';
  }

  // ===== 审核入库：全码核对完才放行；落账统一走 W.auditPickIn（与领用入库单「直接入库」同口径） =====
  function openAudit() {
    var keys = Object.keys(scanned);
    if (!doc) return;
    var total = (doc.codes || []).length;
    if (!total || keys.length < total) { window.showToast('尚有 ' + (total - keys.length) + ' 个码未核对，不能审核入库'); return; }
    if (!W.assertUnfrozen(curPharm())) return;
    var byDrug2 = scannedByDrug();
    var lines2 = Object.keys(byDrug2).map(function (dc) {
      var it = null;
      (doc.items || []).forEach(function (x) { if (x.drugCode === dc) it = x; });
      return '<div>· ' + esc(drugName(dc)) + '：实收 <b>' + byDrug2[dc].qty + '</b> ' + esc(baseUnit(dc)) +
        (it ? '（领用 ' + it.qty + '，' + (byDrug2[dc].qty === it.qty ? '一致' : '<span class="text-warning">差异 ' + (byDrug2[dc].qty - it.qty) + '</span>') + ')' : '') + '</div>';
    }).join('');
    UI.confirm('审核入库 <b>' + esc(doc.billNo) + '</b>？共 ' + total + ' 个码全部核对通过：<div style="margin-top:8px;">' + lines2 + '</div>' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:8px;">确认后整单进入本药房在架，库房在途清零；上架货位到「药品扫码上架」逐码指定。</div>',
      function () {
        W.auditPickIn(doc);   // 落账统一走数据层（与领用入库单「直接入库」同口径）
        scanned = {}; feedback = null; stats = { scanned: 0, blocked: 0 };
        var no = doc.billNo;
        doc = null;
        save(); renderAll();
        window.showToast('已入库 ' + no + '，药房在架已增加，库房在途清零');
      }, '审核入库');
  }

  // ===== 新增领用单：选择本药房待入库在途单（库房已出库的备货单，2026-10-09 拍板） =====
  function openPickReq() {
    var base = S.pickDocs.filter(function (d) { return d.status === '已出库' && d.pharmacy === curPharm(); });
    var selNo = null;
    function docRows() {
      if (!base.length) return '<tr><td colspan="7" class="text-center text-secondary" style="padding:24px;">本药房暂无待入库在途单</td></tr>';
      return base.map(function (r, i) {
        return '<tr class="pch-doc-row' + (r.billNo === selNo ? ' pch-doc-sel' : '') + '" data-pickin="' + esc(r.billNo) + '">' +
          '<td><input type="radio" name="siPickDoc"' + (r.billNo === selNo ? ' checked' : '') + '></td>' +
          '<td>' + (i + 1) + '</td><td><b>' + esc(r.billNo) + '</b></td>' +
          '<td class="text-secondary">' + esc(r.outTime || r.date) + '</td><td>' + esc(r.warehouse) + '</td>' +
          '<td>' + esc(r.source || '药房申请') + '</td><td>' + (r.codes || []).length + '</td></tr>';
      }).join('');
    }
    function detailRows() {
      var r = null;
      base.forEach(function (x) { if (x.billNo === selNo) r = x; });
      if (!r) return '<tr><td colspan="10" class="text-center text-secondary" style="padding:20px;">选择上方单据后预览品规明细</td></tr>';
      return (r.items || []).map(function (it, i) {
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td>' + (it.slot ? esc(it.slot) : '<span class="text-secondary">—</span>') + '</td>' +
          '<td>' + esc(it.drugCode) + '</td><td><b>' + esc(drugName(it.drugCode)) + '</b></td>' +
          '<td>' + esc(drugForm(it.drugCode)) + '</td>' +
          '<td><b>' + it.qty + '</b></td><td>' + esc(baseUnit(it.drugCode)) + '</td>' +
          '<td class="text-secondary">' + esc(maker(it.drugCode)) + '</td><td class="text-secondary">' + esc(approval(it.drugCode)) + '</td></tr>';
      }).join('');
    }
    UI.modalShell('siPickM', '新增领用单 · 选择库房已出库的备货单（待入库·在途）',
      '<div class="table-responsive" style="max-height:220px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th style="width:36px;"></th><th>序号</th><th>出库单号</th><th>出库时间</th><th>供货库房</th><th>单据来源</th><th>扫码数量</th></tr></thead>' +
      '<tbody id="siPickDocs"></tbody></table></div>' +
      '<div class="table-responsive" style="max-height:180px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>预期货位</th><th>药品编码</th><th>药名通用名</th><th>规格</th><th>计划数量</th><th>单位</th><th>生产厂家</th><th>批准文号</th></tr></thead>' +
      '<tbody id="siPickItems"></tbody></table></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-success ms-auto" id="siPickOk">✓ 选择</button>', 980);
    var el = UI.open('siPickM');
    function refresh() {
      el.querySelector('#siPickDocs').innerHTML = docRows();
      el.querySelector('#siPickItems').innerHTML = detailRows();
      el.querySelectorAll('[data-pickin]').forEach(function (tr) {
        tr.addEventListener('click', function () { selNo = tr.getAttribute('data-pickin'); refresh(); });
      });
    }
    el.querySelector('#siPickOk').addEventListener('click', function () {
      if (!selNo) { window.showToast('请先选择一条在途单'); return; }
      var d = docOf(selNo);
      if (!d) return;
      doc = d;
      scanned = {};
      (d.codes || []).forEach(function (c) { /* 核对进度从零开始，逐码过机 */ });
      feedback = null;
      renderAll();
      UI.close('siPickM');
      window.showToast('已选在途单 ' + selNo + '，逐码扫码核对');
    });
    refresh();
  }

  function renderAll() {
    content.innerHTML = docBar() + scanCard() + '<div class="wh-pick-grid">' + drugPanel() + codePanel() + '</div>';
    bind();
    refocus();
  }
  // 高拍仪免手原则：无弹窗时输入框自动回焦
  function refocus() {
    var modalOpen = !!document.querySelector('.app-modal-overlay[style*="flex"]');
    var input = document.getElementById('siInput');
    if (input && !input.disabled && !modalOpen) input.focus();
  }

  function bind() {
    document.getElementById('siNew').addEventListener('click', openPickReq);
    var sc = document.getElementById('siClose');
    if (sc) sc.addEventListener('click', function () {
      doc = null; scanned = {}; feedback = null; stats = { scanned: 0, blocked: 0 };
      renderAll();
      window.showToast('已关闭单据（核对进度不入库不上账）');
    });
    var input = document.getElementById('siInput');
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var code = input.value.trim();
      input.value = '';
      handleScan(code);
    });
    var clr = document.getElementById('siClear');
    if (clr) clr.addEventListener('click', function () { scanned = {}; renderAll(); });
    var ba = document.getElementById('siAudit');
    if (ba) ba.addEventListener('click', openAudit);
    content.querySelectorAll('[data-unpick]').forEach(function (b) {
      b.addEventListener('click', function () { delete scanned[b.getAttribute('data-unpick')]; renderAll(); });
    });
    // 点击页面空白处回焦（高拍仪作业中手离开键盘）
    content.addEventListener('click', function (e) {
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('a') || e.target.closest('tr')) return;
      refocus();
    });
  }

  // 深链：?billNo= 在途单续作（领用入库单「扫码入库」跳入）
  (function initDeepLink() {
    var no = new URLSearchParams(location.search).get('billNo');
    if (!no) return;
    var d = docOf(no);
    if (!d || d.status !== '已出库') {
      window.showToast('单据 ' + no + ' 不在待入库状态，请到「领用入库单」查看');
      return;
    }
    doc = d;
  })();

  renderAll();
})();

