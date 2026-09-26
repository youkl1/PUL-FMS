/**
 * ph-shelf.js — 扫码上下架：上架写 phLoc（药房货位字典），下架清空（码仍在架）
 * 已上架再扫上架 = 换货位；非本房在架拦截
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'shelf', crumb: ['药房管理', '扫码上下架'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load(), FS = window.PUL_FACILITY.load();
  var DICT = D.flat(DS);
  var loc = '';

  function save() { W.save(S); }
  function ph() { return W.curPharm(); }
  function stock() { return W.pharmacyStock(S, ph()); }
  function slots() {
    var p = null;
    (FS.pharmacies || []).forEach(function (x) { if (x.name === ph()) p = x; });
    return ((p && p.slots) || []).filter(function (s) { return s.status === '启用'; });
  }
  function drugNameOf(code20) {
    var p = P.parseCode(code20, DICT);
    return p.dict ? p.dict.drugName : '未解析';
  }
  if (!loc) {
    var sl = slots();
    loc = sl.length ? sl[0].code : '';
  }

  function stats() {
    var st = stock(), wait = 0, on = 0;
    st.forEach(function (c) { if (c.phLoc) on++; else wait++; });
    return '<div class="wh-stats">' +
      '<div class="wh-stat"><div class="wh-stat-num">' + st.length + '</div><div class="wh-stat-label">本房在架</div></div>' +
      '<div class="wh-stat warn"><div class="wh-stat-num">' + wait + '</div><div class="wh-stat-label">待上架</div></div>' +
      '<div class="wh-stat ok"><div class="wh-stat-num">' + on + '</div><div class="wh-stat-label">已上架</div></div>' +
      '</div>';
  }

  function bar() {
    var opts = slots().map(function (s) {
      return '<option value="' + esc(s.code) + '"' + (s.code === loc ? ' selected' : '') + '>' + esc(s.code) + ' · ' + esc(s.name) + '</option>';
    }).join('');
    if (!opts) opts = '<option value="">（本药房无启用货位，请先在药房货位字典维护）</option>';
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(ph()) + '</span>' +
      '<label class="form-label mb-0" style="font-size:13px;">上架货位</label>' +
      '<select class="form-select" id="fLoc" style="width:240px;">' + opts + '</select>' +
      '<button class="btn btn-primary" id="btnUp">▸ 扫码上架</button>' +
      '<button class="btn btn-outline-warning" id="btnDown">▸ 扫码下架</button>' +
      '<a class="btn btn-outline-secondary" href="ph-shelf-q.html">待上架查询</a>' +
      '</div></div></div>';
  }

  function onTable() {
    var rows = stock().filter(function (c) { return c.phLoc; });
    var trs = rows.map(function (c, i) {
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(drugNameOf(c.code)) + '</b></td>' +
        '<td>' + esc(c.batch) + '</td><td><span class="badge bg-green-lt">' + esc(c.phLoc) + '</span></td></tr>';
    }).join('');
    if (!rows.length) trs = '<tr><td colspan="5" class="text-center text-secondary" style="padding:24px;">尚无已上架码</td></tr>';
    return '<div class="card"><div class="card-header"><b>已上架</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + rows.length + ' 个码</span></div>' +
      '<div class="table-responsive" style="max-height:360px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>货位</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table></div></div>';
  }

  function openUp() {
    if (!loc) { window.showToast('请先选择货位'); return; }
    UI.openScan({
      title: '扫码上架 → ' + loc,
      hint: '扫本药房在架码写入货位 ' + loc + '；已上架则换到该货位',
      gate: 'in', node: ph(),
      onScan: function (code) {
        var src = W.findPhCode(S, code);
        if (!src || !stock().some(function (c) { return c.code === code; })) {
          return { level: 'bad', msg: '不在本药房在架（未入库 / 已退 / 已报损）' };
        }
        var old = src.phLoc || '';
        W.setPhLoc(S, code, loc);
        save(); renderAll();
        if (old && old !== loc) return { level: 'ok', msg: drugNameOf(code) + ' 换位 ' + old + ' → ' + loc };
        if (old === loc) return { level: 'warn', msg: '已在 ' + loc };
        return { level: 'ok', msg: drugNameOf(code) + ' 上架 ' + loc };
      },
      onClose: renderAll
    });
  }

  function openDown() {
    UI.openScan({
      title: '扫码下架',
      hint: '扫已上架码清空货位，码回到待上架（仍在本药房在架）',
      gate: 'in', node: ph(),
      onScan: function (code) {
        var src = W.findPhCode(S, code);
        if (!src || !stock().some(function (c) { return c.code === code; })) {
          return { level: 'bad', msg: '不在本药房在架' };
        }
        if (!src.phLoc) return { level: 'warn', msg: '该码尚未上架' };
        var old = src.phLoc;
        W.setPhLoc(S, code, '');
        save(); renderAll();
        return { level: 'ok', msg: drugNameOf(code) + ' 已下架（原 ' + old + '）' };
      },
      onClose: renderAll
    });
  }

  function renderAll() { content.innerHTML = stats() + bar() + onTable(); bind(); }
  function bind() {
    var sel = document.getElementById('fLoc');
    if (sel) sel.addEventListener('change', function () { loc = sel.value; });
    document.getElementById('btnUp').addEventListener('click', openUp);
    document.getElementById('btnDown').addEventListener('click', openDown);
  }
  renderAll();
})();
