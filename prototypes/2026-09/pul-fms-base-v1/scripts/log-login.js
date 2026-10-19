/**
 * log-login.js — 登录日志：账号登录/登出留痕（成功+失败），时间倒序只读
 * 数据：账号/姓名/角色取自 PUL.USERS，日志行为演示数据
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'loginLog', crumb: ['系统管理', '登录日志'] });
  if (!content) return;

  var esc = window.PchUI.esc;
  var USERS = window.PUL.USERS, ROLES = window.PUL.ROLES;
  var kw = '', result = '', dFrom = '', dTo = '';

  function roleName(code) {
    for (var i = 0; i < ROLES.length; i++) if (ROLES[i].code === code) return ROLES[i].name;
    return code || '—';
  }
  function u(account) {
    for (var i = 0; i < USERS.length; i++) if (USERS[i].account === account) return USERS[i];
    return null;
  }
  // [时间, 账号, IP, 终端, 结果, 说明]
  var ROWS = [
    ['2026-10-04 08:42', 'admin',       '10.20.1.15',  'Chrome / Windows', '成功', '账号密码登录'],
    ['2026-10-04 08:15', 'keeper.wang', '10.20.3.42',  'Chrome / Windows', '成功', '账号密码登录'],
    ['2026-10-04 07:58', 'pharm.chen',  '10.20.5.108', 'Edge / Windows',   '成功', '账号密码登录'],
    ['2026-10-03 17:21', 'admin',       '10.20.1.15',  'Chrome / Windows', '成功', '正常登出'],
    ['2026-10-03 16:40', 'yq.sun',      '10.20.2.66',  'Chrome / Windows', '成功', '账号密码登录'],
    ['2026-10-03 14:02', 'pharm.wu',    '10.20.5.113', 'Chrome / Windows', '成功', '账号密码登录'],
    ['2026-10-03 09:47', 'check.liu',   '10.20.4.31',  'Edge / Windows',   '失败', '密码错误（第 1 次）'],
    ['2026-10-03 09:48', 'check.liu',   '10.20.4.31',  'Edge / Windows',   '成功', '账号密码登录'],
    ['2026-10-02 15:30', 'mj.zhou',     '10.21.6.20',  'Chrome / Windows', '成功', '账号密码登录'],
    ['2026-10-02 11:05', 'old.zhang',   '外网 118.31.x.x', 'Chrome / Windows', '失败', '账号已禁用'],
    ['2026-10-02 08:56', 'keeper.wang', '10.20.3.42',  'Chrome / Windows', '成功', '账号密码登录'],
    ['2026-10-01 18:12', 'pharm.chen',  '10.20.5.108', 'Edge / Windows',   '成功', '会话超时自动登出'],
    ['2026-10-01 08:33', 'pharm.wu',    '10.20.5.113', 'Chrome / Windows', '失败', '密码错误（第 3 次，账号锁定 10 分钟）'],
    ['2026-10-01 08:46', 'pharm.wu',    '10.20.5.113', 'Chrome / Windows', '成功', '账号密码登录']
  ];

  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  function rows() {
    return ROWS.filter(function (r) {
      var user = u(r[1]);
      var name = user ? user.name : r[1];
      if (kw && r[1].indexOf(kw) === -1 && name.indexOf(kw) === -1) return false;
      if (result && r[4] !== result) return false;
      var d = r[0].slice(0, 10);
      if (dFrom && d < dFrom) return false;
      if (dTo && d > dTo) return false;
      return true;
    });
  }

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:160px;" placeholder="账号 / 姓名" value="' + esc(kw) + '">' +
      '<select class="form-select" id="fResult" style="width:120px;">' +
        '<option value="">全部结果</option>' +
        '<option value="成功"' + (result === '成功' ? ' selected' : '') + '>成功</option>' +
        '<option value="失败"' + (result === '失败' ? ' selected' : '') + '>失败</option>' +
      '</select>' +
      '<input type="date" class="form-control" id="fFrom" style="width:150px;" value="' + esc(dFrom) + '">' +
      '<span class="text-secondary">至</span>' +
      '<input type="date" class="form-control" id="fTo" style="width:150px;" value="' + esc(dTo) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">登录/登出自动留痕 · 只读不可改</span>' +
      '</div></div></div>';
  }

  function tableCard() {
    var list = rows();
    var html = list.map(function (r) {
      var user = u(r[1]);
      var name = user ? user.name : '—';
      var role = user ? roleName(user.roles[0]) : '—';
      var badge = r[4] === '成功'
        ? '<span class="badge bg-green-lt">成功</span>'
        : '<span class="badge bg-red-lt">失败</span>';
      return '<tr>' +
        '<td class="text-secondary">' + esc(r[0]) + '</td>' +
        '<td><b>' + esc(r[1]) + '</b></td><td>' + esc(name) + '</td><td>' + esc(role) + '</td>' +
        '<td>' + esc(r[2]) + '</td><td class="text-secondary">' + esc(r[3]) + '</td>' +
        '<td>' + badge + '</td><td class="text-secondary">' + esc(r[5]) + '</td></tr>';
    }).join('');
    if (!html) html = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">无匹配记录</td></tr>';
    return '<div class="card"><div class="card-header"><b>登录记录</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">共 ' + list.length + ' 条 · 时间倒序</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>时间</th><th>账号</th><th>姓名</th><th>角色</th><th>登录 IP</th><th>终端</th><th>结果</th><th>说明</th></tr></thead>' +
      '<tbody>' + html + '</tbody></table></div></div>';
  }

  function renderAll() { content.innerHTML = filterBar() + tableCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      kw = v('fKw'); result = v('fResult'); dFrom = v('fFrom'); dTo = v('fTo'); renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      kw = ''; result = ''; dFrom = ''; dTo = ''; renderAll();
    });
  }
  renderAll();
})();
