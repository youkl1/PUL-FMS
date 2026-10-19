/**
 * scan-lab-ui.js — 统一扫码验证（沙盒页）渲染层：瘦横幅 / 扫码卡 / 单卡双页签明细（全宽） / 悬浮场景面板
 * 2026-10-11 Round BF 重构：矩阵转置=六业务场景 × 清单四态；明细从左右双栏改单卡双页签（看不全/看得累反馈）；
 *   码明细删「验收状态」列（时间列自然表达：有时间=已验收/已录入）
 * 共享层无此组件：悬浮场景面板为本页自写；扫码视觉沿用 pch-scan-* 三态语义
 * 依赖：scan-lab-data.js（数据）+ scan-lab.js（逻辑 window.PUL_SCAN_LAB）；本文件只读写 DOM + 调 LAB
 */
(function () {
  'use strict';

  var UI = window.PchUI, LAB = window.PUL_SCAN_LAB;
  var DICT = window.PUL_DRUG.flat(window.PUL_DRUG.load());   // 模块级缓存（与逻辑层同一字典视图）
  var CONTENT = null, RESULTS = [], MODE = 'add', TAB = 'items';
  function esc(s) { return UI.esc(s); }

  // ===== 1. 瘦横幅（单行：场景·清单态 + badges + 单据 + 状态灯） =====
  function bannerHtml(scene, col, doc) {
    var S = LAB.state();
    return '<div class="card" style="margin-bottom:12px;"><div class="card-body" style="padding:10px 16px;">' +
      '<div class="lab-badges">' +
        '<b style="font-size:15px;">' + esc(scene.name) + ' · ' + esc(col.t) + '</b>' +
        '<span class="badge ' + (scene.dir === 'in' ? 'bg-blue-lt' : scene.dir === 'out' ? 'bg-orange-lt' : 'bg-purple-lt') + '">' +
          ({ in: '入库', out: '出库', shelf: '移位·不动库存' })[scene.dir] + '</span>' +
        '<span class="badge bg-azure-lt">' + (col.src === 'pre' ? '有码单 · 核对' : '无码单 · 录入') + '</span>' +
        '<span class="badge bg-secondary-lt">' + esc(doc.node) + '</span>' +
        (S.frozen ? '<span class="badge bg-red-lt">盘点冻结中</span>' : '') +
        '<span class="text-secondary" style="font-size:12.5px;">' + esc(doc.title) + '（' + esc(doc.billNo) + '）</span>' +
        '<span class="ms-auto"></span>' +
        (scene.dir === 'shelf' ? shelfLight(doc) : UI.light(doc.status)) +
      '</div>' +
      (doc.status === '已审核' ? '<div style="margin-top:4px;font-size:12.5px;color:var(--pch-ok);">' + esc(scene.verb) + ' 已完成 · ' +
        esc(doc.auditor) + ' · ' + esc(doc.auditTime) + '（沙盒库存已' + (scene.dir === 'in' ? '增加' : '扣减') + '，「🧪 场景」面板可重置重演示）</div>' : '') +
    '</div></div>';
  }

  // ===== 2. 扫码卡（一行操作区 + 大反馈条 + 记录 3 行滚动） =====
  // 移位（上架）场景无审核：状态灯 = 上架进度
  function shelfLight(doc) {
    var done = doc.codes.filter(function (c) { return c.checked; }).length;
    if (doc.codes.length > 0 && done === doc.codes.length) return UI.light('全部上架');
    return UI.light('待上架 ' + (doc.codes.length - done) + ' 码');
  }
  function resultsHtml() {
    if (!RESULTS.length) return '<div class="pch-scan-empty">等待扫码…</div>';
    return RESULTS.slice(0, 10).map(function (it) {
      var icon = it.level === 'ok' ? '✓' : (it.level === 'warn' ? '!' : '×');
      return '<div class="pch-scan-item ' + it.level + '"><b>' + icon + '</b>' +
        (it.code ? '<span class="code">' + esc(it.code) + '</span>' : '') +
        '<span class="msg">' + esc(it.msg) + '</span></div>';
    }).join('');
  }
  function scanCardHtml(scene, col, doc) {
    var ro = doc.status === '已审核', last = RESULTS[0];
    return '<div class="card" style="margin-bottom:12px;"><div class="card-body" style="padding:12px 16px;">' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
        '<span style="font-size:13.5px;font-weight:600;white-space:nowrap;">请扫描追溯码：</span>' +
        (col.src === 'pre' ? '' :
          '<div class="pch-scan-mode">' +
          '<button type="button" id="labModeAdd" class="' + (MODE === 'add' ? 'active-add' : '') + '">▸ 扫码加入</button>' +
          '<button type="button" id="labModeRm" class="' + (MODE === 'remove' ? 'active-rm' : '') + '">➖ 扫码移除</button></div>') +
        '<input class="form-control pch-scan-input" id="labScanInput" style="flex:1;min-width:220px;width:auto;"' +
          ' placeholder="扫码枪输入 / 手工输入后回车' + (MODE === 'remove' ? '（移除模式）' : '') + '"' + (ro ? ' disabled' : '') + ' autocomplete="off">' +
        (scene.split ? '<label class="form-check" style="margin:0;white-space:nowrap;"><input class="form-check-input" type="checkbox" id="labSplit">' +
          '<span class="form-check-label">拆零（先拆先赋）</span></label>' : '') +
        (scene.dir === 'shelf' ? '<select class="form-select" id="labLoc" style="width:auto;">' +
          LAB.SHELF_LOCS.map(function (l) { return '<option' + (doc.curLoc === l ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select>' : '') +
        (scene.auto && col.src === 'none' && !ro ? '<button type="button" class="btn btn-outline-primary" id="labAuto">⚡ 自动赋码</button>' : '') +
      '</div>' +
      '<div class="lab-last' + (last ? ' ' + last.level : '') + '" style="margin-top:10px;">' +
        (last ? esc(last.msg) + (last.code ? '<span style="margin-left:auto;font-family:Consolas,monospace;font-size:12px;">' + esc(last.code) + '</span>' : '') : '等待扫码…') + '</div>' +
      '<div class="pch-scan-result" style="max-height:98px;">' + resultsHtml() + '</div>' +
    '</div></div>';
  }

  // ===== 3. 明细单卡双页签（全宽）：药品清单（人读） | 码明细（机器事实，删验收状态列）
  // 2026-10-18 Task5：双表迁移 PulDocDetail 独立表格 API（进度/差异/折合经组件标准 model 表达；
  // 码表异常行混排适配为 className='pch-row-bad' 行，异常原因红色落「时间」扩展列；data-rmcode/data-rmbad 监听不动） =====
  function itemsTableHtml(scene, col, doc) {
    var plan = col.list === 'plan';
    var rows = doc.items.map(function (it) {
      var dc = it.drugCode, d = LAB.drugOf(dc) || {};
      var got = LAB.scannedBase(doc, dc, col.src);
      var row = {
        drugName: d.drugName || '', formSpec: d.formSpec || '', maker: d.maker || '',
        qty: it.planQty == null ? null : LAB.fmtN(it.planQty) + ' ' + LAB.saleUnit(dc),
        unit: window.PUL_DRUG.unitsText(d),
        scanText: LAB.decomp(dc, got)
      };
      if (plan) {
        var pb = LAB.planBase(it), diff = pb - got;
        row.progress = pb > 0 ? Math.min(100, Math.round(got / pb * 100)) : 0;
        row.diff = Math.abs(diff) <= 1e-6 && got > 0
          ? { kind: 'full', text: '✓ 备齐' }
          : (diff > 0 ? { kind: 'short', text: '缺 ' + LAB.decomp(dc, diff) }
                      : { kind: 'over', text: '超 ' + LAB.decomp(dc, -diff) });
      }
      return row;
    });
    return window.PulDocDetail.renderDrugs({ drugs: rows }, {
      columns: ['seq', 'drugName', 'formSpec', 'maker', 'qty', 'unit', 'scanQty', 'diff'],
      emptyText: '无清单——扫码后自动建药品行'
    });
  }
  function codesTableHtml(scene, col, doc) {
    var ro = doc.status === '已审核';
    var opCol = col.src !== 'pre' && !ro;
    var rows = doc.codes.map(function (c) {
      var p = window.PUL_PCH.parseCode(c.code, DICT);
      var d = p.dict ? LAB.drugOf(p.dict.drugCode) : null;
      return {
        code: c.code,
        idcode: c.code.slice(0, 7),
        drugName: d ? d.drugName : '—',
        level: p.dict ? 'L' + p.dict.level + ' ' + (p.dict.packUnit || '') + '码' : '—',
        scanText: '+' + LAB.fmtN(LAB.codeContrib(c)) + ' ' + (d ? d.baseUnit : ''),
        batch: c.batch || '—',
        expDate: c.expDate || '—',
        split: c.split === '是' ? '拆零 ' + c.splitQty : '否',
        _timeCell: '<span class="text-secondary" style="font-size:12px;">' + esc(c.time || '—') + '</span>',
        _opCell: '<button class="btn btn-sm btn-outline-secondary" data-rmcode="' + esc(c.code) + '">移除</button>'
      };
    });
    doc.badCodes.forEach(function (b) {
      rows.push({
        className: 'pch-row-bad',
        code: b.code,
        idcode: b.code.slice(0, 7),
        drugName: '—', level: '—', scanText: '—', batch: '—', expDate: '—', split: '—',
        _timeCell: '<span class="text-danger">' + esc(b.reason) + '</span>' +
          (b.time ? '<div class="text-secondary" style="font-size:12px;">' + esc(b.time) + '</div>' : ''),
        _opCell: '<button class="btn btn-sm btn-outline-secondary" data-rmbad="' + esc(b.code) + '">移除</button>'
      });
    });
    var extras = [{ key: 'time', title: '时间', cell: function (r) { return r._timeCell; } }];
    if (opCol) extras.push({ key: 'op', title: '操作', cell: function (r) { return r._opCell; } });
    return window.PulDocDetail.renderCodes({ codes: rows }, {
      columns: ['seq', 'code', 'idcode', 'drugName', 'level', 'scanQty', 'batch', 'expDate', 'split'],
      extraColumns: extras,
      emptyText: col.src === 'pre' ? '码单已预置 ' + doc.codes.length + ' 码' : '等待扫码…'
    });
  }
  function shelfFooterHtml(doc) {
    var done = doc.codes.filter(function (c) { return c.checked; }).length;
    var total = doc.codes.length;
    return '<span style="font-size:13px;">上架进度：<b>' + done + '/' + total + '</b> 码</span>' +
      (total > 0 && done === total ? '<span class="badge bg-green-lt" style="margin-left:10px;">✓ 全部上架</span>' : '');
  }
  function detailCardHtml(scene, col, doc) {
    var bad = doc.badCodes.length;
    var tabs = [
      { key: 'items', name: '药品清单' },
      { key: 'codes', name: '码明细（' + doc.codes.length + '）', badge: bad }
    ];
    var tabsHtml = '<div class="pch-tabs">' + tabs.map(function (t) {
      return '<button class="pch-tab' + (TAB === t.key ? ' active' : '') + '" data-ltab="' + t.key + '">' +
        esc(t.name) + (t.badge ? '<span class="pch-tab-badge">' + t.badge + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    var body = TAB === 'items' ? itemsTableHtml(scene, col, doc) : codesTableHtml(scene, col, doc);
    var footer;
    if (scene.dir === 'shelf') {
      footer = shelfFooterHtml(doc) + '<span class="ms-auto"></span>' +
        '<span class="text-secondary" style="font-size:12px;">移位场景扫码即生效，无审核；货位在扫码卡右侧选择</span>';
    } else if (doc.status === '已审核') {
      footer = '<span style="font-size:13px;">共 <b>' + doc.codes.length + '</b> 个码</span><span class="ms-auto"></span>' +
        '<button class="btn btn-outline-secondary" id="labResetMain">↺ 重置本场景重新演示</button>';
    } else {
      footer = '<span style="font-size:13px;">共 <b>' + doc.codes.length + '</b> 个码' +
        (bad ? '｜<span class="text-danger">异常码 <b>' + bad + '</b> 个（审核硬拦）</span>' : '｜无异常码') + '</span>' +
        '<span class="ms-auto"></span>' +
        '<button class="btn btn-success" id="labAudit">✓ ' + esc(scene.verb) + '</button>';
    }
    return '<div class="card"><div class="card-header" style="gap:12px;">' + tabsHtml +
      '<span class="text-secondary ms-auto" style="font-size:12px;">双层表达：药品清单=人读视图（码聚合派生）⇄ 码明细=机器事实（逐码）</span></div>' +
      body +
      '<div class="card-footer" style="display:flex;align-items:center;gap:14px;">' + footer + '</div></div>';
  }

  function renderAll() {
    if (!CONTENT) return;
    var scene = LAB.curScene(), col = LAB.curCol(), doc = LAB.curDoc();
    CONTENT.innerHTML = bannerHtml(scene, col, doc) + scanCardHtml(scene, col, doc) + detailCardHtml(scene, col, doc);
    bind();
    var inp = document.getElementById('labScanInput');
    if (inp && doc.status !== '已审核') inp.focus();
  }

  // ===== 4. 动作 =====
  function handleScan(code, demoFlags) {
    var split = document.getElementById('labSplit');
    var useSplit = demoFlags && demoFlags.split ? true : !!(split && split.checked);
    var res = LAB.scanCore(code, { remove: MODE === 'remove', split: useSplit });
    RESULTS.unshift({ code: code, level: res.level, msg: res.msg });
    if (RESULTS.length > 20) RESULTS.pop();
    if (demoFlags && demoFlags.split && split) split.checked = false;   // 演示码带入的拆零只当次生效
    renderAll(); renderPanel();
  }
  function doAuto() {
    var r = LAB.autoAssign();
    (r.added || []).forEach(function (a) {
      RESULTS.unshift({ code: a.code, level: 'ok', msg: a.drugName + ' +' + a.qty + ' ' + a.unit + '（自动赋码）' });
    });
    RESULTS.unshift({ code: '', level: r.level, msg: r.msg });
    renderAll(); renderPanel();
  }
  function doAudit() {
    var pre = LAB.auditPrecheck();
    if (pre.block) { window.showToast(pre.block); return; }
    var scene = pre.scene, doc = pre.doc;
    var html = scene.verb + ' <b>' + esc(doc.billNo) + '</b>（' + esc(doc.title) + '），共 ' + doc.codes.length + ' 个码：<br>' +
      pre.lines.join('<br>');
    if (pre.col.list !== 'plan') html += '<br><b>审核后「计划数量 ← 扫码数量」</b>（扫码是全部提交）';
    if (pre.warns.length) html += '<div style="margin-top:8px;color:var(--pch-warn);">⚠ ' + pre.warns.join('<br>⚠ ') + '</div>';
    UI.confirm(html, function () {
      LAB.auditCommit();
      renderAll(); renderPanel();
      window.showToast(scene.verb + ' 完成：' + doc.billNo + '（沙盒库存已' + (scene.dir === 'in' ? '增加' : '扣减') + '）');
    }, '确认' + scene.verb);
  }
  function doReset() {
    UI.confirm('重置本场景？将还原 <b>' + esc(LAB.curScene().name) + ' · ' + esc(LAB.curCol().t) + '</b> 的单据数据与沙盒库存（不影响其他格进度）。', function () {
      LAB.resetCell(LAB.state().cur.scene, LAB.state().cur.col);
      RESULTS = []; MODE = 'add'; TAB = 'items';
      renderAll(); renderPanel();
      window.showToast('已重置当前格');
    }, '重置');
  }
  function bind() {
    var inp = document.getElementById('labScanInput');
    if (inp) inp.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var v = inp.value.trim(); if (!v) return;
      inp.value = '';
      handleScan(v);
    });
    var bAdd = document.getElementById('labModeAdd'), bRm = document.getElementById('labModeRm');
    if (bAdd) bAdd.addEventListener('click', function () { MODE = 'add'; renderAll(); });
    if (bRm) bRm.addEventListener('click', function () { MODE = 'remove'; renderAll(); });
    var loc = document.getElementById('labLoc');
    if (loc) loc.addEventListener('change', function () { LAB.curDoc().curLoc = loc.value; LAB.save(); });
    var auto = document.getElementById('labAuto');
    if (auto) auto.addEventListener('click', doAuto);
    CONTENT.querySelectorAll('[data-ltab]').forEach(function (b) {
      b.addEventListener('click', function () { TAB = b.getAttribute('data-ltab'); renderAll(); });
    });
    CONTENT.querySelectorAll('[data-rmcode]').forEach(function (b) {
      b.addEventListener('click', function () {
        var doc = LAB.curDoc(), c = LAB.findCode(doc, b.getAttribute('data-rmcode'));
        if (c) { doc.codes.splice(doc.codes.indexOf(c), 1); LAB.save(); renderAll(); renderPanel(); }
      });
    });
    CONTENT.querySelectorAll('[data-rmbad]').forEach(function (b) {
      b.addEventListener('click', function () {
        var doc = LAB.curDoc(), code = b.getAttribute('data-rmbad');
        doc.badCodes = doc.badCodes.filter(function (x) { return x.code !== code; });
        LAB.save(); renderAll(); renderPanel();
      });
    });
    var audit = document.getElementById('labAudit');
    if (audit) audit.addEventListener('click', doAudit);
    var rst = document.getElementById('labResetMain');
    if (rst) rst.addEventListener('click', doReset);
  }

  // ===== 5. 悬浮场景面板（6 业务场景 × 清单四态矩阵 + 规则 + 演示码速查 + 冻结 + 重置） =====
  var CELL_LABEL = window.PUL_SCAN_LAB_DATA.CELL_LABEL;
  function matrixHtml() {
    var cur = LAB.state().cur;
    var dirBadge = { in: '入', out: '出', shelf: '移' };
    var html = '<table class="lab-matrix"><thead><tr><th style="width:96px;">场景＼清单态</th>' +
      LAB.COLS.map(function (c) { return '<th>' + esc(c.t) + '</th>'; }).join('') + '</tr></thead><tbody>';
    LAB.SCENES.forEach(function (s) {
      html += '<tr><th style="text-align:left;">' + esc(s.name) +
        ' <span class="badge ' + (s.dir === 'in' ? 'bg-blue-lt' : s.dir === 'out' ? 'bg-orange-lt' : 'bg-purple-lt') + '" style="font-size:10px;">' +
        dirBadge[s.dir] + '</span></th>';
      LAB.COLS.forEach(function (c) {
        var key = s.key + ':' + c.k;
        var grey = LAB.cellGrey(s.key, c.k);
        if (grey) {
          html += '<td><button type="button" class="lab-cell" disabled title="' + esc(grey) + '">' +
            esc(CELL_LABEL[key] || '—') + '<br><span style="font-size:10px;opacity:.75;">本场景无此形态</span></button></td>';
          return;
        }
        var curCls = (cur.scene === s.key && cur.col === c.k) ? ' cur' : '';
        html += '<td><button type="button" class="lab-cell' + curCls + '" data-cell="' + key + '">' +
          esc(CELL_LABEL[key] || c.t) + '</button></td>';
      });
      html += '</tr>';
    });
    return html + '</tbody></table>';
  }
  function buildPanel() {
    var fab = document.createElement('button');
    fab.className = 'lab-fab'; fab.id = 'labFab'; fab.type = 'button'; fab.textContent = '🧪 场景';
    document.body.appendChild(fab);
    var panel = document.createElement('div');
    panel.className = 'lab-panel'; panel.id = 'labPanel';
    document.body.appendChild(panel);
    fab.addEventListener('click', function () { var S = LAB.state(); S.panelOpen = !S.panelOpen; LAB.save(); renderPanel(); });
  }
  function renderPanel() {
    var panel = document.getElementById('labPanel');
    if (!panel) return;
    var S = LAB.state();
    if (!S.panelOpen) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    var scene = LAB.curScene(), col = LAB.curCol(), doc = LAB.curDoc();
    var demos = LAB.DEMO_CODES[LAB.curKey()] || [];
    panel.innerHTML =
      '<div class="lab-panel-head"><span>🧪 场景切换（六业务场景 × 清单四态）</span>' +
        '<span class="ms-auto"></span><button type="button" class="btn btn-sm btn-outline-secondary" id="labPanelClose">收起</button></div>' +
      '<div class="lab-panel-body">' + matrixHtml() +
        '<div class="lab-rule"><b>' + esc(scene.name) + ' · ' + esc(col.t) + '</b>（' + esc(doc.title) + '）<br>' +
          esc(LAB.cellRule(scene.key, col.k)) + '</div>' +
        '<div style="font-size:12.5px;font-weight:600;margin-top:10px;">演示码速查（点击 = 模拟扫码枪）：</div>' +
        '<div class="lab-codes">' + demos.map(function (d) {
          if (d.auto) return '<button type="button" class="lab-code-btn" data-auto="1"><span class="t ok">⚡</span><span>' + esc(d.label.replace(/^⚡\s*/, '')) + '</span></button>';
          var sp = d.label.indexOf(' ');
          return '<button type="button" class="lab-code-btn" data-demo="' + esc(d.code) + '"' + (d.split ? ' data-split="1"' : '') + '>' +
            '<span class="t ' + d.tag + '">' + esc(d.label.slice(0, sp)) + '</span>' +
            '<span class="c">' + esc(d.code) + '</span>' +
            '<span>' + esc(d.label.slice(sp + 1)) + '</span></button>';
        }).join('') + '</div>' +
        '<div style="display:flex;align-items:center;gap:14px;margin-top:10px;">' +
          '<label class="form-check" style="margin:0;"><input class="form-check-input" type="checkbox" id="labFrozen"' + (S.frozen ? ' checked' : '') + '>' +
          '<span class="form-check-label">盘点冻结（演示闸门拦截）</span></label>' +
          '<button type="button" class="btn btn-sm btn-outline-secondary" id="labReset">↺ 重置本场景</button>' +
        '</div>' +
        '<div class="text-secondary" style="font-size:11.5px;margin-top:8px;">审核会动沙盒库存（入库加·落药房自动待上架 / 出库减·拆零码余量回架）；重置 = 本格单据 + 沙盒库存全还原。沙盒数据独立于真实业务页。</div>' +
      '</div>';
    panel.querySelector('#labPanelClose').addEventListener('click', function () { S.panelOpen = false; LAB.save(); renderPanel(); });
    panel.querySelectorAll('[data-cell]').forEach(function (b) {
      b.addEventListener('click', function () {
        var parts = b.getAttribute('data-cell').split(':');
        LAB.switchCell(parts[0], parts[1]);
        RESULTS = []; MODE = 'add'; TAB = 'items';
        renderAll(); renderPanel();
      });
    });
    panel.querySelectorAll('[data-demo]').forEach(function (b) {
      b.addEventListener('click', function () {
        handleScan(b.getAttribute('data-demo'), { split: b.getAttribute('data-split') === '1' });
      });
    });
    panel.querySelectorAll('[data-auto]').forEach(function (b) {
      b.addEventListener('click', doAuto);
    });
    var fz = panel.querySelector('#labFrozen');
    fz.addEventListener('change', function () { S.frozen = fz.checked; LAB.save(); renderAll(); renderPanel(); });
    panel.querySelector('#labReset').addEventListener('click', doReset);
  }

  // ===== 6. boot =====
  function boot() {
    LAB.load();
    var content = window.AppShell.render('desktopPreview', { active: 'scanLab', crumb: ['扫码管理', '统一扫码验证'] });
    if (!content) return;
    CONTENT = content;
    buildPanel();
    renderAll();
    renderPanel();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
