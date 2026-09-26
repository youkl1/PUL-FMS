/**
 * wh-return-in.js — 退回入库：药房在架 → 库房在架（领用退回，码状态机逆向迁移）
 * 双通道核对（扫码 / 人工勾选，同采购入库验收哲学）；拆零码黄色提示；全部核对完自动走审核
 * 防呆：退回码必须不在库房在架（否则=异常退回，拦截）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'retIn', crumb: ['库房管理', '库房业务', '退回入库'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load(), PS = P.load();
  var DICT = D.flat(DS);
  var sel = null;
  var checked = {};   // code → true（切单清空，按码字符串 key）

  function save() { W.save(S); }
  function curUser() { return window.store.load().currentUser || {}; }
  function curWh() { return curUser().warehouse || '中心库'; }
  function pending() { return S.retPool.filter(function (r) { return r.status === '待入库'; }); }
  function selRet() {
    for (var i = 0; i < S.retPool.length; i++) if (S.retPool[i].retNo === sel) return S.retPool[i];
    return null;
  }
  function onShelf(code20) {
    return W.stockAll(PS, S, curWh()).some(function (c) { return c.code === code20; });
  }
  function drugNameOf(code20) {
    var p = P.parseCode(code20, DICT);
    return p.dict ? p.dict.drugName : '未解析';
  }

  // ===== 退回单池 =====
  function poolCard() {
    var list = pending();
    var rowsHtml = list.map(function (r) {
      return '<tr class="pch-doc-row' + (r.retNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(r.retNo) + '">' +
        '<td><b>' + esc(r.retNo) + '</b></td><td class="text-secondary">' + esc(r.date) + '</td>' +
        '<td>' + esc(r.pharmacy) + '</td><td>' + esc(r.operator) + '</td>' +
        '<td>' + r.codes.length + '</td>' +
        '<td><span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待入库</span></td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="6" class="text-center text-secondary" style="padding:28px;">暂无待入库退回单——药房「退回出库」后自动出现</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>退回单池</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">药房「退回出库」传入 · 待入库 ' + list.length + ' 单</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>退回单号</th><th>退回时间</th><th>退回药房</th><th>经手人</th><th>码数</th><th>状态</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // ===== 码清单核对（点行人工勾选；拆零码黄色提示） =====
  function checkCard() {
    var r = selRet();
    var body;
    if (!r) {
      body = '<div class="text-center text-secondary" style="padding:32px;">点选上方退回单，开始核对</div>';
    } else {
      var rowsHtml = r.codes.map(function (c, i) {
        var ck = !!checked[c.code];
        var splitTip = +c.splitQty > 0
          ? '<span class="wh-exp-badge warn">已拆零发出 ' + c.splitQty + '</span>' : '<span class="text-secondary">—</span>';
        return '<tr class="pch-doc-row' + (ck ? ' pch-row-picked' : '') + '" data-ck="' + esc(c.code) + '">' +
          '<td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
          '<td><b>' + esc(drugNameOf(c.code)) + '</b></td>' +
          '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td>' +
          '<td>' + splitTip + '</td>' +
          '<td>' + (ck ? '<span class="text-success">✓ 已核对</span>' : '<span class="text-secondary">未核对</span>') + '</td></tr>';
      }).join('');
      var done = r.codes.filter(function (c) { return checked[c.code]; }).length;
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>拆零提示</th><th>核对</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>' +
        '<div class="pch-tabbar">' +
        '<div class="pch-progress"><i style="width:' + (r.codes.length ? Math.round(done / r.codes.length * 100) : 0) + '%;"></i></div>' +
        '<span class="pch-progress-txt">已核对 ' + done + ' / ' + r.codes.length + '</span>' +
        '<button class="btn btn-primary" id="btnScan">▸ 扫码核对</button>' +
        '<button class="btn btn-outline-primary" id="btnAll">全选</button>' +
        '<div class="ms-auto"><button class="btn btn-success" id="btnAudit"' + (done ? '' : ' disabled') + '>✓ 人工核对入库</button></div>' +
        '</div>';
    }
    return '<div class="card mb-3"><div class="card-header"><b>退回码核对</b>' +
      (r ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(r.retNo) + ' · ' + esc(r.pharmacy) + '</span>' : '') +
      '</div>' + body + '</div>';
  }

  // ===== 退回入库记录 =====
  function docsCard() {
    var rowsHtml = S.retInDocs.map(function (d, i) {
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(d.billNo) + '</b></td>' +
        '<td>' + esc(d.refNo) + '</td><td>' + esc(d.pharmacy) + '</td><td>' + d.codes.length + '</td>' +
        '<td class="text-secondary">' + esc(d.auditor) + '</td><td class="text-secondary">' + esc(d.auditTime) + '</td>' +
        '<td>' + UI.light('已审核') + '</td></tr>';
    }).join('');
    if (!S.retInDocs.length) rowsHtml = '<tr><td colspan="8" class="text-center text-secondary" style="padding:24px;">暂无退回入库记录</td></tr>';
    return '<div class="card"><div class="card-header"><b>退回入库记录</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">审核后码回在架（库房库存即时回补）</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>入库单号</th><th>退回单号</th><th>退回药房</th><th>码数</th><th>审核人</th><th>审核时间</th><th>状态</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // ===== 扫码核对（单内码√ / 单外码×拦截 / 仍在架×异常退回） =====
  function openScanModal() {
    var r = selRet();
    if (!r) return;
    UI.openScan({
      title: '扫码核对 · ' + r.retNo,
      hint: '扫退回实物码：单内码标记已核对；不在单内或仍在库房在架的码拦截',
      gate: 'in', node: curWh(),
      onScan: function (code) {
        var inDoc = null;
        r.codes.forEach(function (c) { if (c.code === code) inDoc = c; });
        if (!inDoc) return { level: 'bad', msg: '不在本退回单，禁止混入' };
        if (checked[code]) return { level: 'warn', msg: '重复扫码，已核对' };
        if (onShelf(code)) return { level: 'bad', msg: '该码仍在库房在架，退回异常' };
        checked[code] = true;
        renderAll();
        return { level: 'ok', msg: drugNameOf(code) + ' 已核对' + (+inDoc.splitQty > 0 ? '（注意：已拆零发出 ' + inDoc.splitQty + '）' : '') };
      },
      onClose: renderAll
    });
  }

  // ===== 审核入库 =====
  function openAudit() {
    var r = selRet();
    if (!r) return;
    var done = r.codes.filter(function (c) { return checked[c.code]; }).length;
    UI.confirm('退回入库审核：<b>' + esc(r.retNo) + '</b>（' + esc(r.pharmacy) + '）已核对 ' + done + ' / ' + r.codes.length +
      ' 个码。' + (done < r.codes.length ? '<span class="text-warning">未核对完的码留在退回单。</span>' : '全部核对完成。') +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:6px;">审核后已核对码回到库房在架。</div>',
      function () {
        var inCodes = r.codes.filter(function (c) { return checked[c.code]; });
        r.codes = r.codes.filter(function (c) { return !checked[c.code]; });
        if (!r.codes.length) r.status = '已入库';
        S.retInDocs.unshift({ billNo: W.nextNo('THRK', S.retInDocs), refNo: r.retNo, date: W.now(),
          pharmacy: r.pharmacy, warehouse: r.warehouse, status: '已审核',
          auditTime: W.now(), auditor: curUser().name || '演示员', codes: inCodes });
        checked = {}; if (!r.codes.length) sel = null;
        save(); renderAll();
        window.showToast('已审核入库 ' + inCodes.length + ' 个码，库房库存已回补' + (r.codes.length ? '（剩余 ' + r.codes.length + ' 码待入库）' : ''));
      }, '审核入库');
  }

  function renderAll() {
    content.innerHTML = poolCard() + checkCard() + docsCard();
    bind();
  }

  function bind() {
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        sel = tr.getAttribute('data-sel'); checked = {}; renderAll();
      });
    });
    content.querySelectorAll('[data-ck]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var code = tr.getAttribute('data-ck');
        if (checked[code]) delete checked[code];
        else {
          if (onShelf(code)) { window.showToast('该码仍在库房在架，退回异常，请核实'); return; }
          checked[code] = true;
        }
        renderAll();
      });
    });
    var bs = document.getElementById('btnScan');
    if (bs) bs.addEventListener('click', openScanModal);
    var ball = document.getElementById('btnAll');
    if (ball) ball.addEventListener('click', function () {
      var r = selRet(); if (!r) return;
      r.codes.forEach(function (c) { if (!onShelf(c.code)) checked[c.code] = true; });
      renderAll();
    });
    var ba = document.getElementById('btnAudit');
    if (ba) ba.addEventListener('click', openAudit);
  }

  var first = pending()[0];
  if (first) sel = first.retNo;
  renderAll();
})();
