/**
 * index.js — 工作台：欢迎区 + 登录上下文 + 待办 + 模块导览 + 组织树 + 制度看板
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'index', crumb: ['工作台'] });
  if (!content) return;
  var user = window.store.load().currentUser;
  // 数据范围（若依 DataScope）随角色继承；登录候选上下文由它算出
  var myScope = window.PUL.userScopeText(window.PUL.findUser(user.account) || user);

  function orgNode(node) {
    var tag = node.level === 'L1' ? 'org-node-l1' : (node.level === 'L2' ? 'org-node-l2' : 'org-node-l3');
    var html = '<li><b>' + node.name + '</b><span class="org-node-tag ' + tag + '">' + node.level + '</span>';
    if (node.type) html += '<span class="text-secondary" style="font-size:11px;">（' + node.type + '）</span>';
    if (node.children && node.children.length) {
      html += '<ul>';
      node.children.forEach(function (c) { html += orgNode(c); });
      html += '</ul>';
    }
    return html + '</li>';
  }

  var stats = [
    { num: 3,  label: '采购到货待入库', tone: 'bg-blue-lt' },
    { num: 5,  label: '盘点单待审核',   tone: 'bg-azure-lt' },
    { num: 12, label: '效期预警药品',   tone: 'bg-yellow-lt' },
    { num: 8,  label: '待发药处方',     tone: 'bg-red-lt' }
  ];

  var html = '';
  // 欢迎行 + 登录上下文
  html += '<div class="row row-deck row-cards mb-3">' +
    '<div class="col-sm-8"><div class="card"><div class="card-body">' +
      '<h3 class="card-title mb-1">' + (new Date().getHours() < 12 ? '上午好' : '下午好') + '，' + user.name + '</h3>' +
      '<div class="text-secondary" style="font-size:13px;">当前角色 <b>' + user.roleName + '</b>' +
      ' · 登录上下文：<b>' + (user.org || '-') + ' / ' + (user.warehouse || '-') + '</b>（顶栏可「部门切换」）</div>' +
    '</div></div></div>' +
    '<div class="col-sm-4"><div class="card"><div class="card-body">' +
      '<div class="text-secondary mb-1" style="font-size:12px;">我的数据范围（若依 DataScope，随角色生效）</div>' +
      '<div style="font-size:15px;font-weight:600;color:#1e293b;">' + myScope + '</div>' +
      '<div class="text-secondary mt-1" style="font-size:11.5px;">登录选定库房/药房后，行数据按该上下文自动隔离</div>' +
    '</div></div></div></div>';

  // 待办统计（演示数据）
  html += '<div class="row row-cards mb-3">';
  stats.forEach(function (s) {
    html += '<div class="col-sm-6 col-lg-3"><div class="card"><div class="card-body" style="padding:14px 16px;">' +
      '<div class="d-flex align-items-center justify-content-between">' +
      '<div><div class="h1 mb-0" style="font-size:26px;">' + s.num + '</div><div class="text-secondary" style="font-size:12px;">' + s.label + '</div></div>' +
      '<span class="badge ' + s.tone + '">待实现模块</span></div>' +
    '</div></div></div>';
  });
  html += '</div>';

  // 模块导览（9 大模块入口卡：定位语 + 页数，点击进 guide.html?m=xx）
  html += '<div class="card mb-3"><div class="card-header"><div class="card-title">模块导览</div>' +
    '<span class="badge bg-blue-lt ms-auto">先看懂业务，再点功能</span></div>' +
    '<div class="card-body"><div class="row row-cards" id="guideCards"></div></div></div>';

  // 组织树
  html += '<div class="row row-cards mb-3">' +
    '<div class="col-md-12"><div class="card"><div class="card-header"><div class="card-title">三级组织架构（4.1.1）</div>' +
      '<span class="badge bg-blue-lt ms-auto">L1 总院 → L2 院区 → L3 节点</span></div>' +
      '<div class="card-body" style="max-height:260px;overflow:auto;"><ul class="org-tree">' + orgNode(window.PUL.ORG_TREE) + '</ul></div>' +
    '</div></div></div>';

  // 制度看板
  html += '<div class="row row-cards">' +
    '<div class="col-md-6"><div class="card"><div class="card-header"><div class="card-title">数据隔离规则（4.3）</div></div>' +
    '<div class="card-body"><ol class="mb-0" style="padding-left:18px;font-size:13px;line-height:2;">';
  window.PUL.ISOLATION_RULES.forEach(function (r) { html += '<li>' + r + '</li>'; });
  html += '</ol></div></div></div>' +
    '<div class="col-md-6"><div class="card"><div class="card-header"><div class="card-title">权限配置与变更流程（4.4）</div></div>' +
    '<div class="list-group list-group-flush">';
  window.PUL.CHANGE_FLOWS.forEach(function (f, i) {
    html += '<div class="list-group-item"><div class="d-flex align-items-start gap-2">' +
      '<span class="badge bg-blue-lt" style="margin-top:2px;">' + (i + 1) + '</span>' +
      '<div><div style="font-weight:600;font-size:13px;">' + f.name + '</div>' +
      '<div class="text-secondary" style="font-size:12px;">' + f.desc + '</div></div></div></div>';
  });
  html += '</div></div></div></div>';

  content.innerHTML = html;

  // 模块导览卡：组名/图标来自 GUIDE_DATA.order，页数从 AppShell.NAV 派生
  var gc = document.getElementById('guideCards');
  if (gc && window.GUIDE_DATA) {
    var gh = '';
    window.GUIDE_DATA.order.forEach(function (m) {
      var d = window.GUIDE_DATA.modules[m.key];
      var count = 0;
      (window.AppShell.NAV || []).forEach(function (e) {
        if (e.name !== m.group) return;
        count += (e.items || []).length;
        (e.subs || []).forEach(function (s) { count += s.items.length; });
      });
      gh += '<div class="col-sm-6 col-lg-4"><a class="card card-link" href="guide.html?m=' + m.key +
        '" style="text-decoration:none;color:inherit;"><div class="card-body" style="padding:14px 16px;">' +
        '<div class="d-flex align-items-center gap-2 mb-1"><span class="text-primary">' +
        window.AppShell.icon(m.icon, 20) + '</span><b>' + m.group + '</b>' +
        '<span class="badge bg-azure-lt ms-auto">' + count + ' 页</span></div>' +
        '<div class="text-secondary" style="font-size:12px;">' + d.tagline + '</div>' +
        '</div></a></div>';
    });
    gc.innerHTML = gh;
  }
})();
