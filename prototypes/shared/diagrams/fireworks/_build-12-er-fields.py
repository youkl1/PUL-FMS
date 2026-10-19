#!/usr/bin/env python3
# _build-12-er-fields.py — 生成 12-er-fields.json（表结构 ER · 关系版）
# 2026-10-05 重构：只要表名 + 作用行 + PK/FK 关联字段；字段级明细见 er/pul-fms-full.sql 与 git 历史
# 灰底 = 派生视图/规划（非物理表）：STOCK_BALANCE（逻辑视图，物化为实现层决策）、SCAN_LOG【规划】
# 标注军规：带标签的竖边间隙必须 ≥40px（30px 实测放不下标签）；字典层级绿边统一不标（图例已说明 1:N）
# 直线军规（2026-10-05 用户拍板「线条尽量用直线」反推的端口规律，渲染器 anchor_on_side 实测确认）：
#   ① 横边：连表头 left/right 端口（锚在表头纵向中心 = top+18），两表头「顶对齐」→ 端口同轴 → bends=0 直线
#   ② 竖边：连表底必须连「末行 bottom」（如 DRUGS_r03）、连表顶连「表头 top」；
#      若连表头 bottom，正下方是自家的行 → 渲染器绕左/右侧画 3 折 U 形（实测 e1 bends=3 绕到 x=36 左边距）
import json

W, H = 320, 26          # 表宽 / 行高
ROW_GAP, HEAD_H, HEAD_GAP = 2, 36, 4

def table(nodes, tid, title, x, y, rows, head_fill, head_stroke, row_stroke="#c9d4e0", desc_fill=None):
    """rows[0] 固定为作用行（desc_fill 浅底），其余为 PK/FK 关联字段行。返回表底 y。"""
    nodes.append({"id": tid, "kind": "rect", "x": x, "y": y, "width": W, "height": HEAD_H,
                  "label": title, "fill": head_fill, "stroke": head_stroke, "stroke_width": 2.0})
    cy = y + HEAD_H + HEAD_GAP
    for i, r in enumerate(rows):
        nodes.append({"id": f"{tid}_r{i+1:02d}", "kind": "rect", "x": x, "y": cy,
                      "width": W, "height": H, "label": r,
                      "fill": (desc_fill if (i == 0 and desc_fill) else "#ffffff"),
                      "stroke": row_stroke, "stroke_width": 1.0, "flat": True,
                      "title_size": 11, "rx": 4})
        cy += H + ROW_GAP
    return cy - ROW_GAP

nodes = []
BLUE, GREEN, ORANGE, GRAY = "#e6f4ff", "#e9f7ee", "#fff7e6", "#f6f8fb"
BLUES, GREENS, ORANGES, GRAYS = "#206bc4", "#2fb344", "#d48806", "#626976"
BLUE_D, GREEN_D, ORANGE_D, GRAY_D = "#f0f7ff", "#f0faf2", "#fffaf0", "#eceff3"

# ===== 列 1（x=60）：药品字典 + 异常留痕 =====
table(nodes, "DRUGS", "DRUGS · 药品主表", 60, 140, [
    "作用：药品档案与换算规则，基本单位在药上",
    "PK drugCode · 药品编码",
    "warehouse → WAREHOUSE · 所属库房",
], BLUE, BLUES, desc_fill=BLUE_D)

table(nodes, "IDCODES", "IDCODES · 标识码子表", 60, 302, [
    "作用：一药多码登记（等级+包装规格）",
    "PK idcode · 7 位标识码",
    "FK drugCode → DRUGS",
], BLUE, BLUES, desc_fill=BLUE_D)

table(nodes, "BAD_CODES", "BAD_CODES · 异常码台账", 60, 454, [
    "作用：解析失败/未维护码台账，维护后回写",
    "PK idcode · 按标识码 upsert",
], ORANGE, ORANGES, desc_fill=ORANGE_D)

table(nodes, "SCAN_LOG", "SCAN_LOG · 扫码留痕【规划】", 60, 580, [
    "作用：全量扫码事件留痕（审计/GSP）",
    "time / device / operator / rawCode / result",
], GRAY, GRAYS, "#d0d5dd", desc_fill=GRAY_D)

# ===== 列 2（x=440）：码实例与派生视图（TRACE_CODE 与 IDCODES 同高 → e2 直线；顶留空给 e6 直线走廊） =====
table(nodes, "TRACE_CODE", "TRACE_CODE · 追溯码实例", 440, 302, [
    "作用：库存载体一码一条，状态由单据推导",
    "PK code · 20 位追溯码",
    "前 7 位 idcode → IDCODES（逻辑 FK）",
    "location → WH_LOCATION · 库位",
], BLUE, BLUES, desc_fill=BLUE_D)

table(nodes, "DOC_CODE", "DOC_CODE · 单据-码清单", 440, 492, [
    "作用：单据⇄码 N:N，带批次/库位快照",
    "PK (billNo, code) · 联合主键",
    "FK billNo → DOC",
    "FK code → TRACE_CODE",
], BLUE, BLUES, desc_fill=BLUE_D)

table(nodes, "STOCK_BALANCE", "STOCK_BALANCE · 药品库存汇总（视图）", 440, 682, [
    "作用：药品口径在架库存，查询入口",
    "(drugCode, warehouse, batch) · 分组键",
    "qty = Σ 在架码 · 由单据集合推导（图 08）",
    "逻辑视图 / 物化汇总表 = 实现层决策",
], GRAY, GRAYS, "#d0d5dd", desc_fill=GRAY_D)

# ===== 列 3（x=820）：申请与单据（REQ_ITEM 顶=DRUGS 顶=140 → e6 直线；DOC 顶=DOC_CODE 顶=492 → e4 直线） =====
table(nodes, "REQ_ITEM", "REQ_ITEM · 申请行", 820, 140, [
    "作用：申请明细，按药品+基本单位计量",
    "PK (reqNo, drugCode) · 联合主键",
    "FK drugCode → DRUGS",
], BLUE, BLUES, desc_fill=BLUE_D)

table(nodes, "REQ", "REQ · 领用申请单", 820, 302, [
    "作用：药房请领，药品口径无码",
    "PK reqNo · 申请单号",
    "pharmacy → PHARMACY",
    "warehouse → WAREHOUSE",
], BLUE, BLUES, desc_fill=BLUE_D)

table(nodes, "DOC", "DOC · 单据（7 类）", 820, 492, [
    "作用：全业务单据事实源，状态机驱动库存",
    "PK billNo · 单号",
    "warehouse → WAREHOUSE",
    "pharmacy → PHARMACY（领用/退回）",
], BLUE, BLUES, desc_fill=BLUE_D)

# ===== 列 4（x=1200）：组织字典（绿边统一不标，图例已说明 1:N） =====
table(nodes, "WAREHOUSE", "WAREHOUSE · 库房", 1200, 140, [
    "作用：库房字典，院区行级隔离",
    "PK code · 类型常温/阴凉/麻精",
], GREEN, GREENS, "#b7e0c4", desc_fill=GREEN_D)

table(nodes, "WH_LOCATION", "WH_LOCATION · 库位", 1200, 258, [
    "作用：库房内存放位置",
    "PK code · 库位",
], GREEN, GREENS, "#b7e0c4", desc_fill=GREEN_D)

table(nodes, "PHARMACY", "PHARMACY · 药房", 1200, 376, [
    "作用：药房字典（门诊/住院/急诊）",
    "PK code",
], GREEN, GREENS, "#b7e0c4", desc_fill=GREEN_D)

table(nodes, "PH_LOCATION", "PH_LOCATION · 货位", 1200, 494, [
    "作用：药房内陈列货位",
    "PK code",
], GREEN, GREENS, "#b7e0c4", desc_fill=GREEN_D)

table(nodes, "CABINET", "CABINET · 取药柜", 1200, 612, [
    "作用：智能取药柜字典（本期新增）",
    "PK code",
    "FK pharmacy → PHARMACY",
], GREEN, GREENS, "#b7e0c4", desc_fill=GREEN_D)

table(nodes, "CAB_CELL", "CAB_CELL · 取药槽", 1200, 758, [
    "作用：柜内最小槽位，经摆药层占用",
    "PK code",
], GREEN, GREENS, "#b7e0c4", desc_fill=GREEN_D)

# ===== NOTE · 设计要点（表格式 4 行，防截断）；y=872 与 STOCK_BALANCE 底(832) 留 40 间隙 =====
NX, NY, NW = 60, 872, 700
nodes.append({"id": "NOTE", "kind": "rect", "x": NX, "y": NY, "width": NW, "height": HEAD_H,
              "label": "NOTE · 设计要点与物理实施口径", "fill": GRAY, "stroke": GRAYS, "stroke_width": 2.0})
for i, t in enumerate([
    "库存无 status · 由单据集合推导（图 08）；查询三层下钻：药品汇总 → 批次 → 码实例",
    "扫码异常三分流：解析失败→BAD_CODES ｜ 退货无库存→PURCHASE_NOSTOCK ｜ 盘点差异→INV_CODE",
    "大表皆 append-only：分区+归档+可全量重算；STOCK_BALANCE 物化后以日结对账兜底",
    "DOC_ITEM（定价/金额行）进 backlog：采购价场景启用时照 RX_ITEM + 行码绑定模式扩展",
]):
    nodes.append({"id": f"NOTE_r{i+1:02d}", "kind": "rect", "x": NX, "y": NY + HEAD_H + HEAD_GAP + i * (H + ROW_GAP),
                  "width": NW, "height": H, "label": t, "fill": "#ffffff",
                  "stroke": "#d0d5dd", "stroke_width": 1.0, "flat": True, "title_size": 11, "rx": 4})

edges = [
    # e1 竖边：连 DRUGS 末行底(220,262) → IDCODES 表头顶(220,302)，间隙 40 → 直线
    {"id": "e1", "source": "DRUGS_r03", "target": "IDCODES", "source_port": "bottom", "target_port": "top",
     "flow": "read", "label": "1:N 一药多码"},
    # e2 横边：IDCODES 顶=TRACE_CODE 顶=302 → 表头 right/left 端口同轴 y=320 → 直线
    {"id": "e2", "source": "IDCODES", "target": "TRACE_CODE", "source_port": "right", "target_port": "left",
     "flow": "read"},
    # e3 竖边：TRACE_CODE 末行底(600,452) → DOC_CODE 表头顶(600,492)，间隙 40 → 直线
    {"id": "e3", "source": "TRACE_CODE_r04", "target": "DOC_CODE", "source_port": "bottom", "target_port": "top",
     "flow": "read", "label": "N:N 码随单转"},
    # e4 横边：DOC 顶=DOC_CODE 顶=492 → 表头 left/right 端口同轴 y=510 → 直线
    {"id": "e4", "source": "DOC", "target": "DOC_CODE", "source_port": "left", "target_port": "right",
     "flow": "read"},
    # e5 竖边（向上）：REQ 表头顶(980,302) → REQ_ITEM 末行底(980,262)，间隙 40 → 直线
    {"id": "e5", "source": "REQ", "target": "REQ_ITEM_r03", "source_port": "top", "target_port": "bottom",
     "flow": "read", "label": "1:N 申请行"},
    # e6 横边：DRUGS 顶=REQ_ITEM 顶=140 → 表头 right/left 端口同轴 y=158 → 直线横跨 col2 上方净空
    {"id": "e6", "source": "DRUGS", "target": "REQ_ITEM", "source_port": "right", "target_port": "left",
     "flow": "read", "label": "1:N 药品口径"},
    # e8 竖边：WAREHOUSE 末行底(1360,234) → WH_LOCATION 表头顶(1360,258)，间隙 24（无标签）→ 直线
    {"id": "e8", "source": "WAREHOUSE_r02", "target": "WH_LOCATION", "source_port": "bottom", "target_port": "top",
     "flow": "control"},
    # e9 竖边：PHARMACY 末行底(1360,470) → PH_LOCATION 表头顶(1360,494)，间隙 24（无标签）→ 直线
    {"id": "e9", "source": "PHARMACY_r02", "target": "PH_LOCATION", "source_port": "bottom", "target_port": "top",
     "flow": "control"},
    # e10：右侧通道距画布边仅 32px，标签放不下 → 不标（CABINET 行内已写 FK pharmacy）；保留右通道 L 绕行
    {"id": "e10", "source": "PHARMACY", "target": "CABINET", "source_port": "right", "target_port": "right",
     "flow": "control", "route_points": [[1548, 430], [1548, 630]]},
    # e11 竖边：CABINET 末行底(1360,734) → CAB_CELL 表头顶(1360,758)，间隙 24（无标签）→ 直线
    {"id": "e11", "source": "CABINET_r03", "target": "CAB_CELL", "source_port": "bottom", "target_port": "top",
     "flow": "control"},
    # e13 L 形（2 折）：DOC 表头 right(1140,510) → 列间通道 x=1170 上行 → WAREHOUSE 表头 left(1200,158)；60px 通道放不下标签，关系见 DOC 行
    {"id": "e13", "source": "DOC", "target": "WAREHOUSE", "source_port": "right", "target_port": "left",
     "flow": "read", "route_points": [[1170, 510], [1170, 158]]},
    # e14 竖边（虚线）：DOC_CODE 末行底(600,642) → STOCK_BALANCE 表头顶(600,682)，间隙 40 → 直线
    {"id": "e14", "source": "DOC_CODE_r04", "target": "STOCK_BALANCE", "source_port": "bottom", "target_port": "top",
     "flow": "data", "dashed": True, "label": "GROUP BY 聚合"},
]

doc = {
    "schema_version": 1,
    "mode": "architecture",
    "template_type": "architecture",
    "style": 1,
    "quality_profile": "standard",
    "text_policy": "strict",
    "width": 1580,
    "height": 1115,
    "title": "表结构 ER（关系版）· 码⇄药⇄单 核心七表 + 组织字典",
    "subtitle": "只列主键与外键 · 字段级见 er/pul-fms-full.sql ｜ 蓝=业务核心 绿=组织字典 橙=异常台账 灰=派生视图/规划（非物理表）",
    "containers": [],
    "nodes": nodes,
    "arrows": edges,
    "legend_orientation": "horizontal",
    "legend_x": 60,
    "legend_y": 1055,
    "legend": [
        {"flow": "read", "label": "外键引用 1:N"},
        {"flow": "control", "label": "字典层级 1:N（绿边不逐个标注）"},
        {"flow": "data", "label": "派生视图（虚线 · 非物理表）"},
    ],
    "footer": "PUL-FMS · 12 表结构 ER（关系版）· fireworks-tech-graph Style 1",
    "footer_x": 48,
    "footer_y": 1085,
}
json.dump(doc, open("12-er-fields.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"nodes={len(nodes)} edges={len(edges)}")
