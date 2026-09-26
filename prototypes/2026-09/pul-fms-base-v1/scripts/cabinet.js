/**
 * cabinet.js — 取药柜字典（三级结构）：取药柜（挂药房）→ 摆药层 → 取药槽
 * 本期只做字典结构（客户拍板 2026-09-21）；药品↔取药槽绑定后期开放，页面仅占位说明
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'cabinet', crumb: ['基础管理', '取药柜'] });
  if (!content) return;

  var F = window.PUL_FACILITY, UI = window.PchUI, esc = UI.esc;
  var S = F.load();
  var sel = null;
  var filters = { pharmacy: '全部', kw: '', status: '全部' };

  function save() { F.save(S); }
  function byCode(code) {
    for (var i = 0; i < S.cabinets.length; i++) if (S.cabinets[i].code === code) return S.cabinets[i];
    return null;
  }
  function cellCount(c) {
    return c.layers.reduce(function (n, l) { return n + l.cells.length; }, 0);
  }
  function filtered() {
    return S.cabinets.filter(function (c) {
      if (filters.pharmacy !== '全部' && c.pharmacy !== filters.pharmacy) return false;
      if (filters.kw && (c.name + c.code).indexOf(filters.kw) === -1) return false;
      if (filters.status !== '全部' && c.status !== filters.status) return false;
      return true;
    });
  }

  function filterBar() {
    var phOpts = ['全部'].concat(S.pharmacies.map(function (p) { return p.name; }))
      .map(function (o) { return '<option' + (filters.pharmacy === o ? ' selected' : '') + '>' + o + '</option>'; }).join('');
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fPh" style="width:150px;">' + phOpts + '</select>' +
      '<input class="form-control" id="fKw" style="width:170px;" placeholder="取药柜名称 / 编码" value="' + esc(filters.kw) + '">' +
      '<select class="form-select" id="fStatus" style="width:100px;">' + ['全部', '启用', '停用'].map(function (o) { return '<option' + (filters.status === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增取药柜</button></div>' +
      '</div></div></div>';
  }

  function mainTable() {
    var list = filtered();
    var rows = list.map(function (c, i) {
      var off = c.status !== '启用';
      return '<tr class="pch-doc-row' + (c.code === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(c.code) + '"' + (off ? ' style="opacity:.55;"' : '') + '>' +
        '<td>' + (i + 1) + '</td><td style="font-family:Consolas,monospace;">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(c.name) + '</b></td>' +
        '<td><span class="badge bg-azure-lt">' + esc(c.org) + '</span></td>' +
        '<td>' + esc(c.pharmacy) + '</td>' +
        '<td class="text-center">' + c.layers.length + '</td>' +
        '<td class="text-center">' + cellCount(c) + '</td>' +
        '<td><span class="badge ' + (off ? 'bg-secondary-lt' : 'bg-green-lt') + '">' + c.status + '</span></td>' +
        '<td onclick="event.stopPropagation()"><div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-edit="' + esc(c.code) + '">编辑</button>' +
          '<button class="btn btn-sm ' + (off ? 'btn-outline-success' : 'btn-outline-warning') + '" data-toggle="' + esc(c.code) + '">' + (off ? '启用' : '停用') + '</button>' +
        '</div></td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="9" class="text-center text-secondary" style="padding:32px;">无匹配取药柜</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter table-hover card-table">' +
      '<thead><tr><th>序号</th><th>取药柜编码</th><th>取药柜名称</th><th>所属院区</th><th>所属药房</th><th class="text-center">摆药层数</th><th class="text-center">取药槽数</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer text-secondary" style="font-size:12.5px;">共 ' + list.length + ' 台取药柜 · 取药柜必须指定所属药房 · 点行查看摆药层与取药槽</div></div>';
  }

  // 摆药层子表：层行内嵌取药槽 badges（第三级）
  function subCard() {
    var c = byCode(sel);
    var body;
    if (!c) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点击取药柜行，查看摆药层与取药槽</div>';
    } else {
      var rows = c.layers.map(function (l, i) {
        var cells = l.cells.map(function (cell) {
          var free = cell.status === '空闲';
          return '<span class="badge ' + (free ? 'bg-secondary-lt' : 'bg-green-lt') + '" style="margin:0 3px 3px 0;" title="' + esc(cell.name) + '">' + esc(cell.code) + ' ' + cell.status + '</span>';
        }).join('');
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td style="font-family:Consolas,monospace;"><b>' + esc(l.code) + '</b></td>' +
          '<td>' + esc(l.name) + '</td>' +
          '<td class="text-center">' + l.cells.length + '</td>' +
          '<td>' + cells + '</td></tr>';
      }).join('');
      if (!c.layers.length) rows = '<tr><td colspan="5" class="text-center text-secondary" style="padding:24px;">该取药柜暂无摆药层</td></tr>';
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>摆药层编码</th><th>摆药层名称</th><th class="text-center">取药槽数</th><th>取药槽（第三级）</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>摆药层 / 取药槽</b>' +
      (c ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(c.name) + '（' + esc(c.pharmacy) + '）</span>' : '') +
      '</div>' + body +
      '<div class="card-footer text-secondary" style="font-size:12.5px;">药品 ↔ 取药槽绑定关系本期不开放（客户拍板：后期再议）；一个药品可占多个取药槽，一个取药槽对应一个取药灯组（见「基站灯组」）。</div></div>';
  }

  // 新增/编辑取药柜：编辑仅改名与状态；新增时按层数×每层槽数自动生成摆药层与取药槽
  function openEdit(code) {
    var c = code ? byCode(code) : null;
    var orgOpts = window.PUL.ORG_TREE.children.map(function (y) {
      return '<option' + (c && c.org === y.name ? ' selected' : '') + '>' + y.name + '</option>';
    }).join('');
    var phField = c
      ? '<input class="form-control" value="' + esc(c.org) + ' / ' + esc(c.pharmacy) + '" disabled>'
      : '<select class="form-select" id="cePh">' + S.pharmacies.map(function (p) {
          return '<option value="' + esc(p.name) + '" data-org="' + esc(p.org) + '">' + p.name + '（' + p.org + '）</option>';
        }).join('') + '</select>';
    UI.modalShell('cbEdit', c ? '编辑取药柜 · ' + c.name : '新增取药柜',
      '<div class="mb-3"><label class="form-label required">取药柜名称</label><input class="form-control" id="ceName" value="' + esc(c ? c.name : '') + '" placeholder="如 门诊取药柜 3 号"></div>' +
      '<div class="mb-3"><label class="form-label required">所属药房（院区随药房带出）</label>' + phField + '</div>' +
      (c ? '' :
      '<div class="row g-3 mb-2">' +
      '<div class="col-6"><label class="form-label required">摆药层数</label><input class="form-control" id="ceLayers" type="number" min="1" max="10" value="3"></div>' +
      '<div class="col-6"><label class="form-label required">每层取药槽数</label><input class="form-control" id="ceCells" type="number" min="1" max="20" value="6"></div></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">保存后自动生成摆药层与取药槽；层级结构保存后不可改（改结构需停用后重建）。</div>'),
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="ceOk">保存</button>', 520);
    var el = UI.open('cbEdit');
    el.querySelector('#ceOk').addEventListener('click', function () {
      var name = el.querySelector('#ceName').value.trim();
      if (!name) { window.showToast('取药柜名称为必填项'); return; }
      if (c) { c.name = name; }
      else {
        var phSel = el.querySelector('#cePh');
        var opt = phSel.options[phSel.selectedIndex];
        var ln = Math.max(1, Math.min(10, +el.querySelector('#ceLayers').value || 3));
        var cn = Math.max(1, Math.min(20, +el.querySelector('#ceCells').value || 6));
        var ls = [];
        for (var i = 1; i <= ln; i++) {
          var cells = [];
          for (var j = 1; j <= cn; j++) cells.push({ code: 'C' + i + '-' + ('0' + j).slice(-2), name: i + ' 层 ' + j + ' 槽', status: '空闲' });
          ls.push({ code: 'L' + i, name: '第 ' + i + ' 摆药层', cells: cells });
        }
        var t = { code: 'CB' + String(Date.now()).slice(-4), name: name,
          org: opt.getAttribute('data-org'), pharmacy: opt.value, status: '启用', layers: ls };
        S.cabinets.push(t); sel = t.code;
      }
      save(); UI.close('cbEdit'); renderAll();
      window.showToast('取药柜「' + name + '」已保存');
    });
  }

  function renderAll() {
    content.innerHTML = filterBar() + mainTable() + subCard();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { pharmacy: document.getElementById('fPh').value, kw: document.getElementById('fKw').value.trim(), status: document.getElementById('fStatus').value };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { pharmacy: '全部', kw: '', status: '全部' }; renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', function () { openEdit(null); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEdit(b.getAttribute('data-edit')); });
    });
    content.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = byCode(b.getAttribute('data-toggle'));
        c.status = c.status === '启用' ? '停用' : '启用';
        save(); renderAll();
        window.showToast('取药柜「' + c.name + '」已' + c.status);
      });
    });
  }

  if (S.cabinets.length) sel = S.cabinets[0].code;
  renderAll();
})();
