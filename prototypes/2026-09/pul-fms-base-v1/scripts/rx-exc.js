/**
 * rx-exc.js — 赋码异常台账：待补绑 → 待复核 → 已确认/已改绑/已关闭；日结制，超 24h 升级提醒
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'rxExc', crumb: ['出库管理', '赋码异常台账'] });
  if (!content) return;

  var W = window.PUL_WH, R = window.PUL_RX, UI = window.PchUI, esc = UI.esc;
  var WH = W.load(), S = R.load();
  var tab = '待处理', kw = '';

  function save() { R.save(S); }
  function ph() { return W.curPharm(); }
  function me() { return (window.store.load().currentUser || {}).name || '演示员'; }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function drugName(dc) { var d = R.drugOf(dc); return d ? d.drugName : dc; }

  // 列表过滤：按当前药房 + 页签 + 关键字（异常单号/单据号/码/药品名）
  function list() {
    return S.excDocs.filter(function (e) {
      if (e.pharmacy !== ph()) return false;
      if (tab === '待处理') { if (e.status !== '待补绑' && e.status !== '待复核') return false; }
      else if (tab !== '全部' && e.status !== tab) return false;
      if (kw && (e.excNo + e.refNo + e.code + drugName(e.drugCode)).indexOf(kw) === -1) return false;
      return true;
    });
  }
  // 页签角标计数
  function counts() {
    var c = { 待处理: 0, 已确认: 0, 已改绑: 0, 已关闭: 0, 全部: 0 };
    S.excDocs.forEach(function (e) {
      if (e.pharmacy !== ph()) return;
      if (e.status === '待补绑' || e.status === '待复核') c['待处理']++;
      else if (c[e.status] != null) c[e.status]++;
      c['全部']++;
    });
    return c;
  }
  // 超 24h 未处理计数（升级提醒横幅用）
  function overdueCount() {
    var n = 0;
    S.excDocs.forEach(function (e) { if (e.pharmacy === ph() && R.overdue(e)) n++; });
    return n;
  }
  // 状态灯：已确认绿 / 已改绑蓝 / 已关闭灰 / 待处理橙；超 24h 追加红徽标
  function stHtml(e) {
    var od = R.overdue(e) ? ' <span class="badge bg-red-lt">超24h</span>' : '';
    if (e.status === '已确认') return '<span class="pch-light ok"><i class="pch-dot"></i>已确认</span>' + od;
    if (e.status === '已改绑') return '<span class="pch-light" style="color:#206bc4;"><i class="pch-dot" style="background:#206bc4;"></i>已改绑</span>' + od;
    if (e.status === '已关闭') return '<span class="pch-light" style="color:#667085;"><i class="pch-dot" style="background:#667085;"></i>已关闭</span>';
    return '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>' + esc(e.status) + '</span>' + od;
  }

  // 顶部筛选条 + 页签
  function filterBar() {
    var c = counts();
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:220px;" placeholder="异常单号 / 单据号 / 码 / 药品" value="' + esc(kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(ph()) + ' · 日结制：当日班后复核，超 24h 升级院区管理员</span>' +
      '</div></div></div>' +
      UI.tabsHeader([
        { key: '待处理', name: '待处理', badge: c['待处理'] || '' },
        { key: '已确认', name: '已确认', badge: c['已确认'] || '' },
        { key: '已改绑', name: '已改绑', badge: c['已改绑'] || '' },
        { key: '已关闭', name: '已关闭', badge: c['已关闭'] || '' },
        { key: '全部', name: '全部', badge: c['全部'] || '' }
      ], tab);
  }

  // 超 24h 升级提醒横幅
  function banner() {
    var n = overdueCount();
    if (!n) return '';
    return '<div class="alert alert-danger" style="padding:10px 16px;">⚠ ' + n +
      ' 条补绑记录超 24h 未处理，已升级提醒院区管理员（原型仅文案演示）。</div>';
  }

  // 行操作：待补绑=去补绑/关闭；待复核=确认/改绑/关闭；终态=展示处理人时间
  function ops(e) {
    if (e.status === '待补绑') {
      var href = e.refKind === 'tray' ? 'tray.html?trayNo=' + encodeURIComponent(e.refNo) : 'disp.html';
      return '<a class="btn btn-sm btn-primary" href="' + esc(href) + '">去补绑</a> ' +
        '<button class="btn btn-sm btn-outline-secondary" data-close="' + esc(e.excNo) + '">关闭</button>';
    }
    if (e.status === '待复核') {
      return '<button class="btn btn-sm btn-primary" data-confirm="' + esc(e.excNo) + '">确认</button> ' +
        '<button class="btn btn-sm btn-outline-warning" data-rebind="' + esc(e.excNo) + '">改绑</button> ' +
        '<button class="btn btn-sm btn-outline-secondary" data-close="' + esc(e.excNo) + '">关闭</button>';
    }
    return '<span class="text-secondary" style="font-size:12.5px;">' + esc(e.confirmBy || '') + (e.confirmTime ? ' · ' + esc(e.confirmTime) : '') + '</span>';
  }

  // 台账表格卡片
  function excCard() {
    var rows = list().map(function (e) {
      var codeCell = e.code
        ? '<span style="font-family:Consolas,monospace;font-size:12px;">' + esc(e.code) + '</span>' +
          (e.oldCode ? '<div class="text-secondary" style="font-size:11.5px;">原 <s>' + esc(e.oldCode) + '</s> 已回架</div>' : '')
        : '<span class="text-secondary">—</span>';
      return '<tr><td><b>' + esc(e.excNo) + '</b></td>' +
        '<td><span class="badge bg-azure-lt">' + esc(e.type) + '</span></td>' +
        '<td>' + esc(e.refNo) + '<div class="text-secondary" style="font-size:11.5px;">' + (e.refKind === 'tray' ? '摆药单' : '处方') + '</div></td>' +
        '<td>' + esc(drugName(e.drugCode)) + '</td>' +
        '<td>' + codeCell + '</td>' +
        '<td>' + esc(e.rule || '—') + '</td>' +
        '<td>' + esc(e.operator) + '<div class="text-secondary" style="font-size:11.5px;">' + esc(e.time) + '</div></td>' +
        '<td>' + stHtml(e) + '</td>' +
        '<td>' + ops(e) + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="9" class="text-center text-secondary" style="padding:28px;">本页签无记录——手动补绑（disp/tray 行内按钮）后记录出现在这里</td></tr>';
    return '<div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>异常单号</th><th>类型</th><th>来源单据</th><th>药品</th><th>补绑码</th><th>推荐规则</th><th>操作人/时间</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  // 确认：码核验标记转「已复核」
  function doConfirm(excNo) {
    var r = R.confirmExc(S, excNo, me());
    if (!r.ok) { window.showToast(r.msg); return; }
    save(); renderAll();
    window.showToast('已确认，码核验标记转「已复核」');
  }
  // 关闭：药已退等无需补绑情形，码池不动
  function doClose(excNo) {
    UI.confirm('关闭 <b>' + esc(excNo) + '</b>？适用于药已退等无需补绑情形，码池不动。', function () {
      var r = R.closeExc(S, excNo, me());
      if (!r.ok) { window.showToast(r.msg); return; }
      save(); renderAll();
      window.showToast('已关闭');
    }, '确认关闭');
  }
  // 改绑：弹窗选新码，原码回架
  function doRebind(excNo) {
    var e = R.excOf(S, excNo);
    if (!e) return;
    window.RxBind.rebind({
      wh: WH, state: S, pharmacy: ph(), exc: e,
      onDone: function () {
        save(); renderAll();
        window.showToast('已改绑：原码回架，新码已复核');
      }
    });
  }

  function renderAll() { content.innerHTML = filterBar() + banner() + excCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () { kw = v('fKw'); renderAll(); });
    document.getElementById('btnReset').addEventListener('click', function () { kw = ''; renderAll(); });
    content.querySelectorAll('[data-ptab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-ptab'); renderAll(); });
    });
    content.querySelectorAll('[data-confirm]').forEach(function (b) {
      b.addEventListener('click', function () { doConfirm(b.getAttribute('data-confirm')); });
    });
    content.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { doClose(b.getAttribute('data-close')); });
    });
    content.querySelectorAll('[data-rebind]').forEach(function (b) {
      b.addEventListener('click', function () { doRebind(b.getAttribute('data-rebind')); });
    });
  }

  renderAll();
})();
