#!/usr/bin/env python3
# _build-12-er-fields.py — 生成 12-er-fields.json（字段级表结构 ER）
# 表 = 表头节点 + 逐字段行节点堆叠；字段与 prototypes/2026-09/pul-fms-base-v1/scripts/ 数据脚本逐一核实
import json

W, H = 320, 26          # 表宽 / 字段行高
ROW_GAP, HEAD_H, HEAD_GAP = 2, 36, 4

def table(nodes, tid, title, x, y, fields, head_fill, head_stroke, row_stroke="#c9d4e0"):
    nodes.append({"id": tid, "kind": "rect", "x": x, "y": y, "width": W, "height": HEAD_H,
                  "label": title, "fill": head_fill, "stroke": head_stroke, "stroke_width": 2.0})
    cy = y + HEAD_H + HEAD_GAP
    for i, f in enumerate(fields):
        nodes.append({"id": f"{tid}_r{i+1:02d}", "kind": "rect", "x": x, "y": cy,
                      "width": W, "height": H, "label": f, "fill": "#ffffff",
                      "stroke": row_stroke, "stroke_width": 1.0, "flat": True,
                      "title_size": 11, "rx": 4})
        cy += H + ROW_GAP
    return cy - ROW_GAP  # 表底 y

nodes = []
BLUE, GREEN, ORANGE, GRAY = "#e6f4ff", "#e9f7ee", "#fff7e6", "#f6f8fb"
BLUES, GREENS, ORANGES, GRAYS = "#206bc4", "#2fb344", "#d48806", "#626976"

# ===== 列 1（x=60）：药品字典 =====
b1 = table(nodes, "DRUGS", "DRUGS · 药品主表", 60, 150, [
    "PK drugCode · 药品编码 YP010201",
    "drugName · 品名",
    "formSpec · 规格 ｜ dosForm · 剂型",
    "maker · 生产厂家",
    "approval · 批准文号",
    "category · 分类（西药/中成药）",
    "baseUnit · 库存基本单位（换算链尾）",
    "units · 换算链 [{u,eq}] → 1箱=60盒",
    "minUnit · 拆零 {u,per} → 1盒=7片",
    "ipUnpack / opUnpack · 住院/门诊拆零",
    "price · 参考进价",
    "warehouse · 所属库房 →WAREHOUSE",
    "status · 启用 / 停用",
    "同一标识码不同库房分别建档",
], BLUE, BLUES)

b2 = table(nodes, "IDCODES", "IDCODES · 标识码子表", 60, 620, [
    "PK idcode · 7 位标识码 8414784",
    "FK drugCode → DRUGS",
    "level · 码等级（1=盒 2=箱）",
    "packSpec · 包装规格「箱60瓶」",
    "packUnit · 包装单位（规格解析）",
    "status · 启用 / 停用",
], BLUE, BLUES)

b3 = table(nodes, "BAD_CODES", "BAD_CODES · 异常码台账", 60, 866, [
    "PK idcode · 7 位标识码",
    "level · 码等级",
    "drugName / formSpec / packSpec · 快照",
    "maker / approval · 厂家+文号快照",
    "type · 未维护标识码 / 解析失败",
    "维护 → upsert 写回 DRUGS+IDCODES",
], ORANGE, ORANGES)

# ===== 列 2（x=440）：码实例与码清单 =====
b4 = table(nodes, "TRACE_CODE", "TRACE_CODE · 追溯码实例", 440, 150, [
    "PK code · 20 位 = 7标识码+9序列+4校验",
    "→ idcode 前 7 位（逻辑 FK → IDCODES）",
    "batch · 批次号 250702",
    "prodDate · 生产日期",
    "expDate · 有效期至（FEFO 依据）",
    "level · 码等级恒=1（箱/中包码展开入库）",
    "location · 库位 A-01-02 →WH_LOCATION",
    "split / splitQty · 拆零标记+拆零数",
    "checked · 已验收",
    "code2 / code3 · 二三级码（父子关联）",
    "_src · 来源单据（运行时推导）",
    "无 status 字段 · 由单据集合推导（图 08）",
], BLUE, BLUES)

b5 = table(nodes, "DOC_CODE", "DOC_CODE · 单据-码清单", 440, 560, [
    "PK (billNo, code) · 联合主键",
    "FK billNo → DOC",
    "FK code → TRACE_CODE（20 位）",
    "batch / prodDate / expDate · 批次效期快照",
    "location / checked · 库位+验收快照",
    "split / splitQty · 拆零快照",
    "原型内嵌 codes[] · 建库拆关联表",
], BLUE, BLUES)

# ===== 列 3（x=820）：单据与申请 =====
b6 = table(nodes, "DOC", "DOC · 单据（7 类）", 820, 150, [
    "PK billNo · 单号 LYCK20260913001",
    "docType · 7 类（采购入库/领用出库/损耗等）",
    "date · 单据日期",
    "warehouse · 库房 →WAREHOUSE",
    "pharmacy · 药房（领用/退回）→PHARMACY",
    "supplier · 供应商（采购场景）",
    "status · 状态机（未审核/已审核/已出库…）",
    "auditTime / auditor · 审核时间+审核人",
    "operator · 经办人",
    "invoice · 发票号（采购场景）",
    "remark · 备注",
    "申请单另立 REQ（药品口径 · 无码）",
], BLUE, BLUES)

b7 = table(nodes, "REQ", "REQ · 领用申请单", 820, 560, [
    "PK reqNo · 申请单号 LY20260914001",
    "date · 申请日期",
    "pharmacy → PHARMACY",
    "warehouse → WAREHOUSE",
    "applicant · 申请人",
    "status · 待备货 / 已完成",
    "remark · 备注",
], BLUE, BLUES)

b8 = table(nodes, "REQ_ITEM", "REQ_ITEM · 申请行（药品口径）", 820, 830, [
    "PK (reqNo, drugCode) · 联合主键",
    "FK drugCode → DRUGS · 药品+基本单位",
    "qty · 申请数量（基本单位）",
], BLUE, BLUES)

# ===== 列 4（x=1200）：组织字典（关键字段） =====
b9 = table(nodes, "WAREHOUSE", "WAREHOUSE · 库房", 1200, 150, [
    "PK code WH001 · name 中心库",
    "FK org 院区 · type 常温/阴凉/麻精",
    "status · 启用",
], GREEN, GREENS, "#b7e0c4")

b10 = table(nodes, "WH_LOCATION", "WH_LOCATION · 库位", 1200, 310, [
    "PK code A-01-02 · name 库位名",
    "status · 启用",
], GREEN, GREENS, "#b7e0c4")

b11 = table(nodes, "PHARMACY", "PHARMACY · 药房", 1200, 440, [
    "PK code PH001 · name 门诊药房",
    "FK org 院区 · type 门诊/住院/急诊",
    "status · 启用",
], GREEN, GREENS, "#b7e0c4")

b12 = table(nodes, "PH_LOCATION", "PH_LOCATION · 货位", 1200, 600, [
    "PK code M-01 · name 货位名",
    "status · 启用",
], GREEN, GREENS, "#b7e0c4")

b13 = table(nodes, "CABINET", "CABINET · 取药柜（本期字典）", 1200, 730, [
    "PK code CB01 · name 门诊取药柜 1 号",
    "FK pharmacy → PHARMACY",
    "status · 启用 / 停用",
], GREEN, GREENS, "#b7e0c4")

b14 = table(nodes, "CAB_CELL", "CAB_CELL · 取药槽", 1200, 890, [
    "PK code C1-03 · name 1 层 3 槽",
    "status · 空闲 / 占用（经摆药层）",
], GREEN, GREENS, "#b7e0c4")

nodes.append({
    "id": "NOTE", "kind": "review_card", "c4_type": "NOTE · 设计要点",
    "x": 1200, "y": 1030, "width": 320, "height": 92, "label": "设计要点",
    "description": "库存无 status · 由单据集合推导（图 08）｜ 码实例 = 库存载体 ｜ 院区 = org 行级隔离（图 10）",
    "fill": GRAY, "stroke": GRAYS,
})

edges = [
    {"id": "e1", "source": "DRUGS_r14", "target": "IDCODES", "source_port": "bottom", "target_port": "top",
     "flow": "read", "label": "1:N 一药多码"},
    {"id": "e2", "source": "IDCODES_r06", "target": "TRACE_CODE", "source_port": "right", "target_port": "left",
     "flow": "read", "label": "1:N 派生实例", "route_points": [[415, 813], [415, 167]]},
    {"id": "e3", "source": "TRACE_CODE_r12", "target": "DOC_CODE", "source_port": "bottom", "target_port": "top",
     "flow": "read", "label": "N:N 码随单转"},
    {"id": "e4", "source": "DOC", "target": "DOC_CODE", "source_port": "left", "target_port": "right",
     "flow": "read", "route_points": [[790, 167], [790, 578]]},
    {"id": "e5", "source": "REQ_r07", "target": "REQ_ITEM", "source_port": "bottom", "target_port": "top",
     "flow": "read", "label": "1:N 申请行"},
    {"id": "e6", "source": "DRUGS", "target": "REQ_ITEM", "source_port": "right", "target_port": "left",
     "flow": "read", "label": "1:N 药品口径", "route_points": [[395, 167], [395, 848]]},
    {"id": "e8", "source": "WAREHOUSE_r03", "target": "WH_LOCATION", "source_port": "bottom", "target_port": "top",
     "flow": "control", "label": "1:N 库位"},
    {"id": "e9", "source": "PHARMACY_r03", "target": "PH_LOCATION", "source_port": "bottom", "target_port": "top",
     "flow": "control", "label": "1:N 货位"},
    {"id": "e10", "source": "PHARMACY", "target": "CABINET", "source_port": "right", "target_port": "right",
     "flow": "control", "label": "1:N 取药柜", "route_points": [[1548, 501], [1548, 791]]},
    {"id": "e11", "source": "CABINET_r03", "target": "CAB_CELL", "source_port": "bottom", "target_port": "top",
     "flow": "control", "label": "1:N 槽"},
    {"id": "e13", "source": "DOC", "target": "WAREHOUSE", "source_port": "right", "target_port": "left",
     "flow": "read", "label": "warehouse"},
]

doc = {
    "schema_version": 1,
    "mode": "architecture",
    "template_type": "architecture",
    "style": 1,
    "quality_profile": "standard",
    "text_policy": "strict",
    "width": 1580,
    "height": 1180,
    "title": "表结构 ER（字段级）· 码⇄药⇄单 核心七表 + 组织字典",
    "subtitle": "字段与原型数据脚本逐一核实（drug-data / purchase-data / wh-data / facility-data）· PK=主键 FK=外键 · 蓝=业务核心 绿=组织字典 橙=异常台账",
    "containers": [],
    "nodes": nodes,
    "arrows": edges,
    "legend_orientation": "horizontal",
    "legend_x": 60,
    "legend_y": 1120,
    "legend": [
        {"flow": "read", "label": "外键引用 1:N"},
        {"flow": "control", "label": "字典层级 1:N"},
    ],
    "footer": "PUL-FMS · 12 表结构 ER（字段级）· fireworks-tech-graph Style 1",
    "footer_x": 48,
    "footer_y": 1150,
}
json.dump(doc, open("12-er-fields.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"nodes={len(nodes)} edges={len(edges)}")
print("bottoms:", b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, b12, b13, b14)
