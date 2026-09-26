/**
 * roles.js — 角色管理（精简版）：角色表 + 新增/编辑弹窗
 * 菜单权限与数据范围-自定义 复用同一套 ptree 树组件（父子联动、半选态）。
 * 2026-09-22 定稿：功能权限 + 数据范围（若依 DataScope 五档）都挂角色，对齐 yudao system_role.data_scope。
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'roles', crumb: ['系统管理', '角色管理'] });
  if (!content) return;

  var roles = JSON.parse(JSON.stringify(window.PUL.ROLES));
  var perms = JSON.parse(JSON.stringify(window.PUL.PERM_MAP));
  var selected = 'SYS_ADMIN';
  var editing = -1;          // 正在编辑的角色下标，-1 = 新增
  var editingPerm = {};      // 弹窗内编辑中的权限副本（初始渲染也需可安全读取）

  function scopeTextOf(r) {
    if (r.dataScope === 'CUSTOM') return '自定义：' + (r.scopeNodes || []).join('、');
    for (var i = 0; i < window.PUL.DATA_SCOPES.length; i++) {
      if (window.PUL.DATA_SCOPES[i].code === r.dataScope) return window.PUL.DATA_SCOPES[i].desc;
    }
    return '-';
  }

  // ===== 左侧角色表（用户数可点击 → 跳用户管理按角色筛选） =====
  function roleTable() {
    var rows = roles.map(function (r, i) {
      var cls = r.code === selected ? ' class="row-active"' : '';
      return '<tr data-role="' + r.code + '"' + cls + '>' +
        '<td><b>' + r.name + '</b>' + (r.builtin ? '' : ' <span class="badge bg-secondary-lt">自定义</span>') + '</td>' +
        '<td style="font-size:12px;">' + scopeTextOf(r) + '</td>' +
        '<td class="text-center"><a href="users.html?role=' + r.code + '" data-user-link title="查看该角色下的用户">' + r.users + '</a></td>' +
        '<td><button class="btn btn-sm btn-outline-primary" data-edit="' + i + '">编辑</button></td></tr>';
    }).join('');
    return '<div class="card">' +
      '<div class="card-header"><div class="card-title">角色列表</div>' +
      '<button class="btn btn-primary btn-sm ms-auto" id="btnAddRole">+ 新增角色</button></div>' +
      '<div class="table-responsive"><table class="table table-vcenter table-hover card-table">' +
      '<thead><tr><th>角色名称</th><th>数据范围</th><th class="text-center">用户数 ↗</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer text-secondary" style="font-size:12px;">内置标准角色不可删除；数据范围采用若依 DataScope 五档模型，挂在角色上，用户按角色继承；点「用户数」可跳到用户管理查看该角色下的人。</div></div>';
  }

  // ===== 右侧只读预览 =====
  function preview() {
    var r = roles.filter(function (x) { return x.code === selected; })[0];
    var granted = perms[r.code] || {};
    function lines(items) {
      return items.map(function (m) {
        var ops = (granted[m.code] || []);
        if (!ops.length) return '';
        return '<div class="pv-line"><span class="pv-menu">' + m.name + '</span>' +
          ops.map(function (o) { return '<span class="badge bg-blue-lt">' + o + '</span>'; }).join(' ') + '</div>';
      }).join('');
    }
    var tree = window.PUL.MENU_TREE.map(function (g) {
      var body = lines(g.items || []);
      (g.subs || []).forEach(function (s) {
        var subLines = lines(s.items);
        if (subLines) body += '<div class="pv-sub">' + s.sub + '</div>' + subLines;
      });
      if (!body) return '';
      return '<div class="perm-group"><div class="perm-group-head">' + g.group + '</div><div class="perm-group-body">' + body + '</div></div>';
    }).join('') || '<div class="text-secondary" style="padding:12px;">该角色暂无菜单权限</div>';
    return '<div class="card">' +
      '<div class="card-header"><div class="card-title">权限预览：' + r.name + '</div></div>' +
      '<div class="card-body" style="max-height:460px;overflow:auto;">' +
      '<div class="mb-3"><span class="text-secondary" style="font-size:12px;">数据范围（若依 DataScope）：</span>' +
      '<div class="mt-1"><span class="badge bg-green-lt" style="font-size:12.5px;">' + scopeTextOf(r) + '</span></div></div>' +
      '<div class="text-secondary mb-2" style="font-size:12px;">菜单权限：</div>' + tree +
      (r.remark ? '<div class="text-secondary mt-2" style="font-size:12px;">备注：' + r.remark + '</div>' : '') +
      '</div>' +
      '<div class="card-footer text-secondary" style="font-size:12px;">该角色下 ' + r.users + ' 名用户；权限修改后所有用户同步更新（4.4.3）。</div></div>';
  }

  // ===== 通用树组件 ptree：菜单权限树与自定义数据范围树复用 =====
  // 结构：.ptree-node > label.ptree-label > input.ptree-check（头）
  //       + 可选 .ptree-kids > 子 .ptree-node / label.ptree-op > input[data-pt-leaf]（叶）
  // 规则：点头 = 全选/清空全部后代叶；点叶 = 自动回算各上级 全选✓/半选-/空☐

  // 菜单权限树（模块 → 可选子组 → 菜单 → 操作按钮）
  function menuBlockHtml(m) {
    var ops = m.ops.map(function (op) {
      var on = editingPerm[m.code] && editingPerm[m.code].indexOf(op) > -1;
      return '<label class="ptree-op"><input type="checkbox" class="ptree-check" data-pt-leaf data-menu-op data-menu="' + m.code + '" value="' + op + '"' + (on ? ' checked' : '') + '> ' + op + '</label>';
    }).join('');
    return '<div class="ptree-node">' +
      '<label class="ptree-label"><input type="checkbox" class="ptree-check"> <b>' + m.name + '</b></label>' +
      '<div class="ptree-kids ptree-ops">' + ops + '</div></div>';
  }
  function menuTreeHtml() {
    return window.PUL.MENU_TREE.map(function (g) {
      var kids = (g.items || []).map(menuBlockHtml).join('');
      kids += (g.subs || []).map(function (s) {
        return '<div class="ptree-node">' +
          '<label class="ptree-label"><input type="checkbox" class="ptree-check"> <b>' + s.sub + '</b></label>' +
          '<div class="ptree-kids">' + s.items.map(menuBlockHtml).join('') + '</div></div>';
      }).join('');
      return '<div class="ptree-node">' +
        '<label class="ptree-label"><input type="checkbox" class="ptree-check"> <b>' + g.group + '</b></label>' +
        '<div class="ptree-kids">' + kids + '</div></div>';
    }).join('');
  }

  // 自定义数据范围树（院区 → 库房/节点），与菜单树同组件
  function scopeTreeHtml(r) {
    var picked = (r && r.scopeNodes) || [];
    return window.PUL.ORG_TREE.children.map(function (yq) {
      var nodes = (yq.children || []).map(function (n) {
        var on = picked.indexOf(n.name) > -1;
        return '<label class="ptree-op"><input type="checkbox" class="ptree-check m-scope" data-pt-leaf value="' + n.name + '"' + (on ? ' checked' : '') + '> ' + n.name + '<span class="text-secondary">（' + n.type + '）</span></label>';
      }).join('');
      return '<div class="ptree-node">' +
        '<label class="ptree-label"><input type="checkbox" class="ptree-check"> <b>' + yq.name + '</b></label>' +
        '<div class="ptree-kids ptree-ops">' + nodes + '</div></div>';
    }).join('');
  }

  // 父子联动：任一勾选变化 → ① 头的变化级联全部后代叶 ② 所有头按后代叶回算 全选/半选/空
  function bindPtree(root) {
    function leavesOf(node) {
      return node.querySelectorAll(':scope > .ptree-kids [data-pt-leaf], :scope > .ptree-kids .ptree-node [data-pt-leaf]');
    }
    function recompute() {
      root.querySelectorAll('.ptree-node').forEach(function (node) {
        var head = node.querySelector(':scope > .ptree-label > .ptree-check');
        if (!head) return;
        var leaves = leavesOf(node);
        if (!leaves.length) return;
        var checked = 0;
        leaves.forEach(function (l) { if (l.checked) checked++; });
        head.checked = checked === leaves.length;
        head.indeterminate = checked > 0 && checked < leaves.length;
      });
    }
    root.querySelectorAll('.ptree-node > .ptree-label > .ptree-check').forEach(function (head) {
      head.addEventListener('change', function () {
        var node = head.closest('.ptree-node');
        leavesOf(node).forEach(function (l) { l.checked = head.checked; l.indeterminate = false; });
        recompute();
      });
    });
    root.querySelectorAll('[data-pt-leaf]').forEach(function (leaf) {
      leaf.addEventListener('change', recompute);
    });
    recompute(); // 打开时按已勾选叶回算头状态
  }

  function modalHtml(r) {
    var isEdit = !!r;
    r = r || { name: '', dataScope: 'SELF', scopeNodes: [], remark: '' };
    var scopeRadios = window.PUL.DATA_SCOPES.map(function (s) {
      return '<label class="scope-radio"><input type="radio" name="mScope" value="' + s.code + '"' + (r.dataScope === s.code ? ' checked' : '') + '>' +
        '<span><b>' + s.name + '</b><i>' + s.desc + '</i></span></label>';
    }).join('');
    return '<div class="app-modal-overlay" id="roleModal" style="display:none;">' +
      '<div class="app-modal app-modal-wide"><div class="app-modal-head"><b>' + (isEdit ? '角色修改：' + r.name : '新增角色') + '</b>' +
      '<span class="app-modal-close" id="mClose">×</span></div>' +
      '<div class="app-modal-body">' +
      '<div class="row g-3 mb-3"><div class="col-4"><label class="form-label">角色名 *</label><input class="form-control" id="mName" value="' + r.name + '"></div>' +
      '<div class="col-8"><label class="form-label">备注</label><input class="form-control" id="mRemark" value="' + (r.remark || '') + '"></div></div>' +
      '<div class="role-cols">' +
        '<div class="role-col"><label class="form-label">菜单权限<span class="form-hint">能进哪些菜单、点哪些按钮；勾上级自动带全下级</span></label>' +
        '<div class="ptree" id="menuTree">' + menuTreeHtml() + '</div></div>' +
        '<div class="role-col"><label class="form-label">数据范围（若依 DataScope）<span class="form-hint">能看哪些院区的数据</span></label>' +
        '<div class="scope-radio-group">' + scopeRadios + '</div>' +
        '<div id="mScopeTree" style="display:' + (r.dataScope === 'CUSTOM' ? 'block' : 'none') + ';">' +
        '<div class="ptree mt-2" id="scopeTree">' + scopeTreeHtml(isEdit ? r : null) + '</div>' +
        '<div class="text-secondary mt-1" style="font-size:11.5px;">自定义：勾「院区」带全其下库房，也可只勾单个库房</div></div></div>' +
      '</div>' +
      '</div><div class="app-modal-foot">' +
      '<button class="btn btn-outline-secondary" id="mCancel">取消</button>' +
      '<button class="btn btn-primary" id="mSave">保存</button></div></div></div>';
  }

  function renderAll() {
    content.innerHTML = '<div class="row row-cards">' +
      '<div class="col-lg-7">' + roleTable() + '</div>' +
      '<div class="col-lg-5">' + preview() + '</div></div>' +
      modalHtml(editing >= 0 ? roles[editing] : null);
    bind();
  }

  function openModal(idx) {
    editing = idx;
    editingPerm = idx >= 0 ? JSON.parse(JSON.stringify(perms[roles[idx].code] || {})) : {};
    renderAll();
    document.getElementById('roleModal').style.display = 'flex';
    bindPtree(document.getElementById('menuTree'));
    bindPtree(document.getElementById('scopeTree'));
    // 数据范围：选「自定义」才展开组织树
    document.getElementById('roleModal').querySelectorAll('input[name=mScope]').forEach(function (r) {
      r.addEventListener('change', function () {
        document.getElementById('mScopeTree').style.display = r.value === 'CUSTOM' && r.checked ? 'block' : 'none';
      });
    });
  }
  function closeModal() { var m = document.getElementById('roleModal'); if (m) m.style.display = 'none'; }

  function bind() {
    content.querySelectorAll('tr[data-role]').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target.closest('[data-edit]') || e.target.closest('[data-user-link]')) return;
        selected = tr.getAttribute('data-role'); renderAll();
      });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openModal(+b.getAttribute('data-edit')); });
    });
    document.getElementById('btnAddRole').addEventListener('click', function () { openModal(-1); });
    var modal = document.getElementById('roleModal');
    document.getElementById('mClose').addEventListener('click', closeModal);
    document.getElementById('mCancel').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.getElementById('mSave').addEventListener('click', function () {
      var name = document.getElementById('mName').value.trim();
      if (!name) { window.showToast('角色名为必填项'); return; }
      // 菜单权限：从树上已勾选的操作叶收集
      var grant = {};
      modal.querySelectorAll('[data-menu-op]:checked').forEach(function (c) {
        var code = c.getAttribute('data-menu');
        (grant[code] = grant[code] || []).push(c.value);
      });
      var scope = modal.querySelector('input[name=mScope]:checked').value;
      var scopeNodes = Array.prototype.map.call(modal.querySelectorAll('.m-scope:checked'), function (c) { return c.value; });
      if (scope === 'CUSTOM' && !scopeNodes.length) { window.showToast('自定义数据权限请至少勾选 1 个库房/节点'); return; }
      var rec = { name: name, remark: document.getElementById('mRemark').value.trim(),
        dataScope: scope, scopeNodes: scope === 'CUSTOM' ? scopeNodes : [] };
      if (editing >= 0) {
        roles[editing] = Object.assign(roles[editing], rec);
        perms[roles[editing].code] = grant;
        window.showToast('已保存「' + name + '」，' + roles[editing].users + ' 名用户权限同步更新（4.4.3）');
      } else {
        var code = 'ROLE_' + Date.now().toString(36).toUpperCase();
        roles.push(Object.assign({ code: code, users: 0, builtin: false, duty: '自定义角色' }, rec));
        perms[code] = grant;
        window.showToast('已新增角色「' + name + '」');
      }
      renderAll();
    });
  }

  renderAll();
})();
