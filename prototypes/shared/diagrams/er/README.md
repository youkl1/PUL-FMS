# er/ — ER 图一次性美化（DrawDB 路线）

> 选型组合（2026-09-28 定，权威源 `~/.claude/skills/fireworks-tech-graph/SKILL.md` 末节）：
> **字段级 ER 评审图**（长期维护、进图纸库）→ `../fireworks/` 图 12；
> **ER 一次性美化 / 给客户看的漂亮版** → 本目录 DDL → DrawDB 反向出图。

## 两个文件

| 文件 | 范围 | 用途 |
|---|---|---|
| `pul-fms-core.sql` | 核心七表（码⇄药⇄单据，14 表） | 快速演示、字段核实样例 |
| `pul-fms-full.sql` | **全系统 54 表 / 12 域**（架构师修正版） | 全量蓝图、客户评审全貌 |

`pul-fms-full.sql` 相对核心版的架构师修正：
- ① DOC 单表泛化 → 拆 `PURCHASE_DOC`/`PICK_DOC`/`LOSS_DOC`/`MISC_DOC`，共用 `DOC_CODE` 码明细
- ② 处方/摆药码绑定 → 拆 `RX_ITEM_CODE`/`TRAY_ITEM_CODE` 关系表（JSON 仅原型简化）
- ③ 补 组织权限域（8 表，对齐 yudao 五档 DataScope）
- ④ 补 HIS 集成落表（`HIS_RX` 幂等键 + `HIS_PUSH_LOG` 留痕）
- ⑤ 补 药↔槽↔灯 `DRUG_CELL_MAP`（麻精 1 槽 1 药约束）
- ⑥ 补 盘点域 / 医保域（表注释标【规划】）
- 派生不建表：`STOCK_BALANCE` 在架 / `LEDGER` 台账 / `TRACE_LOCATE` 追溯 → 建库用 VIEW/触发器
- **变更记录（2026-10-05）**：领用单物理合并——`REQ`+`REQ_ITEM`+`TRANSFER_DOC` → `PICK_DOC`+`PICK_ITEM`（一单一号全程不换），新增 `PICK_BAD_CODE` 异常码明细、`DOC_CODE.scanHead` 扫码头、`RET_DOC.refNo` 来源领用单号

## 物理实施口径（2026-10-05 评审定，与图12关系版同源）

- **大表皆 append-only**：`SCAN_LOG` 10⁷~10⁸/年 > `DOC_CODE` ~10⁷/年（一码随单流转 2~4 次）> `TRACE_CODE` 10⁶~10⁷/年 > `HIS_PUSH_LOG` 10⁶~10⁷/年 → 按月/季分区 + 归档 + 冷迁；只增不改 ⇒ 派生数据可随时全量重算
- **库存汇总**：逻辑=视图；码量过 10⁶ 后**物化 `STOCK_BALANCE` 汇总表**（药+库房+批次→qty），单据审核事务内 ±qty 维护 + **日结对账**（汇总 vs 码集合重算）兜底
- **查询三层下钻**：药品汇总 → 批次 → 码实例；禁止业务 SQL 直接全扫 `TRACE_CODE`
- **扫码留痕**：`SCAN_LOG`【规划】= 全量事件流（遥测级体量，月分区/时序库）；与三张业务台账互补——解析失败→`BAD_CODES` ｜ 退货无库存→`PURCHASE_NOSTOCK` ｜ 盘点差异→`INV_CODE`
- **backlog**：`DOC_ITEM` 定价/金额行（采购价场景启用时照 `RX_ITEM`+`RX_ITEM_CODE` 模式扩）；`TRACE_CODE` 不建议冗余 status 字段（破坏单事实源）

## 用法

1. 打开 [drawdb.app](https://drawdb.app)（免注册、浏览器本地跑）
2. **File → Import from SQL** → 粘贴 `pul-fms-full.sql` → 方言选 **MySQL**
3. 关系线按 FOREIGN KEY 自动连线（64 条）；拖布局 → Export 为 PNG/SVG

## 踩坑（2026-09-28 首测教训）

- **方言必须用 MySQL**：SQLite 方言的 `--` 行注释 DrawDB 完全不导入 → 图上零中文
- **中文注释写 `COMMENT` 子句**：列级 `COMMENT '...'` + 表级 `COMMENT='...'`，DrawDB 会显示；`--` 注释只给自己看
- DrawDB 自动布局是网格平铺，「结构清晰」靠手动拖拽 + 主题区分组，DDL 帮不上
- **53 表一次导入很挤**：建议按域分批导入（先域 4/5/6/7 核心链，再加权限/设施/发药），或用 DrawDB 的 Area 分组

## 约定

- `pul-fms-full.sql` 是全量唯一事实源；字段口径与各 store 数据文件一致（改了 JS 数据形状要两边同步）
- TRACE_CODE → IDCODES 是「前 7 位逻辑 FK」，DDL 表达不了，DrawDB 里手动画一条或直接看列注释
- 验证（无 MySQL 时的结构 lint）：54 CREATE TABLE / 64 FK / 54 表注释 / 372 列注释 / 括号配平

```bash
python -X utf8 -c 'import re,pathlib; sql=pathlib.Path("pul-fms-full.sql").read_text(encoding="utf-8"); print(len(re.findall(r"CREATE TABLE",sql)), "tables /", len(re.findall(r"FOREIGN KEY",sql)), "FK /", len(re.findall(r"COMMENT",sql)), "comments")'
```
