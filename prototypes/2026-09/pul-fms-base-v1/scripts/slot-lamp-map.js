/**
 * slot-lamp-map.js — 取药槽灯组对照（客户原菜单，参考客户原系统布局）
 * 左：扫/输取药槽（带出柜/层）+ 扫/输灯组（带出基站/IP）→ 绑定；右：绑定记录 + 解绑
 * 规则：一对一、仅物理柜（逻辑柜槽拦截）；换绑自动释放旧关系（双向同步见 facility-data.bindLamp）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'slotLampMap', crumb: ['系统管理', '取药槽灯组对照'] });
  if (!content) return;

  var F = window.PUL_FACILITY, UI = window.PchUI, esc = UI.esc;
  var S = F.load();
  var picked = { cell: null, lamp: null }; // { cell: findCell 结果, lamp: lamp 对象 }

  function save() { F.save(S); }

  // ===== 左：对照维护表单 =====
  function formCard() {
    var c = picked.cell, l = picked.lamp;
    var ro = function (v) { return '<input class="form-control" value="' + esc(v || '') + '" disabled>'; };
    return '<div class="card" style="flex:1;min-width:0;">' +
      '<div class="card-header"><b>取药槽灯组对照维护</b></div>' +
      '<div class="card-body">' +
      '<div class="mb-3"><label class="form-label required">取药槽编号（扫入/输入后回车）</label>' +
        '<input class="form-control" id="inpCell" placeholder="如 C1-01（物理）/ L1-C001（逻辑）" autocomplete="off"></div>' +
      '<div class="row g-3 mb-3">' +
        '<div class="col-4"><label class="form-label">取药柜编号</label>' + ro(c ? c.cabinet.code : '') + '</div>' +
        '<div class="col-4"><label class="form-label">取药柜说明</label>' + ro(c ? (c.cabinet.remark || c.cabinet.name) : '') + '</div>' +
        '<div class="col-4"><label class="form-label">摆药层编号</label>' + ro(c ? c.layer.code : '') + '</div></div>' +
      (c && c.cell.lampAddr ? '<div class="mb-3"><span class="badge bg-orange-lt">当前已绑定灯组 ' + esc(c.cell.lampAddr) + '，绑定新灯组将换绑</span></div>' : '') +
      '<hr style="margin:8px 0 16px;">' +
      '<div class="mb-3"><label class="form-label required">灯组编号（扫入/输入后回车）</label>' +
        '<input class="form-control" id="inpLamp" placeholder="如 BS01-L02" autocomplete="off"' + (c ? '' : ' disabled') + '></div>' +
      '<div class="row g-3 mb-3">' +
        '<div class="col-4"><label class="form-label">所属基站</label>' + ro(l ? (l.stationCode || '（游离）') : '') + '</div>' +
        '<div class="col-4"><label class="form-label">基站IP</label>' + ro(l && l.stationCode ? (stationIp(l.stationCode) || '-') : '') + '</div>' +
        '<div class="col-4"><label class="form-label">基站说明</label>' + ro(l && l.stationCode ? (stationRemark(l.stationCode) || '-') : '') + '</div></div>' +
      (l && l.cellCode ? '<div class="mb-3"><span class="badge bg-orange-lt">该灯组已绑定取药槽 ' + esc(l.cellCode) + '，绑定后将换绑到当前取药槽</span></div>' : '') +
      '<div class="d-flex" style="gap:10px;">' +
        '<button class="btn btn-primary" id="btnBind"' + ((c && l) ? '' : ' disabled') + '>绑定</button>' +
        '<button class="btn btn-outline-secondary" id="btnClear">清空重扫</button>' +
      '</div>' +
      '<div class="text-secondary mt-3" style="font-size:12.5px;">一对一：一个取药槽只能对照一个灯组（仅物理类型取药柜）；逻辑取药柜的取药槽无需对照灯组。</div>' +
      '</div></div>';
  }
  function stationIp(code) { var st = F.stationOf(S, code); return st ? st.ip : ''; }
  function stationRemark(code) { var st = F.stationOf(S, code); return st ? (st.remark || st.name) : ''; }

  // ===== 右：绑定记录（全部已绑取药槽） =====
  function recordsCard() {
    var recs = [];
    S.cabinets.forEach(function (cab) {
      cab.layers.forEach(function (lay) {
        lay.cells.forEach(function (cl) {
          if (cl.lampAddr) recs.push({ cab: cab, lay: lay, cell: cl });
        });
      });
    });
    var rows = recs.map(function (r, i) {
      var lp = F.findLamp(S, r.cell.lampAddr);
      var st = lp && lp.stationCode ? F.stationOf(S, lp.stationCode) : null;
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;"><b>' + esc(r.cell.code) + '</b></td>' +
        '<td style="font-family:Consolas,monospace;">' + esc(r.cell.lampAddr) + '</td>' +
        '<td>' + (st ? esc(st.name) : '<span class="text-secondary">（游离）</span>') + '</td>' +
        '<td style="font-family:Consolas,monospace;">' + (st ? esc(st.ip || '-') : '-') + '</td>' +
        '<td>' + esc(r.cab.code) + '</td>' +
        '<td>' + esc(r.lay.code) + '</td>' +
        '<td><button class="btn btn-sm btn-outline-danger" data-unbind="' + esc(r.cell.code) + '">解绑</button></td></tr>';
    }).join('');
    if (!recs.length) rows = '<tr><td colspan="8" class="text-center text-secondary" style="padding:32px;">暂无绑定记录</td></tr>';
    return '<div class="card" style="flex:1.35;min-width:0;">' +
      '<div class="card-header"><b>绑定记录</b><span class="text-secondary ms-2" style="font-size:12.5px;">共 ' + recs.length + ' 条</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table table-sm">' +
      '<thead><tr><th>序号</th><th>取药槽编号</th><th>灯组编号</th><th>所属基站</th><th>基站IP</th><th>取药柜编号</th><th>摆药层编号</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function renderAll() {
    content.innerHTML = '<div class="d-flex" style="gap:12px;align-items:flex-start;">' + formCard() + recordsCard() + '</div>';
    bind();
  }

  function bind() {
    var inpCell = document.getElementById('inpCell');
    var inpLamp = document.getElementById('inpLamp');
    inpCell.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var code = inpCell.value.trim();
      if (!code) return;
      var f = F.findCell(S, code);
      if (!f) { window.showToast('取药槽 ' + code + ' 不存在，请核对编号'); picked.cell = null; renderAll(); return; }
      if (f.cabinet.ctype === '逻辑') { window.showToast('逻辑取药柜的取药槽无需对照灯组'); picked.cell = null; renderAll(); return; }
      if (f.cabinet.status !== '启用') { window.showToast('取药柜「' + f.cabinet.name + '」已停用，不能对照'); picked.cell = null; renderAll(); return; }
      picked.cell = f;
      renderAll();
      document.getElementById('inpLamp').focus();
    });
    inpLamp.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var addr = inpLamp.value.trim();
      if (!addr) return;
      var lp = F.findLamp(S, addr);
      if (!lp) { window.showToast('灯组 ' + addr + ' 不存在，请先在「基站灯组维护」扫码登记'); picked.lamp = null; renderAll(); return; }
      picked.lamp = lp;
      renderAll();
      document.getElementById('btnBind').focus();
    });
    document.getElementById('btnClear').addEventListener('click', function () {
      picked = { cell: null, lamp: null }; renderAll();
    });
    document.getElementById('btnBind').addEventListener('click', function () {
      if (!picked.cell || !picked.lamp) return;
      var cellCode = picked.cell.cell.code, addr = picked.lamp.addr;
      var doBind = function () {
        var err = F.bindLamp(S, cellCode, addr);
        if (err) { window.showToast(err); return; }
        save();
        picked = { cell: null, lamp: null };
        renderAll();
        window.showToast('取药槽 ' + cellCode + ' ↔ 灯组 ' + addr + ' 绑定成功');
      };
      var warnings = [];
      if (picked.cell.cell.lampAddr && picked.cell.cell.lampAddr !== addr) warnings.push('取药槽当前绑定灯组 ' + picked.cell.cell.lampAddr);
      if (picked.lamp.cellCode && picked.lamp.cellCode !== cellCode) warnings.push('灯组当前绑定取药槽 ' + picked.lamp.cellCode);
      if (warnings.length) UI.confirm(warnings.join('；') + '。<br>绑定后将自动解除旧关系（换绑），确认继续？', doBind, '确认换绑');
      else doBind();
    });
    content.querySelectorAll('[data-unbind]').forEach(function (b) {
      b.addEventListener('click', function () {
        var cellCode = b.getAttribute('data-unbind');
        var f = F.findCell(S, cellCode);
        UI.confirm('确认解绑取药槽 <b>' + esc(cellCode) + '</b> 与灯组 <b>' + esc(f ? f.cell.lampAddr : '') + '</b>？', function () {
          var err = F.unbindLamp(S, cellCode);
          if (err) { window.showToast(err); return; }
          save(); renderAll();
          window.showToast('取药槽 ' + cellCode + ' 已解绑');
        }, '确认解绑');
      });
    });
    inpCell.focus();
  }

  renderAll();
})();
