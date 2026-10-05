# 领用单统一重构（原型 + SQL 落地图23/24 口径）· 设计稿

> 日期：2026-10-05
> 背景：图23（领用单全链统一状态机）与图24（药房全流程泳道图）已拍板并交付——五态主流水线 + 三入口 + 扫码直生捷径 + 一套四表。本轮把口径**落到原型代码与 SQL**：`reqPool ⋈ pickDocs` 两池并一池、`REQ + TRANSFER_DOC` 两表并一表、状态枚举换血、新增扫码直生捷径。
> 依据：`docs/superpowers/specs/2026-10-04-pick-unified-state-machine-design.md`（五态/三入口/一套四表口径，勿翻案）。

## 一、拍板结论（五问，推荐项已标，用户可否决）

| # | 问题 | 结论（推荐） |
|---|------|------|
| 1 | SQL 合并方式 | **物理合并**：`REQ`+`REQ_ITEM`+`TRANSFER_DOC` → `PICK_DOC`+`PICK_ITEM`。理由：图23 口径是「全程不换表不换单号」，保留两表+视图拼接等于把「申请单/出库单两张单」的旧心智藏进视图层，违背拍板初衷 |
| 2 | 菜单入口 | **保留四个菜单入口**（领用申请单/领用备货单/领用出库单/领用入库单），全部读写同一 `pickDocs` 池、各过滤状态段。理由：角色视角清晰、导航习惯不破、check-prd-menu-sync 零改动；「一套单」体现在数据层而非菜单层 |
| 3 | 「已上架」落库方式 | **推导不落库**：单据 status 只存到「已入库·待上架」，「已上架」= 全部码 `phLoc` 非空时由 `pickStatus()` 推导。理由：码级上架是渐进动作，双写（码 phLoc + 单 status）必然不一致；图23 的第五态在原型里是展示态 |
| 4 | 单号口径 | 一单一号全程不换：有源申请沿用 `LY` 号；无源（库房制单/扫码直生）新单统一 `LY` 前缀。历史种子各保留原号（LY…/LYCK…），演示数据不改号 |
| 5 | 作废与删除 | 待提交=物理删除（草稿不进流水）；待出库=作废（`status='已作废'`，释放码，终态）；已出库起不可作废（逆向走退回/图20） |

## 二、原型数据层（wh-data.js，一处动全身）

### 2.1 单池结构（`pickDocs`，领用单）

```js
{ billNo: 'LY…',            // 统一单号（一单一号全程不换）
  date, pharmacy, warehouse,
  applicant: '',            // 申请人（药房申请/库房制单填）
  operator: '',             // 最近经办人
  source: '药房申请',        // 药房申请 / 库房制单 / 扫码直生
  status: '待提交',          // 待提交/待出库/已出库·待入库/已入库·待上架/已作废（已上架推导）
  remark: '',
  items: [{ drugCode, qty, docQty, slot }],
  //   qty=计划数量（申请填；直生=实扫回填）  docQty=单据数量（扫码折合渐满）  slot=上架货位（可空）
  codes: [{ code, batch, prodDate, expDate, location, checked,
           expectLoc,      // 预期上架货位（item.slot 随单传递）
           phLoc,          // 实际上架货位（''=待上架）
           scanHead,       // 扫码头：库房备货/药房上架/药房直生
           shelfTime }],   // 上架扫码时间
  badCodes: [{ code, reason, stage }],
  //   异常码明细：reason=单外码/解析失败/冻结/非本库房在架；stage=出现环节
  shelfLoc: '',             // 入库时选填的整单上架货位（沿用现口径，仅提示）
  createTime, submitTime, outTime, inTime }   // 时间戳组（上架时间推导=max(codes.shelfTime)）
```

废除字段：`reqNo`（一体化后无外链）。

### 2.2 状态映射（老数据迁移）

| 老（reqPool / pickDocs） | 新（pickDocs） |
|---|---|
| req `待提交`（无 pickDoc） | `待提交`（codes 空） |
| req `待备货` | `待出库`（codes 空） |
| req `备货中` + pickDoc `备货中`（同 reqNo 合并） | `待出库`（带码，docQty 渐满） |
| pickDoc `已出库`（+ req `已完成` 并入） | `已出库·待入库` |
| pickDoc `药房已入库`（+ req `已完成` 并入） | `已入库·待上架`；全部码有 phLoc → 展示「已上架」 |

`migrate()` 升级：检测到旧 `reqPool` 非空或旧状态词（待备货/备货中/已出库/药房已入库）→ 按上表转换并入 `pickDocs`，清空 `reqPool`。幂等（转过的不再转）。

### 2.3 推导与守卫函数调整

| 函数 | 改动 |
|---|---|
| `pickPosted(d)` | `已出库·待入库`/`已入库·待上架`/已上架（推导态）都算已扣账出库 |
| `pickStatus(d)`（新增） | 返回展示态：status + （已入库·待上架 且全码有 phLoc → 已上架） |
| `transitByReq` | `status==='已出库'` → `==='已出库·待入库'` |
| `pharmacyStock` / `findPhCode` | `药房已入库` → `已入库·待上架`（已上架是其子集，天然包含） |
| `phTransit` | 同上改 `已出库·待入库` |
| `stockAll` 头部注释 | 在途/闭环口径注释改五态 |
| 直生（新增）`directPick(pharmacy, warehouse, scannedCodes)` | 无在途单时建单：source=扫码直生、status=已入库·待上架（码带 phLoc→推导已上架）、qty=docQty=实扫折合、createTime=inTime=shelfTime=now；库房在架同扣由 stockAll 推导天然满足 |

## 三、页面改造清单（按流程节点）

| 页面 | 节点 | 改动要点 |
|---|---|---|
| `ph-req.js` | 入口A 申请 | 写 `pickDocs`（不再写 reqPool）；新建=待提交草稿，提交→待出库；状态筛选与徽章改五态；「已完成」列表段改为按推导态展示在途/已入库/已上架 |
| `wh-pick.js` | 备货 | **取消 reqPool⋈pickDocs 拼接**，单池一条链一行；备货=待出库**单内动作**（行内「备货/继续备货」扫码，docQty 渐满，单据状态不变）；新建库房制单=待提交草稿（沿用）；待出库可「作废」 |
| `quick-scan.js` | 快捷扫码 | 备货池过滤 `待出库`；出库审核→`已出库·待入库`（四道闸不变）；不再回写 req.status='已完成' |
| `wh-pick-out.js` | 出库查询/审核 | 状态枚举与徽章改 `已出库·待入库`/`已入库·待上架`（+推导已上架） |
| `ph-req-in.js` | 入库审核 | 列表=`已出库·待入库`；审核入库→`已入库·待上架`（shelfLoc 选填沿用） |
| `ph-shelf.js` | 上架 + **捷径C 直生** | 扫码命中本房在架码→写 phLoc（全码上架→toast 提示已上架）；**扫到本库房在架但无对应单的码→弹确认「直生领用单」→调 `directPick()`**；异常码（非本库房在架/冻结/解析失败）提示拦截并入 badCodes |
| 查询/台账/库存 | 只读对齐 | `wh-out-query.js` `ph-in-query.js` `ledger-data.js` `ph-stock.js` `inv-data.js` 状态词与过滤条件对齐五态 |
| `ph-ret-out.js` | 退回锚点 | 「已入库」锚点改 `已入库·待上架`+已上架（refNo 指向统一单号，字段名不变） |
| 校验脚本 | 断言换血 | `_t-invariants.node.js` `_t-ph-req.js` `_t-ph-req-open.js` `_t-post-assign.node.js` 的 reqPool/状态词断言全部改单池五态 |

## 四、SQL 设计

### 4.1 `pul-fms-full.sql`

```sql
CREATE TABLE `PICK_DOC` (            -- 领用单表头（REQ+TRANSFER_DOC 合并）
  `billNo`     VARCHAR(20) NOT NULL COMMENT '领用单号 LY…（一单一号全程不换）',
  `date`       VARCHAR(20) DEFAULT NULL COMMENT '单据日期',
  `pharmacy`   VARCHAR(20) DEFAULT NULL COMMENT '申请/收货药房',
  `warehouse`  VARCHAR(20) DEFAULT NULL COMMENT '供货库房',
  `applicant`  VARCHAR(30) DEFAULT NULL COMMENT '申请人',
  `source`     VARCHAR(10) DEFAULT NULL COMMENT '来源：药房申请/库房制单/扫码直生',
  `status`     VARCHAR(20) DEFAULT NULL COMMENT '待提交/待出库/已出库·待入库/已入库·待上架/已上架/已作废',
  `shelfLoc`   VARCHAR(20) DEFAULT NULL COMMENT '入库时选填整单上架货位（仅提示）',
  `createTime` VARCHAR(20) DEFAULT NULL COMMENT '创建时间',
  `submitTime` VARCHAR(20) DEFAULT NULL COMMENT '提交时间',
  `outTime`    VARCHAR(20) DEFAULT NULL COMMENT '出库审核时间（审核即扣库房账）',
  `inTime`     VARCHAR(20) DEFAULT NULL COMMENT '入库审核时间（加药房账）',
  `operator`   VARCHAR(30) DEFAULT NULL COMMENT '最近经办人',
  `remark`     VARCHAR(200) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`billNo`),
  CONSTRAINT `fk_PICK_ph_PHARMACY`  FOREIGN KEY (`pharmacy`)  REFERENCES `PHARMACY` (`code`),
  CONSTRAINT `fk_PICK_wh_WAREHOUSE` FOREIGN KEY (`warehouse`) REFERENCES `WAREHOUSE` (`code`)
) ENGINE=InnoDB COMMENT='领用单（一套四表之表头，申请→上架全程同单）';

CREATE TABLE `PICK_ITEM` (           -- 药品清单明细
  `billNo`   VARCHAR(20) NOT NULL COMMENT '所属领用单',
  `drugCode` VARCHAR(20) NOT NULL COMMENT '药品（药品口径 · 无码）',
  `qty`      INT         DEFAULT NULL COMMENT '计划数量（申请填；扫码直生=实扫回填）',
  `docQty`   INT         DEFAULT NULL COMMENT '单据数量（扫码折合渐满）',
  `slot`     VARCHAR(20) DEFAULT NULL COMMENT '上架货位（可空；随单传递到码 expectLoc）',
  PRIMARY KEY (`billNo`, `drugCode`),
  CONSTRAINT `fk_PICK_ITEM_doc_PICK_DOC`   FOREIGN KEY (`billNo`)   REFERENCES `PICK_DOC` (`billNo`),
  CONSTRAINT `fk_PICK_ITEM_drugCode_DRUGS` FOREIGN KEY (`drugCode`) REFERENCES `DRUGS` (`drugCode`)
) ENGINE=InnoDB COMMENT='领用单药品清单明细';
```

- `DOC_CODE`：加 `` `scanHead` VARCHAR(10) COMMENT '扫码头：库房备货/药房上架/药房直生' ``，外键由 TRANSFER_DOC 改指 PICK_DOC（`RET_DOC`/`LOSS_DOC`/`MISC_DOC` 仍用 billNo 关联各自主表，不动）
- 新增 `PICK_BAD_CODE`（billNo+code+reason+stage）——异常追溯码明细，审核闸门拦截依据
- 删除 `REQ`/`REQ_ITEM`/`TRANSFER_DOC` 三表
- `RET_DOC.refNo` 注释改「来源领用单号（PICK_DOC.billNo）」

### 4.2 `pul-fms-code-status.sql`（V_CODE_STATUS 视图）

| 现推导 | 改后 |
|---|---|
| `TRANSFER_DOC.status='已出库'` → 在途 | `PICK_DOC.status='已出库·待入库'` |
| `='药房已入库'` → 药房在架 | `IN ('已入库·待上架','已上架')` |
| `='备货中'` → 备货占用（draft_bill） | `='待出库'` |
| `CONCAT('领用出库·', tf.status)` | `CONCAT('领用·', tf.status)` |

### 4.3 `pul-fms-core.sql`（概念版）

`REQ` 改名 `PICK_DOC`、status 注释改五态；`REQ_ITEM` 改 `PICK_ITEM` 加 `docQty`；`DOC.status` 枚举注释同步；`DOC_CODE` 加 `scanHead`。

## 五、验证口径

- 原型：`_t-invariants.node.js` + `_t-ph-req.js` + `_t-post-assign.node.js` 全绿（断言已随任务更新）；`check-prd-menu-sync.js`（仓库根，菜单不动应零改动）
- 冒烟走查五态全链：申请→提交→备货→出库→入库→上架→（退回锚点）；直生捷径单独走查
- 老数据迁移：清空 localStorage 重来 + 保留旧数据各验一次（migrate 幂等）
- SQL：DrawDB 导入 `pul-fms-full.sql` 无报错（MySQL 方言 + COMMENT 中文口径沿用）
- 提交纪律：文件级 git add，严禁 add -A（工作树压往轮改动）

## 六、开放问题

无。五问推荐项即结论；用户否决任一项则回到本节修订。
