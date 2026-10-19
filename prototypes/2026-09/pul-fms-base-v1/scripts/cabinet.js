/**
 * cabinet.js — 取药柜字典三栏联动（Round AT 2026-10-05 参考客户原系统布局）
 * 取药柜（挂院区→药房→货位，分物理/逻辑）→ 摆药层（可标高层）→ 取药槽（药品/灯组对照状态）
 * 物理柜：新增按层数×每层槽数自动生成；逻辑柜：自动 1 层，取药槽选药品生成（一药一槽、建槽即对照、无需灯组）
 * 删除外键校验：柜下有层/层下有槽/槽绑灯组 → 拦截并提示原因
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'cabinet', crumb: ['基础管理', '取药柜维护'] });
  if (!content) return;

  var F = window.PUL_FACILITY, UI = window.PchUI, esc = UI.esc, D = window.PUL_DRUG;
  var S = F.load();
  var selCab = null, selLayer = null;
  var filters = { pharmacy: '全部', slot: '全部', kw: '', bindDrug: '全部', bindLamp: '全部' };
  var checkedLayers = {};

  function save() { F.save(S); }
  function byCode(code) { return F.cabinetOf(S, code); }
  function selCabinet() { return byCode(selCab); }
  function layerOf(c, code) {
    if (!c) return null;
    for (var i = 0; i < c.layers.length; i++) if (c.layers[i].code === code) return c.layers[i];
    return null;
  }
  function cellCount(c) {
    return c.layers.reduce(function (n, l) { return n + l.cells.length; }, 0);
  }
  function drugSpec(drugCode) {
    if (!drugCode) return '';
    var d = D.drugOf(D.load(), drugCode);
    return d ? d.formSpec : '';
  }
  function pharmacyOf(name) {
    for (var i = 0; i < S.pharmacies.length; i++) if (S.pharmacies[i].name === name) return S.pharmacies[i];
    return null;
  }
  // 货位选项随药房联动
  function slotOptions(phName) {
    var out = [];
    S.pharmacies.forEach(function (p) {
      if (phName && phName !== '全部' && p.name !== phName) return;
      (p.slots || []).forEach(function (sl) { if (sl.status === '启用') out.push(sl.code); });
    });
    return out;
  }

  function filteredCabs() {
    return S.cabinets.filter(function (c) {
      if (filters.pharmacy !== '全部' && c.pharmacy !== filters.pharmacy) return false;
      if (filters.slot !== '全部' && c.slot !== filters.slot) return false;
      if (filters.kw && (c.name + c.code).indexOf(filters.kw) === -1) return false;
      return true;
    });
  }
  // 绑定筛选只作用于取药槽栏（柜/层为结构导航，不做绑定过滤）
  function filteredCells(layer) {
    if (!layer) return [];
    return layer.cells.filter(function (cl) {
      if (filters.bindDrug === '已绑' && !cl.drugCode) return false;
      if (filters.bindDrug === '未绑' && cl.drugCode) return false;
      if (filters.bindLamp === '已绑' && !cl.lampAddr) return false;
      if (filters.bindLamp === '未绑' && cl.lampAddr) return false;
      return true;
    });
  }

  function filterBar() {
    var phOpts = ['全部'].concat(S.pharmacies.map(function (p) { return p.name; }))
      .map(function (o) { return '<option' + (filters.pharmacy === o ? ' selected' : '') + '>' + o + '</option>'; }).join('');
    var slOpts = ['全部'].concat(slotOptions(filters.pharmacy))
      .map(function (o) { return '<option' + (filters.slot === o ? ' selected' : '') + '>' + o + '</option>'; }).join('');
    var bindOpts = function (cur) {
      return ['全部', '已绑', '未绑'].map(function (o) { return '<option' + (cur === o ? ' selected' : '') + '>' + o + '</option>'; }).join('');
    };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<label class="form-label" style="margin:0;">药房</label><select class="form-select" id="fPh" style="width:130px;">' + phOpts + '</select>' +
      '<label class="form-label" style="margin:0;">货位</label><select class="form-select" id="fSlot" style="width:110px;">' + slOpts + '</select>' +
      '<input class="form-control" id="fKw" style="width:150px;" placeholder="取药柜名称 / 编号" value="' + esc(filters.kw) + '">' +
      '<label class="form-label" style="margin:0;">绑定药品</label><select class="form-select" id="fBd" style="width:90px;">' + bindOpts(filters.bindDrug) + '</select>' +
      '<label class="form-label" style="margin:0;">绑定灯组</label><select class="form-select" id="fBl" style="width:90px;">' + bindOpts(filters.bindLamp) + '</select>' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增取药柜</button></div>' +
      '</div></div></div>';
  }

  // ===== 左栏：取药柜 =====
  function cabPanel() {
    var list = filteredCabs();
    var rows = list.map(function (c) {
      var off = c.status !== '启用';
      return '<tr class="pch-doc-row' + (c.code === selCab ? ' pch-doc-sel' : '') + '" data-sel="' + esc(c.code) + '"' + (off ? ' style="opacity:.55;"' : '') + '>' +
        '<td style="font-family:Consolas,monospace;">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(c.name) + '</b></td>' +
        '<td><span class="badge ' + (c.ctype === '逻辑' ? 'bg-purple-lt' : 'bg-blue-lt') + '">' + c.ctype + '</span></td>' +
        '<td>' + esc(c.slot || '-') + '</td>' +
        '<td class="text-center">' + c.layers.length + '</td>' +
        '<td onclick="event.stopPropagation()"><div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-edit="' + esc(c.code) + '" title="编辑">✎</button>' +
          '<button class="btn btn-sm ' + (off ? 'btn-outline-success' : 'btn-outline-warning') + '" data-toggle="' + esc(c.code) + '" title="' + (off ? '启用' : '停用') + '">' + (off ? '▶' : '⏸') + '</button>' +
          '<button class="btn btn-sm btn-outline-danger" data-del="' + esc(c.code) + '" title="删除">✕</button>' +
        '</div></td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="6" class="text-center text-secondary" style="padding:28px;">无匹配取药柜</td></tr>';
    return '<div class="card" style="flex:1.15;min-width:0;">' +
      '<div class="card-header"><b>取药柜</b><span class="text-secondary ms-2" style="font-size:12.5px;">共 ' + list.length + ' 台</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter table-hover card-table table-sm">' +
      '<thead><tr><th>编号</th><th>名称</th><th>类型</th><th>货位</th><th class="text-center">层数</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  // ===== 中栏：摆药层（勾选批量设高层；高层=位置偏高、上货需登高，仅提示标记） =====
  function layerPanel() {
    var c = selCabinet();
    var body;
    if (!c) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点击左侧取药柜查看摆药层</div>';
    } else {
      var rows = c.layers.map(function (l) {
        var ck = checkedLayers[l.code] ? ' checked' : '';
        return '<tr class="pch-doc-row' + (l.code === selLayer ? ' pch-doc-sel' : '') + '" data-layer="' + esc(l.code) + '">' +
          '<td onclick="event.stopPropagation()"><input type="checkbox" class="form-check-input" data-ck="' + esc(l.code) + '"' + ck + '></td>' +
          '<td style="font-family:Consolas,monospace;"><b>' + esc(l.code) + '</b></td>' +
          '<td>' + esc(l.name) + '</td>' +
          '<td class="text-center">' + l.cells.length + '</td>' +
          '<td>' + (l.high
            ? '<span class="badge bg-orange-lt" title="位置偏高，上货/补货需登高作业（仅提示标记）">高层</span>'
            : '<span class="text-secondary">否</span>') + '</td>' +
          '<td onclick="event.stopPropagation()"><button class="btn btn-sm btn-outline-danger" data-layer-del="' + esc(l.code) + '" title="删除">✕</button></td></tr>';
      }).join('');
      if (!c.layers.length) rows = '<tr><td colspan="6" class="text-center text-secondary" style="padding:24px;">该取药柜暂无摆药层</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter table-hover card-table table-sm">' +
        '<thead><tr><th style="width:30px;"></th><th>层编号</th><th>名称</th><th class="text-center">槽数</th><th title="位置偏高，上货/补货需登高作业（仅提示标记）">高层</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }
    return '<div class="card" style="flex:1;min-width:0;">' +
      '<div class="card-header"><b>摆药层</b>' +
      (c ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(c.name) + '</span>' : '') +
      (c ? '<div class="ms-auto"><button class="btn btn-sm btn-outline-primary" id="btnBatchHigh">批量设置高层</button></div>' : '') +
      '</div>' + body + '</div>';
  }

  // ===== 右栏：取药槽（药品/灯组对照状态；逻辑柜可「选药品生成取药槽」） =====
  function cellPanel() {
    var c = selCabinet();
    var layer = layerOf(c, selLayer) || (c && c.layers[0]) || null;
    var body;
    if (!c) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点击左侧取药柜查看取药槽</div>';
    } else if (!layer) {
      body = '<div class="text-center text-secondary" style="padding:28px;">该取药柜暂无摆药层</div>';
    } else {
      var cells = filteredCells(layer);
      var rows = cells.map(function (cl) {
        return '<tr>' +
          '<td style="font-family:Consolas,monospace;"><b>' + esc(cl.code) + '</b></td>' +
          '<td>' + (cl.drugCode ? '<b>' + esc(cl.drugName) + '</b>' : '<span class="text-secondary">-</span>') + '</td>' +
          '<td>' + (cl.drugCode ? esc(drugSpec(cl.drugCode)) : '<span class="text-secondary">-</span>') + '</td>' +
          '<td>' + (cl.lampAddr
            ? '<span class="badge bg-green-lt" style="font-family:Consolas,monospace;">' + esc(cl.lampAddr) + '</span>'
            : (c.ctype === '逻辑' ? '<span class="text-secondary" title="逻辑取药柜取药槽无需对照灯组">无需</span>' : '<span class="text-secondary">-</span>')) + '</td>' +
          '<td>' + (cl.drugCode ? '<span class="badge bg-azure-lt">占用</span>' : '<span class="badge bg-secondary-lt">空闲</span>') + '</td>' +
          '<td><button class="btn btn-sm btn-outline-danger" data-cell-del="' + esc(cl.code) + '" title="删除">✕</button></td></tr>';
      }).join('');
      if (!cells.length) rows = '<tr><td colspan="6" class="text-center text-secondary" style="padding:24px;">' +
        (c.ctype === '逻辑' ? '暂无取药槽——点右上「选药品生成取药槽」' : '该摆药层暂无匹配取药槽') + '</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter card-table table-sm">' +
        '<thead><tr><th>取药槽编号</th><th>药品通用名</th><th>药品规格</th><th>绑定灯组</th><th>状态</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }
    return '<div class="card" style="flex:1.25;min-width:0;">' +
      '<div class="card-header"><b>取药槽</b>' +
      (layer ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(layer.name) + '（' + esc(c.name) + '）</span>' : '') +
      (c && c.ctype === '逻辑' ? '<div class="ms-auto"><button class="btn btn-sm btn-primary" id="btnGenCells">+ 选药品生成取药槽</button></div>' : '') +
      '</div>' + body +
      '<div class="card-footer text-secondary" style="font-size:12.5px;">' +
      (c && c.ctype === '逻辑'
        ? '逻辑取药柜：一个药品一个取药槽（一对一），建槽即完成药品对照，取药槽无需对照灯组。'
        : '药品对照在「取药槽药品对照」、灯组对照在「取药槽灯组对照」扫码维护（系统管理菜单）。') +
      '</div></div>';
  }

  // ===== 新增 / 编辑取药柜（新增：药房→货位联动 + 类型；物理柜按层数×槽数生成，逻辑柜自动 1 层） =====
  function openCabEdit(code) {
    var c = code ? byCode(code) : null;
    var phField = c
      ? '<input class="form-control" value="' + esc(c.org) + ' / ' + esc(c.pharmacy) + ' / ' + esc(c.slot || '-') + '" disabled>'
      : '<select class="form-select" id="cePh">' + S.pharmacies.map(function (p) {
          return '<option value="' + esc(p.name) + '">' + p.name + '（' + p.org + '）</option>';
        }).join('') + '</select>';
    var typeField = c
      ? '<input class="form-control" value="' + c.ctype + '取药柜（类型保存后不可改）" disabled>'
      : '<div class="d-flex" style="gap:16px;">' +
        '<label class="form-check"><input class="form-check-input" type="radio" name="ceType" value="物理" checked><span class="form-check-label">物理取药柜</span></label>' +
        '<label class="form-check"><input class="form-check-input" type="radio" name="ceType" value="逻辑"><span class="form-check-label">逻辑取药柜</span></label></div>';
    var structField = c ? '' :
      '<div id="cePhys">' +
      '<div class="row g-3 mb-2">' +
      '<div class="col-6"><label class="form-label required">摆药层数量</label><input class="form-control" id="ceLayers" type="number" min="1" max="10" value="3"></div>' +
      '<div class="col-6"><label class="form-label required">每层取药槽数量</label><input class="form-control" id="ceCells" type="number" min="1" max="20" value="6"></div></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">保存后自动生成摆药层与取药槽；层级结构保存后不可改（改结构需停用后重建）。</div></div>' +
      '<div id="ceLogicHint" class="text-secondary" style="font-size:12.5px;display:none;">逻辑取药柜保存后自动生成 1 个摆药层；取药槽不预建，保存后在右栏「选药品生成取药槽」（一个药品一个槽，建槽即完成药品对照，无需对照灯组）。</div>';
    UI.modalShell('cbEdit', c ? '编辑取药柜 · ' + c.name : '新增取药柜',
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">取药柜名称</label><input class="form-control" id="ceName" value="' + esc(c ? c.name : '') + '" placeholder="如 门诊取药柜 3 号"></div>' +
      '<div class="col-6"><label class="form-label">顺序</label><input class="form-control" id="ceSeq" type="number" min="0" value="' + (c ? c.seq : 1000) + '"></div></div>' +
      '<div class="mb-3"><label class="form-label required">所属药房（院区随药房带出）</label>' + phField + '</div>' +
      (c ? '' : '<div class="mb-3"><label class="form-label required">所属货位</label><select class="form-select" id="ceSlot"></select></div>') +
      '<div class="mb-3"><label class="form-label required">取药柜类型</label>' + typeField + '</div>' +
      '<div class="mb-3"><label class="form-label">取药柜说明</label><input class="form-control" id="ceRemark" value="' + esc(c ? c.remark : '') + '"></div>' +
      structField,
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="ceOk">保存</button>', 640);
    var el = UI.open('cbEdit');
    // 新增：药房→货位联动
    function fillSlots() {
      var phName = el.querySelector('#cePh').value;
      var sl = el.querySelector('#ceSlot');
      sl.innerHTML = slotOptions(phName).map(function (o) { return '<option>' + o + '</option>'; }).join('') ||
        '<option value="">（该药房暂无启用货位）</option>';
    }
    if (!c) {
      el.querySelector('#cePh').addEventListener('change', fillSlots);
      fillSlots();
      el.querySelectorAll('input[name="ceType"]').forEach(function (r) {
        r.addEventListener('change', function () {
          var phys = el.querySelector('input[name="ceType"]:checked').value === '物理';
          el.querySelector('#cePhys').style.display = phys ? 'block' : 'none';
          el.querySelector('#ceLogicHint').style.display = phys ? 'none' : 'block';
        });
      });
    }
    el.querySelector('#ceOk').addEventListener('click', function () {
      var name = el.querySelector('#ceName').value.trim();
      if (!name) { window.showToast('取药柜名称为必填项'); return; }
      var seq = +el.querySelector('#ceSeq').value || 1000;
      var remark = el.querySelector('#ceRemark').value.trim();
      if (c) { c.name = name; c.seq = seq; c.remark = remark; }
      else {
        var phName = el.querySelector('#cePh').value;
        var ph = pharmacyOf(phName);
        var ctype = el.querySelector('input[name="ceType"]:checked').value;
        var ls;
        if (ctype === '逻辑') {
          ls = [{ code: 'L1', name: '第 1 摆药层', high: false, cells: [] }];
        } else {
          var ln = Math.max(1, Math.min(10, +el.querySelector('#ceLayers').value || 3));
          var cn = Math.max(1, Math.min(20, +el.querySelector('#ceCells').value || 6));
          ls = [];
          for (var i = 1; i <= ln; i++) {
            var cells = [];
            for (var j = 1; j <= cn; j++) cells.push({ code: 'C' + i + '-' + ('0' + j).slice(-2), name: i + ' 层 ' + j + ' 槽', status: '空闲', drugCode: '', drugName: '', lampAddr: '' });
            ls.push({ code: 'L' + i, name: '第 ' + i + ' 摆药层', high: false, cells: cells });
          }
        }
        var t = { code: 'CB' + String(Date.now()).slice(-4), name: name,
          org: ph ? ph.org : '', pharmacy: phName, slot: el.querySelector('#ceSlot').value,
          ctype: ctype, seq: seq, remark: remark, status: '启用', layers: ls };
        S.cabinets.push(t); selCab = t.code; selLayer = 'L1';
      }
      save(); UI.close('cbEdit'); renderAll();
      window.showToast('取药柜「' + name + '」已保存');
    });
  }

  // ===== 逻辑柜：选药品生成取药槽（一药一槽、建槽即对照） =====
  function openGenCells() {
    var c = selCabinet();
    if (!c || c.ctype !== '逻辑') return;
    var drugs = D.load().drugs.filter(function (d) { return d.status === '启用'; });
    var rows = drugs.map(function (d) {
      var dup = c.layers[0].cells.some(function (cl) { return cl.drugCode === d.drugCode; });
      return '<tr>' +
        '<td><input type="checkbox" class="form-check-input gc-check" data-code="' + esc(d.drugCode) + '"' + (dup ? ' disabled' : '') + '></td>' +
        '<td style="font-family:Consolas,monospace;">' + esc(d.drugCode) + '</td>' +
        '<td><b>' + esc(d.drugName) + '</b></td><td>' + esc(d.formSpec) + '</td>' +
        '<td>' + (dup ? '<span class="badge bg-secondary-lt">本柜已对照</span>' : '') + '</td></tr>';
    }).join('');
    UI.modalShell('genCells', '选药品生成取药槽 · ' + c.name,
      '<div class="mb-2"><input class="form-control" id="gcKw" placeholder="按通用名 / 编码过滤"></div>' +
      '<div class="table-responsive" style="max-height:320px;overflow:auto;"><table class="table table-vcenter card-table table-sm" id="gcTable">' +
      '<thead><tr><th style="width:30px;"></th><th>药品编码</th><th>通用名</th><th>规格</th><th></th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">勾选的药品各生成一个取药槽（一对一），建槽即完成药品对照。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="gcOk">生成取药槽</button>', 680);
    var el = UI.open('genCells');
    el.querySelector('#gcKw').addEventListener('input', function () {
      var kw = this.value.trim();
      el.querySelectorAll('#gcTable tbody tr').forEach(function (tr) {
        tr.style.display = (!kw || tr.textContent.indexOf(kw) !== -1) ? '' : 'none';
      });
    });
    el.querySelector('#gcOk').addEventListener('click', function () {
      var codes = [];
      el.querySelectorAll('.gc-check:checked').forEach(function (cb) { codes.push(cb.getAttribute('data-code')); });
      if (!codes.length) { window.showToast('请先勾选药品'); return; }
      var picked = drugs.filter(function (d) { return codes.indexOf(d.drugCode) !== -1; });
      var r = F.genLogicCells(c, picked);
      save(); UI.close('genCells'); renderAll();
      window.showToast('已生成 ' + r.added + ' 个取药槽' + (r.skipped ? '，跳过本柜已对照 ' + r.skipped + ' 个' : ''));
    });
  }

  // ===== 删除（外键校验：被引用即拦截并说明原因） =====
  function delCabinet(code) {
    var c = byCode(code);
    if (!c) return;
    if (c.layers.length) { window.showToast('不能删除：「' + c.name + '」下存在 ' + c.layers.length + ' 个摆药层，请先删除摆药层'); return; }
    UI.confirm('确认删除取药柜 <b>' + esc(c.name) + '</b>？', function () {
      S.cabinets = S.cabinets.filter(function (x) { return x.code !== code; });
      if (selCab === code) { selCab = S.cabinets.length ? S.cabinets[0].code : null; selLayer = null; }
      save(); renderAll();
      window.showToast('取药柜「' + c.name + '」已删除');
    }, '确认删除');
  }
  function delLayer(code) {
    var c = selCabinet();
    var l = layerOf(c, code);
    if (!l) return;
    if (l.cells.length) { window.showToast('不能删除：摆药层 ' + code + ' 下存在 ' + l.cells.length + ' 个取药槽，请先删除取药槽'); return; }
    UI.confirm('确认删除摆药层 <b>' + esc(l.name) + '</b>？', function () {
      c.layers = c.layers.filter(function (x) { return x.code !== code; });
      if (selLayer === code) selLayer = c.layers.length ? c.layers[0].code : null;
      save(); renderAll();
      window.showToast('摆药层 ' + code + ' 已删除');
    }, '确认删除');
  }
  function delCell(code) {
    var f = F.findCell(S, code);
    if (!f) return;
    if (f.cell.lampAddr) { window.showToast('不能删除：取药槽 ' + code + ' 已绑定灯组 ' + f.cell.lampAddr + '，请先在「取药槽灯组对照」解绑'); return; }
    var doDel = function () {
      f.layer.cells = f.layer.cells.filter(function (x) { return x.code !== code; });
      save(); renderAll();
      window.showToast('取药槽 ' + code + ' 已删除');
    };
    if (f.cell.drugCode) UI.confirm('取药槽 <b>' + esc(code) + '</b> 已对照药品 <b>' + esc(f.cell.drugName) + '</b>，删除将同时解除对照。确认删除？', doDel, '确认删除');
    else UI.confirm('确认删除取药槽 <b>' + esc(code) + '</b>？', doDel, '确认删除');
  }

  function renderAll() {
    content.innerHTML = filterBar() +
      '<div class="d-flex" style="gap:12px;align-items:stretch;">' + cabPanel() + layerPanel() + cellPanel() + '</div>';
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { pharmacy: document.getElementById('fPh').value, slot: document.getElementById('fSlot').value,
        kw: document.getElementById('fKw').value.trim(),
        bindDrug: document.getElementById('fBd').value, bindLamp: document.getElementById('fBl').value };
      renderAll();
    });
    document.getElementById('fPh').addEventListener('change', function () {
      filters.pharmacy = this.value; filters.slot = '全部'; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { pharmacy: '全部', slot: '全部', kw: '', bindDrug: '全部', bindLamp: '全部' }; renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', function () { openCabEdit(null); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        selCab = tr.getAttribute('data-sel');
        var c = selCabinet();
        selLayer = c && c.layers.length ? c.layers[0].code : null;
        checkedLayers = {};
        renderAll();
      });
    });
    content.querySelectorAll('[data-layer]').forEach(function (tr) {
      tr.addEventListener('click', function () { selLayer = tr.getAttribute('data-layer'); renderAll(); });
    });
    content.querySelectorAll('[data-ck]').forEach(function (cb) {
      cb.addEventListener('change', function () { checkedLayers[cb.getAttribute('data-ck')] = cb.checked; });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openCabEdit(b.getAttribute('data-edit')); });
    });
    content.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = byCode(b.getAttribute('data-toggle'));
        c.status = c.status === '启用' ? '停用' : '启用';
        save(); renderAll();
        window.showToast('取药柜「' + c.name + '」已' + c.status);
      });
    });
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { delCabinet(b.getAttribute('data-del')); });
    });
    content.querySelectorAll('[data-layer-del]').forEach(function (b) {
      b.addEventListener('click', function () { delLayer(b.getAttribute('data-layer-del')); });
    });
    content.querySelectorAll('[data-cell-del]').forEach(function (b) {
      b.addEventListener('click', function () { delCell(b.getAttribute('data-cell-del')); });
    });
    var bh = document.getElementById('btnBatchHigh');
    if (bh) bh.addEventListener('click', function () {
      var c = selCabinet();
      var codes = Object.keys(checkedLayers).filter(function (k) { return checkedLayers[k]; });
      if (!codes.length) { window.showToast('请先勾选摆药层'); return; }
      // 全部已是高层 → 批量取消，否则批量置高层
      var allHigh = codes.every(function (cd) { var l = layerOf(c, cd); return l && l.high; });
      codes.forEach(function (cd) { var l = layerOf(c, cd); if (l) l.high = !allHigh; });
      save(); checkedLayers = {}; renderAll();
      window.showToast('已' + (allHigh ? '取消' : '设置') + ' ' + codes.length + ' 个摆药层的高层标记');
    });
    var gc = document.getElementById('btnGenCells');
    if (gc) gc.addEventListener('click', openGenCells);
  }

  if (S.cabinets.length) { selCab = S.cabinets[0].code; selLayer = S.cabinets[0].layers.length ? S.cabinets[0].layers[0].code : null; }
  renderAll();
})();
