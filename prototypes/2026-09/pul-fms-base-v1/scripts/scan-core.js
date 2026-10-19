/**
 * scan-core.js — 统一扫码主干（共享层，2026-10-11 Round BH 自 scan-lab.js 抽提）
 * 一条主干：解析 → ①闸门(冻结) → ①⁵扫码移除(通用前置) → ②方向校验(入/出/移位) → ③码源分支(有码单=核对/无码单=录入) → ④清单态分支(建行/归属/超量+拆零) → ⑤落账
 * ①⁵ 扫码移除（2026-10-11 通用化，原录入模式专属）：核对模式也要能剔除多送/串货/「库存码已存在」冲突码——
 *     必须放在方向校验之前（入库方向校验会拦在架码，恰是需要移除的码）；解析失败/不在清单 → warn，不登记异常码；冻结闸门仍拦（保守口径）
 * ctx 适配器模式（沙盒 scan-lab 与统一工作台 scan-hub 共用本主干，各自提供数据钩子）：
 *   ctx = {
 *     dir: 'in|out|shelf',          // 方向（shelf=移位·不动库存）
 *     list: 'none|zero|plan',       // 清单态
 *     src: 'none|pre',              // 码源（pre=有码单核对）
 *     node,                          // 当前作业节点（库房/药房名）
 *     doc,                           // { status, items:[{drugCode,planQty(销售单位)}], codes, badCodes }
 *     verb,                          // 审核动作名（审核入库/审核出库/完成发药…；shelf 无审核）
 *     frozen() → bool,               // 盘点冻结闸门
 *     inStock(code) → {node,shelf,loc,batch,prodDate,expDate}|null,  // 方向闸门事实源（shelf 态用于移位场景）
 *     occupied(code) → desc|null,    // 被占用校验（挂其他未完结单）
 *     stockCodes() → [code],         // 当前节点在架码（自动赋码 FIFO 用，按入库先后排序）
 *     isChecked(c) / markChecked(c, when),   // 有码单核对态读写（缺省走 c.checked；上架/复核场景自定义）
 *     enrichRecord(rec, parsed),     // 新码记录补字段（批次/效期从在架记录继承等）
 *     onDirBad(code, parsed, rec, why) → result|null,  // 出库方向校验失败钩子（2026-10-12 Round BL：采购退货登记无库存码；缺省=纯拦截不留痕）
 *     onShelf(rec4ctx, loc),         // 移位场景落货位钩子
 *     persist()                      // 每码落盘
 *   }
 * 2026-10-15 方案 §3.1/§3.3 判定树落地：清单态分支行级化（matchList 开关控归属 / 行计划量控超量 / 计划≤0 不限）
 *   + 审核页扫码（pre·非 shelf）码单外码按判定树插入并直接标已核对（树拦下按原口径留多送/串货痕）
 * 纯逻辑无 DOM；node 可测。
 */
(function () {
  'use strict';

  var D = window.PUL_DRUG, P = window.PUL_PCH;
  var DS = D.load();
  var DICT = D.flat(DS);
  var EPS = 1e-6;

  // ===== 换算助手（复用 PUL_DRUG 换算链；minUnit 跳：销售/拆零单位在链外时经拆零最小单位折算；全精度，舍入只在显示层） =====
  function drugOf(dc) { return D.drugOf(DS, dc); }
  function drugName(dc) { var d = drugOf(dc); return d ? d.drugName : dc; }
  function saleUnit(dc) { var d = drugOf(dc); return (d && d.saleUnit) || ''; }
  function baseUnit(dc) { var d = drugOf(dc); return (d && d.baseUnit) || ''; }
  function toBaseQty(dc, qty, fromU) {
    var d = drugOf(dc);
    if (!d) return null;
    if (fromU === d.baseUnit) return qty;
    var v = D.conv(DS, dc, qty, fromU, d.baseUnit);
    if (v != null) return v;
    if (d.minUnit && fromU === d.minUnit.u) return qty / d.minUnit.per;
    return null;
  }
  function toSaleQty(dc, baseQty) {
    var d = drugOf(dc);
    if (!d) return null;
    if (d.saleUnit === d.baseUnit) return baseQty;
    var v = D.conv(DS, dc, baseQty, d.baseUnit, d.saleUnit);
    if (v != null) return v;
    if (d.minUnit && d.saleUnit === d.minUnit.u) return baseQty * d.minUnit.per;
    return null;
  }
  function codeBaseQty(parsed) {
    var v = toBaseQty(parsed.dict.drugCode, 1, parsed.dict.packUnit || parsed.dict.unit);
    return v == null ? 1 : v;
  }
  function fmtN(n) { return (Math.round(n * 100) / 100).toString(); }
  function saleParen(dc, baseQty) {
    if (saleUnit(dc) === baseUnit(dc)) return '';
    var s = toSaleQty(dc, baseQty);
    return s == null ? '' : '（=' + fmtN(s) + ' ' + saleUnit(dc) + '）';
  }
  // 整零分解人读（药房语言）：有拆零最小单位时「2 盒零 1 片」，否则「5 支」
  function decomp(dc, baseQty) {
    var d = drugOf(dc);
    if (!d) return fmtN(baseQty);
    if (!d.minUnit) return fmtN(baseQty) + ' ' + d.baseUnit;
    var whole = Math.floor(baseQty + EPS);
    var rem = Math.round((baseQty - whole) * d.minUnit.per);
    if (rem >= d.minUnit.per) { whole += 1; rem = 0; }
    if (rem === 0) return whole + ' ' + d.baseUnit;
    if (whole === 0) return rem + ' ' + d.minUnit.u;
    return whole + ' ' + d.baseUnit + '零 ' + rem + ' ' + d.minUnit.u;
  }

  // ===== 单据派生（双层表达：码=机器事实，清单扫码数量=码聚合派生不落库） =====
  function findCode(doc, code) {
    for (var i = 0; i < doc.codes.length; i++) if (doc.codes[i].code === code) return doc.codes[i];
    return null;
  }
  function itemOf(doc, dc) {
    for (var i = 0; i < doc.items.length; i++) if (doc.items[i].drugCode === dc) return doc.items[i];
    return null;
  }
  // 单码对本单的折合贡献：拆零码按 splitQty（拆零单位=有 minUnit 取片，否则库存单位），整码按层级折合
  function codeContrib(c) {
    var p = P.parseCode(c.code, DICT);
    if (!p.dict) return 0;
    if (c.split === '是' && c.splitQty !== '' && c.splitQty != null) {
      var d = drugOf(p.dict.drugCode);
      if (d && d.minUnit) return (+c.splitQty) / d.minUnit.per;
      return +c.splitQty;
    }
    return codeBaseQty(p);
  }
  function isChecked(ctx, c) { return ctx.isChecked ? ctx.isChecked(c) : !!c.checked; }
  function markChecked(ctx, c, when) {
    if (ctx.markChecked) { ctx.markChecked(c, when); return; }
    c.checked = true; c.time = when;
  }
  // 已扫折合库存单位：无码单=全部 codes 计；有码单=只计已验收
  function scannedBase(ctx, dc) {
    var pre = ctx.src === 'pre', n = 0;
    ctx.doc.codes.forEach(function (c) {
      var p = P.parseCode(c.code, DICT);
      if (!p.dict || p.dict.drugCode !== dc) return;
      if (pre && !isChecked(ctx, c)) return;
      n += codeContrib(c);
    });
    return n;
  }
  function planBase(it) { return toBaseQty(it.drugCode, it.planQty, saleUnit(it.drugCode)); }
  function addBad(doc, code, reason, when) {
    if (doc.badCodes.some(function (b) { return b.code === code; })) return;
    doc.badCodes.push({ code: code, reason: reason, time: when });
  }
  function nowStr() {
    var d = new Date();
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  // ===== 主干 =====
  function scanCore(rawCode, flags, ctx) {
    flags = flags || {};
    var doc = ctx.doc;
    var code = String(rawCode || '').trim();
    if (!code) return { level: 'warn', msg: '空码' };
    if (doc.status === '已审核' || doc.status === '已完成') return { level: 'warn', msg: '单据已完结，不能继续扫码' };
    // 0. 解析（共享层 parseCode，零例外）
    var p = P.parseCode(code, DICT);
    if (!p.dict) {
      if (flags.remove) return { level: 'warn', msg: '移除失败：该码不在本单' };   // 移除模式不登记异常码
      addBad(doc, code, '解析失败：标识码 ' + p.idcode + ' 未维护', nowStr());
      ctx.persist();
      return { level: 'bad', msg: '解析失败：标识码 ' + p.idcode + ' 未维护（请到药品字典/标识码补录），已登记异常码' };
    }
    var dc = p.dict.drugCode, drug = drugOf(dc);
    var fullQty = codeBaseQty(p);
    var lvlUnit = p.dict.packUnit || p.dict.unit;
    // 1. 闸门：盘点冻结
    if (ctx.frozen && ctx.frozen()) return { level: 'bad', msg: '本节点盘点中，禁止出入库' };
    // 1.5 扫码移除（通用前置：录入/核对同口径；方向校验之前——入库场景要能移除「库存码已存在」的冲突码）
    if (flags.remove) {
      var victim = findCode(doc, code);
      if (!victim) return { level: 'warn', msg: '移除失败：该码不在本单' };
      doc.codes.splice(doc.codes.indexOf(victim), 1);
      ctx.persist();
      return { level: 'ok', msg: '已移除：' + drug.drugName + ' -' + fmtN(codeContrib(victim)) + ' ' + drug.baseUnit };
    }
    // 2. 方向校验（入=码不能已在库存；出=码须在本节点在架；移位=码须在本节点在架且未上架）
    var rec = ctx.inStock(code);
    if (ctx.dir === 'in' && rec) return { level: 'bad', msg: '重复入库：该码已在「' + rec.node + '」在架' };
    if (ctx.dir === 'out' && (!rec || rec.node !== ctx.node)) {
      var missWhy = '不在库房内：该码' + (rec ? '在「' + rec.node + '」' : '无库存记录');
      if (ctx.onDirBad) { var alt = ctx.onDirBad(code, p, rec, missWhy); if (alt) return alt; }
      return { level: 'bad', msg: missWhy };
    }
    if (ctx.dir === 'shelf') {
      if (!rec || rec.node !== ctx.node) return { level: 'bad', msg: '不在本药房：该码' + (rec ? '在「' + rec.node + '」' : '无库存记录') };
      if (rec.shelf === '已上架') return { level: 'warn', msg: '重复上架：该码已在架' + (rec.loc ? '（' + rec.loc + '）' : '') };
    }
    // 3. 码源分支（2026-10-15 §3.3：审核页扫码（pre·非 shelf）码单外码不再就地拦——落到 §4 判定树尝试插入，
    //    同药品且不超量→插入+直接标已核对；树拦下按原口径留多送/串货痕；shelf 移位无审核语义维持原拦截；
    //    插入前通用守卫：被其他在途单占用一律拦（一码不挂两张未完结单，即时拦截类不留痕）
    var c0 = null;
    if (ctx.src === 'pre') {
      c0 = findCode(doc, code);
      if (!c0 && ctx.dir === 'shelf') {
        addBad(doc, code, '不在码单内（多送/串货）', nowStr());
        ctx.persist();
        return { level: 'bad', msg: '不在码单内（多送/串货），已登记异常码' };
      }
      if (!c0) {
        var occPre = ctx.occupied && ctx.occupied(code);
        if (occPre) return { level: 'bad', msg: '被占用：该码已挂 ' + occPre + '（去向：异常赋码台账）' };
      }
      if (c0 && isChecked(ctx, c0)) return { level: 'warn', msg: '重复验收：该码已核对过' };
    } else {
      if (findCode(doc, code)) return { level: 'warn', msg: '重复扫码：该码已在清单' };
      var occ = ctx.occupied && ctx.occupied(code);
      if (occ) return { level: 'bad', msg: '被占用：该码已挂 ' + occ + '（去向：异常赋码台账）' };
    }
    // 4. 清单判定树（2026-10-15 方案 §3.1 落地，按客户伪代码行级化）：
    //    归属受「按药品清单扫码」开关控制（ctx.matchList；未传按清单态推导，沙盒/旧适配器零改动兼容）；
    //    超量按行级计划量恒生效——与开关无关（修订①）；行计划≤0 → 不限制总数
    var item = itemOf(doc, dc);
    var matchList = ctx.matchList != null ? ctx.matchList : ctx.list !== 'none';
    var splitQty = '', splitBaseQty = null;
    function preBlock(msg) {   // §3.3 审核页扫码树拦：统一按原口径留多送/串货痕（词表不变）
      addBad(doc, code, '不在码单内（多送/串货）', nowStr());
      ctx.persist();
      return { level: 'bad', msg: msg + '，已登记异常码' };
    }
    if (!item) {
      if (matchList) {
        if (ctx.src === 'pre') return preBlock('不在码单内（多送/串货）');
        return { level: 'bad', msg: '不在清单内：' + drug.drugName + ' 不在本单药品清单' };
      }
      item = { drugCode: dc, planQty: null }; doc.items.push(item);   // 开关=否/无清单单：码驱动建行放行（自证行）
    } else if (item.planQty != null && planBase(item) > EPS) {
      var plan = planBase(item), got = scannedBase(ctx, dc);
      var need = plan - got;
      if (need <= EPS) {
        if (ctx.src === 'pre') return preBlock('超数量：' + drug.drugName + ' 码单数量已备齐，无需再扫');
        return { level: 'bad', msg: '超数量：' + drug.drugName + ' 已备齐（' + decomp(dc, plan) + '），无需再扫' };
      }
      if (fullQty > need + EPS) {
        if (flags.split) {
          // 拆零：只取差额、余量回架（拆零不扣整码）；拆零单位=有 minUnit 取片，否则库存单位
          if (drug.minUnit) {
            splitQty = String(Math.round(need * drug.minUnit.per));
            splitBaseQty = (+splitQty) / drug.minUnit.per;
          } else {
            splitQty = fmtN(Math.round(need * 100) / 100);
            splitBaseQty = +splitQty;
          }
        } else {
          if (ctx.src === 'pre') return preBlock('超数量：' + drug.drugName + ' 码单外加本码超量');
          return { level: 'bad', msg: '超数量：' + drug.drugName + ' 需 ' + decomp(dc, plan) + '（申请 ' + fmtN(item.planQty) + ' ' + saleUnit(dc) +
            '），已扫 ' + decomp(dc, got) + '，本码 ' + lvlUnit + '码 +' + fmtN(fullQty) + ' ' + drug.baseUnit +
            ' = 超 ' + decomp(dc, got + fullQty - plan) + '（勾「拆零」可只取差额、余量回架）' };
        }
      }
    }
    if (flags.split && splitBaseQty == null) {
      // 非超量场景的拆零：取 1 个拆零单位
      if (drug.minUnit) { splitQty = '1'; splitBaseQty = 1 / drug.minUnit.per; }
      else { splitQty = '1'; splitBaseQty = Math.min(1, fullQty); }
      if (fullQty <= splitBaseQty) { splitQty = ''; splitBaseQty = null; }   // 基本单位码无可拆
    }
    // 5. 落账（每码实时落盘，刷新可续作）
    var contrib = splitBaseQty != null ? splitBaseQty : fullQty;
    if (c0) {
      markChecked(ctx, c0, nowStr());
      if (splitBaseQty != null) { c0.split = '是'; c0.splitQty = splitQty; }
    } else {
      var rec2 = { code: code, checked: true, split: splitBaseQty != null ? '是' : '否',
        splitQty: splitQty, time: nowStr(), batch: '', prodDate: '', expDate: '' };
      if (ctx.enrichRecord) ctx.enrichRecord(rec2, p, rec);
      // 码上解析字段补齐（2026-10-14 发码机构三格式归一：GS1/IDCODE 的批次/生产日期/效期随码解析带回）
      if (!rec2.batch && p.batch) rec2.batch = p.batch;
      if (!rec2.prodDate && p.prodDate) rec2.prodDate = p.prodDate;
      if (!rec2.expDate && p.expDate) rec2.expDate = p.expDate;
      doc.codes.push(rec2);
    }
    if (ctx.dir === 'shelf' && ctx.onShelf) ctx.onShelf(rec, doc.curLoc || '', c0 || rec2);
    ctx.persist();
    // 反馈语
    if (ctx.dir === 'shelf') {
      return { level: 'ok', msg: '已上架 → ' + (doc.curLoc || '') + '｜' + drug.drugName + ' +' + fmtN(contrib) + ' ' + drug.baseUnit +
        (fullQty > 1 ? '（' + lvlUnit + '码）' : '') };
    }
    var head = drug.drugName + ' +' + fmtN(contrib) + ' ' + drug.baseUnit +
      (fullQty > 1 ? '（' + lvlUnit + '码）' : '') + (splitBaseQty != null ? '（拆零：' + lvlUnit + '码取 ' + splitQty + ' ' + (drug.minUnit ? drug.minUnit.u : drug.baseUnit) + '，余量回架）' : '');
    if (ctx.src === 'pre') {
      var total = doc.codes.length;
      var checkedN = doc.codes.filter(function (c) { return isChecked(ctx, c); }).length;
      return { level: 'ok', msg: head + '｜验收进度 ' + checkedN + '/' + total + ' 码' };
    }
    if (ctx.list === 'plan' && item.planQty != null && planBase(item) > EPS) {   // 自证行（planQty=null）与计划≤0 行走底部「扫码数量」反馈
      var after = scannedBase(ctx, dc), pb = planBase(item);
      return { level: 'ok', msg: head + '｜累计 ' + decomp(dc, after) + ' / ' + decomp(dc, pb) +
        '（申请 ' + fmtN(item.planQty) + ' ' + saleUnit(dc) + '）' + (Math.abs(after - pb) <= EPS ? ' ✓备齐' : '') };
    }
    return { level: 'ok', msg: head + '｜扫码数量 ' + decomp(dc, scannedBase(ctx, dc)) + saleParen(dc, scannedBase(ctx, dc)) };
  }

  // ===== 自动赋码（FIFO 整码配齐，超额不硬塞；配不齐留缺数） =====
  function autoAssign(ctx) {
    var doc = ctx.doc;
    if (doc.status === '已审核' || doc.status === '已完成') return { level: 'warn', msg: '单据已完结', added: [], shorts: [] };
    var added = [], shorts = [];
    doc.items.forEach(function (it) {
      var dc = it.drugCode;
      var need = planBase(it) - scannedBase(ctx, dc);
      if (need <= EPS) return;
      (ctx.stockCodes ? ctx.stockCodes() : []).forEach(function (code) {
        if (need <= EPS) return;
        if (ctx.occupied && ctx.occupied(code)) return;
        if (findCode(doc, code)) return;
        var p = P.parseCode(code, DICT);
        if (!p.dict || p.dict.drugCode !== dc) return;
        var q = codeBaseQty(p);
        if (q > need + EPS) return;   // 整码超额不硬塞（拆零留人工）
        var rec = { code: code, checked: true, split: '否', splitQty: '', time: nowStr(), batch: '', prodDate: '', expDate: '' };
        if (ctx.enrichRecord) ctx.enrichRecord(rec, p, ctx.inStock(code));
        doc.codes.push(rec);
        added.push({ code: code, drugName: drugName(dc), qty: q, unit: baseUnit(dc) });
        need -= q;
      });
      if (need > EPS) shorts.push(drugName(dc) + ' 缺 ' + decomp(dc, need) + saleParen(dc, need) + '（无整码可赋，请手动补扫/拆零或去异常赋码台账补绑）');
    });
    ctx.persist();
    return { level: shorts.length ? 'warn' : 'ok', added: added, shorts: shorts,
      msg: added.length ? '自动赋码完成：配码 ' + added.length + ' 个' + (shorts.length ? '；' + shorts.join('；') : '') : (shorts.join('；') || '无可配码') };
  }

  // ===== 审核前检（2026-10-12 统一审核判定，全单据同口径） =====
  // 守卫链：异常码硬拦 → 盘点冻结硬拦 → 计划数量 vs 扫码数量一致性硬拦（不一致报异常、不允许审核）
  // 无码审核：码清单为空 ∧ 计划数量>0 → 放行（noCode 标记，落账「无码入库/出库」）；码空且计划=0 → 拦（空单无意义）
  // commit 由各池适配器执行
  // 判定口径=基本单位折合；无清单单（list=none）计划=扫码自证一致（码驱动建行）
  function planTotal(ctx) {
    // 单据级计划覆盖值（2026-10-13 Round BU：到货单编辑弹窗可改计划数量 o.planQty，scan-hub pur-in 适配器带出 planQtyTotal（基本单位）；
    // 优先于 items 逐药计划——保证页面行内审核与扫码页审核两条路径判定一致）
    if (ctx.doc.planQtyTotal != null) {
      var extra = 0;
      (ctx.doc.items || []).forEach(function (it) { if (it.planQty == null) extra += scannedBase(ctx, it.drugCode); });   // 覆盖值只覆盖计划行；开关=否自证行（planQty=null）按扫码追加（§3.1 else 分支）
      return ctx.doc.planQtyTotal + extra;
    }
    var items = ctx.doc.items || [], hasPlan = items.some(function (it) { return it.planQty != null; });
    if (!hasPlan) return scanTotal(ctx);
    var n = 0;
    items.forEach(function (it) { n += (it.planQty != null ? planBase(it) : scannedBase(ctx, it.drugCode)); });   // 开关=否插入行（planQty=null）按扫码自证（§3.1 else 分支）
    return n;
  }
  function scanTotal(ctx) {
    var n = 0;
    (ctx.doc.codes || []).forEach(function (c) { if (isChecked(ctx, c)) n += codeContrib(c); });
    return n;
  }
  function auditPrecheck(ctx) {
    var doc = ctx.doc;
    if (ctx.dir === 'shelf') return { block: '上架场景扫码即生效，无审核动作' };
    if (doc.status === '已审核' || doc.status === '已完成') return { block: '单据已完结' };
    if (doc.badCodes.length) return { block: '异常码硬拦：' + doc.badCodes.length + ' 个异常码未处理（移除或去维护字典）' };
    if (ctx.frozen && ctx.frozen()) return { block: '本节点盘点中，禁止出入库' };
    var plan = planTotal(ctx), got = scanTotal(ctx);
    // 2026-10-15 Round CS 用户拍板：扫码总量为 0 不允许审核（原「无码审核」软确认分支下线，一律拦截）
    if (got <= EPS) return { block: '扫码总量为 0，不允许审核——本单没有任何已核对的追溯码，请先扫码' };
    if (Math.abs(plan - got) > EPS) {
      return { block: '计划数量 ' + fmtN(plan) + ' ≠ 扫码数量 ' + fmtN(got) + '（基本单位），不一致不允许审核——请继续扫码' + (plan > got ? '（缺 ' + fmtN(plan - got) + '）' : '（超 ' + fmtN(got - plan) + '）') };
    }
    var lines = doc.items.map(function (it) {
      var got2 = scannedBase(ctx, it.drugCode);
      return drugName(it.drugCode) + '：' + (it.planQty == null ? '—' : fmtN(it.planQty) + ' ' + saleUnit(it.drugCode)) +
        ' → 已扫 ' + decomp(it.drugCode, got2) + saleParen(it.drugCode, got2);
    });
    return { doc: doc, warns: [], lines: lines };
  }

  window.PUL_SCAN = {
    scanCore: scanCore, autoAssign: autoAssign, auditPrecheck: auditPrecheck,
    drugOf: drugOf, drugName: drugName, saleUnit: saleUnit, baseUnit: baseUnit,
    toBaseQty: toBaseQty, toSaleQty: toSaleQty, codeBaseQty: codeBaseQty, codeContrib: codeContrib,
    fmtN: fmtN, saleParen: saleParen, decomp: decomp, scannedBase: scannedBase, planBase: planBase,
    findCode: findCode, itemOf: itemOf, nowStr: nowStr, EPS: EPS };
})();
