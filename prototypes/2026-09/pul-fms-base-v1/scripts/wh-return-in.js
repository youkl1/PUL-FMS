/**
 * wh-return-in.js — 领用退回：药房（在架/在途）→ 库房在架（码状态机逆向迁移）
 * 双通道（2026-09-30 拍板）：
 *   场景A 药房建单：退回单池 → 逐码核对（扫码/人工勾选）→ 审核入库
 *   场景B 库房直收：+ 新增退回（选药房）→ 扫码/手输收码 → 审核一次落账（retPool+retInDocs 同写，药房在架同步扣）
 * 码源口径：可退 = 该药房「领出未回」全部码 = 药房在架 ∪ 在途（领用出库已出库·待入库）− 已在退回单 − 已损耗；
 *          不要求在货架（phLoc）上，一定有追溯码即可
 * 防呆：退回码必须不在库房在架（否则=异常退回，拦截）；拆零码黄色提示
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'retIn', crumb: ['库房管理', '领用退回'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load(), PS = P.load(), FS = window.PUL_FACILITY.load();
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
  // 某药房「领出未回」码集合：在架 ∪ 在途 − 已退 − 已损耗（直收单的合法码源）
  function retirable(pharmacy) {
    var map = {};
    W.pharmacyStock(S, pharmacy).forEach(function (c) { map[c.code] = c; });
    (S.pickDocs || []).forEach(function (d) {
      if (d.pharmacy !== pharmacy || d.status !== '已出库·待入库') return;
      (d.codes || []).forEach(function (c) { map[c.code] = c; });
    });
    (S.retPool || []).forEach(function (r) {
      (r.codes || []).forEach(function (c) { delete map[c.code]; });
    });
    (S.phLossDocs || []).forEach(function (d) {
      if (d.status !== '已审核') return;
      (d.codes || []).forEach(function (c) { delete map[c.code]; });
    });
    return map;
  }
  function isDirect(r) { return r && r.source === '库房直收'; }

  // ===== 退回单池 =====
  function poolCard() {
    var list = pending();
    var rowsHtml = list.map(function (r) {
      return '<tr class="pch-doc-row' + (r.retNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(r.retNo) + '">' +
        '<td><b>' + esc(r.retNo) + '</b></td><td class="text-secondary">' + esc(r.date) + '</td>' +
        '<td>' + (r.refNo ? '<b>' + esc(r.refNo) + '</b>' : '<span class="text-secondary">—</span>') + '</td>' +
        '<td>' + esc(r.pharmacy) + '</td><td>' + esc(r.operator) + '</td>' +
        '<td>' + r.codes.length + '</td>' +
        '<td>' + (isDirect(r) ? '<span class="badge bg-purple-lt">库房直收</span>' : '<span class="badge bg-blue-lt">药房建单</span>') + '</td>' +
        '<td><span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待入库</span></td>' +
        '<td onclick="event.stopPropagation()"><div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-scan="' + esc(r.retNo) + '">' + (isDirect(r) ? '扫码收码' : '扫码核对') + '</button>' +
          '<button class="btn btn-sm btn-outline-success" data-audit="' + esc(r.retNo) + '">审核入库</button>' +
        '</div></td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="9" class="text-center text-secondary" style="padding:28px;">暂无待入库退回单——药房「退回出库单」后自动出现，或点右上「+ 新增退回」直收</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>退回单池</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">药房建单（锚定来源出库单）传入 + 库房直收 · 待入库 ' + list.length + ' 单</span>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAddRet">+ 新增退回</button></div></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>退回单号</th><th>退回时间</th><th>来源出库单</th><th>退回药房</th><th>经手人</th><th>码数</th><th>来源</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // ===== 码清单核对（点行人工勾选；拆零码黄色提示；直收单=收码模式） =====
  function checkCard() {
    var r = selRet();
    var body;
    if (!r) {
      body = '<div class="text-center text-secondary" style="padding:32px;">点选上方退回单，开始核对</div>';
    } else {
      var direct = isDirect(r);
      var rowsHtml = r.codes.map(function (c, i) {
        var ck = direct ? true : !!checked[c.code];
        var splitTip = +c.splitQty > 0
          ? '<span class="wh-exp-badge warn">已拆零发出 ' + c.splitQty + '</span>' : '<span class="text-secondary">—</span>';
        return '<tr class="pch-doc-row' + (ck && !direct ? ' pch-row-picked' : '') + '"' + (direct ? '' : ' data-ck="' + esc(c.code) + '"') + '>' +
          '<td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
          '<td><b>' + esc(drugNameOf(c.code)) + '</b></td>' +
          '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td>' +
          '<td>' + splitTip + '</td>' +
          '<td>' + (direct
            ? '<button class="btn btn-sm btn-outline-danger" data-uncode="' + esc(c.code) + '">移除</button>'
            : (ck ? '<span class="text-success">✓ 已核对</span>' : '<span class="text-secondary">未核对</span>')) + '</td></tr>';
      }).join('');
      if (!r.codes.length) rowsHtml = '<tr><td colspan="7" class="text-center text-secondary" style="padding:24px;">码清单为空——' + (direct ? '扫码或手输收码（限该药房领出未回的码）' : '等待扫码核对') + '</td></tr>';
      var done = direct ? r.codes.length : r.codes.filter(function (c) { return checked[c.code]; }).length;
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>拆零提示</th><th>' + (direct ? '操作' : '核对') + '</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>' +
        '<div class="pch-tabbar">' +
        '<div class="pch-progress"><i style="width:' + (r.codes.length ? Math.round(done / r.codes.length * 100) : 0) + '%;"></i></div>' +
        '<span class="pch-progress-txt">' + (direct ? '已收 ' + done + ' 个码' : '已核对 ' + done + ' / ' + r.codes.length) + '</span>' +
        '<span class="text-secondary ms-auto" style="font-size:12.5px;">扫码/审核入口在上方单据行内；也可点码行人工勾选</span>' +
        '</div>';
    }
    return '<div class="card mb-3"><div class="card-header"><b>' + (isDirect(r) ? '直收码清单' : '退回码核对') + '</b>' +
      (r ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(r.retNo) + ' · ' + esc(r.pharmacy) + (r.refNo ? ' · 来源 ' + esc(r.refNo) : '') + (isDirect(r) ? ' · 库房直收' : '') + '</span>' : '') +
      '</div>' + body + '</div>';
  }

  // ===== 退回入库单记录 =====
  function docsCard() {
    var rowsHtml = S.retInDocs.map(function (d, i) {
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(d.billNo) + '</b></td>' +
        '<td>' + esc(d.refNo) + '</td><td>' + esc(d.pharmacy) + '</td><td>' + d.codes.length + '</td>' +
        '<td class="text-secondary">' + esc(d.auditor) + '</td><td class="text-secondary">' + esc(d.auditTime) + '</td>' +
        '<td>' + UI.light('已审核') + '</td></tr>';
    }).join('');
    if (!S.retInDocs.length) rowsHtml = '<tr><td colspan="8" class="text-center text-secondary" style="padding:24px;">暂无退回入库单记录</td></tr>';
    return '<div class="card"><div class="card-header"><b>退回入库单记录</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">审核后码回在架（库房库存查询即时回补）</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>入库单号</th><th>退回单号</th><th>退回药房</th><th>码数</th><th>审核人</th><th>审核时间</th><th>状态</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // ===== 扫码核对（单内码√ / 单外码×拦截 / 仍在架×异常退回；直收单=扫码收码） =====
  function openScanModal() {
    var r = selRet();
    if (!r) return;
    var direct = isDirect(r);
    UI.openScan({
      title: (direct ? '扫码收码 · ' : '扫码核对 · ') + r.retNo,
      hint: direct
        ? '扫/填退回实物码：限该药房「领出未回」的追溯码（在架+在途均可），重复扫码自动过滤'
        : '扫退回实物码：单内码标记已核对；不在单内或仍在库房在架的码拦截',
      gate: 'in', node: curWh(),
      onScan: function (code) {
        if (direct) {
          var dup = null;
          r.codes.forEach(function (c) { if (c.code === code) dup = c; });
          if (dup) return { level: 'warn', msg: '重复扫码，已在清单' };
          if (onShelf(code)) return { level: 'bad', msg: '该码仍在库房在架，退回异常' };
          var src = retirable(r.pharmacy)[code];
          if (!src) return { level: 'bad', msg: '该码不是「' + r.pharmacy + '」领出未回的码，禁止收' };
          r.codes.push(src);
          checked[code] = true;
          save(); renderAll();
          return { level: 'ok', msg: drugNameOf(code) + ' 已收码' + (+src.splitQty > 0 ? '（注意：已拆零发出 ' + src.splitQty + '）' : '') };
        }
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
    var direct = isDirect(r);
    // 直收单：收进清单即视为已核对，一次审核全量落账
    var done = direct ? r.codes.length : r.codes.filter(function (c) { return checked[c.code]; }).length;
    if (!done) { window.showToast(direct ? '请先扫码收码' : '请先扫码核对（或点码行勾选 / 全选）'); return; }
    UI.confirm('退回入库单审核：<b>' + esc(r.retNo) + '</b>（' + esc(r.pharmacy) + (direct ? ' · 库房直收' : '') + '）' +
      (direct ? '已收 ' + done + ' 个码，审核后一次全部入库。'
              : '已核对 ' + done + ' / ' + r.codes.length + ' 个码。' +
                (done < r.codes.length ? '<span class="text-warning">未核对完的码留在退回单。</span>' : '全部核对完成。')) +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:6px;">审核后码回到库房在架' + (direct ? '，药房在架同步扣减。' : '。') + '</div>',
      function () {
        var inCodes = direct ? r.codes.slice() : r.codes.filter(function (c) { return checked[c.code]; });
        r.codes = direct ? [] : r.codes.filter(function (c) { return !checked[c.code]; });
        if (!r.codes.length) r.status = '已入库';
        S.retInDocs.unshift({ billNo: W.nextNo('THRK', S.retInDocs), refNo: r.retNo, date: W.now(),
          pharmacy: r.pharmacy, warehouse: r.warehouse, status: '已审核',
          auditTime: W.now(), auditor: curUser().name || '演示员', codes: inCodes });
        checked = {}; if (!r.codes.length) sel = null;
        save(); renderAll();
        window.showToast('已审核入库 ' + inCodes.length + ' 个码，库房库存查询已回补' + (r.codes.length ? '（剩余 ' + r.codes.length + ' 码待入库）' : ''));
      }, '审核入库');
  }

  // ===== 新增退回（库房直收：选药房 → 建空单 → 扫码/手输收码） =====
  function openAdd() {
    var opts = FS.pharmacies.filter(function (p) { return p.status === '启用'; }).map(function (p) {
      return '<option value="' + esc(p.name) + '">' + esc(p.name) + '（' + esc(p.org) + '）</option>';
    }).join('');
    var id = UI.modalShell('retAdd', '新增退回 · 库房直收',
      '<div style="display:grid;gap:12px;">' +
      '<div><label class="form-label">退回药房</label><select class="form-select" id="retAddPharmacy">' + opts + '</select></div>' +
      '<div><label class="form-label">备注（选填）</label><input class="form-control" id="retAddRemark" placeholder="如：实物先行退回，药房后补单"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;line-height:1.7;">创建后进入「直收码清单」，扫码/手输收码——限该药房「领出未回」的追溯码（在架 + 在途均可，不要求在货架上）。</div></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="btnRetAddOk">创建退回单</button>', 520);
    UI.open('retAdd');
    id.querySelector('#btnRetAddOk').addEventListener('click', function () {
      var pharmacy = id.querySelector('#retAddPharmacy').value;
      var remark = id.querySelector('#retAddRemark').value.trim();
      var doc = { retNo: W.nextNo('TH', S.retPool), date: W.now(), pharmacy: pharmacy,
        warehouse: curWh(), operator: curUser().name || '演示员', status: '待入库',
        source: '库房直收', remark: remark, codes: [] };
      S.retPool.unshift(doc);
      sel = doc.retNo; checked = {};
      save(); UI.close('retAdd'); renderAll();
      window.showToast('已创建直收退回单 ' + doc.retNo + '，请扫码收码');
    });
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
    var badd = document.getElementById('btnAddRet');
    if (badd) badd.addEventListener('click', openAdd);
    content.querySelectorAll('[data-uncode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var r = selRet(); if (!r) return;
        var code = btn.getAttribute('data-uncode');
        r.codes = r.codes.filter(function (c) { return c.code !== code; });
        delete checked[code];
        save(); renderAll();
      });
    });
    content.querySelectorAll('[data-scan]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-scan');
        if (no !== sel) { sel = no; checked = {}; }
        openScanModal();
      });
    });
    content.querySelectorAll('[data-audit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-audit');
        if (no !== sel) { sel = no; checked = {}; }
        openAudit();
      });
    });
  }

  var first = pending()[0];
  if (first) sel = first.retNo;
  renderAll();
})();
