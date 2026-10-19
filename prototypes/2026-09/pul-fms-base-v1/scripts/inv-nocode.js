/**
 * inv-nocode.js — 无码药品记录：没有 20 位追溯码的数量登记
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'invNocode', crumb: ['盘点管理', '无码药品记录'] });
  if (!content) return;
  var I = window.PUL_INV, D = window.PUL_DRUG, W = window.PUL_WH, UI = window.PchUI, esc = UI.esc;
  var S = I.load(), DS = D.load();
  var kw = '';
  function save() { I.save(S); }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function drugName(dc) { var d = D.drugOf(DS, dc); return d ? d.drugName : dc; }
  function list() {
    return S.nocode.filter(function (r) {
      return !kw || (r.recNo + drugName(r.drugCode) + r.node).indexOf(kw) !== -1;
    });
  }
  function openAdd() {
    var opts = DS.drugs.map(function (d) {
      return '<option value="' + esc(d.drugCode) + '">' + esc(d.drugName) + '</option>';
    }).join('');
    UI.modalShell('wmAdd', '登记无码药品',
      '<div class="mb-3"><label class="form-label required">药品</label><select class="form-select" id="wmDrug">' + opts + '</select></div>' +
      '<div class="mb-3"><label class="form-label required">数量</label><input class="form-control" id="wmQty" type="number" min="1" value="1"></div>' +
      '<div class="mb-2"><label class="form-label">原因</label><input class="form-control" id="wmReason" placeholder="如：中药饮片无码"></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button><button class="btn btn-primary" id="wmOk">保存</button>', 420);
    var el = UI.open('wmAdd');
    el.querySelector('#wmOk').addEventListener('click', function () {
      var dc = el.querySelector('#wmDrug').value;
      var qty = parseInt(el.querySelector('#wmQty').value, 10) || 0;
      if (qty <= 0) { window.showToast('数量要大于 0'); return; }
      var n = I.curNode();
      var u = D.drugOf(DS, dc);
      S.nocode.unshift({
        recNo: W.nextNo('WM', S.nocode, 'recNo'), date: W.now(), node: n.name, drugCode: dc,
        qty: qty, unit: u ? u.baseUnit : '盒', reason: el.querySelector('#wmReason').value.trim(), remark: ''
      });
      save(); UI.close('wmAdd'); renderAll(); window.showToast('已登记');
    });
  }
  function renderAll() {
    var rows = list().map(function (r) {
      return '<tr><td><b>' + esc(r.recNo) + '</b></td><td class="text-secondary">' + esc(r.date) + '</td>' +
        '<td>' + esc(r.node) + '</td><td>' + esc(drugName(r.drugCode)) + '</td>' +
        '<td>' + r.qty + esc(r.unit) + '</td><td>' + esc(r.reason || '—') + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="6" class="text-center text-secondary" style="padding:28px;">无记录</td></tr>';
    content.innerHTML = '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex" style="gap:10px;"><input class="form-control" id="fKw" style="width:180px;" placeholder="单号 / 药品 / 节点" value="' + esc(kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 登记</button></div></div></div></div>' +
      '<div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>记录号</th><th>日期</th><th>节点</th><th>药品</th><th>数量</th><th>原因</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '</div>';
    document.getElementById('btnQuery').addEventListener('click', function () { kw = v('fKw'); renderAll(); });
    document.getElementById('btnReset').addEventListener('click', function () { kw = ''; renderAll(); });
    document.getElementById('btnAdd').addEventListener('click', openAdd);
  }
  renderAll();
})();
