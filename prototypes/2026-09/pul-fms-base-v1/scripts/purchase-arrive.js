/**
 * purchase-arrive.js — 采购到货单：到货全流程一页走完（2026-10-02 重构，2026-10-07 对齐客户流程图）
 * 下载单据（供应商平台码单池拉取，弹窗字段对齐老系统；接口异常 → dlStatus='失败'，行内重新下载/删除）/ 手动新增
 * → 下载后自动批量解析 + 库存码重复校验（异常=解析失败/库存码已存在，第二维阻断标记）
 * → 审核入库（解析成功=异常清零 是唯一前提；行内「扫码录入」跳统一扫码页=可选实物核对，非必须；异常硬拦 + 盘点冻结拦截）
 * → 直接生成采购入库单（已审核 · 在架 · HIS 已推送）
 * 下游：采购入库单页 = 结果台账 + 推送/流转 + 反审核（反审核后到货单回本页未审核）
 * 双视图：单据视图 ⇄ 异常码台账视图（2026-10-03 异常标识码菜单并入本页，?view=bad 直达；维护字典后单据自动恢复可审）
 * 状态词表（本池唯一登记处，三维正交，2026-10-09 对齐老系统截图）：审核=未审核/已审核（纯生命周期；2026-10-13 Round BU 到货退货删除，已退货态废止），存储 downloaded 布尔推导不变）；下载=dlStatus 成功/失败（独立维度，独立列+独立筛选，展示词=完成/失败）；解析=正常/异常（叠加阻断标记，解析失败/库存码已存在）
 * 2026-10-07：取消「全选/人工验收入库」手工选码验收（客户拍板：多余）——勾选态 picked 全量移除；下载状态独立于单据状态（用户拍板，不混入生命周期）
 * 2026-10-11 Round BI：①新增双模式（扫码录入=逐码建行 / 清单录入=PulDrugPicker 计划清单）+ 单据时间补录；②编辑支持清单单药品清单；
 *   ③列名业务化（发货方/收货方/收货库房/计划数量=清单单 items 合计·基本单位，无清单=码个数）；④下载/解析两列并入统一「异常信息」列，筛选合并为单个「异常」下拉；
 *   ⑤行内「扫码验收」改名「扫码录入」并跳统一扫码页（scan-hub?billNo= 深链），本页弹窗扫码下线
 * 2026-10-13：审核反馈弹窗化（用户验收「没有弹窗确认/直接审核成功/异常报错」）——拦截分支（下载失败/异常码/不一致/空单）从一闪而过 toast 升级为
 *   「审核异常」弹窗（auditBlock：原因+明细+快捷处理入口）；openAudit 补审核确认核对区（异常检查✓/数量一致性✓/无码审核醒目⚠），守卫与落账逻辑零改动
 * 2026-10-13 Round BS：列表「单据类型」列删除 + 新增「异常状态」独立列（下载失败/解析异常/无异常，已审核·已退货显 —；审核列 Round BL 异常红标叠加摘除回归纯生命周期）；
 *   筛选栏「发货方/供应商」单框拆三字段=发货方（shipper）+收货方（receiver）+收货库房（warehouse 下拉）
 * 2026-10-13 Round BU：①编辑弹窗补药品清单区（无清单单=码聚合成行，批次/生产日期/效期按药品改、保存按 标识码+原批次 定位同组码一次生效，数量=码个数只读；
 *   对齐 wh-other-in Round BN）+ 单据级「计划数量」可改（用户拍板：下限=扫码数量；落 o.planQty，planQtyOf 计划覆盖值优先于码个数）；
 *   ②清单录入单编辑补下限校验（每药计划 ≥ 该药已扫折合）；③审核落账改只入已核对码（未扫残留码留到货单作短收记录、不进在架；scan-hub pur-in auditCommit 同口径）；
 *   ④码详情「删除」列下线（用户拍板：移码职责统一在扫码页，scan-hub 行级移除承接；auditBlock/badPanel remedy 文案同步改「扫码录入弹窗移除」）
 * 2026-10-14 Round CG：下载单据弹窗三项验收反馈整改——①搜索区对齐到货单列表 filterBar（fItem 文本标签+控件 + 同款按钮规格，废弃裸 placeholder 框；「已下载」下拉占位词统一「全部」）；
 *   ②药品明细补「码明细」下钻弹窗（对齐 purchase-detail openCodes 模式：按 药品+批次 过滤码单逐码，960 宽）；
 *   ③弹窗 1080→1280 放大（对齐异常码台账/统一扫码档）+ 码单池/药品明细可视区 220/200→280
 * 2026-10-15 Round CI：到货明细三页签 加行数统计（药品清单（N）/码详情（N），异常码沿用红 badge）+ 药品清单居首、默认页签随首_tab（tab key 不动，测试断言依赖）
 * 2026-10-15 Round CK：药品清单列收敛（需求拍板，其他字段暂时隐藏）——药品名称/药品规格/生产厂家/批准文号（标识码→字典关联）+
 *   单价（PUL_DRUG.latestPrice=单价变更记录子表最新一条）+ 数量（清单录入人工输入，可为0；扫码/下载单无清单显 —）+
 *   扫码总量（该药计算单位层已核对码折合计）+ 单位（按单据类型取层级：到货=库房单据→库存单位层 baseUnit；药房销售类单据后续对齐走 saleUnit）+
 *   金额 = 扫码总量 × 单价；批次/生产日期/有效期/包装规格/库位/药品编码等列隐藏
 * 2026-10-15 Round CM（轻量通道）：①药品清单「扫码总量」参考 scan-hub 样式（SC.decomp 双单位+清单单进度条）+ 补「差异」列（备齐/缺/超徽标，聚合单无计划显 —）；
 *   ②码详情列收敛为需求方字段表：药品追溯码/码层级/父级码/生产批次/生产日期/有效期至/扫码数量（SC.codeContrib 单码折合）/标识码/发码机构（codeType 映射），
 *   异常码场景 码层级/父级码/批次/生产日期/有效期至 置空 —；③码详情页签计数 = 列表「扫码数量」列口径（checkedCount 已核对码个数）；
 *   本页新引入 scan-core.js（纯逻辑无 DOM，复用 decomp/saleParen/fmtN/EPS/codeContrib 不重造）
 * 2026-10-15 Round CN（轻量通道）：列表「计划数量→数量」「扫码数量→扫码总量」改名 + 取值=底部药品清单对应列合计
 *   （数量=清单单 items 合计/聚合单显 —；扫码总量=scanTotalNum：清单单 Σ items 已扫折合、聚合单 Σ 已核对码折合，箱码按换算链展开）；
 *   码详情页签计数同步跟随列表「扫码总量」（Round CM「码详情数量=列表扫码数量」口径延续）；审核判定 planQtyOf/scanQtyOf 内部逻辑不动
 * 2026-10-15 Round CO（轻量通道三连）：①**拉取单除下载失败外必有药品清单**——drugsPanel 新增 drugsPullPanel 路由（数量=全码按药品折合·下载即定计划，
 *   扫码总量=已核对折合+双单位+进度条，差异=缺/超/备齐徽标；下载失败单空态；解析失败码不入聚合）；列表「数量」列同口径（拉取单=全码折合合计，
 *   手动扫码单显 —）；药品清单页签行数拉取单按全码聚合；②**异常码人工补录转正常码**——异常码页签行内「编辑」弹窗（码层级/父级码/生产批次/生产日期/有效期至，
 *   二级三级码父级码必填校验）保存落 manualFix='是'+checked=true → docBad 豁免（异常页签/列表异常列/审核硬拦同源解除），码详情行转正常显示人工值；
 *   ③「去维护/维护」直跳药品字典维护页 drug.html（openFix 匹配详情弹窗整体下线，badEntryOf 同删）
 * 2026-10-15 Round CO 种子收敛（用户拍板「每种大场景保留一条数据，解析异常全集中」）：解析异常全部并入 223342530（库存码已存在 ① + 解析失败 8999001
 *   ② + 五字段全空 8999002 ③），退役 FK5XSG01481340-1（解析失败）与 204-13824815（已审核并入 204-13807319 箱码演示，其入库单同步退役）；
 *   migrate `_migCO` 一次性补丁：老会话按码值幂等补两码 + 按单号幂等退役（含 DH20261015001 中途种子清理）
 * 2026-10-15 Round CP（轻量通道·用户验收修正）：①码详情页签计数恢复=码明细行数（o.codes.length）——替代 CM/CN「=列表扫码数量/扫码总量」
 *   （药品清单有计划行就不允许码明细计数为 0，两层同源）；②解析失败原因分开提示——五字段全空→指引「编辑」人工补录 / 有字段→指引「去维护」补录字典；
 *   ③_migCO→_migCO2 重跑（中途部署把旧标记烧进老会话导致退役未生效的坑）；④scan-hub「按药品清单扫码」开关恢复 Round CJ 原口径
 *   （仅 录入模式+有清单 渲染；恒渲染+禁用态下线）
 * 2026-10-15 Round CS（轻量通道·用户验收四条）：①码详情「扫码数量」改已核对口径（未核对=0）——与药品清单「扫码总量」合计恒相等；
 *   ②码详情补回「药名通用名」列；③「数量」列收敛为人工输入口径——仅清单录入单有值，拉取/手动扫码/下载失败=0
 *   （拉取单药品清单同步：数量=0、差异与进度条下线、显 —；审核判定 planQtyOf/scanQtyOf 内部逻辑不变）；
 *   ④审核新规：扫码总量为 0 不允许审核/提交——auditFlow 与 scan-core auditPrecheck 同源硬拦（原「无码审核」软确认分支下线），
 *   scan-hub embed「提交」按钮 0 码 toast 拦截
 * 2026-10-15 Round CW（用户拍板「拉取=下载即后台解析成功，视同已扫码」）：拉取单「已扫」口径=全部可解析码——列表扫码总量/
 *   药品清单扫码总量/码详情（行+计数）三层恒等（不存在有药品清单而扫码总量为 0）；异常码仍只走「异常码」页签；
 *   checked 标记退回专职扫码核对进度（scan-hub/审核判定 scanQtyOf 不变），展示层不再按其过滤拉取单；
 *   编辑弹窗 scanGot 拉取单同步全码口径（与编辑下限校验 scannedBase 同源）
 * 2026-10-16（轻量通道）：药品清单「扫码总量」列去掉换算括注「（=M 片）」——只留 decomp 主数值（如 2 盒），更干净；
 *   scan-hub/scan-lab 药品清单同列同步；扫码反馈消息里的括注保留（场景不同，不是清单列）
 * 2026-10-16 Round CY（用户拍板拉取单核对模型终版，CW 展示口径回退）：**下载即后台解析成功=计划即定**——拉取单 数量（计划）=全码折合
 *   （CS「数量=0」收敛为仅手动扫码/下载失败单）；**码默认未核对**→扫码总量=已核对折合（0 起），扫码录入逐码核对成功→已核对回涨；
 *   **不扫码直接审批=全部可解析码转已核对**（auditFlow 在零核对硬拦前翻转落盘；已部分核对的单不翻转，保留短收口径）；
 *   码详情新增「核对状态」列（已核对绿/未核对灰），拉取单列全部可解析码（CV「只列已核对」回退为仅「失败不进入」）；
 *   扫码主干 checked=true 落账本就有（scan-core），诉求「扫码解析成功默认已核对」现状即满足；扫码总量列括注维持 CX 已下线
 * 2026-10-16 Round CZ（用户重申 CW 拍板，CW+CZ 合并终版）：**拉取=下载即后台解析成功（视同已扫码）**——拉取单 数量（计划）=扫码总量=全码折合、
 *   码详情=全部可解析码且每码恒计扫码数量，三层（列表/药品清单/码详情）恒等、有药品清单必不为 0（CY「默认未核对→扫码总量 0」展示口径回退）；
 *   保留 CY 两要素：码详情「核对状态」列（物理核对进度：已核对/未核对）+ 直接审批全部码转已核对（auditFlow 翻转落盘）
 */
(function () {
  'use strict';
  var content = window.AppShell.render('desktopPreview', { active: 'arrive', crumb: ['采购管理', '采购到货单', '采购到货单'] });
  if (!content) return;

  var P = window.PUL_PCH, UI = window.PchUI, esc = UI.esc;
  var W = window.PUL_WH || null;   // 盘点冻结拦截（wh-data.js 未加载时跳过）
  var S = P.load();
  var sel = null, tab = 'drugs';   // 默认落首_tab 药品清单（2026-10-15 药品清单居首同轮）
  var filters = { orderNo: '', invoice: '', excInfo: '', shipper: '', receiver: '', warehouse: '全部', source: '全部', status: '全部', exc: '全部', dateFrom: '', dateTo: '' };
  var bf = { type: '全部', code: '', idcode: '', orderNo: '', supplier: '' };   // 台账筛选（弹窗内；Round DD 改追溯码级派生平铺：类型/追溯码/标识码/订单编号/供应商）
  var bPage = 1, B_PAGE_SIZE = 10;

  function save() { P.save(S); }
  function now() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function selOrder() {
    for (var i = 0; i < S.arrive.length; i++) if (S.arrive[i].orderNo === sel) return S.arrive[i];
    return null;
  }
  // 2026-10-15 Round CO：manualFix='是'（人工补录保存）的码视为正常码——不再计异常（异常码页签/列表异常列/审核硬拦同源豁免），下游仍无字典关联（药品信息显 —）
  function docBad(o) { return P.badCodesOf(o, S.dict).filter(function (c) { return c.manualFix !== '是'; }); }
  // 库存码已存在校验（下载后自动批量校验）：码已在采购入库台账 → 重复入库，审核硬拦
  function dupCodes(o) {
    var inStock = {};
    (S.inDocs || []).forEach(function (d) { (d.codes || []).forEach(function (c) { inStock[c.code] = d.billNo; }); });
    var out = [];
    (o.codes || []).forEach(function (c) { if (inStock[c.code]) out.push({ code: c.code, ref: inStock[c.code] }); });
    return out;
  }
  function issueCount(o) { return docBad(o).length + dupCodes(o).length; }
  function checkedCount(o) { return (o.codes || []).filter(function (c) { return c.checked; }).length; }
  function editable(o) { return o && o.downloaded !== '是' && o.dlStatus !== '失败'; }
  // 收货事实字段（收货库房/库位）：建单/下载时确定，审核前可编辑（2026-10-03 补齐）
  function curWarehouse() { return (window.store.load().currentUser || {}).warehouse || '中心库'; }
  function whOpts(cur) {
    return P.warehouses().map(function (w) { return '<option' + (w === cur ? ' selected' : '') + '>' + esc(w) + '</option>'; }).join('');
  }
  function locOpts(cur) {
    return '<option value="">请选择</option>' + P.LOC_PRESET.map(function (l) { return '<option' + (l === cur ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
  }

  // 审核状态推导（一维生命周期，不冗余状态字段）：未审核 → 已审核；反审核回未审核（展示词对齐老系统，存储 downloaded 推导不变）
  // （2026-10-04 拍板：删待录码/待验收/验收中，扫码核对是单内动作不占状态位；2026-10-13 Round BU：已退货态随到货退货功能删除而废止）
  // 三维正交（2026-10-07 拍板）：①状态=纯生命周期三态；②下载=独立维度（dlStatus 成功/失败，独立列+独立筛选，不进状态）；
  // ③异常=可叠加阻断标记（解析失败 + 库存码已存在），审核入库守卫=下载成功 ∧ 异常清零
  function statusOf(o) {
    
    if (o.downloaded === '是') return { key: 'done', txt: '已审核', cls: 'text-success' };
    return { key: 'ready', txt: '未审核', cls: 'text-secondary' };
  }
  // 异常状态列（2026-10-13 Round BS 独立成列，用户拍板「列表少了异常状态」）：状态词与筛选「异常」下拉/异常信息列同口径——
  // 下载失败 / 解析异常（含库存码已存在，明细见异常信息列）/ 无异常；已审核·已退货显 —（已审核单的码全在架，dupCodes 会误全额命中）
  function excStatusCell(o) {
    if (o.downloaded === '是') return '<span class="text-secondary">—</span>';
    if (o.dlStatus === '失败') return '<span class="text-danger">下载失败</span>';
    if (issueCount(o)) return '<span class="text-danger">解析异常</span>';
    return '<span class="text-success">无异常</span>';
  }
  // 异常信息列（2026-10-11 Round BI 统一异常状态：下载/解析两列并入本列）——下载失败 / 解析失败×N / 库存码已存在×N；无异常显 —
  // （2026-10-12：「解析数量」列删除——审核判定改用 计划数量 vs 扫码数量，解析进度不再单列；守卫口径：已审核/已退货不显——已审核单的码全在架，dupCodes 会误全额命中；点异常文本跳「异常码」页签）
  function issueInfoCell(o) {
    if (o.downloaded === '是') return '<span class="text-secondary">—</span>';
    if (o.dlStatus === '失败') return '<span class="text-danger" title="' + esc(o.dlError || '接口异常') + '">下载失败</span>';
    var b = docBad(o).length, d = dupCodes(o).length;
    if (!b && !d) return '<span class="text-secondary">—</span>';
    var parts = [];
    if (b) parts.push('解析失败×' + b);
    if (d) parts.push('库存码已存在×' + d);
    return '<a href="javascript:void(0)" class="text-danger" data-badtab="' + esc(o.orderNo) + '" title="查看异常码明细（解析失败 / 库存码已存在）">' + parts.join('；') + '</a>';
  }
  // 异常信息纯文本（2026-10-14：供筛选「异常信息」匹配，与 issueInfoCell 同口径——下载失败(含接口错误文)/解析失败×N/库存码已存在×N；已审核/无异常=空串不命中）
  function issueInfoText(o) {
    if (o.downloaded === '是') return '';
    if (o.dlStatus === '失败') return '下载失败' + (o.dlError || '接口异常');
    var b = docBad(o).length, d = dupCodes(o).length;
    return (b ? '解析失败×' + b : '') + (d ? '库存码已存在×' + d : '');
  }

  var STATUS_OPTS = [
    { key: '全部', label: '全部' }, { key: 'ready', label: '未审核' }, { key: 'done', label: '已审核' },
    
  ];
  // 2026-10-11 Round BI：下载/解析两个筛选合并为统一「异常」筛选（对齐列表「异常信息」列）
  var EXC_OPTS = [
    { key: '全部', label: '全部' }, { key: 'dlfail', label: '下载失败' }, { key: 'parse', label: '解析异常' }, { key: 'ok', label: '无异常' }
  ];
  // 键值下拉 option（2026-10-13 Round BT：补 value=key——旧版无 value 取到 label 文本，筛选实际不生效的存量 bug 同轮修复）
  function keyOpts(cur, opts) {
    return opts.map(function (o) { return '<option value="' + o.key + '"' + (cur === o.key ? ' selected' : '') + '>' + o.label + '</option>'; }).join('');
  }

  function filtered() {
    return S.arrive.filter(function (o) {
      if (filters.orderNo && o.orderNo.indexOf(filters.orderNo) === -1) return false;
      if (filters.shipper && (o.shipper || '').indexOf(filters.shipper) === -1) return false;
      if (filters.receiver && (o.receiver || '').indexOf(filters.receiver) === -1) return false;
      if (filters.warehouse !== '全部' && o.warehouse !== filters.warehouse) return false;
      if (filters.source !== '全部' && o.source !== filters.source) return false;
      if (filters.status !== '全部' && statusOf(o).key !== filters.status) return false;
      if (filters.exc !== '全部') {
        var dlFail = o.dlStatus === '失败';
        var hasBad = issueCount(o) > 0;
        if (filters.exc === 'dlfail' && !dlFail) return false;
        if (filters.exc === 'parse' && (dlFail || !hasBad)) return false;
        if (filters.exc === 'ok' && (dlFail || hasBad)) return false;
      }
      if (filters.dateFrom && o.orderTime.slice(0, 10) < filters.dateFrom) return false;
      if (filters.dateTo && o.orderTime.slice(0, 10) > filters.dateTo) return false;
      if (filters.invoice && (o.invoice || '').indexOf(filters.invoice) === -1) return false;
      if (filters.excInfo && issueInfoText(o).indexOf(filters.excInfo) === -1) return false;
      return true;
    });
  }

  // 筛选栏（2026-10-13 Round BT：全站统一「文本标签+控件」交互，标签前置——PchUI.fItem；下拉占位词统一「全部」）
  // （2026-10-14 用户拍板：删「追溯码」筛选——追码查询走 trace-q 专项页；加「发票号」「异常信息」文本筛选，后者按列表异常信息列同口径匹配）
  function filterBar() {
    var opt = function (cur, o) { return '<option' + (cur === o ? ' selected' : '') + '>' + o + '</option>'; };
    var F = UI.fItem;
    return '<div class="card mb-3"><div class="card-body" style="padding:12px 16px;">' +
      '<div class="d-flex flex-wrap align-items-center" style="gap:10px;">' +
      F('单据编号', '<input class="form-control" id="fOrderNo" style="width:140px;" value="' + esc(filters.orderNo) + '">') +
      F('发票号', '<input class="form-control" id="fInvoice" style="width:140px;" value="' + esc(filters.invoice) + '">') +
      F('发货方', '<input class="form-control" id="fShipper" style="width:150px;" value="' + esc(filters.shipper) + '">') +
      F('收货方', '<input class="form-control" id="fReceiver" style="width:110px;" value="' + esc(filters.receiver) + '">') +
      F('收货库房', '<select class="form-select" id="fWarehouse" style="width:100px;">' +
        ['全部'].concat(P.warehouses()).map(function (o) { return opt(filters.warehouse, o); }).join('') + '</select>') +
      F('来源', '<select class="form-select" id="fSource" style="width:86px;">' +
        ['全部', '拉取', '手动'].map(function (o) { return opt(filters.source, o); }).join('') + '</select>') +
      F('异常', '<select class="form-select" id="fExc" style="width:104px;">' + keyOpts(filters.exc, EXC_OPTS) + '</select>') +
      F('异常信息', '<input class="form-control" id="fExcInfo" style="width:130px;" value="' + esc(filters.excInfo) + '">') +
      F('审核', '<select class="form-select" id="fStatus" style="width:96px;">' + keyOpts(filters.status, STATUS_OPTS) + '</select>') +
      F('单据时间', '<input class="form-control" id="fDateFrom" type="date" style="width:138px;" value="' + filters.dateFrom + '">' +
        '<span class="text-secondary">-</span>' +
        '<input class="form-control" id="fDateTo" type="date" style="width:138px;" value="' + filters.dateTo + '">') +
      '<button class="btn btn-outline-primary" id="btnQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnReset">重置</button>' +
      '<div class="ms-auto btn-list">' +
      '<button class="btn btn-outline-danger" id="btnBadView">⚠ 异常码台账' + (allExceptions().length ? ' (' + allExceptions().length + ')' : '') + '</button>' +   // Round DD：计数=Σ各未审核单单内异常（与列表异常信息列同源）
      '<button class="btn btn-outline-primary" id="btnDownload">⇩ 下载单据</button>' +
      '<button class="btn btn-primary" id="btnAdd">+ 新增到货单</button></div>' +
      '</div></div></div>';
  }

  // 来源徽标（2026-10-11 细分手动双模式：扫码录入 / 清单录入）
  function srcBadge(o) {
    if (o.source === '手动') {
      return (o.items && o.items.length)
        ? '<span class="badge bg-orange-lt">手动·清单</span>'
        : '<span class="badge bg-orange-lt">手动·扫码</span>';
    }
    return '<span class="badge bg-blue-lt">拉取</span>';
  }

  // 数量列（2026-10-15 Round CN 改名：原「计划数量」）：取值 = 底部药品清单「数量」列合计——
  // 清单录入单=计划清单合计（人工输入）；**拉取单=全码折合合计（Round CX 拍板：下载即后台解析成功=计划即定）**；手动扫码单/下载失败单=0（人工输入口径）
  function planCell(o) {
    if (o.items && o.items.length) {
      var n = 0;
      o.items.forEach(function (it) { n += (it.qty || 0); });
      return '<b>' + n + '</b>';
    }
    if (o.source === '拉取' && (o.codes || []).length) {
      var m = scanTotalNum(o, false);
      return '<b>' + (window.PUL_SCAN ? window.PUL_SCAN.fmtN(m) : m) + '</b>';
    }
    return '<b>0</b>';
  }

  // 人工补录码（manualFix='是' 且仍无字典关联）：三表一致闭环补项——按 1 个计入扫码总量（列表/药品清单伪行/码详情同口径）
  function fixedCodes(o, onlyChecked) {
    return (o.codes || []).filter(function (c) {
      return c.manualFix === '是' && (!onlyChecked || c.checked) && !P.parseCode(c.code, S.dict).dict;
    });
  }

  // 扫码总量列（2026-10-15 Round CN 改名：原「扫码数量」）：取值 = 底部药品清单「扫码总量」列合计——
  // 清单单=Σ items 药品已扫折合（全码，与 drugsPlanPanel 同口径）；聚合单=Σ 已核对码折合（onlyChecked 传 false 时=全码折合，供拉取单「数量」列复用）；箱码按换算链展开
  function scanTotalNum(o, onlyChecked) {
    // Round CZ 终版口径：拉取=下载即后台解析成功（视同已扫码）——拉取单「已扫」恒按全部可解析码计（有药品清单就必有扫码总量）；
    // checked 标记专职物理核对进度（核对状态列/审核判定），不再过滤拉取单展示
    var oc = o.source === '拉取' ? false : onlyChecked;
    var n = fixedCodes(o, oc).length;
    if (o.items && o.items.length) o.items.forEach(function (it) { n += scannedBase(o, it.drugCode); });
    else P.summarize(o.codes, S.dict, oc).forEach(function (r) { n += scannedBase(o, r.drugCode, oc); });
    return n;
  }
  function scanTotalCell(o) {
    var n = scanTotalNum(o, true);
    return window.PUL_SCAN ? window.PUL_SCAN.fmtN(n) : String(n);
  }

  function orderTable() {
    var list = filtered();
    var rows = list.map(function (o, i) {
      var st = statusOf(o);
      var op;
      if (o.downloaded === '是') {
        op = '<span class="text-secondary">—</span>';   // 2026-10-09 拍板：操作栏只留按钮（已审核状态在状态列表达）
      } else if (o.dlStatus === '失败') {
        op = '<div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-redl="' + esc(o.orderNo) + '">重新下载</button>' +
          '<button class="btn btn-sm btn-outline-danger" data-deldoc="' + esc(o.orderNo) + '">删除</button>' +
          '</div>';
      } else {
        // 2026-10-12 统一审核判定：审核按钮恒可点，点入后判定（异常码/一致性/无码分支）——拦截即报异常，不做前置 disabled
        // 2026-10-13 Round BV：手动单未扫码支持删除（用户拍板——拉取单不走此通道，仍只有下载失败单可删）
        var canDel = o.source === '手动' && checkedCount(o) === 0;
        op = '<div class="btn-list">' +
          '<button class="btn btn-sm btn-outline-primary" data-scan="' + esc(o.orderNo) + '">扫码录入</button>' +
          '<button class="btn btn-sm btn-primary" data-audit="' + esc(o.orderNo) + '">审核入库</button>' +
          '<button class="btn btn-sm btn-outline-secondary" data-edit="' + esc(o.orderNo) + '">编辑</button>' +
          (canDel ? '<button class="btn btn-sm btn-outline-danger" data-deldoc="' + esc(o.orderNo) + '">删除</button>' : '') +
          '</div>';
      }
      // 审核列 = 纯生命周期三态（2026-10-13 Round BS：异常态叠加摘除——Round BL 的红标补丁下沉为独立「异常状态」列，避免两处重复表达）
      return '<tr class="pch-doc-row' + (o.orderNo === sel ? ' pch-doc-sel' : '') + (o.confirm === '未确认' ? ' pch-row-unconfirmed' : '') + '" data-sel="' + esc(o.orderNo) + '">' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(o.orderNo) + '</b></td>' +
        '<td>采购到货</td>' +
        '<td class="text-secondary">' + esc(o.orderTime) + '</td>' +
        '<td>' + esc(o.shipper) + '</td><td>' + esc(o.receiver) + '</td>' +
        '<td>' + esc(o.warehouse || '—') + (o.loc ? '<br><span class="text-secondary" style="font-size:11.5px;">' + esc(o.loc) + '</span>' : '') + '</td>' +
        '<td class="text-secondary">' + esc(o.invoice || '—') + '</td>' +
        '<td>' + srcBadge(o) + '</td>' +
        '<td>' + planCell(o) + '</td>' +
        '<td>' + scanTotalCell(o) + '</td>' +
        '<td><span class="' + st.cls + '">' + esc(st.txt) + '</span></td>' +
        '<td>' + excStatusCell(o) + '</td>' +
        '<td onclick="event.stopPropagation()">' + issueInfoCell(o) + '</td>' +
        '<td onclick="event.stopPropagation()">' + op + '</td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="15" class="text-center text-secondary" style="padding:32px;">暂无到货单——点右上角「下载单据」从供应商平台拉取，或「+ 新增到货单」手动建单</td></tr>';
    return '<div class="card mb-3"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>单据编号</th><th>单据类型</th><th>单据时间</th><th>发货方</th><th>收货方</th><th>收货库房</th><th>发票号</th><th>来源</th><th>数量</th><th>扫码总量</th><th>审核</th><th>异常状态</th><th>异常信息</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  // ===== 到货明细三页签：原业务计算 → PulDocDetail 标准 model/options → 公共组件渲染 =====
  var detailModel = { drugs: [], codes: [], bad: [], activeTab: tab, empty: true };
  function tabSection() {
    var o = selOrder();
    detailModel = o ? {
      drugs: drugsPanel(o), codes: codesPanel(o), bad: badPanel(o), activeTab: tab
    } : { drugs: [], codes: [], bad: [], activeTab: tab, empty: true };
    return window.PulDocDetail.renderTabs(detailModel, {
      title: '到货明细',
      metaHtml: o ? '<span class="text-secondary ms-2" style="font-size:12.5px;">到货单 ' + esc(o.orderNo) + ' · 共 ' + o.codes.length + ' 个追溯码 · ' + esc(statusOf(o).txt) + (o.dlStatus === '失败' ? ' · <span class="text-danger">下载失败（' + esc(o.dlError || '接口异常') + '）</span>' : '') + '</span>' : '',
      emptyText: '点击到货单行，查看验收明细',
      tabs: ['drugs', 'codes', 'bad'],
      counts: { codes: 'scanQty' },
      drugs: {
        emptyText: o && o.source === '拉取'
          ? (o.dlStatus === '失败' ? '码明细下载失败，无药品清单——点行内「重新下载」重试' : '暂无可解析药品（异常码见「异常码」页签）')
          : '暂无可解析药品'
      },
      codes: {
        emptyText: o && o.dlStatus === '失败' ? '码明细下载失败——点行内「重新下载」重试'
          : (o && o.codes.length ? '暂无可显示明细（' + o.codes.length + ' 个码全部在「异常码」页签待处理）' : '码清单为空——点行内「扫码录入」在扫码弹窗录入')
      },
      bad: {
        columns: ['seq', 'code', 'idcode', 'reason', 'actions'],
        emptyText: '无异常码，可以审核入库',
        note: o ? '解析失败→「去维护」补录字典或「编辑」人工补录（关键字段为空），处理后点右侧重新解析；库存码已存在→在「扫码录入」弹窗移除重复码' : '',
        panelActions: o ? [{ key: 'reparse', disabled: !editable(o) }] : []
      }
    });
  }

  // 码详情适配：保留原过滤、manualFix、行状态、扫码折合与发码机构映射，raw 供事件回调定位原记录
  var ISSUER = { '阿里': '码上放心', 'GS1': 'GS1', 'IDCODE': 'IDCODE' };
  var LVL_TXT = { 1: '一级码', 2: '二级码', 3: '三级码' };
  function codesPanel(o) {
    var SC = window.PUL_SCAN;
    return o.codes.filter(function (c) {
      var p = P.parseCode(c.code, S.dict);
      if (!p.dict) return c.manualFix === '是' && c.checked;   // 人工补录码=已转正常，保留
      return o.source === '拉取' ? true : c.checked;
    }).map(function (c) {
      var p = P.parseCode(c.code, S.dict);
      var bad = !p.dict;
      var fixed = bad && c.manualFix === '是';
      var cls = bad && !fixed ? 'pch-row-bad' : (c.checked ? 'pch-row-checked' : '');
      var qty = bad ? null : SC.codeContrib(c);
      var unit = bad ? '' : ((window.PUL_DRUG.drugOf(window.PUL_DRUG.load(), p.dict.drugCode) || {}).baseUnit || '');
      return {
        raw: c,
        className: cls,
        code: c.code,
        drugName: bad ? '—' : p.dict.drugName,
        level: fixed ? (LVL_TXT[c.level] || (c.level + '级码')) : (bad ? '—' : (LVL_TXT[p.dict.level] || (p.dict.level + '级码'))),
        parentCode: fixed ? (c.parentCode || '—') : '—',
        batch: bad && !fixed ? '—' : (c.batch || '—'),
        prodDate: bad && !fixed ? '—' : (c.prodDate || '—'),
        expDate: bad && !fixed ? '—' : (c.expDate || '—'),
        scanQty: fixed ? 1 : qty,
        scanText: fixed ? '1' : (qty == null ? '—' : SC.fmtN(qty) + (unit ? ' ' + unit : '')),
        status: { kind: c.checked ? 'done' : 'todo', text: c.checked ? '已核对' : '未核对' },
        idcode: p.idcode,
        issuer: ISSUER[p.codeType] || '—'
      };
    });
  }

  // 药品清单（人读视图）：2026-10-15 Round CK 需求拍板列收敛——
  //   四列药品标识（药品名称/药品规格/生产厂家/批准文号）= 码解析 → 药品字典关联获取（summarize 派生）；
  //   单价 = 字典 drugCode → 单价变更记录子表最新一条（PUL_DRUG.latestPrice）；数量 = 创建清单人工输入（扫码/下载单无清单显 —）；
  //   扫码总量 = 该药计算单位层已核对码折合（scannedBase onlyChecked，聚合单与清单单同口径）；单位 = 库存单位层 baseUnit（到货=库房单据）；
  //   金额 = 扫码总量 × 单价；其余列（批次号/生产日期/有效期至/包装规格/库位/药品编码）暂时隐藏
  // 2026-10-15 Round CM：扫码总量单元格参考 scan-hub 药品清单样式（decomp 主数值 + 清单单进度条；2026-10-16 起去掉「（=M 片）」换算括注）+
  //   补「差异」列——清单单按 数量-扫码总量 出备齐/缺/超徽标（对齐 SC 徽标语义），聚合单无计划显 —
  function drugsPanel(o) {
    var DS = window.PUL_DRUG.load(), SC = window.PUL_SCAN;
    if (o.items && o.items.length) return drugsPlanPanel(o);
    if (o.source === '拉取') return drugsPullPanel(o);
    var list = P.summarize(o.codes, S.dict, true);
    var rows = list.map(function (r) {
      var d = window.PUL_DRUG.drugOf(DS, r.drugCode) || {};
      var price = window.PUL_DRUG.latestPrice(DS, r.drugCode);
      var got = scannedBase(o, r.drugCode, true);
      var amt = price == null ? null : got * price;
      return {
        raw: r,
        drugName: r.drugName,
        formSpec: r.formSpec,
        maker: r.maker,
        approval: r.approval,
        price: price,
        qty: 0,
        scanQty: got,
        scanText: SC.decomp(r.drugCode, got),
        unit: d.baseUnit || r.unit,
        amount: amt
      };
    });
    return rows.concat(fixedRows(o));
  }

  // 清单录入单计划清单视图：2026-10-15 Round CK 与聚合单同款列收敛——数量=创建清单人工输入（可为0）、
  // 扫码总量=已扫折库存单位层、金额=扫码总量×单价；2026-10-15 Round CM：扫码总量补双单位+进度条、差异徽标回列（需求拍板加回差异）
  function drugsPlanPanel(o) {
    var DS = window.PUL_DRUG.load(), SC = window.PUL_SCAN;
    return o.items.map(function (it) {
      var d = window.PUL_DRUG.drugOf(DS, it.drugCode) || {};
      var price = window.PUL_DRUG.latestPrice(DS, it.drugCode);
      var got = scannedBase(o, it.drugCode);
      var amt = price == null ? null : got * price;
      var plan = it.qty || 0;
      var diff = plan - got;
      var pct = plan > 0 ? Math.min(100, Math.round(got / plan * 100)) : 0;
      var diffModel = Math.abs(diff) <= SC.EPS && got > 0
        ? { kind: 'full', text: '✓ 备齐' }
        : (diff > 0 ? { kind: 'short', text: '缺 ' + SC.decomp(it.drugCode, diff) }
                    : { kind: 'over', text: '超 ' + SC.decomp(it.drugCode, -diff) });
      return {
        raw: it,
        drugName: d.drugName || it.drugCode,
        formSpec: d.formSpec || '—',
        maker: d.maker || '—',
        approval: d.approval || '—',
        price: price,
        qty: plan,
        scanQty: got,
        scanText: SC.decomp(it.drugCode, got),
        progress: pct,
        diff: diffModel,
        unit: d.baseUnit || '—',
        amount: amt
      };
    });
  }

  // 人工补录码伪行适配：保留原标识与码值文本，数量/扫码量仍按 0/1 计入
  function fixedRows(o) {
    return fixedCodes(o, true).map(function (c) {
      return {
        raw: c,
        drugName: '（人工补录码） ' + c.code,
        formSpec: '—', maker: '—', approval: '—', price: null,
        qty: 0, scanQty: 1, scanText: '1', unit: '—', amount: null
      };
    });
  }

  // 拉取单药品清单（2026-10-15 Round CX 拍板终版：下载即后台解析成功=计划即定——数量=全码折合；码默认未核对→扫码总量=已核对折合、
  // 扫码录入逐码核对回涨，或直接审批全部转已核对；差异=数量-扫码总量 徽标+进度条回归）：下载失败单无码 → 空态；解析失败码不入聚合（在异常码页签表达）
  function drugsPullPanel(o) {
    var DS = window.PUL_DRUG.load(), SC = window.PUL_SCAN;
    var list = P.summarize(o.codes, S.dict);
    var rows = list.map(function (r) {
      var d = window.PUL_DRUG.drugOf(DS, r.drugCode) || {};
      var price = window.PUL_DRUG.latestPrice(DS, r.drugCode);
      var plan = scannedBase(o, r.drugCode);
      var got = scannedBase(o, r.drugCode);
      var amt = price == null ? null : got * price;
      var diff = plan - got;
      var pct = plan > 0 ? Math.min(100, Math.round(got / plan * 100)) : 0;
      var diffModel = Math.abs(diff) <= SC.EPS && got > 0
        ? { kind: 'full', text: '✓ 备齐' }
        : (diff > 0 ? { kind: 'short', text: '缺 ' + SC.decomp(r.drugCode, diff) }
                    : { kind: 'over', text: '超 ' + SC.decomp(r.drugCode, -diff) });
      return {
        raw: r,
        drugName: r.drugName,
        formSpec: r.formSpec,
        maker: r.maker,
        approval: r.approval,
        price: price,
        qty: SC.fmtN(plan),
        scanQty: got,
        scanText: SC.decomp(r.drugCode, got),
        progress: pct,
        diff: diffModel,
        unit: d.baseUnit || r.unit,
        amount: amt
      };
    });
    return rows.concat(fixedRows(o));
  }

  // 已扫折合（基本单位；口径同 scan-core codeContrib：整码按层级换算链、拆零码按 splitQty）
  // 2026-10-15 Round CK：补 onlyChecked 参数——药品清单「扫码总量」只计已核对码（聚合单与清单单同口径）
  // 2026-10-15 Round CT：manualFix（人工补录转正常码）且仍无字典关联的码按 1 个计（三表一致：列表扫码总量=药品清单合计=码详情合计）
  function scannedBase(o, dc, onlyChecked) {
    var DS = window.PUL_DRUG.load(), d = window.PUL_DRUG.drugOf(DS, dc), n = 0;
    (o.codes || []).forEach(function (c) {
      if (onlyChecked && !c.checked) return;
      var p = P.parseCode(c.code, S.dict);
      if (!p.dict || p.dict.drugCode !== dc) return;
      if (c.split === '是' && c.splitQty !== '' && c.splitQty != null) {
        n += d && d.minUnit ? (+c.splitQty) / d.minUnit.per : +c.splitQty;
        return;
      }
      var v = d ? window.PUL_DRUG.conv(DS, dc, 1, p.dict.packUnit || p.dict.unit, d.baseUnit) : null;
      n += v == null ? 1 : v;
    });
    return n;
  }

  // 解析失败原因双通道文案（2026-10-15 Round CP 用户拍板）：单内「异常码」页签与台账弹窗（Round DD）共用同一措辞
  function badReasonText(c) {
    var emptyKeys = !c.batch && !c.prodDate && !c.expDate;
    return emptyKeys
      ? '标识码未维护，关键字段（生产批次/生产日期/有效期至）为空——点「编辑」人工补录后转正常码'
      : '标识码未维护，无法解析药品——「去维护」补录字典，或「编辑」人工补录';
  }
  // 异常码页签 = 两类异常合并：① 解析失败（标识码未维护 → 去维护补录字典）② 库存码已存在（重复入库 → 扫码录入弹窗移除该码或整单退货；2026-10-13 Round BU 起码详情无删码）
  function badPanel(o) {
    var bad = docBad(o);
    var dups = dupCodes(o);
    var rows = bad.map(function (c) {
      var p = P.parseCode(c.code, S.dict);
      return {
        raw: c,
        className: 'pch-row-bad',
        code: c.code,
        idcode: p.idcode,
        reason: badReasonText(c),
        actions: (editable(o) ? ['editBad'] : []).concat(['maintainBad'])
      };
    });
    return rows.concat(dups.map(function (d) {
      return {
        raw: d,
        className: 'pch-row-bad',
        code: d.code,
        idcode: d.code.slice(0, 7),
        reason: '库存码已存在（入库单 ' + d.ref + '），重复入库被拦截',
        actions: ['goScan']
      };
    }));
  }

  // ===== 下载单据：供应商平台码单池（弹窗字段对齐老系统） → 拉取生成院内到货单 =====
  var pf = { code: '', orderNo: '', shipper: '', drugName: '', formSpec: '', packSpec: '', maker: '', approval: '', supplier: '', pulled: '全部', dateFrom: '', dateTo: '' };
  var poolSel = null, dlChecked = {};

  function poolFiltered() {
    return S.platform.filter(function (o) {
      if (pf.orderNo && o.orderNo.indexOf(pf.orderNo) === -1) return false;
      if (pf.shipper && o.shipper.indexOf(pf.shipper) === -1) return false;
      if (pf.supplier && o.supplier !== pf.supplier) return false;
      if (pf.pulled !== '全部' && o.pulled !== pf.pulled) return false;
      if (pf.dateFrom && o.orderTime.slice(0, 10) < pf.dateFrom) return false;
      if (pf.dateTo && o.orderTime.slice(0, 10) > pf.dateTo) return false;
      if (pf.code && !(o.codes || []).some(function (c) { return c.code.indexOf(pf.code) !== -1; })) return false;
      if (pf.drugName || pf.formSpec || pf.packSpec || pf.maker || pf.approval) {
        var rows = P.summarize(o.codes, S.dict);
        var hit = rows.some(function (r) {
          return (!pf.drugName || r.drugName.indexOf(pf.drugName) !== -1) &&
            (!pf.formSpec || r.formSpec.indexOf(pf.formSpec) !== -1) &&
            (!pf.packSpec || r.packSpec.indexOf(pf.packSpec) !== -1) &&
            (!pf.maker || r.maker.indexOf(pf.maker) !== -1) &&
            (!pf.approval || r.approval.indexOf(pf.approval) !== -1);
        });
        if (!hit) return false;
      }
      return true;
    });
  }

  function poolRowsHtml() {
    var list = poolFiltered();
    var rows = list.map(function (o, i) {
      var pulled = o.pulled === '是';
      return '<tr data-pool="' + esc(o.orderNo) + '" style="cursor:pointer;' + (o.orderNo === poolSel ? 'background:#e7f1ff;' : '') + '">' +
        '<td onclick="event.stopPropagation()"><input type="checkbox" class="form-check-input" data-dlcheck="' + esc(o.orderNo) + '"' +
          (dlChecked[o.orderNo] ? ' checked' : '') + (pulled ? ' disabled' : '') + '></td>' +
        '<td>' + (i + 1) + '</td><td><b>' + esc(o.orderNo) + '</b></td>' +
        '<td class="text-secondary">' + esc(o.orderTime) + '</td>' +
        '<td>' + esc(o.supplier) + '</td><td>' + esc(o.shipper) + '</td>' +
        '<td>' + (pulled ? '<span class="text-success">是</span>' : '<span class="text-secondary">否</span>') + '</td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="7" class="text-center text-secondary" style="padding:24px;">供应商平台暂无匹配码单</td></tr>';
    return rows;
  }

  function poolDetailHtml() {
    var o = null;
    S.platform.forEach(function (x) { if (x.orderNo === poolSel) o = x; });
    if (!o) return '<div class="text-center text-secondary" style="padding:20px;">点击码单行，预览药品明细</div>';
    var list = P.summarize(o.codes, S.dict);
    var rows = list.map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.drugName) + '</b></td><td>' + esc(r.formSpec) + '</td>' +
        '<td>' + esc(r.packSpec) + '</td><td>' + esc(r.batch) + '</td><td>' + esc(r.prodDate) + '</td><td>' + esc(r.expDate) + '</td>' +
        '<td><b>' + r.qty + '</b></td><td>' + esc(r.unit) + '</td>' +
        '<td class="text-secondary">' + esc(r.approval) + '</td><td class="text-secondary">' + esc(r.maker) + '</td>' +
        // 码明细下钻（2026-10-14 Round CG 用户拍板：药品明细缺码明细弹窗——对齐 purchase-detail openCodes 模式）
        '<td><button class="btn btn-sm btn-outline-primary" data-poolcodes="' + esc(r.drugCode) + '|' + esc(r.batch) + '">码明细</button></td></tr>';
    }).join('');
    if (!list.length) rows = '<tr><td colspan="12" class="text-center text-secondary" style="padding:20px;">暂无可解析药品</td></tr>';
    return '<div class="table-responsive" style="max-height:280px;overflow-y:auto;"><table class="table table-vcenter table-sm card-table">' +
      '<thead><tr><th>序号</th><th>药名通用名</th><th>制剂规格</th><th>包装规格</th><th>批次号</th><th>生产日期</th><th>有效期至</th><th>数量</th><th>单位</th><th>批准文号</th><th>生产企业</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  // 码明细弹窗（2026-10-14 Round CG：药品明细行下钻逐码——对齐 purchase-detail openCodes 模式；按 药品+批次 过滤码单 codes；
  // 列结构对齐本页「码详情」页签：一级/二级/三级码 + 批次/生产日期/有效期）
  function openPoolCodes(o, r) {
    var rows = (o.codes || []).filter(function (c) {
      var p = P.parseCode(c.code, S.dict);
      return p.dict && p.dict.drugCode === r.drugCode && c.batch === r.batch;
    });
    var body = rows.map(function (c, i) {
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(c.code) + '</td>' +
        '<td class="text-secondary" style="font-family:Consolas,monospace;font-size:12px;">' + esc(c.code2 || '—') + '</td>' +
        '<td class="text-secondary" style="font-family:Consolas,monospace;font-size:12px;">' + esc(c.code3 || '—') + '</td>' +
        '<td>' + esc(c.batch || '—') + '</td><td>' + esc(c.prodDate || '—') + '</td><td>' + esc(c.expDate || '—') + '</td></tr>';
    }).join('');
    UI.modalShell('pchPoolCodes', '码明细 · ' + r.drugName + '（批次 ' + esc(r.batch) + '）',
      '<div class="text-secondary" style="font-size:12.5px;margin-bottom:10px;">共 ' + rows.length + ' 个追溯码</div>' +
      '<div class="table-responsive" style="max-height:420px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品追溯码(一级)</th><th>药品追溯码(二级)</th><th>药品追溯码(三级)</th><th>批次号</th><th>生产日期</th><th>有效期至</th></tr></thead>' +
      '<tbody>' + (rows.length ? body : '<tr><td colspan="7" class="text-center text-secondary" style="padding:24px;">无码明细</td></tr>') + '</tbody></table></div>',
      '<button class="btn btn-outline-secondary" data-mclose>关闭</button>', 960);
    UI.open('pchPoolCodes');
  }

  // 拉取动作：码单池 → 院内到货单（来源=拉取，确认状态=未确认，未审核）
  // 下载失败演示：池单 dlFail='是' 且未重试过 → 生成 dlStatus='失败' 的空码到货单（接口超时），行内「重新下载」补齐码明细
  function doDownload(orders, el) {
    if (!orders.length) { window.showToast('没有可下载的码单（已下载的不会重复拉取）'); return; }
    var wh = el.querySelector('#dlWarehouse').value;
    if (!wh) { window.showToast('请选择收货库房'); return; }
    var loc = el.querySelector('#dlLocation').value;
    var okN = 0, failN = 0;
    orders.forEach(function (o) {
      o.pulled = '是';
      var fail = o.dlFail === '是' && !o._dlRetried;
      if (fail) failN++; else okN++;
      S.arrive.unshift({ orderNo: o.orderNo, orderTime: o.orderTime, supplier: o.supplier, shipper: o.shipper,
        receiver: '中心院区', docType: '销售出库', source: '拉取', confirm: '未确认', downloaded: '否',
        dlStatus: fail ? '失败' : '成功', dlError: fail ? '供应商平台接口超时，码单明细下载失败' : '',
        invoice: o.invoice || '', warehouse: wh, loc: loc,
        codes: fail ? [] : o.codes.map(function (c) { return Object.assign({}, c); }) });
    });
    dlChecked = {};
    save();
    window.showToast((okN ? '已下载 ' + okN + ' 张码单到到货单列表（入库到「' + wh + '」，已自动解析+库存码校验）' : '') +
      (failN ? (okN ? '；' : '') + failN + ' 张下载失败（接口超时），请到列表行内「重新下载」' : ''));
    refreshDl(el);
    renderAll();
  }

  // 重新下载：下载失败单 → 从码单池补齐码明细（幂等；重试后解除 dlFail 演示标记 → 必成功），重新自动解析+库存码校验
  function retryDownload(o) {
    var pool = null;
    (S.platform || []).forEach(function (p) { if (p.orderNo === o.orderNo) pool = p; });
    if (!pool) { window.showToast('供应商平台找不到原始码单 ' + o.orderNo + '，无法重新下载，请删除后手动新增'); return; }
    pool._dlRetried = true;
    o.dlStatus = '成功'; o.dlError = '';
    o.codes = pool.codes.map(function (c) { return Object.assign({}, c); });
    save(); renderAll();
    var issues = issueCount(o);
    window.showToast('重新下载成功：' + o.codes.length + ' 个追溯码已自动解析' +
      (issues ? '，发现 ' + issues + ' 个异常码（见「异常码」页签）' : '，无异常，可直接审核入库'));
  }

  // 删除到货单：下载失败单释放码单池（pulled 复位 → 可再次下载）；手动单（未扫码）直接删除；UI.confirm 单据级确认
  function deleteDoc(o) {
    var fromPool = o.dlStatus === '失败';
    UI.confirm('确定删除到货单 <b>' + esc(o.orderNo) + '</b>？' +
      (fromPool ? '删除后供应商平台码单恢复未下载，可重新拉取。' : '删除后不可恢复。'), function () {
      if (fromPool) (S.platform || []).forEach(function (p) { if (p.orderNo === o.orderNo) { p.pulled = '否'; p._dlRetried = false; } });
      S.arrive = S.arrive.filter(function (x) { return x.orderNo !== o.orderNo; });
      if (sel === o.orderNo) sel = S.arrive.length ? S.arrive[0].orderNo : null;
      save(); renderAll();
      window.showToast('已删除到货单 ' + o.orderNo + (fromPool ? '，码单池已恢复可下载' : ''));
    }, '确定删除');
  }

  function refreshDl(el) {
    el.querySelector('#dlPoolRows').innerHTML = poolRowsHtml();
    el.querySelector('#dlPoolDetail').innerHTML = poolDetailHtml();
    bindDlRows(el);
  }

  function bindDlRows(el) {
    el.querySelectorAll('[data-pool]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        poolSel = tr.getAttribute('data-pool');
        refreshDl(el);
      });
    });
    el.querySelectorAll('[data-dlcheck]').forEach(function (c) {
      c.addEventListener('change', function () {
        var no = c.getAttribute('data-dlcheck');
        if (c.checked) dlChecked[no] = true; else delete dlChecked[no];
      });
    });
    // 码明细下钻（2026-10-14 Round CG）：药品明细行按钮 → openPoolCodes（key=drugCode|batch，重查 summarize 行取药名）
    el.querySelectorAll('[data-poolcodes]').forEach(function (b) {
      b.addEventListener('click', function () {
        var kb = b.getAttribute('data-poolcodes').split('|');
        var o = null;
        S.platform.forEach(function (x) { if (x.orderNo === poolSel) o = x; });
        if (!o) return;
        var r = P.summarize(o.codes, S.dict).filter(function (x) { return x.drugCode === kb[0] && x.batch === kb[1]; })[0];
        if (r) openPoolCodes(o, r);
      });
    });
  }

  function openDownload() {
    pf = { code: '', orderNo: '', shipper: '', drugName: '', formSpec: '', packSpec: '', maker: '', approval: '', supplier: '', pulled: '全部', dateFrom: '', dateTo: '' };
    poolSel = null; dlChecked = {};
    var supOpts = S.platform.map(function (o) { return o.supplier; })
      .filter(function (s, i, arr) { return arr.indexOf(s) === i; })
      .map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    // 搜索区（2026-10-14 Round CG 用户拍板「弹窗搜索改为和到货单列表一致」）：对齐 filterBar——fItem 文本标签+控件 +
    // 同款按钮规格（查询=outline-primary / 重置=outline-secondary / 动作钮 ms-auto），废弃裸 placeholder 框；下拉占位词统一「全部」
    var F = UI.fItem;
    UI.modalShell('pchDl', '下载单据（供应商平台码单池）',
      '<div class="d-flex flex-wrap align-items-center mb-2" style="gap:10px;">' +
      F('追溯码', '<input class="form-control" id="pfCode" style="width:150px;">') +
      F('订单号', '<input class="form-control" id="pfOrderNo" style="width:150px;">') +
      F('发货企业', '<input class="form-control" id="pfShipper" style="width:160px;">') +
      F('药品名称', '<input class="form-control" id="pfDrugName" style="width:140px;">') +
      F('制剂规格', '<input class="form-control" id="pfFormSpec" style="width:100px;">') +
      F('包装规格', '<input class="form-control" id="pfPackSpec" style="width:100px;">') +
      F('生产企业', '<input class="form-control" id="pfMaker" style="width:160px;">') +
      F('批准文号', '<input class="form-control" id="pfApproval" style="width:140px;">') +
      F('供应商', '<select class="form-select" id="pfSupplier" style="width:190px;"><option value="">全部</option>' + supOpts + '</select>') +
      F('已下载', '<select class="form-select" id="pfPulled" style="width:90px;"><option value="全部">全部</option><option>是</option><option>否</option></select>') +
      F('订单时间', '<input class="form-control" id="pfDateFrom" type="date" style="width:138px;">' +
        '<span class="text-secondary">-</span>' +
        '<input class="form-control" id="pfDateTo" type="date" style="width:138px;">') +
      '<button class="btn btn-outline-primary" id="pfQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="pfReset">重置</button>' +
      '<div class="ms-auto btn-list"><button class="btn btn-outline-primary" id="pfRefresh" title="对接供应商平台接口，人工触发拉取最新码单并刷新列表">更新列表</button></div>' +
      '</div>' +
      '<div class="table-responsive" style="max-height:280px;overflow-y:auto;"><table class="table table-vcenter table-sm card-table">' +
      '<thead><tr><th style="width:36px;"></th><th>序号</th><th>采购订单号</th><th>订单时间</th><th>供应商名称</th><th>发货企业</th><th>已下载</th></tr></thead>' +
      '<tbody id="dlPoolRows">' + poolRowsHtml() + '</tbody></table></div>' +
      '<div style="border-top:1px dashed #e2e8f0;margin:10px 0 8px;padding-top:8px;"><b style="font-size:13px;">药品明细</b></div>' +
      '<div id="dlPoolDetail">' + poolDetailHtml() + '</div>' +
      '<div style="border-top:1px dashed #e2e8f0;margin:10px 0 8px;padding-top:8px;"><b style="font-size:13px;">入库信息</b>' +
        '<span class="text-secondary" style="font-size:12px;">（本次下载的码单统一入库到；发票号随各平台码单自动带入，下载后可在列表「编辑」修改）</span></div>' +
      '<div class="row g-2">' +
      '<div class="col-4"><label class="form-label required">收货库房</label><select class="form-select form-select-sm" id="dlWarehouse">' + whOpts(curWarehouse()) + '</select></div>' +
      '<div class="col-4"><label class="form-label">库位</label><select class="form-select form-select-sm" id="dlLocation">' + locOpts('') + '</select></div></div>',
      '<button class="btn btn-outline-secondary" data-mclose>关闭</button>' +
      '<button class="btn btn-primary" id="dlChecked">选中下载</button>', 1280);   // Round CG：1080→1280（用户拍板「弹窗放大」，对齐台账/扫码弹窗档）
    var el = UI.open('pchDl');
    bindDlRows(el);
    el.querySelector('#pfQuery').addEventListener('click', function () {
      pf = { code: gv(el, 'pfCode'), orderNo: gv(el, 'pfOrderNo'), shipper: gv(el, 'pfShipper'), drugName: gv(el, 'pfDrugName'),
        formSpec: gv(el, 'pfFormSpec'), packSpec: gv(el, 'pfPackSpec'), maker: gv(el, 'pfMaker'), approval: gv(el, 'pfApproval'),
        supplier: el.querySelector('#pfSupplier').value, pulled: el.querySelector('#pfPulled').value,
        dateFrom: el.querySelector('#pfDateFrom').value, dateTo: el.querySelector('#pfDateTo').value };
      poolSel = null;
      refreshDl(el);
    });
    el.querySelector('#pfReset').addEventListener('click', function () { UI.close('pchDl'); openDownload(); });
    // 更新列表：对接供应商平台接口，人工触发拉取最新码单（2026-10-09 拍板，替代原「结果下载」）
    // 原型模拟：首次点击拉入 1 条新平台码单，之后同步返回无新增；列表按当前筛选刷新
    var fetched = false;
    el.querySelector('#pfRefresh').addEventListener('click', function () {
      if (!fetched) {
        fetched = true;
        S.platform.unshift({ orderNo: '9419122', orderTime: '2026-10-09 09:12:00', supplier: '福建三明同春医药有限公司',
          shipper: '福建三明同春医药有限公司', pulled: '否', invoice: '', codes: [] });
        save();
        window.showToast('已从供应商平台拉取 1 条新码单');
      } else {
        window.showToast('已同步供应商平台，暂无新增码单');
      }
      poolSel = null;
      refreshDl(el);
    });
    el.querySelector('#dlChecked').addEventListener('click', function () {
      var orders = S.platform.filter(function (o) { return dlChecked[o.orderNo] && o.pulled !== '是'; });
      doDownload(orders, el);
    });
  }
  function gv(el, id) { var n = el.querySelector('#' + id); return n ? n.value.trim() : ''; }

  // ===== 新增到货单（手动兜底；2026-10-11 Round BI 双模式：扫码录入=逐码建行 / 清单录入=先选药品清单再扫码核对） =====
  function nowLocal() {   // datetime-local 值格式 'YYYY-MM-DDTHH:MM'
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function openAdd() {
    var supOpts = S.arrive.map(function (o) { return o.supplier; })
      .filter(function (s, i, arr) { return arr.indexOf(s) === i; })
      .map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    var defNo = 'DH' + String(Date.now()).slice(-10);
    UI.modalShell('pchAdd', '新增到货单（手动）',
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">单据编号</label>' +
        '<input class="form-control" id="adNo" value="' + defNo + '"></div>' +
      '<div class="col-6"><label class="form-label required">单据时间</label>' +
        '<input class="form-control" id="adTime" type="datetime-local" value="' + nowLocal() + '"></div></div>' +
      '<div class="mb-2"><label class="form-label required">发货方（供应商）</label><select class="form-select" id="adSupplier">' + supOpts + '</select></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">收货库房</label><select class="form-select" id="adWarehouse">' + whOpts(curWarehouse()) + '</select></div>' +
      '<div class="col-6"><label class="form-label">库位</label><select class="form-select" id="adLocation">' + locOpts('') + '</select></div></div>' +
      '<div class="mb-2"><label class="form-label">发票号</label><input class="form-control" id="adInvoice" placeholder="供应商随货发票号，可后补"></div>' +
      '<div class="mb-2"><label class="form-label required">录入方式</label><div class="d-flex" style="gap:18px;padding-top:5px;">' +
        '<label class="form-check" style="margin:0;"><input class="form-check-input" type="radio" name="adMode" id="adModeScan" value="scan" checked><span class="form-check-label">扫码录入（逐码建码清单）</span></label>' +
        '<label class="form-check" style="margin:0;"><input class="form-check-input" type="radio" name="adMode" id="adModePlan" value="plan"><span class="form-check-label">清单录入（先选药品清单，再扫码核对）</span></label></div></div>' +
      '<div id="adPick" style="display:none;"></div>' +
      '<div class="text-secondary" style="font-size:12.5px;margin-top:8px;">保存后到货单出现在本列表（来源=手动，状态=未审核），点行内「扫码录入」跳统一扫码页作业：扫码录入=逐码建行；清单录入=按计划清单核对（不在清单× / 超量×）。收货库房/库位/发票号审核前可在列表「编辑」修改。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>关闭</button>' +
      '<button class="btn btn-primary" id="adOk">保存</button>', 1000);
    var el = UI.open('pchAdd');
    // 清单录入 → 展开药品选择器（公共组件 PulDrugPicker；库房场景无行级货位 showSlot:false）
    var picker = null, pickBox = el.querySelector('#adPick');
    function syncMode() {
      var plan = el.querySelector('#adModePlan').checked;
      pickBox.style.display = plan ? '' : 'none';
      if (plan && !picker) {
        picker = window.PulDrugPicker.mount(pickBox, {
          warehouse: el.querySelector('#adWarehouse').value,
          pharmacy: W && W.curPharm ? W.curPharm() : undefined,
          showSlot: false, items: []
        });
      }
    }
    el.querySelector('#adModeScan').addEventListener('change', syncMode);
    el.querySelector('#adModePlan').addEventListener('change', syncMode);
    el.querySelector('#adWarehouse').addEventListener('change', function () {
      if (picker) picker.reload({ warehouse: el.querySelector('#adWarehouse').value });
    });
    el.querySelector('#adOk').addEventListener('click', function () {
      var no = el.querySelector('#adNo').value.trim();
      if (!no) { window.showToast('单据编号为必填项'); return; }
      if (S.arrive.some(function (o) { return o.orderNo === no; })) { window.showToast('单据编号 ' + no + ' 已存在，请更换'); return; }
      var t = el.querySelector('#adTime').value;
      if (!t) { window.showToast('请选择单据时间'); return; }
      var sup = el.querySelector('#adSupplier').value;
      var wh = el.querySelector('#adWarehouse').value;
      if (!wh) { window.showToast('请选择收货库房'); return; }
      var plan = el.querySelector('#adModePlan').checked;
      var items = [];
      if (plan) {
        items = picker ? picker.getItems().map(function (it) { return { drugCode: it.drugCode, qty: it.qty }; }) : [];
        if (!items.length) { window.showToast('清单录入：请至少选择 1 个药品（数量需 ≥1）'); return; }
      }
      S.arrive.unshift({ orderNo: no, orderTime: t.replace('T', ' '), supplier: sup, shipper: sup, receiver: '中心院区',
        docType: '销售出库', source: '手动', confirm: '未确认', downloaded: '否', dlStatus: '成功',
        invoice: el.querySelector('#adInvoice').value.trim(), warehouse: wh, loc: el.querySelector('#adLocation').value,
        items: items, codes: [] });
      sel = no;
      save(); UI.close('pchAdd'); renderAll();
      // 2026-10-14 需求拍板：录入方式=扫码录入 → 保存后直接打开扫码弹窗（免再点行内按钮）；清单录入维持行内入口提示
      if (plan) {
        window.showToast('已创建到货单 ' + no + '（未审核），点行内「扫码录入」按计划清单扫码核对');
      } else {
        window.showToast('已创建到货单 ' + no + '（未审核），请扫码录入');
        UI.openScanHub(no, renderAll);
      }
    });
  }

  // ===== 编辑到货信息：仅未审核可改；已审核要改走「采购入库单」反审核 =====
  // 2026-10-13 Round BX 用户拍板：编辑与新增的药品清单交互一致（统一 PulDrugPicker，可加药/改数量）——
  //   无清单单（拉取/扫码录入）初值=码聚合转计划清单，保存后与清单录入单同构（planQtyOf 走 items 合计，o.planQty 弃用）；
  //   编辑限制=每药计划数量 ≥ 该药已扫折合（多扫的先在「扫码录入」弹窗移除）
  function openEdit(o) {
    if (!o || !editable(o)) return;
    var initItems = (o.items && o.items.length) ? o.items
      : P.summarize(o.codes, S.dict).map(function (r) { return { drugCode: r.drugCode, qty: r.qty }; });
    UI.modalShell('pchEdit', '编辑到货信息 · ' + o.orderNo,
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">收货库房</label><select class="form-select" id="edWarehouse">' + whOpts(o.warehouse || curWarehouse()) + '</select></div>' +
      '<div class="col-6"><label class="form-label">库位</label><select class="form-select" id="edLocation">' + locOpts(o.loc || '') + '</select></div></div>' +
      '<div class="mb-2"><label class="form-label">发票号</label><input class="form-control" id="edInvoice" value="' + esc(o.invoice || '') + '" placeholder="如 FP2026091301"></div>' +
      '<div class="mb-2"><label class="form-label required">药品清单（计划数量，扫码核对的依据' + ((o.items && o.items.length) ? '' : '；已按现有码聚合预填') + '）</label><div id="edPick"></div></div>' +
      '<div class="text-secondary" style="font-size:12px;">编辑限制：每药计划数量不得小于该药已扫码折合（当前共 ' + scanQtyOf(o) + '），多扫的请先在「扫码录入」弹窗移除。</div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="edOk">保存</button>', 1000);
    var el = UI.open('pchEdit');
    var picker = window.PulDrugPicker.mount(el.querySelector('#edPick'), {
      warehouse: o.warehouse || curWarehouse(),
      pharmacy: W && W.curPharm ? W.curPharm() : undefined,
      showSlot: false, items: initItems,
      // 2026-10-15 Round CR 用户拍板：编辑弹窗已选清单补 扫码总量/差异 两列；Round CW：拉取单视同已扫码=全码折合（与药品清单/下限校验同口径）
      scanGot: function (dc) { return scannedBase(o, dc, o.source !== '拉取'); }
    });
    el.querySelector('#edWarehouse').addEventListener('change', function () {
      picker.reload({ warehouse: el.querySelector('#edWarehouse').value });
    });
    el.querySelector('#edOk').addEventListener('click', function () {
      var wh = el.querySelector('#edWarehouse').value;
      if (!wh) { window.showToast('请选择收货库房'); return; }
      var items = picker.getItems().map(function (it) { return { drugCode: it.drugCode, qty: it.qty }; });
      if (!items.length) { window.showToast('药品清单至少保留 1 行（要清空整张单请用行内「删除」）'); return; }
      // 下限校验：每药计划数量 ≥ 该药已扫折合
      for (var k = 0; k < items.length; k++) {
        var sc = scannedBase(o, items[k].drugCode);
        if ((items[k].qty || 0) < sc - 0.001) {
          var dd = window.PUL_DRUG.drugOf(window.PUL_DRUG.load(), items[k].drugCode) || {};
          window.showToast((dd.drugName || items[k].drugCode) + ' 计划数量不得小于已扫 ' + sc + '——请先在「扫码录入」弹窗移除多扫的码'); return;
        }
      }
      o.items = items;
      delete o.planQty;   // 清单化后计划数量=items 合计（planQtyOf items 优先），单据级覆盖值弃用
      o.warehouse = wh;
      o.loc = el.querySelector('#edLocation').value;
      o.invoice = el.querySelector('#edInvoice').value.trim();
      save(); UI.close('pchEdit'); renderAll();
      window.showToast('到货单 ' + o.orderNo + ' 已更新（' + wh + (o.loc ? ' · ' + o.loc : '') + '，药品清单 ' + o.items.length + ' 行）');
    });
  }

  // ===== 扫码录入（2026-10-13 Round BT：跳页改弹窗——页面复用 scan-hub?embed=1 内嵌，不重写逻辑；关闭弹窗后刷新本页「扫码数量」列） =====
  function goScan(o) {
    if (!o || !editable(o)) return;
    UI.openScanHub(o.orderNo, renderAll);
  }

  // ===== 重新解析：字典维护后一键重跑解析，报告剩余异常 =====
  function reparseSel() {
    var o = selOrder();
    if (!o) { window.showToast('请先选择一张到货单'); return; }
    var n = issueCount(o);
    save(); renderAll();
    window.showToast(n ? '重新解析完成：仍有 ' + n + ' 个异常码未处理（解析失败/库存码已存在）' : '重新解析完成：全部追溯码已正常解析，可以审核入库');
  }

  // ===== 异常码台账弹窗（2026-10-13 Round BT：整页视图切换 → 弹窗，单据页不离开；?view=bad 深链兼容=加载后直开弹窗） =====
  // 2026-10-16 Round DD 用户拍板「异常码台账要和列表的异常码保持一致」：台账改**派生平铺视图**——逐追溯码汇集各未审核
  // 到货单的单内异常（docBad 解析失败 ∪ dupCodes 库存码已存在），与列表「异常信息」列 / 单内「异常码」页签完全同源
  // （计数=Σ各单异常数）；列=单内页签同口径（追溯码/标识码/异常原因）+ 订单编号（可点跳该单异常码页签）/ 供应商定位列；
  // 操作与单内一致（解析失败=编辑人工补录 / 去维护直跳字典页；库存码已存在=去扫码录入移除）。
  // 原标识码级全局台账（pch.badCodes 种子）不再在此呈现（无单可归属的孤儿条目不列入）
  function allExceptions() {
    var out = [];
    (S.arrive || []).forEach(function (o) {
      if (o.downloaded === '是' || o.dlStatus === '失败') return;   // 已审核单无异常语义；下载失败在列表独立列表达
      docBad(o).forEach(function (c) {
        var p = P.parseCode(c.code, S.dict);
        out.push({ kind: 'parse', type: '解析失败', code: c.code, idcode: p.idcode || c.code.slice(0, 7),
          reason: badReasonText(c), orderNo: o.orderNo, supplier: o.supplier || '', editable: editable(o) });
      });
      dupCodes(o).forEach(function (d) {
        out.push({ kind: 'dup', type: '库存码已存在', code: d.code, idcode: d.code.slice(0, 7),
          reason: '库存码已存在（入库单 ' + d.ref + '），重复入库被拦截', orderNo: o.orderNo, supplier: o.supplier || '', editable: editable(o) });
      });
    });
    return out;
  }
  function badTypes() { return ['全部', '解析失败', '库存码已存在']; }   // Round DD：类型=单内异常两类（原为全局台账种子 type 枚举）
  function badFiltered() {
    return allExceptions().filter(function (b) {
      if (bf.type !== '全部' && b.type !== bf.type) return false;
      if (bf.code && b.code.indexOf(bf.code) === -1) return false;
      if (bf.idcode && b.idcode.indexOf(bf.idcode) === -1) return false;
      if (bf.orderNo && b.orderNo.indexOf(bf.orderNo) === -1) return false;
      if (bf.supplier && b.supplier.indexOf(bf.supplier) === -1) return false;
      return true;
    });
  }

  function openBadView() {
    UI.modalShell('pchBad', '⚠ 异常码台账（跨单据 · 与列表/单内异常码页签同源 · 维护字典后被拦截单据自动恢复可审）',
      '<div class="d-flex flex-wrap align-items-center mb-2" style="gap:10px;">' +
      UI.fItem('异常类型', '<select class="form-select" id="bfType" style="width:150px;">' +
        badTypes().map(function (o) { return '<option' + (bf.type === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>') +
      UI.fItem('药品追溯码', '<input class="form-control" id="bfCode" style="width:180px;" value="' + esc(bf.code) + '">') +
      UI.fItem('标识码', '<input class="form-control" id="bfIdcode" style="width:120px;" value="' + esc(bf.idcode) + '">') +
      UI.fItem('订单编号', '<input class="form-control" id="bfOrderNo" style="width:140px;" value="' + esc(bf.orderNo) + '">') +
      UI.fItem('供应商', '<input class="form-control" id="bfSupplier" style="width:150px;" value="' + esc(bf.supplier) + '">') +
      '<button class="btn btn-outline-primary" id="btnBadQuery">查询</button>' +
      '<button class="btn btn-outline-secondary" id="btnBadReset">重置</button>' +
      '<div class="ms-auto"><button class="btn btn-primary" id="btnBadSync">⟳ 更新信息</button></div>' +
      '</div>' + badTable(),
      '', 1280);
    var el = UI.open('pchBad');
    bindBad(el);
  }

  function bindBad(el) {
    el.querySelector('#btnBadQuery').addEventListener('click', function () {
      bf = { type: el.querySelector('#bfType').value, code: gv(el, 'bfCode'), idcode: gv(el, 'bfIdcode'),
        orderNo: gv(el, 'bfOrderNo'), supplier: gv(el, 'bfSupplier') };
      bPage = 1; openBadView();
    });
    el.querySelector('#btnBadReset').addEventListener('click', function () {
      bf = { type: '全部', code: '', idcode: '', orderNo: '', supplier: '' };
      bPage = 1; openBadView();
    });
    el.querySelector('#bPgPrev').addEventListener('click', function () { if (bPage > 1) { bPage--; openBadView(); } });
    el.querySelector('#bPgNext').addEventListener('click', function () { bPage++; openBadView(); });
    el.querySelector('#btnBadSync').addEventListener('click', function () {
      window.showToast('已从码上放心平台下载最新标识码（中继服务单向拉取，原型演示）');
    });
    // 去维护：直跳药品字典维护页（Round CO 拍板，不开匹配详情弹窗）
    el.querySelectorAll('[data-fix]').forEach(function (b) {
      b.addEventListener('click', function () { location.href = 'drug.html'; });
    });
    // 订单编号跳单：关弹窗 → 选中该单 → 落「异常码」页签
    el.querySelectorAll('[data-godoc]').forEach(function (a) {
      a.addEventListener('click', function () {
        UI.close('pchBad');
        sel = a.getAttribute('data-godoc'); tab = 'bad'; renderAll();
      });
    });
    // 编辑（人工补录）：关弹窗 → 选中该单 → 开补录弹窗（openBadFix 走 selOrder）
    el.querySelectorAll('[data-bfix]').forEach(function (b) {
      b.addEventListener('click', function () {
        var parts = b.getAttribute('data-bfix').split('|');
        UI.close('pchBad');
        sel = parts[0]; tab = 'bad'; renderAll();
        openBadFix(parts[1]);
      });
    });
    // 去扫码录入移除（库存码已存在）：关弹窗 → 选中该单 → 开统一扫码弹窗
    el.querySelectorAll('[data-goscanbad]').forEach(function (b) {
      b.addEventListener('click', function () {
        UI.close('pchBad');
        sel = b.getAttribute('data-goscanbad'); renderAll();
        goScan(selOrder());
      });
    });
  }

  function badTable() {
    var list = badFiltered();
    var total = list.length, pages = Math.max(1, Math.ceil(total / B_PAGE_SIZE));
    if (bPage > pages) bPage = pages;
    var slice = list.slice((bPage - 1) * B_PAGE_SIZE, bPage * B_PAGE_SIZE);
    var rows = slice.map(function (b, i) {
      var ops = b.kind === 'parse'
        ? (b.editable ? '<button class="btn btn-sm btn-primary" data-bfix="' + esc(b.orderNo) + '|' + esc(b.code) + '">编辑</button>' : '') +
          '<button class="btn btn-sm btn-outline-secondary" data-fix="' + esc(b.idcode) + '">去维护</button>'
        : '<button class="btn btn-sm btn-outline-secondary" data-goscanbad="' + esc(b.orderNo) + '">去扫码录入移除</button>';
      return '<tr class="pch-row-bad">' +
        '<td>' + ((bPage - 1) * B_PAGE_SIZE + i + 1) + '</td>' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(b.code) + '</td>' +
        '<td>' + esc(b.idcode) + '</td>' +
        '<td><span class="text-danger" style="font-size:12.5px;">' + esc(b.reason) + '</span></td>' +
        '<td><a href="javascript:void(0)" class="text-warning" style="font-size:12px;white-space:nowrap;" data-godoc="' + esc(b.orderNo) + '">' + esc(b.orderNo) + ' →</a></td>' +
        '<td>' + esc(b.supplier || '—') + '</td>' +
        '<td><div class="btn-list">' + ops + '</div></td></tr>';
    }).join('');
    if (!slice.length) rows = '<tr><td colspan="7" class="text-center text-secondary" style="padding:32px;">无异常码——各未审核到货单的解析失败 / 库存码已存在会汇集在这里，与列表「异常信息」列、单内「异常码」页签同源</td></tr>';
    return '<div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr><th>序号</th><th>药品追溯码</th><th>标识码</th><th>异常原因</th><th>订单编号</th><th>供应商</th><th>操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="card-footer d-flex align-items-center" style="font-size:12.5px;">' +
      '<span class="text-secondary">共 ' + total + ' 条 · 口径=各未审核到货单的单内异常（解析失败＋库存码已存在），维护字典后回单据「重新解析」恢复可审</span>' +
      '<div class="btn-list ms-auto">' +
      '<button class="btn btn-sm btn-outline-secondary" id="bPgPrev"' + (bPage <= 1 ? ' disabled' : '') + '>上一页</button>' +
      '<span class="text-secondary" style="padding:0 6px;">' + bPage + ' / ' + pages + '</span>' +
      '<button class="btn btn-sm btn-outline-secondary" id="bPgNext"' + (bPage >= pages ? ' disabled' : '') + '>下一页</button>' +
      '</div></div></div>';
  }

  // ===== 异常码人工补录弹窗（2026-10-15 Round CO 需求拍板：码层级/父级码/生产批次/生产日期/有效期至 无法从追溯码获取时必须手动录入） =====
  // 保存 = 码记录补字段 + manualFix='是' 转正常码（docBad 豁免 → 异常码页签/列表异常列/审核硬拦同步解除）+ checked=true（人工补录视同已核对）
  // 字典维护（标识码→药品绑定）不在此弹窗——「去维护」直跳药品字典维护页（drug.html），本弹窗只补单码事实字段
  function openBadFix(code20) {
    var o = selOrder();
    if (!o) return;
    var c = (o.codes || []).filter(function (x) { return x.code === code20; })[0];
    if (!c) return;
    var lv = +(c.level || 1);
    UI.modalShell('pchBadFix', '异常码人工补录 · ' + esc(code20),
      '<div class="text-secondary" style="font-size:12.5px;margin-bottom:12px;">追溯码无法解析（标识码未维护）——以下字段无法自动获取，请人工录入后保存，该码转为正常码参与审核。</div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">码层级</label><select class="form-select" id="bfLevel">' +
        '<option value="1"' + (lv === 1 ? ' selected' : '') + '>一级码</option>' +
        '<option value="2"' + (lv === 2 ? ' selected' : '') + '>二级码</option>' +
        '<option value="3"' + (lv === 3 ? ' selected' : '') + '>三级码</option></select></div>' +
      '<div class="col-6"><label class="form-label">父级码</label><input class="form-control" id="bfParent" value="' + esc(c.parentCode || '') + '" placeholder="二级/三级码必填"></div></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-4"><label class="form-label required">生产批次</label><input class="form-control" id="bfBatch" value="' + esc(c.batch || '') + '"></div>' +
      '<div class="col-4"><label class="form-label required">生产日期</label><input class="form-control" id="bfProd" type="date" value="' + esc(c.prodDate || '') + '"></div>' +
      '<div class="col-4"><label class="form-label required">有效期至</label><input class="form-control" id="bfExp" type="date" value="' + esc(c.expDate || '') + '"></div></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-primary" id="bfOk">保存</button>', 720);
    var el = UI.open('pchBadFix');
    el.querySelector('#bfOk').addEventListener('click', function () {
      var lv2 = +el.querySelector('#bfLevel').value;
      var parent = el.querySelector('#bfParent').value.trim();
      var batch = el.querySelector('#bfBatch').value.trim();
      var prod = el.querySelector('#bfProd').value;
      var exp2 = el.querySelector('#bfExp').value;
      if (lv2 > 1 && !parent) { window.showToast('二级/三级码必须录入父级码'); return; }
      if (!batch) { window.showToast('生产批次为必填项'); return; }
      if (!prod) { window.showToast('生产日期为必填项'); return; }
      if (!exp2) { window.showToast('有效期至为必填项'); return; }
      c.level = lv2; c.parentCode = parent; c.batch = batch; c.prodDate = prod; c.expDate = exp2;
      c.manualFix = '是'; c.checked = true;
      save(); UI.close('pchBadFix'); renderAll();
      window.showToast('已保存：该码人工补录完成，已转正常码参与审核');
    });
  }

  // ===== 统一审核判定（2026-10-12，全单据同口径；计划/扫码数量均为基本单位折合） =====
  // 计划数量：清单单=items 合计；无清单（下载单/扫码单）=计划覆盖值 o.planQty（2026-10-13 Round BU 编辑弹窗可改，下限=扫码数量），未改=码个数。
  // 扫码数量：清单单=已核对码折合；无清单=已核对个数
  function planQtyOf(o) {
    if (o.items && o.items.length) { var n = 0; o.items.forEach(function (it) { n += (it.qty || 0); }); return n; }
    if (o.planQty != null) return o.planQty;
    return (o.codes || []).length;
  }
  function scanQtyOf(o) {
    if (!(o.items && o.items.length)) return checkedCount(o);
    var n = 0;
    o.items.forEach(function (it) { n += scannedBase(o, it.drugCode); });
    return Math.round(n * 100) / 100;
  }

  // ===== 审核异常弹窗（2026-10-13 拍板：审核拦截弹窗级反馈；Round CD 收编进 PchUI.auditBlock 共享——本地保留薄包装对齐原签名） =====
  // act=null 时只给「关闭」；act={label,fn} 给快捷处理入口（去异常码页签/去扫码录入/重新下载）
  function auditBlock(o, title, detailHtml, act) { UI.auditBlock(o.orderNo, title, detailHtml, act); }

  // ===== 审核入库：守卫（已审/已退/下载失败）→ 异常码硬拦 → 扫码总量=0 硬拦（Round CS）→ 有码审核（计划=扫码，不一致报异常） =====
  // 2026-10-12 拍板：审核=判定计划数量 vs 扫码数量，两者必须一致；2026-10-15 Round CS：无码审核软确认下线，零核对一律拦截
  // 2026-10-13 拍板：拦截分支全部弹窗级报错（toast 一闪而过太弱，用户验收反馈「没有弹窗确认/异常报错」）
  function auditFlow(o) {
    if (!o) { window.showToast('请先选择一张到货单'); return; }
    if (o.downloaded === '是') { window.showToast('该到货单已审核入库'); return; }   // 行内无按钮，兜底
    if (o.dlStatus === '失败') {
      auditBlock(o, '下载失败，不允许审核',
        '码明细下载失败（' + esc(o.dlError || '接口异常') + '）——重新下载成功后再审核。',
        { label: '⟳ 重新下载', fn: function () { retryDownload(o); } });
      return;
    }
    var n = issueCount(o);
    if (n) {
      var b = docBad(o).length, d = dupCodes(o).length;
      auditBlock(o, '存在 ' + n + ' 个异常码，已拦截审核',
        (b ? '解析失败×' + b + '（维护字典后重新解析）' : '') + (b && d ? ' · ' : '') +
        (d ? '库存码已存在×' + d + '（在「扫码录入」弹窗移除重复码）' : ''),
        { label: '去异常码页签', fn: function () { sel = o.orderNo; tab = 'bad'; renderAll(); } });
      return;
    }
    var plan = planQtyOf(o), got = scanQtyOf(o);
    // 2026-10-15 Round CX 用户拍板：拉取单不扫码可直接审批——未核对（扫码总量=0）时审批即把全部可解析追溯码置为已核对（落盘）；
    // 已部分核对的单走正常判定（保留短收口径：未扫残留码不入库）
    if (o.source === '拉取' && got <= 0 && (o.codes || []).length) {
      (o.codes || []).forEach(function (c) { if (!c.checked && P.parseCode(c.code, S.dict).dict) c.checked = true; });
      save();
      got = scanQtyOf(o);
    }
    // 2026-10-15 Round CS 用户拍板：扫码总量为 0 不允许审核（原「无码审核」软确认分支下线——无码/零核对一律拦截）
    if (got <= 0) {
      auditBlock(o, '扫码总量为 0，不允许审核',
        '本单没有任何已核对的追溯码——先在「扫码录入」弹窗完成扫码核对再审核。',
        { label: '去扫码录入', fn: function () { goScan(o); } });
      return;
    }
    if (Math.abs(plan - got) > 0.001) {
      var diff = Math.round(Math.abs(plan - got) * 100) / 100;
      auditBlock(o, '计划数量 ≠ 扫码数量，不允许审核',
        '计划 <b>' + plan + '</b> ≠ 扫码 <b>' + got + '</b>（基本单位），' +
        (plan > got ? '缺 <b class="text-danger">' + diff + '</b>' : '超 <b class="text-danger">' + diff + '</b>'),
        { label: '去扫码录入', fn: function () { goScan(o); } });
      return;
    }
    openAudit(o);
  }

  function openAudit(o) {
    // 预填单据的收货事实字段（建单/下载时已确定），审核是终审确认仍可改
    var whOptsHtml = whOpts(o.warehouse || curWarehouse());
    var locOptsHtml = locOpts(o.loc || '');
    // 审核确认核对区（2026-10-13 拍板②：精简到一眼信号——发货方 + 检查结果一行；计划调小残留未扫码补 ⚠ 提示；
    // 2026-10-15 Round CS：扫码总量=0 在 auditFlow 已硬拦，本弹窗只剩有码路径，无码审核分支下线）
    var plan = planQtyOf(o), got = scanQtyOf(o);
    var checkedCodes = (o.codes || []).filter(function (c) { return c.checked; });
    var leftover = o.codes.length - checkedCodes.length;
    var checkHtml =
      '<div class="card" style="padding:8px 14px;margin-bottom:12px;font-size:13px;line-height:1.8;box-shadow:none;">' +
      '<div class="text-secondary">发货方：' + esc(o.shipper) + '</div>' +
      '<div><span class="text-success">✓</span> 无异常码 · <span class="text-success">✓</span> 数量一致：计划 <b>' + plan + '</b> = 扫码 <b>' + got + '</b>（共 ' + o.codes.length + ' 码）</div>' +
      (leftover ? '<div><span class="text-warning">⚠</span> 未扫的 <b>' + leftover + '</b> 个码不入库（保留单内作短收记录）</div>' : '') +
      '</div>';
    UI.modalShell('pchAudit', '审核入库 · ' + o.orderNo,
      checkHtml +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6"><label class="form-label required">入库库房</label><select class="form-select" id="auWarehouse">' + whOptsHtml + '</select></div>' +
      '<div class="col-6"><label class="form-label">库位</label><select class="form-select" id="auLocation">' + locOptsHtml + '</select></div></div>' +
      '<div class="mb-2"><label class="form-label">发票号</label><input class="form-control" id="auInvoice" value="' + esc(o.invoice || '') + '" placeholder="如 FP2026091301"></div>',
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      '<button class="btn btn-success" id="auOk">✓ 确定审核入库</button>', 560);
    var el = UI.open('pchAudit');
    el.querySelector('#auOk').addEventListener('click', function () {
      var wh = el.querySelector('#auWarehouse').value;
      if (W && W.assertUnfrozen && !W.assertUnfrozen(wh)) return;
      var u = window.store.load().currentUser || {};
      o.downloaded = '是'; o.confirm = '已确认';
      o.invoice = el.querySelector('#auInvoice').value.trim();
      o.auditDate = now(); o.auditor = u.name || '王铁军';
      var loc = el.querySelector('#auLocation').value;
      o.warehouse = wh; o.loc = loc;   // 终审值回写到货单（收货事实字段）
      // 落账只入已核对码（2026-10-13 Round BU：计划调小后未扫残留码不进在架，留在到货单作短收记录；口径与 scan-hub pur-in auditCommit 一致）
      S.inDocs.unshift({ billNo: o.orderNo, date: o.auditDate, supplier: o.supplier, shipper: o.shipper, receiver: o.receiver, invoice: o.invoice,
        warehouse: wh, location: loc, audit: '已审核', hisPush: noCode ? '无码推送' : '已推送', miPush: '未推送', downloadTime: o.auditDate,
        auditDate: o.auditDate, auditor: o.auditor, source: o.source === '手动' ? '手动' : '下载',
        codes: checkedCodes.map(function (c) { return Object.assign({}, c, { location: c.location || loc }); }) });
      save(); UI.close('pchAudit'); renderAll();
      window.showToast('审核完成：已生成入库单 ' + o.orderNo + (noCode ? '（无码入库 · 无码推送 HIS）' : '，' + checkedCodes.length + ' 个追溯码已入台账（库房在架）' + (leftover ? '，未扫 ' + leftover + ' 码未入库' : '')) + '，可到「采购入库单」查看');
    });
  }

  // ===== 渲染与绑定（单据主视图；异常码台账 2026-10-13 Round BT 起为弹窗 openBadView） =====
  function renderAll() {
    content.innerHTML = filterBar() + orderTable() + tabSection();
    bind();
  }

  function bind() {
    document.getElementById('btnQuery').addEventListener('click', function () {
      filters = { orderNo: v('fOrderNo'), invoice: v('fInvoice'), excInfo: v('fExcInfo'), shipper: v('fShipper'), receiver: v('fReceiver'),
        warehouse: v('fWarehouse'), source: v('fSource'), status: v('fStatus'), exc: v('fExc'),
        dateFrom: v('fDateFrom'), dateTo: v('fDateTo') };
      renderAll();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      filters = { orderNo: '', invoice: '', excInfo: '', shipper: '', receiver: '', warehouse: '全部', source: '全部', status: '全部', exc: '全部', dateFrom: '', dateTo: '' };
      renderAll();
    });
    document.getElementById('btnAdd').addEventListener('click', openAdd);
    document.getElementById('btnDownload').addEventListener('click', openDownload);
    document.getElementById('btnBadView').addEventListener('click', function () { bPage = 1; openBadView(); });
    content.querySelectorAll('[data-sel]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        sel = tr.getAttribute('data-sel'); renderAll();
      });
    });
    content.querySelectorAll('[data-badtab]').forEach(function (a) {
      a.addEventListener('click', function () {
        sel = a.getAttribute('data-badtab'); tab = 'bad'; renderAll();
      });
    });
    content.querySelectorAll('[data-scan]').forEach(function (b) {
      b.addEventListener('click', function () {
        sel = b.getAttribute('data-scan');
        goScan(selOrder());
      });
    });
    content.querySelectorAll('[data-audit]').forEach(function (b) {
      b.addEventListener('click', function () {
        sel = b.getAttribute('data-audit');
        auditFlow(selOrder());
      });
    });
    content.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        sel = b.getAttribute('data-edit');
        openEdit(selOrder());
      });
    });
    content.querySelectorAll('[data-redl]').forEach(function (b) {
      b.addEventListener('click', function () {
        sel = b.getAttribute('data-redl');
        retryDownload(selOrder());
      });
    });
    content.querySelectorAll('[data-deldoc]').forEach(function (b) {
      b.addEventListener('click', function () {
        var o = S.arrive.filter(function (x) { return x.orderNo === b.getAttribute('data-deldoc'); })[0];
        if (o) deleteDoc(o);
      });
    });
    window.PulDocDetail.bind(content, {
      model: detailModel,
      onTab: function (key) { tab = key; renderAll(); },
      actions: {
        editBad: function (ctx) { openBadFix(ctx.row.raw.code); },
        maintainBad: function () { location.href = 'drug.html'; },
        goScan: function () { goScan(selOrder()); },
        reparse: reparseSel
      }
    });
  }
  function v(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  // 直达：?view=bad 异常码台账弹窗（bad-codes.html 跳转页 / 追溯查询外链，2026-10-13 起弹窗化）；?orderNo= 选中单据
  var qs = new URLSearchParams(location.search);
  if (qs.get('orderNo') && S.arrive.some(function (o) { return o.orderNo === qs.get('orderNo'); })) sel = qs.get('orderNo');
  if (!sel && S.arrive.length) sel = S.arrive[0].orderNo;
  renderAll();
  if (qs.get('view') === 'bad') openBadView();
})();
