/**
 * drug.js — 药品字典（主子表之主表）：药品级属性 + 单位换算链 + 拆零标记
 * 选中药品行 → 下方标识码子表（该药品的全部标识码，可新增）；新增药品默认「待审核」→ 审核后启用
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'drug', crumb: ['基础管理', '药品字典维护'] });
  if (!content) return;

  var D = window.PUL_DRUG, UI = window.PchUI, esc = UI.esc;
  var S = D.load();
  var sel = null;
  var filters = { kw: '', category: '全部', unpack: '全部', status: '全部', warehouse: '全部' };
  // 库房选项来自设施字典（药品必须指定所属库房；同一标识码在不同库房分别建档）
  function warehouses() {
    var f = window.PUL_FACILITY ? window.PUL_FACILITY.load() : { warehouses: [] };
    return f.warehouses.map(function (w) { return w.name; });
  }

  function save() { D.save(S); }
  function nowText() { return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' '); }
  var sync = window.PUL_DRUG_SYNC({ D: D, UI: UI, esc: esc, S: S, warehouses: warehouses, save: save, renderAll: renderAll, nowText: nowText });
  function selDrug() { return D.drugOf(S, sel); }
  function categories() {
    var t = ['全部'];
    S.drugs.forEach(function (d) { if (t.indexOf(d.category) === -1) t.push(d.category); });
    return t;
  }
  function filtered() {
    return S.drugs.filter(function (d) {
      if (filters.kw && (d.drugName + d.drugCode).indexOf(filters.kw) === -1) return false;
      if (filters.category !== '全部' && d.category !== filters.category) return false;
      if (filters.unpack === '门诊拆零' && d.opUnpack !== '是') return false;
      if (filters.unpack === '住院拆零' && d.ipUnpack !== '是') return false;
      if (filters.status !== '全部' && d.status !== filters.status) return false;
      if (filters.warehouse !== '全部' && d.warehouse !== filters.warehouse) return false;
      return true;
    });
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fKw" style="width:170px;" placeholder="药品通用名 / 编码" value="' + esc(filters.kw) + '">' +
      '<select class="form-select" id="fWh" style="width:130px;">' + ['全部'].concat(warehouses()).map(function (o) { return opt(filters.warehouse, o, o === '全部' ? '所属库房' : o); }).join('') + '</select>' +
      '<select class="form-select" id="fCat" style="width:110px;">' + categories().map(function (o) { return opt(filters.category, o, o === '全部' ? '分类' : o); }).join('') + '</select>' +
      '<select class="form-select" id="fUnpack" style="width:110px;">' + ['全部', '门诊拆零', '住院拆零'].map(function (o) { return opt(filters.unpack, o, o === '全部' ? '拆零标记' : o); }).join('') + '</select>' +
      '<select class="form-select" id="fStatus" style="width:100px;">' + ['全部', '启用', '待审核', '停用'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto btn-list">' +
      '<button class="btn btn-outline-primary" id="btnUpdIc">⇅ 更新标识码</button>' +
      '<button class="btn btn-outline-primary" id="btnHis">⇅ HIS 导入</button>' +
      '<button class="btn btn-primary" id="btnAdd">+ 新增药品</button>' +
      '</div></div></div></div>';
  }

  function unpackBadge(v) {
    return v === '是' ? '<span class="badge bg-orange-lt">拆零</span>' : '<span class="text-secondary">否</span>';
  }
  function statusHtml(d) {
    if (d.status === '启用') return UI.light('正常');
    if (d.status === '待审核') return '<span class="pch-light bad"><i class="pch-dot"></i>待审核</span>';
    return '<span class="pch-light mute"><i class="pch-dot"></i>' + esc(d.status) + '</span>';
  }

  function txt(v) { return v === undefined || v === null || v === '' ? '—' : esc(v); }
  function money(v) { return v === undefined || v === null || v === '' ? '—' : '¥' + Number(v).toFixed(2); }

  // 列表只展示常用字段；/api/DM_DrugInfo 其余必填项仍在数据层与新增/编辑弹窗完整维护。
  var MAIN_COLS = [
    ['药品编码', function (d) { return txt(d.medCode); }],
    ['通用名', function (d) { return '<b>' + txt(d.drugName) + '</b>'; }],
    ['制剂规格', function (d) { return txt(d.formSpec); }],
    ['剂型', function (d) { return txt(d.dosForm); }],
    ['所属库房', function (d) { return '<span class="badge bg-blue-lt">' + txt(d.warehouse) + '</span>'; }],
    ['分类', function (d) { return txt(d.category); }],
    ['批准文号', function (d) { return txt(d.approval); }],
    ['生产企业', function (d) { return txt(d.maker); }],
    ['计价单位', function (d) { return txt(d.saleUnit); }],
    ['库存单位', function (d) { return txt(d.baseUnit); }],
    ['换算关系', function (d) { return txt(D.unitsRatio(d)); }],
    ['拆零最小单位', function (d) { return d.minUnit ? '1' + esc(d.baseUnit) + ' = ' + esc(d.minUnit.per) + esc(d.minUnit.u) : '—'; }],
    ['门诊拆零', function (d) { return unpackBadge(d.opUnpack); }],
    ['住院拆零', function (d) { return unpackBadge(d.ipUnpack); }],
    ['产品价格', function (d) { return money(d.price); }],
    ['状态', function (d) { return statusHtml(d); }]
  ];

  function mainTable() {
    var list = filtered();
    var rows = list.map(function (d, i) {
      var op = '<div class="btn-list">' +
        '<button class="btn btn-sm btn-outline-primary" data-edit="' + esc(d.drugCode) + '">编辑</button>' +
        (d.status === '待审核' ? '<button class="btn btn-sm btn-outline-success" data-audit="' + esc(d.drugCode) + '">审核</button>' : '') +
        '</div>';
      return '<tr class="pch-doc-row' + (d.drugCode === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.drugCode) + '">' +
        '<td>' + (i + 1) + '</td>' + MAIN_COLS.map(function (col) { return '<td>' + col[1](d) + '</td>'; }).join('') +
        '<td onclick="event.stopPropagation()">' + op + '</td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="' + (MAIN_COLS.length + 2) + '" class="text-center text-secondary" style="padding:32px;">无匹配药品</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th>' + MAIN_COLS.map(function (col) { return '<th>' + esc(col[0]) + '</th>'; }).join('') + '<th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  // 标识码子表：业务字段仅保留需求方指定六项；序号/操作为功能列，保留维护、启停、删除能力。
  function subCard() {
    var d = selDrug();
    var body;
    if (!d) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点击药品行，查看其标识码子表</div>';
    } else {
      var codes = S.idcodes.filter(function (c) { return c.drugCode === d.drugCode; });
      var rows = codes.map(function (c, i) {
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td>' + c.level + ' 级</td>' +
          '<td class="text-secondary">' + esc(d.maker || '—') + '</td>' +
          '<td><b>' + esc(d.drugName) + '</b></td><td>' + esc(d.dosForm || '—') + '</td>' +
          '<td class="text-secondary">' + esc(d.approval || '—') + '</td><td>' + esc(c.packSpec) + '</td>' +
          '<td><div class="btn-list">' +
            '<button class="btn btn-sm btn-outline-primary" data-ic-edit="' + esc(c.idcode) + '">维护</button>' +
            '<button class="btn btn-sm btn-outline-secondary" data-ic-toggle="' + esc(c.idcode) + '">' + (c.status === '启用' ? '停用' : '启用') + '</button>' +
            '<button class="btn btn-sm btn-outline-danger" data-ic-del="' + esc(c.idcode) + '">删除</button>' +
          '</div></td></tr>';
      }).join('');
      if (!codes.length) rows = '<tr><td colspan="8" class="text-center text-secondary" style="padding:24px;">该药品暂无标识码——点右上「新增标识码」或「更新标识码」</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>层级</th><th>生产企业信息</th><th>药名通用名</th><th>剂型</th><th>批准文号</th><th>包装规格</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>标识码子表</b>' +
      (d ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.drugName) + ' ' + esc(d.formSpec) + '</span>' : '') +
      (d ? '<div class="ms-auto"><button class="btn btn-sm btn-outline-primary" id="btnAddIc">+ 新增标识码</button></div>' : '') +
      '</div>' + body + '</div>';
  }

  // ===== 新增 / 编辑药品弹窗（药品级属性 + 拆零标记；2026-10-10 拍板：大包装换算两字段撤除——换算链两级/三级不定，改由下方「标识码子表」按层级+换算比例分组维护） =====
  // 单位下拉选项（2026-10-10 拍板：库存/销售/拆零最小单位由手填改下拉）：取自全局「包装单位字典」PACK_UNIT（启用项按 sort 排）；
  // 当前值不在字典时并入兜底——历史数据含字典外单位（如「毫升」）编辑时不丢值
  function unitOpts(cur, allowEmpty) {
    var items = (window.PUL && window.PUL.DICT_ITEMS && window.PUL.DICT_ITEMS.PACK_UNIT) || [];
    var names = items.filter(function (it) { return it.status === '启用'; })
      .sort(function (a, b) { return a.sort - b.sort; })
      .map(function (it) { return it.name; });
    if (cur && names.indexOf(cur) === -1) names.push(cur);
    var html = names.map(function (o) { return '<option' + (cur === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
    return allowEmpty ? '<option value="">（无）</option>' + html : html;
  }
  // ===== 新增 / 编辑药品弹窗（/api/DM_DrugInfo 必填字段全量维护；一级标识码/包装规格仍由子表维护） =====
  function openEdit(drugCode) {
    var d = drugCode ? D.drugOf(S, drugCode) : null;
    function val(k, fallback) { return d && d[k] !== undefined && d[k] !== null ? d[k] : fallback; }
    function field(id, label, control, opt) {
      opt = opt || {};
      var required = !opt.optional;
      var req = required && !opt.auto ? ' data-req="' + esc(label) + '"' : '';
      return '<div class="col-' + (opt.span || 4) + ' mb-3"><label class="form-label' + (required ? ' required' : '') + '">' + esc(label) + '</label>' +
        control.replace('%%REQ%%', req) + '</div>';
    }
    function input(id, label, value, opt) {
      opt = opt || {};
      var control = '<input class="form-control" id="' + id + '" type="' + (opt.type || 'text') + '" value="' + esc(value) + '"%%REQ%%' +
        (opt.auto ? ' disabled' : '') + (opt.min !== undefined ? ' min="' + opt.min + '"' : '') + (opt.step ? ' step="' + opt.step + '"' : '') + '>';
      return field(id, label, control, opt);
    }
    function select(id, label, value, options, opt) {
      var html = options.map(function (o) {
        var pair = Array.isArray(o) ? o : [o, o];
        return '<option value="' + esc(pair[0]) + '"' + (String(pair[0]) === String(value) ? ' selected' : '') + '>' + esc(pair[1]) + '</option>';
      }).join('');
      return field(id, label, '<select class="form-select" id="' + id + '"%%REQ%%>' + html + '</select>', opt || {});
    }
    function unit(id, label, value, allowEmpty, optional) {
      return field(id, label, '<select class="form-select" id="' + id + '"%%REQ%%>' + unitOpts(value, allowEmpty) + '</select>', { optional: optional });
    }
    function section(title, html) {
      return '<div class="mb-2"><b style="font-size:13.5px;">' + esc(title) + '</b></div><div class="row g-3">' + html + '</div>';
    }
    var body =
      section('基础信息',
        input('deDrugCode', '药品内码', d ? d.drugCode : '保存后自动生成', { auto: true }) +
        input('deMedCode', '药品编码', val('medCode', '')) +
        input('deName', '药品通用名', val('drugName', '')) +
        input('deMedList', '医保编码', val('medListCodg', '')) +
        input('deForm', '制剂规格', val('formSpec', '')) +
        input('deDos', '剂型', val('dosForm', '')) +
        unit('deDosageUnit', '制剂单位', val('dosageUnit', '片')) +
        input('deDrugcate', '药理分类', val('drugcate', '')) +
        select('deDrugType', '药品类型', val('drugType', '普通'), ['普通', '精神1', '精神2']) +
        select('deCat', '分类', val('category', '西药'), ['西药', '中成药', '中药饮片', '麻精药品', '特殊管理药品', '未分类'], { optional: true }) +
        input('deAppr', '批准文号', val('approval', '')) +
        input('deMaker', '生产企业名称', val('maker', ''))) +
      section('包装、计价与换算',
        unit('deMinPackUnit', '最小包装单位', val('minPackUnit', '盒')) +
        input('deMinPackQty', '最小包装数量', val('minPackQty', 1), { type: 'number', min: 1, step: 1 }) +
        unit('deBase', '库存单位', val('baseUnit', '盒')) +
        unit('deSale', '计价单位（HIS 结算单位）', val('saleUnit', '盒')) +
        select('dePriceUnitType', '计价单位类型', val('priceUnitType', '2'), [['1', '1 制剂单位'], ['2', '2 包装单位']]) +
        input('dePrice', '产品价格（元）', val('price', 0), { type: 'number', min: 0, step: 0.01 }) +
        input('deRetailPrice', '零售价格（元）', val('retailPrice', 0), { type: 'number', min: 0, step: 0.01 }) +
        unit('deTracUnit', '追溯码单位', val('tracUnit', '盒')) +
        input('deTracRate', '追溯码转换率', val('tracRate', 1), { type: 'number', min: 0.000001, step: 0.01 }) +
        unit('deMeaUnit', '计量单位', val('meaUnit', '片')) +
        input('deMeaRatio', '计量系数', val('meaRatio', 1), { type: 'number', min: 0.000001, step: 0.01 }) +
        unit('deMinU', '拆零最小单位（U0）', d && d.minUnit ? d.minUnit.u : '', true, true) +
        input('deMinN', '库存单位折合最小单位数', d && d.minUnit ? d.minUnit.per : '', { type: 'number', min: 1, step: 1, optional: true })) +
      section('供应与归属',
        input('deSupCode', '供应商编码', val('supCode', '')) +
        input('deSupName', '供应商名称', val('supName', '')) +
        input('deStoreCode', '仓库编号', val('storeCode', 'WH001')) +
        select('deWh', '仓库名称（所属库房）', val('warehouse', '中心库'), warehouses()) +
        input('deMedWhCode', '药库编码', val('medWhCode', 'MW001')) +
        input('deMedWhName', '药库名称', val('medWhName', '中心库'))) +
      section('管理与追溯标志',
        select('deRxFlag', '处方药标志', val('rxFlag', '是'), ['是', '否']) +
        select('deCoded', '是否需要赋码', val('coded', '1'), [['1', '1 是'], ['0', '0 否']]) +
        select('deOp', '门诊拆零标志', val('opUnpack', '否'), ['否', '是']) +
        select('deIp', '住院拆零标志', val('ipUnpack', '否'), ['否', '是']) +
        select('deSelUnTrac', '销售端无追溯码', val('selUnTrac', '0'), [['0', '0 有追溯码'], ['1', '1 无追溯码']]) +
        input('deLastUpdate', '最后更新时间', d ? d.lastUpdateTime : '保存时自动生成', { auto: true })) +
      '<div class="text-secondary mb-2" style="font-size:12.5px;">一级标识码、包装规格及多级换算链在下方「标识码子表」维护；最后更新时间保存时自动更新。' +
      (d ? '编辑保存后立即生效于全系统码解析与单位换算。' : '新增药品默认「待审核」，审核后启用；保存后请补录标识码。') + '</div>';
    UI.modalShell('drugEdit', d ? '编辑药品 · ' + d.drugName : '新增药品', body,
      '<button class="btn btn-outline-secondary" data-mclose>取消</button><button class="btn btn-primary" id="deOk">保存</button>', 1080);
    var el = UI.open('drugEdit');
    function read(id) { return el.querySelector('#' + id).value.trim(); }
    el.querySelector('#deWh').addEventListener('change', function () {
      if (d) return;
      var center = read('deWh') === '中心库';
      el.querySelector('#deStoreCode').value = center ? 'WH001' : 'WH002';
      el.querySelector('#deMedWhCode').value = center ? 'MW001' : 'MW002';
      el.querySelector('#deMedWhName').value = read('deWh');
    });
    el.querySelector('#deOk').addEventListener('click', function () {
      var missing = null, missingEl = null;
      el.querySelectorAll('[data-req]').forEach(function (ctrl) {
        if (!missing && !ctrl.value.trim()) { missing = ctrl.getAttribute('data-req'); missingEl = ctrl; }
      });
      if (missing) { window.showToast(missing + '为必填项'); missingEl.focus(); return; }
      if (!/^\d+$/.test(read('deMinPackQty')) || +read('deMinPackQty') < 1) { window.showToast('最小包装数量须为大于等于 1 的整数'); return; }
      if (+read('dePrice') < 0 || +read('deRetailPrice') < 0) { window.showToast('产品价格 / 零售价格不能小于 0'); return; }
      if (+read('deTracRate') <= 0 || +read('deMeaRatio') <= 0) { window.showToast('追溯码转换率 / 计量系数须大于 0'); return; }
      var base = read('deBase'), minU = read('deMinU'), minN = +read('deMinN');
      var t = d || { drugCode: 'YP' + String(Date.now()).slice(-6), status: '待审核' };
      t.drugName = read('deName'); t.medCode = read('deMedCode'); t.medListCodg = read('deMedList');
      t.formSpec = read('deForm'); t.dosForm = read('deDos'); t.dosageUnit = read('deDosageUnit');
      t.drugcate = read('deDrugcate'); t.drugType = read('deDrugType'); t.category = read('deCat');
      t.approval = read('deAppr'); t.maker = read('deMaker');
      t.minPackUnit = read('deMinPackUnit'); t.minPackQty = +read('deMinPackQty');
      t.baseUnit = base; t.saleUnit = read('deSale'); t.priceUnitType = read('dePriceUnitType');
      t.price = +read('dePrice'); t.retailPrice = +read('deRetailPrice');
      t.tracUnit = read('deTracUnit'); t.tracRate = +read('deTracRate');
      t.meaUnit = read('deMeaUnit'); t.meaRatio = +read('deMeaRatio');
      t.supCode = read('deSupCode'); t.supName = read('deSupName'); t.storeCode = read('deStoreCode');
      t.warehouse = read('deWh'); t.medWhCode = read('deMedWhCode'); t.medWhName = read('deMedWhName');
      t.rxFlag = read('deRxFlag'); t.coded = read('deCoded'); t.selUnTrac = read('deSelUnTrac');
      t.opUnpack = read('deOp'); t.ipUnpack = read('deIp');
      t.lastUpdateTime = nowText();
      if (!t.units || !t.units.length) t.units = [{ u: base, eq: 1 }];
      t.minUnit = (minU && minN > 0) ? { u: minU, per: minN } : null;
      if (!d) S.drugs.unshift(t);
      sel = t.drugCode; save(); UI.close('drugEdit'); renderAll();
      window.showToast(d ? '药品「' + t.drugName + '」已更新' : '药品「' + t.drugName + '」已创建（待审核），请补录标识码后审核启用');
    });
  }

  // ===== 新增 / 维护标识码弹窗（2026-10-10 优化：码等级↔包装单位按换算链联动 + 比例/下级数量实时预览 + 链一致性校验） =====
  function openIcEdit(idcode) {
    var d = selDrug();
    if (!d) return;
    var c = idcode ? D.idcodeOf(S, idcode) : null;
    var us = d.units || [{ u: d.baseUnit || '盒', eq: 1 }];
    var maxLv = us.length;
    // 等级 i ↔ 链层：1 级=链尾（最小销售包装=库存单位），i 级=units[maxLv-i]
    function unitOfLv(lv) { return us[maxLv - lv] ? us[maxLv - lv].u : null; }
    function lvOfUnit(u) { for (var i = 0; i < us.length; i++) if (us[i].u === u) return maxLv - i; return 0; }
    var lvOpts = [];
    for (var n = 1; n <= maxLv; n++) lvOpts.push({ n: n, u: unitOfLv(n) });
    var lvHtml = lvOpts.map(function (o) {
      return '<option value="' + o.n + '"' + (c && c.level === o.n ? ' selected' : '') + '>' + o.n + ' 级 = ' + esc(o.u) +
        (o.n === 1 ? '（最小销售包装）' : (o.n === maxLv ? '（最大包装）' : '')) + '</option>';
    }).join('');
    var unitHtml = us.slice().reverse().map(function (u) {
      return '<option value="' + esc(u.u) + '"' + (c && c.packUnit === u.u ? ' selected' : '') + '>' + esc(u.u) + '</option>';
    }).join('');
    UI.modalShell('icEdit', c ? '维护标识码 · ' + c.idcode : '新增标识码 · ' + d.drugName,
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">标识码（7 位产品资源码）</label>' +
        '<input class="form-control" id="icCode" value="' + esc(c ? c.idcode : '') + '" maxlength="7" ' + (c ? 'disabled' : '') + ' placeholder="如 8461935"></div>' +
      '<div class="col-6"><label class="form-label required">层级</label><select class="form-select" id="icLevel">' + lvHtml + '</select></div></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">包装规格</label><input class="form-control" id="icPack" value="' + esc(c ? c.packSpec : '') + '" placeholder="如 箱60瓶"></div>' +
      '<div class="col-6"><label class="form-label required">包装单位</label><select class="form-select" id="icUnit">' + unitHtml + '</select></div></div>' +
      '<div class="mb-2" style="background:#F5F7FA;border-radius:6px;padding:8px 12px;font-size:12.5px;" id="icPreview"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">层级口径：1 级=最小销售包装（=库存单位「' + esc(d.baseUnit) + '」），逐级向上；扫上级码可展开下级码集合。层级与包装单位按换算链「' + esc(D.unitsText(d)) + '」联动锁定。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="icOk">保存</button>', 560);
    var el = UI.open('icEdit');
    function refreshPreview() {
      var lv = +el.querySelector('#icLevel').value;
      var u = el.querySelector('#icUnit').value;
      var ratio = D.ratioOf(d, u), sq = D.subQty(d, u);
      el.querySelector('#icPreview').innerHTML =
        '本码 = <b>' + ratio + '</b> ' + esc(d.baseUnit) + '（比例） · 下级数量 = <b>' + (sq === '' ? '—（已是末级）' : sq) + '</b>';
      // 层级↔单位一致性即时提示
      var expectU = unitOfLv(lv);
      if (expectU && u !== expectU) {
        el.querySelector('#icPreview').innerHTML += ' <span class="text-warning">⚠ ' + lv + ' 级应对应「' + esc(expectU) + '」，保存时将自动对齐</span>';
      }
    }
    el.querySelector('#icLevel').addEventListener('change', function () {
      var u = unitOfLv(+el.querySelector('#icLevel').value);
      if (u) el.querySelector('#icUnit').value = u;
      refreshPreview();
    });
    el.querySelector('#icUnit').addEventListener('change', function () {
      var lv = lvOfUnit(el.querySelector('#icUnit').value);
      if (lv) el.querySelector('#icLevel').value = String(lv);
      refreshPreview();
    });
    el.querySelector('#icPack').addEventListener('input', function () {
      var u = D.parsePackUnit(el.querySelector('#icPack').value);
      if (lvOfUnit(u)) { el.querySelector('#icUnit').value = u; var lv = lvOfUnit(u); if (lv) el.querySelector('#icLevel').value = String(lv); }
      refreshPreview();
    });
    refreshPreview();
    el.querySelector('#icOk').addEventListener('click', function () {
      var code = el.querySelector('#icCode').value.trim();
      var pack = el.querySelector('#icPack').value.trim();
      var lv = +el.querySelector('#icLevel').value;
      // 层级↔包装单位按链强制对齐（等级优先）
      var unit = unitOfLv(lv) || el.querySelector('#icUnit').value;
      if (!c && !/^\d{7}$/.test(code)) { window.showToast('标识码须为 7 位数字'); return; }
      if (!pack || !unit) { window.showToast('包装规格 / 包装单位为必填项'); return; }
      // 查重按库房隔离：同库房重复 → 拦截；其他库房已有 → 允许并提示（同一标识码跨库房分别建档）
      if (!c) {
        var dup = D.idcodeOf(S, code);
        if (dup) {
          var dupDrug = D.drugOf(S, dup.drugCode);
          if (dupDrug && dupDrug.warehouse === d.warehouse) { window.showToast('标识码 ' + code + ' 在本库房已建档'); return; }
          window.showToast('提示：标识码 ' + code + ' 已在「' + (dupDrug ? dupDrug.warehouse : '-') + '」建档，本库房将独立建档');
        }
      }
      if (c) { c.level = lv; c.packSpec = pack; c.packUnit = unit; }
      else S.idcodes.push({ idcode: code, drugCode: d.drugCode, level: lv, packSpec: pack, packUnit: unit, status: '启用' });
      save(); UI.close('icEdit'); renderAll();
      window.showToast('标识码 ' + code + ' 已保存（' + lv + ' 级 = ' + unit + '）');
    });
  }

  // 标识码引用检查：扫全部单据池的码记录前 7 位（有引用则不允许删除，引导停用）
  function idcodeRefs(code7) {
    var refs = [];
    var store = window.store.load();
    function scan(arr, label) {
      (arr || []).forEach(function (doc) {
        (doc.codes || []).forEach(function (c) {
          if (c.code && c.code.slice(0, 7) === code7) refs.push(label + ' ' + (doc.billNo || doc.orderNo || doc.rxNo || doc.retNo || ''));
        });
        (doc.items || []).forEach(function (it) {
          (it.codes || []).forEach(function (c) {
            if (c.code && c.code.slice(0, 7) === code7) refs.push(label + ' ' + (doc.billNo || doc.rxNo || ''));
          });
        });
      });
    }
    var pch = store.pch || {}, wh = store.wh || {}, rx = store.rx || {};
    scan(pch.inDocs, '采购入库单'); scan(pch.outDocs, '采购退货单'); scan(pch.arrive, '采购到货单');
    scan(wh.pickDocs, '领用单'); scan(wh.othInDocs, '其他入库单'); scan(wh.othOutDocs, '其他出库单');
    scan(wh.lossDocs, '损耗出库单'); scan(wh.retInDocs, '退回入库单'); scan(wh.retPool, '领用退回');
    scan(wh.phLossDocs, '药房损耗'); scan(rx.rxDocs, '发药单'); scan(rx.trayDocs, '摆药单');
    return refs;
  }

  function renderAll() {
    content.innerHTML = filterBar() + mainTable() + subCard();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { kw: v('fKw'), category: v('fCat'), unpack: v('fUnpack'), status: v('fStatus'), warehouse: document.getElementById('fWh').value };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { kw: '', category: '全部', unpack: '全部', status: '全部', warehouse: '全部' };
      renderAll();
    });
    document.getElementById('btnUpdIc').addEventListener('click', sync.openUpdIc);
    document.getElementById('btnHis').addEventListener('click', sync.openHisImport);
    document.getElementById('btnAdd').addEventListener('click', function () { openEdit(null); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEdit(b.getAttribute('data-edit')); });
    });
    content.querySelectorAll('[data-audit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = D.drugOf(S, b.getAttribute('data-audit'));
        if (!d) return;
        if (!S.idcodes.some(function (c) { return c.drugCode === d.drugCode; })) {
          window.showToast('药品「' + d.drugName + '」还没有标识码，请先在子表补录'); return;
        }
        UI.confirm('审核通过药品 <b>' + esc(d.drugName) + '</b>？审核后启用并参与全系统码解析。', function () {
          d.status = '启用'; save(); renderAll();
          window.showToast('药品「' + d.drugName + '」已启用');
        }, '审核通过');
      });
    });
    var ai = document.getElementById('btnAddIc');
    if (ai) ai.addEventListener('click', function () { openIcEdit(null); });
    content.querySelectorAll('[data-ic-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openIcEdit(b.getAttribute('data-ic-edit')); });
    });
    // 删除：有单据引用（码记录前 7 位命中）→ 拦截引导停用；无引用 → 确认后删除
    content.querySelectorAll('[data-ic-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var code = b.getAttribute('data-ic-del');
        var c = D.idcodeOf(S, code);
        if (!c) return;
        var refs = idcodeRefs(code);
        if (refs.length) {
          window.showToast('标识码 ' + code + ' 已被 ' + refs.length + ' 条单据码记录引用（如 ' + refs[0] + '），不允许删除——可「停用」使其扫码按异常码拦截');
          return;
        }
        UI.confirm('删除标识码 <b>' + esc(code) + '</b>？删除后子表不再保留该码（如已入库实物请用「停用」）。', function () {
          S.idcodes = S.idcodes.filter(function (x) { return x.idcode !== code; });
          save(); renderAll();
          window.showToast('标识码 ' + code + ' 已删除');
        }, '删除');
      });
    });
    content.querySelectorAll('[data-ic-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = D.idcodeOf(S, b.getAttribute('data-ic-toggle'));
        if (!c) return;
        c.status = c.status === '启用' ? '停用' : '启用';
        save(); renderAll();
        window.showToast('标识码 ' + c.idcode + ' 已' + c.status);
      });
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  if (S.drugs.length) sel = S.drugs[0].drugCode;
  renderAll();
})();
