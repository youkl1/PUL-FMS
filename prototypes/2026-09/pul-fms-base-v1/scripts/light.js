/**
 * light.js — 基站灯组维护（Round AT 2026-10-05 参考客户原系统布局）
 * 基站（挂院区→药房→货位，分灯组基站/单灯基站，含 IP/端口）｜灯组平铺、扫码连续新增、一基站≤200
 * 灯组可改绑基站 / 取消所属基站（变游离）；右栏默认显示选中基站灯组，可切「游离灯组」视图
 * 灯组表带「取药槽编号」列即对照情况查看；删除外键校验：基站下有灯组、灯组已对照取药槽均拦截
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'lamp', crumb: ['基础管理', '基站灯组维护'] });
  if (!content) return;

  var F = window.PUL_FACILITY, UI = window.PchUI, esc = UI.esc;
  var S = F.load();
  var sel = null;
  var lampView = 'station'; // station=选中基站灯组 | loose=游离灯组
  var filters = { pharmacy: '全部', kw: '', ip: '', lampKw: '', lampStatus: '全部' };

  function save() { F.save(S); }
  function byCode(code) { return F.stationOf(S, code); }
  function pharmacyOf(name) {
    for (var i = 0; i < S.pharmacies.length; i++) if (S.pharmacies[i].name === name) return S.pharmacies[i];
    return null;
  }
  function filtered() {
    return S.stations.filter(function (s) {
      if (filters.pharmacy !== '全部' && s.pharmacy !== filters.pharmacy) return false;
      if (filters.kw && (s.name + s.code).indexOf(filters.kw) === -1) return false;
      if (filters.ip && (s.ip || '').indexOf(filters.ip) === -1) return false;
      return true;
    });
  }
  function filteredLamps() {
    var list = lampView === 'loose' ? F.looseLamps(S) : F.stationLamps(S, sel);
    return list.filter(function (l) {
      if (filters.lampKw && l.addr.indexOf(filters.lampKw) === -1) return false;
      if (filters.lampStatus !== '全部' && l.status !== filters.lampStatus) return false;
      return true;
    });
  }
  function lightHtml(l) {
    return l.status === '在线' ? UI.light('正常') : '<span class="pch-light mute"><i class="pch-dot"></i>' + esc(l.status) + '</span>';
  }

  function filterBar() {
    var phOpts = ['全部'].concat(S.pharmacies.map(function (p) { return p.name; }))
      .map(function (o) { return '<option' + (filters.pharmacy === o ? ' selected' : '') + '>' + o + '</option>'; }).join('');
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<label class="form-label" style="margin:0;">药房</label><select class="form-select" id="fPh" style="width:130px;">' + phOpts + '</select>' +
      '<input class="form-control" id="fKw" style="width:140px;" placeholder="基站名称 / 编号" value="' + esc(filters.kw) + '">' +
      '<input class="form-control" id="fIp" style="width:130px;" placeholder="基站IP" value="' + esc(filters.ip) + '">' +
      '<input class="form-control" id="fLamp" style="width:140px;" placeholder="灯组编号" value="' + esc(filters.lampKw) + '">' +
      '<select class="form-select" id="fLs" style="width:100px;">' + ['全部', '在线', '离线'].map(function (o) { return '<option' + (filters.lampStatus === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增基站</button></div>' +
      '</div></div></div>';
  }

  // ===== 左栏：基站 =====
  function mainTable() {
    var list = filtered();
    var rows = list.map(function (s) {
      var on = s.status === '在线';
      var n = F.stationLamps(S, s.code).length;
      return '<tr class="pch-doc-row' + (s.code === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(s.code) + '">' +
        '<td style="font-family:Consolas,monospace;">' + esc(s.code) + '</td>' +
        '<td><b>' + esc(s.name) + '</b></td>' +
        '<td><span class="badge ' + (s.stype === '单灯基站' ? 'bg-cyan-lt' : 'bg-blue-lt') + '">' + esc(s.stype) + '</span></td>' +
        '<td style="font-family:Consolas,monospace;">' + esc(s.ip || '-') + '</td>' +
        '<td class="text-center">' + esc(s.port || '-') + '</td>' +
        '<td class="text-center">' + n + '</td>' +
        '<td>' + esc(s.pharmacy) + '</td>' +
        '<td>' + esc(s.slot || '-') + '</td>' +
        '<td>' + (on ? UI.light('正常') : '<span class="pch-light mute"><i class="pch-dot"></i>离线</span>') + '</td>' +
        '<td onclick="event.stopPropagation()"><div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-scan="' + esc(s.code) + '" title="扫码新增灯组">⚡</button>' +
          '<button class="btn btn-sm btn-outline-primary" data-edit="' + esc(s.code) + '" title="编辑">✎</button>' +
          '<button class="btn btn-sm btn-outline-danger" data-del="' + esc(s.code) + '" title="删除">✕</button>' +
        '</div></td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="10" class="text-center text-secondary" style="padding:32px;">无匹配基站</td></tr>';
    return '<div class="card" style="flex:1.35;min-width:0;">' +
      '<div class="card-header"><b>基站</b><span class="text-secondary ms-2" style="font-size:12.5px;">共 ' + list.length + ' 台 · 每台最多 ' + F.MAX_LAMPS + ' 个灯组</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter table-hover card-table table-sm">' +
      '<thead><tr><th>编号</th><th>名称</th><th>类型</th><th>基站IP</th><th class="text-center">端口</th><th class="text-center">灯组数</th><th>药房</th><th>货位</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  // ===== 右栏：灯组（选中基站 / 游离 两个视图） =====
  function lampPanel() {
    var s = byCode(sel);
    var looseN = F.looseLamps(S).length;
    var tabs = '<div class="btn-list">' +
      '<button class="btn btn-sm ' + (lampView === 'station' ? 'btn-primary' : 'btn-outline-primary') + '" data-view="station">选中基站灯组</button>' +
      '<button class="btn btn-sm ' + (lampView === 'loose' ? 'btn-primary' : 'btn-outline-primary') + '" data-view="loose">游离灯组（无基站）' + (looseN ? ' · ' + looseN : '') + '</button>' +
      '</div>';
    var list = filteredLamps();
    var body;
    if (lampView === 'station' && !s) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点击左侧基站查看其灯组</div>';
    } else {
      var rows = list.map(function (l) {
        return '<tr>' +
          '<td style="font-family:Consolas,monospace;"><b>' + esc(l.addr) + '</b></td>' +
          '<td>' + esc(l.name) + '</td>' +
          '<td>' + (l.cellCode
            ? '<span class="badge bg-green-lt" style="font-family:Consolas,monospace;" title="已在「取药槽灯组对照」绑定">' + esc(l.cellCode) + '</span>'
            : '<span class="text-secondary">-</span>') + '</td>' +
          '<td>' + lightHtml(l) + '</td>' +
          '<td><div class="btn-list">' +
            '<button class="btn btn-sm btn-outline-primary" data-lamp-edit="' + esc(l.addr) + '" title="编辑说明">✎</button>' +
            '<button class="btn btn-sm btn-outline-primary" data-lamp-move="' + esc(l.addr) + '" title="' + (l.stationCode ? '改绑基站' : '分配到基站') + '">⇄</button>' +
            (l.stationCode ? '<button class="btn btn-sm btn-outline-warning" data-lamp-loose="' + esc(l.addr) + '" title="取消所属基站（变游离）">⊘</button>' : '') +
            '<button class="btn btn-sm btn-outline-danger" data-lamp-del="' + esc(l.addr) + '" title="移除">✕</button>' +
          '</div></td></tr>';
      }).join('');
      if (!list.length) rows = '<tr><td colspan="5" class="text-center text-secondary" style="padding:24px;">' +
        (lampView === 'loose' ? '当前没有游离灯组' : '该基站暂无灯组——点行内 ⚡ 扫码新增') + '</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter card-table table-sm">' +
        '<thead><tr><th>灯组编号</th><th>名称</th><th>取药槽编号</th><th>状态</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }
    return '<div class="card" style="flex:1;min-width:0;">' +
      '<div class="card-header"><b>取药灯组</b>' +
      (lampView === 'station' && s ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(s.name) + '（' + F.stationLamps(S, s.code).length + '/' + F.MAX_LAMPS + '）</span>' : '') +
      '<div class="ms-auto">' + tabs + '</div></div>' + body +
      '</div>';
  }

  // ===== 新增 / 编辑基站（药房→货位联动；类型/IP/端口/说明） =====
  function openEdit(code) {
    var s = code ? byCode(code) : null;
    var phField = s
      ? '<input class="form-control" value="' + esc(s.org) + ' / ' + esc(s.pharmacy) + ' / ' + esc(s.slot || '-') + '" disabled>'
      : '<select class="form-select" id="lePh">' + S.pharmacies.map(function (p) {
          return '<option value="' + esc(p.name) + '">' + p.name + '（' + p.org + '）</option>';
        }).join('') + '</select>';
    UI.modalShell('bsEdit', s ? '编辑基站 · ' + s.name : '新增基站',
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">基站名称</label><input class="form-control" id="leName" value="' + esc(s ? s.name : '') + '" placeholder="如 门诊基站 2 号"></div>' +
      '<div class="col-6"><label class="form-label required">基站类型</label><div class="d-flex" style="gap:16px;padding-top:6px;">' +
        '<label class="form-check"><input class="form-check-input" type="radio" name="leType" value="灯组基站"' + (!s || s.stype === '灯组基站' ? ' checked' : '') + '><span class="form-check-label">灯组基站</span></label>' +
        '<label class="form-check"><input class="form-check-input" type="radio" name="leType" value="单灯基站"' + (s && s.stype === '单灯基站' ? ' checked' : '') + '><span class="form-check-label">单灯基站</span></label></div></div></div>' +
      '<div class="mb-3"><label class="form-label required">所属药房（院区随药房带出）</label>' + phField + '</div>' +
      (s ? '' : '<div class="mb-3"><label class="form-label required">所属货位</label><select class="form-select" id="leSlot"></select></div>') +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">基站IP</label><input class="form-control" id="leIp" value="' + esc(s ? s.ip : '') + '" placeholder="如 192.168.0.1"></div>' +
      '<div class="col-6"><label class="form-label required">端口号</label><input class="form-control" id="lePort" value="' + esc(s ? s.port : '8886') + '"></div></div>' +
      '<div class="mb-2"><label class="form-label">基站说明</label><input class="form-control" id="leRemark" value="' + esc(s ? s.remark : '') + '"></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="leOk">保存</button>', 560);
    var el = UI.open('bsEdit');
    function fillSlots() {
      var ph = pharmacyOf(el.querySelector('#lePh').value);
      var sl = el.querySelector('#leSlot');
      sl.innerHTML = (ph ? ph.slots.filter(function (x) { return x.status === '启用'; }) : [])
        .map(function (x) { return '<option>' + x.code + '</option>'; }).join('') || '<option value="">（该药房暂无启用货位）</option>';
    }
    if (!s) { el.querySelector('#lePh').addEventListener('change', fillSlots); fillSlots(); }
    el.querySelector('#leOk').addEventListener('click', function () {
      var name = el.querySelector('#leName').value.trim();
      var ip = el.querySelector('#leIp').value.trim();
      var port = el.querySelector('#lePort').value.trim();
      if (!name) { window.showToast('基站名称为必填项'); return; }
      if (!ip || !port) { window.showToast('基站IP / 端口号为必填项'); return; }
      var stype = el.querySelector('input[name="leType"]:checked').value;
      var remark = el.querySelector('#leRemark').value.trim();
      if (s) { s.name = name; s.stype = stype; s.ip = ip; s.port = port; s.remark = remark; }
      else {
        var phName = el.querySelector('#lePh').value;
        var ph = pharmacyOf(phName);
        var t = { code: 'BS' + String(Date.now()).slice(-4), name: name,
          org: ph ? ph.org : '', pharmacy: phName, slot: el.querySelector('#leSlot').value,
          stype: stype, ip: ip, port: port, remark: remark, status: '在线' };
        S.stations.push(t); sel = t.code;
      }
      save(); UI.close('bsEdit'); renderAll();
      window.showToast('基站「' + name + '」已保存');
    });
  }

  // ===== 扫码新增灯组（连续扫；重复拦截；单基站 200 上限） =====
  function openScan(stationCode) {
    var s = byCode(stationCode || sel);
    if (!s) return;
    if (F.stationLamps(S, s.code).length >= F.MAX_LAMPS) {
      window.showToast('基站「' + s.name + '」灯组已达 ' + F.MAX_LAMPS + ' 个上限，不能再登记'); return;
    }
    UI.modalShell('lampScan', '扫码新增灯组 · ' + s.name,
      '<div class="mb-3"><label class="form-label required">灯组条码（扫码枪扫入，回车确认）</label>' +
      '<input class="form-control" id="lsCode" placeholder="扫灯组机身条码，如 BS01-L05" autocomplete="off"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">连续扫码：每扫一只回车登记一只，窗口不关闭；重复扫同一地址码会提示已存在；单基站最多 ' + F.MAX_LAMPS + ' 个灯组。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>完成</button>', 460);
    var el = UI.open('lampScan');
    var inp = el.querySelector('#lsCode');
    inp.focus();
    inp.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var code = inp.value.trim();
      if (!code) return;
      if (F.findLamp(S, code)) { window.showToast('灯组地址码 ' + code + ' 已登记，勿重复扫码'); inp.value = ''; return; }
      if (F.stationLamps(S, s.code).length >= F.MAX_LAMPS) {
        window.showToast('基站灯组已达 ' + F.MAX_LAMPS + ' 个上限，' + code + ' 未登记'); inp.value = ''; return;
      }
      S.lamps.push({ addr: code, name: '灯组 ' + code.slice(-2), status: '在线', stationCode: s.code, cellCode: '', remark: '' });
      save(); inp.value = '';
      window.showToast('灯组 ' + code + ' 已登记到「' + s.name + '」，可继续扫下一只');
      renderAll();
      inp.focus();
    });
  }

  // ===== 灯组操作：编辑说明 / 改绑基站 / 取消所属基站 / 移除（已对照取药槽拦截） =====
  function openLampEdit(addr) {
    var l = F.findLamp(S, addr);
    if (!l) return;
    UI.modalShell('lampEdit', '编辑灯组 · ' + addr,
      '<div class="mb-3"><label class="form-label">灯组名称</label><input class="form-control" id="lmName" value="' + esc(l.name) + '"></div>' +
      '<div class="mb-2"><label class="form-label">灯组说明</label><input class="form-control" id="lmRemark" value="' + esc(l.remark || '') + '"></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="lmOk">保存</button>', 420);
    var el = UI.open('lampEdit');
    el.querySelector('#lmOk').addEventListener('click', function () {
      l.name = el.querySelector('#lmName').value.trim() || l.name;
      l.remark = el.querySelector('#lmRemark').value.trim();
      save(); UI.close('lampEdit'); renderAll();
      window.showToast('灯组 ' + addr + ' 已保存');
    });
  }
  function openLampMove(addr) {
    var l = F.findLamp(S, addr);
    if (!l) return;
    var cur = l.stationCode ? byCode(l.stationCode) : null;
    var opts = S.stations.map(function (st) {
      var full = F.stationLamps(S, st.code).length >= F.MAX_LAMPS && st.code !== l.stationCode;
      return '<option value="' + esc(st.code) + '"' + (st.code === l.stationCode ? ' selected' : '') + (full ? ' disabled' : '') + '>' +
        esc(st.name) + '（' + F.stationLamps(S, st.code).length + '/' + F.MAX_LAMPS + (full ? ' 已满' : '') + '）</option>';
    }).join('');
    UI.modalShell('lampMove', (l.stationCode ? '改绑基站' : '分配到基站') + ' · ' + addr,
      (cur ? '<div class="mb-2 text-secondary" style="font-size:12.5px;">当前所属：' + esc(cur.name) + '</div>'
           : '<div class="mb-2 text-secondary" style="font-size:12.5px;">当前为游离灯组（无所属基站）</div>') +
      '<div class="mb-2"><label class="form-label required">目标基站</label><select class="form-select" id="mvStation">' + opts + '</select></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="mvOk">保存</button>', 420);
    var el = UI.open('lampMove');
    el.querySelector('#mvOk').addEventListener('click', function () {
      var target = el.querySelector('#mvStation').value;
      if (target === l.stationCode) { window.showToast('灯组已属于该基站'); return; }
      if (F.stationLamps(S, target).length >= F.MAX_LAMPS) { window.showToast('目标基站灯组已达 ' + F.MAX_LAMPS + ' 个上限'); return; }
      l.stationCode = target;
      save(); UI.close('lampMove'); renderAll();
      var st = byCode(target);
      window.showToast('灯组 ' + addr + ' 已' + (cur ? '改绑' : '分配') + '到「' + (st ? st.name : target) + '」');
    });
  }
  function looseLamp(addr) {
    var l = F.findLamp(S, addr);
    if (!l) return;
    UI.confirm('确认取消灯组 <b>' + esc(addr) + '</b> 的所属基站？取消后变为游离灯组，可在「游离灯组」视图重新分配。', function () {
      l.stationCode = '';
      save(); renderAll();
      window.showToast('灯组 ' + addr + ' 已取消所属基站（游离）');
    }, '确认取消');
  }
  function delLamp(addr) {
    var l = F.findLamp(S, addr);
    if (!l) return;
    if (l.cellCode) { window.showToast('不能移除：灯组 ' + addr + ' 已对照取药槽 ' + l.cellCode + '，请先在「取药槽灯组对照」解绑'); return; }
    UI.confirm('移除灯组 <b>' + esc(addr) + '</b>？移除后需重新扫码登记。', function () {
      S.lamps = S.lamps.filter(function (x) { return x.addr !== addr; });
      save(); renderAll();
      window.showToast('灯组 ' + addr + ' 已移除');
    }, '确认移除');
  }
  function delStation(code) {
    var s = byCode(code);
    if (!s) return;
    var n = F.stationLamps(S, code).length;
    if (n) { window.showToast('不能删除：基站「' + s.name + '」下存在 ' + n + ' 个灯组，请先移除或改绑灯组'); return; }
    UI.confirm('确认删除基站 <b>' + esc(s.name) + '</b>？', function () {
      S.stations = S.stations.filter(function (x) { return x.code !== code; });
      if (sel === code) sel = S.stations.length ? S.stations[0].code : null;
      save(); renderAll();
      window.showToast('基站「' + s.name + '」已删除');
    }, '确认删除');
  }

  function renderAll() {
    content.innerHTML = filterBar() +
      '<div class="d-flex" style="gap:12px;align-items:stretch;">' + mainTable() + lampPanel() + '</div>';
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { pharmacy: document.getElementById('fPh').value, kw: document.getElementById('fKw').value.trim(),
        ip: document.getElementById('fIp').value.trim(), lampKw: document.getElementById('fLamp').value.trim(),
        lampStatus: document.getElementById('fLs').value };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { pharmacy: '全部', kw: '', ip: '', lampKw: '', lampStatus: '全部' }; renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', function () { openEdit(null); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); lampView = 'station'; renderAll(); });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEdit(b.getAttribute('data-edit')); });
    });
    content.querySelectorAll('[data-scan]').forEach(function (b) {
      b.addEventListener('click', function () { openScan(b.getAttribute('data-scan')); });
    });
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { delStation(b.getAttribute('data-del')); });
    });
    content.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { lampView = b.getAttribute('data-view'); renderAll(); });
    });
    content.querySelectorAll('[data-lamp-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openLampEdit(b.getAttribute('data-lamp-edit')); });
    });
    content.querySelectorAll('[data-lamp-move]').forEach(function (b) {
      b.addEventListener('click', function () { openLampMove(b.getAttribute('data-lamp-move')); });
    });
    content.querySelectorAll('[data-lamp-loose]').forEach(function (b) {
      b.addEventListener('click', function () { looseLamp(b.getAttribute('data-lamp-loose')); });
    });
    content.querySelectorAll('[data-lamp-del]').forEach(function (b) {
      b.addEventListener('click', function () { delLamp(b.getAttribute('data-lamp-del')); });
    });
  }

  if (S.stations.length) sel = S.stations[0].code;
  renderAll();
})();
