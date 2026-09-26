/**
 * pharmacy.js — 药房货位字典（主子表）：药房挂院区，一院区多药房，一药房多货位
 * 主表：药房（编码/名称/类型/所属院区/状态）；选中行 → 货位子表（可新增/启停）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'phloc', crumb: ['组织管理', '药房货位'] });
  if (!content) return;

  var F = window.PUL_FACILITY, UI = window.PchUI, esc = UI.esc;
  var S = F.load();
  var sel = null;
  var filters = { org: '全部', kw: '', status: '全部' };

  function save() { F.save(S); }
  function byCode(code) {
    for (var i = 0; i < S.pharmacies.length; i++) if (S.pharmacies[i].code === code) return S.pharmacies[i];
    return null;
  }
  function selPh() { return byCode(sel); }
  function filtered() {
    return S.pharmacies.filter(function (p) {
      if (filters.org !== '全部' && p.org !== filters.org) return false;
      if (filters.kw && (p.name + p.code).indexOf(filters.kw) === -1) return false;
      if (filters.status !== '全部' && p.status !== filters.status) return false;
      return true;
    });
  }

  function filterBar() {
    var orgOpts = ['全部'].concat(window.PUL.ORG_TREE.children.map(function (y) { return y.name; }))
      .map(function (o) { return '<option' + (filters.org === o ? ' selected' : '') + '>' + o + '</option>'; }).join('');
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fOrg" style="width:130px;">' + orgOpts + '</select>' +
      '<input class="form-control" id="fKw" style="width:170px;" placeholder="药房名称 / 编码" value="' + esc(filters.kw) + '">' +
      '<select class="form-select" id="fStatus" style="width:100px;">' + ['全部', '启用', '停用'].map(function (o) { return '<option' + (filters.status === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增药房</button></div>' +
      '</div></div></div>';
  }

  function mainTable() {
    var list = filtered();
    var rows = list.map(function (p, i) {
      var off = p.status !== '启用';
      return '<tr class="pch-doc-row' + (p.code === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(p.code) + '"' + (off ? ' style="opacity:.55;"' : '') + '>' +
        '<td>' + (i + 1) + '</td><td style="font-family:Consolas,monospace;">' + esc(p.code) + '</td>' +
        '<td><b>' + esc(p.name) + '</b></td><td>' + esc(p.type) + '</td>' +
        '<td><span class="badge bg-azure-lt">' + esc(p.org) + '</span></td>' +
        '<td class="text-center">' + p.slots.length + '</td>' +
        '<td><span class="badge ' + (off ? 'bg-secondary-lt' : 'bg-green-lt') + '">' + p.status + '</span></td>' +
        '<td onclick="event.stopPropagation()"><div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-edit="' + esc(p.code) + '">编辑</button>' +
          '<button class="btn btn-sm ' + (off ? 'btn-outline-success' : 'btn-outline-warning') + '" data-toggle="' + esc(p.code) + '">' + (off ? '启用' : '停用') + '</button>' +
        '</div></td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="8" class="text-center text-secondary" style="padding:32px;">无匹配药房</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter table-hover card-table">' +
      '<thead><tr><th>序号</th><th>药房编码</th><th>药房名称</th><th>药房类型</th><th>所属院区</th><th class="text-center">货位数</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer text-secondary" style="font-size:12.5px;">共 ' + list.length + ' 个药房 · 药房必须指定所属院区，一个院区可有多个药房 · 点行查看货位子表</div></div>';
  }

  function subCard() {
    var p = selPh();
    var body;
    if (!p) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点击药房行，查看其货位子表</div>';
    } else {
      var rows = p.slots.map(function (s, i) {
        var off = s.status !== '启用';
        return '<tr' + (off ? ' style="opacity:.55;"' : '') + '><td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;"><b>' + esc(s.code) + '</b></td>' +
          '<td>' + esc(s.name) + '</td>' +
          '<td><span class="badge ' + (off ? 'bg-secondary-lt' : 'bg-green-lt') + '">' + s.status + '</span></td>' +
          '<td><button class="btn btn-sm ' + (off ? 'btn-outline-success' : 'btn-outline-warning') + '" data-slot-toggle="' + esc(s.code) + '">' + (off ? '启用' : '停用') + '</button></td></tr>';
      }).join('');
      if (!p.slots.length) rows = '<tr><td colspan="5" class="text-center text-secondary" style="padding:24px;">该药房暂无货位——点右上「新增货位」</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>货位编码</th><th>货位名称</th><th>状态</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>货位子表</b>' +
      (p ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(p.name) + '（' + esc(p.org) + '）</span>' : '') +
      (p ? '<div class="ms-auto"><button class="btn btn-sm btn-outline-primary" id="btnAddSlot">+ 新增货位</button></div>' : '') +
      '</div>' + body + '</div>';
  }

  function openEdit(code) {
    var p = code ? byCode(code) : null;
    var orgOpts = window.PUL.ORG_TREE.children.map(function (y) {
      return '<option' + (p && p.org === y.name ? ' selected' : '') + '>' + y.name + '</option>';
    }).join('');
    UI.modalShell('phEdit', p ? '编辑药房 · ' + p.name : '新增药房',
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">药房名称</label><input class="form-control" id="peName" value="' + esc(p ? p.name : '') + '" placeholder="如 中药房"></div>' +
      '<div class="col-6"><label class="form-label">药房类型</label><select class="form-select" id="peType">' +
        ['门诊药房', '住院药房', '急诊药房', '中药房'].map(function (o) { return '<option' + (p && p.type === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="mb-2"><label class="form-label required">所属院区</label><select class="form-select" id="peOrg">' + orgOpts + '</select></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">药房必须指定所属院区（客户新版字典口径）；停用后该药房在登录选择中不可见，历史数据保留。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="peOk">保存</button>', 520);
    var el = UI.open('phEdit');
    el.querySelector('#peOk').addEventListener('click', function () {
      var name = el.querySelector('#peName').value.trim();
      if (!name) { window.showToast('药房名称为必填项'); return; }
      if (p) { p.name = name; p.type = el.querySelector('#peType').value; p.org = el.querySelector('#peOrg').value; }
      else {
        var t = { code: 'PH' + String(Date.now()).slice(-5), name: name, type: el.querySelector('#peType').value,
          org: el.querySelector('#peOrg').value, status: '启用', slots: [] };
        S.pharmacies.push(t); sel = t.code;
      }
      save(); UI.close('phEdit'); renderAll();
      window.showToast('药房「' + name + '」已保存');
    });
  }

  function openSlotEdit() {
    var p = selPh();
    if (!p) return;
    UI.modalShell('slotEdit', '新增货位 · ' + p.name,
      '<div class="mb-3"><label class="form-label required">货位编码</label><input class="form-control" id="seCode" placeholder="如 M-07"></div>' +
      '<div class="mb-2"><label class="form-label required">货位名称</label><input class="form-control" id="seName" placeholder="如 M 区 7 位"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">一个药房可有多个货位；发药与库存均按货位落位。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="seOk">保存</button>', 460);
    var el = UI.open('slotEdit');
    el.querySelector('#seOk').addEventListener('click', function () {
      var code = el.querySelector('#seCode').value.trim();
      var name = el.querySelector('#seName').value.trim();
      if (!code || !name) { window.showToast('货位编码 / 名称为必填项'); return; }
      if (p.slots.some(function (s) { return s.code === code; })) { window.showToast('货位编码已存在'); return; }
      p.slots.push({ code: code, name: name, status: '启用' });
      save(); UI.close('slotEdit'); renderAll();
      window.showToast('货位 ' + code + ' 已新增');
    });
  }

  function renderAll() {
    content.innerHTML = filterBar() + mainTable() + subCard();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { org: document.getElementById('fOrg').value, kw: document.getElementById('fKw').value.trim(), status: document.getElementById('fStatus').value };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { org: '全部', kw: '', status: '全部' }; renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', function () { openEdit(null); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEdit(b.getAttribute('data-edit')); });
    });
    content.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = byCode(b.getAttribute('data-toggle'));
        p.status = p.status === '启用' ? '停用' : '启用';
        save(); renderAll();
        window.showToast('药房「' + p.name + '」已' + p.status);
      });
    });
    var as = document.getElementById('btnAddSlot');
    if (as) as.addEventListener('click', openSlotEdit);
    content.querySelectorAll('[data-slot-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = selPh(); if (!p) return;
        var code = b.getAttribute('data-slot-toggle');
        p.slots.forEach(function (s) { if (s.code === code) s.status = s.status === '启用' ? '停用' : '启用'; });
        save(); renderAll();
      });
    });
  }

  if (S.pharmacies.length) sel = S.pharmacies[0].code;
  renderAll();
})();
