/**
 * scan-lab.js — 统一扫码验证（沙盒页）适配层：沙盒状态 + ctx 钩子
 * 2026-10-11 Round BH 重构：扫码主干抽入共享层 scripts/scan-core.js（window.PUL_SCAN），
 *   本页只剩沙盒状态与 ctx 适配（scan-lab 沙盒 / scan-hub 真实单据，同一主干两个适配器）
 * 沙盒口径：store 命名空间 scanLab 独立持久化（v2 结构，旧结构自动重播种子）；不碰 PUL_WH 真实种子
 * node 可测（_t-scan-lab.node.js 驱动断言，API 面不变）
 */
(function () {
  'use strict';

  var LD = window.PUL_SCAN_LAB_DATA, SC = window.PUL_SCAN;
  var NS = 'scanLab';

  var SCENES = LD.SCENES, COLS = LD.COLS, CELL_GREY = LD.CELL_GREY, CELL_RULE = LD.CELL_RULE,
    STOCK_SEED = LD.STOCK_SEED, OCCUPIED = LD.OCCUPIED,
    SHELF_LOCS = LD.SHELF_LOCS, DEMO_BATCH = LD.DEMO_BATCH, seedDocs = LD.seedDocs, DEMO_CODES = LD.DEMO_CODES;

  // ===== 1. 沙盒状态（v2 结构：stock 值={node,shelf}；旧结构整库重播种子） =====
  var S = null;
  function fresh() {
    return { v2: true, cur: { scene: 'pur-in', col: 'none' }, frozen: false, panelOpen: true,
      stock: JSON.parse(JSON.stringify(STOCK_SEED)), docs: seedDocs() };
  }
  function load() {
    var raw = window.store ? window.store.load() : {};
    if (raw[NS] && raw[NS].v2) { S = raw[NS]; return S; }
    S = fresh();
    save();
    return S;
  }
  function save() { var patch = {}; patch[NS] = S; if (window.store) window.store.update(patch); }
  function sceneOf(key) { for (var i = 0; i < SCENES.length; i++) if (SCENES[i].key === key) return SCENES[i]; return SCENES[0]; }
  function colOf(key) { for (var i = 0; i < COLS.length; i++) if (COLS[i].k === key) return COLS[i]; return COLS[0]; }
  function curScene() { return sceneOf(S.cur.scene); }
  function curCol() { return colOf(S.cur.col); }
  function curKey() { return S.cur.scene + ':' + S.cur.col; }
  function curDoc() { return S.docs[curKey()]; }
  function docOf(sceneKey, colKey) { return S.docs[sceneKey + ':' + colKey]; }
  function switchCell(sceneKey, colKey) { S.cur = { scene: sceneKey, col: colKey }; save(); }
  function cellGrey(sceneKey, colKey) { return CELL_GREY[sceneKey + ':' + colKey] || ''; }
  function cellRule(sceneKey, colKey) {
    return CELL_RULE[sceneKey + ':' + colKey] || (sceneOf(sceneKey).rule + '｜' + colOf(colKey).rule);
  }
  function resetCell(sceneKey, colKey) {
    var all = seedDocs();
    S.docs[sceneKey + ':' + colKey] = all[sceneKey + ':' + colKey];
    S.stock = JSON.parse(JSON.stringify(STOCK_SEED));   // 沙盒库存一并还原（审核动过库存可无损重演示）
    save();
  }

  // ===== 2. 沙盒 ctx 适配器（主干在 PUL_SCAN，这里只提供数据钩子） =====
  function sandboxCtx() {
    var scene = curScene(), col = curCol(), doc = curDoc();
    return {
      dir: scene.dir, list: col.list, src: col.src, node: doc.node, doc: doc, verb: scene.verb,
      frozen: function () { return S.frozen; },
      inStock: function (code) { return S.stock[code] || null; },   // 活引用：onShelf 直接改
      occupied: function (code) { return OCCUPIED[code] || null; },
      stockCodes: function () {
        return Object.keys(S.stock).filter(function (k) { return S.stock[k].node === doc.node; });
      },
      enrichRecord: function (rec) { rec.batch = DEMO_BATCH.batch; rec.prodDate = DEMO_BATCH.prodDate; rec.expDate = DEMO_BATCH.expDate; },
      onShelf: function (rec, loc) { rec.shelf = '已上架'; rec.loc = loc || 'M-01'; },
      persist: save
    };
  }

  function scanCore(code, flags) { return SC.scanCore(code, flags, sandboxCtx()); }
  function autoAssign() { return SC.autoAssign(sandboxCtx()); }
  function auditPrecheck() {
    var pre = SC.auditPrecheck(sandboxCtx());
    pre.scene = curScene(); pre.col = curCol();   // lab-ui 需要场景上下文（措辞/分叉）
    return pre;
  }
  // 审核落账（沙盒库存闭环在适配层）：①②态计划数量←扫码数量 + 入库加/出库减（拆零码余量回架）
  function auditCommit() {
    var scene = curScene(), col = curCol(), doc = curDoc(), ctx = sandboxCtx();
    doc.status = '已审核';
    doc.auditTime = SC.nowStr();
    doc.auditor = ((window.store && window.store.load().currentUser) || {}).name || '演示员';
    if (col.list !== 'plan') {
      doc.items.forEach(function (it) { it.planQty = SC.toSaleQty(it.drugCode, SC.scannedBase(ctx, it.drugCode)); });
    }
    doc.codes.forEach(function (c) {
      if (scene.dir === 'in') S.stock[c.code] = { node: doc.node, shelf: doc.node.indexOf('药房') > -1 ? '待上架' : '' };
      else if (c.split !== '是') delete S.stock[c.code];
    });
    save();
    return doc;
  }

  // ===== 3. 导出（API 面与 Round BF 一致，lab-ui 与测试零改动） =====
  window.PUL_SCAN_LAB = {
    COLS: COLS, SCENES: SCENES, DEMO_CODES: DEMO_CODES, SHELF_LOCS: SHELF_LOCS, OCCUPIED: OCCUPIED,
    load: load, save: save, state: function () { return S; },
    sceneOf: sceneOf, colOf: colOf, curScene: curScene, curCol: curCol, curKey: curKey, curDoc: curDoc, docOf: docOf,
    switchCell: switchCell, resetCell: resetCell, cellGrey: cellGrey, cellRule: cellRule,
    scanCore: scanCore, autoAssign: autoAssign, auditPrecheck: auditPrecheck, auditCommit: auditCommit,
    drugOf: SC.drugOf, drugName: SC.drugName, saleUnit: SC.saleUnit, baseUnit: SC.baseUnit,
    toBaseQty: SC.toBaseQty, toSaleQty: SC.toSaleQty, codeBaseQty: SC.codeBaseQty, codeContrib: SC.codeContrib,
    fmtN: SC.fmtN, saleParen: SC.saleParen, decomp: SC.decomp, planBase: SC.planBase, findCode: SC.findCode,
    scannedBase: function (doc, dc, srcMode) {
      // 兼容旧签名（doc, dc, srcMode）：包一个最小 ctx
      return SC.scannedBase({ doc: doc, src: srcMode || 'none' }, dc);
    } };
})();
