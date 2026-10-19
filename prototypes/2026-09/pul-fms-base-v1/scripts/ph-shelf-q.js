/**
 * ph-shelf-q.js — 待上架药品查询：本药房在架且 phLoc 为空的码清单（只读）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'shelfQ', crumb: ['药房管理', '待上架药品查询'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load();
  var DICT = D.flat(DS);
  var filters = { kw: '', batch: '' };

  function ph() { return W.curPharm(); }
  function list() {
    return W.pharmacyStock(S, ph()).filter(function (c) {
      if (c.phLoc) return false;
      if (filters.batch && (c.batch || '').indexOf(filters.batch) === -1) return false;
      if (filters.kw) {
        var p = P.parseCode(c.code, DICT);
        var name = p.dict ? p.dict.drugName : '';
        if ((name + c.code).indexOf(filters.kw) === -1) return false;
      }
      return true;
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:200px;" placeholder="药品通用名 / 追溯码" value="' + esc(filters.kw) + '">' +
      '<input class="form-control" id="fBatch" style="width:130px;" placeholder="批次号" value="' + esc(filters.batch) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(ph()) + '</span>' +
      '<div class="ms-auto"><a class="btn btn-primary" href="ph-shelf.html">去上架 →</a></div>' +
      '</div></div></div>';
  }

  function table() {
    var rows = list();
    var trs = rows.map(function (c, i) {
      var p = P.parseCode(c.code, DICT);
      var st = W.expStatus(c.expDate);
      var cls = st === '过期' ? 'bad' : (st === '预警' ? 'warn' : 'ok');
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(p.dict ? p.dict.drugName : '未解析') + '</b></td>' +
        '<td>' + esc(c.batch) + '</td><td>' + esc(c.expDate) + '</td>' +
        '<td><span class="wh-exp-badge ' + cls + '">' + st + '</span></td>' +
        '<td class="text-secondary">' + esc(c._src || '—') + '</td></tr>';
    }).join('');
    if (!rows.length) trs = '<tr><td colspan="7" class="text-center text-secondary" style="padding:32px;">无待上架码——领用入库单后未绑货位的码会出现在此</td></tr>';
    return '<div class="card"><div class="card-header"><b>待上架码</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">在架且货位为空 · ' + rows.length + ' 个</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>效期状态</th><th>来源出库单</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table></div></div>';
  }

  function renderAll() { content.innerHTML = filterBar() + table(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { kw: v('fKw'), batch: v('fBatch') }; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { kw: '', batch: '' }; renderAll();
    });
  }
  renderAll();
})();
