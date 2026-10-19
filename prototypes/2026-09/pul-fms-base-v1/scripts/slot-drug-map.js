/**
 * slot-drug-map.js — 取药槽药品对照（客户原菜单）
 * 左：扫药品追溯码（20 位取前 7 位解析，或直接输 7 位标识码）+ 扫/输取药槽 → 绑定
 * 右：对照记录（物理柜可解绑；逻辑柜建槽即对照，仅展示）
 * 规则：一药多槽、一槽一药；换绑需确认；绑定逻辑见 facility-data.bindDrug
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'slotDrugMap', crumb: ['系统管理', '取药槽药品对照'] });
  if (!content) return;

  var F = window.PUL_FACILITY, D = window.PUL_DRUG, UI = window.PchUI, esc = UI.esc;
  var S = F.load();
  var picked = { drug: null, idcode: '', cell: null };

  function save() { F.save(S); }

  // 追溯码解析：20 位全程码取前 7 位产品资源码；兼容直接输 7 位标识码
  function resolveDrug(raw) {
    var ds = D.load();
    var key = raw.length >= 7 ? raw.slice(0, 7) : raw;
    var ic = D.idcodeOf(ds, key);
    if (!ic) return { err: '标识码 ' + key + ' 未在药品字典建档' };
    if (ic.status !== '启用') return { err: '标识码 ' + key + ' 已停用' };
    var d = D.drugOf(ds, ic.drugCode);
    if (!d) return { err: '标识码 ' + key + ' 未关联药品' };
    if (d.status !== '启用') return { err: '药品「' + d.drugName + '」未启用（' + d.status + '）' };
    return { drug: d, idcode: key };
  }

  function formCard() {
    var g = picked.drug, c = picked.cell;
    var ro = function (v) { return '<input class="form-control" value="' + esc(v || '') + '" disabled>'; };
    return '<div class="card" style="flex:1;min-width:0;">' +
      '<div class="card-header"><b>取药槽药品对照维护</b></div>' +
      '<div class="card-body">' +
      '<div class="mb-3"><label class="form-label required">药品追溯码 / 标识码（扫入后回车）</label>' +
        '<input class="form-control" id="inpDrug" placeholder="扫 20 位追溯码或输 7 位标识码，如 8461935" autocomplete="off"></div>' +
      '<div class="row g-3 mb-3">' +
        '<div class="col-4"><label class="form-label">药品通用名</label>' + ro(g ? g.drugName : '') + '</div>' +
        '<div class="col-4"><label class="form-label">制剂规格</label>' + ro(g ? g.formSpec : '') + '</div>' +
        '<div class="col-4"><label class="form-label">所属库房</label>' + ro(g ? g.warehouse : '') + '</div></div>' +
      '<hr style="margin:8px 0 16px;">' +
      '<div class="mb-3"><label class="form-label required">取药槽编号（扫入/输入后回车）</label>' +
        '<input class="form-control" id="inpCell" placeholder="如 C1-02" autocomplete="off"' + (g ? '' : ' disabled') + '></div>' +
      '<div class="row g-3 mb-3">' +
        '<div class="col-4"><label class="form-label">取药柜编号</label>' + ro(c ? c.cabinet.code : '') + '</div>' +
        '<div class="col-4"><label class="form-label">取药柜说明</label>' + ro(c ? (c.cabinet.remark || c.cabinet.name) : '') + '</div>' +
        '<div class="col-4"><label class="form-label">摆药层编号</label>' + ro(c ? c.layer.code : '') + '</div></div>' +
      (c && c.cell.drugCode && (!g || c.cell.drugCode !== g.drugCode)
        ? '<div class="mb-3"><span class="badge bg-orange-lt">该取药槽已对照药品 ' + esc(c.cell.drugName) + '，绑定后将换绑</span></div>' : '') +
      '<div class="d-flex" style="gap:10px;">' +
        '<button class="btn btn-primary" id="btnBind"' + ((g && c) ? '' : ' disabled') + '>绑定</button>' +
        '<button class="btn btn-outline-secondary" id="btnClear">清空重扫</button>' +
      '</div>' +
      '<div class="text-secondary mt-3" style="font-size:12.5px;">一对多：一个药品可对照多个取药槽，一个取药槽只对照一个药品；逻辑取药柜建槽时已对照药品，本页不可改绑。</div>' +
      '</div></div>';
  }

  function recordsCard() {
    var recs = [];
    S.cabinets.forEach(function (cab) {
      cab.layers.forEach(function (lay) {
        lay.cells.forEach(function (cl) {
          if (cl.drugCode) recs.push({ cab: cab, lay: lay, cell: cl });
        });
      });
    });
    var rows = recs.map(function (r, i) {
      var spec = '';
      var d = D.drugOf(D.load(), r.cell.drugCode);
      if (d) spec = d.formSpec;
      var logic = r.cab.ctype === '逻辑';
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(r.cell.drugName) + '</b></td>' +
        '<td>' + esc(spec) + '</td>' +
        '<td style="font-family:Consolas,monospace;"><b>' + esc(r.cell.code) + '</b></td>' +
        '<td>' + esc(r.cab.code) + '</td>' +
        '<td>' + esc(r.lay.code) + '</td>' +
        '<td>' + (logic ? '<span class="badge bg-purple-lt">逻辑柜</span>' : '<span class="badge bg-blue-lt">物理柜</span>') + '</td>' +
        '<td>' + (logic ? '<span class="text-secondary" title="逻辑柜建槽即对照，如需变更请删除取药槽后重建" style="font-size:12px;">不可解绑</span>'
          : '<button class="btn btn-sm btn-outline-danger" data-unbind="' + esc(r.cell.code) + '">解绑</button>') + '</td></tr>';
    }).join('');
    if (!recs.length) rows = '<tr><td colspan="8" class="text-center text-secondary" style="padding:32px;">暂无对照记录</td></tr>';
    return '<div class="card" style="flex:1.35;min-width:0;">' +
      '<div class="card-header"><b>对照记录</b><span class="text-secondary ms-2" style="font-size:12.5px;">共 ' + recs.length + ' 条</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table table-sm">' +
      '<thead><tr><th>序号</th><th>药品通用名</th><th>药品规格</th><th>取药槽编号</th><th>取药柜编号</th><th>摆药层编号</th><th>柜类型</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function renderAll() {
    content.innerHTML = '<div class="d-flex" style="gap:12px;align-items:flex-start;">' + formCard() + recordsCard() + '</div>';
    bind();
  }

  function bind() {
    var inpDrug = document.getElementById('inpDrug');
    var inpCell = document.getElementById('inpCell');
    inpDrug.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var raw = inpDrug.value.trim();
      if (!raw) return;
      var r = resolveDrug(raw);
      if (r.err) { window.showToast(r.err); picked.drug = null; renderAll(); return; }
      picked.drug = r.drug; picked.idcode = r.idcode;
      renderAll();
      document.getElementById('inpCell').focus();
    });
    inpCell.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var code = inpCell.value.trim();
      if (!code) return;
      var f = F.findCell(S, code);
      if (!f) { window.showToast('取药槽 ' + code + ' 不存在，请核对编号'); picked.cell = null; renderAll(); return; }
      if (f.cabinet.ctype === '逻辑') { window.showToast('逻辑取药柜的取药槽在建槽时已对照药品，本页不可改绑'); picked.cell = null; renderAll(); return; }
      if (f.cabinet.status !== '启用') { window.showToast('取药柜「' + f.cabinet.name + '」已停用，不能对照'); picked.cell = null; renderAll(); return; }
      picked.cell = f;
      renderAll();
      document.getElementById('btnBind').focus();
    });
    document.getElementById('btnClear').addEventListener('click', function () {
      picked = { drug: null, idcode: '', cell: null }; renderAll();
    });
    document.getElementById('btnBind').addEventListener('click', function () {
      if (!picked.drug || !picked.cell) return;
      var cellCode = picked.cell.cell.code, drug = picked.drug;
      var doBind = function () {
        var err = F.bindDrug(S, cellCode, drug);
        if (err) { window.showToast(err); return; }
        save();
        picked = { drug: null, idcode: '', cell: null };
        renderAll();
        window.showToast('取药槽 ' + cellCode + ' 已对照药品「' + drug.drugName + '」');
      };
      if (picked.cell.cell.drugCode && picked.cell.cell.drugCode !== drug.drugCode) {
        UI.confirm('取药槽 <b>' + esc(cellCode) + '</b> 当前对照药品 <b>' + esc(picked.cell.cell.drugName) + '</b>。<br>绑定后将换绑为 <b>' + esc(drug.drugName) + '</b>，确认继续？', doBind, '确认换绑');
      } else doBind();
    });
    content.querySelectorAll('[data-unbind]').forEach(function (b) {
      b.addEventListener('click', function () {
        var cellCode = b.getAttribute('data-unbind');
        var f = F.findCell(S, cellCode);
        UI.confirm('确认解除取药槽 <b>' + esc(cellCode) + '</b> 与药品 <b>' + esc(f ? f.cell.drugName : '') + '</b> 的对照？', function () {
          var err = F.unbindDrug(S, cellCode);
          if (err) { window.showToast(err); return; }
          save(); renderAll();
          window.showToast('取药槽 ' + cellCode + ' 已解除药品对照');
        }, '确认解绑');
      });
    });
    inpDrug.focus();
  }

  renderAll();
})();
