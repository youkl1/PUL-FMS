/**
 * light.js — 基站灯组字典（主子表）：基站挂药房，一基站多取药灯组；灯组扫码新增
 * 本期只做字典结构；药品↔取药槽↔灯组绑定后期再议（客户拍板 2026-09-21）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'lamp', crumb: ['基础管理', '基站灯组'] });
  if (!content) return;

  var F = window.PUL_FACILITY, UI = window.PchUI, esc = UI.esc;
  var S = F.load();
  var sel = null;
  var filters = { pharmacy: '全部', kw: '' };

  function save() { F.save(S); }
  function byCode(code) {
    for (var i = 0; i < S.stations.length; i++) if (S.stations[i].code === code) return S.stations[i];
    return null;
  }
  function filtered() {
    return S.stations.filter(function (s) {
      if (filters.pharmacy !== '全部' && s.pharmacy !== filters.pharmacy) return false;
      if (filters.kw && (s.name + s.code).indexOf(filters.kw) === -1) return false;
      return true;
    });
  }

  function filterBar() {
    var phOpts = ['全部'].concat(S.pharmacies.map(function (p) { return p.name; }))
      .map(function (o) { return '<option' + (filters.pharmacy === o ? ' selected' : '') + '>' + o + '</option>'; }).join('');
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fPh" style="width:150px;">' + phOpts + '</select>' +
      '<input class="form-control" id="fKw" style="width:170px;" placeholder="基站名称 / 编码" value="' + esc(filters.kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增基站</button></div>' +
      '</div></div></div>';
  }

  function mainTable() {
    var list = filtered();
    var rows = list.map(function (s, i) {
      var on = s.status === '在线';
      return '<tr class="pch-doc-row' + (s.code === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(s.code) + '">' +
        '<td>' + (i + 1) + '</td><td style="font-family:Consolas,monospace;">' + esc(s.code) + '</td>' +
        '<td><b>' + esc(s.name) + '</b></td>' +
        '<td><span class="badge bg-azure-lt">' + esc(s.org) + '</span></td>' +
        '<td>' + esc(s.pharmacy) + '</td>' +
        '<td class="text-center">' + s.lamps.length + '</td>' +
        '<td>' + (on ? UI.light('正常') : '<span class="pch-light mute"><i class="pch-dot"></i>离线</span>') + '</td>' +
        '<td onclick="event.stopPropagation()"><div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-edit="' + esc(s.code) + '">编辑</button>' +
        '</div></td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="8" class="text-center text-secondary" style="padding:32px;">无匹配基站</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter table-hover card-table">' +
      '<thead><tr><th>序号</th><th>基站编码</th><th>基站名称</th><th>所属院区</th><th>所属药房</th><th class="text-center">灯组数</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer text-secondary" style="font-size:12.5px;">共 ' + list.length + ' 台基站 · 基站必须指定所属药房 · 点行查看取药灯组子表</div></div>';
  }

  function subCard() {
    var s = byCode(sel);
    var body;
    if (!s) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点击基站行，查看其取药灯组</div>';
    } else {
      var rows = s.lamps.map(function (l, i) {
        var on = l.status === '在线';
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;"><b>' + esc(l.addr) + '</b></td>' +
          '<td>' + esc(l.name) + '</td>' +
          '<td>' + (on ? UI.light('正常') : '<span class="pch-light mute"><i class="pch-dot"></i>离线</span>') + '</td>' +
          '<td><button class="btn btn-sm btn-outline-danger" data-lamp-del="' + esc(l.addr) + '">移除</button></td></tr>';
      }).join('');
      if (!s.lamps.length) rows = '<tr><td colspan="5" class="text-center text-secondary" style="padding:24px;">该基站暂无灯组——点右上「扫码新增灯组」</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>灯组地址码</th><th>灯组名称</th><th>状态</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>取药灯组子表</b>' +
      (s ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(s.name) + '（' + esc(s.pharmacy) + '）</span>' : '') +
      (s ? '<div class="ms-auto"><button class="btn btn-sm btn-primary" id="btnScanLamp">⚡ 扫码新增灯组</button></div>' : '') +
      '</div>' + body +
      '<div class="card-footer text-secondary" style="font-size:12.5px;">取药灯组一律扫码新增（扫灯组机身条码登记地址码），不支持手工录入；一个取药槽对应一个取药灯组，槽位绑定在「取药柜」字典基础上后期开放。</div></div>';
  }

  function openEdit(code) {
    var s = code ? byCode(code) : null;
    var phField = s
      ? '<input class="form-control" value="' + esc(s.org) + ' / ' + esc(s.pharmacy) + '" disabled>'
      : '<select class="form-select" id="lePh">' + S.pharmacies.map(function (p) {
          return '<option value="' + esc(p.name) + '" data-org="' + esc(p.org) + '">' + p.name + '（' + p.org + '）</option>';
        }).join('') + '</select>';
    UI.modalShell('bsEdit', s ? '编辑基站 · ' + s.name : '新增基站',
      '<div class="mb-3"><label class="form-label required">基站名称</label><input class="form-control" id="leName" value="' + esc(s ? s.name : '') + '" placeholder="如 门诊基站 2 号"></div>' +
      '<div class="mb-2"><label class="form-label required">所属药房（院区随药房带出）</label>' + phField + '</div>' +
      '<div class="text-secondary" style="font-size:12.5px;">基站是灯组的无线路由：一台基站带多个取药灯组，覆盖一个药房的取药区域。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="leOk">保存</button>', 480);
    var el = UI.open('bsEdit');
    el.querySelector('#leOk').addEventListener('click', function () {
      var name = el.querySelector('#leName').value.trim();
      if (!name) { window.showToast('基站名称为必填项'); return; }
      if (s) { s.name = name; }
      else {
        var phSel = el.querySelector('#lePh');
        var opt = phSel.options[phSel.selectedIndex];
        var t = { code: 'BS' + String(Date.now()).slice(-4), name: name,
          org: opt.getAttribute('data-org'), pharmacy: opt.value, status: '在线', lamps: [] };
        S.stations.push(t); sel = t.code;
      }
      save(); UI.close('bsEdit'); renderAll();
      window.showToast('基站「' + name + '」已保存');
    });
  }

  // 扫码新增灯组：模拟扫码枪连续输入（回车即入子表，输入框不清焦点）
  function openScan() {
    var s = byCode(sel);
    if (!s) return;
    UI.modalShell('lampScan', '扫码新增灯组 · ' + s.name,
      '<div class="mb-3"><label class="form-label required">灯组条码（扫码枪扫入，回车确认）</label>' +
      '<input class="form-control" id="lsCode" placeholder="扫灯组机身条码，如 BS01-L05" autocomplete="off"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">连续扫码：每扫一只回车登记一只，窗口不关闭；重复扫同一地址码会提示已存在。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>完成</button>', 460);
    var el = UI.open('lampScan');
    var inp = el.querySelector('#lsCode');
    inp.focus();
    inp.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var code = inp.value.trim();
      if (!code) return;
      var dup = S.stations.some(function (st) {
        return st.lamps.some(function (l) { return l.addr === code; });
      });
      if (dup) { window.showToast('灯组地址码 ' + code + ' 已登记，勿重复扫码'); inp.value = ''; return; }
      s.lamps.push({ code: code, name: '灯组 ' + (s.lamps.length + 1), addr: code, status: '在线' });
      save(); inp.value = '';
      window.showToast('灯组 ' + code + ' 已登记到「' + s.name + '」，可继续扫下一只');
      // 子表行数实时刷新（弹窗不关）
      renderAll();
      inp.focus();
    });
  }

  function renderAll() {
    content.innerHTML = filterBar() + mainTable() + subCard();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { pharmacy: document.getElementById('fPh').value, kw: document.getElementById('fKw').value.trim() };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { pharmacy: '全部', kw: '' }; renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', function () { openEdit(null); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEdit(b.getAttribute('data-edit')); });
    });
    var bs = document.getElementById('btnScanLamp');
    if (bs) bs.addEventListener('click', openScan);
    content.querySelectorAll('[data-lamp-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = byCode(sel); if (!s) return;
        var addr = b.getAttribute('data-lamp-del');
        UI.confirm('移除灯组 <b>' + esc(addr) + '</b>？移除后对应取药槽将无灯可亮。', function () {
          s.lamps = s.lamps.filter(function (l) { return l.addr !== addr; });
          save(); renderAll();
          window.showToast('灯组 ' + addr + ' 已移除');
        }, '确认移除');
      });
    });
  }

  if (S.stations.length) sel = S.stations[0].code;
  renderAll();
})();
