/**
 * users.js — 用户管理：勾选 + 筛选（查询/重置）+ 分页条 + 新增/编辑弹窗（多选角色 + 所属院区）+ 重置密码 + 禁用/恢复
 * 权限口径（2026-09-22 定稿）：超级用户不指定院区、不可禁用、不参与业务；非超管必须指定唯一所属院区；
 * 功能权限与数据范围均随角色继承，不在用户上单独授权（对齐 yudao：system_role.data_scope + system_user_role）。
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'users', crumb: ['系统管理', '用户管理'] });
  if (!content) return;

  var users = JSON.parse(JSON.stringify(window.PUL.USERS));
  var filters = { org: '全部', role: '全部', status: '全部', kw: '' };
  // 支持从角色管理页「用户数」跳转带入角色筛选：users.html?role=KEEPER
  var qs = new URLSearchParams(location.search);
  if (qs.get('role')) filters.role = qs.get('role');
  var editing = null;
  var page = 1, pageSize = 10;
  var checked = {}; // account → true

  var ORGS = ['全部', '中心院区', '东院区', '滨海院区'];

  function filtered() {
    return users.filter(function (u) {
      if (filters.org !== '全部' && (u.org || '（不指定院区）') !== filters.org) return false;
      if (filters.role !== '全部' && u.roles.indexOf(filters.role) === -1) return false;
      if (filters.status !== '全部' && u.status !== filters.status) return false;
      if (filters.kw && (u.account + u.name + (u.hisNo || '')).toLowerCase().indexOf(filters.kw.toLowerCase()) === -1) return false;
      return true;
    });
  }
  function roleBadges(u) {
    return u.roles.map(function (rc) {
      var r = window.PUL.findRole(rc);
      return '<span class="badge bg-azure-lt" style="margin-right:3px;">' + (r ? r.name : rc) + '</span>';
    }).join('');
  }
  function scopeBadges(u) {
    if (u.super) return '<span class="text-secondary" style="font-size:12px;">全部院区 · 全部节点</span>';
    return '<span style="font-size:12px;">' + window.PUL.userScopeText(u) + '</span>';
  }

  function filterBar() {
    var orgOpts = ORGS.map(function (o) { return '<option' + (filters.org === o ? ' selected' : '') + '>' + o + '</option>'; }).join('');
    var roleOpts = ['全部'].concat(window.PUL.ROLES.map(function (r) { return '<option value="' + r.code + '"' + (filters.role === r.code ? ' selected' : '') + '>' + r.name + '</option>'; })).join('');
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fOrg" style="width:120px;">' + orgOpts + '</select>' +
      '<select class="form-select" id="fRole" style="width:150px;">' + roleOpts + '</select>' +
      '<select class="form-select" id="fStatus" style="width:100px;"><option' + (filters.status === '全部' ? ' selected' : '') + '>全部</option><option' + (filters.status === '正常' ? ' selected' : '') + '>正常</option><option' + (filters.status === '禁用' ? ' selected' : '') + '>禁用</option></select>' +
      '<input class="form-control" id="fKw" style="width:170px;" placeholder="账号 / 姓名 / HIS编号" value="' + filters.kw + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto btn-list">' +
      '<button class="btn btn-outline-warning" id="btnResetPwd">重置密码</button>' +
      '<button class="btn btn-primary" id="btnAddUser">+ 新增用户</button>' +
      '</div></div></div></div>';
  }

  function table() {
    var list = filtered();
    var total = list.length;
    var pages = Math.max(1, Math.ceil(total / pageSize));
    if (page > pages) page = pages;
    var slice = list.slice((page - 1) * pageSize, page * pageSize);
    var rows = slice.map(function (u) {
      var i = users.indexOf(u);
      var off = u.status !== '正常';
      return '<tr' + (off ? ' style="opacity:.55;"' : '') + '>' +
        '<td><input type="checkbox" class="form-check-input row-check" data-account="' + u.account + '"' + (checked[u.account] ? ' checked' : '') + '></td>' +
        '<td><b>' + u.account + '</b>' + (u.super ? ' <span class="badge bg-purple-lt">超级用户</span>' : '') + '</td><td>' + u.name + '</td>' +
        '<td class="text-secondary">' + (u.hisNo || '-') + '</td>' +
        '<td>' + (u.super ? '<span class="text-secondary" style="font-size:12px;">不指定院区</span>' : '<span class="badge bg-azure-lt">' + (u.org || '-') + '</span>') + '</td>' +
        '<td>' + roleBadges(u) + '</td>' +
        '<td style="font-size:12px;">' + scopeBadges(u) + '</td>' +
        '<td><span class="badge ' + (off ? 'bg-secondary-lt' : 'bg-green-lt') + '">' + u.status + '</span></td>' +
        '<td class="text-secondary" style="font-size:12px;">' + u.lastLogin + '</td>' +
        '<td><div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-edit="' + i + '">编辑</button>' +
          (u.super
            ? '<button class="btn btn-sm btn-outline-secondary" disabled title="超级用户为内部用户，不可禁用/删除">锁定</button>'
            : '<button class="btn btn-sm ' + (off ? 'btn-outline-success' : 'btn-outline-danger') + '" data-toggle="' + i + '">' + (off ? '恢复' : '禁用') + '</button>') +
        '</div></td></tr>';
    }).join('');
    if (!slice.length) rows = '<tr><td colspan="10" class="text-center text-secondary" style="padding:32px;">无匹配用户，请调整筛选条件</td></tr>';
    var from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    var to = Math.min(total, page * pageSize);
    return '<div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th style="width:36px;"><input type="checkbox" class="form-check-input" id="checkAll"></th>' +
      '<th>用户名</th><th>姓名</th><th>HIS编号</th><th>所属院区</th><th>用户角色</th><th>数据范围（随角色）</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer d-flex align-items-center" style="font-size:12.5px;">' +
      '<span class="text-secondary">显示第 ' + from + ' 到第 ' + to + ' 条记录，总共 ' + total + ' 条记录</span>' +
      '<span class="text-secondary ms-3">每页显示</span>' +
      '<select class="form-select form-select-sm mx-2" id="pageSizeSel" style="width:70px;">' +
        [10, 20, 50].map(function (n) { return '<option' + (pageSize === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select><span class="text-secondary">条</span>' +
      '<div class="btn-list ms-auto">' +
      '<button class="btn btn-sm btn-outline-secondary" id="pgPrev"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>' +
      '<span class="text-secondary" style="padding:0 6px;">' + page + ' / ' + pages + '</span>' +
      '<button class="btn btn-sm btn-outline-secondary" id="pgNext"' + (page >= pages ? ' disabled' : '') + '>下一页</button>' +
      '</div></div></div>';
  }

  // ===== 新增/编辑弹窗 =====
  function modalHtml(u) {
    var isEdit = !!u;
    u = u || { account: '', name: '', hisNo: '', phone: '', email: '', roles: [], org: '中心院区', status: '正常' };
    var roleChecks = window.PUL.ROLES.map(function (r) {
      var on = u.roles.indexOf(r.code) > -1;
      return '<label class="form-check form-check-inline"><input class="form-check-input m-role" type="checkbox" value="' + r.code + '"' + (on ? ' checked' : '') + '><span class="form-check-label">' + r.name + '</span></label>';
    }).join('');
    var orgOpts = ORGS.slice(1).map(function (o) {
      return '<option' + (u.org === o ? ' selected' : '') + '>' + o + '</option>';
    }).join('');
    return '<div class="user-modal-overlay" id="userModal" style="display:none;">' +
      '<div class="user-modal"><div class="user-modal-head"><b>' + (isEdit ? '编辑用户：' + u.name : '新增用户') + '</b>' +
      '<span class="user-modal-close" id="mClose">×</span></div>' +
      '<div class="user-modal-body">' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label">用户名 *</label><input class="form-control" id="mAccount" value="' + u.account + '"' + (isEdit ? ' disabled' : '') + '></div>' +
      '<div class="col-6"><label class="form-label">姓名 *</label><input class="form-control" id="mName" value="' + u.name + '"></div></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label">HIS用户编号</label><input class="form-control" id="mHisNo" value="' + (u.hisNo || '') + '" placeholder="如 HIS0456"></div>' +
      '<div class="col-6"><label class="form-label">手机</label><input class="form-control" id="mPhone" value="' + (u.phone || '') + '"></div></div>' +
      '<div class="mb-3"><label class="form-label">E-mail</label><input class="form-control" id="mEmail" value="' + (u.email || '') + '"></div>' +
      '<div class="mb-3"><label class="form-label">用户角色 *（可多选，决定功能权限）</label>' +
      '<div class="perm-group"><div class="perm-group-body">' + roleChecks + '</div></div></div>' +
      '<div class="mb-3"><label class="form-label">所属院区 *（非超级用户必填，唯一）</label>' +
      '<select class="form-select" id="mOrg">' + orgOpts + '</select>' +
      '<div class="text-secondary" id="mOrgHint" style="font-size:12px;display:none;margin-top:4px;">已勾选「系统管理员」→ 该用户为超级用户，不指定所属院区、不参与业务</div></div>' +
      '<div class="mb-2"><label class="form-label">状态</label>' +
      '<div><label class="form-check form-check-inline"><input class="form-check-input" type="radio" name="mStatus" value="正常"' + (u.status === '正常' ? ' checked' : '') + '><span class="form-check-label">正常</span></label>' +
      '<label class="form-check form-check-inline"><input class="form-check-input" type="radio" name="mStatus" value="禁用"' + (u.status !== '正常' ? ' checked' : '') + '><span class="form-check-label">禁用</span></label></div></div>' +
      '<div class="text-secondary" style="font-size:12px;">新增用户由对应层级管理员创建（4.4.1）；权限变更需上级审批后生效（4.4.2）。</div>' +
      '</div><div class="user-modal-foot">' +
      '<button class="btn btn-outline-secondary" id="mCancel">取消</button>' +
      '<button class="btn btn-primary" id="mSave">保存</button></div></div></div>';
  }

  function renderAll() {
    content.innerHTML = filterBar() + table() + modalHtml(editing !== null ? users[editing] : null);
    bind();
  }

  function openModal(idx) { editing = idx; renderAll(); document.getElementById('userModal').style.display = 'flex'; }
  function closeModal() { var m = document.getElementById('userModal'); if (m) m.style.display = 'none'; }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { org: document.getElementById('fOrg').value, role: document.getElementById('fRole').value,
        status: document.getElementById('fStatus').value, kw: document.getElementById('fKw').value.trim() };
      page = 1; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { org: '全部', role: '全部', status: '全部', kw: '' }; page = 1; renderAll();
    });
    document.getElementById('fKw').addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('btnQuery').click(); });
    document.getElementById('pageSizeSel').addEventListener('change', function (e) { pageSize = +e.target.value; page = 1; renderAll(); });
    document.getElementById('pgPrev').addEventListener('click', function () { if (page > 1) { page--; renderAll(); } });
    document.getElementById('pgNext').addEventListener('click', function () { page++; renderAll(); });
    document.getElementById('checkAll').addEventListener('change', function (e) {
      filtered().forEach(function (u) { checked[u.account] = e.target.checked; });
      renderAll();
    });
    content.querySelectorAll('.row-check').forEach(function (c) {
      c.addEventListener('change', function () { checked[c.getAttribute('data-account')] = c.checked; });
    });
    document.getElementById('btnResetPwd').addEventListener('click', function () {
      var picked = Object.keys(checked).filter(function (k) { return checked[k]; });
      if (!picked.length) { window.showToast('请先勾选要重置密码的用户'); return; }
      window.showToast('已为 ' + picked.length + ' 个账号重置密码，新密码已短信通知');
      checked = {}; renderAll();
    });
    document.getElementById('btnAddUser').addEventListener('click', function () { openModal(null); });
    content.querySelectorAll('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { openModal(+b.getAttribute('data-edit')); }); });
    content.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var u = users[+b.getAttribute('data-toggle')];
        u.status = u.status === '正常' ? '禁用' : '正常';
        window.showToast(u.status === '禁用' ? '已禁用「' + u.name + '」，该账号将无法登录（4.4.4）' : '已恢复「' + u.name + '」');
        renderAll();
      });
    });
    // 弹窗
    var modal = document.getElementById('userModal');
    document.getElementById('mClose').addEventListener('click', closeModal);
    document.getElementById('mCancel').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    // 勾选「系统管理员」= 超级用户：院区禁用
    function syncSuperUI() {
      var isSuper = !!modal.querySelector('.m-role[value="SYS_ADMIN"]:checked');
      document.getElementById('mOrg').disabled = isSuper;
      document.getElementById('mOrgHint').style.display = isSuper ? 'block' : 'none';
    }
    modal.querySelectorAll('.m-role').forEach(function (c) { c.addEventListener('change', syncSuperUI); });
    syncSuperUI();
    document.getElementById('mSave').addEventListener('click', function () {
      var account = document.getElementById('mAccount').value.trim();
      var name = document.getElementById('mName').value.trim();
      var roleCodes = Array.prototype.map.call(modal.querySelectorAll('.m-role:checked'), function (c) { return c.value; });
      if (!account || !name) { window.showToast('用户名与姓名为必填项'); return; }
      if (!roleCodes.length) { window.showToast('请至少勾选 1 个角色'); return; }
      if (editing === null && users.some(function (x) { return x.account === account; })) { window.showToast('用户名已存在'); return; }
      var isSuper = roleCodes.indexOf('SYS_ADMIN') > -1;
      var org = document.getElementById('mOrg').value;
      var rec = { account: account, name: name, hisNo: document.getElementById('mHisNo').value.trim(),
        phone: document.getElementById('mPhone').value.trim(), email: document.getElementById('mEmail').value.trim(),
        roles: roleCodes, super: isSuper, org: isSuper ? null : org,
        status: modal.querySelector('input[name=mStatus]:checked').value };
      if (editing === null) {
        users.push(Object.assign({ lastLogin: '—' }, rec));
        window.showToast('已创建账号「' + account + '」（4.4.1），初始密码已短信通知');
      } else {
        users[editing] = Object.assign(users[editing], rec);
        window.showToast('已保存，权限变更提交上级审批后生效（4.4.2）');
      }
      renderAll();
    });
  }

  renderAll();
})();
