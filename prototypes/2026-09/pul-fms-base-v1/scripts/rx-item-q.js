/**
 * rx-item-q.js — 处方药品明细查询（出库管理）：门诊处方 ∪ 住院摆药的 item 级明细
 * 口径：谁拿了什么——单号 × 药品一行（应发 vs 已绑码数），点行看绑定的码
 * 与「处方药品汇总查询」互补：明细=业务视角按人按单，汇总=对账视角药品×批次
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'rxItemQ', crumb: ['出库管理', '处方药品明细查询'] });
  if (!content) return;

  var W = window.PUL_WH, R = window.PUL_RX, UI = window.PchUI, esc = UI.esc;
  var S = R.load();
  var sel = null;   // '单号|drugCode'
  var filters = { kw: '', drugName: '', channel: '全部', status: '全部', dateFrom: '', dateTo: '' };

  function ph() { return W.curPharm(); }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function drugName(dc) { var d = R.drugOf(dc); return d ? d.drugName : dc; }

  // 状态归并：进行中 = 发药中/摆药中
  function statusOf(d) {
    if (d.status === '发药中' || d.status === '摆药中') return '进行中';
    return d.status;   // 已完成 / 已退药 / 待发药 / 待摆药
  }

  // item 级行（门诊 rxDocs + 住院 trayDocs 统一形状）
  function rows() {
    var out = [];
    function take(list, channel) {
      (list || []).forEach(function (d) {
        if (d.pharmacy !== ph()) return;
        if (filters.channel !== '全部' && channel !== filters.channel) return;
        if (filters.status !== '全部' && statusOf(d) !== filters.status) return;
        var docNo = d.rxNo || d.trayNo;
        if (filters.kw && (docNo + d.patient + (d.dept || '') + (d.ward || '')).indexOf(filters.kw) === -1) return;
        var dt = d.doneTime || d.date;
        if (filters.dateFrom && dt.slice(0, 10) < filters.dateFrom) return;
        if (filters.dateTo && dt.slice(0, 10) > filters.dateTo) return;
        (d.items || []).forEach(function (it) {
          var name = drugName(it.drugCode);
          if (filters.drugName && name.indexOf(filters.drugName) === -1) return;
          out.push({ key: docNo + '|' + it.drugCode, doc: d, item: it, channel: channel, docNo: docNo, name: name, time: dt });
        });
      });
    }
    take(S.rxDocs, '门诊');
    take(S.trayDocs, '住院');
    return out;
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:180px;" placeholder="单号 / 患者 / 科室 / 病区" value="' + esc(filters.kw) + '">' +
      '<input class="form-control" id="fDrugName" style="width:150px;" placeholder="药品通用名" value="' + esc(filters.drugName) + '">' +
      '<select class="form-select" id="fChannel" style="width:100px;">' +
        ['全部', '门诊', '住院'].map(function (o) { return opt(filters.channel, o, o === '全部' ? '通道' : o); }).join('') + '</select>' +
      '<select class="form-select" id="fStatus" style="width:110px;">' +
        ['全部', '进行中', '已完成', '已退药'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fDateFrom" type="date" style="width:145px;" value="' + filters.dateFrom + '">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fDateTo" type="date" style="width:145px;" value="' + filters.dateTo + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(ph()) + '</span>' +
      '<div class="ms-auto"><button class="btn btn-outline-primary" id="btnExport">⬇ 导出</button></div>' +
      '</div></div></div>';
  }

  function listCard(list) {
    var rowsHtml = list.map(function (r) {
      var d = r.doc, it = r.item;
      var bound = (it.codes || []).length;
      var st = statusOf(d);
      var stHtml = st === '进行中'
        ? '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>' + esc(d.status) + '</span>'
        : UI.light(st);
      return '<tr class="pch-doc-row' + (r.key === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(r.key) + '">' +
        '<td><b>' + esc(r.docNo) + '</b></td>' +
        '<td><span class="badge ' + (r.channel === '门诊' ? 'bg-blue-lt' : 'bg-purple-lt') + '">' + r.channel + '</span></td>' +
        '<td>' + esc(d.patient) + '</td>' +
        '<td class="text-secondary">' + esc(d.dept || ((d.ward || '') + (d.bed || '')) || '—') + '</td>' +
        '<td><b>' + esc(r.name) + '</b></td>' +
        '<td>' + it.qty + ' ' + esc(it.unit || '') + '</td><td>' + bound + '</td>' +
        '<td>' + stHtml + '</td><td class="text-secondary">' + esc(r.time) + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="9" class="text-center text-secondary" style="padding:32px;">无匹配发药明细——先在「处方发药扫码 / 摆药单批量赋码」走单</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>发药明细（单据 × 药品）</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">已绑 = 该药品已扫码绑定的码数 · 点行看码</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>单号</th><th>通道</th><th>患者</th><th>科室/病区</th><th>药品通用名</th><th>应发</th><th>已绑码</th><th>状态</th><th>时间</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  function drillCard(list) {
    var r = null;
    list.forEach(function (x) { if (x.key === sel) r = x; });
    if (!r) {
      return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点击明细行，查看绑定的码</div></div>';
    }
    var codes = r.item.codes || [];
    var chips = codes.length ? codes.map(function (c) {
      return '<span style="font-family:Consolas,monospace;font-size:12.5px;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:4px;padding:2px 8px;margin:2px 4px 2px 0;display:inline-block;">' + esc(c.code) +
        (c.split === '是' ? ' <span class="badge bg-orange-lt">拆零 ' + esc(c.splitQty || '') + '</span>' : '') +
        (c.phLoc ? ' <b style="color:#206bc4;">' + esc(c.phLoc) + '</b>' : '') + '</span>';
    }).join('') : '<span class="text-secondary">尚未绑码（' + (statusOf(r.doc) === '进行中' ? '发药中，待扫码' : '无码') + '）</span>';
    var link = r.channel === '住院'
      ? '<a class="btn btn-sm btn-outline-primary ms-auto" href="tray-q.html?trayNo=' + encodeURIComponent(r.docNo) + '">查看摆药单 →</a>' : '';
    return '<div class="card"><div class="card-header"><b>绑定码明细</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(r.docNo) + ' · ' + esc(r.doc.patient) + ' · ' + esc(r.name) + ' · 批次见码</span>' +
      link + '</div>' +
      '<div class="card-body" style="padding:12px 16px;">' + chips + '</div></div>';
  }

  function renderAll() {
    var list = rows();
    if (sel && !list.some(function (x) { return x.key === sel; })) sel = null;
    content.innerHTML = filterBar() + listCard(list) + drillCard(list);
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { kw: v('fKw'), drugName: v('fDrugName'), channel: v('fChannel'), status: v('fStatus'), dateFrom: v('fDateFrom'), dateTo: v('fDateTo') };
      sel = null; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { kw: '', drugName: '', channel: '全部', status: '全部', dateFrom: '', dateTo: '' };
      sel = null; renderAll();
    });
    document.getElementById('btnExport').addEventListener('click', function () {
      window.showToast('已导出当前查询结果（原型演示）');
    });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
  }

  renderAll();
})();
