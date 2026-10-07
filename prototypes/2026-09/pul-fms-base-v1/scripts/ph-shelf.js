/**
 * ph-shelf.js — 药品扫码上架（任务驱动重构 v2，2026-10-04）
 * 布局：上下文条（药房/货位/模式/统计） + 左「待上架队列」+ 右「药品详情卡 + 会话日志」
 * 扫码内联无弹窗；撤销=老系统「回退」（逆操作恢复 phLoc）；队列清零=完成（替代老系统定量数/完成方式）
 * 自写组件说明（框架无此组件）：任务队列行、日志撤销按钮 —— 沿用 Tabler 视觉语言（badge/btn-sm/table）
 * 2026-10-05 单池化：上架写码 scanHead=药房上架/shelfTime；全码上架→所在单展示推导态「已上架」
 * 捷径C 扫码直生：扫到「本库房在架但无在途单」的码 → 弹确认 → directPick() 一步建闭环单（scanHead=药房直生）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'shelf', crumb: ['药房管理', '药品扫码上架'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load(), FS = window.PUL_FACILITY.load();
  var DICT = D.flat(DS);

  var loc = '';        // 当前上架货位
  var mode = 'up';     // up=上架 / down=下架（对应老系统「扫码移除」）
  var filter = 'all';  // all=全部 / mine=仅预期=当前货位
  var last = null;     // 最近一码 {code, level, msg, dict, exp, batch}
  var logs = [];       // 会话日志 [{code,level,msg,time,prev,undone}]，prev=改动前 phLoc（撤销用），最多 20 条
  var scanned = 0;     // 本次已扫（成功数）

  function save() { W.save(S); }
  function ph() { return W.curPharm(); }
  function stock() { return W.pharmacyStock(S, ph()); }
  function slots() {
    var p = null;
    (FS.pharmacies || []).forEach(function (x) { if (x.name === ph()) p = x; });
    return ((p && p.slots) || []).filter(function (s) { return s.status === '启用'; });
  }
  function dictOf(code20) { return P.parseCode(code20, DICT).dict || null; }
  function drugOf(dict) { // 主表药品（取 minUnit 等 flat 视图没有的字段）
    if (!dict) return null;
    var hit = null;
    (DS.drugs || []).forEach(function (d) { if (d.drugCode === dict.drugCode) hit = d; });
    return hit;
  }
  function drugNameOf(code20) { var d = dictOf(code20); return d ? d.drugName : '未解析'; }
  function expBadge(expDate) {
    var st = W.expStatus(expDate);
    var cls = st === '过期' ? 'bg-red-lt' : (st === '预警' ? 'bg-yellow-lt' : '');
    return '<span class="badge ' + cls + '">' + esc(expDate || '—') + (st !== '正常' ? ' ' + st : '') + '</span>';
  }
  function nowHM() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function sameDrug(a, b) { return (a || '').slice(0, 7) === (b || '').slice(0, 7); }

  if (!loc) {
    var sl = slots();
    loc = sl.length ? sl[0].code : '';
  }

  // ===== 上下文条：药房(只读) / 货位 / 模式 toggle / 统计 chips / 待上架查询入口 =====
  function ctxBar() {
    var st = stock(), wait = 0, on = 0;
    st.forEach(function (c) { if (c.phLoc) on++; else wait++; });
    var opts = slots().map(function (s) {
      return '<option value="' + esc(s.code) + '"' + (s.code === loc ? ' selected' : '') + '>' + esc(s.code) + ' · ' + esc(s.name) + '</option>';
    }).join('');
    if (!opts) opts = '<option value="">（本药房无启用货位，请先在药房货位维护字典维护）</option>';
    function chip(cls, num, label) {
      return '<span class="badge ' + cls + '" style="font-size:12.5px;padding:6px 10px;">' + label + ' <b>' + num + '</b></span>';
    }
    return '<div class="card mb-3"><div class="card-body" style="padding:10px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：<b class="text-body">' + esc(ph()) + '</b></span>' +
      '<label class="form-label mb-0" style="font-size:13px;">上架货位</label>' +
      '<select class="form-select form-select-sm" id="fLoc" style="width:220px;"' + (mode === 'down' ? ' disabled' : '') + '>' + opts + '</select>' +
      '<div class="btn-group" role="group">' +
      '<button class="btn btn-sm ' + (mode === 'up' ? 'btn-primary' : 'btn-outline-primary') + '" id="mUp">▸ 扫码上架</button>' +
      '<button class="btn btn-sm ' + (mode === 'down' ? 'btn-warning' : 'btn-outline-warning') + '" id="mDown">▸ 扫码下架</button>' +
      '</div>' +
      '<span class="vr"></span>' +
      chip('', st.length, '本房在架') + chip('bg-yellow-lt', wait, '待上架') + chip('bg-green-lt', on, '已上架') + chip('bg-blue-lt', scanned, '本次已扫') +
      '<a class="btn btn-sm btn-outline-secondary ms-auto" href="ph-shelf-q.html">待上架药品查询</a>' +
      '</div></div></div>';
  }

  // ===== 左栏：待上架队列（任务本身；按 expectLoc 分组，预期=当前货位排最前） =====
  function queueCard() {
    var rows = stock().filter(function (c) { return !c.phLoc; });
    if (filter === 'mine') rows = rows.filter(function (c) { return c.expectLoc === loc; });
    rows.sort(function (a, b) {
      var am = a.expectLoc === loc ? 0 : 1, bm = b.expectLoc === loc ? 0 : 1;
      if (am !== bm) return am - bm;
      var an = drugNameOf(a.code), bn = drugNameOf(b.code);
      return an < bn ? -1 : (an > bn ? 1 : 0);
    });
    var trs = rows.map(function (c) {
      var mine = c.expectLoc === loc;
      return '<tr class="q-row" data-code="' + esc(c.code) + '" style="cursor:pointer;" title="' + (mode === 'up' ? '点击=扫码上架此码' : '下架模式：请直接扫已上架码') + '">' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(drugNameOf(c.code)) + '</b></td>' +
        '<td>' + esc(c.batch || '—') + '</td>' +
        '<td>' + (c.expectLoc ? '<span class="badge ' + (mine ? 'bg-blue-lt' : '') + '">' + esc(c.expectLoc) + '</span>' : '<span class="text-secondary">—</span>') + '</td></tr>';
    }).join('');
    if (!rows.length) trs = '<tr><td colspan="4" class="text-center text-secondary" style="padding:28px;">' +
      (filter === 'mine' ? '预期=' + esc(loc) + ' 的待上架码已清空' : '🎉 本房待上架已清空') + '</td></tr>';
    return '<div class="card" style="margin-bottom:0;">' +
      '<div class="card-header"><b>待上架队列</b><span class="text-secondary ms-2" style="font-size:12.5px;">' + rows.length + ' 个码</span>' +
      '<div class="ms-auto btn-group">' +
      '<button class="btn btn-sm ' + (filter === 'all' ? 'btn-secondary' : 'btn-outline-secondary') + '" id="qAll">全部</button>' +
      '<button class="btn btn-sm ' + (filter === 'mine' ? 'btn-secondary' : 'btn-outline-secondary') + '" id="qMine">预期=当前货位</button>' +
      '</div></div>' +
      '<div class="table-responsive" style="max-height:560px;overflow-y:auto;"><table class="table table-vcenter card-table table-hover">' +
      '<thead><tr><th>追溯码</th><th>药品</th><th>批次</th><th>预期货位</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table></div></div>';
  }

  // ===== 右上：扫码输入（常驻焦点）+ 最近一码药品详情卡 =====
  function scanPanel() {
    var hint = mode === 'up'
      ? '扫本房在架码写入货位 ' + (loc || '（未选）') + '；已上架则换到该货位'
      : '扫已上架码清空货位，码回到待上架（仍在本药房在架）';
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex" style="gap:8px;">' +
      '<input class="form-control" id="scanInput" style="font-family:Consolas,monospace;" placeholder="扫码枪输入 / 手工输入后回车" autocomplete="off">' +
      '<button class="btn ' + (mode === 'up' ? 'btn-primary' : 'btn-warning') + '" id="btnScan">确定</button>' +
      '</div><div class="text-secondary" style="font-size:12px;margin-top:6px;">' + esc(hint) + '</div>' +
      '</div></div>';
  }

  function field(label, val) {
    return '<div style="display:flex;gap:8px;font-size:13px;line-height:1.9;">' +
      '<span class="text-secondary" style="width:72px;flex-shrink:0;text-align:right;">' + label + '：</span>' +
      '<span style="min-width:0;word-break:break-all;">' + val + '</span></div>';
  }
  function detailCard() {
    var banner = '', body = '';
    if (!last) {
      body = '<div class="text-secondary text-center" style="padding:36px 0;">等待扫码…<br><span style="font-size:12px;">扫本房在架码，或点击左侧队列行</span></div>';
    } else {
      var d = last.dict, drug = drugOf(d);
      var color = last.level === 'ok' ? 'bg-green-lt' : (last.level === 'warn' ? 'bg-yellow-lt' : 'bg-red-lt');
      var icon = last.level === 'ok' ? '✓' : (last.level === 'warn' ? '⚠' : '✕');
      banner = '<div class="badge ' + color + '" style="display:block;font-size:16px;font-weight:600;padding:10px 14px;margin-bottom:10px;">' +
        icon + ' ' + esc(last.msg) + '</div>';
      if (d) {
        var stk = stock().filter(function (c) { return sameDrug(c.code, last.code); });
        var waitN = stk.filter(function (c) { return !c.phLoc; }).length;
        var doneN = logs.filter(function (g) { return g.level === 'ok' && !g.undone && sameDrug(g.code, last.code); }).length;
        var unpack = (d.opUnpack === '是' ? '门诊✓' : '门诊✗') + ' ' + (d.ipUnpack === '是' ? '住院✓' : '住院✗') +
          (drug && drug.minUnit ? '（1' + (d.packUnit || drug.baseUnit || '') + '=' + drug.minUnit.per + drug.minUnit.u + '）' : '');
        body = field('药品通用名', '<b>' + esc(d.drugName) + '</b>') +
          field('剂型', esc(d.dosForm || '—')) +
          field('制剂规格', esc(d.formSpec || '—')) +
          field('药品规格', esc(d.packSpec || '—') + (d.packUnit ? ' / ' + esc(d.packUnit) : '')) +
          field('批准文号', esc(d.approval || '—')) +
          field('生产厂家', esc(d.maker || '—')) +
          field('拆零标记', esc(unpack)) +
          field('库存数量', stk.length + ' ' + esc(d.packUnit || (drug && drug.baseUnit) || '')) +
          field('任务进度', '待上架 <b>' + waitN + '</b> · 本次已扫 <b>' + doneN + '</b>');
      } else {
        body = '<div class="text-secondary">未解析到药品字典（异常码）</div>';
      }
    }
    return '<div class="card mb-3"><div class="card-header"><b>扫码结果</b>' +
      (last ? '<span class="text-secondary ms-2" style="font-size:12px;font-family:Consolas,monospace;">' + esc(last.code) + '</span>' : '') +
      '</div><div class="card-body" style="padding:12px 16px;">' + banner + body + '</div></div>';
  }

  // ===== 右下：会话日志（批次/生产日期/有效期至/结果/撤销=老系统「回退」） =====
  function logCard() {
    var trs = logs.map(function (g, i) {
      var c = null;
      stock().forEach(function (x) { if (x.code === g.code) c = x; });
      var color = g.level === 'ok' ? 'bg-green-lt' : (g.level === 'warn' ? 'bg-yellow-lt' : 'bg-red-lt');
      var undo = (g.prev !== undefined && !g.undone)
        ? '<button class="btn btn-sm btn-outline-secondary q-undo" data-i="' + i + '">撤销</button>'
        : (g.undone ? '<span class="text-secondary" style="font-size:12px;">已撤销</span>' : '');
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12px;">' + esc(g.code) + '</td>' +
        '<td>' + esc((c && c.batch) || '—') + '</td>' +
        '<td>' + esc((c && c.prodDate) || '—') + '</td>' +
        '<td>' + (c ? expBadge(c.expDate) : '—') + '</td>' +
        '<td><span class="badge ' + color + '">' + esc(g.msg) + '</span></td>' +
        '<td>' + undo + '</td></tr>';
    }).join('');
    if (!logs.length) trs = '<tr><td colspan="7" class="text-center text-secondary" style="padding:20px;">本次尚无扫码记录</td></tr>';
    return '<div class="card" style="margin-bottom:0;"><div class="card-header"><b>会话日志</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + logs.length + ' 条</span>' +
      '<button class="btn btn-sm btn-outline-secondary ms-auto" id="btnClear">清空本次</button></div>' +
      '<div class="table-responsive" style="max-height:280px;overflow-y:auto;"><table class="table table-vcenter card-table table-sm">' +
      '<thead><tr><th>#</th><th>追溯码</th><th>批次</th><th>生产日期</th><th>有效期至</th><th>结果</th><th></th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table></div></div>';
  }

  // ===== 扫码判定（上架/下架共用入口；拦截项不写日志中的 prev，即不可撤销） =====
  function pushLog(code, level, msg, prev) {
    logs.unshift({ code: code, level: level, msg: msg, time: nowHM(), prev: prev, undone: false });
    if (logs.length > 20) logs.pop();
  }
  function doScan(code) {
    if (!code) return;
    if (W.blockMove) {
      var blocked = W.blockMove(code, ph(), 'in', {});
      if (blocked) { last = { code: code, level: 'bad', msg: blocked, dict: dictOf(code) }; pushLog(code, 'bad', blocked); renderAll(); return; }
    }
    var src = W.findPhCode(S, code);
    var inStock = src && stock().some(function (c) { return c.code === code; });
    var name = drugNameOf(code);
    if (!inStock) {
      // 捷径C：本库房在架但无在途单 → 可直生领用单；否则异常拦截
      var whHit = null;
      W.stockAll(P.load(), S, '').forEach(function (x) { if (x.code === code) whHit = x; });
      if (mode === 'up' && whHit) { openDirect(whHit); return; }
      last = { code: code, level: 'bad', msg: '不在本药房在架（未入库 / 已退 / 已报损）', dict: dictOf(code) };
      pushLog(code, 'bad', last.msg); renderAll(); return;
    }
    var expect = src.expectLoc && src.expectLoc !== loc && mode === 'up' ? '（申请预期货位 ' + src.expectLoc + '）' : '';
    if (mode === 'up') {
      if (!loc) { window.showToast('请先选择货位'); return; }
      var old = src.phLoc || '';
      if (old === loc) {
        last = { code: code, level: 'warn', msg: '已在 ' + loc, dict: dictOf(code) };
        pushLog(code, 'warn', last.msg); renderAll(); return;
      }
      W.setPhLoc(S, code, loc); save(); scanned++;
      var msg = old ? (name + ' 换位 ' + old + ' → ' + loc + expect) : (name + ' 上架 ' + loc + expect);
      last = { code: code, level: 'ok', msg: msg, dict: dictOf(code) };
      pushLog(code, 'ok', msg, old);
      renderAll();
      if (!stock().some(function (c) { return !c.phLoc; })) window.showToast('🎉 本房待上架已清空');
      // 全码上架 → 所在单展示推导态「已上架」（pickStatus 推导，不落库）
      var doneDoc = null;
      (S.pickDocs || []).forEach(function (d) {
        if (d.pharmacy !== ph() || d.status !== '已入库·待上架') return;
        if ((d.codes || []).some(function (c) { return c.code === code; })) doneDoc = d;
      });
      if (doneDoc && W.pickStatus(doneDoc) === '已上架') window.showToast('🎉 领用单 ' + doneDoc.billNo + ' 全码上架完成（已上架）');
    } else {
      if (!src.phLoc) {
        last = { code: code, level: 'warn', msg: '该码尚未上架', dict: dictOf(code) };
        pushLog(code, 'warn', last.msg); renderAll(); return;
      }
      var oldLoc = src.phLoc;
      W.setPhLoc(S, code, ''); save(); scanned++;
      var dmsg = name + ' 已下架（原 ' + oldLoc + '）';
      last = { code: code, level: 'ok', msg: dmsg, dict: dictOf(code) };
      pushLog(code, 'ok', dmsg, oldLoc);
      renderAll();
    }
  }
  // 捷径C 直生确认：本库房在架码 → 一步建「已入库·待上架」领用单（码带 phLoc → 推导已上架）
  function openDirect(whCode) {
    if (!loc) { window.showToast('请先选择上架货位再直生'); return; }
    var name = drugNameOf(whCode.code);
    UI.modalShell('shDirect', '扫码直生领用单',
      '<div class="mb-2">追溯码 <b style="font-family:Consolas,monospace;">' + esc(whCode.code) + '</b>（' + esc(name) + '）' +
      '在本库房<b>在架</b>，但本药房没有对应在途/已入库领用单。</div>' +
      '<div class="text-secondary" style="font-size:12.5px;line-height:1.7;">确认后一步生成「扫码直生」领用单：库房在架同扣、本药房在架同增，' +
      '本码直接上架到货位 <b>' + esc(loc) + '</b>（批次 ' + esc(whCode.batch || '—') + ' · 效期 ' + esc(whCode.expDate || '—') + '）。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="shDirectOk">✓ 直生并上架到 ' + esc(loc) + '</button>', 480);
    var el = UI.open('shDirect');
    el.querySelector('#shDirectOk').addEventListener('click', function () {
      var user = window.store.load().currentUser || {};
      var blocked = logs.filter(function (g) { return g.level === 'bad' && !g.undone; })
        .map(function (g) { return { code: g.code, reason: g.msg, stage: '药房直生' }; });
      var doc = W.directPick(ph(), user.warehouse || '中心库',
        [Object.assign({}, whCode, { phLoc: loc })], user.name || '演示员');
      S = W.load();   // directPick 内部自建状态落盘，回读对齐（store 经 JSON 往返，doc 为游离引用，badCodes 须挂到回读态上）
      (S.pickDocs || []).forEach(function (d) { if (d.billNo === doc.billNo) d.badCodes = blocked; });
      save();
      scanned++;
      last = { code: whCode.code, level: 'ok', msg: name + ' 直生 ' + doc.billNo + ' 上架 ' + loc, dict: dictOf(whCode.code) };
      pushLog(whCode.code, 'ok', last.msg);
      UI.close('shDirect');
      renderAll();
      window.showToast('已直生领用单 ' + doc.billNo + '（已上架 ' + loc + '）');
    });
  }
  function undo(i) {
    var g = logs[i];
    if (!g || g.prev === undefined || g.undone) return;
    W.setPhLoc(S, g.code, g.prev); save();
    g.undone = true; if (scanned > 0) scanned--;
    window.showToast('已撤销：' + g.code.slice(-8) + ' 货位恢复为 ' + (g.prev || '（空）'));
    renderAll();
  }

  function renderAll() {
    content.innerHTML = ctxBar() +
      '<div class="d-flex" style="gap:12px;align-items:flex-start;">' +
      '<div style="flex:0 0 50%;min-width:0;">' + queueCard() + '</div>' +
      '<div style="flex:1;min-width:0;">' + scanPanel() + detailCard() + logCard() + '</div>' +
      '</div>';
    bind();
    var inp = document.getElementById('scanInput');
    if (inp) inp.focus();
  }
  function bind() {
    var sel = document.getElementById('fLoc');
    if (sel) sel.addEventListener('change', function () { loc = sel.value; renderAll(); });
    document.getElementById('mUp').addEventListener('click', function () { if (mode !== 'up') { mode = 'up'; renderAll(); } });
    document.getElementById('mDown').addEventListener('click', function () { if (mode !== 'down') { mode = 'down'; renderAll(); } });
    document.getElementById('qAll').addEventListener('click', function () { if (filter !== 'all') { filter = 'all'; renderAll(); } });
    document.getElementById('qMine').addEventListener('click', function () { if (filter !== 'mine') { filter = 'mine'; renderAll(); } });
    document.getElementById('btnScan').addEventListener('click', function () { doScan(document.getElementById('scanInput').value.trim()); });
    document.getElementById('scanInput').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      doScan(e.target.value.trim());
    });
    document.getElementById('btnClear').addEventListener('click', function () { logs = []; scanned = 0; renderAll(); });
    Array.prototype.forEach.call(content.querySelectorAll('.q-row'), function (tr) {
      tr.addEventListener('click', function () {
        if (mode !== 'up') { window.showToast('下架模式：请直接扫已上架码'); return; }
        doScan(tr.getAttribute('data-code'));
      });
    });
    Array.prototype.forEach.call(content.querySelectorAll('.q-undo'), function (btn) {
      btn.addEventListener('click', function () { undo(parseInt(btn.getAttribute('data-i'), 10)); });
    });
  }
  renderAll();
})();
