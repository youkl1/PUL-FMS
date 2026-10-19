/**
 * scan-hub-ui.js — 统一扫码工作台渲染层：场景页签（待办计数）→ 单据队列 → 页内扫码作业
 * 2026-10-11 Round BH。横幅 + 扫码卡 + 单卡双栏明细；2026-10-18 二期 Task A：结果区三页签改双栏并示（左=药品清单 右=追溯码清单，异常码=chip+展开表，对齐老系统图一版面）；二期 Task D：异常码默认恒收起（chip 点击展开，展开区移双栏上方通栏）+ 双栏固定高度；二期 Task E：横幅标题头统一五字段（单据类型/单据单号/单据时间/发货方/收货方，shelf 保现状头）
 * 依赖：scan-hub.js（PUL_SCAN_HUB 队列/适配器）+ scan-core.js（PUL_SCAN 主干）+ doc-detail.js（PulDocDetail 明细表格公共组件）；本文件只读写 DOM
 */
(function () {
  'use strict';

  var UI = window.PchUI, HUB = window.PUL_SCAN_HUB, SC = window.PUL_SCAN;
  var CONTENT = null, RESULTS = [], MODE = 'add', BAD_OPEN = null;   // BAD_OPEN：异常码展开态（2026-10-18 二期 Task D：null=恒收起；chip 点击切换 true/false；切单/审核/切场景/清空四重置点恢复 null=收起）
  var VIEW = { scene: 'pick-out', doc: null };   // doc = hubDoc（openDoc 产物）或 null=队列视图
  // 2026-10-13 Round BT：embed=1（弹窗 iframe 内嵌）——藏场景页签（弹窗不承载导航）、审核钮固定底部（modal-vs-navigation / primary-action）
  var EMBED = /[?&]embed=1/.test(location.search);
  function esc(s) { return UI.esc(s); }

  // ===== 1. 场景页签（七场景 + 待办计数 badge；embed 弹窗模式不渲染） =====
  function sceneTabsHtml() {
    if (EMBED) return '';
    var counts = HUB.counts();
    return '<div class="card" style="margin-bottom:12px;"><div class="card-body" style="padding:10px 16px;">' +
      '<div class="pch-tabs" style="border:none;">' + HUB.SCENES.map(function (s) {
        var n = counts[s.key] || 0;
        var badge = s.inPage
          ? (n ? '<span class="hub-tab-badge">' + n + '</span>' : '')
          : '<span class="hub-tab-off">→ 出库管理域</span>';
        return '<button class="pch-tab' + (VIEW.scene === s.key ? ' active' : '') + '" data-scene="' + s.key + '">' +
          esc(s.name) + badge + '</button>';
      }).join('') + '</div></div></div>';
  }

  // ===== 2. 队列视图（单据列表；点行/扫码按钮进作业） =====
  function queueHtml(scene) {
    var rows = HUB.queues(scene.key);
    var trs = rows.map(function (r) {
      return '<tr data-open="' + esc(r.billNo) + '" style="cursor:pointer;">' +
        '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + esc(r.billNo) + '</td>' +
        '<td>' + esc(r.time || '—') + '</td><td>' + esc(r.fromTo) + '</td><td>' + esc(r.node) + '</td>' +
        '<td>' + esc(r.planText) + '</td><td>' + r.codeN + '</td>' +
        '<td>' + UI.light(r.statusText) + '</td>' +
        '<td onclick="event.stopPropagation()">' +
          (scene.inPage
            ? '<button class="btn btn-primary btn-sm" data-scan="' + esc(r.billNo) + '">⚡ 扫码</button>'
            : '<a class="btn btn-outline-primary btn-sm" href="' + scene.link + '">前往作业 →</a>') +
        '</td></tr>';
    }).join('');
    if (!rows.length) trs = '<tr><td colspan="8" class="text-center text-secondary" style="padding:28px;">当前没有待办单据</td></tr>';
    return '<div class="card"><div class="card-header"><b>' + esc(scene.name) + ' · 待办队列</b>' +
      '<span class="text-secondary ms-2" style="font-size:12.5px;">' + esc(scene.rule) + '</span></div>' +
      '<div class="table-responsive"><table class="table table-vcenter card-table table-hover"><thead><tr>' +
      '<th>单号</th><th>时间</th><th>来源/去向</th><th>作业节点</th><th>计划数量</th><th>码数</th><th>状态</th><th>操作</th>' +
      '</tr></thead><tbody>' + trs + '</tbody></table></div></div>';
  }

  // ===== 3. 作业视图（横幅 + 扫码卡 + 单卡双页签明细；与 scan-lab 同构） =====
  // 二期 Task E：标题头统一五字段（单据类型/单据单号/单据时间/发货方/收货方，2026-10-19 拍板）——
  // 词与取值同各页列表列（Round BZ 单据类型列 + 各列表发货/收货列），值全部取自单据已有字段（_real 真身），缺概念显 —；
  // shelf 移位作业无单据五字段 → 不在 SCENE_FIELDS 内，保现状头（场景徽标+分支说明+单号标题行）
  function escDash(v) { return (v == null || v === '') ? '<span class="text-secondary">—</span>' : esc(v); }
  function fieldsHtml(pairs) {
    return '<div class="pch-scan-fields">' + pairs.map(function (p) {
      return '<span class="pch-scan-field"><span class="pch-scan-field-label">' + p[0] + '</span>' + p[1] + '</span>';
    }).join('') + '</div>';
  }
  var SCENE_FIELDS = {
    'pur-in':   function (r) { return [['单据类型', '采购到货'], ['单据单号', esc(r.orderNo)], ['单据时间', escDash(r.orderTime)], ['发货方', escDash(r.shipper)], ['收货方', escDash(r.receiver)]]; },
    'pur-out':  function (r) { return [['单据类型', '采购退货'], ['单据单号', esc(r.billNo)], ['单据时间', escDash(r.date)], ['发货方', escDash(r.warehouse)], ['收货方', escDash(r.supplier)]]; },
    'pick-out': function (r) { return [['单据类型', '调拨出库'], ['单据单号', esc(r.billNo)], ['单据时间', escDash(r.date)], ['发货方', escDash(r.warehouse)], ['收货方', escDash(r.pharmacy)]]; },
    'req-in':   function (r) { return [['单据类型', '调拨入库'], ['单据单号', esc(r.billNo)], ['单据时间', escDash(r.outTime || r.date)], ['发货方', escDash(r.warehouse)], ['收货方', escDash(r.pharmacy)]]; },
    'disp-out': function (r) { return [['单据类型', '处方出库'], ['单据单号', esc(r.rxNo || r.billNo)], ['单据时间', escDash(r.rxTime || r.date)], ['发货方', escDash(r.pharmacy)], ['收货方', escDash(r.patient)]]; },
    'tray-out': function (r) { return [['单据类型', '摆药出库'], ['单据单号', esc(r.trayNo || r.billNo)], ['单据时间', escDash(r.trayTime || r.date)], ['发货方', escDash(r.pharmacy)], ['收货方', escDash(r.patient) + '（' + escDash(r.ward) + ' ' + escDash(r.bed) + '）']]; }
  };
  function bannerHtml(hd, scene) {
    var stateText = hd._real.status || (hd._real.downloaded === '是' ? '已审核' : '待审核');
    var mkFields = SCENE_FIELDS[scene.key];
    var headRow = mkFields
      ? fieldsHtml(mkFields(hd._real))
      : '<span class="text-secondary" style="font-size:12.5px;">' + esc(hd.billNo) + '（' + esc(hd.title) + '）</span>';
    return '<div class="card" style="margin-bottom:12px;"><div class="card-body" style="padding:10px 16px;">' +
      '<div class="lab-badges">' +
        '<button class="btn btn-sm btn-outline-secondary" id="hubBack">← 返回队列</button>' +
        '<b style="font-size:15px;">' + esc(scene.name) + '</b>' +
        '<span class="badge ' + (scene.dir === 'in' ? 'bg-blue-lt' : scene.dir === 'out' ? 'bg-orange-lt' : 'bg-purple-lt') + '">' +
          ({ in: '入库', out: '出库', shelf: '移位·不动库存' })[scene.dir] + '</span>' +
        '<span class="badge bg-azure-lt">' + (hd.src === 'pre' ? '有码单 · 核对' : '无码单 · 录入') + '</span>' +
        '<span class="badge bg-secondary-lt">' + esc(hd.node) + '</span>' +
        '<span class="ms-auto"></span>' + UI.light(stateText) +
      '</div>' +
      headRow +
      '<div class="text-secondary" style="font-size:12px;margin-top:4px;">本单走「' + esc(scene.name) + '」分支：' + esc(scene.rule) + '</div>' +
    '</div></div>';
  }
  function resultsHtml() {
    if (!RESULTS.length) return '<div class="pch-scan-empty">等待扫码…</div>';
    return RESULTS.slice(0, 10).map(function (it) {
      var icon = it.level === 'ok' ? '✓' : (it.level === 'warn' ? '!' : '×');
      return '<div class="pch-scan-item ' + it.level + '"><b>' + icon + '</b>' +
        (it.code ? '<span class="code">' + esc(it.code) + '</span>' : '') +
        '<span class="msg">' + esc(it.msg) + '</span></div>';
    }).join('');
  }
  // 「按药品清单扫码」开关：恒渲染（2026-10-15 Round CQ 用户拍板：常开禁用——只有「选择药品清单后扫码」的录入单放开可切换，
  // 其余场景（无清单人工单/pre 下载单/shelf）渲染但禁用+悬停注明原因；Round CP「不渲染」方案被用户否决回退）
  function matchListEditable(hd) { return hd.src === 'none' && hd.items.length > 0; }
  function matchListTitle(hd) {
    if (matchListEditable(hd)) return '开：清单外药品拦截；关：清单外药品可扫入建行（清单内行超量仍拦截）';
    return hd.src === 'pre' ? '下载码单按药品清单核对，开关固定为开' : '无清单：扫码后自动建药品行，开关不可用';
  }
  function scanCardHtml(hd, scene) {
    var done = scene.dir !== 'shelf' &&
      ['已审核', '已完成', '已入库', '已出库'].indexOf(hd.status) > -1;   // 上架场景按码推进，无「完结」锁定
    var last = RESULTS[0];
    return '<div class="card" style="margin-bottom:12px;"><div class="card-body" style="padding:12px 16px;">' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
        '<span style="font-size:13.5px;font-weight:600;white-space:nowrap;">请扫描追溯码：</span>' +
        (hd.src === 'pre' && hd.scene !== 'pur-in' ? '' :
          '<div class="pch-scan-mode">' +
          '<button type="button" id="hubModeAdd" class="' + (MODE === 'add' ? 'active-add' : '') + '">▸ 扫码加入</button>' +
          '<button type="button" id="hubModeRm" class="' + (MODE === 'remove' ? 'active-rm' : '') + '">➖ 扫码移除</button></div>') +
        '<input class="form-control pch-scan-input" id="hubScanInput" style="flex:1;min-width:220px;width:auto;"' +
          ' placeholder="扫码枪输入 / 手工输入后回车（多码逗号分隔）' + (MODE === 'remove' ? '（移除模式）' : '') + '"' + (done ? ' disabled' : '') + ' autocomplete="off">' +
        // §3.1 版面开关（2026-10-15 Round CQ：恒渲染——仅 录入模式+有清单 可编辑；其余场景禁用态+title 注明原因）
        '<label class="form-check" style="margin:0;white-space:nowrap;" title="' + matchListTitle(hd) + '">' +
        '<input class="form-check-input" type="checkbox" id="hubMatchList"' + (hd.matchList !== false ? ' checked' : '') + (matchListEditable(hd) ? '' : ' disabled') + '>' +
        '<span class="form-check-label">按药品清单扫码</span></label>' +
        (scene.dir === 'out' ? '<label class="form-check" style="margin:0;white-space:nowrap;"><input class="form-check-input" type="checkbox" id="hubSplit">' +
          '<span class="form-check-label">拆零</span></label>' : '') +
        (scene.dir === 'shelf' ? '<select class="form-select" id="hubLoc" style="width:auto;">' + locOptions(hd) + '</select>' : '') +
      '</div>' +
      '<div class="lab-last' + (last ? ' ' + last.level : '') + '">' +
        (last ? esc(last.msg) + (last.code ? '<span style="margin-left:auto;font-family:Consolas,monospace;font-size:12px;">' + esc(last.code) + '</span>' : '') : '等待扫码…') + '</div>' +
      '<div class="pch-scan-result" style="max-height:98px;">' + resultsHtml() + '</div>' +
    '</div></div>';
  }
  function locOptions(hd) {
    var locs = ['M-01', 'M-02', 'M-03'];
    if (window.PUL_FACILITY) {
      var f = window.PUL_FACILITY.load();
      (f.pharmacies || []).forEach(function (p) {
        if (p.name !== hd.node) return;
        var got = (p.slots || []).map(function (s) { return s.code || s; });
        if (got.length) locs = got;
      });
    }
    if (locs.indexOf(hd.curLoc) < 0) locs.unshift(hd.curLoc);
    return locs.map(function (l) { return '<option' + (hd.curLoc === l ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
  }

  // 2026-10-16 Round DC 用户拍板：药品清单字段对齐单据页（采购到货明细 11 列，Round CK/CM 口径）——
  // 序号/药品名称/药品规格/生产厂家/批准文号/单价（元）/数量/扫码总量/差异/单位/金额（元）；
  // scan-hub 值口径保留：数量=计划数量（销售单位，「单位」列同随 saleUnit）、扫码总量=已扫折合 decomp（pre 只计已核对）、
  // 差异=计划-扫码总量徽标+进度条、金额=扫码总量×单价（latestPrice）；「换算」列下线（换算链在扫码反馈 decomp 表达）
  // 2026-10-18 明细三页签等价迁移 PulDocDetail（Task 3）：原业务计算逐字段保留，只把行结构适配成组件 model
  var DETAIL_MODEL = null;   // 当前作业明细 model（renderTabs 输入 + bind 回调行定位）
  function drugRowsOf(hd, scene) {
    var ctx = HUB.ctxOf(hd);
    var plan = hd.list === 'plan';
    var DS = window.PUL_DRUG.load();
    return hd.items.map(function (it) {
      var dc = it.drugCode, d = SC.drugOf(dc) || {};
      var got = SC.scannedBase(ctx, dc);
      var price = window.PUL_DRUG.latestPrice(DS, dc);
      var amt = price == null ? null : got * price;
      var row = {
        drugName: d.drugName,
        formSpec: d.formSpec || null,
        maker: d.maker || null,
        approval: d.approval || null,
        price: price,
        qty: it.planQty == null ? null : SC.fmtN(it.planQty),
        scanText: SC.decomp(dc, got),
        unit: SC.saleUnit(dc) || null,
        amount: amt
      };
      if (plan && it.planQty != null) {   // 开关=否插入的自证行（planQty=null）：数量/差异列保持「—」，防 planBase(null) 渲染 NaN
        var pb = SC.planBase(it), diff = pb - got;
        row.progress = pb > 0 ? Math.min(100, Math.round(got / pb * 100)) : 0;
        row.diff = Math.abs(diff) <= SC.EPS && got > 0
          ? { kind: 'full', text: '✓ 备齐' }
          : (diff > 0 ? { kind: 'short', text: '缺 ' + SC.decomp(dc, diff) }
                      : { kind: 'over', text: '超 ' + SC.decomp(dc, -diff) });
      }
      return row;
    });
  }
  // 2026-10-16 Round DC 用户拍板：码明细字段对齐单据页码详情（Round CM/CY 12 列同序同名）——
  // 扫码数量=已核对才计 codeContrib（与药品清单扫码总量同口径，两层合计恒等；单据页 CZ「拉取恒计」是台账展示口径，作业页按真实核对进度）；
  // 「时间/货位/库位」列下线；场景追加列：出库=拆零、上架=货位；操作列随 opCol
  var ISSUER = { '阿里': '码上放心', 'GS1': 'GS1', 'IDCODE': 'IDCODE' };
  var LVL_TXT = { 1: '一级码', 2: '二级码', 3: '三级码' };
  function codeRowsOf(hd, scene, opCol) {
    var ctx = HUB.ctxOf(hd);
    var isShelf = scene.dir === 'shelf';
    return hd.codes.map(function (c) {
      var p = window.PUL_PCH.parseCode(c.code, window.PUL_DRUG.flat(window.PUL_DRUG.load()));
      var d = p.dict ? SC.drugOf(p.dict.drugCode) : null;
      var doneC = ctx.isChecked ? ctx.isChecked(c) : !!c.checked;   // 核对状态口径按场景取 ctx.isChecked（Round DA：默认 c.checked；req-in=phChecked；shelf=phLoc）
      var qty = doneC ? SC.codeContrib(c) : 0;
      return {
        raw: c,   // bind 回调经 raw 定位原码记录（等价原 data-rmcode + SC.findCode）
        code: c.code,
        drugName: d ? d.drugName : null,
        level: p.dict ? (LVL_TXT[p.dict.level] || (p.dict.level + '级码')) : null,
        parentCode: null,   // 父级码本页无来源，恒「—」（原口径）
        batch: c.batch || null,
        prodDate: c.prodDate || null,
        expDate: c.expDate || null,
        scanText: SC.fmtN(qty) + (d ? ' ' + d.baseUnit : ''),
        status: { kind: doneC ? 'done' : 'todo', text: doneC ? (isShelf ? '已上架' : '已核对') : (isShelf ? '待上架' : '未核对') },
        idcode: p.idcode || c.code.slice(0, 7),
        issuer: ISSUER[p.codeType] || null,
        actions: opCol ? ['removeCode'] : null
      };
    });
  }
  // 异常码行适配（2026-10-13 Round BX 独立页签）：行红色 className + 公共列（含时间）+ 操作列随 opCol
  function badRowsOf(hd, opCol) {
    return hd.badCodes.map(function (b) {
      return {
        raw: b,
        className: 'pch-row-bad',
        code: b.code,
        idcode: b.code.slice(0, 7),
        reason: b.reason,
        time: b.time || null,
        actions: opCol ? ['removeBad'] : null
      };
    });
  }
  function detailCardHtml(hd, scene) {
    // 行级移除可见性（码表/异常码表同口径原判断）：录入模式 + 采购入库核对模式（多送/串货/冲突码剔除），终态无操作
    var opCol = (hd.src !== 'pre' || hd.scene === 'pur-in') &&
      hd.status !== '已审核' && hd.status !== '已完成';
    var isShelf = scene.dir === 'shelf';
    var splitCol = scene.dir === 'out';   // 拆零列仅出库场景（入库/上架无拆零语义）
    DETAIL_MODEL = {
      drugs: drugRowsOf(hd, scene),
      codes: codeRowsOf(hd, scene, opCol),
      bad: badRowsOf(hd, opCol)
    };
    var extras = [];   // 场景扩展列走 extraColumns（组件公共 12 列外）：出库=拆零、上架=货位
    if (splitCol) extras.push({ key: 'split', title: '拆零', cell: function (r) { return r.raw.split === '是' ? '拆零 ' + esc(r.raw.splitQty) : '否'; } });
    if (isShelf) extras.push({ key: 'phLoc', title: '货位', cell: function (r) { return esc(r.raw.phLoc || '—'); } });
    var bad = hd.badCodes.length;
    // 异常码展开态（2026-10-18 二期 Task D 用户反馈改版）：默认恒收起（BAD_OPEN===true 才展开，chip 点击切换）；
    // 展开区从双栏下方移到卡头 chip 行与 .hub-duo 之间通栏（视觉不打断双栏对照）
    var badOpen = BAD_OPEN === true;
    var footer;
    if (scene.dir === 'shelf') {
      var done = hd.codes.filter(function (c) { return !!c.phLoc; }).length;
      footer = '<span style="font-size:13px;">上架进度：<b>' + done + '/' + hd.codes.length + '</b> 码</span>' +
        (hd.codes.length && done === hd.codes.length ? '<span class="badge bg-green-lt" style="margin-left:10px;">✓ 全部上架</span>' : '') +
        '<span class="ms-auto"></span><span class="text-secondary" style="font-size:12px;">移位场景扫码即生效，无审核；货位在扫码卡右侧选择</span>';
    } else if (hd.status === '已审核' || hd.status === '已入库' || hd.status === '已出库' || hd.status === '已完成') {
      footer = '<span style="font-size:13px;">共 <b>' + hd.codes.length + '</b> 个码</span><span class="ms-auto"></span>' +
        '<button class="btn btn-outline-secondary" id="hubBackBtn">← 返回队列</button>';
    } else if (EMBED) {
      // Round CC 暂存-提交制：扫码只进会话草稿，底部「提交」才写回单据池；「清空重扫」回滚到已提交基线；草稿待提交亮橙标
      var hasDraft = !!HUB.loadDraft(hd.scene, hd.billNo);
      footer = '<span style="font-size:13px;">共 <b>' + hd.codes.length + '</b> 个码' +
        (bad ? '｜<span class="text-danger">异常码 <b>' + bad + '</b> 个（审核时校验拦截）</span>' : '｜无异常码') + '</span>' +
        (hasDraft ? '<span class="badge bg-orange-lt">草稿待提交</span>' : '') +
        '<span class="ms-auto"></span>' +
        '<button class="btn btn-outline-secondary" id="hubClear">清空重扫</button> ' +
        '<button class="btn btn-primary" id="hubClose">提交</button>';
    } else {
      var hasDraft2 = !!HUB.loadDraft(hd.scene, hd.billNo);
      footer = '<span style="font-size:13px;">共 <b>' + hd.codes.length + '</b> 个码' +
        (bad ? '｜<span class="text-danger">异常码 <b>' + bad + '</b> 个（审核硬拦）</span>' : '｜无异常码') + '</span>' +
        (hasDraft2 ? '<span class="badge bg-orange-lt">草稿待提交</span>' : '') +
        '<span class="ms-auto"></span>' +
        '<button class="btn btn-outline-secondary" id="hubClear">清空重扫</button> ' +
        '<button class="btn btn-success" id="hubAudit">✓ ' + esc(scene.verb) + '</button>';
    }
    // embed 弹窗模式：审核条固定底部（滚动不丢失主操作；内容区留 padding-bottom 防遮挡）
    var footFixed = EMBED && hd.status !== '已审核' && hd.status !== '已入库' && hd.status !== '已出库' && hd.status !== '已完成' && scene.dir !== 'shelf';
    // 双栏并示（2026-10-18 二期 Task A 用户拍板，对齐老系统图一版面）：左=药品清单（人读视图）右=追溯码清单（机器事实），
    // 替代原 三页签 renderTabs（TAB 活动页签状态随之移除）；异常码收敛为卡头 chip + 点击展开表（Task D：展开区在双栏上方通栏）
    var chip = '<button type="button" class="pch-tab' + (badOpen ? ' active' : '') + '" data-dd-badtgl="1" title="点击展开/收起异常码列表">' +
      (badOpen ? '▾' : '▸') + ' 异常码（' + (bad ? '<b class="text-danger">' + bad + '</b>' : '0') + '）</button>';
    return '<div class="card"><div class="card-header"><b>单据明细</b>' +
        '<span class="text-secondary ms-2" style="font-size:12px;">双层表达：药品清单=人读视图（码聚合派生）⇄ 码明细=机器事实（逐码）</span>' +
        '<span class="ms-auto"></span>' + chip + '</div>' +
      '<div class="card-body">' +
        (badOpen ? '<div class="hub-duo-bad">' + window.PulDocDetail.renderBad(DETAIL_MODEL, {
            columns: ['code', 'idcode', 'reason', 'time'].concat(opCol ? ['actions'] : []),
            note: '审核硬拦：确认不参与本单后点「移除」放行（码明细只保留有效码）',
            emptyText: '无异常码——扫码异常（解析失败/不在码单/被占用等）会登记在这里，处理后「移除」放行审核'
          }) + '</div>' : '') +
        '<div class="hub-duo">' +
          '<div class="hub-duo-col"><div class="hub-duo-title">药品清单（' + DETAIL_MODEL.drugs.length + ' 行）</div>' +
            window.PulDocDetail.renderDrugs(DETAIL_MODEL, { emptyText: '无清单——扫码后自动建药品行' }) + '</div>' +
          '<div class="hub-duo-col"><div class="hub-duo-title">追溯码清单（' + DETAIL_MODEL.codes.length + ' 码）</div>' +
            window.PulDocDetail.renderCodes(DETAIL_MODEL, {
              columns: ['seq', 'code', 'drugName', 'level', 'parentCode', 'batch', 'prodDate', 'expDate', 'scanQty', 'checkStatus', 'idcode', 'issuer'].concat(opCol ? ['actions'] : []),
              extraColumns: extras,
              emptyText: '等待扫码…'
            }) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="card-footer hub-detail-foot' + (footFixed ? ' hub-fixed-foot' : '') + '">' + footer + '</div></div>';
  }

  // ===== 4. 渲染与事件 =====
  // 演示码动态上下文（2026-10-13 Round BX 用户拍板：模拟码要贴近真实药品——置顶本单可核对的真实码，否则全是异常没法验证正常效果）
  function demoItems() {
    if (!VIEW.doc) return null;
    var hd = VIEW.doc, out = [];
    function doneOf(c) { return c.checked || c.phChecked || !!c.phLoc; }
    (hd.codes || []).forEach(function (c) {
      if (!doneOf(c) && out.filter(function (x) { return x.tag === 'ok'; }).length < 2) {
        out.push({ tag: 'ok', code: c.code, label: '本单码 · 核对通过（扫码加入）' });
      }
    });
    (hd.codes || []).forEach(function (c) {
      if (doneOf(c)) out.push({ tag: 'warn', code: c.code, label: '重复扫码（已核对码再扫一次）' });
    });
    out.push({ tag: 'bad', code: '81487900000005010001', label: '不在码单内（多送/串货×）' });
    out.push({ tag: 'bad', code: '89999990000005010001', label: '解析失败（标识码 8999999 未维护）' });
    // 发码机构三格式归一演示（2026-10-14 需求方图二）：GS1/IDCODE 扫码即转阿里标识码（有码单核对模式下判「不在码单内」属正常）
    out.push({ tag: 'ok', code: '01069012345678901124123117261231102605082100001', label: 'GS1 发码机构码（01 开头→归一阿里）' });
    out.push({ tag: 'ok', code: 'MA.156.M0.123456.N123456C.M241231.E261231.L260508.S00001', label: 'IDCODE 发码机构码（MA. 开头→归一阿里）' });
    return out;
  }

  var DEMO_PAD = null;
  function renderAll() {
    if (!CONTENT) return;
    var scene = HUB.sceneOf(VIEW.scene);
    if (!VIEW.doc) {
      CONTENT.innerHTML = sceneTabsHtml() + queueHtml(scene);
    } else {
      var hd = VIEW.doc;
      hd.status = hd._real.status || (hd._real.downloaded === '是' ? '已审核' : '待审核');
      CONTENT.innerHTML = sceneTabsHtml() + bannerHtml(hd, scene) + scanCardHtml(hd, scene) + detailCardHtml(hd, scene);
    }
    bind();
    if (DEMO_PAD && DEMO_PAD.refresh) DEMO_PAD.refresh();   // 动态演示码跟随单据上下文（Round BX）
    var inp = document.getElementById('hubScanInput');
    if (inp && !inp.disabled) inp.focus();
  }
  function handleScan(code) {
    var split = document.getElementById('hubSplit');
    var res = HUB.scan(VIEW.doc, code, { remove: MODE === 'remove', split: !!(split && split.checked) });
    RESULTS.unshift({ code: code, level: res.level, msg: res.msg });
    if (RESULTS.length > 20) RESULTS.pop();
    renderAll();
    if (res.autoCommit) window.showToast('✓ 清单已备齐，扫码记录已自动提交');   // Round CC 数量一致自动提交
  }
  function doAudit() {
    var scene = HUB.sceneOf(VIEW.scene);
    var r = HUB.auditDoc(VIEW.doc);
    if (r.block) { window.showToast(r.block); return; }
    var hd = VIEW.doc;
    var html = r.pre.noCode
      ? '<b style="color:var(--pch-warn);">无码' + esc(scene.verb) + '</b> <b>' + esc(hd.billNo) + '</b>：码清单为空，按计划数量落账（标记「无码' + (scene.dir === 'in' ? '入库' : '出库') + '」）'
      : scene.verb + ' <b>' + esc(hd.billNo) + '</b>，共 ' + hd.codes.length + ' 个码（计划数量=扫码数量，已一致）：<br>' + r.pre.lines.join('<br>');
    UI.confirm(html, function () {
      HUB.auditCommit(hd);
      VIEW.doc = null; RESULTS = []; BAD_OPEN = null;
      renderAll();
      window.showToast(scene.verb + ' 完成：' + hd.billNo);
    }, '确认' + scene.verb);
  }
  function bind() {
    CONTENT.querySelectorAll('[data-scene]').forEach(function (b) {
      b.addEventListener('click', function () {
        VIEW.scene = b.getAttribute('data-scene'); VIEW.doc = null;
        RESULTS = []; MODE = 'add'; BAD_OPEN = null;
        renderAll();
      });
    });
    CONTENT.querySelectorAll('[data-open]').forEach(function (tr) {
      tr.addEventListener('click', function () { openWork(tr.getAttribute('data-open')); });
    });
    CONTENT.querySelectorAll('[data-scan]').forEach(function (b) {
      b.addEventListener('click', function () { openWork(b.getAttribute('data-scan')); });
    });
    var back = document.getElementById('hubBack'), back2 = document.getElementById('hubBackBtn');
    if (back) back.addEventListener('click', function () { VIEW.doc = null; RESULTS = []; renderAll(); });
    if (back2) back2.addEventListener('click', function () { VIEW.doc = null; RESULTS = []; renderAll(); });
    var inp = document.getElementById('hubScanInput');
    if (inp) inp.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var codes = PchUI.splitScanBatch(inp.value);   // 批量：中英文逗号/分号/空白分隔多码，回车逐码触发
      if (!codes.length) return;
      inp.value = '';
      codes.forEach(handleScan);
    });
    var bAdd = document.getElementById('hubModeAdd'), bRm = document.getElementById('hubModeRm');
    if (bAdd) bAdd.addEventListener('click', function () { MODE = 'add'; renderAll(); });
    if (bRm) bRm.addEventListener('click', function () { MODE = 'remove'; renderAll(); });
    var loc = document.getElementById('hubLoc');
    if (loc) loc.addEventListener('change', function () { VIEW.doc.curLoc = loc.value; });
    // §3.1 开关切换：只改 hd.matchList（会话版面态），不重渲染（避免扫码输入框失焦）；下轮渲染自动跟随
    var ml = document.getElementById('hubMatchList');
    if (ml) ml.addEventListener('change', function () {
      if (!VIEW.doc) return;
      VIEW.doc.matchList = ml.checked;
      window.showToast(ml.checked ? '已开启：按药品清单扫码（清单外拦截）' : '已关闭：清单外药品可扫入建行（清单内行超量仍拦截）');
    });
    var audit = document.getElementById('hubAudit');
    if (audit) audit.addEventListener('click', doAudit);
    // Round CC 暂存-提交制：embed「提交」=草稿整组写回单据池再通知父页关闭；「清空重扫」=未提交部分回滚到已提交基线
    var hc = document.getElementById('hubClose');
    if (hc) hc.addEventListener('click', function () {
      // 2026-10-15 Round CS 用户拍板：扫码总量为 0 不能提交（无码空提交拦截；审核侧 auditFlow/auditPrecheck 同源硬拦）
      if (VIEW.doc && !(VIEW.doc.codes || []).length) { window.showToast('扫码总量为 0，不能提交——请先扫码'); return; }
      if (VIEW.doc && VIEW.doc.scene !== 'shelf') HUB.commitDraft(VIEW.doc);
      window.parent.postMessage({ type: 'pchScanHubClose', submitted: true }, '*');
    });
    var hcl = document.getElementById('hubClear');
    if (hcl) hcl.addEventListener('click', function () {
      var hd = VIEW.doc, real = hd._real;
      UI.confirm('清空本次未提交的扫码记录，回到已提交状态重新扫码？', function () {
        hd.codes = JSON.parse(JSON.stringify(real.codes || []));
        hd.badCodes = JSON.parse(JSON.stringify(real.badCodes || []));
        HUB.clearDraft(hd);
        RESULTS = []; BAD_OPEN = null;
        renderAll();
        window.showToast('已清空扫码记录（已提交数据不受影响）');
      }, '清空重扫');
    });
    // 明细双栏行操作事件（PulDocDetail bind 统一接管行级 data-dd-action）：
    // 行操作回调经 ctx.row.raw 定位原记录后走原移除/草稿写回逻辑；异常码 chip（data-dd-badtgl）页面侧自行绑定
    window.PulDocDetail.bind(CONTENT, {
      model: DETAIL_MODEL,
      actions: {
        removeCode: function (ctx) {
          var doc = VIEW.doc, c = ctx.row && ctx.row.raw;
          var i = c ? doc.codes.indexOf(c) : -1;
          if (i > -1) { doc.codes.splice(i, 1); HUB.ctxOf(doc).persist(); renderAll(); }
        },
        removeBad: function (ctx) {
          var doc = VIEW.doc, code = ctx.row && ctx.row.raw ? ctx.row.raw.code : null;
          if (code == null) return;
          doc.badCodes = doc.badCodes.filter(function (x) { return x.code !== code; });
          // badCodes 是共享引用：filter 产生新数组，需回写到真实单据
          doc._real.badCodes = doc.badCodes;
          HUB.ctxOf(doc).persist(); renderAll();
        }
      }
    });
    // 异常码 chip 展开/收起（二期 Task D）：null=收起，点击切换 true/false；无异常码恒收起（不渲染展开区）
    var bt = CONTENT.querySelector('[data-dd-badtgl]');
    if (bt) bt.addEventListener('click', function () {
      var bad = VIEW.doc && VIEW.doc.badCodes ? VIEW.doc.badCodes.length : 0;
      BAD_OPEN = bad > 0 ? BAD_OPEN !== true : false;
      if (bad > 0) renderAll();
    });
  }
  function openWork(billNo) {
    var hd = HUB.openDoc(VIEW.scene, billNo);
    if (!hd) { window.showToast('单据不在当前队列（可能已完结）'); return; }
    VIEW.doc = hd; RESULTS = []; MODE = 'add'; BAD_OPEN = null;
    renderAll();
    if (hd._restored) window.showToast('已恢复上次未提交的扫码记录');   // Round CC 草稿自动恢复提示
  }

  // ===== 5. boot（深链：?billNo= 全池反查定位场景并开单；?scene= 预选页签） =====
  function boot() {
    HUB.reload();
    var content = window.AppShell.render('desktopPreview', { active: 'scanHub', crumb: ['扫码管理', '统一扫码'] });
    if (!content) return;
    CONTENT = content;
    var qs = {};
    try { (location.search || '').slice(1).split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) qs[p[0]] = decodeURIComponent(p[1] || ''); }); } catch (e) {}
    if (qs.scene && HUB.sceneOf(qs.scene)) VIEW.scene = qs.scene;
    renderAll();
    if (qs.billNo) {
      var hit = HUB.findDoc(qs.billNo);
      if (hit) { VIEW.scene = hit.scene; openWork(hit.billNo); }
      else window.showToast('未找到待办单据 ' + qs.billNo + '（可能已完结）');
    }
    // 演示码速查悬浮窗（2026-10-13 Round BW：所有扫码页面都要有——点击=模拟扫码枪；Round BX：动态置顶本单真实码）
    DEMO_PAD = UI.demoPad(function (code) {
      if (!VIEW.doc) { window.showToast('请先点单据行进入扫码作业'); return; }
      var inp = document.getElementById('hubScanInput');
      if (inp && !inp.disabled) handleScan(code);
      else window.showToast('本单已完结，无需扫码');
    }, demoItems);
    document.body.appendChild(DEMO_PAD);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
