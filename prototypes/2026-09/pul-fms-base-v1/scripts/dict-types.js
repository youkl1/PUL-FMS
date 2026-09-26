/**
 * dict-types.js — 字典分类列表：分类表格 + 新增/编辑分类弹窗
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'dict', crumb: ['基础管理', '基础字典', '字典分类'] });
  if (!content) return;

  var types = JSON.parse(JSON.stringify(window.PUL.DICT_TYPES));
  var items = JSON.parse(JSON.stringify(window.PUL.DICT_ITEMS));
  var editing = -1;

  function countOf(code) { return (items[code] || []).length; }

  function table() {
    var rows = types.map(function (t, i) {
      return '<tr>' +
        '<td><code>' + t.code + '</code></td>' +
        '<td><b>' + t.name + '</b></td>' +
        '<td><span class="badge ' + (t.level === '全局' ? 'bg-blue-lt' : 'bg-green-lt') + '">' + t.level + '</span></td>' +
        '<td class="text-secondary">' + t.usage + '</td>' +
        '<td class="text-center">' + countOf(t.code) + '</td>' +
        '<td><span class="badge ' + (t.status === '启用' ? 'bg-green-lt' : 'bg-secondary-lt') + '">' + t.status + '</span></td>' +
        '<td><div class="btn-list">' +
          '<a class="btn btn-sm btn-primary" href="dict-items.html?type=' + t.code + '">维护字典项</a>' +
          '<button class="btn btn-sm btn-outline-primary" data-edit="' + i + '">编辑</button>' +
        '</div></td></tr>';
    }).join('');
    return '<div class="card"><div class="card-header"><div class="card-title">字典分类（10 类核心字典）</div>' +
      '<button class="btn btn-primary btn-sm ms-auto" id="btnAddType">+ 新增分类</button></div>' +
      '<div class="table-responsive"><table class="table table-vcenter table-hover card-table">' +
      '<thead><tr><th>分类编码</th><th>分类名称</th><th>管控级别</th><th>用途</th><th class="text-center">字典项数</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer text-secondary" style="font-size:12px;">全局字典：总院统一维护、全院区共用；院区级字典：仅本院区生效，不可覆盖全局字典（5.1）。</div></div>';
  }

  function modalHtml(t) {
    var isEdit = !!t;
    t = t || { code: '', name: '', level: '全局', usage: '' };
    return '<div class="app-modal-overlay" id="typeModal" style="display:none;">' +
      '<div class="app-modal"><div class="app-modal-head"><b>' + (isEdit ? '编辑字典分类' : '新增字典分类') + '</b>' +
      '<span class="app-modal-close" id="mClose">×</span></div>' +
      '<div class="app-modal-body">' +
      '<div class="mb-3"><label class="form-label">分类编码 *（全局唯一，保存后不可修改 5.3.2）</label>' +
      '<input class="form-control" id="mCode" value="' + t.code + '"' + (isEdit ? ' disabled' : '') + ' placeholder="如 DRUG_CAT"></div>' +
      '<div class="mb-3"><label class="form-label">分类名称 *</label><input class="form-control" id="mName" value="' + t.name + '" placeholder="如 药品分类字典"></div>' +
      '<div class="mb-3"><label class="form-label">管控级别 *</label><select class="form-select" id="mLevel">' +
      '<option' + (t.level === '全局' ? ' selected' : '') + '>全局</option><option' + (t.level === '院区级' ? ' selected' : '') + '>院区级</option></select></div>' +
      '<div class="mb-2"><label class="form-label">用途说明</label><input class="form-control" id="mUsage" value="' + t.usage + '" placeholder="该字典用于什么业务"></div>' +
      '</div><div class="app-modal-foot">' +
      '<button class="btn btn-outline-secondary" id="mCancel">取消</button>' +
      '<button class="btn btn-primary" id="mSave">保存</button></div></div></div>';
  }

  function renderAll() {
    content.innerHTML =
      '<div class="alert alert-info" style="font-size:12.5px;">字典变更不影响历史业务数据，历史数据保留变更前的字典值（5.4.3）；全局字典保存后立即全系统生效。</div>' +
      table() + modalHtml(editing >= 0 ? types[editing] : null);
    bind();
  }

  function openModal(idx) { editing = idx; renderAll(); document.getElementById('typeModal').style.display = 'flex'; }
  function closeModal() { var m = document.getElementById('typeModal'); if (m) m.style.display = 'none'; }

  function bind() {
    document.getElementById('btnAddType').addEventListener('click', function () { openModal(-1); });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openModal(+b.getAttribute('data-edit')); });
    });
    var modal = document.getElementById('typeModal');
    document.getElementById('mClose').addEventListener('click', closeModal);
    document.getElementById('mCancel').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.getElementById('mSave').addEventListener('click', function () {
      var code = document.getElementById('mCode').value.trim().toUpperCase();
      var name = document.getElementById('mName').value.trim();
      if (!code || !name) { window.showToast('编码与名称为必填项'); return; }
      if (editing < 0 && types.some(function (x) { return x.code === code; })) { window.showToast('编码「' + code + '」已存在，编码需全局唯一（5.3.1）'); return; }
      var rec = { code: code, name: name, level: document.getElementById('mLevel').value, usage: document.getElementById('mUsage').value.trim(), status: '启用' };
      if (editing < 0) { types.push(rec); items[code] = []; window.showToast('已新增分类「' + name + '」，立即生效（5.4）'); }
      else { types[editing] = Object.assign(types[editing], rec); window.showToast('已保存分类「' + name + '」'); }
      renderAll();
    });
  }

  renderAll();
})();
