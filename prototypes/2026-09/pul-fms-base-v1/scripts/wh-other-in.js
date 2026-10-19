/**
 * wh-other-in.js — 其他入库单：无上游单据的通用入库（赠品/期初补录/其他）
 * 2026-10-10 Round BC：列表与明细全面对齐采购到货单——
 *   列表：实物数量(=码总数)/解析数量(=解析成功数)/扫码数量(=已核对数) 三列 + 解析/审核状态列 + 异常信息列
 *   明细：码详情（逐码机器事实）/ 药品清单（人读汇总，批次按药品一次补全）/ 异常码（未解析码，badge）三页签；卡头扫码按钮收进行内
 *   扫码：未解析码放行计实物数量（warn 实时反馈；Round CE 起不归入全局异常码台账——台账仅下载解析链路归入），重复⚠ / 已在架×；弹窗附「✓ 直接审核」
 *   审核：守卫顺序=无码→异常码硬拦（跳异常码页签）→批次/效期补齐→审核表单（入库库房/库位，对齐采购到货单 P2 形态）→冻结硬拦→码进在架
 * 批次/效期挂在码记录上（与采购入库单同逻辑）：扫码时同药品继承已填批次，药品行按药品一次补全（2026-10-03 拍板）
 * 2026-10-13：①审核按钮恒可点（删空码前置 disabled，点入 toast「请先扫码入库」——任何审核点击必须有反馈，对齐采购到货单 2026-10-12 口径）；
 *   ②编辑弹窗补药品清单编辑（批次/效期按药品行，保存一次生效；有码才出区）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'othIn', crumb: ['库房管理', '其他入库单', '其他入库单'] });
  if (!content) return;

  var W = window.PUL_WH, D = window.PUL_DRUG, P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var S = W.load();
  var DICT = D.flat(D.load());
  var sel = null, tab = 'codes';
  var filters = { code: '', kw: '', supplier: '', type: '全部', status: '全部', dateFrom: '', dateTo: '' };

  function save() { W.save(S); }
  function curUser() { return window.store.load().currentUser || {}; }
  function curWh() { return curUser().warehouse || '中心库'; }
  function selDoc() {
    for (var i = 0; i < S.othInDocs.length; i++) if (S.othInDocs[i].billNo === sel) return S.othInDocs[i];
    return null;
  }
  function selDocByNo(no) {
    for (var i = 0; i < S.othInDocs.length; i++) if (S.othInDocs[i].billNo === no) return S.othInDocs[i];
    return null;
  }
  // ===== 三数量列 + 异常推导（口径对齐采购到货单：实物=码总数 / 解析=解析成功数 / 扫码=已核对数） =====
  function badCodesOf(d) { return (d.codes || []).filter(function (c) { return !P.parseCode(c.code, DICT).dict; }); }
  function parsedCount(d) { return d.codes.length - badCodesOf(d).length; }
  function checkedCount(d) { return d.codes.filter(function (c) { return c.checked; }).length; }
  function statusOf(d) { return d.status === '已审核' ? '已审核' : '未审核'; }
  // 本库在架码集合（扫码「已在架」拦截用）
  function stockMap() {
    var m = {};
    W.stockAll(P.load(), S, curWh()).forEach(function (c) { m[c.code] = c; });
    return m;
  }

  function filtered() {
    return S.othInDocs.filter(function (d) {
      if (filters.type !== '全部' && d.type !== filters.type) return false;
      if (filters.status !== '全部' && d.status !== filters.status) return false;
      if (filters.kw && d.billNo.indexOf(filters.kw) === -1) return false;
      if (filters.supplier && (d.supplier || '').indexOf(filters.supplier) === -1) return false;
      if (filters.code && !(d.codes || []).some(function (c) { return c.code.indexOf(filters.code) !== -1; })) return false;
      if (filters.dateFrom && d.date.slice(0, 10) < filters.dateFrom) return false;
      if (filters.dateTo && d.date.slice(0, 10) > filters.dateTo) return false;
      return true;
    });
  }

  function filterBar() {
    var opt = function (cur, o, label) { return '<option' + (cur === o ? ' selected' : '') + '>' + (label || o) + '</option>'; };
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      '<input class="form-control" id="fCode" style="width:160px;" placeholder="药品追溯码" value="' + esc(filters.code) + '">' +
      '<input class="form-control" id="fKw" style="width:150px;" placeholder="单据编号" value="' + esc(filters.kw) + '">' +
      '<input class="form-control" id="fSupplier" style="width:150px;" placeholder="供应商" value="' + esc(filters.supplier) + '">' +
      '<select class="form-select" id="fType" style="width:120px;">' +
        ['全部'].concat(W.OTH_IN_TYPES).map(function (o) { return opt(filters.type, o, o === '全部' ? '入库类型' : o); }).join('') + '</select>' +
      '<select class="form-select" id="fStatus" style="width:100px;">' +
        ['全部', '未审核', '已审核'].map(function (o) { return opt(filters.status, o, o === '全部' ? '状态' : o); }).join('') + '</select>' +
      '<input class="form-control" id="fFrom" type="date" style="width:140px;" value="' + filters.dateFrom + '">' +
      '<span class="text-secondary">-</span>' +
      '<input class="form-control" id="fTo" type="date" style="width:140px;" value="' + filters.dateTo + '">' +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnAdd">+ 新增入库单</button></div>' +
      '</div></div></div>';
  }

  // ===== 单据列表（数量三列相邻 + 解析/审核状态列 + 异常信息列，2026-10-10 对齐采购到货单） =====
  function parseQtyCell(d) {
    var ok = parsedCount(d);
    if (ok === d.codes.length) return String(ok);
    return '<span class="text-danger" title="' + badCodesOf(d).length + ' 个未解析码（见异常码页签）">' + ok + '</span>';
  }
  // 解析列：已审核=异常清零必正常；未审核有未解析码=异常（点击选中并跳异常码页签）
  function parseCell(d) {
    if (d.status === '已审核') return '<span class="text-success">正常</span>';
    if (!badCodesOf(d).length) return '<span class="text-success">正常</span>';
    return '<a href="javascript:void(0)" class="text-danger" data-badtab="' + esc(d.billNo) + '" title="查看未解析码明细" onclick="event.stopPropagation()">异常</a>';
  }
  // 异常信息列：汇总未解析码条数，无异常显 —（已审核单异常清零不显）
  function issueInfoCell(d) {
    if (d.status === '已审核') return '<span class="text-secondary">—</span>';
    var n = badCodesOf(d).length;
    if (!n) return '<span class="text-secondary">—</span>';
    return '<span class="text-danger">解析失败×' + n + '</span>';
  }

  function docsCard() {
    var list = filtered();
    var rowsHtml = list.map(function (d, i) {
      var audited = d.status === '已审核';
      // TODO(light): 待 PchUI.light 扩展收编琥珀色
      var stCell = audited ? UI.light('已审核')
        : '<span class="pch-light" style="color:#F59E0B;"><i class="pch-dot" style="background:#F59E0B;"></i>未审核</span>';
      return '<tr class="pch-doc-row' + (d.billNo === sel ? ' pch-doc-sel' : '') + '" data-sel="' + esc(d.billNo) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(d.billNo) + '</b></td><td>其它入库</td><td class="text-secondary">' + esc(d.date) + '</td>' +
        '<td><span class="badge bg-blue-lt">' + esc(d.type) + '</span></td>' +
        '<td>' + esc(d.supplier || '—') + '</td><td>' + esc(d.warehouse) + '</td>' +
        '<td>' + d.codes.length + '</td><td>' + parseQtyCell(d) + '</td><td>' + checkedCount(d) + '</td>' +
        '<td onclick="event.stopPropagation()">' + parseCell(d) + '</td>' +
        '<td>' + stCell + '</td>' +
        '<td>' + issueInfoCell(d) + '</td>' +
        '<td class="text-secondary">' + esc(d.remark || '—') + '</td>' +
        '<td onclick="event.stopPropagation()"><div class="btn-list">' + (audited
          ? '<span class="text-secondary" style="font-size:12.5px;">' + esc(d.auditor || '') + '</span>'
          // 2026-10-13 拍板：审核按钮恒可点，点入后 auditFlow 判定报异常（空码→toast「请先扫码入库」），不做前置 disabled——对齐采购到货单 2026-10-12 统一口径
          : '<button class="btn btn-sm btn-outline-primary" data-scan="' + esc(d.billNo) + '">扫码入库</button>' +
            '<button class="btn btn-sm btn-primary" data-audit="' + esc(d.billNo) + '">审核入库</button>' +
            '<button class="btn btn-sm btn-outline-secondary" data-edit="' + esc(d.billNo) + '">编辑</button>' +
            '<button class="btn btn-sm btn-outline-danger" data-deldoc="' + esc(d.billNo) + '">删除</button>') + '</div></td></tr>';
    }).join('');
    if (!list.length) rowsHtml = '<tr><td colspan="15" class="text-center text-secondary" style="padding:28px;">暂无入库单——点右上「新增入库单」</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据类型</th><th>日期</th><th>入库类型</th><th>供应商</th><th>库房</th><th>实物数量</th><th>解析数量</th><th>扫码数量</th><th>解析</th><th>审核</th><th>异常信息</th><th>备注</th><th>操作</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' +
      '</div>';
  }

  // ===== 入库明细三页签：原业务计算 → PulDocDetail 标准 model/options → 公共组件渲染 =====
  var ISSUER = { '阿里': '码上放心', 'GS1': 'GS1', 'IDCODE': 'IDCODE' };
  var LVL_TXT = { 1: '一级码', 2: '二级码', 3: '三级码' };
  var detailModel = { drugs: [], codes: [], bad: [], activeTab: tab, empty: true };
  function detailCard() {
    var d = selDoc();
    detailModel = d ? { drugs: drugsPanel(d), codes: codesPanel(d), bad: badPanel(d), activeTab: tab }
      : { drugs: [], codes: [], bad: [], activeTab: tab, empty: true };
    // 卡尾：药品清单页签（未审核且有可聚合药品）=批次/效期填写说明；异常码页签=「⚠ 异常码台账」跳转入口（原页签栏链接保留）
    var footerHtml = '';
    if (d && tab === 'drugs' && d.status !== '已审核' && detailModel.drugs.length) {
      footerHtml = '<span class="text-secondary">批次/效期按药品填写，同药品全部码记录一次生效；审核前必须补全。未解析码无法聚合药品、不在本表（见「异常码」页签）</span>';
    } else if (d && tab === 'bad') {
      footerHtml = '<a class="btn btn-sm btn-outline-primary" href="purchase-arrive.html?view=bad">⚠ 异常码台账</a>';
    }
    return window.PulDocDetail.renderTabs(detailModel, {
      title: '入库明细',
      metaHtml: d ? '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(d.billNo) + ' · 实物 ' + d.codes.length + ' · 解析 ' + parsedCount(d) + ' · 扫码 ' + checkedCount(d) + ' · ' + esc(statusOf(d)) + '</span>' : '',
      emptyText: '点选单据行，查看入库明细',
      tabs: ['codes', 'drugs', 'bad'],
      counts: { codes: 'rows' },
      codes: {
        // 码表公共 12 列 + 操作列（旧口径列名按组件标准收敛：药品追溯码(一级)→药品追溯码、二级/三级码列→码层级/父级码）
        columns: ['seq', 'code', 'drugName', 'level', 'parentCode', 'batch', 'prodDate', 'expDate', 'scanQty', 'checkStatus', 'idcode', 'issuer', 'actions'],
        emptyText: '码清单为空——点行内「扫码入库」扫码录入'
      },
      drugs: drugsOptions(d),
      bad: {
        columns: ['seq', 'code', 'idcode', 'reason', 'actions'],
        emptyText: '无异常码，可以审核入库',
        note: '解析异常拦截审核——点「移除」剔除，或维护药品字典后回本页自动恢复解析'
      },
      footerHtml: footerHtml
    });
  }

  // 药品清单行编辑单元格（批次/生产日期/效期）：保留原 input 结构与 data-f/data-ic/data-old 定位口径，
  // bind 的 [data-f] 编辑监听不动；已审核退化为只读文本（原语义）
  function drugCell(d, r, f, val, isDate) {
    if (d.status === '已审核') return esc(val || '—');
    return '<input class="form-control form-control-sm" style="min-width:104px;padding:2px 6px;font-size:12.5px;" ' + (isDate ? 'type="date" ' : '') +
      'data-f="' + f + '" data-ic="' + esc(r.idcode) + '" data-old="' + esc(r.batch || '') + '" value="' + esc(val || '') + '"' + (isDate ? '' : ' placeholder="必填"') + '>';
  }
  // 药品清单 options：公共列子集 + 批次/生产日期/效期三个可编辑扩展列（extraColumns cell 产出原 input HTML）
  function drugsOptions(d) {
    return {
      columns: ['seq', 'drugName', 'formSpec', 'packSpec', 'qty', 'unit'],
      extraColumns: [
        { key: 'batch', title: '批次', cell: function (row) { return drugCell(d, row.raw, 'batch', row.raw.batch, false); } },
        { key: 'prodDate', title: '生产日期', cell: function (row) { return drugCell(d, row.raw, 'prodDate', row.raw.prodDate, true); } },
        { key: 'expDate', title: '效期', cell: function (row) { return drugCell(d, row.raw, 'expDate', row.raw.expDate, true); } }
      ],
      emptyText: '暂无可解析药品' + (d.status !== '已审核' ? '——点行内「扫码入库」' : '')
    };
  }

  // 码详情 = 机器事实逐码视图（公共 12 列 + 操作列；未解析码红底、药品信息显 —；已审核只读无操作）
  function codesPanel(d) {
    var ro = d.status === '已审核';
    return d.codes.map(function (c) {
      var p = P.parseCode(c.code, DICT);
      var bad = !p.dict;
      return {
        raw: c,
        className: bad ? 'pch-row-bad' : '',
        code: c.code,
        drugName: bad ? '—' : p.dict.drugName,
        level: bad ? '—' : (LVL_TXT[p.dict.level] || (p.dict.level + '级码')),
        parentCode: c.parentCode || '—',
        batch: c.batch || '—',
        prodDate: c.prodDate || '—',
        expDate: c.expDate || '—',
        scanQty: 1,
        scanText: '1',
        status: { kind: c.checked ? 'done' : 'todo', text: c.checked ? '已核对' : '未核对' },
        idcode: p.idcode || c.code.slice(0, 7),
        issuer: ISSUER[p.codeType] || '—',
        actions: ro ? [] : ['removeCode']
      };
    });
  }

  // 药品清单 = 人读汇总（批次/效期按药品行补全——与采购入库单同逻辑挂码记录，同药品全部码一次生效）
  function drugsPanel(d) {
    return P.summarize(d.codes, DICT).map(function (r) {
      return { raw: r, drugName: r.drugName, formSpec: r.formSpec, packSpec: r.packSpec, qty: r.qty, unit: r.unit };
    });
  }

  // 异常码页签 = 未解析码（标识码未维护）：不计入解析数量且拦截审核——「移除」剔除（已审核 disabled 只读）
  function badPanel(d) {
    var ro = d.status === '已审核';
    return badCodesOf(d).map(function (c) {
      var p = P.parseCode(c.code, DICT);
      return {
        raw: c,
        className: 'pch-row-bad',
        code: c.code,
        idcode: p.idcode,
        reason: '标识码未维护，无法解析药品',
        actions: ro ? [{ key: 'removeCode', disabled: true }] : ['removeCode']
      };
    });
  }

  // ===== 新增入库单 =====
  function openAdd() {
    var typeOpts = W.OTH_IN_TYPES.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
    UI.modalShell('othInAdd', '新增其他入库单',
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">入库类型</label><select class="form-select" id="oaType">' + typeOpts + '</select></div>' +
      '<div class="col-6"><label class="form-label">供应商</label><input class="form-control" id="oaSupplier" placeholder="如 国药控股福建有限公司"></div></div>' +
      '<div class="mb-3"><label class="form-label required">库房</label><input class="form-control" value="' + esc(curWh()) + '" disabled></div>' +
      '<div class="mb-2"><label class="form-label">备注</label><input class="form-control" id="oaRemark" placeholder="如：厂家赠品随货同行"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;">保存后点行内「扫码入库」连续扫码；批次/效期在「药品清单」页签或行内「编辑」按药品补全；未解析码允许进单（计实物数量）但拦截审核——「异常码」页签移除或维护字典后放行。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="oaOk">保存</button>', 480);
    var el = UI.open('othInAdd');
    el.querySelector('#oaOk').addEventListener('click', function () {
      var d = { billNo: W.nextNo('QTRK', S.othInDocs), date: W.now(), type: el.querySelector('#oaType').value,
        supplier: el.querySelector('#oaSupplier').value.trim(), warehouse: curWh(), remark: el.querySelector('#oaRemark').value.trim(),
        status: '未审核', auditTime: '', auditor: '', codes: [] };
      S.othInDocs.unshift(d);
      sel = d.billNo; tab = 'codes';
      save(); UI.close('othInAdd'); renderAll();
      window.showToast('已创建入库单 ' + d.billNo + '，请扫码入库');
    });
  }

  // ===== 扫码入库（对齐采购到货单手动单：未解析码放行计实物数量；重复⚠ / 已在架×；扫码移除+拆零；弹窗附「✓ 直接审核」） =====
  function openScanModal() {
    var d = selDoc();
    if (!d || d.status === '已审核') return;
    UI.openScan({
      title: '扫码入库 · ' + d.billNo,
      headerHtml: '<div class="pch-scan-fields">' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">单据类型</span>其它入库</span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">单据单号</span><b>' + esc(d.billNo) + '</b></span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">单据时间</span>' + esc(d.date) + '</span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">发货方</span>' + esc(d.supplier || '—') + '</span>' +
        '<span class="pch-scan-field"><span class="pch-scan-field-label">收货方</span>' + esc(d.warehouse) + '</span></div>',
      drugsRows: function () { return drugsPanel(d); },   // 复用药品清单页签同人读汇总（P.summarize）
      drugsOptions: { columns: ['seq', 'drugName', 'formSpec', 'packSpec', 'qty', 'unit'], emptyText: '暂无可解析药品——扫码后自动建行' },
      hint: '扫新到追溯码加入入库单；同药品自动继承已填批次/效期，未填的在「药品清单」页签按药品补全；重复扫码自动过滤；已在架码拦截；解析异常（标识码匹配药品字典失败）允许进单（计实物数量）并实时反馈、拦截审核——「异常码」页签移除或维护药品字典',
      gate: 'in', node: curWh(),
      flags: [{ key: 'remove', label: '扫码移除' }, { key: 'split', label: '拆零（只识别首个有效追溯码）' }],
      onScan: function (code, flags) {
        var idx = -1;
        d.codes.forEach(function (x, i) { if (x.code === code) idx = i; });
        if (flags && flags.remove) {
          if (idx < 0) return { level: 'warn', msg: '无需剔除：不在本单清单' };
          d.codes.splice(idx, 1);
          save(); renderAll();
          return { level: 'ok', msg: '已移除，本单余 ' + d.codes.length + ' 个码' };
        }
        if (idx >= 0) return { level: 'warn', msg: '重复扫码，已在清单' };
        if (stockMap()[code]) return { level: 'bad', msg: '该码已在在架，不能重复入库' };
        var p = P.parseCode(code, DICT);
        if (!p.dict) {
          // Round CE 口径（2026-10-14 用户拍板）：扫码解析异常=标识码匹配药品字典失败→仅实时反馈+进单内异常码拦截审核，
          // 不归入全局异常码台账（台账仅下载解析链路归入）；业务异常（重复/已在架等）只实时反馈不写异常码
          d.codes.push({ code: code, level: 1, split: (flags && flags.split) ? '是' : '否', splitQty: '',
            batch: '', prodDate: '', expDate: '', checked: true, code2: '', code3: '', location: '' });
          save(); renderAll();
          return { level: 'warn', msg: '解析异常：标识码 ' + p.idcode + ' 匹配药品字典失败（见异常码页签）——审核前须移除或维护药品字典' };
        }
        // 批次/效期挂码记录（与采购入库单同逻辑）：同药品已有批次则继承，否则留空待药品行补全
        var batch = '', prod = '', exp = '';
        for (var i = 0; i < d.codes.length; i++) {
          var c0 = d.codes[i];
          if (c0.code.slice(0, 7) === p.idcode && c0.batch) { batch = c0.batch; prod = c0.prodDate; exp = c0.expDate; break; }
        }
        d.codes.push({ code: code, level: 1, split: (flags && flags.split) ? '是' : '否', splitQty: '',
          batch: batch, prodDate: prod, expDate: exp,
          checked: true, code2: '', code3: '', location: '' });
        save(); renderAll();
        return { level: 'ok', msg: '已加入：' + p.dict.drugName + '（' + p.idcode + '），本单累计 ' + d.codes.length + ' 个' +
          (batch ? '，批次继承 ' + batch : '，请在药品清单补批次/效期') };
      },
      onAudit: function () { auditFlow(d); },   // 弹窗内「✓ 直接审核」（公约 §2.2 审核附随扫码）
      onClose: renderAll
    });
  }

  // ===== 编辑（表头 + 药品清单；仅未审核有入口，已审核行操作栏无编辑） =====
  // 2026-10-13 拍板：有药品清单（码可聚合出药品）时编辑弹窗内嵌药品行——批次/生产日期/效期按药品填，
  // 保存时同药品全部码记录一次生效（定位口径同「药品清单」页签行编辑：标识码+原批次）；数量由扫码决定只读；
  // 未解析码无法聚合药品不在本表（见「异常码」页签）
  function openEdit(d) {
    var typeOpts = W.OTH_IN_TYPES.map(function (t) { return '<option' + (t === d.type ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('');
    var drugs = d.codes.length ? P.summarize(d.codes, DICT) : [];
    var drugHtml = '';
    if (drugs.length) {
      drugHtml = '<div class="mb-2" data-oi-drugs><label class="form-label">药品清单（批次/效期按药品填，保存时同药品全部码一次生效）</label>' +
        '<div class="table-responsive" style="max-height:220px;overflow-y:auto;"><table class="table table-vcenter card-table table-sm">' +
        '<thead><tr><th>序号</th><th>药品通用名</th><th>包装规格</th><th>批次</th><th>生产日期</th><th>效期</th><th>数量</th><th>单位</th></tr></thead><tbody>' +
        drugs.map(function (r, i) {
          return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.drugName) + '</b></td><td>' + esc(r.packSpec) + '</td>' +
            '<td><input class="form-control form-control-sm" style="min-width:96px;padding:2px 6px;font-size:12.5px;" data-drow="' + i + '" data-df="batch" value="' + esc(r.batch || '') + '" placeholder="必填"></td>' +
            '<td><input class="form-control form-control-sm" style="padding:2px 6px;font-size:12.5px;" type="date" data-drow="' + i + '" data-df="prodDate" value="' + esc(r.prodDate || '') + '"></td>' +
            '<td><input class="form-control form-control-sm" style="padding:2px 6px;font-size:12.5px;" type="date" data-drow="' + i + '" data-df="expDate" value="' + esc(r.expDate || '') + '"></td>' +
            '<td><b>' + r.qty + '</b></td><td>' + esc(r.unit) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="text-secondary" style="font-size:12px;margin-top:4px;">数量由扫码决定不可改；未解析码无法聚合药品、不在本表（见「异常码」页签）</div></div>';
    }
    UI.modalShell('othInEdit', '编辑其他入库单 · ' + d.billNo,
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">入库类型</label><select class="form-select" id="oiType">' + typeOpts + '</select></div>' +
      '<div class="col-6"><label class="form-label">供应商</label><input class="form-control" id="oiSupplier" value="' + esc(d.supplier || '') + '"></div></div>' +
      '<div class="mb-3"><label class="form-label required">库房</label><input class="form-control" value="' + esc(d.warehouse) + '" disabled></div>' +
      '<div class="mb-2"><label class="form-label">备注</label><input class="form-control" id="oiRemark" value="' + esc(d.remark || '') + '"></div>' + drugHtml,
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="oiOk">保存</button>', drugs.length ? 900 : 480);
    var el = UI.open('othInEdit');
    el.querySelector('#oiOk').addEventListener('click', function () {
      d.type = el.querySelector('#oiType').value;
      d.supplier = el.querySelector('#oiSupplier').value.trim();
      d.remark = el.querySelector('#oiRemark').value.trim();
      // 药品清单写回：按行收输入 → 标识码+原批次定位同组码记录一次生效
      drugs.forEach(function (r, i) {
        var vals = {};
        el.querySelectorAll('[data-drow="' + i + '"]').forEach(function (inp) { vals[inp.getAttribute('data-df')] = inp.value.trim(); });
        d.codes.forEach(function (c) {
          if (c.code.slice(0, 7) === r.idcode && (c.batch || '') === (r.batch || '')) {
            c.batch = vals.batch || ''; c.prodDate = vals.prodDate || ''; c.expDate = vals.expDate || '';
          }
        });
      });
      save(); UI.close('othInEdit'); renderAll();
      window.showToast('已保存入库单 ' + d.billNo + (drugs.length ? '（药品清单 ' + drugs.length + ' 行批次/效期已同步到码记录）' : ''));
    });
  }

  // ===== 审核入库（对齐采购到货单）：守卫=无码→异常码硬拦→批次补齐 → P2 审核表单（入库库房/库位）→ 冻结硬拦 → 码进在架
  // Round CD：拦截全部弹窗化（PchUI.auditBlock 收编共享，对齐采购域口径——toast 一闪而过升级为原因+明细+快捷入口） =====
  function auditFlow(d) {
    if (!d) { window.showToast('请先选择一张入库单'); return; }
    if (d.status === '已审核') { window.showToast('该入库单已审核'); return; }
    if (!d.codes.length) {
      UI.auditBlock(d.billNo, '码清单为空，不允许审核', '先点「扫码入库」加入入库码。', { label: '扫码入库', fn: function () { openScanModal(); } });
      return;
    }
    var bad = badCodesOf(d);
    if (bad.length) {
      UI.auditBlock(d.billNo, '存在 ' + bad.length + ' 个未解析码，已拦截审核',
        '标识码未维护——「异常码」页签移除，或到采购到货单「异常码台账」维护字典后重新解析。',
        { label: '去异常码页签', fn: function () { sel = d.billNo; tab = 'bad'; renderAll(); } });
      return;
    }
    if (d.codes.some(function (c) { return !c.batch || !c.expDate; })) {
      UI.auditBlock(d.billNo, '批次/效期未补齐，不允许审核',
        '批次/效期按药品补全（同药品全部码一次生效）——「药品清单」页签或行内「编辑」填写。',
        { label: '去药品清单', fn: function () { sel = d.billNo; tab = 'drugs'; renderAll(); } });
      return;
    }
    openAudit(d);
  }

  function openAudit(d) {
    var whOpts = P.warehouses().map(function (w) {
      return '<option' + (w === (d.warehouse || curWh()) ? ' selected' : '') + '>' + esc(w) + '</option>';
    }).join('');
    var locOpts = '<option value="">请选择</option>' + P.LOC_PRESET.map(function (l) { return '<option>' + esc(l) + '</option>'; }).join('');
    UI.modalShell('othInAudit', '审核入库 · ' + d.billNo,
      '<div class="text-secondary" style="font-size:13px;margin-bottom:12px;">' + esc(d.type) + (d.supplier ? ' · ' + esc(d.supplier) : '') +
        ' · 共 <b>' + d.codes.length + '</b> 个追溯码（无异常），审核后码进在架。</div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">入库库房</label><select class="form-select" id="auWarehouse">' + whOpts + '</select></div>' +
      '<div class="col-6"><label class="form-label">库位</label><select class="form-select" id="auLocation">' + locOpts + '</select></div></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-success" id="auOk">✓ 确定审核入库</button>', 520);
    var el = UI.open('othInAudit');
    el.querySelector('#auOk').addEventListener('click', function () {
      var wh = el.querySelector('#auWarehouse').value;
      if (!wh) { window.showToast('请选择入库库房'); return; }
      if (!W.assertUnfrozen(wh)) return;
      var loc = el.querySelector('#auLocation').value;
      d.warehouse = wh;
      d.codes.forEach(function (c) { c.location = c.location || loc; });
      d.status = '已审核'; d.auditTime = W.now(); d.auditor = curUser().name || '演示员';
      save(); UI.close('othInAudit'); renderAll();
      window.showToast('已审核入库，' + d.codes.length + ' 个码进在架（' + wh + (loc ? ' · ' + loc : '') + '）');
    });
  }

  function renderAll() {
    DICT = D.flat(D.load());   // 字典实时刷新：异常码台账维护后回本页即恢复解析
    content.innerHTML = filterBar() + docsCard() + detailCard();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { code: v('fCode'), kw: v('fKw'), supplier: v('fSupplier'), type: v('fType'),
        status: v('fStatus'), dateFrom: v('fFrom'), dateTo: v('fTo') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { code: '', kw: '', supplier: '', type: '全部', status: '全部', dateFrom: '', dateTo: '' };
      renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', openAdd);
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () { sel = tr.getAttribute('data-sel'); renderAll(); });
    });
    content.querySelectorAll('[data-badtab]').forEach(function (a) {
      a.addEventListener('click', function () { sel = a.getAttribute('data-badtab'); tab = 'bad'; renderAll(); });
    });
    content.querySelectorAll('[data-audit]').forEach(function (b) {
      b.addEventListener('click', function () { auditFlow(selDocByNo(b.getAttribute('data-audit'))); });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = selDocByNo(b.getAttribute('data-edit'));
        if (d) { sel = d.billNo; openEdit(d); }
      });
    });
    content.querySelectorAll('[data-scan]').forEach(function (b) {
      b.addEventListener('click', function () { sel = b.getAttribute('data-scan'); openScanModal(); });
    });
    content.querySelectorAll('[data-deldoc]').forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-deldoc');
        UI.confirm('确定删除入库单 <b>' + esc(no) + '</b>？未审核单未入在架，删除无副作用。', function () {
          S.othInDocs = S.othInDocs.filter(function (x) { return x.billNo !== no; });
          if (sel === no) sel = null;
          save(); renderAll();
          window.showToast('已删除入库单 ' + no);
        }, '删除');
      });
    });
    // 明细三页签与码行级动作统一走 PulDocDetail.bind（替代原页签行/码删除两个旧监听）
    window.PulDocDetail.bind(content, {
      model: detailModel,
      onTab: function (key) { tab = key; renderAll(); },
      actions: {
        // 码行级移除（码详情「移除」/ 异常码页签「移除」共用；公约 §4.3：码行级不弹确认）——原 data-delcode 逻辑
        removeCode: function (ctx) {
          var d = selDoc();
          if (!d || d.status === '已审核') return;
          var code = ctx.row.code;
          d.codes = d.codes.filter(function (c) { return c.code !== code; });
          save(); renderAll();
          window.showToast('已移除追溯码 ' + code);
        }
      }
    });
    // 药品行批次/效期编辑：按 标识码+原批次 定位同组码记录，一次生效（extraColumns cell 产出的原 input 结构，监听不动）
    content.querySelectorAll('[data-f]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var d = selDoc();
        if (!d || d.status === '已审核') return;
        var ic = inp.getAttribute('data-ic'), old = inp.getAttribute('data-old'), f = inp.getAttribute('data-f');
        d.codes.forEach(function (c) {
          if (c.code.slice(0, 7) === ic && (c.batch || '') === old) c[f] = inp.value.trim();
        });
        save(); renderAll();
      });
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  if (S.othInDocs.length) {
    var d0 = null;
    S.othInDocs.forEach(function (d) { if (!d0 && d.status !== '已审核') d0 = d; });
    sel = (d0 || S.othInDocs[0]).billNo;   // 默认选中首张未审核单，扫码/补批次入口开箱可见
  }
  renderAll();
})();
