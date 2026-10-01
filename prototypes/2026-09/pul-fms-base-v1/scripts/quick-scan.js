/**
 * quick-scan.js — 领用快捷扫码（高拍仪连续作业页，对齐旧版「领用扫码」）
 * 高拍仪方式：输入框常驻自动回焦、回车即扫、大字反馈条远距离可读、免点击作业
 * 模式开关：扫码加入 / 扫码移除（旧版「扫码移除」复选框升级为开关，名称不变）
 * 场景规则：重复扫码自动过滤（加入模式下已在清单=⚠提示不重复加入、不计拦截）；
 *          拆零扫码=码明细行「拆零」标记零头数，折合按 零头/per 计入已扫数
 * 单据来源：新增快捷单（直接出库，无申请单不带上架货位）/ 选单（待备货申请单，申请数 vs 已扫数）
 * 审核出库与 wh-pick 同一数据结构（pickDocs + expectLoc），申请单转已完成
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'quickScan', crumb: ['库房管理', '领用快捷扫码'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load(), PS = P.load(), FS = window.PUL_FACILITY.load();
  var DICT = D.flat(DS);
  var doc = null;            // null | { kind:'quick', pharmacy, remark } | { kind:'req', req }
  var picked = {};           // code → codeObj
  var mode = 'add';          // add | remove
  var stats = { scanned: 0, blocked: 0 };
  var feedback = null;       // { level:'ok|warn|bad', msg }

  function save() { W.save(S); }
  function curWh() { return (window.store.load().currentUser || {}).warehouse || '中心库'; }
  function stockMap() {
    var m = {};
    W.stockAll(PS, S, curWh()).forEach(function (c) { m[c.code] = c; });
    return m;
  }
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
  function minUnitName(dc) { var d = D.drugOf(DS, dc); return (d && d.minUnit) ? d.minUnit.u : ''; }
  function slotOfItem(dc) {
    var s = '';
    if (doc && doc.kind === 'req') {
      doc.req.items.forEach(function (it) { if (it.drugCode === dc && it.slot) s = it.slot; });
    }
    return s;
  }
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
  function pickedByDrug() {
    var m = {};
    Object.keys(picked).forEach(function (k) {
      var c = picked[k];
      var dc = drugOfCode(c.code);
      if (!m[dc]) m[dc] = { drugCode: dc, qty: 0, count: 0 };
      m[dc].qty += toBase(c);
      m[dc].count += 1;
    });
    return m;
  }
  function docLabel() {
    if (!doc) return null;
    if (doc.kind === 'quick') return { no: '（审核后生成）', date: W.now(), pharm: doc.pharmacy, slots: '', wh: curWh() };
    var slots = [];
    doc.req.items.forEach(function (it) { if (it.slot && slots.indexOf(it.slot) === -1) slots.push(it.slot); });
    return { no: doc.req.reqNo, date: doc.req.date, pharm: doc.req.pharmacy, slots: slots.join('、'), wh: doc.req.warehouse };
  }

  // ===== 单据条（新增 / 选单 / 关闭 + 单据字段只读条） =====
  function docBar() {
    var L = docLabel();
    var field = function (label, val) {
      return '<span class="text-secondary" style="font-size:12.5px;">' + label + '</span> <b style="font-size:13px;">' + (val || '<span class="text-secondary">—</span>') + '</b>';
    };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:14px;">' +
      '<button class="btn btn-primary" id="qsNew">+ 新增快捷单</button>' +
      '<button class="btn btn-outline-primary" id="qsPick">▼ 选单（待备货申请）</button>' +
      (doc ? '<button class="btn btn-outline-secondary" id="qsClose">× 关闭单据</button>' : '') +
      '<span style="width:1px;height:22px;background:#E5E7EB;"></span>' +
      (L
        ? field('单据编号：', esc(L.no)) + field('单据日期：', esc(L.date)) + field('领用药房：', esc(L.pharm)) +
          field('上架货位：', L.slots ? esc(L.slots) : '') + field('出库库房：', esc(L.wh))
        : '<span class="text-secondary" style="font-size:13px;">请选择或创建单据后开始扫码</span>') +
      '</div></div></div>';
  }

  // ===== 扫码主区（高拍仪：常驻输入框 + 模式开关 + 大字反馈 + 统计 chips） =====
  function scanCard() {
    var keys = Object.keys(picked);
    var totalBase = 0;
    keys.forEach(function (k) { totalBase += toBase(picked[k]); });
    var fb = feedback
      ? '<div class="qs-feedback ' + feedback.level + '">' + feedback.msg + '</div>'
      : '<div class="qs-feedback idle">高拍仪/扫码枪输入，回车即扫；扫新码加入，切到「扫码移除」再扫=剔除；重复扫码自动过滤</div>';
    return '<div class="card mb-3"><div class="card-body" style="padding:14px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:12px;">' +
      '<div class="qs-mode">' +
      '<button id="qsModeAdd" class="' + (mode === 'add' ? 'active-add' : '') + '">▸ 扫码加入</button>' +
      '<button id="qsModeRm" class="' + (mode === 'remove' ? 'active-rm' : '') + '">➖ 扫码移除</button>' +
      '</div>' +
      '<input class="form-control qs-input" id="qsInput" style="flex:1;min-width:280px;" placeholder="请扫药品追溯码' + (mode === 'remove' ? '（移除模式）' : '') + '" autocomplete="off"' + (doc ? '' : ' disabled') + '>' +
      '<div class="qs-chips">' +
      '<span class="qs-chip">已扫 <b>' + keys.length + '</b> 码</span>' +
      '<span class="qs-chip">折合 <b>' + (Math.round(totalBase * 10) / 10) + '</b> 基本单位</span>' +
      '<span class="qs-chip' + (stats.blocked ? ' bad' : '') + '">拦截 <b>' + stats.blocked + '</b></span>' +
      '</div></div>' + fb + '</div></div>';
  }

  // ===== 左：药品汇总 =====
  function drugPanel() {
    var byDrug = pickedByDrug();
    var rowsHtml;
    if (!doc) {
      rowsHtml = '<tr><td colspan="11" class="text-center text-secondary" style="padding:28px;">请选择或创建单据</td></tr>';
    } else if (doc.kind === 'quick') {
      var dcs = Object.keys(byDrug);
      rowsHtml = dcs.map(function (dc, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(dc) + '</td><td><b>' + esc(drugName(dc)) + '</b></td><td>' + esc(drugForm(dc)) + '</td>' +
          '<td>' + esc(maker(dc)) + '</td><td>' + esc(approval(dc)) + '</td><td class="text-secondary">—</td>' +
          '<td class="text-secondary">—</td><td><b>' + byDrug[dc].qty + '</b></td><td>' + esc(baseUnit(dc)) + '</td>' +
          '<td class="text-secondary">快捷</td></tr>';
      }).join('');
      if (!dcs.length) rowsHtml = '<tr><td colspan="11" class="text-center text-secondary" style="padding:28px;">快捷单：扫码后此处按药品汇总实出数</td></tr>';
    } else {
      rowsHtml = doc.req.items.map(function (it, i) {
        var got = byDrug[it.drugCode] ? byDrug[it.drugCode].qty : 0;
        var diff = it.qty - got;
        var cls = diff === 0 && got > 0 ? 'full' : (diff < 0 ? 'over' : (got > 0 ? 'part' : ''));
        var diffTxt = diff === 0 && got > 0 ? '✓ 备齐' : (diff > 0 ? '缺 ' + diff : '超 ' + (-diff));
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.drugCode) + '</td><td><b>' + esc(drugName(it.drugCode)) + '</b></td><td>' + esc(drugForm(it.drugCode)) + '</td>' +
          '<td>' + esc(maker(it.drugCode)) + '</td><td>' + esc(approval(it.drugCode)) + '</td>' +
          '<td>' + (it.slot ? '<span class="badge bg-blue-lt">' + esc(it.slot) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
          '<td><b>' + it.qty + '</b></td><td><b>' + got + '</b></td><td>' + esc(baseUnit(it.drugCode)) + '</td>' +
          '<td class="wh-pick-diff ' + cls + '">' + diffTxt + '</td></tr>';
      }).join('');
    }
    return '<div class="card"><div class="card-header"><b>药品汇总</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + (doc && doc.kind === 'req' ? '申请数 vs 已扫数（基本单位口径，拆零按零头折计）' : '实出汇总') + '</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>ID</th><th>药品编码</th><th>药名通用名</th><th>制剂规格</th><th>生产厂家</th><th>批准文号</th><th>上架货位</th><th>申请数</th><th>已扫数</th><th>单位</th><th>差额</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // ===== 右：码明细（拆零标记 + 手动剔除） =====
  function codePanel() {
    var keys = Object.keys(picked);
    var rowsHtml = keys.map(function (k, i) {
      var c = picked[k];
      var dc = drugOfCode(c.code);
      var expect = slotOfItem(dc);
      var splitTxt = c.split === '是'
        ? '<span class="badge bg-orange-lt">零 ' + esc(c.splitQty) + esc(minUnitName(dc)) + '</span>'
        : '<span class="text-secondary">整</span>';
      var splitBtn = minPer(dc)
        ? '<button class="btn btn-sm btn-outline-warning" data-split="' + esc(c.code) + '">拆零</button> '
        : '';
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(drugName(dc)) + '</b></td>' +
        '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td><td>' + esc(c.location || '—') + '</td>' +
        '<td>' + (expect ? '<span class="badge bg-blue-lt">' + esc(expect) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td class="text-secondary">' + toBase(c) + esc(baseUnit(dc)) + '</td>' +
        '<td>' + splitTxt + '</td>' +
        '<td>' + splitBtn + '<button class="btn btn-sm btn-outline-danger" data-unpick="' + esc(c.code) + '">剔除</button></td></tr>';
    }).join('');
    if (!keys.length) rowsHtml = '<tr><td colspan="10" class="text-center text-secondary" style="padding:28px;">码明细为空——' + (doc ? '开始扫码' : '请先选择或创建单据') + '</td></tr>';
    return '<div class="card"><div class="card-header"><b>码明细</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + (doc ? esc(docLabel().no) : '未选单') + ' · 已扫 ' + keys.length + ' 个码</span></div>' +
      '<div class="table-responsive" style="max-height:360px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>ID</th><th>药品追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>库位</th><th>预期货位</th><th>折合</th><th>拆零</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' +
      '<div class="pch-tabbar">' +
      '<button class="btn btn-outline-secondary" id="qsClear"' + (keys.length ? '' : ' disabled') + '>清空</button>' +
      '<div class="ms-auto"><button class="btn btn-success" id="qsAudit"' + (keys.length ? '' : ' disabled') + '>✓ 审核出库</button></div>' +
      '</div></div>';
  }

  // ===== 扫码处理（加入 / 移除） =====
  function handleScan(code) {
    if (!code) return;
    if (!doc) { window.showToast('请选择或创建单据'); return; }
    if (mode === 'remove') {
      if (picked[code]) {
        var name = drugName(drugOfCode(code));
        delete picked[code];
        feedback = { level: 'ok', msg: '➖ 已剔除 ' + esc(name) + '（' + esc(code) + '）' };
      } else {
        feedback = { level: 'warn', msg: '⚠ 该码不在本单清单，无需剔除' };
      }
      renderAll(); return;
    }
    var sm = stockMap();
    var c = sm[code];
    if (!c) { stats.blocked++; feedback = { level: 'bad', msg: '× ' + esc(code) + ' 不在在架库存（未入库或已出库）' }; renderAll(); return; }
    if (picked[code]) { feedback = { level: 'warn', msg: '⚠ 重复扫码已自动过滤：' + esc(drugName(drugOfCode(code))) }; renderAll(); return; }
    var p = P.parseCode(code, DICT);
    if (!p.dict) { stats.blocked++; feedback = { level: 'bad', msg: '× 标识码未维护，无法解析' }; renderAll(); return; }
    var block = W.blockMove(code, curWh(), 'out', { codeObj: c });
    if (block) { stats.blocked++; feedback = { level: 'bad', msg: '× ' + esc(block) }; renderAll(); return; }
    var dc = p.dict.drugCode;
    var it = null;
    if (doc.kind === 'req') {
      doc.req.items.forEach(function (x) { if (x.drugCode === dc) it = x; });
      if (!it) { stats.blocked++; feedback = { level: 'bad', msg: '× ' + esc(p.dict.drugName) + ' 不在本申请单，禁止加入' }; renderAll(); return; }
    }
    picked[code] = c;
    stats.scanned++;
    var add = toBase(c);
    var got = pickedByDrug()[dc].qty;
    feedback = (it && got > it.qty)
      ? { level: 'warn', msg: '⚠ ' + esc(p.dict.drugName) + ' +' + add + baseUnit(dc) + '（已扫 ' + got + '/' + it.qty + '，超申请数）' }
      : { level: 'ok', msg: '✓ ' + esc(p.dict.drugName) + ' +' + add + baseUnit(dc) + (it ? '（已扫 ' + got + '/' + it.qty + '）' : '') };
    renderAll();
  }

  // ===== 拆零标记（码明细行） =====
  function openSplit(code) {
    var c = picked[code];
    if (!c) return;
    var dc = drugOfCode(c.code);
    var per = minPer(dc);
    UI.modalShell('qsSplit', '拆零 · ' + drugName(dc),
      '<div class="mb-2 text-secondary" style="font-size:12.5px;">追溯码 ' + esc(code) + ' · 1' + esc(baseUnit(dc)) + ' = ' + per + esc(minUnitName(dc)) + '</div>' +
      '<label class="form-label required">零头数量（' + esc(minUnitName(dc)) + '）</label>' +
      '<input class="form-control" id="qsSplitQty" type="number" min="1" max="' + (per - 1) + '" value="' + (c.split === '是' ? esc(c.splitQty) : 1) + '">' +
      '<div class="text-secondary mt-2" style="font-size:12.5px;">拆零后折合按 零头/' + per + ' 计入已扫数；清空零头请把数量改为 0 或直接剔除该码</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="qsSplitOk">保存</button>', 420);
    var el = UI.open('qsSplit');
    el.querySelector('#qsSplitOk').addEventListener('click', function () {
      var n = parseInt(el.querySelector('#qsSplitQty').value, 10) || 0;
      if (n < 1 || n >= per) { window.showToast('零头数量须在 1 ~ ' + (per - 1) + ' 之间'); return; }
      c.split = '是'; c.splitQty = String(n);
      UI.close('qsSplit'); renderAll();
      window.showToast(drugName(dc) + ' 已标记拆零 ' + n + minUnitName(dc));
    });
  }

  // ===== 新增快捷单 / 选单 =====
  function openNew() {
    var phOpts = (FS.pharmacies || []).filter(function (p) { return p.status === '启用'; }).map(function (p) {
      return '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>';
    }).join('');
    UI.modalShell('qsNewM', '新增快捷单（直接出库）',
      '<div class="mb-3"><label class="form-label required">领用药房</label><select class="form-select" id="qsNewPh">' + phOpts + '</select></div>' +
      '<div class="mb-2"><label class="form-label">备注</label><input class="form-control" id="qsNewRmk" placeholder="选填"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">直接出库无申请单、不带上架货位；审核出库后生成 LYCK 出库单</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="qsNewOk">创建并开始扫码</button>', 440);
    var el = UI.open('qsNewM');
    el.querySelector('#qsNewOk').addEventListener('click', function () {
      doc = { kind: 'quick', pharmacy: el.querySelector('#qsNewPh').value, remark: el.querySelector('#qsNewRmk').value.trim() };
      picked = {}; feedback = null;
      UI.close('qsNewM'); renderAll();
      window.showToast('快捷单已创建：出库到 ' + doc.pharmacy);
    });
  }
  function openPickReq() {
    var reqs = S.reqPool.filter(function (r) { return r.status === '待备货' && r.warehouse === curWh(); });
    var rowsHtml = reqs.map(function (r, i) {
      var items = r.items.map(function (it) { return drugName(it.drugCode) + '×' + it.qty + baseUnit(it.drugCode); }).join('、');
      return '<tr class="pch-doc-row" data-pickreq="' + esc(r.reqNo) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(r.reqNo) + '</b></td><td>' + esc(r.pharmacy) + '</td>' +
        '<td class="text-secondary">' + esc(r.date) + '</td><td>' + esc(items) + '</td></tr>';
    }).join('');
    if (!reqs.length) rowsHtml = '<tr><td colspan="5" class="text-center text-secondary" style="padding:24px;">本库房暂无待备货申请单（备货中的申请请到「领用备货单」继续）</td></tr>';
    UI.modalShell('qsPickM', '选择待备货申请单',
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>申请单号</th><th>领用药房</th><th>申请时间</th><th>品规明细</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>', 720);
    var el = UI.open('qsPickM');
    el.querySelectorAll('[data-pickreq]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var no = tr.getAttribute('data-pickreq');
        S.reqPool.forEach(function (r) { if (r.reqNo === no) doc = { kind: 'req', req: r }; });
        picked = {}; feedback = null;
        UI.close('qsPickM'); renderAll();
        window.showToast('已选申请单 ' + no + '，开始扫码备货');
      });
    });
  }

  // ===== 审核出库（与 wh-pick 同一数据结构） =====
  function openAudit() {
    var keys = Object.keys(picked);
    if (!doc || !keys.length) return;
    if (!W.assertUnfrozen(curWh())) return;
    var byDrug = pickedByDrug();
    var lines = Object.keys(byDrug).map(function (dc) {
      var it = null;
      if (doc.kind === 'req') doc.req.items.forEach(function (x) { if (x.drugCode === dc) it = x; });
      return '<div>· ' + esc(drugName(dc)) + '：实出 <b>' + byDrug[dc].qty + '</b> ' + esc(baseUnit(dc)) +
        (it ? '（申请 ' + it.qty + '，' + (byDrug[dc].qty === it.qty ? '一致' : '<span class="text-warning">差异 ' + (byDrug[dc].qty - it.qty) + '</span>') + ')' : '（快捷单）') +
        (it && it.slot ? '，上架货位 <b>' + esc(it.slot) + '</b>' : '') + '</div>';
    }).join('');
    UI.confirm('审核出库到 <b>' + esc(docLabel().pharm) + '</b>？共 ' + keys.length + ' 个码：<div style="margin-top:8px;">' + lines + '</div>' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:8px;">审核后码从在架扣除、进入「在途」；上架货位随码传递为预期货位。</div>',
      function () {
        var user = window.store.load().currentUser || {};
        var isReq = doc.kind === 'req';
        S.pickDocs.unshift({ billNo: W.nextNo('LYCK', S.pickDocs), reqNo: isReq ? doc.req.reqNo : '', date: W.now(),
          pharmacy: docLabel().pharm, warehouse: curWh(), status: '已出库', auditTime: W.now(),
          operator: user.name || '演示员', remark: isReq ? (doc.req.remark || '') : (doc.remark || ''),
          codes: keys.map(function (k) {
            var c = picked[k];
            c.expectLoc = isReq ? slotOfItem(drugOfCode(c.code)) : '';
            return c;
          }) });
        if (isReq) doc.req.status = '已完成';
        doc = null; picked = {}; feedback = null;
        save(); renderAll();
        window.showToast('已审核出库，' + keys.length + ' 个码进入在途（待药房入库）');
      }, '审核出库');
  }

  function renderAll() {
    content.innerHTML = docBar() + scanCard() + '<div class="wh-pick-grid">' + drugPanel() + codePanel() + '</div>';
    bind();
    refocus();
  }
  // 高拍仪免手原则：无弹窗时输入框自动回焦
  function refocus() {
    var modalOpen = !!document.querySelector('.app-modal-overlay[style*="flex"]');
    var input = document.getElementById('qsInput');
    if (input && !input.disabled && !modalOpen) input.focus();
  }

  function bind() {
    document.getElementById('qsNew').addEventListener('click', openNew);
    document.getElementById('qsPick').addEventListener('click', function () {
      if (Object.keys(picked).length) { window.showToast('请先出库或清空已扫码再选单'); return; }
      openPickReq();
    });
    var qc = document.getElementById('qsClose');
    if (qc) qc.addEventListener('click', function () {
      if (Object.keys(picked).length) { window.showToast('请先出库或清空已扫码再关闭单据'); return; }
      doc = null; feedback = null; renderAll();
    });
    document.getElementById('qsModeAdd').addEventListener('click', function () { mode = 'add'; renderAll(); });
    document.getElementById('qsModeRm').addEventListener('click', function () { mode = 'remove'; renderAll(); });
    var input = document.getElementById('qsInput');
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var code = input.value.trim();
      input.value = '';
      handleScan(code);
    });
    var clr = document.getElementById('qsClear');
    if (clr) clr.addEventListener('click', function () { picked = {}; renderAll(); });
    var ba = document.getElementById('qsAudit');
    if (ba) ba.addEventListener('click', openAudit);
    content.querySelectorAll('[data-unpick]').forEach(function (b) {
      b.addEventListener('click', function () { delete picked[b.getAttribute('data-unpick')]; renderAll(); });
    });
    content.querySelectorAll('[data-split]').forEach(function (b) {
      b.addEventListener('click', function () { openSplit(b.getAttribute('data-split')); });
    });
    // 点击页面空白处回焦（高拍仪作业中手离开键盘）
    content.addEventListener('click', function (e) {
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('a') || e.target.closest('tr')) return;
      refocus();
    });
  }

  renderAll();
})();
