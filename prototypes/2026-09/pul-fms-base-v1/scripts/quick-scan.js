/**
 * quick-scan.js — 领用快捷扫码（高拍仪连续作业页）
 * 单据模型（2026-10-05 单池化）：备货=待出库单内动作（docQty 渐满，状态不变）；本页=唯一扫码工作台
 * 三入口同构：?billNo= 深链续作 / 选单（待出库单）/ 新增备货单（直接出库→即建待出库单）
 * 每扫一码实时落盘；四道闸拦截码入 doc.badCodes；审核出库→已出库·待入库（重验在架，不再回写申请）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'quickScan', crumb: ['库房管理', '领用快捷扫码'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load(), PS = P.load(), FS = window.PUL_FACILITY.load();
  var DICT = D.flat(DS);
  var doc = null;            // null | pickDoc 本体（单池：备货=待出库单内动作）
  var picked = {};           // code → codeObj（与 doc.codes 同源，persist() 实时落盘）
  var mode = 'add';          // add | remove
  var stats = { scanned: 0, blocked: 0 };
  var feedback = null;       // { level:'ok|warn|bad', msg }

  function save() { W.save(S); }
  function curWh() { return (window.store.load().currentUser || {}).warehouse || '中心库'; }
  function docOf(no) { for (var i = 0; i < S.pickDocs.length; i++) if (S.pickDocs[i].billNo === no) return S.pickDocs[i]; return null; }
  // 单据实时落盘：picked → doc.codes（备货进度刷新/离开可续作）
  function persist() {
    if (doc) {
      doc.codes = Object.keys(picked).map(function (k) { return picked[k]; });
      save();
    }
  }
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
    if (doc) (doc.items || []).forEach(function (it) { if (it.drugCode === dc && it.slot) s = it.slot; });
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
    var slots = [];
    (doc.items || []).forEach(function (it) { if (it.slot && slots.indexOf(it.slot) === -1) slots.push(it.slot); });
    if (!slots.length && doc.shelfLoc) slots.push(doc.shelfLoc);
    return { no: doc.billNo, bill: '', date: doc.createTime || doc.date, pharm: doc.pharmacy,
      slots: slots.join('、'), wh: doc.warehouse };
  }

  // ===== 单据条（新增 / 选单 / 关闭 + 单据字段只读条） =====
  function docBar() {
    var L = docLabel();
    var field = function (label, val) {
      return '<span class="text-secondary" style="font-size:12.5px;">' + label + '</span> <b style="font-size:13px;">' + (val || '<span class="text-secondary">—</span>') + '</b>';
    };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:14px;">' +
      '<button class="btn btn-primary" id="qsNew">+ 新增备货单</button>' +
      '<button class="btn btn-outline-primary" id="qsPick">▼ 选单（待出库领用单）</button>' +
      (doc ? '<button class="btn btn-outline-secondary" id="qsClose">× 关闭单据</button>' : '') +
      '<span style="width:1px;height:22px;background:#E5E7EB;"></span>' + // TODO(light): 待 PchUI.light 扩展收编
      (L
        ? field('单据编号：', esc(L.no)) +
          field('单据日期：', esc(L.date)) + field('领用药房：', esc(L.pharm)) +
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
      : '<div class="qs-feedback idle">高拍仪/扫码枪输入，回车即扫；扫新码加入，切到「扫码移除」再扫=剔除；重复扫码自动过滤；每扫一码实时落盘可续作</div>';
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
    } else if (!(doc.items || []).length) {
      var dcs = Object.keys(byDrug);
      rowsHtml = dcs.map(function (dc, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(dc) + '</td><td><b>' + esc(drugName(dc)) + '</b></td><td>' + esc(drugForm(dc)) + '</td>' +
          '<td>' + esc(maker(dc)) + '</td><td>' + esc(approval(dc)) + '</td><td class="text-secondary">—</td>' +
          '<td class="text-secondary">—</td><td><b>' + byDrug[dc].qty + '</b></td><td>' + esc(baseUnit(dc)) + '</td>' +
          '<td class="text-secondary">快捷</td></tr>';
      }).join('');
      if (!dcs.length) rowsHtml = '<tr><td colspan="11" class="text-center text-secondary" style="padding:28px;">快捷单：扫码后此处按药品汇总实出数</td></tr>';
    } else {
      rowsHtml = (doc.items || []).map(function (it, i) {
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
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + (doc && (doc.items || []).length ? '申请数 vs 已扫数（基本单位口径，拆零按零头折计）' : '实出汇总') + '</span></div>' +
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
        persist();
        feedback = { level: 'ok', msg: '➖ 已剔除 ' + esc(name) + '（' + esc(code) + '）' };
      } else {
        feedback = { level: 'warn', msg: '⚠ 该码不在本单清单，无需剔除' };
      }
      renderAll(); return;
    }
    var sm = stockMap();
    var c = sm[code];
    // 拦截码落盘 doc.badCodes（四道闸：非在架/解析失败/冻结停用过期/单外码；重复扫码为提示不算拦截）
    function pushBad(cd, reason) {
      if (!doc) return;
      doc.badCodes = doc.badCodes || [];
      if (!doc.badCodes.some(function (b) { return b.code === cd; }))
        doc.badCodes.push({ code: cd, reason: reason, stage: '库房备货' });
      save();
    }
    if (!c) { stats.blocked++; pushBad(code, '非本库房在架'); feedback = { level: 'bad', msg: '× ' + esc(code) + ' 不在在架库存（未入库或已出库）' }; renderAll(); return; }
    if (picked[code]) { feedback = { level: 'warn', msg: '⚠ 重复扫码已自动过滤：' + esc(drugName(drugOfCode(code))) }; renderAll(); return; }
    var p = P.parseCode(code, DICT);
    if (!p.dict) { stats.blocked++; pushBad(code, '解析失败'); feedback = { level: 'bad', msg: '× 标识码未维护，无法解析' }; renderAll(); return; }
    var block = W.blockMove(code, curWh(), 'out', { codeObj: c });
    if (block) { stats.blocked++; pushBad(code, block); feedback = { level: 'bad', msg: '× ' + esc(block) }; renderAll(); return; }
    var dc = p.dict.drugCode;
    var it = null;
    if ((doc.items || []).length) {
      doc.items.forEach(function (x) { if (x.drugCode === dc) it = x; });
      if (!it) { stats.blocked++; pushBad(code, '单外码'); feedback = { level: 'bad', msg: '× ' + esc(p.dict.drugName) + ' 不在本申请单，禁止加入' }; renderAll(); return; }
    }
    picked[code] = c;
    persist();
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
      persist();
      UI.close('qsSplit'); renderAll();
      window.showToast(drugName(dc) + ' 已标记拆零 ' + n + minUnitName(dc));
    });
  }

  // ===== 新增快捷单 / 选单 =====
  // 新增（对齐商码图二）：出库库房（锁定=当前登录库房，业务上只能出本库）/ 领用药房 / 上架货位（随药房联动，可空=入库后再定）
  function openNew() {
    var phs = (FS.pharmacies || []).filter(function (p) { return p.status === '启用'; });
    var phOpts = phs.map(function (p) { return '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>'; }).join('');
    UI.modalShell('qsNewM', '新增快捷单（直接出库）',
      '<div class="mb-3"><label class="form-label required">出库库房</label>' +
      '<select class="form-select" id="qsNewWh" disabled title="出库库房=当前登录库房，只能出本库房的货"><option>' + esc(curWh()) + '</option></select></div>' +
      '<div class="mb-3"><label class="form-label required">领用药房</label><select class="form-select" id="qsNewPh">' + phOpts + '</select></div>' +
      '<div class="mb-3"><label class="form-label">上架货位</label><select class="form-select" id="qsNewSlot"></select>' +
      '<div class="text-secondary mt-1" style="font-size:12px;">整单默认上架货位，随码传递为预期货位；留空=药房入库后再定</div></div>' +
      '<div class="mb-2"><label class="form-label">备注</label><input class="form-control" id="qsNewRmk" placeholder="选填"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">直接出库无申请单；创建即生成备货单草稿，扫码进度实时保存，审核出库即扣账</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="qsNewOk">确定</button>', 440);
    var el = UI.open('qsNewM');
    var phSel = el.querySelector('#qsNewPh'), slotSel = el.querySelector('#qsNewSlot');
    function fillSlots() {
      var ph = null;
      phs.forEach(function (p) { if (p.name === phSel.value) ph = p; });
      var opts = ['<option value="">—（入库后再定）</option>'];
      ((ph && ph.slots) || []).forEach(function (s) { opts.push('<option value="' + esc(s.code) + '">' + esc(s.code) + ' ' + esc(s.name) + '</option>'); });
      slotSel.innerHTML = opts.join('');
    }
    phSel.addEventListener('change', fillSlots);
    fillSlots();
    el.querySelector('#qsNewOk').addEventListener('click', function () {
      var user = window.store.load().currentUser || {};
      var t = W.now();
      var draft = { billNo: W.nextNo('LYCK', S.pickDocs), date: t, pharmacy: phSel.value,
        warehouse: curWh(), applicant: user.name || '演示员', operator: user.name || '演示员',
        source: '库房制单', status: '待出库',
        remark: el.querySelector('#qsNewRmk').value.trim(), shelfLoc: slotSel.value,
        items: [], codes: [], badCodes: [], createTime: t, submitTime: t, outTime: '', inTime: '' };
      S.pickDocs.unshift(draft);
      doc = draft;
      picked = {}; feedback = null;
      save();
      UI.close('qsNewM'); renderAll();
      window.showToast('备货单 ' + draft.billNo + ' 已建（直接出库到 ' + doc.pharmacy + '），开始扫码');
    });
  }
  // 选单（对齐商码图三）：筛选行（单据编号/药房/货位 + 查询 + 选择）→ 单选单据列表 → 选中行明细预览 → 「选择」确认
  function openPickReq() {
    var base = S.pickDocs.filter(function (d) { return d.status === '待出库' && d.warehouse === curWh(); });
    var pf = { no: '', pharm: '全部', slot: '全部' };
    var selNo = null;
    function slotsOf(r) {
      var s = [];
      r.items.forEach(function (it) { if (it.slot && s.indexOf(it.slot) === -1) s.push(it.slot); });
      return s;
    }
    function filtered() {
      return base.filter(function (r) {
        if (pf.no && r.billNo.indexOf(pf.no) === -1) return false;
        if (pf.pharm !== '全部' && r.pharmacy !== pf.pharm) return false;
        if (pf.slot !== '全部' && slotsOf(r).indexOf(pf.slot) === -1) return false;
        return true;
      });
    }
    function docRows(list) {
      if (!list.length) return '<tr><td colspan="8" class="text-center text-secondary" style="padding:24px;">本库房暂无待出库领用单</td></tr>';
      return list.map(function (r, i) {
        var slots = slotsOf(r).join('、');
        return '<tr class="pch-doc-row' + (r.billNo === selNo ? ' pch-doc-sel' : '') + '" data-pickreq="' + esc(r.billNo) + '">' +
          '<td><input type="radio" name="qsPickDoc"' + (r.billNo === selNo ? ' checked' : '') + '></td>' +
          '<td>' + (i + 1) + '</td><td><b>' + esc(r.billNo) + '</b></td>' +
          '<td class="text-secondary">' + esc(r.date) + '</td><td>' + esc(r.warehouse) + '</td>' +
          '<td>' + esc(r.pharmacy) + '</td>' +
          '<td>' + (slots ? '<span class="badge bg-blue-lt">' + esc(slots) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
          '<td>' + esc(r.source || '药房申请') + '</td></tr>';
      }).join('');
    }
    function detailRows() {
      var r = null;
      base.forEach(function (x) { if (x.billNo === selNo) r = x; });
      if (!r) return '<tr><td colspan="10" class="text-center text-secondary" style="padding:20px;">选择上方单据后预览品规明细</td></tr>';
      return r.items.map(function (it, i) {
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td>' + (it.slot ? esc(it.slot) : '<span class="text-secondary">—</span>') + '</td>' +
          '<td>' + esc(it.drugCode) + '</td><td><b>' + esc(drugName(it.drugCode)) + '</b></td>' +
          '<td>' + esc(drugForm(it.drugCode)) + '</td>' +
          '<td><b>' + it.qty + '</b></td><td class="text-secondary">0</td><td>' + esc(baseUnit(it.drugCode)) + '</td>' +
          '<td class="text-secondary">' + esc(maker(it.drugCode)) + '</td><td class="text-secondary">' + esc(approval(it.drugCode)) + '</td></tr>';
      }).join('');
    }
    var phOpts = '<option>全部</option>' + (FS.pharmacies || []).filter(function (p) { return p.status === '启用'; }).map(function (p) {
      return '<option>' + esc(p.name) + '</option>';
    }).join('');
    var slotSet = {};
    base.forEach(function (r) { slotsOf(r).forEach(function (s) { slotSet[s] = 1; }); });
    var slotOpts = '<option>全部</option>' + Object.keys(slotSet).sort().map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    UI.modalShell('qsPickM', '选单（待出库领用单）',
      '<div class="d-flex flex-wrap align-items-center mb-2" style="gap:10px;">' +
      '<span class="text-secondary" style="font-size:12.5px;">单据编号：</span><input class="form-control" id="qsPfNo" style="width:170px;" placeholder="单据编号">' +
      '<span class="text-secondary" style="font-size:12.5px;">药房：</span><select class="form-select" id="qsPfPh" style="width:140px;">' + phOpts + '</select>' +
      '<span class="text-secondary" style="font-size:12.5px;">货位：</span><select class="form-select" id="qsPfSlot" style="width:150px;">' + slotOpts + '</select>' +
      '<button class="btn btn-primary" id="qsPfQuery">查询</button>' +
      '<button class="btn btn-success ms-auto" id="qsPickOk">✓ 选择</button></div>' +
      '<div class="table-responsive" style="max-height:220px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th style="width:36px;"></th><th>序号</th><th>单据编号</th><th>单据时间</th><th>出库库房</th><th>领用药房</th><th>上架货位</th><th>单据来源</th></tr></thead>' +
      '<tbody id="qsPickDocs"></tbody></table></div>' +
      '<div class="text-secondary mt-1 mb-2" style="font-size:12px;" id="qsPickCount"></div>' +
      '<div class="table-responsive" style="max-height:180px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>上架货位</th><th>药品编码</th><th>药名通用名</th><th>药品规格</th><th>单据数量</th><th>扫码数量</th><th>单位</th><th>生产厂家</th><th>批准文号</th></tr></thead>' +
      '<tbody id="qsPickItems"></tbody></table></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>', 980);
    var el = UI.open('qsPickM');
    function refresh() {
      var list = filtered();
      el.querySelector('#qsPickDocs').innerHTML = docRows(list);
      el.querySelector('#qsPickItems').innerHTML = detailRows();
      el.querySelector('#qsPickCount').textContent = '共 ' + list.length + ' 条待出库领用单';
      el.querySelectorAll('[data-pickreq]').forEach(function (tr) {
        tr.addEventListener('click', function () { selNo = tr.getAttribute('data-pickreq'); refresh(); });
      });
    }
    el.querySelector('#qsPfQuery').addEventListener('click', function () {
      pf = { no: el.querySelector('#qsPfNo').value.trim(), pharm: el.querySelector('#qsPfPh').value, slot: el.querySelector('#qsPfSlot').value };
      refresh();
    });
    el.querySelector('#qsPickOk').addEventListener('click', function () {
      if (!selNo) { window.showToast('请先选择一条待出库领用单'); return; }
      var d = null;
      base.forEach(function (x) { if (x.billNo === selNo) d = x; });
      if (!d) return;
      doc = d;
      picked = {};
      (d.codes || []).forEach(function (c) { picked[c.code] = c; });
      feedback = null;
      save();
      UI.close('qsPickM'); renderAll();
      window.showToast('已选领用单 ' + selNo + '，开始扫码备货');
    });
    refresh();
  }

  // ===== 审核出库（待出库单推进为「已出库·待入库」；重验在架防跨时段失效码） =====
  function openAudit() {
    var keys = Object.keys(picked);
    if (!doc || !keys.length) return;
    if (!W.assertUnfrozen(curWh())) return;
    var sm = stockMap();
    var lost = keys.filter(function (k) { return !sm[k]; });
    if (lost.length) {
      UI.confirm('以下 <b>' + lost.length + '</b> 个码已不在在架（可能被其他单据出库/损耗）：<div style="margin-top:6px;font-family:Consolas,monospace;font-size:12.5px;">' +
        lost.map(function (k) { return esc(k); }).join('<br>') +
        '</div><div class="text-secondary" style="font-size:12.5px;margin-top:6px;">请先在码明细剔除失效码后再审核。</div>',
        function () {}, '审核被拦截');
      return;
    }
    var byDrug = pickedByDrug();
    var hasItems = (doc.items || []).length > 0;
    var lines = Object.keys(byDrug).map(function (dc) {
      var it = null;
      if (hasItems) doc.items.forEach(function (x) { if (x.drugCode === dc) it = x; });
      return '<div>· ' + esc(drugName(dc)) + '：实出 <b>' + byDrug[dc].qty + '</b> ' + esc(baseUnit(dc)) +
        (it ? '（申请 ' + it.qty + '，' + (byDrug[dc].qty === it.qty ? '一致' : '<span class="text-warning">差异 ' + (byDrug[dc].qty - it.qty) + '</span>') + ')' : '（直接出库）') +
        (it && it.slot ? '，上架货位 <b>' + esc(it.slot) + '</b>' : (!hasItems && doc.shelfLoc ? '，上架货位 <b>' + esc(doc.shelfLoc) + '</b>' : '')) + '</div>';
    }).join('');
    UI.confirm('审核出库到 <b>' + esc(docLabel().pharm) + '</b>？共 ' + keys.length + ' 个码：<div style="margin-top:8px;">' + lines + '</div>' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:8px;">审核后码从在架扣除、进入「在途」；上架货位随码传递为预期货位。</div>',
      function () {
        var user = window.store.load().currentUser || {};
        var hasItems2 = (doc.items || []).length > 0;
        doc.status = '已出库·待入库';
        doc.outTime = W.now();
        doc.operator = user.name || '演示员';
        var byDrug2 = pickedByDrug();
        (doc.items || []).forEach(function (it) {
          it.docQty = byDrug2[it.drugCode] ? byDrug2[it.drugCode].qty : 0;
        });
        doc.codes = keys.map(function (k) {
          var c = picked[k];
          c.expectLoc = hasItems2 ? slotOfItem(drugOfCode(c.code)) : (doc.shelfLoc || '');
          c.scanHead = '库房备货';
          return c;
        });
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
    // 进度已落盘：换单/关闭不丢进度（单池同单，回到「领用备货单」可继续备货）
    document.getElementById('qsPick').addEventListener('click', openPickReq);
    var qc = document.getElementById('qsClose');
    if (qc) qc.addEventListener('click', function () {
      if (doc && !(doc.codes || []).length && !(doc.items || []).length) {
        // 空直出草稿不留痕：物理删除（有计划的申请单不删，回到列表仍是待出库）
        var billNo = doc.billNo;
        S.pickDocs = S.pickDocs.filter(function (d) { return d.billNo !== billNo; });
        save();
        window.showToast('空单据已撤销');
      } else if (doc) {
        window.showToast('进度已保存在领用单 ' + doc.billNo + '，可到「领用备货单」继续');
      }
      doc = null; picked = {}; feedback = null; renderAll();
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
    if (clr) clr.addEventListener('click', function () { picked = {}; persist(); renderAll(); });
    var ba = document.getElementById('qsAudit');
    if (ba) ba.addEventListener('click', openAudit);
    content.querySelectorAll('[data-unpick]').forEach(function (b) {
      b.addEventListener('click', function () { delete picked[b.getAttribute('data-unpick')]; persist(); renderAll(); });
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

  // 深链：?billNo= 待出库单续作（领用备货单「备货 / 继续备货 / 新增备货单」跳入）
  (function initDeepLink() {
    var no = new URLSearchParams(location.search).get('billNo');
    if (!no) return;
    var d = docOf(no);
    if (!d || d.status !== '待出库') {
      window.showToast('单据 ' + no + ' 不存在或已过账，请到「领用备货单」查看');
      return;
    }
    doc = d;
    (d.codes || []).forEach(function (c) { picked[c.code] = c; });
  })();

  renderAll();
})();
