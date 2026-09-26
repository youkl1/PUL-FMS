/**
 * app-shell.js — PUL-FMS 后台壳：侧边导航 + 顶栏（院区/库房上下文 + 部门切换）
 * 用法：var content = AppShell.render('desktopPreview', { active:'roles', crumb:['系统管理','角色管理'] });
 */
(function () {
  'use strict';

  // 全局 toast（骨架此前只定义了 .toast 样式，函数缺失——所有页面都在调用）
  window.showToast = window.showToast || function (msg) {
    var t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast'; t.id = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('active');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('active'); }, 2600);
  };

  function icon(name, size) {
    var s = size || 18;
    var paths = {
      dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
      pills: '<path d="M4.5 12.5l8-8a4.95 4.95 0 1 1 7 7l-8 8a4.95 4.95 0 1 1 -7-7z"/><path d="M8.5 8.5l7 7"/>',
      box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5"/><path d="M12 12v9"/><path d="M12 12L4 7.5"/>',
      cart: '<circle cx="9" cy="19" r="2"/><circle cx="17" cy="19" r="2"/><path d="M3 3h2l2.6 12.4a1 1 0 0 0 1 .6h8.8a1 1 0 0 0 1-.8L20 7H6"/>',
      warehouse: '<path d="M3 21V9l9-6 9 6v12"/><path d="M7 21v-8h10v8"/><path d="M7 17h10"/>',
      rx: '<path d="M9 3h6v4h4v6h-4v4H9v-4H5V7h4V3z"/>',
      users: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M17.5 14.5c2.1.7 3.5 2.6 3.5 5.5"/>',
      key: '<circle cx="8" cy="15" r="4.5"/><path d="M11 12L20 3"/><path d="M16 7l3 3"/>',
      book: '<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 0 2 2h13"/>',
      chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
      building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-4h6v4"/><path d="M8 7h2M8 11h2M14 7h2M14 11h2M8 15h2M14 15h2"/>',
      swap: '<path d="M17 3l4 4-4 4"/><path d="M21 7H8"/><path d="M7 21l-4-4 4-4"/><path d="M3 17h13"/>',
      scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
      truck: '<path d="M1 5h13v11H1z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="6" cy="18.5" r="1.8"/><circle cx="17" cy="18.5" r="1.8"/>',
      clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/><path d="M9 11h6M9 15h6"/>',
      shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
      bulb: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
      logout: '<path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M9 12h11"/><path d="M17 9l3 3-3 3"/>',
      chevron: '<path d="M6 9l6 6 6-6"/>'
    };
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.dashboard) + '</svg>';
  }

  // 导航定义：href 为空 = 待实现；badge 可覆盖默认徽标文案（占位/预留）
  // 结构口径：2026-09 功能清单（10 模块）；2026-09-21 客户新版字典补齐：库房库位/药房货位/取药柜/基站灯组已落地
  // 2026-09-22 收拢：新增「组织管理」组承载 L2 院区 + L3 库房/药房（对齐 ER 图组织架构板块）；
  // 取药柜/基站灯组为设备字典，仍留基础管理；院区管理自系统管理迁入。
  var NAV = [
    { type: 'item', key: 'index', name: '工作台', icon: 'dashboard', href: 'index.html' },
    { type: 'group', name: '组织管理', items: [
      { key: 'orgs', name: '院区管理', icon: 'building', href: 'orgs.html' },
      { key: 'wh', name: '库房库位', icon: 'warehouse', href: 'warehouse.html' },
      { key: 'phloc', name: '药房货位', icon: 'box', href: 'pharmacy.html' }
    ]},
    { type: 'group', name: '基础管理', items: [
      { key: 'dict', name: '基础字典', icon: 'book', href: 'dict-types.html' },
      { key: 'drug', name: '药品字典', icon: 'pills', href: 'drug.html' },
      { key: 'idcode', name: '标识码字典', icon: 'scan', href: 'idcode.html' },
      { key: 'cabinet', name: '取药柜', icon: 'box', href: 'cabinet.html' },
      { key: 'lamp', name: '基站灯组', icon: 'bulb', href: 'light.html' }
    ]},
    { type: 'group', name: '库房管理', subs: [
      { name: '采购管理', items: [
        { key: 'arrive', name: '采购到货', icon: 'truck', href: 'purchase-arrive.html' },
        { key: 'pin', name: '采购入库', icon: 'box', href: 'purchase-in.html' },
        { key: 'pout', name: '采购退货', icon: 'swap', href: 'purchase-out.html' },
        { key: 'pdone', name: '已完成单', icon: 'clipboard', href: 'purchase-done.html' },
        { key: 'badcode', name: '异常标识码', icon: 'scan', href: 'bad-codes.html' },
        { key: 'pquery', name: '采购明细查询', icon: 'search', href: 'purchase-detail.html' },
        { key: 'pOutQ', name: '退货明细查询', icon: 'search', href: null, badge: '待补' }
      ]},
      { name: '库房业务', items: [
        { key: 'whstock', name: '库房库存', icon: 'chart', href: 'wh-stock.html' },
        { key: 'pick', name: '领用备货出库', icon: 'box', href: 'wh-pick.html' },
        { key: 'retIn', name: '退回入库', icon: 'swap', href: 'wh-return-in.html' },
        { key: 'othIn', name: '其他入库', icon: 'box', href: 'wh-other-in.html' },
        { key: 'othOut', name: '其他出库', icon: 'box', href: 'wh-other-out.html' },
        { key: 'lossOut', name: '损耗出库单', icon: 'clipboard', href: 'wh-loss-out.html' },
        { key: 'lossQ', name: '损耗明细查询', icon: 'search', href: 'wh-loss-query.html' },
        { key: 'whOutQ', name: '出库明细查询', icon: 'search', href: null, badge: '待补' }
      ]}
    ]},
    { type: 'group', name: '药房管理', items: [
      { key: 'phstock', name: '药房库存', icon: 'chart', href: 'ph-stock.html' },
      { key: 'req', name: '领用申请', icon: 'box', href: 'ph-req.html' },
      { key: 'reqIn', name: '领用入库', icon: 'box', href: 'ph-req-in.html' },
      { key: 'phInQ', name: '入库明细查询', icon: 'search', href: null, badge: '待补' },
      { key: 'retOut', name: '退回出库', icon: 'swap', href: 'ph-ret-out.html' },
      { key: 'shelfQ', name: '待上架查询', icon: 'search', href: 'ph-shelf-q.html' },
      { key: 'shelf', name: '扫码上下架', icon: 'scan', href: 'ph-shelf.html' },
      { key: 'light', name: '补药指示灯', icon: 'bulb', href: null, badge: '占位' },
      { key: 'phloss', name: '药房损耗', icon: 'clipboard', href: 'ph-loss.html' }
    ]},
    { type: 'group', name: '发药管理', items: [
      { key: 'disp', name: '处方发药扫码', icon: 'scan', href: 'disp.html' },
      { key: 'assign', name: '处方赋码', icon: 'rx', href: null },
      { key: 'assignBatch', name: '批量赋码', icon: 'rx', href: null },
      { key: 'assignQ', name: '赋码查询', icon: 'search', href: null, badge: '待补' },
      { key: 'rxItemQ', name: '药品明细查询', icon: 'search', href: null, badge: '待补' },
      { key: 'rxAggQ', name: '汇总查询', icon: 'chart', href: null, badge: '待补' },
      { key: 'rxret', name: '处方退药', icon: 'swap', href: 'rx-ret.html' },
      { key: 'rxRetQ', name: '处方退药查询', icon: 'search', href: null, badge: '待补' },
      { key: 'tray', name: '摆药单业务', icon: 'clipboard', href: 'tray.html' },
      { key: 'trayRet', name: '摆药退药', icon: 'swap', href: null, badge: '待补' },
      { key: 'trayRetQ', name: '摆药退药查询', icon: 'search', href: null, badge: '待补' },
      { key: 'wardSign', name: '病区签收', icon: 'scan', href: 'ward-sign.html' }
    ]},
    { type: 'group', name: 'HIS单据', items: [
      { key: 'rxQ', name: '处方单查询', icon: 'search', href: null, badge: '待补' },
      { key: 'rxSum', name: '处方药品汇总', icon: 'chart', href: null, badge: '待补' },
      { key: 'trayQ', name: '摆药单查询', icon: 'search', href: 'tray-q.html' },
      { key: 'traySum', name: '摆药单汇总', icon: 'chart', href: null, badge: '待补' }
    ]},
    { type: 'group', name: '盘点管理', items: [
      { key: 'invInit', name: '期初盘点', icon: 'clipboard', href: 'inv-init.html' },
      { key: 'inv', name: '盘点单', icon: 'clipboard', href: 'inv.html' },
      { key: 'invGain', name: '盘盈入库', icon: 'box', href: 'inv-gain.html' },
      { key: 'invLoss', name: '盘亏出库', icon: 'box', href: 'inv-loss.html' },
      { key: 'invQ', name: '盈亏查询', icon: 'search', href: 'inv-q.html' },
      { key: 'invNocode', name: '无码药品记录', icon: 'book', href: 'inv-nocode.html' }
    ]},
    { type: 'group', name: '台账管理', items: [
      { key: 'ledger', name: '药品台账', icon: 'book', href: 'ledger.html' },
      { key: 'ledgerM', name: '月记账', icon: 'book', href: null, badge: '待补' },
      { key: 'ledgerQ', name: '季度账查询', icon: 'search', href: null, badge: '待补' },
      { key: 'traceQ', name: '追溯码查询', icon: 'search', href: 'trace-q.html' },
      { key: 'flowQ', name: '药品流向查询', icon: 'chart', href: 'flow-q.html' }
    ]},
    { type: 'group', name: '医保管理', items: [
      { key: 'miUpload', name: '追溯码上传', icon: 'shield', href: null, badge: '预留' },
      { key: 'miUploadQ', name: '上传情况查询', icon: 'search', href: null, badge: '待补' }
    ]},
    { type: 'group', name: '系统管理', items: [
      { key: 'users', name: '用户管理', icon: 'users', href: 'users.html' },
      { key: 'roles', name: '角色管理', icon: 'key', href: 'roles.html' },
      { key: 'perm', name: '菜单管理', icon: 'key', href: 'perm.html' }
    ]}
  ];

  function navItem(it, active) {
    if (!it.href) {
      return '<div class="app-nav-item is-pending" data-pending="' + it.name + '" title="' + it.name + '">' +
        icon(it.icon, 16) + '<span>' + it.name + '</span>' +
        '<span class="pending-badge">' + (it.badge || '待实现') + '</span></div>';
    }
    var cls = it.key === active ? 'app-nav-item active' : 'app-nav-item';
    return '<a class="' + cls + '" href="' + it.href + '" title="' + it.name + '">' + icon(it.icon, 16) + '<span>' + it.name + '</span></a>';
  }

  // 定位当前页在 NAV 中的位置（组 / 子组），供默认展开用
  function findActive(active) {
    var loc = { group: null, sub: null };
    NAV.forEach(function (entry) {
      if (entry.type === 'item') return;
      (entry.items || []).forEach(function (it) { if (it.key === active) loc.group = entry.name; });
      (entry.subs || []).forEach(function (s) {
        s.items.forEach(function (it) { if (it.key === active) { loc.group = entry.name; loc.sub = s.name; } });
      });
    });
    return loc;
  }

  // 当前页对应的页签（无 href 的待实现项不进页签）
  function tabOf(active) {
    var found = null;
    function scan(items) {
      (items || []).forEach(function (it) { if (it.key === active && it.href) found = { key: it.key, name: it.name, href: it.href }; });
    }
    NAV.forEach(function (entry) {
      if (entry.type === 'item') scan([entry]);
      else { scan(entry.items); (entry.subs || []).forEach(function (s) { scan(s.items); }); }
    });
    return found;
  }

  // 树形菜单：组/子组均可上下折叠（三级：模块 > 子组 > 菜单）。默认只展开当前页所在链路；手动切换后本次会话记忆
  function renderNav(active, navGroups) {
    var loc = findActive(active);
    function collapsedOf(key, defExpanded) {
      return (navGroups && typeof navGroups[key] === 'boolean') ? navGroups[key] : !defExpanded;
    }
    function block(titleCls, itemsCls, key, label, collapsed) {
      return '<div class="' + titleCls + (collapsed ? '' : ' open') + '" data-group="' + key + '" title="点击展开 / 收起">' +
        '<span>' + label + '</span>' + icon('chevron', 12) + '</div>' +
        '<div class="' + itemsCls + '" data-group-items="' + key + '"' + (collapsed ? ' style="display:none;"' : '') + '>';
    }
    var html = '';
    NAV.forEach(function (entry) {
      if (entry.type === 'item') { html += navItem(entry, active); return; }
      var gCollapsed = collapsedOf(entry.name, entry.name === loc.group);
      html += block('app-nav-group-title', 'app-nav-group-items', entry.name, entry.name, gCollapsed);
      (entry.items || []).forEach(function (it) { html += navItem(it, active); });
      (entry.subs || []).forEach(function (s) {
        var key = entry.name + '/' + s.name;
        var sCollapsed = collapsedOf(key, entry.name === loc.group && s.name === loc.sub);
        html += block('app-nav-sub-title', 'app-nav-sub-items', key, s.name, sCollapsed);
        s.items.forEach(function (it) { html += navItem(it, active); });
        html += '</div>';
      });
      html += '</div>';
    });
    return html;
  }

  // 顶部多页签（对齐老系统）：工作台固定不可关，关当前页签 → 跳到最后一个剩余页签
  function renderTabs(tabs, active) {
    if (!tabs || !tabs.length) return '';
    var h = '<div class="app-tabs">';
    tabs.forEach(function (t) {
      h += '<span class="app-tab' + (t.key === active ? ' active' : '') + '" data-tab-href="' + t.href + '">' + t.name +
        (t.key === 'index' ? '' : '<i class="tab-x" data-tab-close="' + t.key + '" title="关闭页签">×</i>') + '</span>';
    });
    return h + '</div>';
  }

  function renderTopbar(opts, user) {
    var crumbs = (opts.crumb || []).map(function (c, i, arr) {
      return i === arr.length - 1 ? '<b>' + c + '</b>' : c + ' / ';
    }).join('');
    var demoTag = user._demo ? '<span class="demo-badge">演示模式</span>' : '';
    return '<div class="app-topbar">' +
      '<div class="crumb">' + crumbs + '</div>' +
      '<div class="user-chip">' +
        (user.mode ? '<span class="ctx-tag">模式：<b>' + user.mode + '</b></span>' : '') +
        '<span class="ctx-tag">院区：<b>' + (user.org || '-') + '</b></span>' +
        '<span class="ctx-tag">库房/药房：<b>' + (user.warehouse || '-') + '</b></span>' +
        '<span class="logout-link" id="btnSwitchDept" title="切换院区/库房/药房">' + icon('swap', 14) + '部门切换</span>' +
        '<span class="avatar">' + (user.name || '访').charAt(0) + '</span>' +
        '<span>' + user.name + ' · ' + user.roleName + '</span>' + demoTag +
        '<span class="logout-link" id="btnLogout" title="退出登录">' + icon('logout', 15) + '退出</span>' +
      '</div></div>';
  }

  // 部门切换弹窗（院区 → 模式 → 库房/药房 联动，对齐客户登录流程图的「切换」能力）
  function switchModalHtml(user) {
    var orgOpts = window.PUL.ORG_TREE.children.map(function (yq) {
      return '<option' + (user.org === yq.name ? ' selected' : '') + '>' + yq.name + '</option>';
    }).join('');
    return '<div class="app-modal-overlay" id="switchModal" style="display:none;">' +
      '<div class="app-modal" style="width:400px;"><div class="app-modal-head"><b>部门切换</b>' +
      '<span class="app-modal-close" id="swClose">×</span></div>' +
      '<div class="app-modal-body">' +
      '<div class="mb-3"><label class="form-label">院区</label><select class="form-select" id="swOrg">' + orgOpts + '</select></div>' +
      '<div class="mb-3"><label class="form-label">业务模块</label><select class="form-select" id="swMode">' +
        '<option value="">全部</option>' +
        '<option' + (user.mode === '库房管理' ? ' selected' : '') + '>库房管理</option>' +
        '<option' + (user.mode === '药房管理' ? ' selected' : '') + '>药房管理</option>' +
      '</select></div>' +
      '<div class="mb-2"><label class="form-label">库房 / 药房</label><select class="form-select" id="swNode"></select></div>' +
      '</div><div class="app-modal-foot">' +
      '<button class="btn btn-outline-secondary" id="swCancel">取消</button>' +
      '<button class="btn btn-primary" id="swSave">确定</button></div></div></div>';
  }

  function bindSwitchModal(mount, user) {
    var modal = mount.querySelector('#switchModal');
    if (!modal) return;
    var orgSel = modal.querySelector('#swOrg');
    var modeSel = modal.querySelector('#swMode');
    var nodeSel = modal.querySelector('#swNode');
    function fillNodes(preselect) {
      var kind = modeSel.value === '药房管理' ? '药房' : (modeSel.value === '库房管理' ? '库房' : '');
      var nodes = window.PUL.nodesOfOrg(orgSel.value).filter(function (n) {
        return !kind || window.PUL.nodeKind(n.type) === kind;
      });
      nodeSel.innerHTML = nodes.map(function (n) {
        return '<option' + (preselect === n.name ? ' selected' : '') + '>' + n.name + '（' + n.type + '）</option>';
      }).join('');
    }
    fillNodes(user.warehouse);
    orgSel.addEventListener('change', function () { fillNodes(); });
    modeSel.addEventListener('change', function () { fillNodes(); });
    var open = function () { modal.style.display = 'flex'; };
    var close = function () { modal.style.display = 'none'; };
    mount.querySelector('#btnSwitchDept').addEventListener('click', open);
    modal.querySelector('#swClose').addEventListener('click', close);
    modal.querySelector('#swCancel').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    modal.querySelector('#swSave').addEventListener('click', function () {
      var nodeName = nodeSel.value.replace(/（.*）/, '');
      var nodes = window.PUL.nodesOfOrg(orgSel.value);
      var node = nodes.filter(function (n) { return n.name === nodeName; })[0];
      var mode = node ? window.PUL.nodeKind(node.type) + '管理' : (modeSel.value || '');
      window.store.update({ currentUser: Object.assign({}, window.store.load().currentUser,
        { org: orgSel.value, warehouse: nodeName, mode: mode }) });
      window.showToast('已切换到 ' + orgSel.value + ' / ' + nodeName + (mode ? '（' + mode + '）' : ''));
      setTimeout(function () { location.reload(); }, 350);
    });
  }

  // 未登录直达时注入演示账号（保证从 plan.html 直接进任何页都能看）
  function ensureUser() {
    var state = window.store ? window.store.load() : {};
    if (state.currentUser) return state.currentUser;
    var u = { account: 'admin', name: '林建国', roles: ['SYS_ADMIN'], roleName: '系统管理员',
      org: '中心院区', warehouse: '中心库', mode: '库房管理', _demo: true };
    if (window.store) window.store.update({ currentUser: u });
    return u;
  }

  function render(mountId, opts) {
    opts = opts || {};
    var mount = document.getElementById(mountId);
    if (!mount) return null;
    var user = ensureUser();
    var navState = window.store ? window.store.load() : {};
    // 页签：当前页入列（工作台固定为首签）
    var tabs = navState.openTabs || [];
    var cur = tabOf(opts.active);
    if (cur && !tabs.some(function (t) { return t.key === cur.key; })) {
      tabs = tabs.concat([cur]);
      if (window.store) window.store.update({ openTabs: tabs });
    }
    mount.innerHTML =
      '<div class="app-page">' +
        '<aside class="app-sidebar">' +
          '<a class="app-brand" href="index.html">' +
            '<span class="app-brand-icon">' + icon('pills', 17) + '</span>' +
            '<span class="app-brand-name">PUL-FMS</span></a>' +
          '<nav class="app-nav">' + renderNav(opts.active, navState.navGroups) + '</nav>' +
        '</aside>' +
        '<div class="app-main">' + renderTopbar(opts, user) + renderTabs(tabs, opts.active) +
          '<div class="app-content" id="appContent"></div>' +
        '</div>' +
        switchModalHtml(user) +
      '</div>';

    mount.querySelectorAll('.is-pending').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.showToast) window.showToast('「' + el.getAttribute('data-pending') + '」将在下一阶段交付');
      });
    });
    var logout = mount.querySelector('#btnLogout');
    if (logout) logout.addEventListener('click', function () {
      if (window.store) window.store.update({ currentUser: null, openTabs: [] });
      window.location.href = 'login.html';
    });
    // 页签：点击切换 / 关闭（关当前签跳到最后一个剩余签）
    function bindTabs() {
      mount.querySelectorAll('[data-tab-href]').forEach(function (el) {
        el.addEventListener('click', function () {
          if (!el.classList.contains('active')) window.location.href = el.getAttribute('data-tab-href');
        });
      });
      mount.querySelectorAll('[data-tab-close]').forEach(function (x) {
        x.addEventListener('click', function (e) {
          e.stopPropagation();
          var key = x.getAttribute('data-tab-close');
          var st = window.store ? window.store.load() : {};
          var rest = (st.openTabs || []).filter(function (t) { return t.key !== key; });
          if (window.store) window.store.update({ openTabs: rest });
          if (key === opts.active) {
            window.location.href = rest.length ? rest[rest.length - 1].href : 'index.html';
          } else {
            var bar = mount.querySelector('.app-tabs');
            if (bar) { var div = document.createElement('div'); div.innerHTML = renderTabs(rest, opts.active); bar.replaceWith(div.firstChild); bindTabs(); }
          }
        });
      });
    }
    bindTabs();
    // 菜单组/子组上下折叠（点击标题切换，本次会话记忆）
    mount.querySelectorAll('.app-nav-group-title, .app-nav-sub-title').forEach(function (t) {
      t.addEventListener('click', function () {
        var name = t.getAttribute('data-group');
        var items = mount.querySelector('[data-group-items="' + name + '"]');
        var willCollapse = items.style.display !== 'none';
        items.style.display = willCollapse ? 'none' : '';
        t.classList.toggle('open', !willCollapse);
        if (window.store) {
          var st = window.store.load();
          var groups = st.navGroups || {};
          groups[name] = willCollapse;
          window.store.update({ navGroups: groups });
        }
      });
    });
    bindSwitchModal(mount, user);
    return mount.querySelector('#appContent');
  }

  window.AppShell = { render: render, icon: icon, NAV: NAV };
})();
