/**
 * ph-req.js — 领用申请单：药房按品规+数量向库房请领（药视角，不扫码）
 * 2026-10-05 单池化：读写 pickDocs（reqPool 废除）；新建=待提交草稿，提交→待出库；
 * 待出库(codes 空)可编辑/撤销(撤销=作废终态)，库房已开扫(codes 非空)锁定；已出库起只读，按 pickStatus 推导展示已上架
 * 待提交（库房制单草稿）仅库房侧可见，本页不显示；本药房待提交草稿照常显示
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
    return S.pickDocs.filter(function (d) {
      if (d.pharmacy !== ph) return false;
      if (d.status === '待提交' && d.source === '库房制单') return false;   // 库房制单草稿仅库房侧可见
      if (d.source === '扫码直生') return false;   // 直生单在「领用入库单/药品扫码上架」链路查看
      if (filters.status !== '全部' && W.pickStatus(d) !== filters.status) return false;
      if (filters.kw && d.billNo.indexOf(filters.kw) === -1) return false;
      return true;
    });
  }
  function selReq() {
    for (var i = 0; i < S.pickDocs.length; i++) if (S.pickDocs[i].billNo === sel) return S.pickDocs[i];
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
        ['全部', '待提交', '待出库', '已出库·待入库', '已入库·待上架', '已上架', '已作废'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fKw" style="width:170px;" placeholder="单据编号" value="' + esc(filters.kw) + '">' +
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
      var pst = W.pickStatus(r);
      var st = pst === '已上架'
        ? '<span class="pch-light ok"><i class="pch-dot"></i>已上架</span>'
        : (pst === '已入库·待上架'
          ? '<span class="pch-light" style="color:#2FB344;"><i class="pch-dot" style="background:#2FB344;"></i>已入库 · 待上架</span>' // TODO(light): 待 PchUI.light 扩展收编
          : (pst === '已出库·待入库'
            ? '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>已出库 · 待入库</span>' // TODO(light): 待 PchUI.light 扩展收编
            : (pst === '已作废'
              ? '<span class="pch-light mute"><i class="pch-dot"></i>已作废</span>'
              : (pst === '待提交'
                ? '<span class="badge bg-secondary-lt">待提交</span>'
                : '<span class="pch-light" style="color:#206BC4;"><i class="pch-dot" style="background:#206BC4;"></i>待出库</span>')))); // TODO(light): 待 PchUI.light 扩展收编
      var locked = r.status === '待出库' && (r.codes || []).length > 0;   // 库房已开扫，锁定
      var op = r.status === '待提交'
        ? '<button class="btn btn-sm btn-outline-primary" data-edit="' + esc(r.billNo) + '">编辑</button> ' +
          '<button class="btn btn-sm btn-success" data-submit="' + esc(r.billNo) + '">提交库房备货</button> ' +
          '<button class="btn btn-sm btn-outline-danger" data-del="' + esc(r.billNo) + '">删除</button>'
        : (r.status === '待出库' && !locked
          ? '<button class="btn btn-sm btn-outline-secondary" data-edit="' + esc(r.billNo) + '">编辑</button> ' +
            '<button class="btn btn-sm btn-outline-danger" data-del="' + esc(r.billNo) + '">撤销</button>'
          : (locked
            ? '<span class="text-secondary" style="font-size:12.5px;">库房已开扫</span>'
            : '<span class="text-secondary" style="font-size:12.5px;">只读</span>'));
      return '<tr class="pch-doc-row' + (r.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(r.billNo) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(r.billNo) + '</b></td>' +
        '<td class="text-secondary">' + esc(r.date) + '</td>' +
        '<td>' + esc(r.warehouse) + '</td><td>' + esc(r.applicant) + '</td>' +
        '<td style="max-width:280px;">' + esc(items) + '</td><td>' + st + '</td>' +
        '<td onclick="event.stopPropagation()">' + op + '</td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">暂无申请单——点右上「新增申请」向库房请领</td></tr>';
    return '<div class="card mb-3"><div class="card-header"><b>领用申请单</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">提交后进入库房「领用备货单」单据列表 · 本药房 ' + list.length + ' 单</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>申请时间</th><th>供货库房</th><th>申请人</th><th>品规明细</th><th>状态</th><th>操作</th></tr></thead>' +
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
          '<td><b>' + it.qty + '</b></td><td>' + (it.docQty || 0) + '</td><td>' + esc(baseUnit(it.drugCode)) + '</td></tr>';
      }).join('');
      body = '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>序号</th><th>药品编码</th><th>药品通用名</th><th>制剂规格</th><th>生产厂家</th><th>批准文号</th><th>上架货位</th><th>申请数</th><th>单据数</th><th>单位</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>';
    }
    return '<div class="card"><div class="card-header"><b>申请药品明细清单</b>' +
      (r ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(r.billNo) + (r.remark ? ' · ' + esc(r.remark) : '') + '</span>' : '') +
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
    var isDraft = req && req.status === '待提交';
    var defWh = req ? req.warehouse : '中心库';
    var whOpts = warehouses().map(function (w) {
      return '<option' + (defWh === w ? ' selected' : '') + '>' + esc(w) + '</option>';
    }).join('');
    UI.modalShell('phReqEdit', isNew ? '新增领用申请单' : (isDraft ? '编辑领用申请单（待提交）' : '编辑领用申请单'),
      '<div class="row g-3 mb-2">' +
      '<div class="col-6"><label class="form-label">领用药房</label><input class="form-control" value="' + esc(curPharm()) + '" disabled></div>' +
      '<div class="col-6"><label class="form-label required">供货库房</label><select class="form-select" id="rqWh">' + whOpts + '</select></div></div>' +
      '<div id="rqPick"></div>' +
      '<div class="mt-2 mb-2"><label class="form-label">备注</label><input class="form-control" id="rqRemark" value="' + esc(req ? (req.remark || '') : '') + '"></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      (isNew ? '<button class="btn btn-outline-primary" id="rqDraft">存草稿（待提交）</button>' : '') +
      '<button class="btn btn-primary" id="rqOk">' + (isNew ? '提交申请' : '保存') + '</button>', 1100);
    var el = UI.open('phReqEdit');
    var picker = window.PulDrugPicker.mount(el.querySelector('#rqPick'), {
      warehouse: defWh, pharmacy: curPharm(), slots: slotList(), showSlot: true,
      items: req ? req.items : []
    });
    el.querySelector('#rqWh').addEventListener('change', function () {
      picker.reload({ warehouse: el.querySelector('#rqWh').value });
    });
    function collect() {
      var items = picker.getItems();
      if (!items.length) { window.showToast('请至少选择 1 个药品（数量需 ≥ 1）'); return null; }
      return items;
    }
    function applyNew(status) {
      var items = collect();
      if (!items) return;
      items = items.map(function (it) { return { drugCode: it.drugCode, qty: it.qty, docQty: 0, slot: it.slot || '' }; });
      var t = W.now();
      var r = { billNo: W.nextNo('LY', S.pickDocs), date: t, pharmacy: curPharm(),
        warehouse: el.querySelector('#rqWh').value, applicant: curUser().name || '演示员',
        operator: curUser().name || '演示员', source: '药房申请', status: status, remark: el.querySelector('#rqRemark').value.trim(),
        items: items, codes: [], badCodes: [], shelfLoc: '',
        createTime: t, submitTime: status === '待提交' ? '' : t, outTime: '', inTime: '' };
      S.pickDocs.unshift(r); sel = r.billNo;
      save(); UI.close('phReqEdit'); renderAll();
      window.showToast(status === '待提交' ? '已存草稿（待提交），可在列表「提交库房备货」' : '已提交申请，库房「领用备货单」可见');
    }
    el.querySelector('#rqOk').addEventListener('click', function () {
      if (isNew) { applyNew('待出库'); return; }
      var items = collect();
      if (!items) return;
      req.warehouse = el.querySelector('#rqWh').value;
      req.items = items.map(function (it) { return { drugCode: it.drugCode, qty: it.qty, docQty: 0, slot: it.slot || '' }; });
      req.remark = el.querySelector('#rqRemark').value.trim();
      save(); UI.close('phReqEdit'); renderAll();
      window.showToast('已保存申请');
    });
    if (isNew) el.querySelector('#rqDraft').addEventListener('click', function () { applyNew('待提交'); });
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
        S.pickDocs.forEach(function (d) { if (d.billNo === no) openEdit(d); });
      });
    });
    content.querySelectorAll('[data-submit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-submit');
        UI.confirm('提交库房备货 <b>' + esc(no) + '</b>？提交后进入库房「领用备货单」单据池，不可再编辑。', function () {
          S.pickDocs.forEach(function (r) { if (r.billNo === no) { r.status = '待出库'; r.submitTime = W.now(); } });
          save(); renderAll();
          window.showToast('已提交库房备货 ' + no);
        }, '提交库房备货');
      });
    });
    content.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-del');
        var target = null;
        S.pickDocs.forEach(function (d) { if (d.billNo === no) target = d; });
        if (!target) return;
        var isDraft = target.status === '待提交';
        UI.confirm((isDraft ? '删除待提交申请 ' : '撤销申请 ') + '<b>' + esc(no) + '</b>？' + (isDraft ? '未提交不产生影响。' : '撤销=作废终态，库房单池同步可见。'), function () {
          if (isDraft) {
            S.pickDocs = S.pickDocs.filter(function (d) { return d.billNo !== no; });
          } else {
            target.status = '已作废';
          }
          if (sel === no) sel = null;
          save(); renderAll();
          window.showToast((isDraft ? '已删除 ' : '已撤销（作废）') + no);
        }, isDraft ? '确认删除' : '撤销');
      });
    });
  }

  var first = myReqs()[0];
  if (first) sel = first.billNo;
  renderAll();
})();
