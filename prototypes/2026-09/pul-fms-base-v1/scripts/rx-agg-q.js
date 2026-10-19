/**
 * rx-agg-q.js — 处方药品汇总查询（出库管理）：发药量对账，药品×批次汇总（码 count 派生）
 * 口径：发药量 = 进行中 + 已完成 单的已绑码（已退药单的码已还回在架，不计入）
 * 门诊(rxDocs) / 住院(trayDocs) 合并汇总、拆两列；点行下钻单据与逐码
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'rxAggQ', crumb: ['出库管理', '处方药品汇总查询'] });
  if (!content) return;

  var W = window.PUL_WH, R = window.PUL_RX, UI = window.PchUI, esc = UI.esc;
  var S = R.load();
  var sel = null;   // 'idcode|batch'
  var filters = { drugName: '', channel: '全部', dateFrom: '', dateTo: '' };
  var COUNTED = ['发药中', '摆药中', '已完成'];   // 发药量口径（与库存占用一致）

  function ph() { return W.curPharm(); }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  // 全部发药码行（含单据归属与通道）
  function rows() {
    var out = [];
    function take(list, channel) {
      (list || []).forEach(function (d) {
        if (d.pharmacy !== ph()) return;
        if (COUNTED.indexOf(d.status) === -1) return;
        if (filters.channel !== '全部' && channel !== filters.channel) return;
        var dt = d.doneTime || d.date;
        if (filters.dateFrom && dt.slice(0, 10) < filters.dateFrom) return;
        if (filters.dateTo && dt.slice(0, 10) > filters.dateTo) return;
        (d.items || []).forEach(function (it) {
          (it.codes || []).forEach(function (c) {
            var p = R.parse(c.code);
            if (filters.drugName && (!p.dict || p.dict.drugName.indexOf(filters.drugName) === -1)) return;
            out.push({ doc: d, code: c, dict: p.dict, idcode: p.idcode, channel: channel, time: dt });
          });
        });
      });
    }
    take(S.rxDocs, '门诊');
    take(S.trayDocs, '住院');
    return out;
  }
  // 汇总：药品×批次（qty=码 count，门诊/住院拆分）
  function grouped() {
    var map = {};
    rows().forEach(function (r) {
      var key = r.idcode + '|' + r.code.batch;
      if (!map[key]) map[key] = { key: key, dict: r.dict, batch: r.code.batch, mz: 0, zy: 0, docs: {} };
      if (r.channel === '门诊') map[key].mz += 1; else map[key].zy += 1;
      map[key].docs[(r.doc.rxNo || r.doc.trayNo)] = { doc: r.doc, channel: r.channel };
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fDrugName" style="width:160px;" placeholder="药品通用名" value="' + esc(filters.drugName) + '">' +
      '<select class="form-select" id="fChannel" style="width:100px;">' +
        ['全部', '门诊', '住院'].map(function (o) { return opt(filters.channel, o, o === '全部' ? '通道' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fDateFrom" type="date" style="width:145px;" value="' + filters.dateFrom + '">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fDateTo" type="date" style="width:145px;" value="' + filters.dateTo + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(ph()) + ' · 发药量=进行中+已完成已绑码</span>' +
      '<div class="ms-auto"><button class="btn btn-outline-primary" id="btnExport">⬇ 导出</button></div>' +
      '</div></div></div>';
  }

  function summaryCard(list) {
    var rowsHtml = list.map(function (g, i) {
      var d = g.dict || {};
      return '<tr class="pch-doc-row' + (g.key === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(g.key) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(d.drugName || '（未知药品）') + '</b></td>' +
        '<td>' + esc(d.formSpec || '-') + ' / ' + esc(d.packSpec || '-') + '</td>' +
        '<td>' + esc(g.batch) + '</td>' +
        '<td>' + g.mz + '</td><td>' + g.zy + '</td><td><b>' + (g.mz + g.zy) + '</b></td><td>' + esc(d.unit || '') + '</td>' +
        '<td>' + Object.keys(g.docs).length + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="9" class="text-center text-secondary" style="padding:32px;">无匹配发药记录——先在「处方发药扫码 / 摆药单批量赋码」走单</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>发药汇总（药品 × 批次）</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">数量 = 码 count 派生 · 门诊/住院拆分 · 已退药不计入</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品通用名</th><th>药品规格</th><th>批次号</th><th>门诊</th><th>住院</th><th>合计</th><th>单位</th><th>涉及单据</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  // 下钻：该批次的单据列表 + 每单码明细；住院单可深链HIS摆药单查询
  function drillCard(list) {
    var g = null;
    list.forEach(function (x) { if (x.key === sel) g = x; });
    if (!g) {
      return '<div class="card"><div class="card-body text-center text-secondary" style="padding:28px;">点击汇总行，下钻查看单据与码明细</div></div>';
    }
    var entries = Object.keys(g.docs).map(function (k) { return g.docs[k]; });
    var blocks = entries.map(function (e) {
      var d = e.doc, docNo = d.rxNo || d.trayNo;
      var codes = [];
      (d.items || []).forEach(function (it) {
        (it.codes || []).forEach(function (c) { if (c.code.slice(0, 7) + '|' + c.batch === sel) codes.push(c); });
      });
      var codeRows = codes.map(function (c) {
        return '<span style="font-family:Consolas,monospace;font-size:12.5px;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:4px;padding:2px 8px;margin:2px 4px 2px 0;display:inline-block;">' + esc(c.code) + '</span>';
      }).join('');
      var link = e.channel === '住院'
        ? '<a class="btn btn-sm btn-outline-primary ms-auto" href="tray-q.html?trayNo=' + encodeURIComponent(docNo) + '">查看摆药单 →</a>' : '';
      return '<div style="border:1px solid #EEF2F7;border-radius:8px;padding:10px 14px;margin-bottom:10px;">' +
        '<div class="d-flex align-items-center flex-wrap" style="gap:10px;">' +
        '<b>' + esc(docNo) + '</b>' +
        '<span class="badge ' + (e.channel === '门诊' ? 'bg-blue-lt' : 'bg-purple-lt') + '">' + e.channel + '</span>' +
        UI.light(d.status) +
        '<span class="text-secondary" style="font-size:12.5px;">' + esc(d.patient) + ' · ' + esc(d.dept || ((d.ward || '') + (d.bed || '')) || '') + ' · ' + esc(d.doneTime || d.date) + '</span>' +
        link + '</div>' +
        '<div style="margin-top:8px;">' + codeRows + '</div></div>';
    }).join('');
    return '<div class="card"><div class="card-header"><b>单据下钻</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(g.dict ? g.dict.drugName : '') + ' · 批次 ' + esc(g.batch) + ' · ' + entries.length + ' 张单</span></div>' +
      '<div class="card-body" style="padding:12px 16px;">' + blocks + '</div></div>';
  }

  function renderAll() {
    var list = grouped();
    if (sel && !list.some(function (g) { return g.key === sel; })) sel = null;
    content.innerHTML = filterBar() + summaryCard(list) + drillCard(list);
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { drugName: v('fDrugName'), channel: v('fChannel'), dateFrom: v('fDateFrom'), dateTo: v('fDateTo') };
      sel = null; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { drugName: '', channel: '全部', dateFrom: '', dateTo: '' };
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
