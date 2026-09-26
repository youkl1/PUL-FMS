/**
 * bad-codes.js — 异常标识码：跨单据异常台账 + 维护补录字典（S6 解析兜底）
 * 字段对齐老系统：标识码/层级/药名通用名/制剂规格/包装规格/生产厂家/批准文号/异常信息 + 维护/删除/更新信息
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'badcode', crumb: ['库房管理', '采购管理', '异常标识码'] });
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
  // 该标识码是否正拦截着某张入库单
  function blocking(idcode) {
    var hit = [];
    S.inDocs.forEach(function (d) {
      if (d.audit === '已审核') return;
      (d.codes || []).forEach(function (c) {
        if (c.code.slice(0, 7) === idcode && hit.indexOf(d.billNo) === -1) hit.push(d.billNo);
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

  // ===== 维护弹窗：补录标识码字典 =====
  function openFix(idcode) {
    var b = S.badCodes.filter(function (x) { return x.idcode === idcode; })[0];
    if (!b) return;
    UI.modalShell('pchFix', '维护标识码字典 · ' + idcode,
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label">标识码</label><input class="form-control" value="' + esc(b.idcode) + '" disabled></div>' +
      '<div class="col-6"><label class="form-label">层级</label><select class="form-select" id="fxLevel">' +
        [1, 2, 3].map(function (n) { return '<option' + (b.level === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label">药名通用名 *</label><input class="form-control" id="fxName" value="' + (b.drugName === '（未知药品）' ? '' : esc(b.drugName)) + '"></div>' +
      '<div class="col-6"><label class="form-label">制剂规格</label><input class="form-control" id="fxForm" value="' + (b.formSpec === '-' ? '' : esc(b.formSpec)) + '"></div></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label">包装规格</label><input class="form-control" id="fxPack" value="' + (b.packSpec === '-' ? '' : esc(b.packSpec)) + '"></div>' +
      '<div class="col-6"><label class="form-label">批准文号</label><input class="form-control" id="fxAppr" value="' + (b.approval === '-' ? '' : esc(b.approval)) + '"></div></div>' +
      '<div class="mb-2"><label class="form-label">生产厂家</label><input class="form-control" id="fxMaker" value="' + (b.maker === '-' ? '' : esc(b.maker)) + '"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">保存后写入标识码字典，被拦截的入库单自动恢复可解析。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="fxOk">保存到字典</button>', 640);
    var el = UI.open('pchFix');
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
      S.badCodes = S.badCodes.filter(function (x) { return x.idcode !== idcode; });
      save(); UI.close('pchFix'); renderAll();
      window.showToast('标识码 ' + idcode + ' 已补录字典，相关入库单已恢复可解析');
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
