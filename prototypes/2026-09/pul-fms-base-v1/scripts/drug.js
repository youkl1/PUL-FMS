/**
 * drug.js — 药品字典（主子表之主表）：药品级属性 + 单位换算链 + 拆零标记
 * 选中药品行 → 下方标识码子表（该药品的全部标识码，可新增）；新增药品默认「待审核」→ 审核后启用
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'drug', crumb: ['基础管理', '药品字典'] });
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

  function mainTable() {
    var list = filtered();
    var rows = list.map(function (d, i) {
      var op = '<div class="btn-list">' +
        '<button class="btn btn-sm btn-outline-primary" data-edit="' + esc(d.drugCode) + '">编辑</button>' +
        (d.status === '待审核' ? '<button class="btn btn-sm btn-outline-success" data-audit="' + esc(d.drugCode) + '">审核</button>' : '') +
        '</div>';
      return '<tr class="pch-doc-row' + (d.drugCode === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.drugCode) + '">' +
        '<td>' + (i + 1) + '</td><td style="font-family:Consolas,monospace;">' + esc(d.drugCode) + '</td>' +
        '<td><b>' + esc(d.drugName) + '</b></td><td>' + esc(d.formSpec) + '</td>' +
        '<td><span class="badge bg-blue-lt">' + esc(d.warehouse || '中心库') + '</span></td>' +
        '<td>' + esc(d.category) + '</td><td>' + esc(d.baseUnit) + '</td>' +
        '<td>' + esc(D.unitsText(d)) + '</td>' +
        '<td>' + (d.minUnit ? '1' + d.baseUnit + ' = ' + d.minUnit.per + d.minUnit.u : '—') + '</td>' +
        '<td>' + unpackBadge(d.opUnpack) + '</td><td>' + unpackBadge(d.ipUnpack) + '</td>' +
        '<td class="text-secondary">' + (d.price ? '¥' + d.price.toFixed(2) : '—') + '</td>' +
        '<td>' + statusHtml(d) + '</td>' +
        '<td onclick="event.stopPropagation()">' + op + '</td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="14" class="text-center text-secondary" style="padding:32px;">无匹配药品</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品编码</th><th>通用名</th><th>制剂规格</th><th>所属库房</th><th>分类</th><th>基本单位</th><th>换算关系</th><th>拆零最小单位</th><th>门诊拆零</th><th>住院拆零</th><th>参考进价</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer" style="font-size:12.5px;"><span class="text-secondary">共 ' + list.length + ' 条 · 药品按所属库房分别建档（同一标识码可在不同库房各建一条） · 点行查看标识码子表 · 新增/导入药品「待审核」，审核后才参与码解析</span></div></div>';
  }

  // 标识码子表（选中药品的全部标识码）
  function subCard() {
    var d = selDrug();
    var body;
    if (!d) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点击药品行，查看其标识码子表</div>';
    } else {
      var codes = S.idcodes.filter(function (c) { return c.drugCode === d.drugCode; });
      var rows = codes.map(function (c, i) {
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;"><b>' + esc(c.idcode) + '</b></td>' +
          '<td>' + c.level + ' 级</td><td>' + esc(c.packSpec) + '</td><td>' + esc(c.packUnit) + '</td>' +
          '<td>' + (c.status === '启用' ? UI.light('正常') : '<span class="pch-light mute"><i class="pch-dot"></i>停用</span>') + '</td>' +
          '<td><div class="btn-list">' +
            '<button class="btn btn-sm btn-outline-primary" data-ic-edit="' + esc(c.idcode) + '">维护</button>' +
            '<button class="btn btn-sm btn-outline-secondary" data-ic-toggle="' + esc(c.idcode) + '">' + (c.status === '启用' ? '停用' : '启用') + '</button>' +
          '</div></td></tr>';
      }).join('');
      if (!codes.length) rows = '<tr><td colspan="7" class="text-center text-secondary" style="padding:24px;">该药品暂无标识码——点右上「新增标识码」</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>标识码（产品资源码）</th><th>码等级</th><th>包装规格</th><th>包装单位</th><th>状态</th><th>操作</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>标识码子表</b>' +
      (d ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.drugName) + ' ' + esc(d.formSpec) + '</span>' : '') +
      (d ? '<div class="ms-auto"><button class="btn btn-sm btn-outline-primary" id="btnAddIc">+ 新增标识码</button></div>' : '') +
      '</div>' + body + '</div>';
  }

  // ===== 新增 / 编辑药品弹窗（换算链简化录入：大包装单位+折合数 可选；拆零最小单位+数量 可选） =====
  function openEdit(drugCode) {
    var d = drugCode ? D.drugOf(S, drugCode) : null;
    var big = d && d.units.length > 1 ? d.units[0] : null;
    UI.modalShell('drugEdit', d ? '编辑药品 · ' + d.drugName : '新增药品',
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">药品通用名</label><input class="form-control" id="deName" value="' + esc(d ? d.drugName : '') + '"></div>' +
      '<div class="col-6"><label class="form-label">制剂规格</label><input class="form-control" id="deForm" value="' + esc(d ? d.formSpec : '') + '" placeholder="如 60mg"></div></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label">分类</label><select class="form-select" id="deCat">' +
        ['西药', '中成药', '中药饮片', '麻精药品', '特殊管理药品', '未分类'].map(function (o) { return '<option' + (d && d.category === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>' +
      '<div class="col-6"><label class="form-label required">所属库房</label><select class="form-select" id="deWh">' +
        warehouses().map(function (o) { return '<option' + ((d ? d.warehouse : '中心库') === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label">批准文号</label><input class="form-control" id="deAppr" value="' + esc(d ? d.approval : '') + '" placeholder="国药准字H…"></div>' +
      '<div class="col-6"><label class="form-label">生产企业</label><input class="form-control" id="deMaker" value="' + esc(d ? d.maker : '') + '"></div></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-4"><label class="form-label required">基本单位（库存口径）</label><input class="form-control" id="deBase" value="' + esc(d ? d.baseUnit : '盒') + '"></div>' +
      '<div class="col-4"><label class="form-label">大包装单位</label><input class="form-control" id="deBigU" value="' + esc(big ? big.u : '') + '" placeholder="如 箱"></div>' +
      '<div class="col-4"><label class="form-label">1 大包装 = ? 基本单位</label><input class="form-control" id="deBigN" type="number" min="1" value="' + (big ? big.eq : '') + '" placeholder="如 60"></div></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-4"><label class="form-label">拆零最小单位（U0）</label><input class="form-control" id="deMinU" value="' + esc(d && d.minUnit ? d.minUnit.u : '') + '" placeholder="如 片"></div>' +
      '<div class="col-4"><label class="form-label">1 基本单位 = ? 最小单位</label><input class="form-control" id="deMinN" type="number" min="1" value="' + (d && d.minUnit ? d.minUnit.per : '') + '" placeholder="如 7"></div>' +
      '<div class="col-4"><label class="form-label">参考进价（元）</label><input class="form-control" id="dePrice" type="number" min="0" step="0.01" value="' + (d && d.price ? d.price : '') + '"></div></div>' +
      '<div class="row g-3 mb-2">' +
      '<div class="col-4"><label class="form-label">门诊拆零</label><select class="form-select" id="deOp">' + ['否', '是'].map(function (o) { return '<option' + (d && d.opUnpack === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>' +
      '<div class="col-4"><label class="form-label">住院拆零</label><select class="form-select" id="deIp">' + ['否', '是'].map(function (o) { return '<option' + (d && d.ipUnpack === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>' +
      '<div class="col-4"><label class="form-label">剂型</label><input class="form-control" id="deDos" value="' + esc(d ? (d.dosForm || '') : '') + '" placeholder="如 片剂 / 注射剂（暂保留）"></div></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">' + (d ? '编辑保存后立即生效于全系统码解析与单位换算。' : '新增药品默认「待审核」，审核后启用；保存后请在下方子表补录标识码。') + '</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="deOk">保存</button>', 720);
    var el = UI.open('drugEdit');
    el.querySelector('#deOk').addEventListener('click', function () {
      var name = el.querySelector('#deName').value.trim();
      var base = el.querySelector('#deBase').value.trim();
      if (!name || !base) { window.showToast('药品通用名 / 基本单位为必填项'); return; }
      var bigU = el.querySelector('#deBigU').value.trim(), bigN = +el.querySelector('#deBigN').value;
      var minU = el.querySelector('#deMinU').value.trim(), minN = +el.querySelector('#deMinN').value;
      var units = [{ u: base, eq: 1 }];
      if (bigU && bigN > 1) units.unshift({ u: bigU, eq: bigN });
      var t = d || { drugCode: 'YP' + String(Date.now()).slice(-6), status: '待审核' };
      t.drugName = name; t.formSpec = el.querySelector('#deForm').value.trim() || '-';
      t.category = el.querySelector('#deCat').value; t.warehouse = el.querySelector('#deWh').value;
      t.approval = el.querySelector('#deAppr').value.trim() || '-';
      t.maker = el.querySelector('#deMaker').value.trim() || '-';
      t.baseUnit = base; t.units = units;
      t.minUnit = (minU && minN > 0) ? { u: minU, per: minN } : null;
      t.opUnpack = el.querySelector('#deOp').value; t.ipUnpack = el.querySelector('#deIp').value;
      t.dosForm = el.querySelector('#deDos').value.trim() || '-';
      t.price = +el.querySelector('#dePrice').value || 0;
      if (!d) S.drugs.unshift(t);
      sel = t.drugCode; save(); UI.close('drugEdit'); renderAll();
      window.showToast(d ? '药品「' + name + '」已更新' : '药品「' + name + '」已创建（待审核），请补录标识码后审核启用');
    });
  }

  // ===== 新增 / 维护标识码弹窗（7 位数字校验；包装单位自动从包装规格解析，可改） =====
  function openIcEdit(idcode) {
    var d = selDrug();
    if (!d) return;
    var c = idcode ? D.idcodeOf(S, idcode) : null;
    UI.modalShell('icEdit', c ? '维护标识码 · ' + c.idcode : '新增标识码 · ' + d.drugName,
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">标识码（7 位产品资源码）</label>' +
        '<input class="form-control" id="icCode" value="' + esc(c ? c.idcode : '') + '" maxlength="7" ' + (c ? 'disabled' : '') + ' placeholder="如 8461935"></div>' +
      '<div class="col-6"><label class="form-label required">码等级</label><select class="form-select" id="icLevel">' +
        [1, 2, 3].map(function (n) { return '<option' + (c && c.level === n ? ' selected' : '') + '>' + n + ' 级</option>'; }).join('') + '</select></div></div>' +
      '<div class="row g-3 mb-2">' +
      '<div class="col-6"><label class="form-label required">包装规格</label><input class="form-control" id="icPack" value="' + esc(c ? c.packSpec : '') + '" placeholder="如 箱60瓶"></div>' +
      '<div class="col-6"><label class="form-label required">包装单位</label><input class="form-control" id="icUnit" value="' + esc(c ? c.packUnit : '') + '" placeholder="如 箱"></div></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">码等级口径：1 级=最小销售包装（盒/瓶），2 级=中包装，3 级=大包装（箱）；扫上级码可展开下级码集合。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="icOk">保存</button>', 560);
    var el = UI.open('icEdit');
    el.querySelector('#icPack').addEventListener('input', function () {
      el.querySelector('#icUnit').value = D.parsePackUnit(el.querySelector('#icPack').value);
    });
    el.querySelector('#icOk').addEventListener('click', function () {
      var code = el.querySelector('#icCode').value.trim();
      var pack = el.querySelector('#icPack').value.trim();
      var unit = el.querySelector('#icUnit').value.trim();
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
      if (c) { c.level = +el.querySelector('#icLevel').value; c.packSpec = pack; c.packUnit = unit; }
      else S.idcodes.push({ idcode: code, drugCode: d.drugCode, level: +el.querySelector('#icLevel').value, packSpec: pack, packUnit: unit, status: '启用' });
      save(); UI.close('icEdit'); renderAll();
      window.showToast('标识码 ' + (c ? code : code) + ' 已保存');
    });
  }

  // ===== HIS 导入（客户新版 #4：药品可新增，也可通过 HIS 接口导入；HIS 有更新时可多次重复导入） =====
  // 模拟 HIS 药品目录：hit = 与本库房的匹配状态（new 新增 / update 已有更新 / same 无变化）
  var HIS_CATALOG = [
    { hisCode: 'HIS-A001', drugName: '阿莫西林胶囊', formSpec: '0.25g×24粒', maker: '珠海联邦制药股份有限公司', approval: '国药准字H44021351', category: '西药', baseUnit: '盒', idcode: '8477221', level: 1, packSpec: '盒24粒', price: 12.50 },
    { hisCode: 'HIS-A002', drugName: '布洛芬缓释胶囊', formSpec: '0.3g×20粒', maker: '中美天津史克制药有限公司', approval: '国药准字H10900089', category: '西药', baseUnit: '盒', idcode: '8491357', level: 1, packSpec: '盒20粒', price: 16.80 },
    { hisCode: 'HIS-B107', drugName: '依姆多', formSpec: '60mg', maker: '华益药业科技(安徽)有限公司', approval: '国药准字H20030418', category: '西药', baseUnit: '盒', matchCode: 'YP010245', price: 46.00 },
    { hisCode: 'HIS-B122', drugName: '加罗新', formSpec: '100ml:盐酸替罗非班5mg', maker: '四川科伦药业股份有限公司', approval: '国药准字H20203013', category: '西药', baseUnit: '瓶', matchCode: 'YP010388', price: 320.00 }
  ];
  function hisHit(item, wh) {
    if (!item.matchCode) return 'new';
    var d = D.drugOf(S, item.matchCode);
    if (!d || d.warehouse !== wh) return 'new';
    return (d.price !== item.price || d.formSpec !== item.formSpec) ? 'update' : 'same';
  }
  function openHisImport() {
    var whOpts = warehouses().map(function (o) { return '<option>' + o + '</option>'; }).join('');
    var rowsHtml = HIS_CATALOG.map(function (it, i) {
      return '<tr data-his-row="' + i + '">' +
        '<td><input type="checkbox" class="form-check-input his-check" data-i="' + i + '" checked></td>' +
        '<td class="text-secondary">' + it.hisCode + '</td>' +
        '<td><b>' + it.drugName + '</b></td><td>' + it.formSpec + '</td>' +
        '<td>' + it.maker + '</td>' +
        '<td>' + (it.price ? '¥' + it.price.toFixed(2) : '—') + '</td>' +
        '<td class="his-hit" data-hit-cell="' + i + '"></td></tr>';
    }).join('');
    UI.modalShell('hisImport', 'HIS 药品目录导入',
      '<div class="mb-3 d-flex align-items-center" style="gap:10px;">' +
      '<label class="form-label" style="margin:0;">导入到库房</label>' +
      '<select class="form-select" id="hiWh" style="width:150px;">' + whOpts + '</select>' +
      '<span class="text-secondary" style="font-size:12px;">按标识码/编码匹配：已存在则更新，可重复导入（幂等）</span></div>' +
      '<div class="table-responsive" style="max-height:300px;overflow:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th style="width:34px;"></th><th>HIS编码</th><th>通用名</th><th>制剂规格</th><th>生产企业</th><th>参考进价</th><th>匹配结果</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="hiOk">执行导入</button>', 860);
    var el = UI.open('hisImport');
    function refreshHits() {
      var wh = el.querySelector('#hiWh').value;
      HIS_CATALOG.forEach(function (it, i) {
        var hit = hisHit(it, wh);
        var cell = el.querySelector('[data-hit-cell="' + i + '"]');
        cell.innerHTML = hit === 'new' ? '<span class="badge bg-blue-lt">新增建档</span>'
          : hit === 'update' ? '<span class="badge bg-orange-lt">已有·将更新</span>'
          : '<span class="badge bg-secondary-lt">无变化</span>';
      });
    }
    el.querySelector('#hiWh').addEventListener('change', refreshHits);
    refreshHits();
    el.querySelector('#hiOk').addEventListener('click', function () {
      var wh = el.querySelector('#hiWh').value;
      var added = 0, updated = 0, skipped = 0;
      Array.prototype.forEach.call(el.querySelectorAll('.his-check:checked'), function (cb) {
        var it = HIS_CATALOG[+cb.getAttribute('data-i')];
        var hit = hisHit(it, wh);
        if (hit === 'same') { skipped++; return; }
        if (hit === 'update') {
          var d0 = D.drugOf(S, it.matchCode);
          d0.price = it.price; d0.formSpec = it.formSpec; d0.maker = it.maker; d0.approval = it.approval;
          updated++; return;
        }
        var code = 'YP' + String(Date.now()).slice(-6) + added;
        S.drugs.unshift({ drugCode: code, drugName: it.drugName, formSpec: it.formSpec, maker: it.maker,
          approval: it.approval, category: it.category, baseUnit: it.baseUnit, units: [{ u: it.baseUnit, eq: 1 }],
          minUnit: null, ipUnpack: '否', opUnpack: '否', price: it.price, warehouse: wh, status: '待审核' });
        if (it.idcode) S.idcodes.push({ idcode: it.idcode, drugCode: code, level: it.level || 1,
          packSpec: it.packSpec || '-', packUnit: D.parsePackUnit(it.packSpec), status: '启用' });
        added++;
      });
      save(); UI.close('hisImport'); renderAll();
      window.showToast('HIS 导入完成：新增 ' + added + ' 条（待审核），更新 ' + updated + ' 条，无变化跳过 ' + skipped + ' 条');
    });
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
    document.getElementById('btnHis').addEventListener('click', openHisImport);
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
