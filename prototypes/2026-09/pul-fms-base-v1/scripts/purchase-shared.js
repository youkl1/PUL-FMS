/**
 * purchase-shared.js — 采购模块共享 UI 组件：状态灯 / 步骤条 / 三页签 / 扫码弹窗 / 确认框
 * 弹窗挂 document.body（页面内容区会整体重渲染，不能挂里面）
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ===== 批量扫码输入拆分（2026-10-15）：输入框支持一次粘贴多个追溯码——中英文逗号/分号/空白任意分隔，回车逐码触发 =====
  function splitScanBatch(v) {
    return String(v || '').split(/[,，;；\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // ===== 状态灯：完成/正常/已审核/已推送=绿；异常=红；其余=灰 =====
  function light(val) {
    var v = val || '—';
    var cls = 'mute';
    if (['完成', '正常', '已审核', '已推送', '无码推送', '是'].indexOf(v) > -1) cls = 'ok';
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

  // ===== 扫码弹窗（核对 / 录入 / 审核三用；onAudit=弹窗内「直接审核」） =====
  // opts: { title, hint, flags:[{key:'remove',label:'扫码移除'},{key:'split',label:'拆零'}],
  //         gate:'out|in|loss|count', node:库房/药房名（缺省=登录节点）,
  //         table:true → 扫码结果按老系统「审核单据」表格渲染（ID/药品追溯码/拆零/零头/层级），
  //         onScan(code, flags) → {level:'ok|warn|bad', msg, row:{split,splitQty,lvl}} , onClose, onAudit }
  // 二期 Task B 大版面契约（全部可选，向后兼容；扫描业务逻辑零改动）：
  //   headerHtml: 单据头摘要区 HTML（单据号/药房/库房/状态等，页面传入可信 HTML）——缺省不渲染该区；
  //   drugsRows: function → 药品清单行模型工厂（行字段对齐 PulDocDetail drugs 注册表）——缺省不渲染左栏；
  //   drugsOptions: renderDrugs 第二参（列/空态文案，缺省 {}）；
  //   drugsRows 提供且 window.PulDocDetail.renderDrugs 可用 → 宽度 1800 近全屏双栏（左药品清单 ⇄ 右码明细）；
  //   window.PulDocDetail 不存在（如盘点域 inv.js）→ 整体降级单列渲染（同 1800 近全屏宽）。
  // flags 口径（2026-10-10 拍板，与备货出库扫码工作台 quick-scan 同款交互）：
  //   key='remove' → 不再渲染复选框，改渲染输入框左侧「▸ 扫码加入 / ➖ 扫码移除」模式切换钮，flags.remove = (模式=移除)；
  //   其余 key（如 split 拆零）仍为底部复选框。
  var scanState = null;
  function openScan(opts) {
    var id = 'pchScan';
    scanState = { opts: opts, items: [], mode: 'add' };
    var hasRm = (opts.flags || []).some(function (f) { return f.key === 'remove'; });
    var cbFlags = (opts.flags || []).filter(function (f) { return f.key !== 'remove'; });
    var flagsHtml = cbFlags.map(function (f) {
      return '<label class="form-check"><input class="form-check-input" type="checkbox" id="pchFlag_' + f.key + '">' +
        '<span class="form-check-label">' + esc(f.label) + '</span></label>';
    }).join('');
    var inputHtml = '<input class="form-control pch-scan-input" id="pchScanInput" placeholder="扫码枪输入 / 手工输入后回车（多码逗号分隔）" autocomplete="off"' +
      (hasRm ? ' style="flex:1;min-width:0;width:auto;"' : '') + '>';
    var scanRow = hasRm
      ? '<div style="display:flex;gap:10px;align-items:center;">' +
        '<div class="pch-scan-mode">' +
        '<button type="button" id="pchScanModeAdd" class="active-add">▸ 扫码加入</button>' +
        '<button type="button" id="pchScanModeRm">➖ 扫码移除</button></div>' + inputHtml + '</div>'
      : inputHtml;
    // 双栏降级守卫：drugsRows 是函数且 PulDocDetail.renderDrugs 可用才走双栏；否则现行单列
    var duo = typeof opts.drugsRows === 'function' &&
      !!(window.PulDocDetail && typeof window.PulDocDetail.renderDrugs === 'function');
    var resultHtml = duo
      ? '<div class="pch-scan-duo">' +
        '<div class="pch-scan-duo-col"><div class="pch-scan-duo-title">药品清单</div><div id="pchScanDrugs"></div></div>' +
        '<div class="pch-scan-duo-col"><div class="pch-scan-duo-title">码明细（扫码过程）</div>' +
        '<div class="pch-scan-result" id="pchScanResult"><div class="pch-scan-empty">等待扫码…</div></div></div></div>'
      : '<div class="pch-scan-result" id="pchScanResult"><div class="pch-scan-empty">等待扫码…</div></div>';
    modalShell(id, opts.title || '扫码',
      (opts.headerHtml ? '<div class="pch-scan-header">' + opts.headerHtml + '</div>' : '') +
      '<div style="font-size:13.5px;font-weight:600;margin-bottom:8px;">请扫描追溯码：</div>' +
      scanRow +
      (opts.hint ? '<div class="text-secondary" style="font-size:12px;margin-top:6px;">' + esc(opts.hint) + '</div>' : '') +
      (duo ? '' : '<div style="font-size:13.5px;font-weight:600;margin:14px 0 0;">扫码结果：</div>') +
      resultHtml +
      (flagsHtml ? '<div class="pch-scan-flags">' + flagsHtml + '</div>' : ''),
      '<button class="btn btn-outline-secondary" data-mclose2>关闭</button>' +
      (opts.onAudit ? '<button class="btn btn-success" id="pchScanAudit">✓ 直接审核</button>' : ''), 1800);
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
    // 加入/移除模式切换：切钮高亮 + 占位符提示 + 回焦输入框（不打断连续作业）
    if (hasRm) {
      var bAdd = el.querySelector('#pchScanModeAdd'), bRm = el.querySelector('#pchScanModeRm');
      var setMode = function (m) {
        scanState.mode = m;
        bAdd.className = m === 'add' ? 'active-add' : '';
        bRm.className = m === 'remove' ? 'active-rm' : '';
        input.placeholder = '扫码枪输入 / 手工输入后回车（多码逗号分隔）' + (m === 'remove' ? '（移除模式）' : '');
        input.focus();
      };
      bAdd.addEventListener('click', function () { setMode('add'); });
      bRm.addEventListener('click', function () { setMode('remove'); });
    }
    input.focus();
    renderScanItems();   // 首帧：双栏模式渲染左栏药品清单（后续每码刷新走 renderScanItems 同点）
    // 扫码输入共用通道（回车键与演示码速查悬浮窗同路；2026-10-13 Round BW）
    var doScanInput = function (code) {
      input.value = '';
      var flags = {};
      (opts.flags || []).forEach(function (f) {
        if (f.key === 'remove') { flags.remove = scanState.mode === 'remove'; return; }
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
    };
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var codes = splitScanBatch(input.value);
      if (!codes.length) return;
      codes.forEach(doScanInput);   // 批量：逗号分隔多码逐个走同一通道（doScanInput 自清输入框）
    });
    // 演示码速查悬浮窗（2026-10-13 Round BW：所有扫码页面都要有——点击=模拟扫码枪走同一通道）
    document.body.appendChild(demoPad(doScanInput));
  }
  function renderScanItems() {
    var box = document.getElementById('pchScanResult');
    if (!box || !scanState) return;
    // 二期 Task B：双栏模式在此现有刷新点顺带重渲染左栏（重调 drugsRows() 取最新行模型；码明细内部逻辑不动）
    if (typeof scanState.opts.drugsRows === 'function' &&
        window.PulDocDetail && typeof window.PulDocDetail.renderDrugs === 'function') {
      var left = document.getElementById('pchScanDrugs');
      if (left) {
        left.innerHTML = window.PulDocDetail.renderDrugs({ drugs: scanState.opts.drugsRows() || [] },
          scanState.opts.drugsOptions || {});
      }
    }
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
    var pad = document.getElementById('pchDemoPad');
    if (pad) pad.remove();   // 演示码速查悬浮窗随弹窗移除（Round BW）
    scanState = null;
    if (cb) cb();
  }

  // ===== 筛选项统一交互（2026-10-13 Round BT 用户拍板「所有页面筛选项=文本标签+控件」）：标签前置、控件类型不变 =====
  function fItem(label, ctrlHtml) {
    return '<span style="display:inline-flex;align-items:center;gap:6px;">' +
      '<span class="text-secondary" style="font-size:12.5px;white-space:nowrap;">' + esc(label) + '</span>' + ctrlHtml + '</span>';
  }

  // ===== 演示码速查悬浮窗（2026-10-13 Round BW 用户拍板「所有扫码页面都要有」）：点击=模拟扫码枪，覆盖正常/重复/解析失败/重复入库/被占用 =====
  var DEMO_CODES = [
    { tag: 'ok', code: '81487900000005010001', label: '尿素乳膏 支码（+1 支，自动建药品行）' },
    { tag: 'ok', code: '84004310000005010001', label: '乳酸依沙吖啶 盒码（再建一行）' },
    { tag: 'ok', code: '88524780000005010001', label: '尿素乳膏 盒码（层级换算 +10 支）' },
    // 发码机构三格式归一演示（2026-10-14 需求方图二）：GS1/IDCODE 扫码即转阿里标识码，批次/生产日期/效期随码解析
    { tag: 'ok', code: '01069012345678901124123117261231102605082100001', label: 'GS1 码·依姆多（01 开头→归一阿里码）' },
    { tag: 'ok', code: 'MA.156.M0.123456.N123456C.M241231.E261231.L260508.S00001', label: 'IDCODE 码·乳酸依沙吖啶（MA. 开头→归一阿里码）' },
    { tag: 'warn', code: '81487900000005010001', label: '重复扫码（上方 ✓ 码再扫一次）' },
    { tag: 'bad', code: '89999990000005010001', label: '解析失败（标识码 8999999 未维护）' },
    { tag: 'bad', code: '81487900000000010001', label: '重复入库（该码已在中心库在架）' },
    { tag: 'bad', code: '81487900000003990001', label: '被占用（已挂在途单 LAB-LY-999）' }
  ];
  // getItems 可选：动态上下文取当前演示码列表（如 scan-hub 置顶本单真实码）；不传用静态 DEMO_CODES
  function demoPad(onPick, getItems) {
    var folded = false;
    var pad = document.createElement('div');
    pad.id = 'pchDemoPad';
    pad.style.cssText = 'position:fixed;right:14px;top:50%;transform:translateY(-50%);z-index:3000;width:350px;max-height:72vh;overflow:auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,.16);padding:10px 12px;font-size:12px;';
    var TAGS = { ok: ['✓', '#1f9d55'], warn: ['!', '#f59f00'], bad: ['×', '#e03131'] };
    function render() {
      var list = (typeof getItems === 'function' && getItems()) || DEMO_CODES;
      pad.innerHTML =
        '<div style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px;margin-bottom:6px;">🧪 演示码速查（点击 = 模拟扫码枪）' +
          '<span style="margin-left:auto;"></span><button type="button" data-fold style="border:0;background:none;cursor:pointer;color:#626976;font-size:12px;">' + (folded ? '展开 ▾' : '收起 ▴') + '</button></div>' +
        (folded ? '' : list.map(function (d) {
          var t = TAGS[d.tag] || TAGS.ok;
          return '<button type="button" data-demo="' + esc(d.code) + '" style="display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:7px 9px;margin:4px 0;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-family:inherit;">' +
            '<span style="color:' + t[1] + ';font-weight:700;flex-shrink:0;">' + t[0] + '</span>' +
            '<span title="' + esc(d.code) + '" style="font-family:Consolas,monospace;flex-shrink:0;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(d.code) + '</span>' +
            '<span style="color:#626976;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(d.label) + '</span></button>';
        }).join(''));
      var f = pad.querySelector('[data-fold]');
      if (f) f.addEventListener('click', function () { folded = !folded; render(); });
      pad.querySelectorAll('[data-demo]').forEach(function (b) {
        b.addEventListener('click', function () { onPick(b.getAttribute('data-demo')); });
      });
      pad.refresh = render;   // 调用方在视图变化后重取动态列表
    }
    render();
    return pad;
  }

  // ===== 统一扫码弹窗（2026-10-13 Round BT：行内「扫码录入」从跳页改弹窗；页面复用 scan-hub?embed=1，不重写逻辑；关闭后回调刷新本页） =====
  // 2026-10-13 Round BW：底部「关闭」删除——与审核按钮合并到 iframe 内固定作业条同一行（postMessage 桥接关闭）
  function openScanHub(billNo, onClose) {
    var id = 'pchScanHub';
    modalShell(id, '统一扫码 · ' + billNo,
      '<iframe src="scan-hub.html?billNo=' + encodeURIComponent(billNo) + '&embed=1" style="width:100%;height:calc(86vh - 90px);border:0;background:#f1f5f9;border-radius:4px;"></iframe>',
      '', 1800);
    var el = open(id);
    function done() { if (onClose) onClose(); }
    function onMsg(e) {
      if (!e.data || e.data.type !== 'pchScanHubClose') return;
      if (!document.getElementById(id)) return;
      window.removeEventListener('message', onMsg);
      close(id); done();
      // Round CC 暂存-提交制：iframe「提交」=已写回单据池；遮罩/× 关闭=草稿保留（查 scanDrafts 提示恢复）
      if (e.data.submitted) {
        if (window.showToast) window.showToast('扫码记录已提交，单据数据已更新');
      } else {
        var drafts = (window.store.load().scanDrafts || {});
        var has = Object.keys(drafts).some(function (k) { return k.indexOf(':' + billNo) > -1; });
        if (has && window.showToast) window.showToast('扫码记录已暂存未提交——下次打开自动恢复，点「提交」后生效');
      }
    }
    window.addEventListener('message', onMsg);
    el.addEventListener('click', function (e) { if (e.target === el) done(); });   // 点遮罩关闭 → 刷新
    var x = el.querySelector('.app-modal-close');
    if (x) x.addEventListener('click', done);   // 头部 × 关闭 → 刷新
    return el;
  }

  // ===== 审核异常弹窗（Round CD 自 purchase-arrive/purchase-out 收编共享——公约「第三处复用时收进 PchUI」；拦截=原因+明细+快捷处理入口） =====
  function auditBlock(billNo, title, detailHtml, act) {
    modalShell('pchAuditBlock', '审核异常 · ' + billNo,
      '<div style="font-size:13.5px;line-height:1.9;">' +
      '<div class="text-danger" style="font-weight:600;font-size:14px;margin-bottom:6px;">✗ ' + title + '</div>' +
      (detailHtml ? '<div>' + detailHtml + '</div>' : '') + '</div>',
      (act ? '<button class="btn btn-primary" id="abGo">' + esc(act.label) + '</button>' : '') +
      '<button class="btn btn-outline-secondary" data-mclose>关闭</button>', 560);
    var el = open('pchAuditBlock');
    if (act) el.querySelector('#abGo').addEventListener('click', function () { close('pchAuditBlock'); act.fn(); });
  }

  window.PchUI = { esc: esc, splitScanBatch: splitScanBatch, light: light, stepsBar: stepsBar, tabsHeader: tabsHeader, fItem: fItem, demoPad: demoPad,
    modalShell: modalShell, open: open, close: close, confirm: confirmBox, openScan: openScan, openScanHub: openScanHub,
    auditBlock: auditBlock };
})();
