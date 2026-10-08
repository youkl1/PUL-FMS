-- PUL-FMS 核心数据模型 DDL（DrawDB 案例测试输入 · MySQL 方言）
-- 来源：图 12 表结构 ER（fireworks/12-er-fields.json；2026-10-05 起图12改为关系版——只列主外键+表作用，字段明细以本文件与 pul-fms-full.sql 为准）
-- 用法：drawdb.app → Import from SQL → 粘贴本文件 → 方言选 MySQL
-- 注意：中文注释必须写 COMMENT 子句（列级/表级），DrawDB 不导入 -- 行注释

-- ===== 组织/设施字典 =====
CREATE TABLE `WAREHOUSE` (
  `code`   VARCHAR(20)  NOT NULL COMMENT '库房编码 WH001',
  `name`   VARCHAR(50)  NOT NULL COMMENT '库房名（中心库）',
  `org`    VARCHAR(50)  DEFAULT NULL COMMENT '所属院区（逻辑 FK）',
  `type`   VARCHAR(20)  DEFAULT NULL COMMENT '常温/阴凉/麻精',
  `status` VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库房';

CREATE TABLE `WH_LOCATION` (
  `code`   VARCHAR(20)  NOT NULL COMMENT '库位编码 A-01-02',
  `name`   VARCHAR(50)  DEFAULT NULL COMMENT '库位名',
  `status` VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库位';

CREATE TABLE `PHARMACY` (
  `code`   VARCHAR(20)  NOT NULL COMMENT '药房编码 PH001',
  `name`   VARCHAR(50)  NOT NULL COMMENT '药房名（门诊药房）',
  `org`    VARCHAR(50)  DEFAULT NULL COMMENT '所属院区（逻辑 FK）',
  `type`   VARCHAR(20)  DEFAULT NULL COMMENT '门诊/住院/急诊',
  `status` VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='药房';

CREATE TABLE `PH_LOCATION` (
  `code`   VARCHAR(20)  NOT NULL COMMENT '货位编码 M-01',
  `name`   VARCHAR(50)  DEFAULT NULL COMMENT '货位名',
  `status` VARCHAR(10)  DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='药房货位';

CREATE TABLE `CABINET` (
  `code`     VARCHAR(20) NOT NULL COMMENT '取药柜编码 CB01',
  `name`     VARCHAR(50) DEFAULT NULL COMMENT '门诊取药柜 1 号',
  `pharmacy` VARCHAR(20) DEFAULT NULL COMMENT '所属药房',
  `status`   VARCHAR(10) DEFAULT NULL COMMENT '启用/停用',
  PRIMARY KEY (`code`),
  CONSTRAINT `fk_CABINET_pharmacy_PHARMACY` FOREIGN KEY (`pharmacy`) REFERENCES `PHARMACY` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='取药柜（本期字典）';

CREATE TABLE `CAB_CELL` (
  `code`   VARCHAR(20)  NOT NULL COMMENT '槽位编码 C1-03（1 层 3 槽）',
  `name`   VARCHAR(50)  DEFAULT NULL COMMENT '槽位名',
  `status` VARCHAR(10)  DEFAULT NULL COMMENT '空闲/占用（经摆药层）',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='取药槽';

-- ===== 药品主数据 =====
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
  `warehouse` VARCHAR(20) DEFAULT NULL COMMENT '所属库房（同一标识码不同库房分别建档）',
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
  `type`     VARCHAR(30)  DEFAULT NULL COMMENT '未维护标识码/解析失败（维护后 upsert 回 DRUGS+IDCODES）',
  PRIMARY KEY (`idcode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='异常码台账';

-- ===== 码实例与单据 =====
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='追溯码实例（无 status，由单据集合推导，见图 08）';

CREATE TABLE `DOC` (
  `billNo`    VARCHAR(20)  NOT NULL COMMENT '单号 LYCK20260913001',
  `docType`   VARCHAR(20)  DEFAULT NULL COMMENT '7 类：采购入库/领用出库/损耗等',
  `date`      VARCHAR(20)  DEFAULT NULL COMMENT '单据日期',
  `warehouse` VARCHAR(20)  DEFAULT NULL COMMENT '库房',
  `pharmacy`  VARCHAR(20)  DEFAULT NULL COMMENT '药房（领用/退回场景）',
  `supplier`  VARCHAR(100) DEFAULT NULL COMMENT '供应商（采购场景）',
  `status`    VARCHAR(20)  DEFAULT NULL COMMENT '状态机：待提交/待出库(领用备货单内动作,不扣账)/未审核/已审核/已出库·待入库/已入库·待上架/已上架/已作废…',
  `auditTime` VARCHAR(20)  DEFAULT NULL COMMENT '审核时间',
  `auditor`   VARCHAR(30)  DEFAULT NULL COMMENT '审核人',
  `operator`  VARCHAR(30)  DEFAULT NULL COMMENT '经办人',
  `invoice`   VARCHAR(30)  DEFAULT NULL COMMENT '发票号（采购场景）',
  `remark`    VARCHAR(200) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`billNo`),
  CONSTRAINT `fk_DOC_warehouse_WAREHOUSE` FOREIGN KEY (`warehouse`) REFERENCES `WAREHOUSE` (`code`),
  CONSTRAINT `fk_DOC_pharmacy_PHARMACY`   FOREIGN KEY (`pharmacy`)  REFERENCES `PHARMACY` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单据（7 类）';

CREATE TABLE `DOC_CODE` (
  `billNo`   VARCHAR(20) NOT NULL COMMENT '所属单据',
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
  CONSTRAINT `fk_DOC_CODE_billNo_DOC`        FOREIGN KEY (`billNo`) REFERENCES `DOC` (`billNo`),
  CONSTRAINT `fk_DOC_CODE_code_TRACE_CODE`   FOREIGN KEY (`code`)   REFERENCES `TRACE_CODE` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单据-码清单（原型内嵌 codes[]，建库拆关联表）';

CREATE TABLE `PICK_DOC` (
  `billNo`    VARCHAR(20)  NOT NULL COMMENT '领用单号 LY…（一单一号全程不换；历史数据保留 LYCK 原号）',
  `date`      VARCHAR(20)  DEFAULT NULL COMMENT '单据日期',
  `pharmacy`  VARCHAR(20)  DEFAULT NULL COMMENT '申请/收货药房',
  `warehouse` VARCHAR(20)  DEFAULT NULL COMMENT '供货库房',
  `applicant` VARCHAR(30)  DEFAULT NULL COMMENT '申请人',
  `source`    VARCHAR(10)  DEFAULT NULL COMMENT '来源：药房申请/库房制单/扫码直生',
  `status`    VARCHAR(20)  DEFAULT NULL COMMENT '待提交/待出库/已出库·待入库/已入库·待上架/已上架/已作废',
  `shelfLoc`  VARCHAR(20)  DEFAULT NULL COMMENT '入库时选填整单上架货位（仅提示）',
  `createTime` VARCHAR(20) DEFAULT NULL COMMENT '创建时间',
  `submitTime` VARCHAR(20) DEFAULT NULL COMMENT '提交时间',
  `outTime`   VARCHAR(20)  DEFAULT NULL COMMENT '出库审核时间（审核即扣库房账）',
  `inTime`    VARCHAR(20)  DEFAULT NULL COMMENT '入库审核时间（加药房账）',
  `operator`  VARCHAR(30)  DEFAULT NULL COMMENT '最近经办人',
  `remark`    VARCHAR(200) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`billNo`),
  CONSTRAINT `fk_PICK_ph_PHARMACY`  FOREIGN KEY (`pharmacy`)  REFERENCES `PHARMACY` (`code`),
  CONSTRAINT `fk_PICK_wh_WAREHOUSE` FOREIGN KEY (`warehouse`) REFERENCES `WAREHOUSE` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领用单（药品口径申请+出库合并，一套四表之表头）';

CREATE TABLE `PICK_ITEM` (
  `billNo`   VARCHAR(20) NOT NULL COMMENT '所属领用单',
  `drugCode` VARCHAR(20) NOT NULL COMMENT '药品（药品口径 · 无码）',
  `qty`      INT         DEFAULT NULL COMMENT '计划数量（申请填；扫码直生=实扫回填）',
  `docQty`   INT         DEFAULT NULL COMMENT '单据数量（扫码折合渐满）',
  `slot`     VARCHAR(20) DEFAULT NULL COMMENT '上架货位（可空；随单传递到码 expectLoc）',
  PRIMARY KEY (`billNo`, `drugCode`),
  CONSTRAINT `fk_PICK_ITEM_doc_PICK_DOC`   FOREIGN KEY (`billNo`)   REFERENCES `PICK_DOC` (`billNo`),
  CONSTRAINT `fk_PICK_ITEM_drugCode_DRUGS` FOREIGN KEY (`drugCode`) REFERENCES `DRUGS` (`drugCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领用单药品清单明细';
