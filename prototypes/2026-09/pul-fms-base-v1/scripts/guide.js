/**
 * guide.js — 模块导览：定位条 → 流程图 → 案例条 → 功能入口（正向/逆向/兜底徽标）→ 跨模块兜底
 * ?m=org|base|wh|ph|disp|inv|ledger|mi|sys；无参或未知 = 9 模块总览
 * 导览页不进 NAV、不占页签（左侧导航行为不变，用户已确认）
 */
(function () {
  'use strict';
  var GD = window.GUIDE_DATA;
  var q = (location.search.match(/[?&]m=([a-z]+)/) || [])[1];
  var mod = GD.order.filter(function (m) { return m.key === q; })[0] || null;

  var content = window.AppShell.render('desktopPreview', {
    active: '',
    crumb: mod ? ['模块导览', mod.group] : ['模块导览']
  });
  if (!content) return;

  var CAT = {
    fwd: ['正向', 'bg-blue-lt'],
    rev: ['逆向', 'bg-orange-lt'],
    fix: ['兜底', 'bg-red-lt'],
    qry: ['查询', 'bg-azure-lt']
  };
  // 流程图路径唯一入口：图已迁入 prototypes/shared/diagrams（部署同步范围内，线上线下同一份）
  var DIAGRAM_BASE = '../../shared/diagrams/fireworks/';

  function navGroup(name) {
    return (window.AppShell.NAV || []).filter(function (e) { return e.name === name; })[0] || null;
  }
  function findItem(key) {
    var found = null;
    (window.AppShell.NAV || []).forEach(function (e) {
      (e.items || []).forEach(function (it) { if (it.key === key) found = it; });
      (e.subs || []).forEach(function (s) {
        s.items.forEach(function (it) { if (it.key === key) found = it; });
      });
    });
    return found;
  }

  function menuCard(meta) {
    return function (it) {
      var m = meta[it.key] || {};
      var pending = !it.href;
      var cat = CAT[m.cat] || CAT.fwd;
      var badge = pending
        ? '<span class="badge bg-secondary">' + (it.badge || '待实现') + '</span>'
        : '<span class="badge ' + cat[1] + '">' + cat[0] + '</span>';
      var note = m.note ? '<div style="font-size:11px;color:#d48806;margin-top:4px;">⚠ ' + m.note + '</div>' : '';
      var inner = '<div class="card-body" style="padding:12px 14px;">' +
        '<div class="d-flex align-items-center gap-2"><b style="font-size:13px;">' + it.name + '</b>' + badge + '</div>' +
        '<div class="text-secondary" style="font-size:12px;margin-top:2px;">' + (m.desc || '') + '</div>' + note +
        '</div>';
      if (pending) {
        return '<div class="col-sm-6 col-lg-4"><div class="card guide-pending" data-pending="' + it.name +
          '" style="opacity:.55;cursor:not-allowed;">' + inner + '</div></div>';
      }
      return '<div class="col-sm-6 col-lg-4"><a class="card card-link" href="' + it.href +
        '" style="text-decoration:none;color:inherit;">' + inner + '</a></div>';
    };
  }

  function modulePage() {
    var d = GD.modules[mod.key];
    var g = navGroup(mod.group);
    var html = '';
    // 定位条
    html += '<div class="card mb-3"><div class="card-body d-flex align-items-center gap-3" style="padding:14px 18px;">' +
      '<span class="text-primary">' + window.AppShell.icon(mod.icon, 26) + '</span>' +
      '<div><div style="font-size:16px;font-weight:600;">' + mod.group +
      '<span class="text-secondary" style="font-size:12px;font-weight:400;margin-left:10px;">' + d.roles + '</span></div>' +
      '<div class="text-secondary" style="font-size:13px;">' + d.tagline + '</div></div>' +
      '<a class="btn btn-outline-primary btn-sm ms-auto" href="guide.html">全部模块</a></div></div>';
    // 流程图（点图新窗口放大；蓝=正向 橙=逆向 红=兜底）
    if (d.diagrams && d.diagrams.length) {
      html += '<div class="card mb-3"><div class="card-header"><div class="card-title">业务流程图</div>' +
        '<span class="badge bg-azure-lt ms-auto">点图放大 · 蓝=正向 橙=逆向 红=兜底</span></div><div class="card-body">';
      d.diagrams.forEach(function (dg) {
        html += '<div class="mb-3"><div class="d-flex align-items-center gap-2 mb-1">' +
          '<b style="font-size:13px;">' + dg.t + '</b>' +
          '<span class="text-secondary" style="font-size:12px;">' + dg.note + '</span></div>' +
          '<div style="overflow-x:auto;border:1px solid #e3e8ee;border-radius:8px;background:#fff;">' +
          '<a href="' + DIAGRAM_BASE + dg.f + '" target="_blank" title="新窗口放大查看">' +
          '<img src="' + DIAGRAM_BASE + dg.f + '" alt="' + dg.t + '" style="display:block;max-width:none;"></a></div></div>';
      });
      html += '</div></div>';
    }
    // 案例条
    if (d.case) {
      html += '<div class="card mb-3" style="border-left:4px solid #206bc4;"><div class="card-body" style="padding:12px 18px;">' +
        '<span class="badge bg-blue-lt me-2">案例</span><span style="font-size:13px;">' + d.case + '</span></div></div>';
    }
    // 功能入口（保留 NAV 的子组结构，如库房管理的采购管理/库房管理）
    html += '<div class="card"><div class="card-header"><div class="card-title">功能入口</div>' +
      '<span class="badge bg-blue-lt ms-auto">正向</span>&nbsp;<span class="badge bg-orange-lt">逆向</span>&nbsp;<span class="badge bg-red-lt">兜底</span></div>' +
      '<div class="card-body">';
    var subs = g && g.subs ? g.subs : [{ name: '', items: g ? g.items || [] : [] }];
    subs.forEach(function (s) {
      if (s.name) html += '<div class="text-secondary mb-2" style="font-size:12px;letter-spacing:1px;">' + s.name + '</div>';
      html += '<div class="row row-cards mb-2">';
      s.items.forEach(function (it) { html += menuCard(d.menus || {})(it); });
      html += '</div>';
    });
    // 跨模块兜底互链（异常标识码挂在库房，但发药/盘点也要用）
    if (d.xlinks && d.xlinks.length) {
      html += '<div class="text-secondary mb-2" style="font-size:12px;letter-spacing:1px;">跨模块兜底</div><div class="row row-cards">';
      d.xlinks.forEach(function (x) {
        var it = findItem(x.key);
        if (!it || !it.href) return;
        html += '<div class="col-sm-6 col-lg-4"><a class="card card-link" href="' + it.href +
          '" style="text-decoration:none;color:inherit;"><div class="card-body" style="padding:12px 14px;">' +
          '<div class="d-flex align-items-center gap-2"><b style="font-size:13px;">' + it.name + '</b>' +
          '<span class="badge bg-red-lt">兜底</span></div>' +
          '<div class="text-secondary" style="font-size:12px;margin-top:2px;">' + x.note + '</div>' +
          '</div></a></div>';
      });
      html += '</div>';
    }
    html += '</div></div>';
    return html;
  }

  function overviewPage() {
    var html = '<div class="card mb-3"><div class="card-body" style="padding:14px 18px;">' +
      '<b style="font-size:15px;">模块导览</b>' +
      '<span class="text-secondary" style="font-size:13px;margin-left:10px;">先看懂业务，再点功能——选一个模块进入</span></div></div>' +
      '<div class="row row-cards">';
    GD.order.forEach(function (m) {
      var d = GD.modules[m.key];
      html += '<div class="col-sm-6 col-lg-4"><a class="card card-link" href="guide.html?m=' + m.key +
        '" style="text-decoration:none;color:inherit;"><div class="card-body" style="padding:14px 16px;">' +
        '<div class="d-flex align-items-center gap-2 mb-1"><span class="text-primary">' + window.AppShell.icon(m.icon, 20) +
        '</span><b>' + m.group + '</b></div>' +
        '<div class="text-secondary" style="font-size:12px;">' + d.tagline + '</div></div></a></div>';
    });
    return html + '</div>';
  }

  content.innerHTML = mod ? modulePage() : overviewPage();
  content.querySelectorAll('.guide-pending').forEach(function (el) {
    el.addEventListener('click', function () {
      window.showToast('「' + el.getAttribute('data-pending') + '」将在下一阶段交付');
    });
  });
})();
