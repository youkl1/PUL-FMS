/**
 * ph-req.js — 领用申请单：药房按品规+数量向库房请领（药视角，不扫码）
 * 提交后进入库房「领用备货单」申请单池；待备货可编辑/撤销，备货中锁定（库房已建草稿），已完成只读
 * 2026-10-01：编辑器换共享药品选择器 PulDrugPicker（模糊搜索+药房/库房双存量+货位过滤，对齐老系统缺药领用单）
 * 待提交（库房制单草稿）仅库房侧可见，本页不显示
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'req', crumb: ['药房管理', '领用申请单'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, UI = window.PchUI, esc = UI.esc;
  var S = W.load(), DS = D.load(), FS = window.PUL_FACILITY.load();
  var sel = null;
  var filters = { status: '全部', kw: '' };

  function save() { W.save(S); }
  function curUser() { return window.store.load().currentUser || {}; }
  function curPharm() { return W.curPharm(); }
  function drugName(dc) { var d = D.drugOf(DS, dc); return d ? d.drugName : dc; }
  function drugForm(dc) { var d = D.drugOf(DS, dc); return d ? d.formSpec : ''; }
  function baseUnit(dc) { var d = D.drugOf(DS, dc); return d ? d.baseUnit : ''; }
  function maker(dc) { var d = D.drugOf(DS, dc); return d ? d.maker : ''; }
  function approval(dc) { var d = D.drugOf(DS, dc); return d ? d.approval : ''; }
  function myReqs() {
    var ph = curPharm();
    return S.reqPool.filter(function (r) {
      if (r.pharmacy !== ph) return false;
      if (r.status === '待提交') return false;   // 库房制单草稿仅库房侧可见
      if (filters.status !== '全部' && r.status !== filters.status) return false;
      if (filters.kw && r.reqNo.indexOf(filters.kw) === -1) return false;
      return true;
    });
  }
  function selReq() {
    for (var i = 0; i < S.reqPool.length; i++) if (S.reqPool[i].reqNo === sel) return S.reqPool[i];
    return null;
  }
  function warehouses() {
    var out = [];
    window.PUL.ORG_TREE.children.forEach(function (yq) {
      (yq.children || []).forEach(function (n) {
        if (window.PUL.nodeKind(n.type) === '库房') out.push(n.name);
      });
    });
    return out;
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  function filterBar() {
    var opt = function (cur, o, label) {
      return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>';
    };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<select class="form-select" id="fStatus" style="width:120px;">' +
        ['全部', '待备货', '备货中', '已完成'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fKw" style="width:170px;" placeholder="申请单号" value="' + esc(filters.kw) + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<span class="text-secondary" style="font-size:12.5px;">当前药房：' + esc(curPharm()) + '</span>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增申请</button></div>' +
      '</div></div></div>';
  }

  function docsCard() {
    var list = myReqs();
    var rowsHtml = list.map(function (r, i) {
      var items = r.items.map(function (it) { return drugName(it.drugCode) + '×' + it.qty + baseUnit(it.drugCode); }).join('、');
      var st = r.status === '已完成'
        ? '<span class="pch-light ok"><i class="pch-dot"></i>已完成</span>'
        : (r.status === '备货中'
          ? '<span class="pch-light" style="color:#206BC4;"><i class="pch-dot" style="background:#206BC4;"></i>备货中</span>'
          : '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>待备货</span>');
      var op = r.status === '待备货'
        ? '<button class="btn btn-sm btn-outline-secondary" data-edit="' + esc(r.reqNo) + '">编辑</button> ' +
          '<button class="btn btn-sm btn-outline-danger" data-del="' + esc(r.reqNo) + '">撤销</button>'
        : (r.status === '备货中'
          ? '<span class="text-secondary" style="font-size:12.5px;">库房备货中</span>'
          : '<span class="text-secondary" style="font-size:12.5px;">只读</span>');
      return '<tr class="pch-doc-row' + (r.reqNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(r.reqNo) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(r.reqNo) + '</b></td>' +
        '<td class="text-secondary">' + esc(r.date) + '</td>' +
        '<td>' + esc(r.warehouse) + '</td><td>' + esc(r.applicant) + '</td>' +
        '<td style="max-width:280px;">' + esc(items) + '</td><td>' + st + '</td>' +
        '<td onclick="event.stopPropagation()">' + op + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">暂无申请单——点右上「新增申请」向库房请领</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>领用申请单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">提交后进入库房「领用备货单」单据列表 · 本药房 ' + list.length + ' 单</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>申请单号</th><th>申请时间</th><th>供货库房</th><th>申请人</th><th>品规明细</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div></div>';
  }

  function itemsCard() {
    var r = selReq();
    var body;
    if (!r) {
      body = '<div class="text-center text-secondary" style="padding:28px;">点选申请单查看明细</div>';
    } else {
      var rowsHtml = r.items.map(function (it, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.drugCode) + '</td><td><b>' + esc(drugName(it.drugCode)) + '</b></td>' +
          '<td>' + esc(drugForm(it.drugCode)) + '</td><td>' + esc(maker(it.drugCode)) + '</td><td>' + esc(approval(it.drugCode)) + '</td>' +
          '<td>' + (it.slot ? '<span class="badge bg-blue-lt">' + esc(it.slot) + '</span>' : '<span class="text-secondary">—</span>') + '</td>' +
          '<td><b>' + it.qty + '</b></td><td>' + esc(baseUnit(it.drugCode)) + '</td></tr>';
      }).join('');
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>药品编码</th><th>药品通用名</th><th>制剂规格</th><th>生产厂家</th><th>批准文号</th><th>上架货位</th><th>申请数</th><th>单位</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>申请药品明细清单</b>' +
      (r ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(r.reqNo) + (r.remark ? ' · ' + esc(r.remark) : '') + '</span>' : '') +
      '</div>' + body + '</div>';
  }

  // 货位选项扁平化为 {code,name}：本药房货位维护 slots + 名下取药柜取药槽（仅作预期位置随单传递，非药品主数据绑定——客户拍板 2026-09-21）
  function slotList() {
    var ph = curPharm();
    var out = [];
    (FS.pharmacies || []).forEach(function (p) {
      if (p.name !== ph) return;
      (p.slots || []).forEach(function (s) {
        if (s.status !== '启用') return;
        out.push({ code: s.code, name: s.code + ' · ' + s.name });
      });
    });
    (FS.cabinets || []).forEach(function (c) {
      if (c.pharmacy !== ph || c.status !== '启用') return;
      (c.layers || []).forEach(function (l) {
        (l.cells || []).forEach(function (cell) {
          out.push({ code: c.code + '-' + cell.code, name: c.name + ' · ' + cell.code });
        });
      });
    });
    return out;
  }

  function openEdit(req) {
    var isNew = !req;
    var defWh = req ? req.warehouse : '中心库';
    var whOpts = warehouses().map(function (w) {
      return '<option' + (defWh === w ? ' selected' : '') + '>' + esc(w) + '</option>';
    }).join('');
    UI.modalShell('phReqEdit', isNew ? '新增领用申请单' : '编辑领用申请单',
      '<div class="row g-3 mb-2">' +
      '<div class="col-6"><label class="form-label">领用药房</label><input class="form-control" value="' + esc(curPharm()) + '" disabled></div>' +
      '<div class="col-6"><label class="form-label required">供货库房</label><select class="form-select" id="rqWh">' + whOpts + '</select></div></div>' +
      '<div id="rqPick"></div>' +
      '<div class="mt-2 mb-2"><label class="form-label">备注</label><input class="form-control" id="rqRemark" value="' + esc(req ? (req.remark || '') : '') + '"></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="rqOk">提交申请</button>', 1100);
    var el = UI.open('phReqEdit');
    var picker = window.PulDrugPicker.mount(el.querySelector('#rqPick'), {
      warehouse: defWh, pharmacy: curPharm(), slots: slotList(), showSlot: true,
      items: req ? req.items : []
    });
    el.querySelector('#rqWh').addEventListener('change', function () {
      picker.reload({ warehouse: el.querySelector('#rqWh').value });
    });
    el.querySelector('#rqOk').addEventListener('click', function () {
      var items = picker.getItems();
      if (!items.length) { window.showToast('请至少选择 1 个药品（数量需 ≥ 1）'); return; }
      if (isNew) {
        var r = { reqNo: W.nextNo('LY', S.reqPool, 'reqNo'), date: W.now(), pharmacy: curPharm(),
          warehouse: el.querySelector('#rqWh').value, applicant: curUser().name || '演示员',
          source: '药房申请', items: items, status: '待备货', remark: el.querySelector('#rqRemark').value.trim() };
        S.reqPool.unshift(r); sel = r.reqNo;
      } else {
        req.warehouse = el.querySelector('#rqWh').value;
        req.items = items;
        req.remark = el.querySelector('#rqRemark').value.trim();
      }
      save(); UI.close('phReqEdit'); renderAll();
      window.showToast(isNew ? '已提交申请，库房「领用备货单」可见' : '已保存申请');
    });
  }

  function renderAll() { content.innerHTML = filterBar() + docsCard() + itemsCard(); bind(); }
  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { status: v('fStatus'), kw: v('fKw') }; renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { status: '全部', kw: '' }; renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', function () { openEdit(null); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-edit');
        S.reqPool.forEach(function (r) { if (r.reqNo === no) openEdit(r); });
      });
    });
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-del');
        UI.confirm('撤销申请 <b>' + esc(no) + '</b>？库房单池将同步消失。', function () {
          S.reqPool = S.reqPool.filter(function (r) { return r.reqNo !== no; });
          if (sel === no) sel = null;
          save(); renderAll();
          window.showToast('已撤销 ' + no);
        }, '撤销');
      });
    });
  }

  var first = myReqs()[0];
  if (first) sel = first.reqNo;
  renderAll();
})();
