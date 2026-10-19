/**
 * log-op.js — 操作日志：关键业务动作留痕（新增/修改/删除/审核/导出等），时间倒序只读
 * 数据：账号/姓名取自 PUL.USERS，日志行为演示数据
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'opLog', crumb: ['系统管理', '操作日志'] });
  if (!content) return;

  var esc = window.PchUI.esc;
  var USERS = window.PUL.USERS;
  var kw = '', module = '', action = '', dFrom = '', dTo = '';

  var MODULES = ['系统管理', '基础管理', '采购管理', '库房管理', '药房管理', '出库管理', '盘点管理'];
  var ACTIONS = ['新增', '修改', '删除', '审核', '驳回', '导出', '启用/禁用'];

  function u(account) {
    for (var i = 0; i < USERS.length; i++) if (USERS[i].account === account) return USERS[i];
    return null;
  }
  // [时间, 账号, 模块, 操作, 对象, 详情, IP, 结果]
  var ROWS = [
    ['2026-10-04 09:12', 'keeper.wang', '采购管理', '审核', '到货单 DH20261003001', '扫码 60 码全部解析成功，审核通过生成入库单', '10.20.3.42', '成功'],
    ['2026-10-04 08:50', 'admin',       '系统管理', '修改', '角色「药房药师」', '菜单权限树取消勾选「季度账查询」', '10.20.1.15', '成功'],
    ['2026-10-03 16:58', 'yq.sun',      '系统管理', '启用/禁用', '账号 old.zhang', '离职注销：状态 正常 → 禁用', '10.20.2.66', '成功'],
    ['2026-10-03 15:40', 'pharm.chen',  '出库管理', '新增', '处方发药 YS20261003012', '扫码发药 3 码，拆零 1 盒', '10.20.5.108', '成功'],
    ['2026-10-03 14:22', 'keeper.wang', '库房管理', '新增', '领用备货单 LY20261003005', '门诊药房申请 12 个品规', '10.20.3.42', '成功'],
    ['2026-10-03 11:06', 'admin',       '基础管理', '修改', '药品「阿莫西林胶囊」', '换算关系 1盒=7片 → 1盒=10片', '10.20.1.15', '成功'],
    ['2026-10-03 10:15', 'check.liu',   '盘点管理', '审核', '盘盈入库单 PY20261002002', '盈亏过账，库房在架 +2', '10.20.4.31', '成功'],
    ['2026-10-02 17:45', 'yq.sun',      '药房管理', '驳回', '领用申请单 SQ20261002008', '申请数量超库存上限，退回修改', '10.20.2.66', '成功'],
    ['2026-10-02 16:03', 'pharm.wu',    '出库管理', '导出', '处方药品汇总查询', '导出 2026-09 全月汇总 Excel', '10.20.5.113', '成功'],
    ['2026-10-02 14:37', 'keeper.wang', '采购管理', '删除', '到货单草稿 DH20261002003', '误建草稿，未扫码无码占用', '10.20.3.42', '成功'],
    ['2026-10-02 09:20', 'admin',       '系统管理', '新增', '账号 pharm.wu', '新建账号并分配「药房药师」角色', '10.20.1.15', '成功'],
    ['2026-10-01 15:52', 'mj.zhou',     '药房管理', '新增', '药房损耗 SH20261001001', '麻精专库破损 1 支，双人复核', '10.21.6.20', '成功'],
    ['2026-10-01 10:08', 'admin',       '基础管理', '导出', '药品字典', '全量导出 1,286 个品规', '10.20.1.15', '成功']
  ];

  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function opts(list, cur, allLabel) {
    return '<option value="">' + allLabel + '</option>' + list.map(function (m) {
      return '<option value="' + esc(m) + '"' + (cur === m ? ' selected' : '') + '>' + esc(m) + '</option>';
    }).join('');
  }

  function rows() {
    return ROWS.filter(function (r) {
      var user = u(r[1]);
      var name = user ? user.name : r[1];
      if (kw && r[1].indexOf(kw) === -1 && name.indexOf(kw) === -1 &&
          r[4].indexOf(kw) === -1 && r[5].indexOf(kw) === -1) return false;
      if (module && r[2] !== module) return false;
      if (action && r[3] !== action) return false;
      var d = r[0].slice(0, 10);
      if (dFrom && d < dFrom) return false;
      if (dTo && d > dTo) return false;
      return true;
    });
  }

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:180px;" placeholder="账号 / 姓名 / 对象 / 详情" value="' + esc(kw) + '">' +
      '<select class="form-select" id="fModule" style="width:130px;">' + opts(MODULES, module, '全部模块') + '</select>' +
      '<select class="form-select" id="fAction" style="width:130px;">' + opts(ACTIONS, action, '全部操作') + '</select>' +
      '<input type="date" class="form-control" id="fFrom" style="width:150px;" value="' + esc(dFrom) + '">' +
      '<span class="text-secondary">至</span>' +
      '<input type="date" class="form-control" id="fTo" style="width:150px;" value="' + esc(dTo) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">写操作自动留痕 · 只读不可改</span>' +
      '</div></div></div>';
  }

  var ACTION_CLS = { '删除': 'bg-red-lt', '驳回': 'bg-red-lt', '审核': 'bg-green-lt', '新增': 'bg-blue-lt', '修改': 'bg-orange-lt', '导出': 'bg-purple-lt', '启用/禁用': 'bg-orange-lt' };
  function tableCard() {
    var list = rows();
    var html = list.map(function (r) {
      var user = u(r[1]);
      var name = user ? user.name : '—';
      var badge = '<span class="badge ' + (ACTION_CLS[r[3]] || 'bg-secondary-lt') + '">' + esc(r[3]) + '</span>';
      return '<tr>' +
        '<td class="text-secondary">' + esc(r[0]) + '</td>' +
        '<td><b>' + esc(r[1]) + '</b></td><td>' + esc(name) + '</td>' +
        '<td>' + esc(r[2]) + '</td><td>' + badge + '</td>' +
        '<td>' + esc(r[4]) + '</td><td class="text-secondary">' + esc(r[5]) + '</td>' +
        '<td class="text-secondary">' + esc(r[6]) + '</td></tr>';
    }).join('');
    if (!html) html = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">无匹配记录</td></tr>';
    return '<div class="card"><div class="card-header"><b>操作记录</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">共 ' + list.length + ' 条 · 时间倒序</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>时间</th><th>账号</th><th>姓名</th><th>模块</th><th>操作</th><th>对象</th><th>详情</th><th>IP</th></tr></thead>' +
      '<tbody>' + html + '</tbody></table></div></div>';
  }

  function renderAll() { content.innerHTML = filterBar() + tableCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      kw = v('fKw'); module = v('fModule'); action = v('fAction'); dFrom = v('fFrom'); dTo = v('fTo'); renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      kw = ''; module = ''; action = ''; dFrom = ''; dTo = ''; renderAll();
    });
  }
  renderAll();
})();
