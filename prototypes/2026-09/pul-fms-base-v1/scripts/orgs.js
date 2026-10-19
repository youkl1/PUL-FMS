/**
 * orgs.js — 院区字典维护：院区列表 + 新增/编辑弹窗（appSecret 脱敏）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'orgs', crumb: ['基础管理', '院区字典维护'] });
  if (!content) return;

  var orgs = JSON.parse(JSON.stringify(window.PUL.ORGS));
  var editing = -1;

  function mask(s) { return s && s.length > 8 ? s.slice(0, 4) + '…' + s.slice(-4) : s; }
  // 院区 → 下属库房/节点（上下级关系，来自 ORG_TREE 单一事实源）
  function nodesOf(orgName) {
    var yq = window.PUL.ORG_TREE.children.filter(function (x) { return x.name === orgName; })[0];
    return (yq && yq.children) || [];
  }

  function table() {
    var rows = orgs.map(function (o, i) {
      var off = o.status !== '启用';
      var nodes = nodesOf(o.name);
      var nodeHtml = nodes.length
        ? nodes.map(function (n) { return '<span class="badge bg-azure-lt" style="margin-right:3px;">' + n.name + '</span>'; }).join('')
        : '<span class="text-secondary" style="font-size:12px;">未建库房</span>';
      return '<tr' + (off ? ' style="opacity:.55;"' : '') + '>' +
        '<td class="text-center">' + o.seq + '</td>' +
        '<td><code>' + o.orgNo + '</code></td>' +
        '<td><b>' + o.name + '</b></td>' +
        '<td>' + nodeHtml + '</td>' +
        '<td class="text-secondary" style="font-size:12px;">' + mask(o.appKey) + '</td>' +
        '<td class="text-secondary" style="font-size:12px;">' + mask(o.appSecret) + '</td>' +
        '<td><span class="badge ' + (off ? 'bg-secondary-lt' : 'bg-green-lt') + '">' + o.status + '</span></td>' +
        '<td><div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-edit="' + i + '">编辑</button>' +
          '<button class="btn btn-sm ' + (off ? 'btn-outline-success' : 'btn-outline-warning') + '" data-toggle="' + i + '">' + (off ? '启用' : '暂停') + '</button>' +
        '</div></td></tr>';
    }).join('');
    return '<div class="card"><div class="card-header"><div class="card-title">院区列表</div>' +
      '<button class="btn btn-primary btn-sm ms-auto" id="btnAddOrg">+ 新增院区</button></div>' +
      '<div class="table-responsive"><table class="table table-vcenter table-hover card-table">' +
      '<thead><tr><th class="text-center">序号</th><th>机构编号</th><th>院区名称</th><th>下属库房 / 节点（L3）</th><th>供应商平台 appKey</th><th>供应商平台 appSecret</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  function modalHtml(o) {
    var isEdit = !!o;
    o = o || { orgNo: '', name: '', appKey: '', appSecret: '', status: '启用' };
    return '<div class="app-modal-overlay" id="orgModal" style="display:none;">' +
      '<div class="app-modal"><div class="app-modal-head"><b>' + (isEdit ? '编辑院区：' + o.name : '新增院区') + '</b>' +
      '<span class="app-modal-close" id="mClose">×</span></div>' +
      '<div class="app-modal-body">' +
      '<div class="mb-3"><label class="form-label">院区名称 *</label><input class="form-control" id="mName" value="' + o.name + '" placeholder="如 高新院区"></div>' +
      '<div class="mb-3"><label class="form-label">机构编号 *（对接 HIS，保存后不可改）</label><input class="form-control" id="mOrgNo" value="' + o.orgNo + '"' + (isEdit ? ' disabled' : '') + ' placeholder="如 H35042400512"></div>' +
      '<div class="mb-3"><label class="form-label">供应商平台 appKey</label><input class="form-control" id="mAppKey" value="' + o.appKey + '"></div>' +
      '<div class="mb-3"><label class="form-label">供应商平台 appSecret</label><input class="form-control" id="mAppSecret" value="' + o.appSecret + '"></div>' +
      '<div class="mb-2"><label class="form-label">状态</label>' +
      '<div><label class="form-check form-check-inline"><input class="form-check-input" type="radio" name="mStatus" value="启用"' + (o.status === '启用' ? ' checked' : '') + '><span class="form-check-label">启用</span></label>' +
      '<label class="form-check form-check-inline"><input class="form-check-input" type="radio" name="mStatus" value="暂停"' + (o.status !== '启用' ? ' checked' : '') + '><span class="form-check-label">暂停</span></label></div></div>' +
      '</div><div class="app-modal-foot">' +
      '<button class="btn btn-outline-secondary" id="mCancel">取消</button>' +
      '<button class="btn btn-primary" id="mSave">保存</button></div></div></div>';
  }

  function renderAll() {
    content.innerHTML = table() + modalHtml(editing >= 0 ? orgs[editing] : null);
    bind();
  }

  function openModal(idx) { editing = idx; renderAll(); document.getElementById('orgModal').style.display = 'flex'; }
  function closeModal() { var m = document.getElementById('orgModal'); if (m) m.style.display = 'none'; }

  function bind() {
    document.getElementById('btnAddOrg').addEventListener('click', function () { openModal(-1); });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openModal(+b.getAttribute('data-edit')); });
    });
    content.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var o = orgs[+b.getAttribute('data-toggle')];
        o.status = o.status === '启用' ? '暂停' : '启用';
        window.showToast(o.status === '暂停' ? '已暂停「' + o.name + '」，登录页不再可选' : '已启用「' + o.name + '」');
        renderAll();
      });
    });
    var modal = document.getElementById('orgModal');
    document.getElementById('mClose').addEventListener('click', closeModal);
    document.getElementById('mCancel').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.getElementById('mSave').addEventListener('click', function () {
      var name = document.getElementById('mName').value.trim();
      var orgNo = document.getElementById('mOrgNo').value.trim();
      if (!name || !orgNo) { window.showToast('院区名称与机构编号为必填项'); return; }
      if (editing < 0 && orgs.some(function (x) { return x.orgNo === orgNo; })) { window.showToast('机构编号已存在'); return; }
      var rec = { name: name, orgNo: orgNo, appKey: document.getElementById('mAppKey').value.trim(),
        appSecret: document.getElementById('mAppSecret').value.trim(),
        status: modal.querySelector('input[name=mStatus]:checked').value };
      if (editing < 0) { orgs.push(Object.assign({ seq: orgs.length + 1 }, rec)); window.showToast('已新增院区「' + name + '」'); }
      else { orgs[editing] = Object.assign(orgs[editing], rec); window.showToast('已保存「' + name + '」'); }
      renderAll();
    });
  }

  renderAll();
})();
