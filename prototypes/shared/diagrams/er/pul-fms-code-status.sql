-- ============================================================================
-- pul-fms-code-status.sql — 追溯码「当前状态」推导 SQL（MySQL 8+，配套 pul-fms-full.sql）
-- ----------------------------------------------------------------------------
-- 口径来源：原型 wh-data.js stockAll() / pharmacyStock()（2026-10-02 领用重构后）
-- 设计原则：TRACE_CODE 无 status 字段，码状态 = 单据集合推导（见图 08 状态机）
--
-- 表关联链路：
--   码⇄药：TRACE_CODE.code(20位) 前 7 位 = IDCODES.idcode ──> DRUGS.drugCode
--   码⇄单据：DOC_CODE（码明细，billNo 逻辑多态）分别 JOIN：
--     ├─ PURCHASE_DOC.billNo   采购入库(docKind=IN)/采购退货(OUT)，audit=已审核 才记账
--     ├─ PICK_DOC.billNo   领用单：待提交/待出库(备货单内动作,不扣账)/已出库·待入库(在途)/已入库·待上架(闭环)/已上架/已作废(释放码)
--     ├─ RET_DOC.retNo         药房退回：待入库(退回在途)/已入库(回库房在架)
--     ├─ LOSS_DOC.billNo       损耗：nodeKind=库房损耗/药房损耗，status=已审核 才记账
--     └─ MISC_DOC.billNo       其他出入库：docKind=IN/OUT，status=已审核 才记账
--   发药占用：RX_ITEM_CODE.code ── RX_DOC(status 发药中/已完成)
--             TRAY_ITEM_CODE.code ── TRAY_DOC(status 摆药中/已完成)
--
-- 状态优先级（同一码只取最先命中者，顺序=生命周期终态优先，与原型减集顺序等价）：
--   ① 已发药（处方/摆药整盒绑定）
--   ② 药房已报损
--   ③ 退回在途（药房已退、库房未收）
--   ④ 药房在架（领用闭环，未被退回/报损/发药）
--   ⑤ 领用在途（出库审核即扣库房账，药房未入库）
--   ⑥ 库房已报损
--   ⑦ 采购已退货
--   ⑧ 库房在架（在入库集合且不在出库集合）
--   ⑨ 未入库/异常码（从未出现在任何已记账单据）
--   另：待出库未过账【不扣账】，账上仍是库房在架，以 draft_bill 列单独标注锁定单号。
--
-- 拆零说明：拆零码(split='是')不整盒离架，按 splitQty 累计达到 DRUGS.minUnit.per 才离架；
--   本 SQL 按「整盒绑定」判定已发药，拆零精确口径见原型 occupiedRxCodes()。
-- ============================================================================

-- ── A. 全量码状态视图 ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW V_CODE_STATUS AS
WITH
rx_busy AS (                                   -- ① 发药/摆药占用（整盒绑定）
  SELECT ric.code FROM RX_ITEM_CODE ric
  JOIN RX_DOC r ON r.rxNo = ric.rxNo
  WHERE r.status IN ('发药中', '已完成') AND (ric.split IS NULL OR ric.split <> '是')
  UNION
  SELECT tic.code FROM TRAY_ITEM_CODE tic
  JOIN TRAY_DOC td ON td.trayNo = tic.trayNo
  WHERE td.status IN ('摆药中', '已完成') AND (tic.split IS NULL OR tic.split <> '是')
),
ph_loss AS (                                   -- ② 药房损耗（已审核）
  SELECT dc.code FROM DOC_CODE dc
  JOIN LOSS_DOC d ON d.billNo = dc.billNo
  WHERE d.nodeKind = '药房损耗' AND d.status = '已审核'
),
ret_pend AS (                                  -- ③ 药房退回待入库
  SELECT dc.code FROM DOC_CODE dc
  JOIN RET_DOC d ON d.retNo = dc.billNo
  WHERE d.status = '待入库'
),
ph_in AS (                                     -- ④ 领用闭环（已入库·待上架/已上架）
  SELECT dc.code, dc.phLoc, d.pharmacy FROM DOC_CODE dc
  JOIN PICK_DOC d ON d.billNo = dc.billNo
  WHERE d.status IN ('已入库·待上架', '已上架')
),
tf_out AS (                                    -- ⑤ 领用在途（已出库·待入库）
  SELECT dc.code, d.billNo, d.pharmacy FROM DOC_CODE dc
  JOIN PICK_DOC d ON d.billNo = dc.billNo
  WHERE d.status = '已出库·待入库'
),
wh_loss AS (                                   -- ⑥ 库房损耗（已审核）
  SELECT dc.code FROM DOC_CODE dc
  JOIN LOSS_DOC d ON d.billNo = dc.billNo
  WHERE (d.nodeKind = '库房损耗' OR d.nodeKind IS NULL) AND d.status = '已审核'
),
po_ret AS (                                    -- ⑦ 采购退货（已审核）
  SELECT dc.code FROM DOC_CODE dc
  JOIN PURCHASE_DOC d ON d.billNo = dc.billNo
  WHERE d.docKind = 'OUT' AND d.audit = '已审核'
),
draft AS (                                     -- 待出库未过账（不扣账，仅标注）
  SELECT dc.code, d.billNo FROM DOC_CODE dc
  JOIN PICK_DOC d ON d.billNo = dc.billNo
  WHERE d.status = '待出库'
),
wh_in AS (                                     -- 库房侧入库事实（已记账）
  SELECT dc.code FROM DOC_CODE dc JOIN PURCHASE_DOC d ON d.billNo = dc.billNo
  WHERE d.docKind = 'IN' AND d.audit = '已审核'
  UNION
  SELECT dc.code FROM DOC_CODE dc JOIN MISC_DOC d ON d.billNo = dc.billNo
  WHERE d.docKind = 'IN' AND d.status = '已审核'
  UNION
  SELECT dc.code FROM DOC_CODE dc JOIN RET_DOC d ON d.retNo = dc.billNo
  WHERE d.status = '已入库'
),
wh_out AS (                                    -- 库房侧出库事实（已记账）
  SELECT dc.code FROM DOC_CODE dc JOIN PURCHASE_DOC d ON d.billNo = dc.billNo
  WHERE d.docKind = 'OUT' AND d.audit = '已审核'
  UNION
  SELECT dc.code FROM DOC_CODE dc JOIN PICK_DOC d ON d.billNo = dc.billNo
  WHERE d.status IN ('已出库·待入库', '已入库·待上架', '已上架')
  UNION
  SELECT dc.code FROM DOC_CODE dc JOIN MISC_DOC d ON d.billNo = dc.billNo
  WHERE d.docKind = 'OUT' AND d.status = '已审核'
  UNION
  SELECT dc.code FROM DOC_CODE dc JOIN LOSS_DOC d ON d.billNo = dc.billNo
  WHERE (d.nodeKind = '库房损耗' OR d.nodeKind IS NULL) AND d.status = '已审核'
)
SELECT
  t.code              AS trace_code,           -- 20 位追溯码
  ic.drugCode         AS drug_code,            -- 药品编码（码⇄药：前 7 位 → IDCODES → DRUGS）
  dg.drugName         AS drug_name,
  t.batch             AS batch,
  t.expDate           AS exp_date,
  t.location          AS wh_location,          -- 库房库位（在架时有效）
  CASE
    WHEN rb.code  IS NOT NULL THEN '已发药'
    WHEN pl.code  IS NOT NULL THEN '药房已报损'
    WHEN rp.code  IS NOT NULL THEN '退回在途'
    WHEN pi.code  IS NOT NULL THEN '药房在架'
    WHEN tf.code  IS NOT NULL THEN '领用在途'
    WHEN wl.code  IS NOT NULL THEN '库房已报损'
    WHEN pr.code  IS NOT NULL THEN '采购已退货'
    WHEN wi.code  IS NOT NULL AND wo.code IS NULL THEN '库房在架'
    ELSE '未入库/异常码'
  END                 AS cur_status,           -- 当前状态（九态取一）
  pi.pharmacy         AS pharmacy,             -- 所在药房（药房在架/领用在途时有效）
  pi.phLoc            AS ph_location,          -- 药房货位（闭环上架后有效）
  df.billNo           AS draft_bill            -- 待出库锁定单号（不扣账，账上仍在架）
FROM TRACE_CODE t
LEFT JOIN IDCODES ic  ON ic.idcode = LEFT(t.code, 7)
LEFT JOIN DRUGS   dg  ON dg.drugCode = ic.drugCode
LEFT JOIN rx_busy rb  ON rb.code = t.code
LEFT JOIN ph_loss pl  ON pl.code = t.code
LEFT JOIN ret_pend rp ON rp.code = t.code
LEFT JOIN ph_in   pi  ON pi.code = t.code
LEFT JOIN tf_out  tf  ON tf.code = t.code
LEFT JOIN wh_loss wl  ON wl.code = t.code
LEFT JOIN po_ret  pr  ON pr.code = t.code
LEFT JOIN draft   df  ON df.code = t.code
LEFT JOIN wh_in   wi  ON wi.code = t.code
LEFT JOIN wh_out  wo  ON wo.code = t.code;

-- ── B. 单码状态查询（传入 20 位追溯码）──────────────────────────────────────
-- 例：查 84147840007702017701 现在什么状态、在哪个节点
SELECT * FROM V_CODE_STATUS
WHERE trace_code = '84147840007702017701';

-- ── C. 单码履历查询（这个码经历了哪些单据，按时间正序）─────────────────────
-- DOC_CODE.billNo 逻辑多态 → 五张单据表逐表 LEFT JOIN，命中即出处
SELECT
  dc.billNo,
  CASE
    WHEN p.billNo  IS NOT NULL THEN CONCAT('采购', IF(p.docKind = 'IN', '入库', '退货'), '·', p.audit)
    WHEN tf.billNo IS NOT NULL THEN CONCAT('领用·', tf.status)
    WHEN rt.retNo  IS NOT NULL THEN CONCAT('药房退回·', rt.status)
    WHEN ls.billNo IS NOT NULL THEN CONCAT('损耗·', COALESCE(ls.nodeKind, '库房损耗'), '·', ls.status)
    WHEN ms.billNo IS NOT NULL THEN CONCAT('其他', IF(ms.docKind = 'IN', '入库', '出库'), '·', ms.status)
    ELSE '未知单据'
  END AS doc_info,
  COALESCE(p.date, tf.date, rt.date, ls.date, ms.date) AS doc_date,
  COALESCE(p.warehouse, tf.warehouse, rt.warehouse, ls.warehouse, ms.warehouse) AS warehouse,
  tf.pharmacy AS to_pharmacy                   -- 领用/退回场景的目的药房
FROM DOC_CODE dc
LEFT JOIN PURCHASE_DOC  p  ON p.billNo  = dc.billNo
LEFT JOIN PICK_DOC      tf ON tf.billNo = dc.billNo
LEFT JOIN RET_DOC       rt ON rt.retNo  = dc.billNo
LEFT JOIN LOSS_DOC      ls ON ls.billNo = dc.billNo
LEFT JOIN MISC_DOC      ms ON ms.billNo = dc.billNo
WHERE dc.code = '84147840007702017701'
ORDER BY doc_date;

-- ── D. 常用变体 ─────────────────────────────────────────────────────────────
-- 某库房在架清单（= 原型库房库存查询事实源）：
--   SELECT * FROM V_CODE_STATUS WHERE cur_status = '库房在架';
-- 某药房在架清单：
--   SELECT * FROM V_CODE_STATUS WHERE cur_status = '药房在架' AND pharmacy = '门诊药房';
-- 待出库锁定的码（账上在架但已被草稿占用，禁止重复扫码）：
--   SELECT * FROM V_CODE_STATUS WHERE draft_bill IS NOT NULL;
-- ============================================================================
