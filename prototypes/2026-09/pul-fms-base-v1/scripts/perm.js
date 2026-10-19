/**
 * perm.js — 权限管理：左侧菜单资源树（模块→子组→菜单→按钮）+ 右侧子节点表
 * 数据源 = window.PUL.MENU_TREE（与左侧导航、角色权限树同源），演示内存态增编启停。
 * 参考老系统「权限菜单」：左树右表、+ 添加子权限、行级 编辑/禁用。
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'perm', crumb: ['系统管理', '权限管理'] });
  if (!content) return;

  // 模块/子组编码（语义码，对齐老系统资源编码风格）
  var GROUP_CODES = {
    '基础管理': 'BASE', '库房管理': 'WH', '库房管理/采购管理': 'PCH', '库房管理/库房管理': 'WHBIZ',
    '药房管理': 'PH', '出库管理': 'DISP', '盘点管理': 'INV', '台账管理': 'LEDGER', '医保管理': 'MI', '系统管理': 'SYS'
  };
  // 菜单 code → 路由（来自 app-shell NAV；无 href = 待实现）
  var HREF_MAP = {};
  (window.AppShell.NAV || []).forEach(function (entry) {
    function scan(items) { (items || []).forEach(function (it) { HREF_MAP[it.key] = it.href || ''; }); }
    if (entry.type === 'item') scan([entry]); else { scan(entry.items); (entry.subs || []).forEach(function (s) { scan(s.items); }); }
  });

  // ===== 由 MENU_TREE 构建资源树（目录/菜单/按钮 三类，全部默认启用） =====
  function opNode(m, op) {
    return { id: m.code + ':' + op, name: op, type: '按钮', code: m.code + '_' + op.toUpperCase(), route: '', status: '启用', children: [] };
  }
  function menuNode(m) {
    return { id: m.code, name: m.name.replace('（占位）', '').replace('（预留）', ''), type: '菜单', code: m.code,
      route: HREF_MAP[m.code] || '', status: '启用', children: m.ops.map(function (op) { return opNode(m, op); }) };
  }
  function buildTree() {
    return window.PUL.MENU_TREE.map(function (g, gi) {
      var gNode = { id: 'G' + gi, name: g.group, type: '目录', code: GROUP_CODES[g.group] || ('G' + gi), route: '', status: '启用', children: [] };
      (g.items || []).forEach(function (m) { gNode.children.push(menuNode(m)); });
      (g.subs || []).forEach(function (s, si) {
        gNode.children.push({ id: 'G' + gi + 'S' + si, name: s.sub, type: '目录',
          code: GROUP_CODES[g.group + '/' + s.sub] || ('G' + gi + 'S' + si), route: '', status: '启用',
          children: s.items.map(menuNode) });
      });
      return gNode;
    });
  }

  var tree = buildTree();
  var selected = tree[0];          // 默认选中第一个模块
  var kw = '';                     // 树搜索关键字
  var collapsed = {};              // id → true（默认全展开）
  var editing = null;              // 正在编辑的节点（null=新增子节点）

  function findNode(id, nodes) {
    nodes = nodes || tree;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes[i];
      var r = findNode(id, nodes[i].children);
      if (r) return r;
    }
    return null;
  }
  function matchTree(n) { // 搜索：自身或后代命中即显示
    if (!kw) return true;
    if (n.name.toLowerCase().indexOf(kw.toLowerCase()) > -1) return true;
    return n.children.some(matchTree);
  }

  // ===== 左树 =====
  function treeHtml(nodes) {
    return '<ul>' + nodes.filter(matchTree).map(function (n) {
      var hasKids = n.children.length > 0;
      var isCollapsed = kw ? false : !!collapsed[n.id]; // 搜索时强制展开
      return '<li>' +
        '<div class="pnode-row">' +
          '<span class="pnode-toggle" data-toggle="' + n.id + '">' + (hasKids ? (isCollapsed ? '▸' : '▾') : '') + '</span>' +
          '<span class="pnode-name' + (selected && selected.id === n.id ? ' selected' : '') + (n.status !== '启用' ? ' is-off' : '') + '" data-sel="' + n.id + '">' +
            n.name + '<span class="pnode-badge">' + n.type + '</span></span>' +
        '</div>' +
        (hasKids && !isCollapsed ? treeHtml(n.children) : '') +
      '</li>';
    }).join('') + '</ul>';
  }

  function leftCard() {
    return '<div class="card"><div class="card-header"><div class="card-title">菜单资源树</div></div>' +
      '<div class="card-body" style="padding:10px 12px;">' +
      '<input class="form-control mb-2" id="treeKw" placeholder="输入关键字搜索" value="' + kw + '">' +
      '<div class="org-tree perm-tree-box">' + treeHtml(tree) + '</div></div></div>';
  }

  // ===== 右侧子节点表 =====
  function typeBadge(t) {
    var cls = t === '目录' ? 'bg-secondary-lt' : (t === '菜单' ? 'bg-blue-lt' : 'bg-azure-lt');
    return '<span class="badge ' + cls + '">' + t + '</span>';
  }
  function rightCard() {
    var rows = selected.children.map(function (c) {
      var off = c.status !== '启用';
      return '<tr' + (off ? ' class="row-off"' : '') + '>' +
        '<td><code style="font-size:11.5px;">' + c.code + '</code></td>' +
        '<td><b>' + c.name + '</b></td>' +
        '<td>' + typeBadge(c.type) + '</td>' +
        '<td class="text-secondary" style="font-size:12px;">' + (c.route || '—') + '</td>' +
        '<td><span class="badge ' + (off ? 'bg-secondary-lt' : 'bg-green-lt') + '">' + c.status + '</span></td>' +
        '<td><div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-edit="' + c.id + '">编辑</button>' +
          '<button class="btn btn-sm ' + (off ? 'btn-outline-success' : 'btn-outline-danger') + '" data-toggle-st="' + c.id + '">' + (off ? '启用' : '禁用') + '</button>' +
        '</div></td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="6" class="text-center text-secondary" style="padding:28px;">该节点无子节点，可点右上角「+ 新增子节点」</td></tr>';
    return '<div class="card"><div class="card-header">' +
      '<div><div class="card-title">' + selected.name + ' ' + typeBadge(selected.type) + '</div>' +
      '<div class="perm-crumb">编码 <code>' + selected.code + '</code> · 子节点 ' + selected.children.length + ' 个</div></div>' +
      '<button class="btn btn-primary btn-sm ms-auto" id="btnAddChild">+ 新增子节点</button></div>' +
      '<div class="table-responsive"><table class="table table-vcenter table-hover card-table">' +
      '<thead><tr><th>资源编码</th><th>名称</th><th>类型</th><th>路由标识</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  // ===== 新增/编辑弹窗 =====
  function modalHtml() {
    if (!modalOpen) return '';
    var isEdit = !!editing;
    var n = editing || { name: '', code: '', route: '', status: '启用' };
    // 新增时按选中节点类型约束子类型：目录→目录/菜单，菜单→按钮
    var typeOpts = '';
    if (!isEdit) {
      var allowed = selected.type === '目录' ? ['目录', '菜单'] : ['按钮'];
      typeOpts = '<div class="mb-3"><label class="form-label">类型 *</label><select class="form-select" id="mType">' +
        allowed.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select>' +
        '<div class="form-hint" style="margin-left:0;">「' + selected.name + '」是' + selected.type + '，其子节点只能是：' + allowed.join(' / ') + '</div></div>';
    }
    return '<div class="app-modal-overlay" id="permModal" style="display:flex;">' +
      '<div class="app-modal" style="width:440px;"><div class="app-modal-head"><b>' + (isEdit ? '编辑节点：' + n.name : '新增子节点 → ' + selected.name) + '</b>' +
      '<span class="app-modal-close" id="mClose">×</span></div>' +
      '<div class="app-modal-body">' +
      '<div class="mb-3"><label class="form-label">名称 *</label><input class="form-control" id="mName" value="' + n.name + '"></div>' +
      typeOpts +
      '<div class="row g-3 mb-3"><div class="col-6"><label class="form-label">资源编码</label><input class="form-control" id="mCode" value="' + n.code + '"' + (isEdit ? ' disabled' : '') + ' placeholder="留空自动生成"></div>' +
      '<div class="col-6"><label class="form-label">路由标识</label><input class="form-control" id="mRoute" value="' + n.route + '" placeholder="如 xxx.html"></div></div>' +
      '<div class="mb-2"><label class="form-label">状态</label>' +
      '<div><label class="form-check form-check-inline"><input class="form-check-input" type="radio" name="mStatus" value="启用"' + (n.status === '启用' ? ' checked' : '') + '><span class="form-check-label">启用</span></label>' +
      '<label class="form-check form-check-inline"><input class="form-check-input" type="radio" name="mStatus" value="禁用"' + (n.status !== '启用' ? ' checked' : '') + '><span class="form-check-label">禁用</span></label></div></div>' +
      '</div><div class="app-modal-foot">' +
      '<button class="btn btn-outline-secondary" id="mCancel">取消</button>' +
      '<button class="btn btn-primary" id="mSave">保存</button></div></div></div>';
  }

  var modalOpen = false;
  function renderAll() {
    content.innerHTML = '<div class="perm-layout">' +
      '<div>' + leftCard() + '</div>' +
      '<div>' + rightCard() + '</div></div>' + modalHtml();
    bind();
  }

  function bind() {
    content.querySelectorAll('[data-sel]').forEach(function (el) {
      el.addEventListener('click', function () { selected = findNode(el.getAttribute('data-sel')); renderAll(); });
    });
    content.querySelectorAll('[data-toggle]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-toggle');
        collapsed[id] = !collapsed[id]; renderAll();
      });
    });
    document.getElementById('treeKw').addEventListener('input', function (e) { kw = e.target.value.trim(); renderAll(); });
    document.getElementById('btnAddChild').addEventListener('click', function () { editing = null; modalOpen = true; renderAll(); });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { editing = findNode(b.getAttribute('data-edit')); modalOpen = true; renderAll(); });
    });
    content.querySelectorAll('[data-toggle-st]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = findNode(b.getAttribute('data-toggle-st'));
        n.status = n.status === '启用' ? '禁用' : '启用';
        window.showToast('已' + n.status + '「' + n.name + '」：左侧导航与角色权限树同步' + (n.status === '禁用' ? '隐藏/不可勾' : '恢复'));
        renderAll();
      });
    });
    if (modalOpen) {
      var modal = document.getElementById('permModal');
      var close = function () { modalOpen = false; editing = null; renderAll(); };
      document.getElementById('mClose').addEventListener('click', close);
      document.getElementById('mCancel').addEventListener('click', close);
      modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
      document.getElementById('mSave').addEventListener('click', function () {
        var name = document.getElementById('mName').value.trim();
        if (!name) { window.showToast('名称为必填项'); return; }
        var status = modal.querySelector('input[name=mStatus]:checked').value;
        var route = document.getElementById('mRoute').value.trim();
        if (editing) {
          editing.name = name; editing.route = route; editing.status = status;
          window.showToast('已保存「' + name + '」');
        } else {
          var type = document.getElementById('mType').value;
          var code = document.getElementById('mCode').value.trim() || (selected.code + '_' + Date.now().toString(36).toUpperCase());
          selected.children.push({ id: 'N' + Date.now(), name: name, type: type, code: code, route: route, status: status, children: [] });
          window.showToast('已在「' + selected.name + '」下新增' + type + '「' + name + '」');
        }
        modalOpen = false; editing = null; renderAll();
      });
    }
  }

  renderAll();
})();
