/**
 * wh-data.js — 库房管理 Mock 数据（store 命名空间 wh）
 * 码状态机原型实现 = 集合推导（与 pch.stockCodes 同款扩展）：
 *   在架 = 采购入库单(已审核) + 其他入库单(已审核) + 退回入库单(已审核)
 *        − 采购退货单(已审核) − 领用出库(已审核) − 其他出库单(已审核) − 损耗出库(已审核)
 *   在途 = 领用出库单 status='已出库'（出库审核即扣账，2026-09-14 拍板）；'药房已入库' 闭环
 * 上游「领用申请单池 / 退回单池」属药房模块（ph-req / ph-ret-out 写入，本文件只存）
 */
(function () {
  'use strict';

  // ===== 业务枚举（基础字典 IO_TYPE 的业务化子集；损耗原因 Q7 拍板=要） =====
  var OTH_IN_TYPES = ['赠品入库', '期初补录', '其他'];
  var OTH_OUT_TYPES = ['借出', '样品', '其他'];
  var LOSS_REASONS = ['破损', '过期', '污染', '其他'];
  var LOSS_SOURCES = ['日常报损', '盘亏转入', '数据迁移'];

  // 码记录（与 pch code() 同形状）
  function code(idcode, serial, check, batch, prod, exp, extra) {
    return Object.assign({ code: idcode + serial + check, level: 1, split: '否', splitQty: '',
      batch: batch, prodDate: prod, expDate: exp, checked: false, code2: '', code3: '', location: '' }, extra || {});
  }
  function codes(idcode, from, n, batch, prod, exp, extra) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(code(idcode, String(from + i).padStart(9, '0'), '8000', batch, prod, exp, extra));
    return out;
  }

  // ===== 种子 =====
  // 其他入库单·期初补录（已审核）：让库存有非采购来源数据（依姆多/唯可来/健脾生血片）
  var OTH_IN_SEED_CODES = [].concat(
    codes('8461935', 500001, 6, '250603', '2025-06-15', '2028-06-14', { checked: true, location: 'A-02-01' }),
    codes('8416917', 500101, 3, '250704', '2025-07-20', '2027-07-19', { checked: true, location: 'A-02-02' }),
    codes('8433386', 500201, 4, '250805', '2025-08-10', '2026-12-09', { checked: true, location: 'B-02-01' })
  );
  var OTH_IN_DOCS = [
    { billNo: 'QTRK20260901001', date: '2026-09-01 09:30', type: '期初补录', warehouse: '中心库', remark: '系统上线期初库存补录',
      status: '已审核', auditTime: '2026-09-01 10:05', auditor: '王铁军', codes: OTH_IN_SEED_CODES }
  ];
  // 领用出库单：①已出库=在途（出库审核即扣账）②药房已入库=闭环演示
  // expectLoc = 申请单「上架货位」随单传递到码（预期上架位置；领用入库单核对可见，上下架优先提示）
  var PICK_DOCS = [
    { billNo: 'LYCK20260913001', reqNo: 'LY20260913002', date: '2026-09-13 14:20', pharmacy: '门诊药房', warehouse: '中心库',
      status: '已出库', auditTime: '2026-09-13 14:35', operator: '王铁军',
      codes: OTH_IN_SEED_CODES.slice(0, 3).map(function (c) { return Object.assign({}, c, { expectLoc: 'M-01' }); }) },
    { billNo: 'LYCK20260912001', reqNo: 'LY20260912001', date: '2026-09-12 10:08', pharmacy: '门诊药房', warehouse: '中心库',
      status: '药房已入库', auditTime: '2026-09-12 10:22', operator: '王铁军',
      codes: OTH_IN_SEED_CODES.slice(6, 7).map(function (c) { return Object.assign({}, c, { expectLoc: 'M-01' }); })
        .concat(OTH_IN_SEED_CODES.slice(9, 11).map(function (c) { return Object.assign({}, c, { expectLoc: 'M-03' }); })) }
  ];
  PICK_DOCS[1].codes[0].phLoc = 'M-01'; // 唯可来已上架，其余待上架（演示上下架）
  // 领用申请单池（药房模块上游，种子模拟）：待备货 2 条 + 已完成 2 条（与出库单关联）
  // items[].slot = 上架货位（药房货位维护如 M-01，或取药槽如 CB01-C1-01；可空=入库后再定）
  var REQ_POOL = [
    { reqNo: 'LY20260914001', date: '2026-09-14 08:40', pharmacy: '门诊药房', warehouse: '中心库', applicant: '陈静',
      items: [{ drugCode: 'YP010245', qty: 5, slot: 'M-01' }, { drugCode: 'YP010529', qty: 2, slot: 'CB01-C1-02' }], status: '待备货', remark: '周末门急诊备货' },
    { reqNo: 'LY20260914002', date: '2026-09-14 09:15', pharmacy: '住院药房', warehouse: '中心库', applicant: '陈静',
      items: [{ drugCode: 'YP010388', qty: 60, slot: 'Z-01' }, { drugCode: 'YP010477', qty: 10, slot: '' }], status: '待备货', remark: '' },
    { reqNo: 'LY20260913002', date: '2026-09-13 14:02', pharmacy: '门诊药房', warehouse: '中心库', applicant: '陈静',
      items: [{ drugCode: 'YP010245', qty: 3, slot: 'M-01' }], status: '已完成', remark: '' },
    { reqNo: 'LY20260912001', date: '2026-09-12 09:50', pharmacy: '门诊药房', warehouse: '中心库', applicant: '陈静',
      items: [{ drugCode: 'YP010401', qty: 1, slot: 'M-01' }, { drugCode: 'YP010312', qty: 2, slot: 'M-03' }], status: '已完成', remark: '' }
  ];
  // 退回单池（药房退回出库单，待库房接收入库）：码必须来自已领出（在途/药房在架）的码；splitQty>0 演示拆零退回提示
  var RET_POOL = [
    { retNo: 'TH20260914001', date: '2026-09-14 10:20', pharmacy: '门诊药房', warehouse: '中心库', operator: '陈静', status: '待入库',
      codes: [Object.assign({}, OTH_IN_SEED_CODES[1], { split: '是', splitQty: 4 }), Object.assign({}, OTH_IN_SEED_CODES[2])] },
    { retNo: 'TH20260914002', date: '2026-09-14 11:05', pharmacy: '门诊药房', warehouse: '中心库', operator: '陈静', status: '待入库',
      codes: [Object.assign({}, OTH_IN_SEED_CODES[10])] }
  ];
  // 损耗出库单种子（已审核；来源列：日常报损/盘亏转入/数据迁移 —— Q1 拍板口径）
  var LOSS_DOCS = [
    { billNo: 'SHCK20260905001', date: '2026-09-05 11:20', reason: '破损', source: '日常报损', warehouse: '中心库',
      status: '已审核', auditTime: '2026-09-05 11:40', auditor: '王铁军', remark: '搬运跌落破损',
      codes: [Object.assign({}, OTH_IN_SEED_CODES[11])] },
    { billNo: 'SHCK20260820001', date: '2026-08-20 15:30', reason: '过期', source: '数据迁移', warehouse: '中心库',
      status: '已审核', auditTime: '2026-08-20 15:45', auditor: '王铁军', remark: '老系统迁移的历史报损',
      codes: [code('8400431', '000490001', '8000', '240301', '2024-03-10', '2026-03-09', { checked: true })] }
  ];

  function migrate(s) {
    ['pickDocs', 'retInDocs', 'othInDocs', 'othOutDocs', 'lossDocs', 'reqPool', 'retPool', 'phLossDocs'].forEach(function (k) {
      if (!s[k]) s[k] = [];
    });
    (s.pickDocs || []).forEach(function (d) {
      (d.codes || []).forEach(function (c) {
        if (c.phLoc === undefined) c.phLoc = '';
        if (c.expectLoc === undefined) c.expectLoc = '';
      });
    });
    (s.reqPool || []).forEach(function (r) {
      (r.items || []).forEach(function (it) { if (it.slot === undefined) it.slot = ''; });
      if (!r.source) r.source = '药房申请';   // 2026-10-01 库房制单引入 source，老数据兜底
    });
    // 老会话种子：已入库单若完全没货位，补一码已上架便于演示（不覆盖用户已上架）
    (s.pickDocs || []).forEach(function (d) {
      if (d.billNo === 'LYCK20260912001' && d.codes && d.codes[0] &&
          !d.codes.some(function (c) { return c.phLoc; })) {
        d.codes[0].phLoc = 'M-01';
      }
    });
    return s;
  }
  function load() {
    var s = window.store ? window.store.load() : {};
    if (s.wh) return migrate(s.wh);
    var seed = { pickDocs: PICK_DOCS, retInDocs: [], othInDocs: OTH_IN_DOCS, othOutDocs: [],
      lossDocs: LOSS_DOCS, reqPool: REQ_POOL, retPool: RET_POOL, phLossDocs: [] };
    if (window.store) window.store.update({ wh: seed });
    return seed;
  }
  function save(state) { if (window.store) window.store.update({ wh: state }); }

  // ===== 全局在架码集合（库房库存查询的事实源；每码带 _src 来源单据） =====
  function matchNode(d, warehouse) {
    if (!warehouse) return true;
    return d.warehouse === warehouse;
  }
  function pickPosted(d) {
    return d.status === '已出库' || d.status === '药房已入库';
  }
  function stockAll(pch, wh, warehouse) {
    var map = {};
    function addIn(codes, src) { (codes || []).forEach(function (c) { map[c.code] = Object.assign({}, c, { _src: src }); }); }
    function addOut(codes) { (codes || []).forEach(function (c) { delete map[c.code]; }); }
    (pch.inDocs || []).forEach(function (d) {
      if (d.audit === '已审核' && matchNode(d, warehouse)) addIn(d.codes, '采购入库单 ' + d.billNo);
    });
    (wh.othInDocs || []).forEach(function (d) {
      if (d.status === '已审核' && matchNode(d, warehouse)) addIn(d.codes, '其他入库单 ' + d.billNo);
    });
    (wh.retInDocs || []).forEach(function (d) {
      if (d.status === '已审核' && matchNode(d, warehouse)) addIn(d.codes, '退回入库单 ' + d.billNo);
    });
    (pch.outDocs || []).forEach(function (d) {
      if (d.status === '已审核' && matchNode(d, warehouse)) addOut(d.codes);
    });
    (wh.pickDocs || []).forEach(function (d) {
      if (pickPosted(d) && matchNode(d, warehouse)) addOut(d.codes);
    });
    (wh.othOutDocs || []).forEach(function (d) {
      if (d.status === '已审核' && matchNode(d, warehouse)) addOut(d.codes);
    });
    (wh.lossDocs || []).forEach(function (d) {
      if (d.status === '已审核' && matchNode(d, warehouse)) addOut(d.codes);
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  // 在途码 = 领用出库单「已出库」未闭环的码（含来源单号，库房库存查询「在途数」列）
  function transitByReq(wh, warehouse) {
    var map = {};
    (wh.pickDocs || []).forEach(function (d) {
      if (d.status !== '已出库') return;
      if (warehouse && d.warehouse !== warehouse) return;
      (d.codes || []).forEach(function (c) {
        var idcode = c.code.slice(0, 7);
        map[idcode] = (map[idcode] || 0) + 1;
      });
    });
    return map;
  }
  // 在架码按 标识码+批次 聚合（复用 pch.summarize；挂库位/来源）
  function summarizeStock(codes, dict) {
    return window.PUL_PCH.summarize(codes, dict);
  }
  // 效期状态：过期 / 预警(≤180天) / 正常
  function expStatus(expDate) {
    var today = new Date('2026-09-14');
    var exp = new Date(expDate);
    if (exp < today) return '过期';
    if ((exp - today) / 86400000 <= 180) return '预警';
    return '正常';
  }
  // 新单号：前缀 + 日期 + 3 位序号（原型口径）
  function nextNo(prefix, list, field) {
    field = field || 'billNo';
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var ymd = '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var n = list.filter(function (x) { return (x[field] || '').indexOf(prefix + ymd) === 0; }).length + 1;
    return prefix + ymd + ('00' + n).slice(-3);
  }
  // 登录节点是药房则用之，否则演示兜底门诊药房（从 plan 直达/库房账号预览药房页）
  function curPharm() {
    var u = (window.store && window.store.load().currentUser) || {};
    var name = u.warehouse || '';
    var nodes = window.PUL ? window.PUL.nodesOfOrg(u.org) : [];
    var type = '';
    for (var i = 0; i < nodes.length; i++) if (nodes[i].name === name) { type = nodes[i].type; break; }
    if (window.PUL && window.PUL.nodeKind(type) === '药房') return name;
    return '门诊药房';
  }
  // 药房在架 = 领用出库「药房已入库」− 退回单池 − 药房损耗 − 整盒已绑码
  // 拆零：码仍在架，累加 splitQty，达到 minUnit.per 才离架
  function minPerOf(code20) {
    if (!window.PUL_DRUG || !window.PUL_PCH) return 0;
    var p = window.PUL_PCH.parseCode(code20, window.PUL_DRUG.flat());
    if (!p.dict) return 0;
    var d = window.PUL_DRUG.drugOf(window.PUL_DRUG.load(), p.dict.drugCode);
    return (d && d.minUnit && d.minUnit.per) ? d.minUnit.per : 0;
  }
  function splitUsedMap() {
    var rx = window.store ? (window.store.load().rx || {}) : {};
    var used = {};
    function take(docs) {
      (docs || []).forEach(function (d) {
        if (d.status !== '发药中' && d.status !== '摆药中' && d.status !== '已完成') return;
        (d.items || []).forEach(function (it) {
          (it.codes || []).forEach(function (c) {
            if (c.split !== '是') return;
            var n = parseInt(c.splitQty, 10);
            if (!n) n = 1;
            used[c.code] = (used[c.code] || 0) + n;
          });
        });
      });
    }
    take(rx.rxDocs);
    take(rx.trayDocs);
    return used;
  }
  function occupiedRxCodes() {
    var rx = window.store ? (window.store.load().rx || {}) : {};
    var used = splitUsedMap();
    var seen = {};
    function take(docs) {
      (docs || []).forEach(function (d) {
        if (d.status !== '发药中' && d.status !== '摆药中' && d.status !== '已完成') return;
        (d.items || []).forEach(function (it) {
          (it.codes || []).forEach(function (c) {
            if (c.split === '是') {
              var per = minPerOf(c.code);
              if (per && (used[c.code] || 0) < per) return;
            }
            seen[c.code] = true;
          });
        });
      });
    }
    take(rx.rxDocs);
    take(rx.trayDocs);
    return Object.keys(seen);
  }
  function pharmacyStock(wh, pharmacy) {
    var map = {};
    (wh.pickDocs || []).forEach(function (d) {
      if (d.status !== '药房已入库') return;
      if (pharmacy && d.pharmacy !== pharmacy) return;
      (d.codes || []).forEach(function (c) {
        map[c.code] = Object.assign({}, c, { _src: d.billNo, pharmacy: d.pharmacy });
      });
    });
    (wh.retPool || []).forEach(function (r) {
      (r.codes || []).forEach(function (c) { delete map[c.code]; });
    });
    (wh.phLossDocs || []).forEach(function (d) {
      if (d.status !== '已审核') return;
      (d.codes || []).forEach(function (c) { delete map[c.code]; });
    });
    occupiedRxCodes().forEach(function (code) { delete map[code]; });
    var used = splitUsedMap();
    Object.keys(map).forEach(function (k) {
      var u = used[k] || 0;
      if (!u) return;
      var per = minPerOf(k);
      map[k].split = '是';
      map[k].splitQty = String(u);
      map[k].splitRemain = per ? Math.max(0, per - u) : 0;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function findPhCode(wh, code20) {
    var found = null;
    (wh.pickDocs || []).forEach(function (d) {
      if (d.status !== '药房已入库') return;
      (d.codes || []).forEach(function (c) { if (c.code === code20) found = c; });
    });
    return found;
  }
  function setPhLoc(wh, code20, phLoc) {
    var c = findPhCode(wh, code20);
    if (!c) return false;
    c.phLoc = phLoc || '';
    return true;
  }
  function phTransit(wh, pharmacy) {
    var n = 0;
    (wh.pickDocs || []).forEach(function (d) {
      if (d.status !== '已出库') return;
      if (pharmacy && d.pharmacy !== pharmacy) return;
      n += (d.codes || []).length;
    });
    return n;
  }
  function now() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function nodeFrozen(nodeName) {
    if (!nodeName) return false;
    var inv = window.store ? (window.store.load().inv || {}) : {};
    var docs = inv.countDocs || [];
    for (var i = 0; i < docs.length; i++) {
      if (docs[i].node === nodeName && docs[i].status !== '已审核') return true;
    }
    return false;
  }
  function disabledMsg(code20) {
    if (!window.PUL_DRUG) return '';
    var ds = window.PUL_DRUG.load();
    var ic = window.PUL_DRUG.idcodeOf(ds, (code20 || '').slice(0, 7));
    if (ic && ic.status === '停用') return '标识码已停用';
    if (ic) {
      var d = window.PUL_DRUG.drugOf(ds, ic.drugCode);
      if (d && d.status === '停用') return '药品已停用';
    }
    return '';
  }
  function findOnHand(code20) {
    var pch = window.PUL_PCH ? window.PUL_PCH.load() : { inDocs: [], outDocs: [] };
    var wh = load();
    var hit = null;
    stockAll(pch, wh).forEach(function (x) { if (x.code === code20) hit = x; });
    if (!hit) pharmacyStock(wh).forEach(function (x) { if (x.code === code20) hit = x; });
    return hit;
  }
  // kind: out=领用/其他出/发药/摆药（过期+停用+冻结）；in=入库/退（只冻结）；loss=损耗（只冻结）；count=盘点（不拦）
  function blockMove(code20, nodeName, kind, extra) {
    extra = extra || {};
    kind = kind || 'out';
    if (kind !== 'count' && nodeFrozen(nodeName)) return '本节点盘点中，禁止出入库';
    if (kind === 'out') {
      var dis = disabledMsg(code20);
      if (dis) return dis;
      var exp = extra.expDate;
      if (!exp && extra.codeObj) exp = extra.codeObj.expDate;
      if (!exp) {
        var hit = findOnHand(code20);
        if (hit) exp = hit.expDate;
      }
      if (exp && expStatus(exp) === '过期') return '过期码禁止出库/发药';
    }
    return '';
  }
  function assertUnfrozen(nodeName) {
    if (!nodeFrozen(nodeName)) return true;
    if (window.showToast) window.showToast('本节点盘点中，禁止出入库');
    return false;
  }

  window.PUL_WH = { load: load, save: save, stockAll: stockAll, transitByReq: transitByReq,
    summarizeStock: summarizeStock, expStatus: expStatus, nextNo: nextNo, now: now,
    curPharm: curPharm, pharmacyStock: pharmacyStock,
    findPhCode: findPhCode, setPhLoc: setPhLoc, phTransit: phTransit,
    pickPosted: pickPosted, nodeFrozen: nodeFrozen, blockMove: blockMove, assertUnfrozen: assertUnfrozen,
    OTH_IN_TYPES: OTH_IN_TYPES, OTH_OUT_TYPES: OTH_OUT_TYPES, LOSS_REASONS: LOSS_REASONS, LOSS_SOURCES: LOSS_SOURCES,
    mkCodes: codes };
})();
