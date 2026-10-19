/**
 * bad-codes.js — 异常标识码：跨单据异常台账 + 维护补录字典（S6 解析兜底）
 * 字段对齐老系统：标识码/层级/药名通用名/制剂规格/包装规格/生产厂家/批准文号/异常信息 + 维护/删除/更新信息
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'badcode', crumb: ['采购管理', '异常标识码', '异常标识码'] });
  if (!content) return;

  var P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = P.load();
  var filters = { type: '全部', idcode: '', drugName: '', other: '' };
  var page = 1, pageSize = 10;

  function save() { P.save(S); }
  function types() {
    var t = ['全部'];
    S.badCodes.forEach(function (b) { if (t.indexOf(b.type) === -1) t.push(b.type); });
    return t;
  }
  function filtered() {
    return S.badCodes.filter(function (b) {
      if (filters.type !== '全部' && b.type !== filters.type) return false;
      if (filters.idcode && b.idcode.indexOf(filters.idcode) === -1) return false;
      if (filters.drugName && b.drugName.indexOf(filters.drugName) === -1) return false;
      if (filters.other && (b.formSpec + b.packSpec + b.approval).indexOf(filters.other) === -1) return false;
      return true;
    });
  }
  // 该标识码是否正拦截着某张到货单（未审核入库的到货单才会被异常码卡住）
  function blocking(idcode) {
    var hit = [];
    S.arrive.forEach(function (o) {
      if (o.downloaded === '是' || o.confirm === '已退货') return;
      (o.codes || []).forEach(function (c) {
        if (c.code.slice(0, 7) === idcode && hit.indexOf(o.orderNo) === -1) hit.push(o.orderNo);
      });
    });
    return hit;
  }

  function filterBar() {
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fType" style="width:140px;">' +
        types().map(function (o) { return '<option' + (filters.type === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' +
      '<input class="form-control" id="fIdcode" style="width:150px;" placeholder="标识码" value="' + esc(filters.idcode) + '">' +
      '<input class="form-control" id="fDrugName" style="width:160px;" placeholder="药品通用名" value="' + esc(filters.drugName) + '">' +
      '<input class="form-control" id="fOther" style="width:200px;" placeholder="制剂规格、包装规格、批准文号" value="' + esc(filters.other) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnSync">⟳ 更新信息</button></div>' +
      '</div></div></div>';
  }

  function table() {
    var list = filtered();
    var total = list.length, pages = Math.max(1, Math.ceil(total / pageSize));
    if (page > pages) page = pages;
    var slice = list.slice((page - 1) * pageSize, page * pageSize);
    var rows = slice.map(function (b, i) {
      var blocks = blocking(b.idcode);
      return '<tr>' +
        '<td>' + ((page - 1) * pageSize + i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;"><b>' + esc(b.idcode) + '</b></td>' +
        '<td>' + b.level + '</td><td>' + esc(b.drugName) + '</td>' +
        '<td>' + esc(b.formSpec) + '</td><td>' + esc(b.packSpec) + '</td>' +
        '<td class="text-secondary">' + esc(b.maker) + '</td>' +
        '<td class="text-secondary">' + esc(b.approval) + '</td>' +
        '<td><span class="text-danger" style="font-size:12.5px;">' + esc(b.type) + '：' + esc(b.idcode) + '</span>' +
          (blocks.length ? '<br><span class="text-warning" style="font-size:12px;">正拦截单据：' + esc(blocks.join('、')) + '</span>' : '') + '</td>' +
        '<td><div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-fix="' + esc(b.idcode) + '">维护</button>' +
          '<button class="btn btn-sm btn-outline-danger" data-del="' + esc(b.idcode) + '">删除</button>' +
        '</div></td></tr>';
    }).join('');
    if (!slice.length) rows = '<tr><td colspan="10" class="text-center text-secondary" style="padding:32px;">无异常标识码</td></tr>';
    return '<div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>标识码</th><th>层级</th><th>药名通用名</th><th>制剂规格</th><th>包装规格</th><th>生产厂家</th><th>批准文号</th><th>异常信息</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer d-flex align-items-center" style="font-size:12.5px;">' +
      '<span class="text-secondary">共 ' + total + ' 条</span>' +
      '<div class="btn-list ms-auto">' +
      '<button class="btn btn-sm btn-outline-secondary" id="pgPrev"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>' +
      '<span class="text-secondary" style="padding:0 6px;">' + page + ' / ' + pages + '</span>' +
      '<button class="btn btn-sm btn-outline-secondary" id="pgNext"' + (page >= pages ? ' disabled' : '') + '>下一页</button>' +
      '</div></div></div>';
  }

  // ===== 维护弹窗（匹配详情）：异常码信息 + HIS 药品库候选表「追加标识码」绑定；无候选时手工补录兜底 =====
  function openFix(idcode) {
    var b = S.badCodes.filter(function (x) { return x.idcode === idcode; })[0];
    if (!b) return;
    var drugs = (window.PUL_DRUG ? window.PUL_DRUG.load().drugs : S.dict) || [];
    var unknown = b.drugName === '（未知药品）';
    // 演示派生：医保编码 / his标识码（真实环境来自 HIS 药品视图）
    function hisFields(dc) {
      var n = parseInt(String(dc || '').replace(/\D/g, ''), 10) || 0;
      return { yb: 'XJ0' + (100000 + n), his: (8481000 + n) + ',' + (8488000 + n) };
    }
    function candRows(kw) {
      var list = drugs.filter(function (d) { return !kw || (d.drugName || '').indexOf(kw) !== -1; });
      if (!list.length) return '<tr><td colspan="9" class="text-center text-secondary" style="padding:20px;">HIS 药品库无匹配——换个关键字，或用上方表单「手工补录保存」</td></tr>';
      return list.map(function (d, i) {
        var h = hisFields(d.drugCode);
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(d.drugName) + '</b></td>' +
          '<td>' + esc(d.formSpec) + '</td><td class="text-secondary">' + esc(d.maker) + '</td>' +
          '<td class="text-secondary">' + esc(d.approval) + '</td>' +
          '<td class="text-secondary">' + h.yb + '</td><td>' + esc(d.drugCode) + '</td>' +
          '<td class="text-secondary">' + h.his + '</td>' +
          '<td><button class="btn btn-sm btn-success" data-bind="' + esc(d.drugCode) + '">追加标识码</button></td></tr>';
      }).join('');
    }
    UI.modalShell('pchFix', '匹配详情 · 维护标识码 ' + idcode,
      '<div class="row g-3 mb-3">' +
      '<div class="col-3"><label class="form-label">标识码</label><input class="form-control" value="' + esc(b.idcode) + '" disabled></div>' +
      '<div class="col-3"><label class="form-label">层级</label><select class="form-select" id="fxLevel">' +
        [1, 2, 3].map(function (n) { return '<option' + (b.level === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>' +
      '<div class="col-6"><label class="form-label">药名通用名 *</label><input class="form-control" id="fxName" value="' + (unknown ? '' : esc(b.drugName)) + '"></div></div>' +
      '<div class="row g-3 mb-2">' +
      '<div class="col-3"><label class="form-label">制剂规格</label><input class="form-control" id="fxForm" value="' + (b.formSpec === '-' ? '' : esc(b.formSpec)) + '"></div>' +
      '<div class="col-3"><label class="form-label">包装规格</label><input class="form-control" id="fxPack" value="' + (b.packSpec === '-' ? '' : esc(b.packSpec)) + '"></div>' +
      '<div class="col-3"><label class="form-label">批准文号</label><input class="form-control" id="fxAppr" value="' + (b.approval === '-' ? '' : esc(b.approval)) + '"></div>' +
      '<div class="col-3"><label class="form-label">生产厂家</label><input class="form-control" id="fxMaker" value="' + (b.maker === '-' ? '' : esc(b.maker)) + '"></div></div>' +
      '<div class="card" style="margin:8px 0 2px;"><div class="card-header" style="padding:8px 12px;"><b style="font-size:13px;">HIS 药品库匹配候选</b>' +
        '<div class="ms-auto d-flex" style="gap:8px;"><input class="form-control form-control-sm" id="fxKw" style="width:180px;" placeholder="按药名通用名匹配" value="' + (unknown ? '' : esc(b.drugName)) + '">' +
        '<button class="btn btn-sm btn-outline-primary" id="fxFind">查询</button></div></div>' +
      '<div class="table-responsive" style="max-height:260px;overflow-y:auto;"><table class="table table-vcenter card-table" style="font-size:12.5px;">' +
      '<thead><tr><th>序号</th><th>药名通用名</th><th>药品规格</th><th>生产厂家</th><th>批准文号</th><th>医保编码</th><th>药品编码</th><th>his标识码</th><th>操作</th></tr></thead>' +
      '<tbody id="fxCand">' + candRows(unknown ? '' : b.drugName) + '</tbody></table></div>' +
      '<div class="card-footer text-secondary" style="font-size:12px;padding:6px 12px;">「追加标识码」= 把异常标识码绑定到该药品（药品编码不变，字典子表 +1 行）；医保编码 / his标识码为原型演示派生值</div></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="fxOk">手工补录保存</button>', 1080);
    var el = UI.open('pchFix');
    function done(msg) {
      S.badCodes = S.badCodes.filter(function (x) { return x.idcode !== idcode; });
      save(); UI.close('pchFix'); renderAll();
      window.showToast(msg);
    }
    // 追加标识码：绑定到 HIS 候选药品（复用其 drugCode，字典子表 +1 行）
    function bindCand() {
      el.querySelectorAll('[data-bind]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var dc = btn.getAttribute('data-bind');
          var d = drugs.filter(function (x) { return x.drugCode === dc; })[0];
          if (!d) return;
          var pack = el.querySelector('#fxPack').value.trim();
          if (!pack || pack === '-') {
            var c0 = (window.PUL_DRUG ? window.PUL_DRUG.load().idcodes : []).filter(function (c) { return c.drugCode === dc && c.level === 1; })[0];
            pack = c0 ? c0.packSpec : (d.baseUnit || '盒');
          }
          var entry = { idcode: b.idcode, level: +el.querySelector('#fxLevel').value, drugName: d.drugName,
            formSpec: d.formSpec, packSpec: pack, maker: d.maker, approval: d.approval, drugCode: d.drugCode,
            dosForm: d.dosForm, unit: d.baseUnit || '盒', ipUnpack: d.ipUnpack, opUnpack: d.opUnpack, warehouse: d.warehouse };
          if (window.PUL_DRUG) window.PUL_DRUG.upsertFromFix(entry); else S.dict.push(entry);
          done('标识码 ' + idcode + ' 已追加绑定到「' + d.drugName + '」（' + d.drugCode + '），相关入库单已恢复可解析');
        });
      });
    }
    el.querySelector('#fxFind').addEventListener('click', function () {
      el.querySelector('#fxCand').innerHTML = candRows(el.querySelector('#fxKw').value.trim());
      bindCand();
    });
    bindCand();
    // 手工补录兜底：候选表无匹配时直接建字典
    el.querySelector('#fxOk').addEventListener('click', function () {
      var name = el.querySelector('#fxName').value.trim();
      if (!name) { window.showToast('药名通用名为必填项'); return; }
      // 字典事实源=PUL_DRUG 主子表（无则回退 pch.dict）；保存后 S.dict 随下次 load() 自动刷新
      var entry = { idcode: b.idcode, level: +el.querySelector('#fxLevel').value, drugName: name,
        formSpec: el.querySelector('#fxForm').value.trim() || '-',
        packSpec: el.querySelector('#fxPack').value.trim() || '-',
        maker: el.querySelector('#fxMaker').value.trim() || '-',
        approval: el.querySelector('#fxAppr').value.trim() || '-',
        drugCode: 'YP' + String(Date.now()).slice(-6), ipUnpack: '否', opUnpack: '否', unit: '盒' };
      if (window.PUL_DRUG) window.PUL_DRUG.upsertFromFix(entry); else S.dict.push(entry);
      done('标识码 ' + idcode + ' 已手工补录字典，相关入库单已恢复可解析');
    });
  }

  function renderAll() {
    content.innerHTML = filterBar() + table();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { type: v('fType'), idcode: v('fIdcode'), drugName: v('fDrugName'), other: v('fOther') };
      page = 1; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { type: '全部', idcode: '', drugName: '', other: '' };
      page = 1; renderAll();
    });
    document.getElementById('pgPrev').addEventListener('click', function () { if (page > 1) { page--; renderAll(); } });
    document.getElementById('pgNext').addEventListener('click', function () { page++; renderAll(); });
    document.getElementById('btnSync').addEventListener('click', function () {
      window.showToast('已从码上放心平台下载最新标识码（中继服务单向拉取，原型演示）');
    });
    content.querySelectorAll('[data-fix]').forEach(function (b) {
      b.addEventListener('click', function () { openFix(b.getAttribute('data-fix')); });
    });
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var idcode = b.getAttribute('data-del');
        if (blocking(idcode).length) {
          window.showToast('标识码 ' + idcode + ' 正被入库单引用，不可删除，请走「维护」');
          return;
        }
        UI.confirm('确定删除异常记录 <b>' + esc(idcode) + '</b>？', function () {
          S.badCodes = S.badCodes.filter(function (x) { return x.idcode !== idcode; });
          save(); renderAll();
          window.showToast('已删除 ' + idcode);
        });
      });
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  renderAll();
})();
