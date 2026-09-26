/**
 * warehouse.js — 库房库位字典（主子表）：库房挂院区，一院区多库房，一库房多库位
 * 主表：库房（编码/名称/类型/所属院区/状态）；选中行 → 库位子表（可新增/启停）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'wh', crumb: ['组织管理', '库房库位'] });
  if (!content) return;

  var F = window.PUL_FACILITY, UI = window.PchUI, esc = UI.esc;
  var S = F.load();
  var sel = null;
  var filters = { org: '全部', kw: '', status: '全部' };

  function save() { F.save(S); }
  function selWh() {
    for (var i = 0; i < S.warehouses.length; i++) if (S.warehouses[i].code === sel) return S.warehouses[i];
    return null;
  }
  function filtered() {
    return S.warehouses.filter(function (w) {
      if (filters.org !== '全部' && w.org !== filters.org) return false;
      if (filters.kw && (w.name + w.code).indexOf(filters.kw) === -1) return false;
      if (filters.status !== '全部' && w.status !== filters.status) return false;
      return true;
    });
  }

  function filterBar() {
    var orgOpts = ['全部'].concat(window.PUL.ORG_TREE.children.map(function (y) { return y.name; }))
      .map(function (o) { return '<option' + (filters.org === o ? ' selected' : '') + '>' + o + '</option>'; }).join('');
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fOrg" style="width:130px;">' + orgOpts + '</select>' +
      '<input class="form-control" id="fKw" style="width:170px;" placeholder="库房名称 / 编码" value="' + esc(filters.kw) + '">' +
      '<select class="form-select" id="fStatus" style="width:100px;">' + ['全部', '启用', '停用'].map(function (o) { return '<option' + (filters.status === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增库房</button></div>' +
      '</div></div></div>';
  }

  function mainTable() {
    var list = filtered();
    var rows = list.map(function (w, i) {
      var off = w.status !== '启用';
      return '<tr class="pch-doc-row' + (w.code === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(w.code) + '"' + (off ? ' style="opacity:.55;"' : '') + '>' +
        '<td>' + (i + 1) + '</td><td style="font-family:Consolas,monospace;">' + esc(w.code) + '</td>' +
        '<td><b>' + esc(w.name) + '</b></td><td>' + esc(w.type) + '</td>' +
        '<td><span class="badge bg-azure-lt">' + esc(w.org) + '</span></td>' +
        '<td class="text-center">' + w.locations.length + '</td>' +
        '<td><span class="badge ' + (off ? 'bg-secondary-lt' : 'bg-green-lt') + '">' + w.status + '</span></td>' +
        '<td onclick="event.stopPropagation()"><div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-edit="' + esc(w.code) + '">编辑</button>' +
          '<button class="btn btn-sm ' + (off ? 'btn-outline-success' : 'btn-outline-warning') + '" data-toggle="' + esc(w.code) + '">' + (off ? '启用' : '停用') + '</button>' +
        '</div></td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="8" class="text-center text-secondary" style="padding:32px;">无匹配库房</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter table-hover card-table">' +
      '<thead><tr><th>序号</th><th>库房编码</th><th>库房名称</th><th>库房类型</th><th>所属院区</th><th class="text-center">库位数</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer text-secondary" style="font-size:12.5px;">共 ' + list.length + ' 个库房 · 库房必须指定所属院区，一个院区可有多个库房 · 点行查看库位子表</div></div>';
  }

  function subCard() {
    var w = selWh();
    var body;
    if (!w) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点击库房行，查看其库位子表</div>';
    } else {
      var rows = w.locations.map(function (l, i) {
        var off = l.status !== '启用';
        return '<tr' + (off ? ' style="opacity:.55;"' : '') + '><td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;"><b>' + esc(l.code) + '</b></td>' +
          '<td>' + esc(l.name) + '</td>' +
          '<td><span class="badge ' + (off ? 'bg-secondary-lt' : 'bg-green-lt') + '">' + l.status + '</span></td>' +
          '<td><button class="btn btn-sm ' + (off ? 'btn-outline-success' : 'btn-outline-warning') + '" data-loc-toggle="' + esc(l.code) + '">' + (off ? '启用' : '停用') + '</button></td></tr>';
      }).join('');
      if (!w.locations.length) rows = '<tr><td colspan="5" class="text-center text-secondary" style="padding:24px;">该库房暂无库位——点右上「新增库位」</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>库位编码</th><th>库位名称</th><th>状态</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>库位子表</b>' +
      (w ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(w.name) + '（' + esc(w.org) + '）</span>' : '') +
      (w ? '<div class="ms-auto"><button class="btn btn-sm btn-outline-primary" id="btnAddLoc">+ 新增库位</button></div>' : '') +
      '</div>' + body + '</div>';
  }

  function openEdit(code) {
    var w = code ? selWhByCode(code) : null;
    var orgOpts = window.PUL.ORG_TREE.children.map(function (y) {
      return '<option' + (w && w.org === y.name ? ' selected' : '') + '>' + y.name + '</option>';
    }).join('');
    UI.modalShell('whEdit', w ? '编辑库房 · ' + w.name : '新增库房',
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">库房名称</label><input class="form-control" id="weName" value="' + esc(w ? w.name : '') + '" placeholder="如 西药库"></div>' +
      '<div class="col-6"><label class="form-label">库房类型</label><select class="form-select" id="weType">' +
        ['常温库', '阴凉库', '冷藏库', '麻精专库'].map(function (o) { return '<option' + (w && w.type === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="mb-2"><label class="form-label required">所属院区</label><select class="form-select" id="weOrg">' + orgOpts + '</select></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">库房必须指定所属院区（客户新版字典口径）；停用后该库房在登录选择中不可见，历史数据保留。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="weOk">保存</button>', 520);
    var el = UI.open('whEdit');
    el.querySelector('#weOk').addEventListener('click', function () {
      var name = el.querySelector('#weName').value.trim();
      if (!name) { window.showToast('库房名称为必填项'); return; }
      if (w) { w.name = name; w.type = el.querySelector('#weType').value; w.org = el.querySelector('#weOrg').value; }
      else {
        var t = { code: 'WH' + String(Date.now()).slice(-5), name: name, type: el.querySelector('#weType').value,
          org: el.querySelector('#weOrg').value, status: '启用', locations: [] };
        S.warehouses.push(t); sel = t.code;
      }
      save(); UI.close('whEdit'); renderAll();
      window.showToast('库房「' + name + '」已保存');
    });
  }
  function selWhByCode(code) {
    for (var i = 0; i < S.warehouses.length; i++) if (S.warehouses[i].code === code) return S.warehouses[i];
    return null;
  }

  function openLocEdit() {
    var w = selWh();
    if (!w) return;
    UI.modalShell('locEdit', '新增库位 · ' + w.name,
      '<div class="mb-3"><label class="form-label required">库位编码</label><input class="form-control" id="leCode" placeholder="如 A-09"></div>' +
      '<div class="mb-2"><label class="form-label required">库位名称</label><input class="form-control" id="leName" placeholder="如 A 区 9 位"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">一个库房可有多个库位；库存与单据均按库位落位。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="leOk">保存</button>', 460);
    var el = UI.open('locEdit');
    el.querySelector('#leOk').addEventListener('click', function () {
      var code = el.querySelector('#leCode').value.trim();
      var name = el.querySelector('#leName').value.trim();
      if (!code || !name) { window.showToast('库位编码 / 名称为必填项'); return; }
      if (w.locations.some(function (l) { return l.code === code; })) { window.showToast('库位编码已存在'); return; }
      w.locations.push({ code: code, name: name, status: '启用' });
      save(); UI.close('locEdit'); renderAll();
      window.showToast('库位 ' + code + ' 已新增');
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
        var w = selWhByCode(b.getAttribute('data-toggle'));
        w.status = w.status === '启用' ? '停用' : '启用';
        save(); renderAll();
        window.showToast('库房「' + w.name + '」已' + w.status);
      });
    });
    var al = document.getElementById('btnAddLoc');
    if (al) al.addEventListener('click', openLocEdit);
    content.querySelectorAll('[data-loc-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var w = selWh(); if (!w) return;
        var code = b.getAttribute('data-loc-toggle');
        w.locations.forEach(function (l) { if (l.code === code) l.status = l.status === '启用' ? '停用' : '启用'; });
        save(); renderAll();
      });
    });
  }

  if (S.warehouses.length) sel = S.warehouses[0].code;
  renderAll();
})();
