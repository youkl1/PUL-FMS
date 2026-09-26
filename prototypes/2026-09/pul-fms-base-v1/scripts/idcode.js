/**
 * idcode.js — 标识码字典（主子表之子表）：标识码全量台账
 * 20 位追溯码的前 7 位 = 产品资源码；码等级 1=最小销售包装 / 2=中包装 / 3=大包装（扫上级码可展开下级）
 * 停用 = 不再参与解析（扫码按异常码拦截）；新增须挂到药品主表
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'idcode', crumb: ['基础管理', '标识码字典'] });
  if (!content) return;

  var D = window.PUL_DRUG, UI = window.PchUI, esc = UI.esc;
  var S = D.load();
  var filters = { idcode: '', drugName: '', level: '全部', status: '全部' };
  var page = 1, pageSize = 10;

  function save() { D.save(S); }
  function filtered() {
    return S.idcodes.filter(function (c) {
      var d = D.drugOf(S, c.drugCode) || {};
      if (filters.idcode && c.idcode.indexOf(filters.idcode) === -1) return false;
      if (filters.drugName && (d.drugName || '').indexOf(filters.drugName) === -1) return false;
      if (filters.level !== '全部' && c.level !== +filters.level) return false;
      if (filters.status !== '全部' && c.status !== filters.status) return false;
      return true;
    });
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fIdcode" style="width:150px;" placeholder="标识码" value="' + esc(filters.idcode) + '">' +
      '<input class="form-control" id="fDrugName" style="width:160px;" placeholder="药品通用名" value="' + esc(filters.drugName) + '">' +
      '<select class="form-select" id="fLevel" style="width:100px;">' + ['全部', '1', '2', '3'].map(function (o) { return opt(filters.level, o, o === '全部' ? '码等级' : o + ' 级'); }).join('') + '</select>' +
      '<select class="form-select" id="fStatus" style="width:90px;">' + ['全部', '启用', '停用'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto d-flex align-items-center" style="gap:10px;">' +
      '<span class="text-secondary" style="font-size:12.5px;">药品级属性（换算链/拆零标记）请去「药品字典」维护</span>' +
      '<button class="btn btn-success" id="btnSync">更新标识码</button>' +
      '<button class="btn btn-primary" id="btnAdd">+ 新增标识码</button></div>' +
      '</div></div></div>';
  }

  function table() {
    var list = filtered();
    var total = list.length, pages = Math.max(1, Math.ceil(total / pageSize));
    if (page > pages) page = pages;
    var slice = list.slice((page - 1) * pageSize, page * pageSize);
    var rows = slice.map(function (c, i) {
      var d = D.drugOf(S, c.drugCode) || {};
      var lvlBadge = c.level === 1 ? '<span class="badge bg-blue-lt">1 级</span>'
        : c.level === 2 ? '<span class="badge bg-purple-lt">2 级</span>'
        : '<span class="badge bg-orange-lt">3 级</span>';
      return '<tr>' +
        '<td>' + ((page - 1) * pageSize + i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;"><b>' + esc(c.idcode) + '</b></td>' +
        '<td>' + lvlBadge + '</td>' +
        '<td><b>' + esc(d.drugName || '（未知药品）') + '</b></td>' +
        '<td>' + esc(d.formSpec || '-') + '</td>' +
        '<td>' + esc(c.packSpec) + '</td><td>' + esc(c.packUnit) + '</td>' +
        '<td class="text-secondary">' + esc(d.drugCode ? D.unitsText(d) : '—') + '</td>' +
        '<td class="text-secondary">' + esc(d.dosForm || '-') + '</td>' +
        '<td>' + (c.status === '启用' ? UI.light('正常') : '<span class="pch-light mute"><i class="pch-dot"></i>停用</span>') + '</td>' +
        '<td><div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-edit="' + esc(c.idcode) + '">维护</button>' +
          '<button class="btn btn-sm btn-outline-secondary" data-toggle="' + esc(c.idcode) + '">' + (c.status === '启用' ? '停用' : '启用') + '</button>' +
        '</div></td></tr>';
    }).join('');
    if (!slice.length) rows = '<tr><td colspan="11" class="text-center text-secondary" style="padding:32px;">无匹配标识码</td></tr>';
    return '<div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>标识码</th><th>码等级</th><th>所属药品</th><th>制剂规格</th><th>包装规格</th><th>包装单位</th><th>换算关系</th><th>剂型</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer d-flex align-items-center" style="font-size:12.5px;">' +
      '<span class="text-secondary">共 ' + total + ' 条 · 停用后扫码按异常码拦截</span>' +
      '<div class="btn-list ms-auto">' +
      '<button class="btn btn-sm btn-outline-secondary" id="pgPrev"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>' +
      '<span class="text-secondary" style="padding:0 6px;">' + page + ' / ' + pages + '</span>' +
      '<button class="btn btn-sm btn-outline-secondary" id="pgNext"' + (page >= pages ? ' disabled' : '') + '>下一页</button>' +
      '</div></div></div>';
  }

  // ===== 新增 / 维护弹窗（挂药品主表；包装单位随包装规格自动解析） =====
  function openEdit(idcode) {
    var c = idcode ? D.idcodeOf(S, idcode) : null;
    var drugOpts = S.drugs.map(function (d) {
      return '<option value="' + esc(d.drugCode) + '"' + (c && c.drugCode === d.drugCode ? ' selected' : '') + '>' +
        esc(d.drugName) + ' · ' + esc(d.formSpec) + '</option>';
    }).join('');
    UI.modalShell('icEdit', c ? '维护标识码 · ' + c.idcode : '新增标识码',
      '<div class="mb-3"><label class="form-label required">所属药品（药品字典主表）</label><select class="form-select" id="ieDrug">' + drugOpts + '</select></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">标识码（7 位产品资源码）</label>' +
        '<input class="form-control" id="ieCode" value="' + esc(c ? c.idcode : '') + '" maxlength="7" ' + (c ? 'disabled' : '') + ' placeholder="如 8461935"></div>' +
      '<div class="col-6"><label class="form-label required">码等级</label><select class="form-select" id="ieLevel">' +
        [1, 2, 3].map(function (n) { return '<option' + (c && c.level === n ? ' selected' : '') + '>' + n + ' 级</option>'; }).join('') + '</select></div></div>' +
      '<div class="row g-3 mb-2">' +
      '<div class="col-6"><label class="form-label required">包装规格</label><input class="form-control" id="iePack" value="' + esc(c ? c.packSpec : '') + '" placeholder="如 箱60瓶"></div>' +
      '<div class="col-6"><label class="form-label required">包装单位</label><input class="form-control" id="ieUnit" value="' + esc(c ? c.packUnit : '') + '" placeholder="如 箱"></div></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">1 级=最小销售包装（盒/瓶）· 2 级=中包装 · 3 级=大包装（箱）；扫上级码按药品换算链展开下级码。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="ieOk">保存</button>', 560);
    var el = UI.open('icEdit');
    el.querySelector('#iePack').addEventListener('input', function () {
      el.querySelector('#ieUnit').value = D.parsePackUnit(el.querySelector('#iePack').value);
    });
    el.querySelector('#ieOk').addEventListener('click', function () {
      var code = el.querySelector('#ieCode').value.trim();
      var pack = el.querySelector('#iePack').value.trim();
      var unit = el.querySelector('#ieUnit').value.trim();
      if (!c && !/^\d{7}$/.test(code)) { window.showToast('标识码须为 7 位数字'); return; }
      if (!pack || !unit) { window.showToast('包装规格 / 包装单位为必填项'); return; }
      if (!c && D.idcodeOf(S, code)) { window.showToast('标识码 ' + code + ' 已存在'); return; }
      if (c) {
        c.drugCode = el.querySelector('#ieDrug').value;
        c.level = +el.querySelector('#ieLevel').value; c.packSpec = pack; c.packUnit = unit;
      } else {
        S.idcodes.unshift({ idcode: code, drugCode: el.querySelector('#ieDrug').value,
          level: +el.querySelector('#ieLevel').value, packSpec: pack, packUnit: unit, status: '启用' });
      }
      save(); UI.close('icEdit'); renderAll();
      window.showToast('标识码 ' + code + ' 已保存');
    });
  }

  function renderAll() {
    content.innerHTML = filterBar() + table();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { idcode: v('fIdcode'), drugName: v('fDrugName'), level: v('fLevel'), status: v('fStatus') };
      page = 1; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { idcode: '', drugName: '', level: '全部', status: '全部' };
      page = 1; renderAll();
    });
    document.getElementById('pgPrev').addEventListener('click', function () { if (page > 1) { page--; renderAll(); } });
    document.getElementById('pgNext').addEventListener('click', function () { page++; renderAll(); });
    document.getElementById('btnAdd').addEventListener('click', function () { openEdit(null); });
    document.getElementById('btnSync').addEventListener('click', function () {
      window.showToast('本期仅占位：从上级平台批量同步标识码功能后期开放');
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEdit(b.getAttribute('data-edit')); });
    });
    content.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = D.idcodeOf(S, b.getAttribute('data-toggle'));
        if (!c) return;
        c.status = c.status === '启用' ? '停用' : '启用';
        save(); renderAll();
        window.showToast('标识码 ' + c.idcode + ' 已' + c.status + (c.status === '停用' ? '，扫码将按异常码拦截' : ''));
      });
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  renderAll();
})();
