/**
 * wh-other-in.js — 其他入库：无上游单据的通用入库（赠品/期初补录/其他）
 * 人工录码（复用采购到货「录入码明细」模式：选药品+批次效期+数量→生成码记录）；审核后码进在架
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'othIn', crumb: ['库房管理', '库房业务', '其他入库'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load();
  var DICT = D.flat(DS);
  var sel = null;
  var filters = { type: '全部', kw: '' };

  function save() { W.save(S); }
  function curUser() { return window.store.load().currentUser || {}; }
  function curWh() { return curUser().warehouse || '中心库'; }
  function selDoc() {
    for (var i = 0; i < S.othInDocs.length; i++) if (S.othInDocs[i].billNo === sel) return S.othInDocs[i];
    return null;
  }
  function filtered() {
    return S.othInDocs.filter(function (d) {
      if (filters.type !== '全部' && d.type !== filters.type) return false;
      if (filters.kw && d.billNo.indexOf(filters.kw) === -1) return false;
      return true;
    });
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fType" style="width:130px;">' +
        ['全部'].concat(W.OTH_IN_TYPES).map(function (o) { return opt(filters.type, o, o === '全部' ? '入库类型' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fKw" style="width:170px;" placeholder="单据编号" value="' + esc(filters.kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增入库单</button></div>' +
      '</div></div></div>';
  }

  function docsCard() {
    var list = filtered();
    var rowsHtml = list.map(function (d) {
      var audited = d.status === '已审核';
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td><b>' + esc(d.billNo) + '</b></td><td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td><span class="badge bg-blue-lt">' + esc(d.type) + '</span></td>' +
        '<td>' + esc(d.warehouse) + '</td><td>' + d.codes.length + '</td>' +
        '<td class="text-secondary">' + esc(d.remark || '—') + '</td>' +
        '<td>' + (audited ? UI.light('已审核') : '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>未审核</span>') + '</td>' +
        '<td onclick="event.stopPropagation()">' + (audited
          ? '<span class="text-secondary" style="font-size:12.5px;">' + esc(d.auditor || '') + '</span>'
          : '<button class="btn btn-sm btn-success" data-audit="' + esc(d.billNo) + '"' + (d.codes.length ? '' : ' disabled title="请先录入码明细"') + '>审核入库</button>') + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">暂无入库单——点右上「新增入库单」</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>单据编号</th><th>日期</th><th>入库类型</th><th>库房</th><th>码数</th><th>备注</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' +
      '<div class="card-footer" style="font-size:12.5px;"><span class="text-secondary">共 ' + list.length + ' 条 · 审核后码进在架，不可反审核</span></div></div>';
  }

  // 码明细卡（选中单据；未审核可录入/删码）
  function codesCard() {
    var d = selDoc();
    var body;
    if (!d) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点选单据行，查看码明细</div>';
    } else {
      var list = P.summarize(d.codes, DICT);
      var rowsHtml = list.map(function (r, i) {
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.drugName) + '</b></td><td>' + esc(r.formSpec) + '</td>' +
          '<td>' + esc(r.packSpec) + '</td><td>' + esc(r.batch) + '</td><td>' + esc(r.expDate) + '</td>' +
          '<td><b>' + r.qty + '</b></td><td>' + esc(r.unit) + '</td></tr>';
      }).join('');
      if (!list.length) rowsHtml = '<tr><td colspan="8" class="text-center text-secondary" style="padding:24px;">暂无码明细' + (d.status === '已审核' ? '' : '——点右上「录入码明细」') + '</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>药品通用名</th><th>制剂规格</th><th>包装规格</th><th>批次</th><th>效期</th><th>数量</th><th>单位</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>码明细（药品视图）</b>' +
      (d ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · 共 ' + d.codes.length + ' 个码</span>' : '') +
      (d && d.status !== '已审核' ? '<div class="ms-auto"><button class="btn btn-sm btn-outline-primary" id="btnAddCodes">+ 录入码明细</button></div>' : '') +
      '</div>' + body + '</div>';
  }

  // ===== 新增入库单 =====
  function openAdd() {
    var typeOpts = W.OTH_IN_TYPES.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
    UI.modalShell('othInAdd', '新增其他入库单',
      '<div class="mb-3"><label class="form-label required">入库类型</label><select class="form-select" id="oaType">' + typeOpts + '</select></div>' +
      '<div class="mb-3"><label class="form-label required">库房</label><input class="form-control" value="' + esc(curWh()) + '" disabled></div>' +
      '<div class="mb-2"><label class="form-label">备注</label><input class="form-control" id="oaRemark" placeholder="如：厂家赠品随货同行"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">保存后选中单据「录入码明细」：选药品 + 批次/效期/数量，按数量生成码记录。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="oaOk">保存</button>', 480);
    var el = UI.open('othInAdd');
    el.querySelector('#oaOk').addEventListener('click', function () {
      var d = { billNo: W.nextNo('QTRK', S.othInDocs), date: W.now(), type: el.querySelector('#oaType').value,
        warehouse: curWh(), remark: el.querySelector('#oaRemark').value.trim(),
        status: '未审核', auditTime: '', auditor: '', codes: [] };
      S.othInDocs.unshift(d);
      sel = d.billNo;
      save(); UI.close('othInAdd'); renderAll();
      window.showToast('已创建入库单 ' + d.billNo + '，请录入码明细');
    });
  }

  // ===== 录入码明细（选药品 + 批次效期 + 数量 → 生成码记录，原型流水号模拟） =====
  function openAddCodes() {
    var d = selDoc();
    if (!d || d.status === '已审核') return;
    var drugOpts = S_idcodeOpts();
    UI.modalShell('othInCodes', '录入码明细 · ' + d.billNo,
      '<div class="mb-3"><label class="form-label required">药品（标识码字典）</label><select class="form-select" id="ocDrug">' + drugOpts + '</select></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-4"><label class="form-label required">批次号</label><input class="form-control" id="ocBatch" placeholder="如 250603"></div>' +
      '<div class="col-4"><label class="form-label required">生产日期</label><input class="form-control" id="ocProd" type="date"></div>' +
      '<div class="col-4"><label class="form-label required">有效期至</label><input class="form-control" id="ocExp" type="date"></div></div>' +
      '<div class="mb-2" style="max-width:200px;"><label class="form-label required">数量（按该码包装单位）</label><input class="form-control" id="ocQty" type="number" min="1" value="1"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">按数量生成对应个数的追溯码记录（原型以流水号模拟真实码）。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>完成</button>' +
      '<button class="btn btn-primary" id="ocOk">保存并继续</button>', 560);
    var el = UI.open('othInCodes');
    el.querySelector('#ocOk').addEventListener('click', function () {
      var idcode = el.querySelector('#ocDrug').value;
      var batch = el.querySelector('#ocBatch').value.trim();
      var prod = el.querySelector('#ocProd').value;
      var exp = el.querySelector('#ocExp').value;
      var qty = +el.querySelector('#ocQty').value;
      if (!batch || !prod || !exp || !qty || qty < 1) { window.showToast('批次号 / 生产日期 / 有效期至 / 数量 均为必填'); return; }
      var base = String(Date.now()).slice(-6);
      for (var i = 0; i < qty; i++) {
        var serial = ('9' + base + ('00' + i).slice(-3)).slice(0, 9);
        var code20 = idcode + serial + '0000';
        if (d.codes.some(function (c) { return c.code === code20; })) code20 = idcode + ('8' + base + ('00' + i).slice(-3)).slice(0, 9) + '0000';
        d.codes.push({ code: code20, level: 1, split: '否', splitQty: '', batch: batch, prodDate: prod, expDate: exp,
          checked: false, code2: '', code3: '', location: '' });
      }
      save(); renderAll();
      window.showToast('已录入 ' + qty + ' 个码，本单累计 ' + d.codes.length + ' 个');
    });
  }
  function S_idcodeOpts() {
    return DS.idcodes.filter(function (c) { return c.status === '启用'; }).map(function (c) {
      var dg = D.drugOf(DS, c.drugCode) || {};
      return '<option value="' + esc(c.idcode) + '">' + esc(dg.drugName || c.idcode) + ' · ' + esc(dg.formSpec || '') + ' · ' + esc(c.packSpec) + '</option>';
    }).join('');
  }

  // ===== 审核入库 =====
  function openAudit(d) {
    if (!W.assertUnfrozen(curWh())) return;
    if (!d.codes.length) { window.showToast('请先录入码明细'); return; }
    UI.confirm('审核入库 <b>' + esc(d.billNo) + '</b>（' + esc(d.type) + '）？共 ' + d.codes.length + ' 个码进在架。' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:6px;">审核后不可反审核，库房库存即时增加。</div>',
      function () {
        d.status = '已审核'; d.auditTime = W.now(); d.auditor = curUser().name || '演示员';
        save(); renderAll();
        window.showToast('已审核入库，' + d.codes.length + ' 个码进在架');
      }, '审核入库');
  }

  function renderAll() {
    content.innerHTML = filterBar() + docsCard() + codesCard();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { type: v('fType'), kw: v('fKw') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { type: '全部', kw: '' };
      renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', openAdd);
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-audit]').forEach(function (b) {
      b.addEventListener('click', function () { openAudit(selDocByNo(b.getAttribute('data-audit'))); });
    });
    var ac = document.getElementById('btnAddCodes');
    if (ac) ac.addEventListener('click', openAddCodes);
  }
  function selDocByNo(no) {
    for (var i = 0; i < S.othInDocs.length; i++) if (S.othInDocs[i].billNo === no) return S.othInDocs[i];
    return null;
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  if (S.othInDocs.length) sel = S.othInDocs[0].billNo;
  renderAll();
})();
