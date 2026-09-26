/**
 * wh-pick.js — 领用备货出库（库房主流程）：申请单池 → 备货 → 扫码 → 审核出库
 * 双层表达：左药品明细（申请数 vs 已备数，药视角）⇄ 右码清单（逐码销账，码视角），换算链实时转换
 * 已备数按药品基本单位累计：扫箱码自动按 units 链折合（1箱=60瓶 → 已备 +60）
 * 一步式领用：无申请单直出（S2 高频兜底）；出库审核即扣账 → 码进「在途」，「确认药房入库」闭环
 * 注意：picked 按码字符串 key 存（按下标存删码会错位——采购模块教训）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'pick', crumb: ['库房管理', '库房业务', '领用备货出库'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load(), PS = P.load();
  var DICT = D.flat(DS);
  var sel = null;            // reqNo / 'QUICK'
  var picked = {};           // code → codeObj（切单清空）
  var quickPharm = '门诊药房';

  function save() { W.save(S); }
  function curWh() { return (window.store.load().currentUser || {}).warehouse || '中心库'; }
  function stockMap() {
    var m = {};
    W.stockAll(PS, S, curWh()).forEach(function (c) { m[c.code] = c; });
    return m;
  }
  function pendingReqs() { return S.reqPool.filter(function (r) { return r.status === '待备货'; }); }
  function selReq() {
    if (sel === 'QUICK') return { reqNo: '', pharmacy: quickPharm, items: [], status: '一步式' };
    for (var i = 0; i < S.reqPool.length; i++) if (S.reqPool[i].reqNo === sel) return S.reqPool[i];
    return null;
  }
  function drugName(dc) { var d = D.drugOf(DS, dc); return d ? d.drugName : dc; }
  function drugForm(dc) { var d = D.drugOf(DS, dc); return d ? d.formSpec : ''; }
  function baseUnit(dc) { var d = D.drugOf(DS, dc); return d ? d.baseUnit : ''; }
  // 码 → 折合基本单位数（换算链驱动；无链兜底 1）
  function toBase(c) {
    var p = P.parseCode(c.code, DICT);
    if (!p.dict) return 1;
    var d = D.drugOf(DS, p.dict.drugCode);
    var v = d ? D.conv(DS, d.drugCode, 1, p.dict.packUnit || p.dict.unit, d.baseUnit) : null;
    return v == null ? 1 : v;
  }
  // 已备数按药品聚合（基本单位）
  function pickedByDrug() {
    var m = {};
    Object.keys(picked).forEach(function (k) {
      var c = picked[k];
      var p = P.parseCode(c.code, DICT);
      var dc = p.dict ? p.dict.drugCode : '?';
      if (!m[dc]) m[dc] = { drugCode: dc, qty: 0, count: 0 };
      m[dc].qty += toBase(c);
      m[dc].count += 1;
    });
    return m;
  }

  // ===== 申请单池（横排卡片）+ 一步式入口 =====
  function reqPoolBar() {
    var reqs = pendingReqs();
    var cards = reqs.map(function (r) {
      var items = r.items.map(function (it) { return drugName(it.drugCode) + '×' + it.qty + baseUnit(it.drugCode); }).join('、');
      return '<div class="wh-req-card' + (r.reqNo === sel ? ' sel' : '') + '" data-req="' + esc(r.reqNo) + '" style="min-width:250px;">' +
        '<div class="wh-req-no">' + esc(r.reqNo) + '</div>' +
        '<div class="wh-req-meta">' + esc(r.pharmacy) + ' · ' + esc(r.applicant) + ' · ' + esc(r.date.slice(5)) + '</div>' +
        '<div class="wh-req-meta" style="color:#1E293B;">' + esc(items) + '</div>' +
        (r.remark ? '<div class="wh-req-meta">备注：' + esc(r.remark) + '</div>' : '') + '</div>';
    }).join('');
    if (!reqs.length) cards = '<div class="text-secondary" style="padding:14px 6px;font-size:13px;">暂无待备货申请单——可点右侧「一步式领用」无单直出</div>';
    return '<div class="card mb-3"><div class="card-header"><b>领用申请单池</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">药房「领用申请」传入 · 待备货 ' + reqs.length + ' 单</span>' +
      '<div class="ms-auto"><button class="btn btn-warning" id="btnQuick">⚡ 一步式领用（跳过备货）</button></div></div>' +
      '<div class="card-body d-flex" style="gap:10px;overflow-x:auto;padding:12px 16px;">' + cards + '</div></div>';
  }

  // ===== 备货区：左药品明细 ⇄ 右码清单 =====
  function drugPanel(req) {
    var byDrug = pickedByDrug();
    var rowsHtml;
    if (sel === 'QUICK') {
      var dcs = Object.keys(byDrug);
      rowsHtml = dcs.map(function (dc, i) {
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(drugName(dc)) + '</b></td><td>' + esc(drugForm(dc)) + '</td>' +
          '<td class="text-secondary">—</td><td><b>' + byDrug[dc].qty + '</b></td><td>' + esc(baseUnit(dc)) + '</td>' +
          '<td class="text-secondary">一步式</td></tr>';
      }).join('');
      if (!dcs.length) rowsHtml = '<tr><td colspan="7" class="text-center text-secondary" style="padding:28px;">一步式领用：扫码后此处按药品汇总实出数</td></tr>';
    } else {
      rowsHtml = (req ? req.items : []).map(function (it, i) {
        var got = byDrug[it.drugCode] ? byDrug[it.drugCode].qty : 0;
        var diff = it.qty - got;
        var cls = diff === 0 && got > 0 ? 'full' : (diff < 0 ? 'over' : (got > 0 ? 'part' : ''));
        var diffTxt = diff === 0 && got > 0 ? '✓ 备齐' : (diff > 0 ? '缺 ' + diff : '超 ' + (-diff));
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(drugName(it.drugCode)) + '</b></td><td>' + esc(drugForm(it.drugCode)) + '</td>' +
          '<td><b>' + it.qty + '</b></td><td><b>' + got + '</b></td><td>' + esc(baseUnit(it.drugCode)) + '</td>' +
          '<td class="wh-pick-diff ' + cls + '">' + diffTxt + '</td></tr>';
      }).join('');
      if (!req) rowsHtml = '<tr><td colspan="7" class="text-center text-secondary" style="padding:28px;">点选上方申请单开始备货</td></tr>';
    }
    return '<div class="card"><div class="card-header"><b>药品明细</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">申请数 vs 已备数（基本单位口径）</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品通用名</th><th>制剂规格</th><th>申请数</th><th>已备数</th><th>单位</th><th>差额</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  function codePanel(req) {
    var keys = Object.keys(picked);
    var rowsHtml = keys.map(function (k, i) {
      var c = picked[k];
      var p = P.parseCode(c.code, DICT);
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(p.dict ? p.dict.drugName : '未解析') + '</b></td>' +
        '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td><td>' + esc(c.location || '—') + '</td>' +
        '<td class="text-secondary">' + toBase(c) + esc(p.dict ? baseUnit(p.dict.drugCode) : '') + '</td>' +
        '<td><button class="btn btn-sm btn-outline-danger" data-unpick="' + esc(c.code) + '">移除</button></td></tr>';
    }).join('');
    if (!keys.length) rowsHtml = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">码清单为空——点下方「扫码备货」逐码扫入</td></tr>';
    return '<div class="card"><div class="card-header"><b>码清单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + (req && req.reqNo ? '申请单 ' + esc(req.reqNo) : (sel === 'QUICK' ? '一步式 · ' + esc(quickPharm) : '未选单')) + ' · 已扫 ' + keys.length + ' 个码</span></div>' +
      '<div class="table-responsive" style="max-height:330px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>库位</th><th>折合</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' +
      '<div class="pch-tabbar">' +
      '<button class="btn btn-primary" id="btnScan"' + (sel ? '' : ' disabled') + '>▸ 扫码备货</button>' +
      '<button class="btn btn-outline-secondary" id="btnClear"' + (keys.length ? '' : ' disabled') + '>清空</button>' +
      '<div class="ms-auto"><button class="btn btn-success" id="btnAudit"' + (keys.length ? '' : ' disabled') + '>✓ 审核出库</button></div>' +
      '</div></div>';
  }

  // ===== 出库单记录（含在途闭环演示） =====
  function docsCard() {
    var rowsHtml = S.pickDocs.map(function (d, i) {
      var st = d.status === '药房已入库'
        ? '<span class="pch-light ok"><i class="pch-dot"></i>药房已入库</span>'
        : '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>已出库 · 在途</span>';
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(d.billNo) + '</b></td>' +
        '<td>' + (d.reqNo ? esc(d.reqNo) : '<span class="badge bg-orange-lt">一步式</span>') + '</td>' +
        '<td>' + esc(d.pharmacy) + '</td><td>' + d.codes.length + '</td>' +
        '<td class="text-secondary">' + esc(d.operator || '-') + '</td><td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td>' + st + '</td>' +
        '<td>' + (d.status === '已出库' ? '<button class="btn btn-sm btn-outline-success" data-phin="' + esc(d.billNo) + '">确认药房入库</button>' : '<span class="text-secondary" style="font-size:12.5px;">闭环</span>') + '</td></tr>';
    }).join('');
    if (!S.pickDocs.length) rowsHtml = '<tr><td colspan="9" class="text-center text-secondary" style="padding:24px;">暂无出库单</td></tr>';
    return '<div class="card mt-3"><div class="card-header"><b>领用出库单记录</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">出库审核即扣账（在架扣除），药房入库后在途清零</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>出库单号</th><th>申请单号</th><th>领用药房</th><th>码数</th><th>操作人</th><th>出库时间</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // ===== 扫码备货（在架码√加入 / 非在架×拦截 / 超申请!提示） =====
  function openScanModal() {
    var req = selReq();
    if (!req) return;
    UI.openScan({
      title: '扫码备货 · ' + (req.reqNo || '一步式领用'),
      hint: '扫在架追溯码加入备货；扫箱码自动按换算链折合基本单位（如 1箱=60瓶）',
      gate: 'out', node: curWh(),
      onScan: function (code) {
        var sm = stockMap();
        var c = sm[code];
        if (!c) return { level: 'bad', msg: '不在在架库存（未入库或已出库）' };
        if (picked[code]) return { level: 'warn', msg: '重复扫码，已在码清单' };
        var p = P.parseCode(code, DICT);
        if (!p.dict) return { level: 'bad', msg: '标识码未维护，无法解析' };
        var dc = p.dict.drugCode;
        var it = null;
        (req.items || []).forEach(function (x) { if (x.drugCode === dc) it = x; });
        if (sel !== 'QUICK' && !it) return { level: 'bad', msg: p.dict.drugName + ' 不在本申请单，禁止加入' };
        picked[code] = c;
        var add = toBase(c);
        var got = pickedByDrug()[dc].qty;
        renderAll();
        if (it && got > it.qty) return { level: 'warn', msg: p.dict.drugName + ' +' + add + baseUnit(dc) + '（已备 ' + got + '/' + it.qty + '，超申请数）' };
        return { level: 'ok', msg: p.dict.drugName + ' +' + add + baseUnit(dc) + (it ? '（已备 ' + got + '/' + it.qty + '）' : '') };
      },
      onClose: renderAll
    });
  }

  // ===== 审核出库：申请数 vs 实出数确认 → 生成出库单（在途） =====
  function openAudit() {
    var req = selReq();
    var keys = Object.keys(picked);
    if (!req || !keys.length) return;
    if (!W.assertUnfrozen(curWh())) return;
    var byDrug = pickedByDrug();
    var lines = Object.keys(byDrug).map(function (dc) {
      var it = null;
      (req.items || []).forEach(function (x) { if (x.drugCode === dc) it = x; });
      return '<div>· ' + esc(drugName(dc)) + '：实出 <b>' + byDrug[dc].qty + '</b> ' + esc(baseUnit(dc)) +
        (it ? '（申请 ' + it.qty + '，' + (byDrug[dc].qty === it.qty ? '一致' : '<span class="text-warning">差异 ' + (byDrug[dc].qty - it.qty) + '</span>') + ')' : '（一步式）') + '</div>';
    }).join('');
    UI.confirm('审核出库到 <b>' + esc(req.pharmacy) + '</b>？共 ' + keys.length + ' 个码：<div style="margin-top:8px;">' + lines + '</div>' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:8px;">审核后码从在架扣除、进入「在途」；药房扫码入库后在途清零。</div>',
      function () {
        var user = window.store.load().currentUser || {};
        S.pickDocs.unshift({ billNo: W.nextNo('LYCK', S.pickDocs), reqNo: req.reqNo || '', date: W.now(),
          pharmacy: req.pharmacy, warehouse: curWh(), status: '已出库', auditTime: W.now(),
          operator: user.name || '演示员', codes: keys.map(function (k) { return picked[k]; }) });
        if (req.reqNo) {
          S.reqPool.forEach(function (r) { if (r.reqNo === req.reqNo) r.status = '已完成'; });
        }
        picked = {}; sel = null;
        save(); renderAll();
        window.showToast('已审核出库，' + keys.length + ' 个码进入在途（待药房入库）');
      }, '审核出库');
  }

  function renderAll() {
    content.innerHTML = reqPoolBar() + '<div class="wh-pick-grid">' + drugPanel(selReq()) + codePanel(selReq()) + '</div>' + docsCard();
    bind();
  }

  function bind() {
    content.querySelectorAll('[data-req]').forEach(function (card) {
      card.addEventListener('click', function () {
        var no = card.getAttribute('data-req');
        if (sel !== no && Object.keys(picked).length) {
          window.showToast('已扫 ' + Object.keys(picked).length + ' 个码，请先出库或清空再切换申请单'); return;
        }
        sel = no; picked = {}; renderAll();
      });
    });
    document.getElementById('btnQuick').addEventListener('click', function () {
      if (Object.keys(picked).length) { window.showToast('请先出库或清空已扫码再切换'); return; }
      sel = 'QUICK'; picked = {}; renderAll();
      window.showToast('一步式领用：直接扫码出库到 ' + quickPharm + '（无申请单）');
    });
    var bs = document.getElementById('btnScan');
    if (bs) bs.addEventListener('click', openScanModal);
    var bc = document.getElementById('btnClear');
    if (bc) bc.addEventListener('click', function () { picked = {}; renderAll(); });
    var ba = document.getElementById('btnAudit');
    if (ba) ba.addEventListener('click', openAudit);
    content.querySelectorAll('[data-unpick]').forEach(function (b) {
      b.addEventListener('click', function () { delete picked[b.getAttribute('data-unpick')]; renderAll(); });
    });
    content.querySelectorAll('[data-phin]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-phin');
        S.pickDocs.forEach(function (d) { if (d.billNo === no) d.status = '药房已入库'; });
        save(); renderAll();
        window.showToast('出库单 ' + no + ' 药房已入库，在途清零（闭环）');
      });
    });
  }

  var first = pendingReqs()[0];
  if (first) sel = first.reqNo;
  renderAll();
})();
