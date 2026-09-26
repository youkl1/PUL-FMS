/**
 * ph-ret-out.js — 退回出库：药房在架 → 库房退回单池
 * 未出库=草稿（可撤销）；确认后 status=待入库，库房「退回入库」可见
 * 只许选本药房在架码（pharmacyStock）；一码不能同时在两张退回单
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'retOut', crumb: ['药房管理', '退回出库'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load();
  var DICT = D.flat(DS);
  var sel = null;
  var filters = { status: '全部', kw: '' };

  function save() { W.save(S); }
  function curUser() { return window.store.load().currentUser || {}; }
  function curPharm() { return W.curPharm(); }
  function stockMap() {
    var m = {};
    W.pharmacyStock(S, curPharm()).forEach(function (c) { m[c.code] = c; });
    return m;
  }
  function myRets() {
    var ph = curPharm();
    return S.retPool.filter(function (r) {
      if (r.pharmacy !== ph) return false;
      if (filters.status !== '全部' && r.status !== filters.status) return false;
      if (filters.kw && r.retNo.indexOf(filters.kw) === -1) return false;
      return true;
    });
  }
  function selRet() {
    for (var i = 0; i < S.retPool.length; i++) if (S.retPool[i].retNo === sel) return S.retPool[i];
    return null;
  }
  function drugNameOf(code20) {
    var p = P.parseCode(code20, DICT);
    return p.dict ? p.dict.drugName : '未解析';
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function stHtml(st) {
    if (st === '已入库') return '<span class="pch-light ok"><i class="pch-dot"></i>已入库</span>';
    if (st === '待入库') return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待入库</span>';
    return '<span class="pch-light mute"><i class="pch-dot"></i>未出库</span>';
  }

  function filterBar() {
    var opt = function (cur, o, label) {
      return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>';
    };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fStatus" style="width:120px;">' +
        ['全部', '未出库', '待入库', '已入库'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fKw" style="width:170px;" placeholder="退回单号" value="' + esc(filters.kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(curPharm()) + '</span>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增退回</button></div>' +
      '</div></div></div>';
  }

  function docsCard() {
    var list = myRets();
    var rowsHtml = list.map(function (r) {
      var draft = r.status === '未出库';
      var op = draft
        ? '<button class="btn btn-sm btn-success" data-audit="' + esc(r.retNo) + '"' + (r.codes.length ? '' : ' disabled') + '>确认出库</button> ' +
          '<button class="btn btn-sm btn-outline-danger" data-del="' + esc(r.retNo) + '">撤销</button>'
        : '<span class="text-secondary" style="font-size:12.5px;">' + (r.status === '待入库' ? '待库房收' : '闭环') + '</span>';
      return '<tr class="pch-doc-row' + (r.retNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(r.retNo) + '">' +
        '<td><b>' + esc(r.retNo) + '</b></td><td class="text-secondary">' + esc(r.date) + '</td>' +
        '<td>' + esc(r.warehouse) + '</td><td>' + esc(r.operator) + '</td><td>' + r.codes.length + '</td>' +
        '<td>' + stHtml(r.status) + '</td>' +
        '<td onclick="event.stopPropagation()">' + op + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="7" class="text-center text-secondary" style="padding:28px;">暂无退回单——点右上「新增退回」从在架选码</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>退回出库单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">确认后进入库房「退回入库」单池 · 本药房 ' + list.length + ' 单</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>退回单号</th><th>时间</th><th>退回库房</th><th>经手人</th><th>码数</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  function codesCard() {
    var r = selRet();
    var body;
    if (!r) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点选单据行，查看码清单</div>';
    } else {
      var rowsHtml = r.codes.map(function (c, i) {
        var splitTip = +c.splitQty > 0 ? '<span class="wh-exp-badge warn">已拆零发出 ' + c.splitQty + '</span>' : '<span class="text-secondary">—</span>';
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
          '<td><b>' + esc(drugNameOf(c.code)) + '</b></td>' +
          '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td><td>' + splitTip + '</td>' +
          (r.status === '未出库'
            ? '<td><button class="btn btn-sm btn-outline-danger" data-uncode="' + esc(c.code) + '">移除</button></td>'
            : '<td class="text-secondary">—</td>') + '</tr>';
      }).join('');
      if (!r.codes.length) rowsHtml = '<tr><td colspan="7" class="text-center text-secondary" style="padding:24px;">码清单为空——扫码或「选在架码」</td></tr>';
      body = '<div class="table-responsive" style="max-height:340px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>拆零</th><th>操作</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>码清单</b>' +
      (r ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(r.retNo) + ' · ' + r.codes.length + ' 个码</span>' : '') +
      (r && r.status === '未出库' ? '<div class="ms-auto">' +
        '<button class="btn btn-sm btn-outline-primary" id="btnPick">☰ 选在架码</button> ' +
        '<button class="btn btn-sm btn-primary" id="btnScan">▸ 扫码选码</button></div>' : '') +
      '</div>' + body + '</div>';
  }

  function defaultWh() {
    var org = window.PUL.orgOfNode(curPharm()) || (curUser().org || '');
    var nodes = window.PUL.nodesOfOrg(org);
    for (var i = 0; i < nodes.length; i++) if (window.PUL.nodeKind(nodes[i].type) === '库房') return nodes[i].name;
    return '中心库';
  }
  function openAdd() {
    var r = { retNo: W.nextNo('TH', S.retPool, 'retNo'), date: W.now(), pharmacy: curPharm(),
      warehouse: defaultWh(), operator: curUser().name || '演示员', status: '未出库', codes: [] };
    S.retPool.unshift(r); sel = r.retNo; save(); renderAll();
    window.showToast('已创建 ' + r.retNo + '，请扫码或选在架码');
  }

  function openScanModal() {
    var r = selRet();
    if (!r || r.status !== '未出库') return;
    UI.openScan({
      title: '扫码选码 · ' + r.retNo,
      hint: '扫本药房在架追溯码；非在架（未入库本房 / 已退）拦截',
      gate: 'in', node: curPharm(),
      onScan: function (code) {
        var c = stockMap()[code];
        if (!c) return { level: 'bad', msg: '不在本药房在架（未领入或已在其他退回单）' };
        if (r.codes.some(function (x) { return x.code === code; })) return { level: 'warn', msg: '重复扫码，已在清单' };
        r.codes.push(Object.assign({}, c));
        save(); renderAll();
        return { level: 'ok', msg: '已加入：' + drugNameOf(code) };
      },
      onClose: renderAll
    });
  }

  function openPickModal() {
    var r = selRet();
    if (!r || r.status !== '未出库') return;
    var stock = W.pharmacyStock(S, curPharm()).filter(function (c) {
      return !r.codes.some(function (x) { return x.code === c.code; });
    });
    var rows = stock.map(function (c) {
      return '<tr><td><input class="form-check-input" type="checkbox" data-pk="' + esc(c.code) + '"></td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(drugNameOf(c.code)) + '</b></td>' +
        '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td>' +
        '<td class="text-secondary">' + esc(c._src || '') + '</td></tr>';
    }).join('');
    if (!stock.length) rows = '<tr><td colspan="6" class="text-center text-secondary" style="padding:24px;">本药房暂无在架码（先走领用入库闭环）</td></tr>';
    UI.modalShell('phRetPick', '选在架码 · ' + r.retNo,
      '<div class="table-responsive" style="max-height:360px;overflow-y:auto;"><table class="table table-vcenter table-sm card-table">' +
      '<thead><tr><th></th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>来源出库单</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="pkOk">加入清单</button>', 720);
    var el = UI.open('phRetPick');
    el.querySelector('#pkOk').addEventListener('click', function () {
      var sm = stockMap();
      el.querySelectorAll('[data-pk]:checked').forEach(function (cb) {
        var c = sm[cb.getAttribute('data-pk')];
        if (c && !r.codes.some(function (x) { return x.code === c.code; })) r.codes.push(Object.assign({}, c));
      });
      save(); UI.close('phRetPick'); renderAll();
      window.showToast('已加入选中码');
    });
  }

  function confirmOut(r) {
    if (!r.codes.length) { window.showToast('请先选码'); return; }
    UI.confirm('确认退回出库 <b>' + esc(r.retNo) + '</b> 到 ' + esc(r.warehouse) + '？共 ' + r.codes.length + ' 个码。' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:6px;">确认后进入库房「退回入库」单池，本药房在架扣除。</div>',
      function () {
        r.status = '待入库'; r.date = W.now();
        save(); renderAll();
        window.showToast('已出库，库房「退回入库」可见');
      }, '确认出库');
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + codesCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { status: v('fStatus'), kw: v('fKw') }; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { status: '全部', kw: '' }; renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', openAdd);
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-audit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-audit');
        S.retPool.forEach(function (r) { if (r.retNo === no) { sel = no; confirmOut(r); } });
      });
    });
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-del');
        UI.confirm('撤销退回单 <b>' + esc(no) + '</b>？码回到药房在架。', function () {
          S.retPool = S.retPool.filter(function (r) { return r.retNo !== no; });
          if (sel === no) sel = null;
          save(); renderAll();
          window.showToast('已撤销 ' + no);
        }, '撤销');
      });
    });
    content.querySelectorAll('[data-uncode]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = selRet(); if (!r) return;
        r.codes = r.codes.filter(function (c) { return c.code !== b.getAttribute('data-uncode'); });
        save(); renderAll();
      });
    });
    var bs = document.getElementById('btnScan');
    if (bs) bs.addEventListener('click', openScanModal);
    var bp = document.getElementById('btnPick');
    if (bp) bp.addEventListener('click', openPickModal);
  }

  var first = myRets()[0];
  if (first) sel = first.retNo;
  renderAll();
})();
