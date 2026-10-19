/**
 * drug-picker.js — 共享药品选择器（2026-10-01，对齐老系统缺药领用单药品选择弹窗）
 * 搜索：药品名称/药品编码/生产厂家模糊匹配（字典无拼音码字段，本期不做拼音）
 * 列：药品名称/规格/剂型/药房存量/药房零头/库房存量/库房零头/生产厂家/批准文号/药品编码
 * 货位过滤：选货位 → 只显示该货位 phLoc 有药房在架的药品
 * 用法：
 *   var api = PulDrugPicker.mount(container, {
 *     warehouse: '中心库',        // 药品源按库房过滤 + 库房存量口径
 *     pharmacy: '门诊药房',       // 药房存量口径 + 货位过滤的码来源
 *     slots: [{code:'M-01',name:'M 区 1 位'}],   // 货位下拉（facility pharmacies[].slots）
 *     showSlot: true,             // 已选清单是否带货位列（申请/制单用）
 *     scanGot: function(drugCode)→number,   // 可选（2026-10-15 Round CR）：已选清单补 扫码总量/差异 两列（扫码核对场景编辑弹窗用）；数量变更即重渲染联动差异
 *     items: [{drugCode, qty, slot}]             // 预填已选
 *   });
 *   api.getItems() → [{drugCode, qty, slot}]（读 DOM 当前值）
 */
(function () {
  'use strict';

  function esc(s) { return window.PchUI.esc(s); }

  function mount(container, opts) {
    opts = opts || {};
    var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH;
    var S = W.load(), DS = D.load(), DICT = D.flat(DS);
    var items = (opts.items || []).map(function (it) { return { drugCode: it.drugCode, qty: it.qty, slot: it.slot || '' }; });
    var kw = '', slotF = '';

    // 码 → 折合基本单位数（换算链驱动；无链兜底 1）
    function toBase(c) {
      var p = P.parseCode(c.code, DICT);
      if (!p.dict) return 1;
      var d = D.drugOf(DS, p.dict.drugCode);
      var v = d ? D.conv(DS, d.drugCode, 1, p.dict.packUnit || p.dict.unit, d.baseUnit) : null;
      return v == null ? 1 : v;
    }
    // 在架码数组 → { drugCode: {qty(基本单位), splitQty(零头)} }
    function aggByDrug(codes) {
      var m = {};
      (codes || []).forEach(function (c) {
        var p = P.parseCode(c.code, DICT);
        if (!p.dict) return;
        var dc = p.dict.drugCode;
        if (!m[dc]) m[dc] = { qty: 0, splitQty: 0 };
        m[dc].qty += toBase(c);
        if (c.split === '是') m[dc].splitQty += parseInt(c.splitQty || '0', 10) || 0;
      });
      return m;
    }
    var whAgg = aggByDrug(W.stockAll(P.load(), S, opts.warehouse));
    var phCodes = W.pharmacyStock(S, opts.pharmacy);
    var phAgg = aggByDrug(phCodes);
    // 货位 → 该货位有药房在架的药品集合
    function drugsInSlot(slot) {
      var set = {};
      phCodes.forEach(function (c) {
        if (c.phLoc !== slot) return;
        var p = P.parseCode(c.code, DICT);
        if (p.dict) set[p.dict.drugCode] = 1;
      });
      return set;
    }

    function drugOf(dc) { return D.drugOf(DS, dc) || {}; }
    function candidates() {
      var inSlot = slotF ? drugsInSlot(slotF) : null;
      return DS.drugs.filter(function (d) {
        if (d.status !== '启用') return false;
        if (opts.warehouse && d.warehouse !== opts.warehouse) return false;
        if (kw && (d.drugName + d.drugCode + (d.maker || '')).toLowerCase().indexOf(kw.toLowerCase()) === -1) return false;
        if (inSlot && !inSlot[d.drugCode]) return false;
        return true;
      });
    }
    function has(dc) { return items.some(function (it) { return it.drugCode === dc; }); }
    function stockCell(agg, dc, field) {
      var a = agg[dc];
      var v = a ? a[field] : 0;
      return v ? '<b>' + v + '</b>' : '<span class="text-secondary">0</span>';
    }

    function slotOptsHtml(cur) {
      var out = '<option value="">—</option>';
      (opts.slots || []).forEach(function (s) {
        out += '<option value="' + esc(s.code) + '"' + (cur === s.code ? ' selected' : '') + '>' + esc(s.code) + '</option>';
      });
      return out;
    }
    function filterBar() {
      var slotSel = (opts.slots && opts.slots.length)
        ? '<select class="form-select" id="dpSlotF" style="width:150px;" title="按货位过滤（该货位有在架的药品）"><option value="">货位：全部</option>' +
          opts.slots.map(function (s) { return '<option value="' + esc(s.code) + '"' + (slotF === s.code ? ' selected' : '') + '>' + esc(s.code) + '</option>'; }).join('') + '</select>'
        : '';
      return '<div class="d-flex flex-wrap align-items-center mb-2" style="gap:8px;">' +
        '<input class="form-control" id="dpKw" style="width:220px;" placeholder="药品名称 / 编码 / 厂家" value="' + esc(kw) + '">' +
        slotSel +
        '<span class="text-secondary" style="font-size:12.5px;">存量口径：库房=' + esc(opts.warehouse || '-') + ' · 药房=' + esc(opts.pharmacy || '-') + '（基本单位）</span>' +
        '</div>';
    }
    function candTable() {
      var list = candidates();
      var rows = list.map(function (d, i) {
        var sel = has(d.drugCode);
        return '<tr class="' + (sel ? 'text-secondary' : 'pch-doc-row') + '"' + (sel ? '' : ' data-add="' + esc(d.drugCode) + '"') + '>' +
          '<td>' + (i + 1) + '</td><td><b>' + esc(d.drugName) + '</b></td>' +
          '<td class="text-secondary">' + esc(d.formSpec || '') + '</td><td>' + esc(d.dosForm || '') + '</td>' +
          '<td>' + stockCell(phAgg, d.drugCode, 'qty') + '</td><td>' + stockCell(phAgg, d.drugCode, 'splitQty') + '</td>' +
          '<td>' + stockCell(whAgg, d.drugCode, 'qty') + '</td><td>' + stockCell(whAgg, d.drugCode, 'splitQty') + '</td>' +
          '<td class="text-secondary">' + esc(d.maker || '') + '</td>' +
          '<td class="text-secondary" style="font-size:12px;">' + esc(d.approval || '') + '</td>' +
          '<td>' + esc(d.drugCode) + '</td>' +
          '<td>' + (sel ? '<span class="badge bg-green-lt">已选</span>' : '<button class="btn btn-sm btn-outline-primary" data-add="' + esc(d.drugCode) + '">+ 加入</button>') + '</td></tr>';
      }).join('');
      if (!rows) rows = '<tr><td colspan="12" class="text-center text-secondary" style="padding:20px;">无匹配药品</td></tr>';
      return '<div class="table-responsive dp-compact" style="max-height:220px;overflow-y:auto;"><table class="table table-vcenter card-table table-sm">' +
        '<thead><tr><th>序号</th><th>药品名称</th><th>规格</th><th>剂型</th><th>药房存量</th><th>药房零头</th><th>库房存量</th><th>库房零头</th><th>生产厂家</th><th>批准文号</th><th>药品编码</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }
    function selTable() {
      var sg = typeof opts.scanGot === 'function';   // 2026-10-15 Round CR：可选 扫码总量/差异 列（扫码核对场景的编辑弹窗用）
      var rows = items.map(function (it, i) {
        var d = drugOf(it.drugCode);
        var scanCells = '';
        var gotN = 0;
        if (sg) {
          gotN = opts.scanGot(it.drugCode) || 0;
          var diff = (it.qty || 0) - gotN;
          var diffCell = Math.abs(diff) < 1e-6 && gotN > 0 ? '<span class="badge bg-green-lt">✓ 备齐</span>'
            : (diff > 0 ? '<span class="badge bg-orange-lt">缺 ' + diff + '</span>' : '<span class="badge bg-red-lt">超 ' + (-diff) + '</span>');
          scanCells = '<td><b>' + gotN + '</b></td><td>' + diffCell + '</td>';
        }
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(d.drugName || it.drugCode) + '</b></td>' +
          '<td class="text-secondary">' + esc(d.formSpec || '') + '</td>' +
          // Round CT：带 scanGot 时 min=扫码总量（计划数量不能小于扫码总量，输入级拦截）
          '<td><input class="form-control form-control-sm" data-dpqty="' + i + '" type="number" min="' + (sg && gotN > 0 ? gotN : 1) + '" style="width:80px;" value="' + (it.qty || 1) + '"' + (sg && gotN > 0 ? ' title="计划数量不能小于扫码总量（' + gotN + '）"' : '') + '></td>' +
          scanCells +
          '<td>' + esc(d.baseUnit || '') + '</td>' +
          (opts.showSlot ? '<td><select class="form-select form-select-sm" data-dpslot="' + i + '" style="width:110px;">' + slotOptsHtml(it.slot) + '</select></td>' : '') +
          '<td class="text-secondary" style="font-size:12px;">' + esc(d.approval || '') + '</td>' +
          '<td>' + esc(it.drugCode) + '</td>' +
          '<td><button class="btn btn-sm btn-outline-danger" data-dprm="' + i + '">删除</button></td></tr>';
      }).join('');
      if (!rows) rows = '<tr><td colspan="' + (sg ? 11 : 9) + '" class="text-center text-secondary" style="padding:16px;">点上方候选行「+ 加入」选择药品</td></tr>';
      return '<div class="mt-2 mb-1"><b>已选清单</b><span class="text-secondary ms-2" style="font-size:12.5px;">' + items.length + ' 项 · 数量按基本单位</span></div>' +
        '<div class="table-responsive dp-compact" style="max-height:160px;overflow-y:auto;"><table class="table table-vcenter card-table table-sm">' +
        '<thead><tr><th>序号</th><th>药品名称</th><th>规格</th><th>计划数量</th>' + (sg ? '<th>扫码总量</th><th>差异</th>' : '') + '<th>单位</th>' + (opts.showSlot ? '<th>上架货位</th>' : '') + '<th>批准文号</th><th>药品编码</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }

    function render() {
      // 渲染前先把 DOM 里的数量/货位读回 items（避免重渲染丢输入）
      readBack();
      container.innerHTML = filterBar() + candTable() + selTable();
      bind();
    }
    function readBack() {
      container.querySelectorAll('[data-dpqty]').forEach(function (inp) {
        var i = +inp.getAttribute('data-dpqty');
        if (items[i]) items[i].qty = parseInt(inp.value, 10) || 0;
      });
      container.querySelectorAll('[data-dpslot]').forEach(function (sel) {
        var i = +sel.getAttribute('data-dpslot');
        if (items[i]) items[i].slot = sel.value;
      });
    }
    function bind() {
      var kwEl = container.querySelector('#dpKw');
      if (kwEl) kwEl.addEventListener('input', function () { kw = kwEl.value.trim(); render(); kwFocus(); });
      var sf = container.querySelector('#dpSlotF');
      if (sf) sf.addEventListener('change', function () { slotF = sf.value; render(); });
      container.querySelectorAll('[data-add]').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          var dc = b.getAttribute('data-add');
          if (!has(dc)) { readBack(); items.push({ drugCode: dc, qty: 1, slot: '' }); render(); }
        });
      });
      container.querySelectorAll('[data-dprm]').forEach(function (b) {
        b.addEventListener('click', function () {
          var i = +b.getAttribute('data-dprm');
          // 2026-10-15 Round CT 用户拍板：存在扫码总量的行删除需弹窗提示（已扫记录不受删行影响，须去扫码录入弹窗移除）
          var got = (typeof opts.scanGot === 'function' && items[i]) ? (opts.scanGot(items[i].drugCode) || 0) : 0;
          var doRm = function () { readBack(); items.splice(i, 1); render(); };
          if (got > 0) {
            var d = drugOf(items[i].drugCode);
            window.PchUI.confirm('「' + esc(d.drugName || items[i].drugCode) + '」已扫码 ' + got + ' ' + esc(d.baseUnit || '') +
              '——删除清单行不会移除已扫码记录（多扫的请到「扫码录入」弹窗移除），确认删除？', doRm, '仍要删除');
          } else doRm();
        });
      });
      container.querySelectorAll('[data-dpqty],[data-dpslot]').forEach(function (inp) {
        // Round CR：带 scanGot 时数量变更即重渲染（差异徽标联动更新）；Round CT：计划数量 < 扫码总量 即时回正+提示
        inp.addEventListener('change', function () {
          if (typeof opts.scanGot === 'function' && inp.hasAttribute('data-dpqty')) {
            var i = +inp.getAttribute('data-dpqty'), got = opts.scanGot(items[i].drugCode) || 0;
            var val = parseInt(inp.value, 10) || 0;
            if (val < got) { window.showToast('计划数量不能小于扫码总量（' + got + '）'); inp.value = got; }
          }
          readBack(); if (typeof opts.scanGot === 'function') render();
        });
      });
    }
    function kwFocus() {
      var el = container.querySelector('#dpKw');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }

    render();
    return {
      getItems: function () { readBack(); return items.filter(function (it) { return it.qty > 0; }); },
      reload: function (newOpts) { opts = Object.assign({}, opts, newOpts || {}); render(); }
    };
  }

  window.PulDrugPicker = { mount: mount };
})();
