-- ============================================================================
-- PUL-FMS 全量数据模型 DDL（架构师视角 · MySQL 方言 · DrawDB 导入版）
-- ============================================================================
-- 来源：prototypes/2026-09/pul-fms-base-v1/scripts/*.js 全量 store 数据形状核实
-- 覆盖：12 个数据域 / 54 张表（含规划表，表注释标注【规划】）
-- 方言：MySQL 8（中文注释必须 COMMENT 子句，DrawDB 不导入 -- 行注释）
-- 用法：drawdb.app → Import from SQL → 粘贴本文件 → 方言选 MySQL
--
-- 架构师修正（相对图 12 核心七表）：
--   ① DOC 单表泛化 → 拆 PURCHASE_DOC / PICK_DOC / LOSS_DOC / MISC_DOC 四张，
--      共用 DOC_CODE 码明细子表（一类业务一张事实表）
--   ② 处方/摆药 码绑定 → 拆 RX_ITEM_CODE / TRAY_ITEM_CODE 关系表（JSON 仅原型简化）
--   ③ 补 组织权限域（8 表，对齐 yudao 五档 DataScope）
--   ④ 补 HIS 集成层落表（幂等键 hisNo + 推送日志）
--   ⑤ 补 药↔槽↔灯绑定 DRUG_CELL_MAP（麻精 1 槽 1 药约束）
--   ⑥ 补 盘点域 / 医保域（标注【规划】）
-- 派生不建表：STOCK_BALANCE 在架 / LEDGER 流水台账 均为视图推导（见 ledger-data.js）
-- 物理实施口径（2026-10-05 评审定，详见文末「派生视图与物理实施」块）：
--   大表皆 append-only（DOC_CODE/TRACE_CODE/SCAN_LOG…）→ 分区+归档+可全量重算；
--   STOCK_BALANCE 逻辑=视图，码量过 10⁶ 后物化为汇总表（事务内随单据审核 ±qty + 日结对账兜底）
-- ============================================================================

-- ============================================================================
-- 域 1：组织权限（8 表）—— 登录上下文决定数据隔离，第一性不可游离在 ER 外
-- ============================================================================

CREATE TABLE `ORG` (
  `orgNo`    VARCHAR(20)  NOT NULL COMMENT '组织编号 ORG001',
  `orgName`  VARCHAR(100) NOT NULL COMMENT '组织名（云岭总医院）',
  `level`    INT          DEFAULT NULL COMMENT '层级：1集团 2院区',
  `parentNo` VARCHAR(20)  DEFAULT NULL COMMENT '上级组织',
  `appKey`   VARCHAR(64)  DEFAULT NULL COMMENT '中继对接 appKey（脱敏展示）',
  `appSecret` VARCHAR(64) DEFAULT NULL COMMENT '中继对接 appSecret（脱敏展示）',
  `status`   VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`orgNo`),
  CONSTRAINT `fk_ORG_parent_ORG` FOREIGN KEY (`parentNo`) REFERENCES `ORG` (`orgNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='组织/院区';

CREATE TABLE `ORG_NODE` (
  `nodeNo`   VARCHAR(20)  NOT NULL COMMENT '节点编号',
  `nodeName` VARCHAR(100) NOT NULL COMMENT '节点名（中心库/门诊药房）',
  `orgNo`    VARCHAR(20)  NOT NULL COMMENT '所属组织',
  `type`     VARCHAR(20)  DEFAULT NULL COMMENT '节点类型（库房/药房/病区）',
  `status`   VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`nodeNo`),
  CONSTRAINT `fk_ORG_NODE_org_ORG` FOREIGN KEY (`orgNo`) REFERENCES `ORG` (`orgNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='组织L3节点（数据隔离最小单元）';

CREATE TABLE `USER` (
  `userNo`    VARCHAR(20)  NOT NULL COMMENT '用户编号',
  `account`   VARCHAR(50)  NOT NULL COMMENT '登录账号',
  `name`      VARCHAR(50)  NOT NULL COMMENT '姓名',
  `hisNo`     VARCHAR(30)  DEFAULT NULL COMMENT 'HIS工号（对账映射）',
  `phone`     VARCHAR(20)  DEFAULT NULL COMMENT '手机',
  `email`     VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
  `orgNo`     VARCHAR(20)  DEFAULT NULL COMMENT '所属组织',
  `warehouse` VARCHAR(50)  DEFAULT NULL COMMENT '默认库房/药房（登录上下文）',
  `super`     TINYINT      DEFAULT 0 COMMENT '是否超管',
  `status`    VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  `lastLogin` VARCHAR(20)  DEFAULT NULL COMMENT '最后登录时间',
  PRIMARY KEY (`userNo`),
  UNIQUE KEY `uk_USER_account` (`account`),
  CONSTRAINT `fk_USER_org_ORG` FOREIGN KEY (`orgNo`) REFERENCES `ORG` (`orgNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户';

CREATE TABLE `ROLE` (
  `roleCode` VARCHAR(30)  NOT NULL COMMENT '角色编码 SYS_ADMIN/KEEPER/PHARM',
  `roleName` VARCHAR(50)  NOT NULL COMMENT '角色名',
  `dataScope` VARCHAR(20) DEFAULT NULL COMMENT '数据权限档：ALL/CUSTOM/DEPT/DEPT_AND_CHILD/SELF',
  `duty`     VARCHAR(200) DEFAULT NULL COMMENT '职责描述',
  `builtin`  TINYINT      DEFAULT 0 COMMENT '内置角色不可删',
  `status`   VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`roleCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色（对齐 yudao 五档数据权限）';

CREATE TABLE `USER_ROLE` (
  `userNo`   VARCHAR(20) NOT NULL COMMENT '用户',
  `roleCode` VARCHAR(30) NOT NULL COMMENT '角色',
  PRIMARY KEY (`userNo`, `roleCode`),
  CONSTRAINT `fk_USER_ROLE_user_USER` FOREIGN KEY (`userNo`) REFERENCES `USER` (`userNo`),
  CONSTRAINT `fk_USER_ROLE_role_ROLE` FOREIGN KEY (`roleCode`) REFERENCES `ROLE` (`roleCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户↔角色（N:N）';

CREATE TABLE `MENU` (
  `menuNo`   VARCHAR(30)  NOT NULL COMMENT '菜单编号（NAV key）',
  `menuName` VARCHAR(50)  NOT NULL COMMENT '菜单名',
  `parentNo` VARCHAR(30)  DEFAULT NULL COMMENT '父菜单（10组）',
  `path`     VARCHAR(100) DEFAULT NULL COMMENT '路由/页面',
  `ops`      JSON         DEFAULT NULL COMMENT '操作权限数组 [查询,新增,审核]',
  `sort`     INT          DEFAULT NULL COMMENT '排序',
  `status`   VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用/占位/预留',
  PRIMARY KEY (`menuNo`),
  CONSTRAINT `fk_MENU_parent_MENU` FOREIGN KEY (`parentNo`) REFERENCES `MENU` (`menuNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='功能菜单（10组64项，对应 NAV key）';

CREATE TABLE `ROLE_MENU` (
  `roleCode` VARCHAR(30) NOT NULL COMMENT '角色',
  `menuNo`   VARCHAR(30) NOT NULL COMMENT '菜单',
  PRIMARY KEY (`roleCode`, `menuNo`),
  CONSTRAINT `fk_ROLE_MENU_role_ROLE` FOREIGN KEY (`roleCode`) REFERENCES `ROLE` (`roleCode`),
  CONSTRAINT `fk_ROLE_MENU_menu_MENU` FOREIGN KEY (`menuNo`) REFERENCES `MENU` (`menuNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色↔菜单（功能权限，N:N）';

CREATE TABLE `ROLE_SCOPE_NODE` (
  `roleCode` VARCHAR(30) NOT NULL COMMENT '角色',
  `nodeNo`   VARCHAR(20) NOT NULL COMMENT '可见节点（dataScope=CUSTOM 时生效）',
  PRIMARY KEY (`roleCode`, `nodeNo`),
  CONSTRAINT `fk_ROLE_SCOPE_role_ROLE` FOREIGN KEY (`roleCode`) REFERENCES `ROLE` (`roleCode`),
  CONSTRAINT `fk_ROLE_SCOPE_node_ORG_NODE` FOREIGN KEY (`nodeNo`) REFERENCES `ORG_NODE` (`nodeNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='自定义数据范围↔节点';

-- ============================================================================
-- 域 2：字典（2 表）
-- ============================================================================

CREATE TABLE `DICT_TYPE` (
  `typeCode` VARCHAR(30)  NOT NULL COMMENT '字典类型码（药品分类/损耗原因…）',
  `typeName` VARCHAR(50)  NOT NULL COMMENT '字典类型名',
  `level`    VARCHAR(10)  DEFAULT NULL COMMENT '系统/业务',
  `usage`    VARCHAR(200) DEFAULT NULL COMMENT '用途说明',
  `status`   VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`typeCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典类型';

CREATE TABLE `DICT_ITEM` (
  `itemNo`   VARCHAR(30)  NOT NULL COMMENT '字典项编号',
  `typeCode` VARCHAR(30)  NOT NULL COMMENT '所属字典类型',
  `itemName` VARCHAR(50)  NOT NULL COMMENT '字典项名',
  `refs`     INT          DEFAULT 0 COMMENT '被引用次数（>0 不可删除仅停用）',
  `sort`     INT          DEFAULT NULL COMMENT '排序',
  `status`   VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`itemNo`),
  CONSTRAINT `fk_DICT_ITEM_type_DICT_TYPE` FOREIGN KEY (`typeCode`) REFERENCES `DICT_TYPE` (`typeCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典项';

-- ============================================================================
-- 域 3：设施（9 表）—— 库房/库位/药房/货位/取药柜/摆药层/取药槽/基站/灯组
-- ============================================================================

CREATE TABLE `WAREHOUSE` (
  `code`   VARCHAR(20)  NOT NULL COMMENT '库房编码 WH001',
  `name`   VARCHAR(50)  NOT NULL COMMENT '库房名（中心库）',
  `org`    VARCHAR(50)  DEFAULT NULL COMMENT '所属院区（逻辑 FK → ORG）',
  `type`   VARCHAR(20)  DEFAULT NULL COMMENT '常温/阴凉/麻精',
  `status` VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库房';

CREATE TABLE `WH_LOCATION` (
  `code`     VARCHAR(20)  NOT NULL COMMENT '库位编码 A-01-02',
  `name`     VARCHAR(50)  DEFAULT NULL COMMENT '库位名',
  `warehouse` VARCHAR(20) DEFAULT NULL COMMENT '所属库房（原型内嵌，建库外键）',
  `status`   VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`code`),
  CONSTRAINT `fk_WH_LOC_wh_WAREHOUSE` FOREIGN KEY (`warehouse`) REFERENCES `WAREHOUSE` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库位';

CREATE TABLE `PHARMACY` (
  `code`   VARCHAR(20)  NOT NULL COMMENT '药房编码 PH001',
  `name`   VARCHAR(50)  NOT NULL COMMENT '药房名（门诊药房）',
  `org`    VARCHAR(50)  DEFAULT NULL COMMENT '所属院区',
  `type`   VARCHAR(20)  DEFAULT NULL COMMENT '门诊/住院/急诊',
  `status` VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='药房';

CREATE TABLE `PH_LOCATION` (
  `code`     VARCHAR(20)  NOT NULL COMMENT '货位编码 M-01',
  `name`     VARCHAR(50)  DEFAULT NULL COMMENT '货位名',
  `pharmacy` VARCHAR(20)  DEFAULT NULL COMMENT '所属药房（原型内嵌，建库外键）',
  `status`   VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`code`),
  CONSTRAINT `fk_PH_LOC_ph_PHARMACY` FOREIGN KEY (`pharmacy`) REFERENCES `PHARMACY` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='药房货位';

CREATE TABLE `CABINET` (
  `code`     VARCHAR(20) NOT NULL COMMENT '取药柜编码 CB01',
  `name`     VARCHAR(50) DEFAULT NULL COMMENT '门诊取药柜 1 号',
  `pharmacy` VARCHAR(20) DEFAULT NULL COMMENT '所属药房',
  `status`   VARCHAR(10) DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`code`),
  CONSTRAINT `fk_CABINET_pharmacy_PHARMACY` FOREIGN KEY (`pharmacy`) REFERENCES `PHARMACY` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='取药柜';

CREATE TABLE `CAB_LAYER` (
  `code`    VARCHAR(20) NOT NULL COMMENT '摆药层编码 CB01-L1',
  `cabinet` VARCHAR(20) NOT NULL COMMENT '所属取药柜',
  `name`    VARCHAR(50) DEFAULT NULL COMMENT '层名',
  `status`  VARCHAR(10) DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`code`),
  CONSTRAINT `fk_CAB_LAYER_cab_CABINET` FOREIGN KEY (`cabinet`) REFERENCES `CABINET` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='摆药层（柜 1:N 层）';

CREATE TABLE `CAB_CELL` (
  `code`   VARCHAR(20)  NOT NULL COMMENT '槽位编码 C1-03',
  `layer`  VARCHAR(20)  DEFAULT NULL COMMENT '所属摆药层',
  `name`   VARCHAR(50)  DEFAULT NULL COMMENT '槽位名',
  `status` VARCHAR(10)  DEFAULT NULL COMMENT '空闲/占用（经摆药层）',
  PRIMARY KEY (`code`),
  CONSTRAINT `fk_CAB_CELL_layer_CAB_LAYER` FOREIGN KEY (`layer`) REFERENCES `CAB_LAYER` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='取药槽（层 1:N 槽）';

CREATE TABLE `STATION` (
  `code`     VARCHAR(20) NOT NULL COMMENT '基站编码 BS01',
  `name`     VARCHAR(50) DEFAULT NULL COMMENT '基站名',
  `pharmacy` VARCHAR(20) DEFAULT NULL COMMENT '所属药房',
  `status`   VARCHAR(10) DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`code`),
  CONSTRAINT `fk_STATION_ph_PHARMACY` FOREIGN KEY (`pharmacy`) REFERENCES `PHARMACY` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='基站（灯控中枢）';

CREATE TABLE `LAMP` (
  `code`    VARCHAR(20)  NOT NULL COMMENT '灯组编码',
  `station` VARCHAR(20)  DEFAULT NULL COMMENT '所属基站',
  `addr`    VARCHAR(20)  DEFAULT NULL COMMENT '灯组地址',
  `status`  VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`code`),
  CONSTRAINT `fk_LAMP_station_STATION` FOREIGN KEY (`station`) REFERENCES `STATION` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='灯组（基站 1:N 灯）';

-- ============================================================================
-- 域 4：药品主数据（3 表）—— 码⇄药 转换层唯一事实源
-- ============================================================================

CREATE TABLE `DRUGS` (
  `drugCode` VARCHAR(20)  NOT NULL COMMENT '药品编码 YP010201',
  `drugName` VARCHAR(100) NOT NULL COMMENT '品名',
  `formSpec` VARCHAR(50)  DEFAULT NULL COMMENT '规格',
  `dosForm`  VARCHAR(30)  DEFAULT NULL COMMENT '剂型',
  `maker`    VARCHAR(100) DEFAULT NULL COMMENT '生产厂家',
  `approval` VARCHAR(50)  DEFAULT NULL COMMENT '批准文号',
  `category` VARCHAR(20)  DEFAULT NULL COMMENT '分类（西药/中成药）',
  `baseUnit` VARCHAR(10)  DEFAULT NULL COMMENT '库存基本单位（换算链尾）',
  `units`    JSON         DEFAULT NULL COMMENT '换算链 [{u,eq}] → 1箱=60盒',
  `minUnit`  JSON         DEFAULT NULL COMMENT '拆零 {u,per} → 1盒=7片',
  `ipUnpack` TINYINT      DEFAULT NULL COMMENT '住院拆零',
  `opUnpack` TINYINT      DEFAULT NULL COMMENT '门诊拆零',
  `price`    DECIMAL(10,2) DEFAULT NULL COMMENT '参考进价',
  `warehouse` VARCHAR(20) DEFAULT NULL COMMENT '所属库房（同码不同库房分别建档）',
  `status`   VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`drugCode`),
  CONSTRAINT `fk_DRUGS_warehouse_WAREHOUSE` FOREIGN KEY (`warehouse`) REFERENCES `WAREHOUSE` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='药品主表';

CREATE TABLE `IDCODES` (
  `idcode`   VARCHAR(7)   NOT NULL COMMENT '7 位标识码 8414784',
  `drugCode` VARCHAR(20)  NOT NULL COMMENT '所属药品',
  `level`    INT          DEFAULT NULL COMMENT '码等级（1=盒 2=箱）',
  `packSpec` VARCHAR(50)  DEFAULT NULL COMMENT '包装规格「箱60瓶」',
  `packUnit` VARCHAR(20)  DEFAULT NULL COMMENT '包装单位（规格解析）',
  `status`   VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`idcode`),
  CONSTRAINT `fk_IDCODES_drugCode_DRUGS` FOREIGN KEY (`drugCode`) REFERENCES `DRUGS` (`drugCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='标识码子表';

CREATE TABLE `BAD_CODES` (
  `idcode`   VARCHAR(7)   NOT NULL COMMENT '7 位标识码',
  `level`    INT          DEFAULT NULL COMMENT '码等级',
  `drugName` VARCHAR(100) DEFAULT NULL COMMENT '品名快照',
  `formSpec` VARCHAR(50)  DEFAULT NULL COMMENT '规格快照',
  `packSpec` VARCHAR(50)  DEFAULT NULL COMMENT '包装快照',
  `maker`    VARCHAR(100) DEFAULT NULL COMMENT '厂家快照',
  `approval` VARCHAR(50)  DEFAULT NULL COMMENT '文号快照',
  `type`     VARCHAR(30)  DEFAULT NULL COMMENT '未维护标识码/解析失败',
  PRIMARY KEY (`idcode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='异常码台账（维护后 upsert 回 DRUGS+IDCODES）';

CREATE TABLE `SCAN_LOG` (
  `logNo`    VARCHAR(30)  NOT NULL COMMENT '留痕号（雪花/自增）',
  `scanTime` VARCHAR(20)  NOT NULL COMMENT '扫码时间',
  `device`   VARCHAR(30)  DEFAULT NULL COMMENT '设备/工位',
  `operator` VARCHAR(30)  DEFAULT NULL COMMENT '操作人',
  `rawCode`  VARCHAR(40)  NOT NULL COMMENT '原始扫码文本（未解析）',
  `scene`    VARCHAR(20)  DEFAULT NULL COMMENT '场景：入库/验收/上架/出库/发药/盘点…',
  `refBill`  VARCHAR(30)  DEFAULT NULL COMMENT '关联单据号',
  `result`   VARCHAR(10)  DEFAULT NULL COMMENT '成功/失败',
  `reason`   VARCHAR(50)  DEFAULT NULL COMMENT '失败原因（解析失败/未维护/无库存/越场景…）',
  PRIMARY KEY (`logNo`),
  KEY `idx_SCAN_LOG_time` (`scanTime`),
  KEY `idx_SCAN_LOG_raw` (`rawCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='全量扫码留痕【规划】（审计/GSP；遥测级体量，按月分区+归档，或落时序库）';
-- 扫码异常三分流口径：解析失败/未维护→BAD_CODES ｜ 退货无库存→PURCHASE_NOSTOCK ｜ 盘点差异→INV_CODE
-- SCAN_LOG 是全量事件流（每次扫码一行），与三张业务台账（按码/按单聚合）互补不替代

-- ============================================================================
-- 域 5：码实例（1 表）—— 20 位追溯码全集
-- ============================================================================

CREATE TABLE `TRACE_CODE` (
  `code`     VARCHAR(20) NOT NULL COMMENT '20 位 = 7标识码+9序列+4校验（前 7 位逻辑 FK → IDCODES）',
  `batch`    VARCHAR(20) DEFAULT NULL COMMENT '批次号 250702',
  `prodDate` VARCHAR(10) DEFAULT NULL COMMENT '生产日期',
  `expDate`  VARCHAR(10) DEFAULT NULL COMMENT '有效期至（FEFO 依据）',
  `level`    INT         DEFAULT NULL COMMENT '恒=1（箱/中包码展开入库）',
  `location` VARCHAR(20) DEFAULT NULL COMMENT '库位',
  `split`    VARCHAR(2)  DEFAULT NULL COMMENT '拆零标记',
  `splitQty` INT         DEFAULT NULL COMMENT '拆零数',
  `checked`  TINYINT     DEFAULT NULL COMMENT '已验收',
  `code2`    VARCHAR(20) DEFAULT NULL COMMENT '二级码（父子关联）',
  `code3`    VARCHAR(20) DEFAULT NULL COMMENT '三级码',
  PRIMARY KEY (`code`),
  CONSTRAINT `fk_TRACE_CODE_location_WH_LOCATION` FOREIGN KEY (`location`) REFERENCES `WH_LOCATION` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='追溯码实例（无 status，由单据集合推导）';

-- ============================================================================
-- 域 6：采购（4 表）—— 供应商码单池 + 采购单据
-- ============================================================================

CREATE TABLE `ARRIVE_ORDER` (
  `orderNo`   VARCHAR(30)  NOT NULL COMMENT '供应商码单号 204-13824814',
  `orderTime` VARCHAR(20)  DEFAULT NULL COMMENT '单据时间',
  `supplier`  VARCHAR(100) DEFAULT NULL COMMENT '发货企业（供应商）',
  `shipper`   VARCHAR(100) DEFAULT NULL COMMENT '发货企业',
  `receiver`  VARCHAR(100) DEFAULT NULL COMMENT '收货企业（云岭总医院）',
  `docType`   VARCHAR(20)  DEFAULT NULL COMMENT '单据类型（销售出库）',
  `source`    VARCHAR(10)  DEFAULT NULL COMMENT '拉取/推送',
  `confirm`   VARCHAR(10)  DEFAULT NULL COMMENT '确认状态（已确认/未确认）',
  `downloaded` VARCHAR(2)  DEFAULT NULL COMMENT '已下载（已生成入库单）',
  `invoice`   VARCHAR(30)  DEFAULT NULL COMMENT '发票号',
  PRIMARY KEY (`orderNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供应商码单池（中继单向传入）';

CREATE TABLE `ARRIVE_CODE` (
  `orderNo` VARCHAR(30) NOT NULL COMMENT '所属码单',
  `code`    VARCHAR(20) NOT NULL COMMENT '追溯码（20 位）',
  `batch`   VARCHAR(20) DEFAULT NULL COMMENT '批次',
  `prodDate` VARCHAR(10) DEFAULT NULL COMMENT '生产日期',
  `expDate` VARCHAR(10) DEFAULT NULL COMMENT '有效期至',
  PRIMARY KEY (`orderNo`, `code`),
  CONSTRAINT `fk_ARRIVE_CODE_order_ARRIVE` FOREIGN KEY (`orderNo`) REFERENCES `ARRIVE_ORDER` (`orderNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='码单-码清单';

CREATE TABLE `PURCHASE_DOC` (
  `billNo`    VARCHAR(30)  NOT NULL COMMENT '单号（采购入库=到货单号/采购退货单号）',
  `docKind`   VARCHAR(10)  NOT NULL COMMENT 'IN采购入库 / OUT采购退货',
  `date`      VARCHAR(20)  DEFAULT NULL COMMENT '单据日期',
  `supplier`  VARCHAR(100) DEFAULT NULL COMMENT '供应商',
  `invoice`   VARCHAR(30)  DEFAULT NULL COMMENT '发票号',
  `warehouse` VARCHAR(20)  DEFAULT NULL COMMENT '库房',
  `location`  VARCHAR(20)  DEFAULT NULL COMMENT '默认库位',
  `audit`     VARCHAR(10)  DEFAULT NULL COMMENT '未审核/已审核',
  `hisPush`   VARCHAR(10)  DEFAULT NULL COMMENT 'HIS推送状态',
  `downloadTime` VARCHAR(20) DEFAULT NULL COMMENT '下载时间',
  `auditDate` VARCHAR(20)  DEFAULT NULL COMMENT '审核时间',
  `auditor`   VARCHAR(30)  DEFAULT NULL COMMENT '审核人',
  `source`    VARCHAR(10)  DEFAULT NULL COMMENT '下载/手工',
  `remark`    VARCHAR(200) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`billNo`),
  CONSTRAINT `fk_PURCHASE_wh_WAREHOUSE` FOREIGN KEY (`warehouse`) REFERENCES `WAREHOUSE` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='采购单据（入库/退货，审核后写入在架）';

CREATE TABLE `PURCHASE_NOSTOCK` (
  `billNo` VARCHAR(30) NOT NULL COMMENT '所属退货单',
  `code`   VARCHAR(20) NOT NULL COMMENT '无库存码（扫了但库存没有）',
  PRIMARY KEY (`billNo`, `code`),
  CONSTRAINT `fk_PURCH_NOSTOCK_doc_PURCHASE` FOREIGN KEY (`billNo`) REFERENCES `PURCHASE_DOC` (`billNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='退货无库存码清单';

-- ============================================================================
-- 域 7：库房（含单据拆分：领用/损耗/其他出入库 + 退回 + 码明细）
-- ============================================================================

CREATE TABLE `PICK_DOC` (            -- 领用单表头（REQ+TRANSFER_DOC 合并，2026-10-05 两池并一池）
  `billNo`     VARCHAR(20) NOT NULL COMMENT '领用单号 LY…（一单一号全程不换；历史数据保留 LYCK 原号）',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领用单（一套四表之表头，申请→上架全程同单）';

CREATE TABLE `PICK_ITEM` (           -- 药品清单明细
  `billNo`   VARCHAR(20) NOT NULL COMMENT '所属领用单',
  `drugCode` VARCHAR(20) NOT NULL COMMENT '药品（药品口径 · 无码）',
  `qty`      INT         DEFAULT NULL COMMENT '计划数量（申请填；扫码直生=实扫回填）',
  `docQty`   INT         DEFAULT NULL COMMENT '单据数量（扫码折合渐满）',
  `slot`     VARCHAR(20) DEFAULT NULL COMMENT '上架货位（可空；随单传递到码 expectLoc）',
  PRIMARY KEY (`billNo`, `drugCode`),
  CONSTRAINT `fk_PICK_ITEM_doc_PICK_DOC`   FOREIGN KEY (`billNo`)   REFERENCES `PICK_DOC` (`billNo`),
  CONSTRAINT `fk_PICK_ITEM_drugCode_DRUGS` FOREIGN KEY (`drugCode`) REFERENCES `DRUGS` (`drugCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领用单药品清单明细';

CREATE TABLE `PICK_BAD_CODE` (       -- 异常码明细（审核闸门拦截依据）
  `billNo` VARCHAR(20) NOT NULL COMMENT '所属领用单',
  `code`   VARCHAR(20) NOT NULL COMMENT '异常追溯码',
  `reason` VARCHAR(50) DEFAULT NULL COMMENT '单外码/解析失败/冻结/非本库房在架',
  `stage`  VARCHAR(10) DEFAULT NULL COMMENT '出现环节：库房备货/药房上架/药房直生',
  PRIMARY KEY (`billNo`, `code`),
  CONSTRAINT `fk_PICK_BAD_doc_PICK_DOC` FOREIGN KEY (`billNo`) REFERENCES `PICK_DOC` (`billNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领用单异常追溯码明细';

CREATE TABLE `RET_DOC` (
  `retNo`     VARCHAR(20) NOT NULL COMMENT '退回单号 TH...',
  `date`      VARCHAR(20) DEFAULT NULL COMMENT '退回日期',
  `pharmacy`  VARCHAR(20) DEFAULT NULL COMMENT '退回药房',
  `warehouse` VARCHAR(20) DEFAULT NULL COMMENT '接收库房',
  `operator`  VARCHAR(30) DEFAULT NULL COMMENT '经办人',
  `status`    VARCHAR(10) DEFAULT NULL COMMENT '待入库/已入库',
  `refNo`     VARCHAR(20) DEFAULT NULL COMMENT '来源领用单号（PICK_DOC.billNo；库房直收为空）',
  `remark`    VARCHAR(200) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`retNo`),
  CONSTRAINT `fk_RET_ph_PHARMACY`  FOREIGN KEY (`pharmacy`)  REFERENCES `PHARMACY` (`code`),
  CONSTRAINT `fk_RET_wh_WAREHOUSE` FOREIGN KEY (`warehouse`) REFERENCES `WAREHOUSE` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='药房退回单（待库房接收入库）';

CREATE TABLE `LOSS_DOC` (
  `billNo`    VARCHAR(20) NOT NULL COMMENT '损耗出库单号 SHCK/YFSH...',
  `nodeKind`  VARCHAR(10) DEFAULT NULL COMMENT '库房损耗/药房损耗',
  `date`      VARCHAR(20) DEFAULT NULL COMMENT '日期',
  `reason`    VARCHAR(20) DEFAULT NULL COMMENT '破损/过期/污染/其他',
  `source`    VARCHAR(20) DEFAULT NULL COMMENT '日常报损/盘亏转入/数据迁移',
  `warehouse` VARCHAR(20) DEFAULT NULL COMMENT '库房',
  `pharmacy`  VARCHAR(20) DEFAULT NULL COMMENT '药房（药房损耗时）',
  `status`    VARCHAR(10) DEFAULT NULL COMMENT '未审核/已审核',
  `auditTime` VARCHAR(20) DEFAULT NULL COMMENT '审核时间',
  `auditor`   VARCHAR(30) DEFAULT NULL COMMENT '审核人',
  `remark`    VARCHAR(200) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`billNo`),
  CONSTRAINT `fk_LOSS_wh_WAREHOUSE` FOREIGN KEY (`warehouse`) REFERENCES `WAREHOUSE` (`code`),
  CONSTRAINT `fk_LOSS_ph_PHARMACY`  FOREIGN KEY (`pharmacy`)  REFERENCES `PHARMACY` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='损耗出库单（库房/药房两态，原因字典驱动）';

CREATE TABLE `MISC_DOC` (
  `billNo`    VARCHAR(20) NOT NULL COMMENT '其他出入库单号 QTRK/QTCK...',
  `docKind`   VARCHAR(10) NOT NULL COMMENT 'IN其他入库 / OUT其他出库',
  `date`      VARCHAR(20) DEFAULT NULL COMMENT '日期',
  `type`      VARCHAR(20) DEFAULT NULL COMMENT '赠品入库/期初补录/借出/样品/其他',
  `warehouse` VARCHAR(20) DEFAULT NULL COMMENT '库房',
  `status`    VARCHAR(10) DEFAULT NULL COMMENT '未审核/已审核',
  `auditTime` VARCHAR(20) DEFAULT NULL COMMENT '审核时间',
  `auditor`   VARCHAR(30) DEFAULT NULL COMMENT '审核人',
  `remark`    VARCHAR(200) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`billNo`),
  CONSTRAINT `fk_MISC_wh_WAREHOUSE` FOREIGN KEY (`warehouse`) REFERENCES `WAREHOUSE` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='其他出入库单（IO_TYPE 业务化子集）';

CREATE TABLE `DOC_CODE` (
  `billNo`   VARCHAR(30) NOT NULL COMMENT '所属单据（采购/领用/退回/损耗/其他任一）',
  `code`     VARCHAR(20) NOT NULL COMMENT '追溯码（20 位）',
  `batch`    VARCHAR(20) DEFAULT NULL COMMENT '批次快照',
  `prodDate` VARCHAR(10) DEFAULT NULL COMMENT '生产日期快照',
  `expDate`  VARCHAR(10) DEFAULT NULL COMMENT '效期快照',
  `location` VARCHAR(20) DEFAULT NULL COMMENT '库位快照',
  `phLoc`    VARCHAR(20) DEFAULT NULL COMMENT '药房货位（领用闭环上架后）',
  `expectLoc` VARCHAR(20) DEFAULT NULL COMMENT '预期上架货位（申请行 slot 随单传递）',
  `scanHead` VARCHAR(10) DEFAULT NULL COMMENT '扫码头：库房备货/药房上架/药房直生',
  `checked`  TINYINT     DEFAULT NULL COMMENT '验收快照',
  `split`    VARCHAR(2)  DEFAULT NULL COMMENT '拆零快照',
  `splitQty` INT         DEFAULT NULL COMMENT '拆零数快照',
  PRIMARY KEY (`billNo`, `code`),
  CONSTRAINT `fk_DOC_CODE_code_TRACE_CODE` FOREIGN KEY (`code`) REFERENCES `TRACE_CODE` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单据-码明细（四张单据表共用，billNo 逻辑多态）';

-- ============================================================================
-- 域 8：发药（10 表）—— HIS 池 + 处方/摆药单 + 退药（码绑定拆关系表）
-- ============================================================================

CREATE TABLE `RX_DOC` (
  `rxNo`     VARCHAR(20)  NOT NULL COMMENT '处方单号 CF...',
  `hisNo`    VARCHAR(30)  DEFAULT NULL COMMENT 'HIS流水号（幂等键）',
  `date`     VARCHAR(20)  DEFAULT NULL COMMENT '开方日期',
  `pharmacy` VARCHAR(20)  DEFAULT NULL COMMENT '发药药房',
  `visitType` VARCHAR(10) DEFAULT NULL COMMENT '门诊/住院',
  `dept`     VARCHAR(50)  DEFAULT NULL COMMENT '科室',
  `patientId` VARCHAR(20) DEFAULT NULL COMMENT '患者ID',
  `patient`  VARCHAR(50)  DEFAULT NULL COMMENT '患者姓名',
  `sex`      VARCHAR(4)   DEFAULT NULL COMMENT '性别',
  `age`      INT          DEFAULT NULL COMMENT '年龄',
  `status`   VARCHAR(10)  DEFAULT NULL COMMENT '待发药/发药中/已完成/已退药',
  `startTime` VARCHAR(20) DEFAULT NULL COMMENT '开始发药',
  `doneTime` VARCHAR(20)  DEFAULT NULL COMMENT '完成时间',
  `operator` VARCHAR(30)  DEFAULT NULL COMMENT '发药人',
  PRIMARY KEY (`rxNo`),
  CONSTRAINT `fk_RX_ph_PHARMACY` FOREIGN KEY (`pharmacy`) REFERENCES `PHARMACY` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='处方发药单';

CREATE TABLE `RX_ITEM` (
  `rxNo`     VARCHAR(20) NOT NULL COMMENT '所属处方单',
  `drugCode` VARCHAR(20) NOT NULL COMMENT '药品',
  `qty`      INT         DEFAULT NULL COMMENT '应发数量',
  `unit`     VARCHAR(10) DEFAULT NULL COMMENT '单位',
  PRIMARY KEY (`rxNo`, `drugCode`),
  CONSTRAINT `fk_RX_ITEM_rx_RX`        FOREIGN KEY (`rxNo`)     REFERENCES `RX_DOC` (`rxNo`),
  CONSTRAINT `fk_RX_ITEM_drug_DRUGS`   FOREIGN KEY (`drugCode`) REFERENCES `DRUGS` (`drugCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='处方行';

CREATE TABLE `RX_ITEM_CODE` (
  `rxNo`     VARCHAR(20) NOT NULL COMMENT '所属处方单',
  `drugCode` VARCHAR(20) NOT NULL COMMENT '处方行药品',
  `code`     VARCHAR(20) NOT NULL COMMENT '绑定追溯码',
  `split`    VARCHAR(2)  DEFAULT NULL COMMENT '拆零标记（拆零码不占整数量）',
  PRIMARY KEY (`rxNo`, `drugCode`, `code`),
  CONSTRAINT `fk_RXIC_item_RX_ITEM` FOREIGN KEY (`rxNo`, `drugCode`) REFERENCES `RX_ITEM` (`rxNo`, `drugCode`),
  CONSTRAINT `fk_RXIC_code_TRACE`   FOREIGN KEY (`code`) REFERENCES `TRACE_CODE` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='处方行-码绑定（原型内嵌 codes[]，建库拆关系表）';

CREATE TABLE `RX_RET` (
  `retNo`    VARCHAR(20)  NOT NULL COMMENT '退药单号 CFTH...',
  `rxNo`     VARCHAR(20)  DEFAULT NULL COMMENT '原处方单',
  `date`     VARCHAR(20)  DEFAULT NULL COMMENT '退药时间',
  `pharmacy` VARCHAR(20)  DEFAULT NULL COMMENT '退药药房',
  `patient`  VARCHAR(50)  DEFAULT NULL COMMENT '患者',
  `reason`   VARCHAR(30)  DEFAULT NULL COMMENT '退药原因',
  `status`   VARCHAR(10)  DEFAULT NULL COMMENT '已退药',
  `operator` VARCHAR(30)  DEFAULT NULL COMMENT '操作人',
  `remark`   VARCHAR(200) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`retNo`),
  CONSTRAINT `fk_RXRET_rx_RX`       FOREIGN KEY (`rxNo`)     REFERENCES `RX_DOC` (`rxNo`),
  CONSTRAINT `fk_RXRET_ph_PHARMACY` FOREIGN KEY (`pharmacy`) REFERENCES `PHARMACY` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='处方退药单（CFTH 台账）';

CREATE TABLE `RX_RET_CODE` (
  `retNo` VARCHAR(20) NOT NULL COMMENT '所属退药单',
  `code`  VARCHAR(20) NOT NULL COMMENT '退回追溯码',
  PRIMARY KEY (`retNo`, `code`),
  CONSTRAINT `fk_RXRETC_ret_RX_RET` FOREIGN KEY (`retNo`) REFERENCES `RX_RET` (`retNo`),
  CONSTRAINT `fk_RXRETC_code_TRACE` FOREIGN KEY (`code`)  REFERENCES `TRACE_CODE` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='退药-码清单（退回码回药房在架）';

CREATE TABLE `TRAY_DOC` (
  `trayNo`    VARCHAR(20)  NOT NULL COMMENT '摆药单号 BY...',
  `hisNo`     VARCHAR(30)  DEFAULT NULL COMMENT 'HIS摆药流水（幂等键）',
  `date`      VARCHAR(20)  DEFAULT NULL COMMENT '摆药日期',
  `pharmacy`  VARCHAR(20)  DEFAULT NULL COMMENT '摆药药房',
  `ward`      VARCHAR(50)  DEFAULT NULL COMMENT '病区',
  `bed`       VARCHAR(10)  DEFAULT NULL COMMENT '床号',
  `inpatientNo` VARCHAR(20) DEFAULT NULL COMMENT '住院号',
  `patientId` VARCHAR(20)  DEFAULT NULL COMMENT '患者ID',
  `patient`   VARCHAR(50)  DEFAULT NULL COMMENT '患者姓名',
  `sex`       VARCHAR(4)   DEFAULT NULL COMMENT '性别',
  `age`       INT          DEFAULT NULL COMMENT '年龄',
  `status`    VARCHAR(10)  DEFAULT NULL COMMENT '待摆药/摆药中/已完成/已退药',
  `signedAt`  VARCHAR(20)  DEFAULT NULL COMMENT '病区签收时间',
  `startTime` VARCHAR(20)  DEFAULT NULL COMMENT '开始摆药',
  `doneTime`  VARCHAR(20)  DEFAULT NULL COMMENT '完成时间',
  `operator`  VARCHAR(30)  DEFAULT NULL COMMENT '摆药人',
  PRIMARY KEY (`trayNo`),
  CONSTRAINT `fk_TRAY_ph_PHARMACY` FOREIGN KEY (`pharmacy`) REFERENCES `PHARMACY` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='摆药单（住院发药）';

CREATE TABLE `TRAY_ITEM` (
  `trayNo`   VARCHAR(20) NOT NULL COMMENT '所属摆药单',
  `drugCode` VARCHAR(20) NOT NULL COMMENT '药品',
  `qty`      INT         DEFAULT NULL COMMENT '应摆数量',
  `unit`     VARCHAR(10) DEFAULT NULL COMMENT '单位',
  `shortage` TINYINT     DEFAULT 0 COMMENT '缺药标记',
  PRIMARY KEY (`trayNo`, `drugCode`),
  CONSTRAINT `fk_TRAY_ITEM_tray_TRAY`  FOREIGN KEY (`trayNo`)   REFERENCES `TRAY_DOC` (`trayNo`),
  CONSTRAINT `fk_TRAY_ITEM_drug_DRUGS` FOREIGN KEY (`drugCode`) REFERENCES `DRUGS` (`drugCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='摆药行';

CREATE TABLE `TRAY_ITEM_CODE` (
  `trayNo`   VARCHAR(20) NOT NULL COMMENT '所属摆药单',
  `drugCode` VARCHAR(20) NOT NULL COMMENT '摆药行药品',
  `code`     VARCHAR(20) NOT NULL COMMENT '绑定追溯码',
  `cellCode` VARCHAR(20) DEFAULT NULL COMMENT '落槽槽位（设备联动）',
  `split`    VARCHAR(2)  DEFAULT NULL COMMENT '拆零标记',
  PRIMARY KEY (`trayNo`, `drugCode`, `code`),
  CONSTRAINT `fk_TRAYIC_item_TRAY_ITEM` FOREIGN KEY (`trayNo`, `drugCode`) REFERENCES `TRAY_ITEM` (`trayNo`, `drugCode`),
  CONSTRAINT `fk_TRAYIC_code_TRACE`     FOREIGN KEY (`code`) REFERENCES `TRACE_CODE` (`code`),
  CONSTRAINT `fk_TRAYIC_cell_CAB_CELL`  FOREIGN KEY (`cellCode`) REFERENCES `CAB_CELL` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='摆药行-码绑定（含落槽槽位，设备联动）';

CREATE TABLE `TRAY_RET` (
  `retNo`    VARCHAR(20)  NOT NULL COMMENT '摆药退药单号 BYTH...',
  `trayNo`   VARCHAR(20)  DEFAULT NULL COMMENT '原摆药单',
  `date`     VARCHAR(20)  DEFAULT NULL COMMENT '退药时间',
  `pharmacy` VARCHAR(20)  DEFAULT NULL COMMENT '退药药房',
  `patient`  VARCHAR(50)  DEFAULT NULL COMMENT '患者',
  `ward`     VARCHAR(50)  DEFAULT NULL COMMENT '病区',
  `type`     VARCHAR(10)  DEFAULT NULL COMMENT '整单退/部分退',
  `reason`   VARCHAR(30)  DEFAULT NULL COMMENT '退药原因（病区拒收/患者出院/医嘱停改/其他）',
  `status`   VARCHAR(10)  DEFAULT NULL COMMENT '已退药',
  `operator` VARCHAR(30)  DEFAULT NULL COMMENT '操作人',
  PRIMARY KEY (`retNo`),
  CONSTRAINT `fk_TRAYRET_tray_TRAY`   FOREIGN KEY (`trayNo`)   REFERENCES `TRAY_DOC` (`trayNo`),
  CONSTRAINT `fk_TRAYRET_ph_PHARMACY` FOREIGN KEY (`pharmacy`) REFERENCES `PHARMACY` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='摆药退药单（BYTH 台账，支持部分退）';

CREATE TABLE `TRAY_RET_CODE` (
  `retNo` VARCHAR(20) NOT NULL COMMENT '所属退药单',
  `code`  VARCHAR(20) NOT NULL COMMENT '退回追溯码（部分退=子集）',
  PRIMARY KEY (`retNo`, `code`),
  CONSTRAINT `fk_TRAYRETC_ret_TRAY_RET` FOREIGN KEY (`retNo`) REFERENCES `TRAY_RET` (`retNo`),
  CONSTRAINT `fk_TRAYRETC_code_TRACE`   FOREIGN KEY (`code`)  REFERENCES `TRACE_CODE` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='摆药退药-码清单（退回码释放占用回在架）';

-- ============================================================================
-- 域 9：HIS 集成（3 表）—— 幂等 + 推送留痕
-- ============================================================================

CREATE TABLE `HIS_RX` (
  `hisNo`    VARCHAR(30)  NOT NULL COMMENT 'HIS流水号（幂等键）',
  `rxNo`     VARCHAR(20)  DEFAULT NULL COMMENT '处方号 CF...',
  `date`     VARCHAR(20)  DEFAULT NULL COMMENT '开方日期',
  `pharmacy` VARCHAR(20)  DEFAULT NULL COMMENT '目标药房',
  `visitType` VARCHAR(10) DEFAULT NULL COMMENT '门诊/住院',
  `dept`     VARCHAR(50)  DEFAULT NULL COMMENT '科室',
  `patientId` VARCHAR(20) DEFAULT NULL COMMENT '患者ID',
  `patient`  VARCHAR(50)  DEFAULT NULL COMMENT '患者',
  `pulled`   TINYINT      DEFAULT 0 COMMENT '已拉取（生成处方发药单）',
  PRIMARY KEY (`hisNo`),
  CONSTRAINT `fk_HISRX_ph_PHARMACY` FOREIGN KEY (`pharmacy`) REFERENCES `PHARMACY` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HIS处方池（拉取只锁药品级数量）';

CREATE TABLE `HIS_RX_ITEM` (
  `hisNo`    VARCHAR(30) NOT NULL COMMENT '所属HIS处方',
  `drugCode` VARCHAR(20) NOT NULL COMMENT '药品',
  `qty`      INT         DEFAULT NULL COMMENT '数量',
  `unit`     VARCHAR(10) DEFAULT NULL COMMENT '单位',
  PRIMARY KEY (`hisNo`, `drugCode`),
  CONSTRAINT `fk_HISRXITEM_his_HIS_RX` FOREIGN KEY (`hisNo`)    REFERENCES `HIS_RX` (`hisNo`),
  CONSTRAINT `fk_HISRXITEM_drug_DRUGS` FOREIGN KEY (`drugCode`) REFERENCES `DRUGS` (`drugCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HIS处方行';

CREATE TABLE `HIS_PUSH_LOG` (
  `logNo`    VARCHAR(30)  NOT NULL COMMENT '日志号',
  `hisNo`    VARCHAR(30)  DEFAULT NULL COMMENT 'HIS流水（幂等键）',
  `billNo`   VARCHAR(30)  DEFAULT NULL COMMENT '关联业务单号',
  `direction` VARCHAR(10) DEFAULT NULL COMMENT 'PUSH推送 / PULL拉取',
  `bizType`  VARCHAR(20)  DEFAULT NULL COMMENT '业务类型（发药回传/退药回传）',
  `payload`  JSON         DEFAULT NULL COMMENT '报文快照',
  `result`   VARCHAR(10)  DEFAULT NULL COMMENT '成功/失败',
  `retryCnt` INT          DEFAULT 0 COMMENT '重试次数',
  `createTime` VARCHAR(20) DEFAULT NULL COMMENT '时间',
  PRIMARY KEY (`logNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HIS推送/拉取日志（对账留痕+幂等）';

-- ============================================================================
-- 域 10：盘点（3 表）
-- ============================================================================

CREATE TABLE `INV_DOC` (
  `billNo`    VARCHAR(20) NOT NULL COMMENT '盘点单号 PD.../期初 QC...',
  `date`      VARCHAR(20) DEFAULT NULL COMMENT '盘点日期',
  `type`      VARCHAR(10) DEFAULT NULL COMMENT '盘点/期初',
  `kind`      VARCHAR(10) DEFAULT NULL COMMENT '库房/药房',
  `node`      VARCHAR(50) DEFAULT NULL COMMENT '盘点节点（中心库/门诊药房）',
  `status`    VARCHAR(10) DEFAULT NULL COMMENT '盘点中/已完成',
  `gainPosted` TINYINT    DEFAULT 0 COMMENT '盘盈已过账',
  `lossPosted` TINYINT    DEFAULT 0 COMMENT '盘亏已过账',
  `auditor`   VARCHAR(30) DEFAULT NULL COMMENT '审核人',
  `remark`    VARCHAR(200) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`billNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='盘点单（多扫=盘盈，少扫=盘亏）';

CREATE TABLE `INV_CODE` (
  `billNo` VARCHAR(20) NOT NULL COMMENT '所属盘点单',
  `code`   VARCHAR(20) NOT NULL COMMENT '追溯码',
  `src`    VARCHAR(10) DEFAULT NULL COMMENT 'SYS账存快照 / SCAN实扫',
  `batch`  VARCHAR(20) DEFAULT NULL COMMENT '批次',
  `expDate` VARCHAR(10) DEFAULT NULL COMMENT '效期',
  PRIMARY KEY (`billNo`, `code`, `src`),
  CONSTRAINT `fk_INV_CODE_doc_INV_DOC` FOREIGN KEY (`billNo`) REFERENCES `INV_DOC` (`billNo`),
  CONSTRAINT `fk_INV_CODE_code_TRACE`  FOREIGN KEY (`code`)   REFERENCES `TRACE_CODE` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='盘点码对照（sysCodes 快照 vs scanned 实扫）';

CREATE TABLE `NOCODE_REC` (
  `recNo`    VARCHAR(20)  NOT NULL COMMENT '无码记录号 WM...',
  `date`     VARCHAR(20)  DEFAULT NULL COMMENT '日期',
  `node`     VARCHAR(50)  DEFAULT NULL COMMENT '节点',
  `drugCode` VARCHAR(20)  DEFAULT NULL COMMENT '药品',
  `qty`      INT          DEFAULT NULL COMMENT '数量',
  `unit`     VARCHAR(10)  DEFAULT NULL COMMENT '单位',
  `reason`   VARCHAR(50)  DEFAULT NULL COMMENT '无码原因（中药饮片/拆零制剂）',
  `remark`   VARCHAR(200) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`recNo`),
  CONSTRAINT `fk_NOCODE_drug_DRUGS` FOREIGN KEY (`drugCode`) REFERENCES `DRUGS` (`drugCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='无码药品台账（无码部分的出入补录）';

-- ============================================================================
-- 域 11：设备绑定（1 表）—— 药↔槽↔灯（智能取药柜核心）
-- ============================================================================

CREATE TABLE `DRUG_CELL_MAP` (
  `drugCode` VARCHAR(20) NOT NULL COMMENT '药品',
  `cellCode` VARCHAR(20) NOT NULL COMMENT '取药槽',
  `slotType` VARCHAR(10) DEFAULT NULL COMMENT '主槽/备用槽',
  `lampCode` VARCHAR(20) DEFAULT NULL COMMENT '绑定灯组（槽 1:1 灯）',
  `mjOnly`   TINYINT     DEFAULT 0 COMMENT '麻精专用（1槽1药约束）',
  `status`   VARCHAR(10) DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`drugCode`, `cellCode`),
  CONSTRAINT `fk_DCM_drug_DRUGS`   FOREIGN KEY (`drugCode`) REFERENCES `DRUGS` (`drugCode`),
  CONSTRAINT `fk_DCM_cell_CAB_CELL` FOREIGN KEY (`cellCode`) REFERENCES `CAB_CELL` (`code`),
  CONSTRAINT `fk_DCM_lamp_LAMP`    FOREIGN KEY (`lampCode`) REFERENCES `LAMP` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='药↔槽↔灯绑定（药 N:N 槽；柜1:N槽1:1灯；麻精1槽1药）';

-- ============================================================================
-- 域 12：医保/接口（2 表）【规划】
-- ============================================================================

CREATE TABLE `MI_UPLOAD` (
  `uploadNo` VARCHAR(30)  NOT NULL COMMENT '上传批次号',
  `bizType`  VARCHAR(20)  DEFAULT NULL COMMENT '业务类型（发药/退药/入库）',
  `billNo`   VARCHAR(30)  DEFAULT NULL COMMENT '关联业务单',
  `code`     VARCHAR(20)  DEFAULT NULL COMMENT '追溯码',
  `uploadTime` VARCHAR(20) DEFAULT NULL COMMENT '上传时间',
  `result`   VARCHAR(10)  DEFAULT NULL COMMENT '成功/失败',
  `resp`     JSON         DEFAULT NULL COMMENT '医保回执',
  `status`   VARCHAR(10)  DEFAULT NULL COMMENT '待上传/已上传/失败',
  PRIMARY KEY (`uploadNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='医保上传记录【规划】（菜单 miUploadQ 待补）';

CREATE TABLE `ORG_SYNC_LOG` (
  `logNo`    VARCHAR(30)  NOT NULL COMMENT '日志号',
  `orgNo`    VARCHAR(20)  DEFAULT NULL COMMENT '组织',
  `direction` VARCHAR(10) DEFAULT NULL COMMENT '上行/下行',
  `bizType`  VARCHAR(20)  DEFAULT NULL COMMENT '业务类型',
  `payload`  JSON         DEFAULT NULL COMMENT '报文',
  `result`   VARCHAR(10)  DEFAULT NULL COMMENT '成功/失败',
  `createTime` VARCHAR(20) DEFAULT NULL COMMENT '时间',
  PRIMARY KEY (`logNo`),
  CONSTRAINT `fk_SYNC_org_ORG` FOREIGN KEY (`orgNo`) REFERENCES `ORG` (`orgNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='中继对接日志【规划】（appKey/appSecret 鉴权留痕）';

-- ============================================================================
-- 派生视图与物理实施（不建表，建库时用 VIEW / 物化汇总表 + 对账任务）
-- ============================================================================
-- V_STOCK_BALANCE  在架库存 = 采购入库+其他入库+退回入库(已审核)
--                            − 采购退货−领用出库−其他出库−损耗出库(已审核)
-- V_LEDGER         流水台账 = 全单据 collect() 派生（ledger-data.js）
-- V_TRACE_LOCATE   码全程追溯 = locate(code20) 反查当前位置+履历
--
-- 物理事实与量级（单院区三甲估算，2026-10-05 评审定）：
--   · 大表全部 append-only：SCAN_LOG 10⁷~10⁸/年 > DOC_CODE ~10⁷/年（一码随单流转 2~4 次）
--     > TRACE_CODE 10⁶~10⁷/年 > HIS_PUSH_LOG 10⁶~10⁷/年 > RX 域 10⁶/年 > 单据头 10⁵/年
--   · 对策：按月/季分区 + 历史归档 + 冷迁；append-only ⇒ 派生数据可随时全量重算
--   · 唯一高频读派生点 = 药品库存汇总：逻辑上视图成立；码量过 10⁶ 后物化 STOCK_BALANCE
--     （药+库房+批次 → qty），单据审核事务内 ±qty 维护 + 日结对账（汇总 vs 码集合重算）兜底
--   · 查询三层下钻：药品汇总（视图/物化表）→ 批次 → 码实例；禁止业务SQL直接全扫 TRACE_CODE
--   · DOC_ITEM（定价/金额行进 backlog）：采购价场景启用时照 RX_ITEM + RX_ITEM_CODE 模式扩展
-- ============================================================================
