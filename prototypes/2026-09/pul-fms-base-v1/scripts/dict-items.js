/**
 * dict-items.js — 字典项维护：左侧分类列表 + 右侧字典项表格 + 新增/编辑弹窗
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'dict', crumb: ['基础管理', '基础字典', '字典项维护'] });
  if (!content) return;

  var types = window.PUL.DICT_TYPES;
  var items = JSON.parse(JSON.stringify(window.PUL.DICT_ITEMS));
  var current = new URLSearchParams(location.search).get('type') || 'DRUG_CAT';
  if (!items[current]) current = 'DRUG_CAT';
  var editing = -1;

  function typeOf(code) {
    for (var i = 0; i < types.length; i++) if (types[i].code === code) return types[i];
    return types[0];
  }

  function typeList() {
    var html = types.map(function (t) {
      var cls = t.code === current ? 'list-group-item list-group-item-action d-flex justify-content-between align-items-center active' : 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
      return '<a class="' + cls + '" data-type="' + t.code + '" style="cursor:pointer;">' +
        '<span>' + t.name.replace('字典', '') + '</span>' +
        '<span class="badge ' + (t.level === '全局' ? 'bg-blue-lt' : 'bg-green-lt') + '">' + (items[t.code] || []).length + '</span></a>';
    }).join('');
    return '<div class="card"><div class="card-header"><div class="card-title">字典分类</div></div>' +
      '<div class="list-group list-group-flush" style="max-height:520px;overflow:auto;">' + html + '</div></div>';
  }

  function itemTable() {
    var t = typeOf(current);
    var list = items[current] || [];
    var rows = list.map(function (it, i) {
      var off = it.status !== '启用';
      var canDelete = !it.refs || it.refs === 0;
      return '<tr' + (off ? ' style="opacity:.55;"' : '') + '>' +
        '<td><code>' + it.code + '</code></td><td><b>' + it.name + '</b></td>' +
        '<td class="text-center">' + it.sort + '</td>' +
        '<td><span class="badge ' + (off ? 'bg-secondary-lt' : 'bg-green-lt') + '">' + it.status + '</span></td>' +
        '<td class="text-center">' + (it.refs || 0) + '</td>' +
        '<td><div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-edit="' + i + '">编辑</button>' +
          '<button class="btn btn-sm ' + (off ? 'btn-outline-success' : 'btn-outline-warning') + '" data-toggle="' + i + '">' + (off ? '启用' : '停用') + '</button>' +
          '<button class="btn btn-sm btn-outline-danger" data-del="' + i + '"' + (canDelete ? '' : ' disabled title="已被业务引用，不可删除，仅可停用（5.3.4）"') + '>删除</button>' +
        '</div></td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="6" class="text-center text-secondary" style="padding:32px;">该分类下暂无字典项，点右上角「新增字典项」创建</td></tr>';
    return '<div class="card"><div class="card-header"><div class="card-title">' + t.name + '</div>' +
      '<span class="badge ' + (t.level === '全局' ? 'bg-blue-lt' : 'bg-green-lt') + ' ms-2">' + t.level + '</span>' +
      '<button class="btn btn-primary btn-sm ms-auto" id="btnAddItem">+ 新增字典项</button></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>编码</th><th>名称</th><th class="text-center">排序</th><th>状态</th><th class="text-center">被引用</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer text-secondary" style="font-size:12px;">编码保存后不可修改（5.3.2）；停用后业务页面不可选择该项、历史数据保留原值（5.3.3）；已被引用的项不可删除仅可停用（5.3.4）。</div></div>';
  }

  function modalHtml(it) {
    var isEdit = !!it;
    it = it || { code: '', name: '', sort: (items[current] || []).length + 1, status: '启用' };
    return '<div class="app-modal-overlay" id="itemModal" style="display:none;">' +
      '<div class="app-modal"><div class="app-modal-head"><b>' + (isEdit ? '编辑字典项' : '新增字典项 · ' + typeOf(current).name) + '</b>' +
      '<span class="app-modal-close" id="mClose">×</span></div>' +
      '<div class="app-modal-body">' +
      '<div class="mb-3"><label class="form-label">字典编码 *（分类内唯一，保存后不可改）</label>' +
      '<input class="form-control" id="mCode" value="' + it.code + '"' + (isEdit ? ' disabled' : '') + ' placeholder="如 PIAN"></div>' +
      '<div class="mb-3"><label class="form-label">字典名称 *</label><input class="form-control" id="mName" value="' + it.name + '" placeholder="如 片"></div>' +
      '<div class="row g-3"><div class="col-6"><label class="form-label">排序号</label><input class="form-control" id="mSort" type="number" value="' + it.sort + '"></div>' +
      '<div class="col-6"><label class="form-label">状态</label><select class="form-select" id="mStatus">' +
      '<option' + (it.status === '启用' ? ' selected' : '') + '>启用</option><option' + (it.status === '停用' ? ' selected' : '') + '>停用</option></select></div></div>' +
      '</div><div class="app-modal-foot">' +
      '<button class="btn btn-outline-secondary" id="mCancel">取消</button>' +
      '<button class="btn btn-primary" id="mSave">保存</button></div></div></div>';
  }

  function renderAll() {
    content.innerHTML = '<div class="row row-cards">' +
      '<div class="col-lg-3">' + typeList() + '</div>' +
      '<div class="col-lg-9">' +
        '<div class="alert alert-info" style="font-size:12.5px;">全局字典保存后立即全系统生效；院区级仅本院区生效（5.4）。</div>' +
        itemTable() + '</div></div>' + modalHtml(editing >= 0 ? (items[current] || [])[editing] : null);
    bind();
  }

  function openModal(idx) { editing = idx; renderAll(); document.getElementById('itemModal').style.display = 'flex'; }
  function closeModal() { var m = document.getElementById('itemModal'); if (m) m.style.display = 'none'; }

  function bind() {
    content.querySelectorAll('[data-type]').forEach(function (a) {
      a.addEventListener('click', function () {
        current = a.getAttribute('data-type'); editing = -1;
        history.replaceState(null, '', 'dict-items.html?type=' + current);
        renderAll();
      });
    });
    document.getElementById('btnAddItem').addEventListener('click', function () { openModal(-1); });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openModal(+b.getAttribute('data-edit')); });
    });
    content.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var it = items[current][+b.getAttribute('data-toggle')];
        it.status = it.status === '启用' ? '停用' : '启用';
        window.showToast(it.status === '停用' ? '已停用「' + it.name + '」，业务页面不再可选（5.3.3）' : '已启用「' + it.name + '」');
        renderAll();
      });
    });
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var it = items[current][+b.getAttribute('data-del')];
        if (it.refs > 0) { window.showToast('「' + it.name + '」已被引用，不可删除（5.3.4）'); return; }
        items[current].splice(+b.getAttribute('data-del'), 1);
        window.showToast('已删除「' + it.name + '」');
        renderAll();
      });
    });
    var modal = document.getElementById('itemModal');
    document.getElementById('mClose').addEventListener('click', closeModal);
    document.getElementById('mCancel').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.getElementById('mSave').addEventListener('click', function () {
      var code = document.getElementById('mCode').value.trim().toUpperCase();
      var name = document.getElementById('mName').value.trim();
      if (!code || !name) { window.showToast('编码与名称为必填项'); return; }
      var list = items[current] || (items[current] = []);
      if (editing < 0 && list.some(function (x) { return x.code === code; })) { window.showToast('编码「' + code + '」已存在（5.3.1 编码唯一）'); return; }
      var rec = { code: code, name: name, sort: +document.getElementById('mSort').value || 99, status: document.getElementById('mStatus').value, refs: 0 };
      if (editing < 0) { list.push(rec); window.showToast('已新增「' + name + '」'); }
      else { list[editing] = Object.assign(list[editing], rec); window.showToast('已保存「' + name + '」'); }
      list.sort(function (a, b) { return a.sort - b.sort; });
      renderAll();
    });
  }

  renderAll();
})();
