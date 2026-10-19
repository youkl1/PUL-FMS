/**
 * scan-hub.js — 统一扫码工作台（2026-10-11 Round BH）：全部扫码作业的唯一入口
 * 七场景待办队列（真实数据池派生）→ 选单 → 页内扫码（PUL_SCAN 主干）→ 审核落账（各池适配器）
 * 菜单地位：扫码管理组唯一作业入口；quick-scan/ph-scan-in/ph-shelf 降级为重定向页（深链由本页承接）
 * 边界：门诊出药/住院摆药是处方域完整工作流（HIS 拉取/锁数量/补绑），队列计数可读、作业跳 disp/tray 页
 * 2026-10-12 Round BL：+第七场景「采购退货」（pur-out，出库·无码单·无清单；2026-10-13 Round BU 到货退货功能删除，队列=未审核库房退货单）
 * 2026-10-14 Round CC 扫码暂存-提交制（用户拍板）：扫码只进会话草稿（store.scanDrafts，sessionStorage 会话级）——
 *   codes/badCodes 与真身脱钩为工作副本，关闭弹窗草稿保留、重开自动恢复；「提交」才整组写回单据池；
 *   页内审核（auditDoc）与「数量一致自动提交」（tryAutoCommit：有计划清单全部备齐且无异常码）也会落草稿；
 *   「清空重扫」回滚到已提交基线；shelf 场景豁免（上架扫码即生效）；单据页行内审核只认已提交数据
 * 纯逻辑无 DOM（渲染在 scan-hub-ui.js），node 可测（_t-scan-hub.node.js）
 */
(function () {
  'use strict';

  var SC = window.PUL_SCAN, W = window.PUL_WH, P2 = window.PUL_PCH, D = window.PUL_DRUG;

  var SCENES = [
    { key: 'pur-in', name: '采购入库', dir: 'in', verb: '审核入库', inPage: true, rule: '入库：码不能已在库存（重复入库×）；下载单=有码单核对、人工单=无清单录入' },
    { key: 'pur-out', name: '采购退货', dir: 'out', verb: '审核退货', inPage: true, rule: '出库：码须在本库在架（不在库房内×→登记无库存码，审核硬拦）+ 被占用×；无清单录入：扫码即从在架加入退货清单' },
    { key: 'pick-out', name: '调拨出库', dir: 'out', verb: '审核出库', inPage: true, rule: '出库：码须在本库在架（不在库房内×）+ 按计划量拣货核对（超量×，可拆零）' },
    { key: 'req-in', name: '调拨入库', dir: 'in', verb: '审核入库', inPage: true, rule: '在途单复核：库房已扫过码可直接审核入库（信任短路），也可逐码复核' },
    { key: 'shelf', name: '药房药品上架', dir: 'shelf', verb: '', inPage: true, rule: '移位·不动库存无审核：扫待上架码写货位、标已上架；已上架重扫=⚠' },
    { key: 'disp-out', name: '门诊出药', dir: 'out', verb: '完成发药', inPage: false, link: 'disp.html', note: '处方域完整工作流（HIS 拉取/锁数量/补绑）在出库管理域' },
    { key: 'tray-out', name: '住院摆药出药', dir: 'out', verb: '完成摆药', inPage: false, link: 'tray.html', note: '摆药域完整工作流（先拿药后赋码/自动赋码）在出库管理域' }
  ];
  function sceneOf(key) { for (var i = 0; i < SCENES.length; i++) if (SCENES[i].key === key) return SCENES[i]; return null; }

  // ===== 1. 数据池（每次操作时刷新读取；codes/badCodes 与池内单据共享引用，落盘即持久） =====
  var PCH = null, WH = null;
  function reload() { PCH = P2.load(); WH = W.load(); }
  function curUser() { return (window.store && window.store.load().currentUser) || {}; }
  function curWh() { return curUser().warehouse || '中心库'; }
  function curPharm() { return W.curPharm(); }
  function savePool(sceneKey) { if (sceneKey === 'pur-in' || sceneKey === 'pur-out') P2.save(PCH); else W.save(WH); }

  // ===== 1.5 草稿层（2026-10-14 Round CC 暂存-提交制）：扫码只进会话草稿（store.scanDrafts），
  // 「提交」才整组写回单据池。注意 store.update 是深合并——草稿增删必须 load+save 整体写，避免删除键被合并还原。
  function draftKey(sceneKey, billNo) { return sceneKey + ':' + billNo; }
  function loadDraft(sceneKey, billNo) {
    var m = window.store.load().scanDrafts || {};
    return m[draftKey(sceneKey, billNo)] || null;
  }
  function saveDraft(hd) {
    var s = window.store.load();
    s.scanDrafts = s.scanDrafts || {};
    s.scanDrafts[draftKey(hd.scene, hd.billNo)] = { codes: hd.codes, badCodes: hd.badCodes, ts: SC.nowStr() };
    window.store.save(s);
  }
  function clearDraft(hd) {
    var s = window.store.load();
    if (!s.scanDrafts) return;
    delete s.scanDrafts[draftKey(hd.scene, hd.billNo)];
    window.store.save(s);
  }
  // 提交：工作副本整组写回真身（双向拷贝——hd.codes 永远保持独立副本，提交后继续扫码进新一轮草稿）
  function commitDraft(hd) {
    if (hd.scene === 'shelf') { savePool(hd.scene); return true; }
    var real = hd._real;
    real.codes = JSON.parse(JSON.stringify(hd.codes || []));
    real.badCodes = JSON.parse(JSON.stringify(hd.badCodes || []));
    savePool(hd.scene);
    clearDraft(hd);
    hd.codes = JSON.parse(JSON.stringify(real.codes));
    hd.badCodes = JSON.parse(JSON.stringify(real.badCodes || []));
    hd._restored = false;
    return true;
  }
  // 数量一致自动提交：有计划清单的单（items 驱动）全部备齐且无异常码 → 自动提交草稿；
  // 无清单单（自由扫码）首扫建行后同样 items 驱动自动提交（恒自证一致=每扫即提交，Round CC 起实测行为，测试第 6/12 节固化）；shelf 豁免；扫码 bad 返回不触发（由 scan 包装守门）
  function tryAutoCommit(hd) {
    if (hd.scene === 'shelf' || !(hd.items || []).length) return false;
    if ((hd.badCodes || []).length) return false;
    if (SC.auditPrecheck(ctxOf(hd)).block) return false;
    commitDraft(hd);
    return true;
  }

  // ===== 2. 待办队列派生（六场景；单据行=队列卡数据源） =====
  function planTextOfItems(items) {
    var n = 0;
    (items || []).forEach(function (it) { n += (it.qty || 0); });
    return n + '（基本单位）';
  }
  function codeBaseSum(codes) {
    var n = 0;
    (codes || []).forEach(function (c) { var p = P2.parseCode(c.code, D.flat(D.load())); n += p.dict ? SC.codeBaseQty(p) : 0; });
    return n + '（基本单位）';
  }
  function queues(sceneKey) {
    reload();
    var out = [];
    if (sceneKey === 'pur-in') {
      (PCH.arrive || []).forEach(function (o) {
        if (o.downloaded === '是' || o.confirm === '已退货' || o.dlStatus === '失败') return;
        out.push({ billNo: o.orderNo, time: o.orderTime, fromTo: o.supplier || '—', node: o.warehouse,
          planText: (o.items && o.items.length ? planTextOfItems(o.items) : codeBaseSum(o.codes)), codeN: (o.codes || []).length, statusText: '待审核', _real: o });
      });
    } else if (sceneKey === 'pur-out') {
      // 采购退货（2026-10-13 Round BU：到货退货功能删除，单一只库房退货）：从在架选码退回供应商
      (PCH.outDocs || []).forEach(function (d) {
        if (d.status !== '未审核') return;
        out.push({ billNo: d.billNo, time: d.date, fromTo: '→ ' + (d.supplier || '—'), node: d.warehouse,
          planText: '—（无清单）', codeN: (d.codes || []).length, statusText: '待审核', _real: d });
      });
    } else if (sceneKey === 'pick-out') {
      WH.pickDocs.forEach(function (d) {
        if (d.status !== '待出库') return;
        out.push({ billNo: d.billNo, time: d.date, fromTo: '→ ' + d.pharmacy, node: d.warehouse,
          planText: planTextOfItems(d.items), codeN: (d.codes || []).length, statusText: '待出库', _real: d });
      });
    } else if (sceneKey === 'req-in') {
      WH.pickDocs.forEach(function (d) {
        if (d.status !== '已出库') return;
        out.push({ billNo: d.billNo, time: d.outTime || d.date, fromTo: d.warehouse + ' → ' + d.pharmacy, node: d.pharmacy,
          planText: planTextOfItems(d.items), codeN: (d.codes || []).length, statusText: '在途 · 待入库', _real: d });
      });
    } else if (sceneKey === 'shelf') {
      WH.pickDocs.forEach(function (d) {
        if (d.status !== '已入库' || d.pharmacy !== curPharm()) return;
        var pending = (d.codes || []).filter(function (c) { return !c.phLoc; }).length;
        if (!pending) return;
        out.push({ billNo: d.billNo, time: d.inTime || d.date, fromTo: d.warehouse + ' → ' + d.pharmacy, node: d.pharmacy,
          planText: pending + ' 码待上架', codeN: pending, statusText: '待上架', _real: d });
      });
    } else if (sceneKey === 'disp-out') {
      var rx = window.PUL_RX ? window.PUL_RX.load() : { rxDocs: [] };
      (rx.rxDocs || []).forEach(function (d) {
        if (d.status !== '待发药' && d.status !== '发药中') return;
        out.push({ billNo: d.rxNo || d.billNo, time: d.rxTime || d.date, fromTo: d.patient || '—', node: curPharm(),
          planText: (d.items || []).length + ' 个药品', codeN: 0, statusText: d.status, _real: d });
      });
    } else if (sceneKey === 'tray-out') {
      var rx2 = window.PUL_RX ? window.PUL_RX.load() : { trayDocs: [] };
      (rx2.trayDocs || []).forEach(function (d) {
        if (d.status !== '待摆药' && d.status !== '摆药中') return;
        out.push({ billNo: d.trayNo || d.billNo, time: d.trayTime || d.date, fromTo: (d.ward || '') + ' ' + (d.patient || ''), node: curPharm(),
          planText: (d.items || []).length + ' 个药品', codeN: 0, statusText: d.status, _real: d });
      });
    }
    return out;
  }
  function counts() {
    var m = {};
    SCENES.forEach(function (s) { m[s.key] = queues(s.key).length; });
    return m;
  }

  // ===== 3. 单据规范化（hubDoc：items.planQty 一律换算到销售单位；codes/badCodes 共享真实引用） =====
  function openDoc(sceneKey, billNo) {
    var rows = queues(sceneKey);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].billNo !== billNo) continue;
      var row = rows[i], real = row._real, scene = sceneOf(sceneKey);
      var hd = { scene: sceneKey, billNo: billNo, node: row.node, title: row.fromTo,
        list: 'none', src: 'none', items: [], codes: real.codes, badCodes: real.badCodes || (real.badCodes = []),
        status: '', curLoc: 'M-01', _real: real };
      // Round CC 草稿提交制（shelf 豁免——上架扫码即生效无审核）：codes/badCodes 与真身脱钩为工作副本；
      // 有暂存草稿则恢复（关闭弹窗不丢，UI 据 _restored 提示），无则从真身快照建副本
      if (sceneKey !== 'shelf') {
        var dr = loadDraft(sceneKey, billNo);
        if (dr) { hd.codes = dr.codes; hd.badCodes = dr.badCodes; hd._restored = true; }
        else {
          hd.codes = JSON.parse(JSON.stringify(real.codes || []));
          hd.badCodes = JSON.parse(JSON.stringify(real.badCodes || []));
        }
      }
      if (sceneKey === 'pur-in') {
        hd.status = real.downloaded === '是' ? '已审核' : '待审核';
        if ((real.items || []).length) {
          // 清单录入单（2026-10-11 Round BI）：计划清单直映射——不能用码聚合重建（扫过码后清单会被已扫药品覆盖、差异分析失效）；
          // 码源恒 none（录入模式：新码允许进单 + 清单归属/超量校验；pre 会把扫新码误判「多送/串货」）
          hd.list = 'plan'; hd.src = 'none';
          hd.items = real.items.map(function (it) { return { drugCode: it.drugCode, planQty: SC.toSaleQty(it.drugCode, it.qty), _ref: it }; });
        } else if ((real.codes || []).length) { hd.src = 'pre'; hd.list = 'plan'; hd.items = itemsFromCodes(real.codes); }
        // 单据级计划覆盖值（2026-10-13 Round BU：到货单编辑弹窗可改 o.planQty；带到 hubDoc 供 planTotal 优先采用，两审核入口判定一致）
        hd.planQtyTotal = real.planQty != null ? real.planQty : null;
      } else if (sceneKey === 'shelf') {
        hd.status = '作业中'; hd.src = 'pre'; hd.list = 'plan';
        hd.items = itemsFromCodes(real.codes);
      } else {
        hd.status = real.status;
        hd.items = (real.items || []).map(function (it) {
          return { drugCode: it.drugCode, planQty: SC.toSaleQty(it.drugCode, it.qty), _ref: it };
        });
        if (sceneKey === 'req-in') hd.src = 'pre';   // 在途单=库房已扫，有码单核对
        if (sceneKey === 'pick-out' && (real.codes || []).length) hd.src = 'pre';   // 2026-10-12：流转/申请预填码=有码单核对（空 codes 才是录入）
        hd.list = hd.items.length ? 'plan' : 'none';
      }
      // 码聚合补缺失清单行（仅 plan 单；2026-10-15 最终评审 Finding 1：开关=否自证行的落库/草稿码重开不丢——
      // 有码无行会让药房复核/重开审核把本单合法码误判「不在码单内/超量」）
      if (hd.list === 'plan') {
        itemsFromCodes(hd.codes).forEach(function (row) {
          if (!hd.items.some(function (x) { return x.drugCode === row.drugCode; })) hd.items.push(row);
        });
      }
      // 「按药品清单扫码」开关默认值（2026-10-15 方案 §3.1/§3.3）：有码单/清单单=是、人工单=否；
      // pre（审核页扫码语义）固定=是且 UI 不出开关；会话版面状态不落库、不进草稿
      hd.matchList = hd.src === 'pre' ? true : hd.items.length > 0;
      return hd;
    }
    return null;
  }
  // 码聚合建清单行（planQty 换算到销售单位）
  function itemsFromCodes(codes) {
    var m = {}, order = [];
    (codes || []).forEach(function (c) {
      var p = P2.parseCode(c.code, D.flat(D.load()));
      if (!p.dict) return;
      var dc = p.dict.drugCode;
      if (!m[dc]) { m[dc] = 0; order.push(dc); }
      m[dc] += SC.codeBaseQty(p);
    });
    return order.map(function (dc) { return { drugCode: dc, planQty: SC.toSaleQty(dc, m[dc]) }; });
  }
  // 深链解析：billNo 全池反查 → { scene, billNo }
  function findDoc(billNo) {
    var hit = null;
    SCENES.forEach(function (s) {
      if (hit || !s.inPage) return;
      queues(s.key).forEach(function (r) { if (r.billNo === billNo) hit = { scene: s.key, billNo: billNo }; });
    });
    return hit;
  }

  // ===== 4. 真实数据钩子（ctx 适配器） =====
  // 码的库存归属：库房侧逐库查（拿真实节点名）；药房侧合并视图（rec 带 pharmacy 字段）
  function inStockReal(code) {
    var wss = P2.warehouses(), hit = null, i;
    for (i = 0; i < wss.length; i++) {
      W.stockAll(PCH, WH, wss[i]).forEach(function (c) { if (c.code === code) hit = { node: wss[i], rec: c }; });
      if (hit) return hit;
    }
    W.pharmacyStock(WH).forEach(function (c) { if (c.code === code) hit = { node: c.pharmacy || '药房', rec: c }; });
    if (hit) { hit.shelf = hit.rec.phLoc ? '已上架' : '待上架'; hit.loc = hit.rec.phLoc || ''; }
    return hit;
  }
  // 被占用（2026-10-12 Round BL 扩三池，一码不挂两张未完结单）：码在
  // ① 其他「待出库」调拨单 ② 其他「未审核」采购退货单（库房退货）③ 其他「未审核」其他出库单（wh-other-out 页内预占同口径）
  function occupiedReal(code, hd) {
    var found = '';
    var selfNo = hd._real && hd._real.billNo;
    WH.pickDocs.forEach(function (d) {
      if (d.status !== '待出库' || d.billNo === selfNo) return;
      (d.codes || []).forEach(function (c) { if (c.code === code) found = '备货单 ' + d.billNo + '（待出库）'; });
    });
    (PCH.outDocs || []).forEach(function (d) {
      if (d.status !== '未审核' || d.type !== '库房退货' || d.billNo === selfNo) return;
      (d.codes || []).forEach(function (c) { if (c.code === code) found = '采购退货单 ' + d.billNo + '（未审核）'; });
    });
    (WH.othOutDocs || []).forEach(function (d) {
      if (d.status !== '未审核' || d.billNo === selfNo) return;
      (d.codes || []).forEach(function (c) { if (c.code === code) found = '其他出库单 ' + d.billNo + '（未审核）'; });
    });
    return found || null;
  }
  function stockCodesReal(node) {
    var out = [];
    W.stockAll(PCH, WH, node).forEach(function (c) { out.push(c.code); });
    W.pharmacyStock(WH, node).forEach(function (c) { out.push(c.code); });
    return out;
  }
  // 新码记录补字段：在架记录继承批次/效期/库位；同单同药品继承已填批次
  function enrichReal(hd) {
    return function (rec, parsed, stockRec) {
      if (stockRec && stockRec.rec) {
        rec.batch = stockRec.rec.batch || ''; rec.prodDate = stockRec.rec.prodDate || ''; rec.expDate = stockRec.rec.expDate || '';
        rec.location = stockRec.rec.location || stockRec.rec.loc || '';
      }
      if (!rec.batch) {
        (hd.codes || []).forEach(function (c) {
          if (rec.batch) return;
          var p = P2.parseCode(c.code, D.flat(D.load()));
          if (p.dict && p.dict.drugCode === parsed.dict.drugCode && c.batch) {
            rec.batch = c.batch; rec.prodDate = c.prodDate || ''; rec.expDate = c.expDate || '';
          }
        });
      }
    };
  }
  function ctxOf(hd) {
    var scene = sceneOf(hd.scene);
    var ctx = {
      dir: scene.dir, list: hd.list, src: hd.src, matchList: hd.matchList, node: hd.node, doc: hd, verb: scene.verb,
      frozen: function () { return W.nodeFrozen(hd.node); },
      inStock: function (code) { return inStockReal(code); },
      occupied: function (code) { return occupiedReal(code, hd); },
      stockCodes: function () { return stockCodesReal(hd.node); },
      enrichRecord: enrichReal(hd),
      persist: function () { if (hd.scene === 'shelf') savePool(hd.scene); else saveDraft(hd); }   // Round CC：扫码只进草稿（shelf 豁免即时生效）
    };
    if (hd.scene === 'req-in') {
      // 在途单复核：库房已扫（checked=true 是库房动作），药房复核态写 phChecked（不动库房记录）
      ctx.isChecked = function (c) { return !!c.phChecked; };
      ctx.markChecked = function (c, when) { c.phChecked = true; c.phCheckTime = when; };
    }
    if (hd.scene === 'shelf') {
      // 上架：核对态=码记录 phLoc；扫码即写货位（W.setPhLoc：phLoc+scanHead+shelfTime）
      ctx.isChecked = function (c) { return !!c.phLoc; };
      ctx.markChecked = function (c) { W.setPhLoc(WH, c.code, hd.curLoc); };
    }
    if (hd.scene === 'pur-out') {
      // 采购退货（2026-10-12 Round BL）：扫到本库无此码 → 登记「无库存码」异常码（审核硬拦，移除后放行）
      // ——老系统「无库存码」页签的统一异常码口径（对齐其他入库未解析码：放行登记、拦截审核）
      ctx.onDirBad = function (code, p, rec, why) {
        if (!hd.badCodes.some(function (b) { return b.code === code; })) {
          hd.badCodes.push({ code: code, time: SC.nowStr(),
            reason: '无库存码：' + (rec ? '该码在「' + rec.node + '」，不在本库房' : '库存不存在该码') });
          ctx.persist();
        }
        return { level: 'bad', msg: why + '，已登记无库存码（审核硬拦；码明细「移除」后放行）' };
      };
    }
    return ctx;
  }
  function scan(hd, code, flags) {
    var r = SC.scanCore(code, flags || {}, ctxOf(hd));
    // Round CC：数量一致自动提交（bad 不触发；命中后结果带 autoCommit 标记供 UI 提示）
    if (r.level !== 'bad' && tryAutoCommit(hd)) r.autoCommit = true;
    return r;
  }

  // ===== 5. 审核（前检=共享主干；落账=各池适配器） =====
  function auditDoc(hd) {
    commitDraft(hd);   // Round CC：页内审核=提交草稿后判定（作业闭环；单据页行内审核只认已提交，不走此处）
    if (hd.scene === 'pur-in') {
      var o = hd._real;
      if (o.dlStatus === '失败') return { block: '下载失败单请先回到「采购到货单」重新下载' };
      // 「本单无码」不再硬拦——统一审核判定在主干（无码审核：码清单空∧计划数量>0 放行）
    }
    var pre = SC.auditPrecheck(ctxOf(hd));
    if (pre.block) return { block: pre.block };
    return { pre: pre };
  }
  function auditCommit(hd) {
    var u = curUser(), t = SC.nowStr(), real = hd._real;
    if (hd.scene === 'pur-in') {
      // 口径与 purchase-arrive.js auditFlow 一致（审核即生成已审核入库单）；无码审核（码清单空）落账 hisPush=无码推送
      // 落账只入已核对码（2026-10-13 Round BU：计划调小后未扫残留码不进在架，留到货单作短收记录）
      var noCode = !(real.codes || []).length;
      var checkedCodes = (real.codes || []).filter(function (c) { return c.checked; });
      real.downloaded = '是'; real.confirm = '已确认';
      real.auditDate = t; real.auditor = u.name || '演示员';
      PCH.inDocs.unshift({ billNo: real.orderNo, date: t, supplier: real.supplier, invoice: real.invoice || '',
        warehouse: real.warehouse, location: real.loc || '', audit: '已审核', hisPush: noCode ? '无码推送' : '已推送', miPush: '未推送',
        downloadTime: t, auditDate: t, auditor: real.auditor, source: real.source === '手动' ? '手动' : '下载',
        codes: checkedCodes.map(function (c) { return Object.assign({}, c, { location: c.location || real.loc || '' }); }) });
      P2.save(PCH);
    } else if (hd.scene === 'pick-out') {
      var ctx = ctxOf(hd);
      real.status = '已出库'; real.outTime = t; real.operator = u.name || '演示员';
      (real.items || []).forEach(function (it) { it.docQty = SC.scannedBase(ctx, it.drugCode); });
      // 开关=否扫入的计划外药品（自证行 planQty=null）审核落账回写 real.items（qty=实际扫码折合，基本单位）
      // ——四要素「药品清单=实际作业内容」：药房 ph-req-in 页内审核公式（Σitems.qty vs phChecked 折合）与列表展示同源（最终评审 Finding 1）
      // 回写按纯存在性判定：同会话 null 行与跨会话重开的 union 行（openDoc 码聚合补行 planQty=码聚合≠null）统一覆盖（复审 repro4 收口）
      (hd.items || []).forEach(function (it) {
        var exists = (real.items || []).some(function (r) { return r.drugCode === it.drugCode; });
        if (!exists) (real.items = real.items || []).push({ drugCode: it.drugCode, qty: SC.scannedBase(ctx, it.drugCode) });
      });
      (real.codes || []).forEach(function (c) {
        c.scanHead = '库房备货';
        if (!c.expectLoc) {
          var slot = '';
          (real.items || []).forEach(function (it) {
            var p = P2.parseCode(c.code, D.flat(D.load()));
            if (p.dict && p.dict.drugCode === it.drugCode && it.slot) slot = it.slot;
          });
          c.expectLoc = slot || real.shelfLoc || '';
        }
      });
      W.save(WH);
    } else if (hd.scene === 'req-in') {
      W.auditPickIn(real);   // 共享层落账（已出库→已入库+inTime）
      W.save(WH);
    } else if (hd.scene === 'pur-out') {
      // 采购退货落账：状态/审核时间/审核人；在架扣减由集合推导完成（stockAll 减「已审核」采购退货单）
      real.status = '已审核'; real.auditTime = t; real.auditor = u.name || '演示员';
      P2.save(PCH);
    }
    hd.status = real.status || (real.downloaded === '是' ? '已审核' : '待审核');
    return real;
  }

  window.PUL_SCAN_HUB = { SCENES: SCENES, sceneOf: sceneOf, reload: reload, queues: queues, counts: counts,
    openDoc: openDoc, findDoc: findDoc, ctxOf: ctxOf, scan: scan, auditDoc: auditDoc, auditCommit: auditCommit,
    inStockReal: inStockReal, curWh: curWh, curPharm: curPharm,
    commitDraft: commitDraft, loadDraft: loadDraft, clearDraft: clearDraft };
})();
