/**
 * inv.js — 盘点单 / 期初盘点（pathname 含 inv-init 则为期初）
 */
(function () {
  'use strict';
  var isInit = /inv-init/.test(location.pathname);
  var active = isInit ? 'invInit' : 'inv';
  var content = window.AppShell.render('desktopPreview', {
    active: active, crumb: ['盘点管理', isInit ? '期初盘点' : '盘点单']
  });
  if (!content) return;

  var W = window.PUL_WH, I = window.PUL_INV, P = window.PUL_PCH, D = window.PUL_DRUG;
  var UI = window.PchUI, esc = UI.esc;
  var S = I.load(), DICT = D.flat(D.load());
  var sel = null, kw = '';
  var type = isInit ? '期初' : '日常';

  function save() { I.save(S); }
  function node() { return I.curNode(); }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function drugName(code) {
    var p = P.parseCode(code, DICT);
    return p.dict ? p.dict.drugName : '未解析';
  }
  function list() {
    var n = node();
    return S.countDocs.filter(function (d) {
      if (d.type !== type) return false;
      if (d.node !== n.name) return false;
      if (kw && d.billNo.indexOf(kw) === -1) return false;
      return true;
    });
  }
  function selDoc() {
    for (var i = 0; i < S.countDocs.length; i++) if (S.countDocs[i].billNo === sel) return S.countDocs[i];
    return null;
  }

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:160px;" placeholder="盘点单号" value="' + esc(kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">节点：' + esc(node().kind) + ' / ' + esc(node().name) +
      (isInit ? ' · 期初=扫到即盘盈（已在架跳过）' : ' · 对照在架快照') + '</span>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增' + (isInit ? '期初盘点' : '盘点单') + '</button></div>' +
      '</div></div></div>';
  }

  function docsCard() {
    var rows = list().map(function (d) {
      var df = I.diff(d);
      var st = d.status === '已审核'
        ? '<span class="pch-light ok"><i class="pch-dot"></i>已审核</span>'
        : '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>未审核</span>';
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td><b>' + esc(d.billNo) + '</b></td><td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td>' + (d.sysCodes || []).length + '</td><td>' + (d.scanned || []).length + '</td>' +
        '<td>' + df.match + '</td><td class="text-success">' + df.gain.length + '</td>' +
        '<td class="text-danger">' + df.loss.length + '</td><td>' + st + '</td>' +
        '<td onclick="event.stopPropagation()">' +
          (d.status === '已审核'
            ? '<span class="text-secondary" style="font-size:12.5px;">' + esc(d.auditor || '') + '</span>'
            : '<button class="btn btn-sm btn-primary" data-audit="' + esc(d.billNo) + '">审核</button>') +
        '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="9" class="text-center text-secondary" style="padding:28px;">暂无单据——点右上新增</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>单号</th><th>日期</th><th>账存</th><th>实扫</th><th>相符</th><th>盘盈</th><th>盘亏</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function scanCard() {
    var d = selDoc();
    if (!d) return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点选单据后扫码录入实存</div></div>';
    var rows = (d.scanned || []).map(function (c, i) {
      return '<tr><td>' + (i + 1) + '</td><td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td>' + esc(drugName(c.code)) + '</td><td>' + esc(c.batch || '—') + '</td>' +
        (d.status === '已审核' ? '<td>—</td>' : '<td><button class="btn btn-sm btn-outline-danger" data-del="' + esc(c.code) + '">移除</button></td>') + '</tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="5" class="text-center text-secondary">尚未扫码</td></tr>';
    return '<div class="card"><div class="card-header"><b>实扫清单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · ' + (d.scanned || []).length + ' 个</span>' +
      (d.status !== '已审核' ? '<div class="ms-auto"><button class="btn btn-sm btn-primary" id="btnScan">▸ 扫码</button></div>' : '') +
      '</div><div class="table-responsive" style="max-height:280px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>#</th><th>追溯码</th><th>药品</th><th>批次</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function addDoc() {
    var n = node();
    var d = {
      billNo: W.nextNo(isInit ? 'QC' : 'PD', S.countDocs, 'billNo'), date: W.now(), type: type,
      node: n.name, kind: n.kind, status: '未审核', auditor: '', auditTime: '',
      sysCodes: isInit ? [] : I.snapshot(n.kind, n.name), scanned: [],
      gainPosted: false, lossPosted: false
    };
    S.countDocs.unshift(d); sel = d.billNo; save(); renderAll();
    window.showToast('已创建 ' + d.billNo + '，账存 ' + d.sysCodes.length + ' 个码');
  }

  function openScan(d) {
    UI.openScan({
      title: '盘点扫码 · ' + d.billNo,
      hint: isInit ? '扫实物码作为期初实存；已在架的跳过' : '扫到账存内=相符；不在账存=盘盈',
      gate: 'count', node: d.node,
      onScan: function (code) {
        if ((d.scanned || []).some(function (c) { return c.code === code; })) return { level: 'warn', msg: '重复扫码' };
        var onh = null;
        I.snapshot(d.kind, d.node).forEach(function (c) { if (c.code === code) onh = c; });
        if (isInit && onh) return { level: 'warn', msg: '已在架，期初跳过' };
        var rec = onh ? Object.assign({}, onh) : (function () {
          var p = P.parseCode(code, DICT);
          return { code: code, batch: '', expDate: '', phLoc: '', location: '' };
        })();
        d.scanned.push(rec); save(); renderAll();
        var p = P.parseCode(code, DICT);
        var tag = isInit ? '期初盘盈' : (onh ? '相符' : '盘盈');
        return { level: 'ok', msg: tag + ' · ' + (p.dict ? p.dict.drugName : code) };
      },
      onClose: renderAll
    });
  }

  function audit(d) {
    var df = I.diff(d);
    UI.confirm('审核 <b>' + esc(d.billNo) + '</b>？<div style="margin-top:8px;">相符 ' + df.match +
      ' · 盘盈 ' + df.gain.length + ' · 盘亏 ' + df.loss.length + '<br>过账请到「盘盈入库 / 盘亏出库」。</div>', function () {
      d.status = '已审核'; d.auditTime = W.now();
      d.auditor = (window.store.load().currentUser || {}).name || '演示员';
      save(); renderAll();
      window.showToast('已审核，去盘盈入库 / 盘亏出库过账');
    }, '确认审核');
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + scanCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () { kw = v('fKw'); renderAll(); });
    document.getElementById('btnReset').addEventListener('click', function () { kw = ''; renderAll(); });
    document.getElementById('btnAdd').addEventListener('click', addDoc);
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-audit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = null; S.countDocs.forEach(function (x) { if (x.billNo === b.getAttribute('data-audit')) d = x; });
        if (d) { sel = d.billNo; audit(d); }
      });
    });
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = selDoc(); if (!d) return;
        d.scanned = d.scanned.filter(function (c) { return c.code !== b.getAttribute('data-del'); });
        save(); renderAll();
      });
    });
    var bs = document.getElementById('btnScan');
    if (bs) bs.addEventListener('click', function () { var d = selDoc(); if (d) openScan(d); });
  }

  if (list().length) sel = list()[0].billNo;
  renderAll();
})();
