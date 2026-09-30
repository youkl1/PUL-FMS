# PUL-FMS 菜单 ⇄ PRD 总映射

> 用途：PRD 按主菜单结构归档，**一菜单一文件**，文件名 = 菜单 key（与 `prototypes/2026-09/pul-fms-base-v1/scripts/app-shell.js` 的 NAV 配置一一对应）。
> 调整原型菜单后，按本文「同步工作流」同步调整 PRD，并跑校验脚本确认无失配。

---

## 1. 目录与命名约定

```
specs/2026-09/pul-fms/
  README.md                  # 本文件：总映射表 + 约定
  index.md                   # 工作台
  01-org/                    # 组织管理
  02-base/                   # 基础管理
  03-wh/                     # 库房管理
    03a-purchase/            #   采购管理（子组）
    03b-ops/                 #   库房业务（子组）
  04-ph/                     # 药房管理
  05-rx/                     # 发药管理
  06-his/                    # HIS单据
  07-inv/                    # 盘点管理
  08-ledger/                 # 台账管理
  09-mi/                     # 医保管理
  10-sys/                    # 系统管理
  assets/                    # PRD 引用的流程图等（SVG/PNG）
```

- 目录序号与左侧导航顺序一致；只有「库房管理」带二级子组目录。
- 文件名 = NAV 的 `key`（如 `arrive.md`、`orgs.md`），**不用日期前缀**——保证原型改名/挪组时可按 key 稳定匹配。
- 每篇 PRD 顶部必须有 frontmatter（校验脚本依赖）：

```yaml
---
menu_key: orgs            # 必填，= app-shell.js NAV key，同步锚点
menu_group: 组织管理       # 必填
menu_sub: ~               # 库房管理的页面填子组名（采购管理/库房业务），其余填 ~
menu_name: 院区管理        # 必填，= NAV name
prototype: prototypes/2026-09/pul-fms-base-v1/orgs.html   # 原型页路径；菜单 href 为 null 时填 ~
script: prototypes/2026-09/pul-fms-base-v1/scripts/orgs.js # 业务脚本（事实源），无则填 ~
template: maintain        # flow=业务流程类（完整六段）/ maintain=维护查询类（精简）
status: draft             # draft（预览）→ confirmed（已确认）→ word（已出终稿）
version: V0.1
updated: 2026-09-28
---
```

## 2. 模板分级

| 模板 | 适用 | 结构 |
|---|---|---|
| `flow` | 业务操作页（入出库/发药/盘点等，多角色或跨页面流转） | 完整六段；命中流程图信号必须出泳道图（fireworks-tech-graph，存 `assets/`） |
| `maintain` | 维护/查询/字典页（CRUD、列表查询） | 六段骨架精简：无流程图（单页面不触发信号），重点写字段四要素与按钮交互 |

案例：`01-org/orgs.md`（maintain）、`03-wh/03a-purchase/arrive.md`（flow）。

## 3. 总映射表（77 项菜单 + 工作台）

状态：✅ 已写 PRD ｜ ⬜ 待写 ｜ 🚧 菜单待补（原型未做）｜ ⏸️ 占位/预留

> 2026-09-30 Round Z：组名/菜单名对齐客户原文（组序=客户原菜单序，无子组层级；目录名 01-org 等暂不动，仅改映射）。

| 组 | 菜单 | key | 原型页 | PRD 文件 | 状态 |
|---|---|---|---|---|---|
| — | 工作台 | index | index.html | index.md | ⬜ |
| 系统管理 | 权限管理 | perm | perm.html | （待建） | ⬜ |
| 系统管理 | 用户管理 | users | users.html | （待建） | ⬜ |
| 系统管理 | 角色管理 | roles | roles.html | （待建） | ⬜ |
| 系统管理 | 取药柜设置 | cabSet | —（待补） | （待建） | 🚧 |
| 系统管理 | 取药指示灯 | pickLamp | —（待补） | （待建） | 🚧 |
| 系统管理 | 补药灯组设置 | fillLampSet | —（待补） | （待建） | 🚧 |
| 系统管理 | 取药槽灯组对照 | slotLampMap | —（待补） | （待建） | 🚧 |
| 系统管理 | 取药槽药品对照 | slotDrugMap | —（待补） | （待建） | 🚧 |
| 基础管理 | 院区字典维护 | orgs | orgs.html | （待建） | ⬜ |
| 基础管理 | 库房库位维护 | wh | warehouse.html | （待建） | ⬜ |
| 基础管理 | 药房货位维护 | phloc | pharmacy.html | （待建） | ⬜ |
| 基础管理 | 药品字典维护 | drug | drug.html | （待建） | ⬜ |
| 基础管理 | 取药柜维护 | cabinet | cabinet.html | （待建） | ⬜ |
| 基础管理 | 基站灯组维护 | lamp | light.html | （待建） | ⬜ |
| 基础管理 | 药品标识码查询 | idcode | idcode.html | （待建） | ⬜ |
| 基础管理 | 取药槽信息查询 | slotQ | —（待补） | （待建） | 🚧 |
| 基础管理 | 基础字典 | dict | dict-types.html | （待建） | ⬜ |
| 采购管理 | 采购到货单 | arrive | purchase-arrive.html | （待建） | ⬜ |
| 采购管理 | 采购入库单 | pin | purchase-in.html | （待建） | ⬜ |
| 采购管理 | 异常标识码 | badcode | bad-codes.html | （待建） | ⬜ |
| 采购管理 | 入库明细查询 | pquery | purchase-detail.html | （待建） | ⬜ |
| 采购管理 | 采购退货单 | pout | purchase-out.html | （待建） | ⬜ |
| 采购管理 | 退货明细查询 | pOutQ | purchase-out-query.html | （待建） | ⬜ |
| 采购管理 | 已完成单 | pdone | purchase-done.html | （待建） | ⬜ |
| 库房管理 | 库房库存查询 | whstock | wh-stock.html | （待建） | ⬜ |
| 库房管理 | 领用快捷扫码 | quickScan | —（待补） | （待建） | 🚧 |
| 库房管理 | 领用备货单 | pick | wh-pick.html | （待建） | ⬜ |
| 库房管理 | 领用出库单 | pickOut | wh-pick-out.html | 03-wh/03b-ops/pickOut.md | 🚧 |
| 库房管理 | 出库明细查询 | whOutQ | wh-out-query.html | （待建） | ⬜ |
| 库房管理 | 退回入库单 | retIn | wh-return-in.html | （待建） | ⬜ |
| 库房管理 | 其他入库单 | othIn | wh-other-in.html | （待建） | ⬜ |
| 库房管理 | 其他出库单 | othOut | wh-other-out.html | （待建） | ⬜ |
| 药房管理 | 药房库存查询 | phstock | ph-stock.html | （待建） | ⬜ |
| 药房管理 | 领用申请单 | req | ph-req.html | （待建） | ⬜ |
| 药房管理 | 领用入库单 | reqIn | ph-req-in.html | （待建） | ⬜ |
| 药房管理 | 入库明细查询 | phInQ | ph-in-query.html | （待建） | ⬜ |
| 药房管理 | 退回出库单 | retOut | ph-ret-out.html | （待建） | ⬜ |
| 药房管理 | 待上架药品查询 | shelfQ | ph-shelf-q.html | （待建） | ⬜ |
| 药房管理 | 药品扫码上架 | shelf | ph-shelf.html | （待建） | ⬜ |
| 药房管理 | 补药指示灯亮 | light | —（占位） | （待建） | ⏸️ |
| 药房管理 | 药品扫码下架 | shelfOff | —（待补） | 04-ph/shelfOff.md | 🚧 |
| 药房管理 | 药房损耗 | phloss | ph-loss.html | （待建） | ⬜ |
| 出库管理 | 处方发药扫码 | disp | disp.html | （待建） | ⬜ |
| 出库管理 | 处方取药赋码 | assign | —（占位） | （待建） | ⏸️ |
| 出库管理 | 处方单批量赋码 | assignBatch | —（占位） | （待建） | ⏸️ |
| 出库管理 | 处方单赋码查询 | assignQ | —（待补） | （待建） | 🚧 |
| 出库管理 | 赋码异常台账 | rxExc | rx-exc.html | （待写） | 🚧 |
| 出库管理 | 处方药品明细查询 | rxItemQ | rx-item-q.html | （待建） | ⬜ |
| 出库管理 | 处方药品汇总查询 | rxAggQ | rx-agg-q.html | （待建） | ⬜ |
| 出库管理 | 处方单退药 | rxret | rx-ret.html | （待建） | ⬜ |
| 出库管理 | 处方单退药查询 | rxRetQ | rx-ret-q.html | （待建） | ⬜ |
| 出库管理 | 摆药单批量赋码 | tray | tray.html | （待建） | ⬜ |
| 出库管理 | 摆药单赋码查询 | trayAssignQ | —（待补） | 05-rx/trayAssignQ.md | 🚧 |
| 出库管理 | 摆药单明细查询 | trayItemQ | —（待补） | 05-rx/trayItemQ.md | 🚧 |
| 出库管理 | 摆药单汇总查询 | traySumQ | —（待补） | 05-rx/traySumQ.md | 🚧 |
| 出库管理 | 摆药单退药 | trayRet | tray-ret.html | （待建） | ⬜ |
| 出库管理 | 摆药单退药查询 | trayRetQ | tray-ret-q.html | （待建） | ⬜ |
| 出库管理 | 损耗出库单 | lossOut | wh-loss-out.html | （待建） | ⬜ |
| 出库管理 | 损耗明细查询 | lossQ | wh-loss-query.html | （待建） | ⬜ |
| 出库管理 | 病区签收 | wardSign | ward-sign.html | （待建） | ⬜ |
| HIS单据 | HIS处方单查询 | rxQ | —（待补） | （待建） | 🚧 |
| HIS单据 | HIS处方单药品汇总 | rxSum | —（待补） | （待建） | 🚧 |
| HIS单据 | HIS摆药单查询 | trayQ | tray-q.html | （待建） | ⬜ |
| HIS单据 | HIS摆药单药品汇总 | traySum | —（待补） | （待建） | 🚧 |
| 盘点管理 | 期初存量（期初盘点） | invInit | inv-init.html | （待建） | ⬜ |
| 盘点管理 | 药品盘点单 | inv | inv.html | （待建） | ⬜ |
| 盘点管理 | 盘盈入库单 | invGain | inv-gain.html | （待建） | ⬜ |
| 盘点管理 | 盘亏出库单 | invLoss | inv-loss.html | （待建） | ⬜ |
| 盘点管理 | 盈亏明细查询 | invQ | inv-q.html | （待建） | ⬜ |
| 盘点管理 | 盈亏汇总查询 | invSumQ | —（待补） | 07-inv/invSumQ.md | 🚧 |
| 盘点管理 | 无码药品记录 | invNocode | inv-nocode.html | （待建） | ⬜ |
| 台账管理 | 日记账查询 | ledger | ledger.html | （待建） | ⬜ |
| 台账管理 | 月记账查询 | ledgerM | —（待补） | （待建） | 🚧 |
| 台账管理 | 季度账查询 | ledgerQ | —（待补） | （待建） | 🚧 |
| 台账管理 | 追溯码查询 | traceQ | trace-q.html | （待建） | ⬜ |
| 台账管理 | 药品流向查询 | flowQ | flow-q.html | （待建） | ⬜ |
| 医保管理 | 医保上传接口 | miUpload | —（预留） | （待建） | ⏸️ |
| 医保管理 | 上传情况查询 | miUploadQ | —（待补） | （待建） | 🚧 |

## 4. 同步工作流（改原型 ⇄ 改 PRD）

| 原型侧改动 | PRD 侧同步动作 |
|---|---|
| 页面交互/字段调整 | 改对应 `<key>.md` 的功能需求段，`updated` +1 天，版本号 +0.1 |
| 菜单改名（name） | 改 PRD 的 `menu_name` 与标题 |
| 菜单挪组/挪子组 | 移动 PRD 文件到对应目录，改 `menu_group`/`menu_sub` |
| 菜单 key 变更 | PRD 文件改名 + 改 `menu_key`（key 是同步锚点，禁止静默改） |
| 新增菜单 | 建对应 `<key>.md`（选 flow/maintain 模板）+ 更新本表 |
| 菜单下线 | PRD 文件头部标 `status: deprecated` 并注明下线原因，**不直接删文件** |

每次同步后执行校验：

```bash
node scripts/check-prd-menu-sync.js
```

校验内容：① 每个菜单 key 是否有对应 PRD（缺失仅列出，不报错）；② PRD 的 `menu_key` 是否仍存在于 NAV（孤儿 = 报错）；③ `prototype` 路径与 NAV `href` 是否一致（失配 = 报错）；④ `menu_name` 与 NAV `name` 一致性（警告）。

## 5. 写作口径

- **事实源优先级**：页面业务脚本（`scripts/<page>.js`）> 页面「详情」弹窗文案 > 口头描述。脚本与弹窗不一致时以脚本为准，并在 PRD 开放问题中标注弹窗待更新。
- 码/单位口径见项目记忆：基本单位在 `DRUGS.baseUnit`，一级码 = 基本单位。
- 流程图信号（跨页面/多角色/状态流转/链路重构）命中即出泳道图，存 `assets/`，图下附流程节点表。
- 本目录 PRD 均为 Markdown 预览稿；确认后再按 `prd-writer` 技能出 Word 终稿（`status: word`）。

## 6. 批次执行顺序（待办清单，2026-09-28 用户拍板）

> 原则：先字典（引用基础）→ 沿业务链路（采购→库房→药房→发药→盘点）→ 查询类跟随 → 待澄清组压尾。
> 每批闭环：写完 → 跑 `node scripts/check-prd-menu-sync.js` → 确认 → 开下一批。

- [x] 案例：院区管理 orgs + 采购到货 arrive（2026-09-28）
- [x] ① 组织管理 + 基础管理（2026-09-28 完成，wh / phloc / dict / drug / idcode / cabinet / lamp，7 篇）
- [x] ② 库房管理·采购管理（2026-09-28 完成，pin / pout / pdone / badcode / pquery / pOutQ，6 篇 + pin/pout 两张泳道图）
- [ ] ③ 库房管理·库房业务（whstock / pick / retIn / othIn / othOut / lossOut / lossQ / whOutQ，8 篇）
- [ ] ④ 药房管理（phstock / req / reqIn / phInQ / retOut / shelfQ / shelf / light / phloss，9 篇）
- [ ] ⑤ 发药管理（12 篇；assign / assignBatch / assignQ 依赖赋码独立稿先定稿迁入）
- [ ] ⑥ 盘点管理（6 篇）
- [ ] ⑦ HIS单据（4 篇，只读视图，等 ⑤ 口径定稿）
- [ ] ⑧ 系统管理（users / roles / perm，3 篇，与业务解耦可插空）
- [ ] ⑨ 台账管理（5 篇，⚠️ 日/月/季三本账口径待客户确认）
- [ ] ⑩ 医保管理 + 工作台（3 篇；医保=预留项，工作台导览口径收尾写）
