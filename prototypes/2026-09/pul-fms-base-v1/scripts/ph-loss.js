/**
 * ph-loss.js — 药房损耗：扫本房在架码报损，审核=已销毁终态（phLossDocs，不碰库房 lossDocs）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'phloss', crumb: ['药房管理', '药房损耗'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load();
  var DICT = D.flat(DS);
  var sel = null;
  var filters = { reason: '全部', kw: '' };

  function save() { W.save(S); }
  function curUser() { return window.store.load().currentUser || {}; }
  function ph() { return W.curPharm(); }
  function stockMap() {
    var m = {};
    W.pharmacyStock(S, ph()).forEach(function (c) { m[c.code] = c; });
    return m;
  }
  function selDoc() {
    for (var i = 0; i < S.phLossDocs.length; i++) if (S.phLossDocs[i].billNo === sel) return S.phLossDocs[i];
    return null;
  }
  function filtered() {
    var p = ph();
    return S.phLossDocs.filter(function (d) {
      if (d.pharmacy !== p) return false;
      if (filters.reason !== '全部' && d.reason !== filters.reason) return false;
      if (filters.kw && d.billNo.indexOf(filters.kw) === -1) return false;
      return true;
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fReason" style="width:120px;">' +
        ['全部'].concat(W.LOSS_REASONS).map(function (o) { return opt(filters.reason, o, o === '全部' ? '损耗原因' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fKw" style="width:160px;" placeholder="单据编号" value="' + esc(filters.kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(ph()) + '</span>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增损耗单</button></div>' +
      '</div></div></div>';
  }

  function docsCard() {
    var list = filtered();
    var rowsHtml = list.map(function (d) {
      var audited = d.status === '已审核';
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td><b>' + esc(d.billNo) + '</b></td><td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td><span class="badge bg-red-lt">' + esc(d.reason) + '</span></td>' +
        '<td>' + d.codes.length + '</td><td class="text-secondary">' + esc(d.remark || '—') + '</td>' +
        '<td>' + (audited ? '<span class="pch-light mute"><i class="pch-dot"></i>已销毁</span>'
          : '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>未审核</span>') + '</td>' +
        '<td onclick="event.stopPropagation()">' + (audited
          ? '<span class="text-secondary" style="font-size:12.5px;">' + esc(d.auditor || '') + '</span>'
          : '<button class="btn btn-sm btn-danger" data-audit="' + esc(d.billNo) + '"' + (d.codes.length ? '' : ' disabled') + '>审核销毁</button>') + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="7" class="text-center text-secondary" style="padding:28px;">暂无损耗单</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>单据编号</th><th>日期</th><th>原因</th><th>码数</th><th>说明</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' +
      '<div class="card-footer" style="font-size:12.5px;"><span class="text-secondary">审核=已销毁终态，只扣本药房在架，不可恢复</span></div></div>';
  }

  function codesCard() {
    var d = selDoc();
    var body;
    if (!d) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点选单据行，查看码清单</div>';
    } else {
      var rowsHtml = d.codes.map(function (c, i) {
        var p = P.parseCode(c.code, DICT);
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
          '<td><b>' + esc(p.dict ? p.dict.drugName : '未解析') + '</b></td>' +
          '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td>' +
          (d.status === '已审核' ? '<td class="text-secondary">—</td>'
            : '<td><button class="btn btn-sm btn-outline-danger" data-del="' + esc(c.code) + '">移除</button></td>') + '</tr>';
      }).join('');
      if (!d.codes.length) rowsHtml = '<tr><td colspan="6" class="text-center text-secondary" style="padding:24px;">码清单为空——点右上「扫码选码」</td></tr>';
      body = '<div class="table-responsive" style="max-height:320px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>操作</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>报损码清单</b>' +
      (d ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · ' + d.codes.length + ' 个码</span>' : '') +
      (d && d.status !== '已审核' ? '<div class="ms-auto"><button class="btn btn-sm btn-primary" id="btnScan">▸ 扫码选码</button></div>' : '') +
      '</div>' + body + '</div>';
  }

  function openAdd() {
    var reasonOpts = W.LOSS_REASONS.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
    UI.modalShell('phLossAdd', '新增药房损耗单',
      '<div class="mb-3"><label class="form-label required">损耗原因</label><select class="form-select" id="laReason">' + reasonOpts + '</select></div>' +
      '<div class="mb-3"><label class="form-label">药房</label><input class="form-control" value="' + esc(ph()) + '" disabled></div>' +
      '<div class="mb-2"><label class="form-label">情况说明</label><input class="form-control" id="laRemark"></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="laOk">保存</button>', 420);
    var el = UI.open('phLossAdd');
    el.querySelector('#laOk').addEventListener('click', function () {
      var d = { billNo: W.nextNo('YFSH', S.phLossDocs), date: W.now(), reason: el.querySelector('#laReason').value,
        pharmacy: ph(), remark: el.querySelector('#laRemark').value.trim(),
        status: '未审核', auditTime: '', auditor: '', codes: [] };
      S.phLossDocs.unshift(d); sel = d.billNo;
      save(); UI.close('phLossAdd'); renderAll();
      window.showToast('已创建 ' + d.billNo + '，请扫码选码');
    });
  }

  function openScanModal() {
    var d = selDoc();
    if (!d || d.status === '已审核') return;
    UI.openScan({
      title: '扫码选码 · ' + d.billNo,
      hint: '扫本药房在架追溯码加入报损；审核后进入已销毁终态',
      gate: 'loss', node: ph(),
      onScan: function (code) {
        var c = stockMap()[code];
        if (!c) return { level: 'bad', msg: '不在本药房在架' };
        if (d.codes.some(function (x) { return x.code === code; })) return { level: 'warn', msg: '重复扫码' };
        d.codes.push(Object.assign({}, c));
        save(); renderAll();
        var p = P.parseCode(code, DICT);
        return { level: 'ok', msg: '已加入报损：' + (p.dict ? p.dict.drugName : code) };
      },
      onClose: renderAll
    });
  }

  function openAudit(d) {
    if (!W.assertUnfrozen(ph())) return;
    if (!d.codes.length) { window.showToast('请先扫码选码'); return; }
    UI.confirm('<span class="text-danger"><b>⚠ 终态操作，不可恢复</b></span><div style="margin-top:8px;">审核 <b>' + esc(d.billNo) + '</b>（' + esc(d.reason) + '）后，' +
      d.codes.length + ' 个码从本药房在架永久扣除，<span class="text-danger">不可反审核</span>。</div>',
      function () {
        d.status = '已审核'; d.auditTime = W.now(); d.auditor = curUser().name || '演示员';
        save(); renderAll();
        window.showToast('已销毁 ' + d.codes.length + ' 个码');
      }, '确认销毁');
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + codesCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { reason: v('fReason'), kw: v('fKw') }; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { reason: '全部', kw: '' }; renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', openAdd);
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-audit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-audit'), d = null;
        S.phLossDocs.forEach(function (x) { if (x.billNo === no) d = x; });
        if (d) { sel = no; openAudit(d); }
      });
    });
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = selDoc(); if (!d) return;
        d.codes = d.codes.filter(function (c) { return c.code !== b.getAttribute('data-del'); });
        save(); renderAll();
      });
    });
    var bs = document.getElementById('btnScan');
    if (bs) bs.addEventListener('click', openScanModal);
  }

  if (S.phLossDocs.length) sel = S.phLossDocs[0].billNo;
  renderAll();
})();
