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
  // origin: 'n' = 自主新增（非客户原菜单，导航名称后带「新」chip）；缺省 = 客户原有
  // 2026-09-30 Round Z：组名/项名/顺序全面对齐客户原菜单（组织管理组撤销并入基础管理、
  // 采购管理升一级组、损耗 2 项移入出库管理、发药管理更名出库管理；key 全部不变，
  // 合并页拆出客户原名待补项：pickOut/shelfOff/invSumQ/trayAssignQ/trayItemQ/traySumQ）
  var NAV = [
    { type: 'item', key: 'index', name: '工作台', icon: 'dashboard', href: 'index.html' },
    { type: 'group', name: '系统管理', items: [
      { key: 'perm', name: '权限管理', icon: 'key', href: 'perm.html' },
      { key: 'users', name: '用户管理', icon: 'users', href: 'users.html' },
      { key: 'roles', name: '角色管理', icon: 'key', href: 'roles.html' },
      { key: 'loginLog', name: '登录日志', icon: 'logout', href: 'log-login.html' },
      { key: 'opLog', name: '操作日志', icon: 'clipboard', href: 'log-op.html' },
      { key: 'cabSet', name: '取药柜设置', icon: 'box', href: null, badge: '待补' },
      { key: 'pickLamp', name: '取药指示灯', icon: 'bulb', href: null, badge: '待补' },
      { key: 'fillLampSet', name: '补药灯组设置', icon: 'bulb', href: null, badge: '待补' },
      { key: 'slotLampMap', name: '取药槽灯组对照', icon: 'swap', href: 'slot-lamp-map.html' },
      { key: 'slotDrugMap', name: '取药槽药品对照', icon: 'pills', href: 'slot-drug-map.html' }
    ]},
    { type: 'group', name: '基础管理', items: [
      { key: 'orgs', name: '院区字典维护', icon: 'building', href: 'orgs.html' },
      { key: 'wh', name: '库房库位维护', icon: 'warehouse', href: 'warehouse.html' },
      { key: 'phloc', name: '药房货位维护', icon: 'box', href: 'pharmacy.html' },
      { key: 'drug', name: '药品字典维护', icon: 'pills', href: 'drug.html' },
      { key: 'cabinet', name: '取药柜维护', icon: 'box', href: 'cabinet.html' },
      { key: 'lamp', name: '基站灯组维护', icon: 'bulb', href: 'light.html' },
      { key: 'idcode', name: '药品标识码查询', icon: 'scan', href: 'idcode.html' },
      { key: 'slotQ', name: '取药槽信息查询', icon: 'search', href: null, badge: '待补' },
      { key: 'dict', name: '基础字典', icon: 'book', href: 'dict-types.html', origin: 'n' }
    ]},
    { type: 'group', name: '采购管理', items: [
      { key: 'arrive', name: '采购到货单', icon: 'truck', href: 'purchase-arrive.html' },
      { key: 'pin', name: '采购入库单', icon: 'box', href: 'purchase-in.html' },
      { key: 'pquery', name: '采购明细', icon: 'search', href: 'purchase-detail.html' },
      { key: 'pout', name: '采购退货单', icon: 'swap', href: 'purchase-out.html' },
      { key: 'pOutQ', name: '退货明细查询', icon: 'search', href: 'purchase-out-query.html' }
    ]},
    { type: 'group', name: '库房管理', items: [
      { key: 'othIn', name: '其他入库单', icon: 'box', href: 'wh-other-in.html' },
      { key: 'whstock', name: '库房库存查询', icon: 'chart', href: 'wh-stock.html' },
      { key: 'pick', name: '调拨出库单', icon: 'box', href: 'wh-pick.html' },
      { key: 'pickOut', name: '领用出库单', icon: 'box', href: 'wh-pick-out.html' },
      { key: 'retIn', name: '领用退回', icon: 'swap', href: 'wh-return-in.html' },
      { key: 'othOut', name: '其他出库单', icon: 'box', href: 'wh-other-out.html' },
      { key: 'whOutQ', name: '出库明细查询', icon: 'search', href: 'wh-out-query.html' }
    ]},
    { type: 'group', name: '药房管理', items: [
      { key: 'req', name: '领用申请单', icon: 'box', href: 'ph-req.html' },
      { key: 'reqIn', name: '调拨入库单', icon: 'box', href: 'ph-req-in.html' },
      { key: 'shelfQ', name: '待上架药品查询', icon: 'search', href: 'ph-shelf-q.html' },
      { key: 'light', name: '补药指示灯亮', icon: 'bulb', href: null, badge: '占位' },
      { key: 'shelfOff', name: '药品扫码下架', icon: 'scan', href: null, badge: '待补' },
      { key: 'retOut', name: '退回出库单', icon: 'swap', href: 'ph-ret-out.html' },
      { key: 'phloss', name: '药房损耗', icon: 'clipboard', href: 'ph-loss.html', origin: 'n' },
      { key: 'phstock', name: '药房库存查询', icon: 'chart', href: 'ph-stock.html' },
      { key: 'phInQ', name: '入库明细查询', icon: 'search', href: 'ph-in-query.html' }
    ]},
    { type: 'group', name: '出库管理', items: [
      { key: 'disp', name: '处方发药扫码', icon: 'scan', href: 'disp.html' },
      { key: 'assign', name: '处方取药赋码', icon: 'rx', href: null, badge: '占位' },
      { key: 'assignBatch', name: '处方单批量赋码', icon: 'rx', href: null, badge: '占位' },
      { key: 'assignQ', name: '处方单赋码查询', icon: 'search', href: null, badge: '待补' },
      { key: 'rxExc', name: '赋码异常台账', icon: 'clipboard', href: 'rx-exc.html', origin: 'n' },
      { key: 'rxItemQ', name: '处方药品明细查询', icon: 'search', href: 'rx-item-q.html' },
      { key: 'rxAggQ', name: '处方药品汇总查询', icon: 'chart', href: 'rx-agg-q.html' },
      { key: 'rxret', name: '处方单退药', icon: 'swap', href: 'rx-ret.html' },
      { key: 'rxRetQ', name: '处方单退药查询', icon: 'search', href: 'rx-ret-q.html' },
      { key: 'tray', name: '摆药单批量赋码', icon: 'clipboard', href: 'tray.html' },
      { key: 'trayAssignQ', name: '摆药单赋码查询', icon: 'search', href: null, badge: '待补' },
      { key: 'trayItemQ', name: '摆药单明细查询', icon: 'search', href: null, badge: '待补' },
      { key: 'traySumQ', name: '摆药单汇总查询', icon: 'chart', href: null, badge: '待补' },
      { key: 'trayRet', name: '摆药单退药', icon: 'swap', href: 'tray-ret.html' },
      { key: 'trayRetQ', name: '摆药单退药查询', icon: 'search', href: 'tray-ret-q.html' },
      { key: 'lossOut', name: '损耗出库单', icon: 'clipboard', href: 'wh-loss-out.html' },
      { key: 'lossQ', name: '损耗明细查询', icon: 'search', href: 'wh-loss-query.html' },
      { key: 'wardSign', name: '病区签收', icon: 'scan', href: 'ward-sign.html', origin: 'n' }
    ]},
    { type: 'group', name: '扫码管理', items: [
      { key: 'scanHub', name: '统一扫码', icon: 'scan', href: 'scan-hub.html', origin: 'n' },
      { key: 'scanLab', name: '统一扫码验证', icon: 'scan', href: 'scan-lab.html', origin: 'n' }
    ]}
    // HIS单据 / 盘点管理 / 台账管理 / 医保管理 四组 2026-10-15 应需求方要求从侧栏摘除（先下线，页面文件与深链保留）
  ];

  // ===== 线上演示菜单开关（2026-10-09 拍板，2026-10-10 组内排除扩开放）=====
  // 本地（localhost / 127.0.0.1 / file://）侧边栏全量不隐藏；菜单隐藏只发生在部署域名下，按 LIVE_OPEN 白名单渲染：
  //   组名: null              → 整组开放
  //   组名: {all, hide:[key]} → 整组开放但排除 hide 项（系统管理 5 项硬件设置 / 基础管理 取药柜+基站灯组+取药槽查询+基础字典）
  //   组名: [key]             → 只开放指定项（采购管理仅到货单）
  //   未列入的组不渲染。收窄的只是左侧导航：权限树（MENU_TREE）/页签跳转/深链直达保持全量。
  var LIVE_OPEN = {
    '系统管理': { all: true, hide: ['cabSet', 'pickLamp', 'fillLampSet', 'slotLampMap', 'slotDrugMap'] },
    '基础管理': { all: true, hide: ['cabinet', 'lamp', 'slotQ', 'dict'] },
    '采购管理': ['arrive']                   // 2026-10-16 线上业务菜单仅展示采购到货单；其余页面与深链保留
  };
  var IS_LIVE = (typeof location !== 'undefined') &&
    location.hostname !== 'localhost' && location.hostname !== '127.0.0.1' && location.hostname !== '';
  // hidden:true = 本地+线上全端隐藏的兜底开关（当前无项使用；菜单隐藏统一走 LIVE_OPEN 线上排除，本地保持全量）。
  // 仅剔除侧边栏渲染，NAV 本体保留 → PRD 同步校验 / 页签跳转 / 深链直达 / findActive 不受影响
  function stripHidden(entries) {
    var out = [];
    entries.forEach(function (e) {
      if (e.type === 'item') { if (!e.hidden) out.push(e); return; }
      var g = { type: 'group', name: e.name, items: (e.items || []).filter(function (it) { return !it.hidden; }), subs: [] };
      (e.subs || []).forEach(function (s) {
        var si = (s.items || []).filter(function (it) { return !it.hidden; });
        if (si.length) g.subs.push({ name: s.name, items: si });
      });
      if (g.items.length || g.subs.length) out.push(g);
    });
    return out;
  }
  function visibleNav() {
    if (!IS_LIVE) return stripHidden(NAV);
    var out = [];
    NAV.forEach(function (e) {
      if (e.type === 'item') { out.push(e); return; }
      if (!(e.name in LIVE_OPEN)) return;               // 未列入白名单的组不渲染
      var allow = LIVE_OPEN[e.name];
      if (allow === null) { out.push(e); return; }      // null = 整组开放（null 是 falsy，必须先 in 判断）
      function keep(it) {
        return allow.all ? allow.hide.indexOf(it.key) === -1 : allow.indexOf(it.key) !== -1;
      }
      var g = { type: 'group', name: e.name, items: [], subs: [] };
      (e.items || []).forEach(function (it) { if (keep(it)) g.items.push(it); });
      (e.subs || []).forEach(function (s) {
        var si = (s.items || []).filter(keep);
        if (si.length) g.subs.push({ name: s.name, items: si });
      });
      if (g.items.length || g.subs.length) out.push(g);
    });
    return stripHidden(out);
  }

  function navItem(it, active) {
    // origin='n' → 名称后挂「新」chip（需求来源维度；pending-badge 是实现状态维度，可并存）
    var originChip = it.origin === 'n'
      ? '<span class="origin-badge" title="自主新增，非客户原菜单">新</span>' : '';
    if (!it.href) {
      return '<div class="app-nav-item is-pending" data-pending="' + it.name + '" title="' + it.name + '">' +
        icon(it.icon, 16) + '<span>' + it.name + '</span>' + originChip +
        '<span class="pending-badge">' + (it.badge || '待实现') + '</span></div>';
    }
    var cls = it.key === active ? 'app-nav-item active' : 'app-nav-item';
    return '<a class="' + cls + '" href="' + it.href + '" title="' + it.name + '">' +
      icon(it.icon, 16) + '<span>' + it.name + '</span>' + originChip + '</a>';
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
    visibleNav().forEach(function (entry) {
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
      h += '<span class="app-tab' + (t.key === active ? ' active' : '') + '" data-tab-key="' + t.key + '" data-tab-href="' + t.href + '">' + t.name +
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
    // 2026-10-13 Round BT：embed=1（弹窗 iframe 内嵌复用，如统一扫码弹窗）——不写 openTabs 页签、根加 app-embed 藏壳层
    var embed = /[?&]embed=1/.test(location.search);
    var user = ensureUser();
    var navState = window.store ? window.store.load() : {};
    // 页签：当前页入列（工作台固定为首签）
    var tabs = navState.openTabs || [];
    var cur = tabOf(opts.active);
    if (!embed && cur && !tabs.some(function (t) { return t.key === cur.key; })) {
      tabs = tabs.concat([cur]);
      if (window.store) window.store.update({ openTabs: tabs });
    }
    mount.innerHTML =
      '<div class="app-page' + (embed ? ' app-embed' : '') + '">' +
        '<aside class="app-sidebar">' +
          '<a class="app-brand" href="index.html">' +
            '<span class="app-brand-icon">' + icon('pills', 17) + '</span>' +
            '<span class="app-brand-name">PUL-FMS</span></a>' +
          '<nav class="app-nav">' + renderNav(opts.active, navState.navGroups) + '</nav>' +
          '<div class="app-nav-legend"><span class="origin-badge">新</span>= 自主新增，非客户原菜单</div>' +
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
    // 页签：点击切换 / 关闭 / 右键批量关闭（关活动签跳到最后一个剩余签，无剩余回工作台）
    function applyTabs(rest) {
      if (window.store) window.store.update({ openTabs: rest });
      if (!rest.some(function (t) { return t.key === opts.active; })) {
        window.location.href = rest.length ? rest[rest.length - 1].href : 'index.html';
        return;
      }
      var bar = mount.querySelector('.app-tabs');
      if (bar) { var div = document.createElement('div'); div.innerHTML = renderTabs(rest, opts.active); bar.replaceWith(div.firstChild); bindTabs(); }
    }
    // 页签右键菜单：关闭当前/其他/右侧/全部（共享层无此组件，自写；工作台固定不可关）
    function closeTabMenu() {
      var m = document.querySelector('.app-tab-menu');
      if (m) m.remove();
    }
    function showTabMenu(px, py, key) {
      closeTabMenu();
      var tabs = (window.store ? window.store.load() : {}).openTabs || [];
      var idx = -1;
      tabs.forEach(function (t, i) { if (t.key === key) idx = i; });
      if (idx < 0) return;
      var items = [];
      if (key !== 'index') items.push({ name: '关闭当前页签', act: function () { applyTabs(tabs.filter(function (t) { return t.key !== key; })); } });
      items.push(
        { name: '关闭其他页签', act: function () { applyTabs(tabs.filter(function (t) { return t.key === 'index' || t.key === key; })); } },
        { name: '关闭右侧页签', act: function () { applyTabs(tabs.slice(0, idx + 1)); } },
        { name: '关闭全部页签', act: function () { applyTabs(tabs.filter(function (t) { return t.key === 'index'; })); } });
      var m = document.createElement('div');
      m.className = 'app-tab-menu';
      m.innerHTML = items.map(function (it, i) { return '<div class="app-tab-menu-item" data-i="' + i + '">' + it.name + '</div>'; }).join('');
      document.body.appendChild(m);
      var r = m.getBoundingClientRect();
      m.style.left = Math.max(4, Math.min(px, window.innerWidth - r.width - 8)) + 'px';
      m.style.top = Math.max(4, Math.min(py, window.innerHeight - r.height - 8)) + 'px';
      m.querySelectorAll('.app-tab-menu-item').forEach(function (el) {
        el.addEventListener('click', function () {
          var it = items[parseInt(el.getAttribute('data-i'), 10)];
          closeTabMenu();
          it.act();
        });
      });
      // 点击/右键其他处/Esc 收起菜单（延迟挂载，避开本触发的冒泡）
      setTimeout(function () {
        document.addEventListener('click', closeTabMenu, { once: true });
        document.addEventListener('contextmenu', closeTabMenu, { once: true });
        document.addEventListener('keydown', function onkey(ev) {
          if (ev.key === 'Escape') { closeTabMenu(); document.removeEventListener('keydown', onkey); }
        });
      }, 0);
    }
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
          applyTabs((st.openTabs || []).filter(function (t) { return t.key !== key; }));
        });
      });
      mount.querySelectorAll('.app-tab').forEach(function (el) {
        el.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          e.stopPropagation();   // 不冒泡到 document，避免新菜单被一次性收起监听立刻关掉
          showTabMenu(e.clientX, e.clientY, el.getAttribute('data-tab-key'));
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
    enhancePlanBadge();
    return mount.querySelector('#appContent');
  }

  // 2026-10-16 Round DB 用户拍板：全站悬浮 pill 补「⟲ 重置」入口——种子态（代码初始数据）vs 会话态（sessionStorage
  // 操作痕迹）对不上时一键归位；74 页 pill 是硬编码副本，统一在此处增强（guide.html 头部另有同款按钮）
  function enhancePlanBadge() {
    var b = document.getElementById('planBadge');
    if (!b || b.querySelector('.pb-reset')) return;
    var r = document.createElement('span');
    r.className = 'pb-reset';
    r.textContent = '⟲ 重置';
    r.title = '清空本会话所有操作痕迹（扫码/审核/删除等），恢复种子初始数据';
    r.style.cssText = 'margin-left:2px;padding-left:8px;border-left:1px solid rgba(255,255,255,.4);cursor:pointer;';
    r.addEventListener('click', function (e) {
      e.stopPropagation();   // 不触发 pill 本体跳 plan.html
      if (!confirm('重置演示数据？\n\n将清空本会话内所有操作痕迹（扫码/审核/删除/重新下载等），恢复到种子初始数据，不可撤销。')) return;
      window.store.reset();
      location.reload();
    });
    b.appendChild(r);
  }

  window.AppShell = { render: render, icon: icon, NAV: NAV, visibleNav: visibleNav };
})();
