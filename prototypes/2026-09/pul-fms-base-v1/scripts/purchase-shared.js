/**
 * purchase-shared.js — 采购模块共享 UI 组件：状态灯 / 步骤条 / 三页签 / 扫码弹窗 / 确认框
 * 弹窗挂 document.body（页面内容区会整体重渲染，不能挂里面）
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ===== 状态灯：完成/正常/已审核/已推送=绿；异常=红；其余=灰 =====
  function light(val) {
    var v = val || '—';
    var cls = 'mute';
    if (['完成', '正常', '已审核', '已推送', '是'].indexOf(v) > -1) cls = 'ok';
    else if (['异常', '失败', '否'].indexOf(v) > -1) cls = 'bad';
    return '<span class="pch-light ' + cls + '"><i class="pch-dot"></i>' + esc(v) + '</span>';
  }

  // ===== 步骤引导条 =====
  function stepsBar(steps) {
    var html = '<div class="pch-steps">';
    steps.forEach(function (s, i) {
      if (i > 0) html += '<div class="pch-step-line"></div>';
      var cls = s.done ? 'done' : (s.cur ? 'cur' : '');
      html += '<div class="pch-step ' + cls + '">' +
        '<span class="pch-step-num">' + (s.done ? '✓' : (i + 1)) + '</span>' +
        '<span><span class="pch-step-txt">' + esc(s.title) + '</span>' +
        (s.sub ? '<br><span class="pch-step-sub">' + esc(s.sub) + '</span>' : '') + '</span></div>';
    });
    return html + '</div>';
  }

  // ===== 三页签头（badge = 异常计数） =====
  function tabsHeader(tabs, active) {
    return '<div class="pch-tabs">' + tabs.map(function (t) {
      return '<button class="pch-tab' + (t.key === active ? ' active' : '') + '" data-ptab="' + t.key + '">' +
        esc(t.name) + (t.badge ? '<span class="pch-tab-badge">' + t.badge + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }

  // ===== 通用弹窗骨架（复用 app-modal 样式） =====
  function modalShell(id, title, bodyHtml, footHtml, width) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var wrap = document.createElement('div');
    wrap.innerHTML = '<div class="app-modal-overlay" id="' + id + '" style="display:none;">' +
      '<div class="app-modal" style="width:' + (width || 640) + 'px;max-width:94vw;">' +
      '<div class="app-modal-head"><b>' + esc(title) + '</b><span class="app-modal-close" data-mclose>×</span></div>' +
      '<div class="app-modal-body">' + bodyHtml + '</div>' +
      (footHtml ? '<div class="app-modal-foot">' + footHtml + '</div>' : '') + '</div></div>';
    var el = wrap.firstChild;
    document.body.appendChild(el);
    // 关闭按钮可能多处（头部× + 底部「关闭」），全部绑定；点遮罩也可关
    el.querySelectorAll('[data-mclose]').forEach(function (b) {
      b.addEventListener('click', function () { close(id); });
    });
    el.addEventListener('click', function (e) { if (e.target === el) close(id); });
    return el;
  }
  function open(id) { var el = document.getElementById(id); if (el) el.style.display = 'flex'; return el; }
  function close(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }

  // ===== 确认框 =====
  function confirmBox(msg, onOk, okText) {
    var id = 'pchConfirm';
    modalShell(id, '请确认', '<div style="font-size:14px;line-height:1.7;">' + msg + '</div>',
      '<button class="btn btn-outline-secondary" data-no>取消</button>' +
      '<button class="btn btn-primary" data-ok>' + esc(okText || '确定') + '</button>', 420);
    var el = open(id);
    el.querySelector('[data-no]').addEventListener('click', function () { close(id); });
    el.querySelector('[data-ok]').addEventListener('click', function () { close(id); onOk(); });
  }

  // ===== 扫码弹窗（核对 / 录入 / 审核三用；老系统字段：扫码移除 / 拆零；onAudit=弹窗内「直接审核」） =====
  // opts: { title, hint, flags:[{key:'remove',label:'扫码移除'},{key:'split',label:'拆零'}],
  //         gate:'out|in|loss|count', node:库房/药房名（缺省=登录节点）,
  //         table:true → 扫码结果按老系统「审核单据」表格渲染（ID/药品追溯码/拆零/零头/层级），
  //         onScan(code, flags) → {level:'ok|warn|bad', msg, row:{split,splitQty,lvl}} , onClose, onAudit }
  var scanState = null;
  function openScan(opts) {
    var id = 'pchScan';
    scanState = { opts: opts, items: [] };
    var flagsHtml = (opts.flags || []).map(function (f) {
      return '<label class="form-check"><input class="form-check-input" type="checkbox" id="pchFlag_' + f.key + '">' +
        '<span class="form-check-label">' + esc(f.label) + '</span></label>';
    }).join('');
    modalShell(id, opts.title || '扫码',
      '<div style="font-size:13.5px;font-weight:600;margin-bottom:8px;">请扫描追溯码：</div>' +
      '<input class="form-control pch-scan-input" id="pchScanInput" placeholder="扫码枪输入 / 手工输入后回车" autocomplete="off">' +
      (opts.hint ? '<div class="text-secondary" style="font-size:12px;margin-top:6px;">' + esc(opts.hint) + '</div>' : '') +
      '<div style="font-size:13.5px;font-weight:600;margin:14px 0 0;">扫码结果：</div>' +
      '<div class="pch-scan-result" id="pchScanResult"><div class="pch-scan-empty">等待扫码…</div></div>' +
      (flagsHtml ? '<div class="pch-scan-flags">' + flagsHtml + '</div>' : ''),
      '<button class="btn btn-outline-secondary" data-mclose2>关闭</button>' +
      (opts.onAudit ? '<button class="btn btn-success" id="pchScanAudit">✓ 直接审核</button>' : ''), 720);
    var el = open(id);
    el.querySelector('[data-mclose2]').addEventListener('click', function () { closeScan(); });
    var ab = el.querySelector('#pchScanAudit');
    if (ab) ab.addEventListener('click', function () {
      if (opts.gate && opts.gate !== 'count' && window.PUL_WH && window.PUL_WH.nodeFrozen) {
        var n = opts.node || ((window.store && window.store.load().currentUser) || {}).warehouse;
        if (window.PUL_WH.nodeFrozen(n)) {
          if (window.showToast) window.showToast('本节点盘点中，禁止出入库');
          return;
        }
      }
      var cb = opts.onAudit; closeScan(); if (cb) cb();
    });
    var input = el.querySelector('#pchScanInput');
    input.focus();
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var code = input.value.trim();
      if (!code) return;
      input.value = '';
      var flags = {};
      (opts.flags || []).forEach(function (f) {
        var c = document.getElementById('pchFlag_' + f.key);
        flags[f.key] = c ? c.checked : false;
      });
      var res = null;
      if (opts.gate && window.PUL_WH && window.PUL_WH.blockMove) {
        var node = opts.node || ((window.store && window.store.load().currentUser) || {}).warehouse;
        var blocked = window.PUL_WH.blockMove(code, node, opts.gate, {});
        if (blocked) res = { level: 'bad', msg: blocked };
      }
      if (!res) res = opts.onScan(code, flags) || { level: 'ok', msg: '已记录' };
      scanState.items.unshift({ code: code, level: res.level, msg: res.msg, row: res.row });
      if (scanState.items.length > 20) scanState.items.pop();
      renderScanItems();
    });
  }
  function renderScanItems() {
    var box = document.getElementById('pchScanResult');
    if (!box || !scanState) return;
    if (!scanState.items.length) { box.innerHTML = '<div class="pch-scan-empty">等待扫码…</div>'; return; }
    if (scanState.opts.table) {
      // 老系统「审核单据」口径：ID / 药品追溯码 / 拆零 / 零头 / 层级；红行=不在单据
      box.innerHTML = '<div class="table-responsive"><table class="table table-vcenter table-sm card-table">' +
        '<thead><tr><th>ID</th><th>药品追溯码</th><th>拆零</th><th>零头</th><th>层级</th></tr></thead><tbody>' +
        scanState.items.map(function (it, i) {
          var r = it.row || {};
          return '<tr' + (it.level === 'bad' ? ' class="pch-row-bad"' : '') + '><td>' + (scanState.items.length - i) + '</td>' +
            '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(it.code) + '</td>' +
            '<td>' + esc(r.split || '—') + '</td><td>' + esc(r.splitQty || '—') + '</td><td>' + esc(r.lvl || '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      return;
    }
    box.innerHTML = scanState.items.map(function (it) {
      var icon = it.level === 'ok' ? '✓' : (it.level === 'warn' ? '!' : '×');
      return '<div class="pch-scan-item ' + it.level + '"><b>' + icon + '</b>' +
        '<span class="code">' + esc(it.code) + '</span><span class="msg">' + esc(it.msg) + '</span></div>';
    }).join('');
  }
  function closeScan() {
    var cb = scanState && scanState.opts.onClose;
    close('pchScan');
    scanState = null;
    if (cb) cb();
  }

  window.PchUI = { esc: esc, light: light, stepsBar: stepsBar, tabsHeader: tabsHeader,
    modalShell: modalShell, open: open, close: close, confirm: confirmBox, openScan: openScan };
})();
