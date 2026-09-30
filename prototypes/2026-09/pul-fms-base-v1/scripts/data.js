/**
 * data.js — PUL-FMS 基础平台共享 Mock 数据
 * 权限模型（2026-09-28 终稿）：
 *   功能权限 = 角色（菜单/按钮树），纯 RBAC，角色不再带任何数据范围；
 *   行政归属 = 用户.所属院区（orgs 多选）：授权范围锚点 + 管理边界，不参与权限计算；
 *   数据权限 = 唯一机制「授权」（与角色解耦、与创建用户解耦，用户列表「授权」弹窗树形维护）：
 *     节点粒度 user.nodes[]；整院区粒度 user.orgAll[]（含以后新增节点）；授权范围限所属院区；
 *     超管 super=true 天然全部，无需授权。
 * 行数据隔离 = 登录上下文（所选库房/药房）自动隔离 → 再按本人隔离。
 */

// ===== 三级组织架构（4.1.1）：L1 总院 → L2 院区 → L3 节点 =====
var ORG_TREE = {
  id: 'HQ', name: '云岭总医院', level: 'L1', levelName: '总院/集团 · 全局管控层',
  children: [
    { id: 'YQ-ZX', name: '中心院区', level: 'L2', levelName: '院区 · 院区级管控层', children: [
      { id: 'ND-ZXK', name: '中心库', type: '中心库', level: 'L3' },
      { id: 'ND-MZ', name: '门诊药房', type: '门诊药房', level: 'L3' },
      { id: 'ND-ZY', name: '住院药房', type: '住院药房', level: 'L3' }
    ]},
    { id: 'YQ-D', name: '东院区', level: 'L2', levelName: '院区 · 院区级管控层', children: [
      { id: 'ND-DK', name: '分院库（东）', type: '分院库', level: 'L3' },
      { id: 'ND-JZ', name: '急诊药房（东）', type: '急诊药房', level: 'L3' }
    ]},
    { id: 'YQ-BH', name: '滨海院区', level: 'L2', levelName: '院区 · 院区级管控层', children: [
      { id: 'ND-BK', name: '分院库（滨海）', type: '分院库', level: 'L3' },
      { id: 'ND-MJ', name: '麻精专库', type: '麻精专库', level: 'L3' }
    ]}
  ]
};

// ===== 院区管理（供应商平台对接凭证，appSecret 脱敏展示） =====
var ORGS = [
  { seq: 1, orgNo: 'H35042400410', name: '中心院区', appKey: '1fc25f20f937433187597a5f48b08ad8', appSecret: '03c22a689bfa4829b05e9313b90cc713', status: '启用' },
  { seq: 2, orgNo: 'H35042400403', name: '东院区',   appKey: '2ad36e31g048544208608b6g59c19be9', appSecret: '14d33b790cgb593ac16f0424ca01dd824', status: '启用' },
  { seq: 3, orgNo: 'H35042400397', name: '滨海院区', appKey: '3be47f42h159655319719c7h60d20cf0', appSecret: '25e44c801dhc604bd27g1535db12ee935', status: '暂停' }
];

// ===== 标准角色（4.1.2 精简版，6 类）：纯功能权限（菜单/按钮树），数据授权一律在用户侧 =====
var ROLES = [
  { code: 'SYS_ADMIN', name: '系统管理员',   duty: '系统配置、字典管理、角色权限维护',         remark: '内置超级管理员角色', users: 2,  builtin: true  },
  { code: 'YQ_ADMIN',  name: '院区管理员',   duty: '本院区药事管理、院内调拨审批、库存监控', remark: '', users: 3,  builtin: true  },
  { code: 'KEEPER',    name: '库管员',       duty: '本库房入库、调拨、盘点、库存管理',       remark: '', users: 8,  builtin: true  },
  { code: 'PHARM',     name: '发药药师',     duty: '本药房处方发药、拆零、退药、盘点',       remark: '', users: 12, builtin: true  },
  { code: 'CHECKER',   name: '验收员',       duty: '药品到货验收、入库核对',                remark: '', users: 4,  builtin: true  },
  { code: 'MJ_PHARM',  name: '麻精药品药师', duty: '麻精药品发药与双人复核',               remark: '自定义角色', users: 2, builtin: false }
];

// ===== 用户账号（4.4.1）；角色多选，功能权限随角色继承 =====
// 权限口径（2026-09-28 终稿）：
//   super=true 超级用户：不指定所属院区、内部用户不可删、不参与实际业务（只做权限/参数/字典）
//   orgs 所属院区：非超管必填、可多选；行政归属 + 授权范围锚点（授权限所属院区），不参与权限计算
//   nodes 授权节点 / orgAll 整院区授权：数据授权唯一载体，在「授权」弹窗树形维护（与角色、与创建用户解耦）
//   authMeta 授权审计：{by: 操作人姓名, at: 'YYYY-MM-DD HH:MM'}，每次「授权」保存时刷新
var USERS = [
  { account: 'admin',       name: '林建国', hisNo: 'HIS0001', phone: '138****0001', email: 'linjg@ylhosp.cn',  roles: ['SYS_ADMIN'], orgs: [],          super: true, nodes: [], orgAll: [],  status: '正常', lastLogin: '2026-09-13 08:42' },
  { account: 'yq.sun',      name: '孙雅婷', hisNo: 'HIS0108', phone: '136****0108', email: 'sunyt@ylhosp.cn',  roles: ['YQ_ADMIN'],  orgs: ['东院区'],  nodes: [], orgAll: ['东院区'], authMeta: { by: '林建国', at: '2026-09-01 10:20' }, status: '正常', lastLogin: '2026-09-11 14:33' },
  { account: 'keeper.wang', name: '王铁军', hisNo: 'HIS0215', phone: '135****0215', email: 'wangtj@ylhosp.cn', roles: ['KEEPER'],    orgs: ['中心院区'], nodes: ['中心库'], orgAll: [], authMeta: { by: '林建国', at: '2026-08-15 09:30' }, status: '正常', lastLogin: '2026-09-13 07:58' },
  { account: 'pharm.chen',  name: '陈静',   hisNo: 'HIS0231', phone: '134****0231', email: 'chenj@ylhosp.cn',  roles: ['PHARM'],     orgs: ['中心院区'], nodes: ['门诊药房'], orgAll: [], authMeta: { by: '林建国', at: '2026-08-15 09:31' }, status: '正常', lastLogin: '2026-09-12 16:41' },
  { account: 'pharm.wu',    name: '吴琳',   hisNo: 'HIS0268', phone: '135****0268', email: 'wul@ylhosp.cn',    roles: ['PHARM'],     orgs: ['中心院区', '东院区'], nodes: ['门诊药房', '急诊药房（东）'], orgAll: [], authMeta: { by: '林建国', at: '2026-09-05 14:10' }, status: '正常', lastLogin: '2026-09-12 10:05' },
  { account: 'mj.zhou',     name: '周国安', hisNo: 'HIS0302', phone: '133****0302', email: 'zhouga@ylhosp.cn', roles: ['MJ_PHARM'],  orgs: ['滨海院区'], nodes: ['麻精专库'], orgAll: [], authMeta: { by: '林建国', at: '2026-08-20 16:45' }, status: '正常', lastLogin: '2026-09-10 11:26' },
  { account: 'check.liu',   name: '刘志远', hisNo: 'HIS0177', phone: '132****0177', email: 'liuzy@ylhosp.cn',  roles: ['CHECKER'],   orgs: ['东院区'],  nodes: ['分院库（东）'], orgAll: [], authMeta: { by: '孙雅婷', at: '2026-09-02 11:15' }, status: '正常', lastLogin: '2026-09-09 15:12' },
  { account: 'old.zhang',   name: '张离职', hisNo: 'HIS0099', phone: '130****0099', email: 'zhangl@ylhosp.cn', roles: ['KEEPER'],    orgs: ['东院区'],  nodes: ['分院库（东）'], orgAll: [], authMeta: { by: '孙雅婷', at: '2026-05-20 09:00' }, status: '禁用', lastLogin: '2026-06-01 09:00' }
];

// ===== 菜单权限树（与 app-shell.js 左侧导航 1:1 对齐：模块 → 菜单 → 操作按钮） =====
// 工作台全员可见，不进权限树；占位/预留菜单照常列出（勾选后生效于后续实现）
// origin: 'n' = 自主新增（非客户原菜单）；缺省 = 客户原有（2026-09-30 对照客户原菜单标注）
// 2026-09-30 Round Z：组名/项名/顺序对齐客户原文，code 不变
var MENU_TREE = [
  { group: '系统管理', items: [
    { code: 'perm',  name: '权限管理', ops: ['查看', '新增', '编辑', '启停'] },
    { code: 'users', name: '用户管理', ops: ['查看', '新增', '编辑', '禁用'] },
    { code: 'roles', name: '角色管理', ops: ['查看', '新增', '编辑', '配置权限'] },
    { code: 'cabSet',      name: '取药柜设置（待补）',     ops: ['查看'] },
    { code: 'pickLamp',    name: '取药指示灯（待补）',     ops: ['查看'] },
    { code: 'fillLampSet', name: '补药灯组设置（待补）',   ops: ['查看'] },
    { code: 'slotLampMap', name: '取药槽灯组对照（待补）', ops: ['查看'] },
    { code: 'slotDrugMap', name: '取药槽药品对照（待补）', ops: ['查看'] }
  ]},
  { group: '基础管理', items: [
    { code: 'orgs',    name: '院区字典维护', ops: ['查看', '新增', '编辑', '启停'] },
    { code: 'wh',      name: '库房库位维护', ops: ['查看', '维护'] },
    { code: 'phloc',   name: '药房货位维护', ops: ['查看', '维护'] },
    { code: 'drug',    name: '药品字典维护', ops: ['查看', '新增', '编辑', '审核'] },
    { code: 'cabinet', name: '取药柜维护',   ops: ['查看', '维护'] },
    { code: 'lamp',    name: '基站灯组维护', ops: ['查看', '扫码新增'] },
    { code: 'idcode',  name: '药品标识码查询', ops: ['查看', '维护'] },
    { code: 'slotQ',   name: '取药槽信息查询（待补）', ops: ['查看'] },
    { code: 'dict',    name: '基础字典',     ops: ['查看', '新增', '编辑', '启停'], origin: 'n' }
  ]},
  { group: '采购管理', items: [
    { code: 'arrive',  name: '采购到货单',   ops: ['查看', '新增', '入库'] },
    { code: 'pin',     name: '采购入库单',   ops: ['查看', '新增', '编辑', '扫码', '审核', '打印'] },
    { code: 'badcode', name: '异常标识码',   ops: ['查看', '维护'] },
    { code: 'pquery',  name: '入库明细查询', ops: ['查看', '导出'] },
    { code: 'pout',    name: '采购退货单',   ops: ['查看', '新增', '审核'] },
    { code: 'pOutQ',   name: '退货明细查询', ops: ['查看'] },
    { code: 'pdone',   name: '已完成单',     ops: ['查看', '反审核', '打印'], origin: 'n' }
  ]},
  { group: '库房管理', items: [
    { code: 'whstock',   name: '库房库存查询', ops: ['查看'] },
    { code: 'quickScan', name: '领用快捷扫码', ops: ['查看', '扫码', '出库'] },
    { code: 'pick',      name: '领用备货单',   ops: ['查看', '备货', '出库'] },
    { code: 'pickOut',   name: '领用出库单', ops: ['查看', '新增', '审核'] },
    { code: 'whOutQ',    name: '出库明细查询', ops: ['查看'] },
    { code: 'retIn',     name: '领用退回',     ops: ['查看', '新增', '入库'] },
    { code: 'othIn',     name: '其他入库单',   ops: ['查看', '创建'] },
    { code: 'othOut',    name: '其他出库单',   ops: ['查看', '创建'] }
  ]},
  { group: '药房管理', items: [
    { code: 'phstock', name: '药房库存查询', ops: ['查看'] },
    { code: 'req',     name: '领用申请单',   ops: ['查看', '申请'] },
    { code: 'reqIn',   name: '领用入库单',   ops: ['查看', '入库'] },
    { code: 'phInQ',   name: '入库明细查询', ops: ['查看'] },
    { code: 'retOut',  name: '退回出库单',   ops: ['查看', '出库'] },
    { code: 'shelfQ',  name: '待上架药品查询', ops: ['查看'] },
    { code: 'shelf',   name: '药品扫码上架', ops: ['查看', '上架', '下架'] },
    { code: 'light',   name: '补药指示灯亮（占位）', ops: ['查看'] },
    { code: 'shelfOff', name: '药品扫码下架（待补）', ops: ['查看'] },
    { code: 'phloss',  name: '药房损耗',     ops: ['查看', '登记'], origin: 'n' }
  ]},
  { group: '出库管理', items: [
    { code: 'disp',        name: '处方发药扫码',   ops: ['查看', '发药'] },
    { code: 'assign',      name: '处方取药赋码（占位）',   ops: ['查看', '赋码'] },
    { code: 'assignBatch', name: '处方单批量赋码（占位）', ops: ['查看', '赋码'] },
    { code: 'assignQ',     name: '处方单赋码查询（待补）', ops: ['查看'] },
    { code: 'rxExc',      name: '赋码异常台账',   ops: ['查看', '复核', '改绑'], origin: 'n' },
    { code: 'rxItemQ',     name: '处方药品明细查询', ops: ['查看'] },
    { code: 'rxAggQ',      name: '处方药品汇总查询', ops: ['查看'] },
    { code: 'rxret',       name: '处方单退药',     ops: ['查看', '退药'] },
    { code: 'rxRetQ',      name: '处方单退药查询', ops: ['查看'] },
    { code: 'tray',        name: '摆药单批量赋码', ops: ['查看', '摆药'] },
    { code: 'trayAssignQ', name: '摆药单赋码查询（待补）', ops: ['查看'] },
    { code: 'trayItemQ',   name: '摆药单明细查询（待补）', ops: ['查看'] },
    { code: 'traySumQ',    name: '摆药单汇总查询（待补）', ops: ['查看'] },
    { code: 'trayRet',     name: '摆药单退药',     ops: ['查看', '退药'] },
    { code: 'trayRetQ',    name: '摆药单退药查询', ops: ['查看'] },
    { code: 'lossOut',     name: '损耗出库单',     ops: ['查看', '创建', '审核'] },
    { code: 'lossQ',       name: '损耗明细查询',   ops: ['查看'] },
    { code: 'wardSign',    name: '病区签收',       ops: ['查看', '签收'], origin: 'n' }
  ]},
  { group: 'HIS单据', items: [
    { code: 'rxQ',    name: 'HIS处方单查询（待补）',   ops: ['查看'] },
    { code: 'rxSum',  name: 'HIS处方单药品汇总（待补）', ops: ['查看'] },
    { code: 'trayQ',  name: 'HIS摆药单查询',       ops: ['查看'] },
    { code: 'traySum', name: 'HIS摆药单药品汇总（待补）', ops: ['查看'] }
  ]},
  { group: '盘点管理', items: [
    { code: 'invInit',   name: '期初存量（期初盘点）', ops: ['查看', '创建'] },
    { code: 'inv',       name: '药品盘点单',     ops: ['查看', '创建', '录入', '审核'] },
    { code: 'invGain',   name: '盘盈入库单',     ops: ['查看', '入库'] },
    { code: 'invLoss',   name: '盘亏出库单',     ops: ['查看', '出库'] },
    { code: 'invQ',      name: '盈亏明细查询',   ops: ['查看', '导出'] },
    { code: 'invSumQ',   name: '盈亏汇总查询（待补）', ops: ['查看'] },
    { code: 'invNocode', name: '无码药品记录',   ops: ['查看', '登记'] }
  ]},
  { group: '台账管理', items: [
    { code: 'ledger',  name: '日记账查询',     ops: ['查看', '导出'] },
    { code: 'ledgerM', name: '月记账查询（待补）', ops: ['查看'] },
    { code: 'ledgerQ', name: '季度账查询（待补）', ops: ['查看'] },
    { code: 'traceQ',  name: '追溯码查询',   ops: ['查看'], origin: 'n' },
    { code: 'flowQ',  name: '药品流向查询', ops: ['查看'], origin: 'n' }
  ]},
  { group: '医保管理', items: [
    { code: 'miUpload',  name: '医保上传接口（预留）', ops: ['查看', '上传'] },
    { code: 'miUploadQ', name: '上传情况查询（待补）', ops: ['查看'] }
  ]}
];

// ===== 角色 → 菜单权限映射（演示数据，未列出即无权限；code 与 MENU_TREE 对齐） =====
var PERM_MAP = {
  SYS_ADMIN: { users: ['查看','新增','编辑','禁用'], roles: ['查看','新增','编辑','配置权限'], perm: ['查看','新增','编辑','启停'], orgs: ['查看','新增','编辑','启停'],
    dict: ['查看','新增','编辑','启停'], drug: ['查看','新增','编辑','审核'], idcode: ['查看','维护'], wh: ['查看','维护'], phloc: ['查看','维护'],
    ledger: ['查看','导出'], traceQ: ['查看'], flowQ: ['查看'],
    pOutQ: ['查看'], whOutQ: ['查看'], phInQ: ['查看'], rxExc: ['查看','复核','改绑'], assignQ: ['查看'], rxItemQ: ['查看'], rxAggQ: ['查看'], rxRetQ: ['查看'], trayRetQ: ['查看'],
    rxQ: ['查看'], rxSum: ['查看'], traySum: ['查看'], ledgerM: ['查看'], ledgerQ: ['查看'], miUploadQ: ['查看'] },
  YQ_ADMIN:  { whstock: ['查看'], phstock: ['查看'], pquery: ['查看'], lossOut: ['查看','审核'], inv: ['查看','审核'], invQ: ['查看'],
    ledger: ['查看'], traceQ: ['查看'], flowQ: ['查看'], users: ['查看','新增','编辑'],
    pOutQ: ['查看'], whOutQ: ['查看'], phInQ: ['查看'], rxExc: ['查看'], rxQ: ['查看'], rxSum: ['查看'], traySum: ['查看'], ledgerM: ['查看'], ledgerQ: ['查看'] },
  KEEPER:    { arrive: ['查看','新增','入库'], pin: ['查看','新增','编辑','扫码','审核','打印'], pout: ['查看','新增','审核'], pdone: ['查看','反审核','打印'],
    badcode: ['查看'], pquery: ['查看','导出'], pOutQ: ['查看'], whstock: ['查看'], pick: ['查看','备货','出库'], pickOut: ['查看','新增','审核'], quickScan: ['查看','扫码','出库'], retIn: ['查看','新增','入库'],
    othIn: ['查看','创建'], othOut: ['查看','创建'], lossOut: ['查看','创建'], lossQ: ['查看'], whOutQ: ['查看'],
    invInit: ['查看','创建'], inv: ['查看','创建','录入'], invGain: ['查看','入库'], invLoss: ['查看','出库'], invQ: ['查看'], invNocode: ['查看','登记'] },
  PHARM:     { phstock: ['查看'], req: ['查看','申请'], reqIn: ['查看','入库'], phInQ: ['查看'], retOut: ['查看','出库'], shelfQ: ['查看'], shelf: ['查看','上架','下架'],
    disp: ['查看','发药'], assign: ['查看','赋码'], rxExc: ['查看','复核','改绑'], assignQ: ['查看'], rxItemQ: ['查看'], rxAggQ: ['查看'], rxret: ['查看','退药'], rxRetQ: ['查看'],
    tray: ['查看','摆药'], trayRet: ['查看','退药'], trayRetQ: ['查看'], trayQ: ['查看'], traySum: ['查看'], rxQ: ['查看'], rxSum: ['查看'], wardSign: ['查看','签收'],
    inv: ['查看','创建','录入'], invQ: ['查看'], invNocode: ['查看','登记'] },
  CHECKER:   { arrive: ['查看','新增'], pin: ['查看','扫码'], badcode: ['查看','维护'] },
  MJ_PHARM:  { disp: ['查看','发药'], rxret: ['查看','退药'], phstock: ['查看'], traceQ: ['查看'] }
};

// ===== 数据隔离规则（客户新版口径 2026-09-21：登录上下文自动隔离 + 仅本人） =====
var ISOLATION_RULES = [
  '行数据权限第一层：登录/切换时选定具体库房或药房，业务单据、库存、台账自动按该上下文隔离',
  '行数据权限第二层：在上下文之内再按「本用户」隔离（操作员默认只见本人经手的单据）',
  '基础数据（药品档案、标识码字典、全局字典）全局可见，仅授权角色可编辑',
  '功能权限（菜单/按钮）随角色；数据授权与角色解耦：在用户管理「授权」逐人维护（节点 / 整院区两种粒度）'
];
var CHANGE_FLOWS = [
  { name: '新增用户', desc: '由对应层级管理员创建账号，分配角色与所属院区；库房/药房授权在用户列表「授权」单独维护' },
  { name: '权限变更', desc: '提交权限变更申请，上级管理员审批后生效' },
  { name: '角色调整', desc: '角色权限修改后，该角色下所有用户权限同步更新' },
  { name: '权限注销', desc: '人员离职/岗位调整，及时注销或调整账号权限' }
];

// ===== 字典分类（5.2） =====
var DICT_TYPES = [
  { code: 'DRUG_CAT',  name: '药品分类字典',     level: '全局',   usage: '药品分类管理与统计', status: '启用' },
  { code: 'PACK_UNIT', name: '包装单位字典',     level: '全局',   usage: '单位换算与业务录入', status: '启用' },
  { code: 'NODE_TYPE', name: '节点类型字典',     level: '全局',   usage: '组织节点分类',       status: '启用' },
  { code: 'STORE_TYPE',name: '库房类型字典',     level: '全局',   usage: '库房属性区分',       status: '启用' },
  { code: 'IO_TYPE',   name: '出入库类型字典',   level: '全局',   usage: '出入库业务分类',     status: '启用' },
  { code: 'AUDIT_ST',  name: '审核状态字典',     level: '全局',   usage: '单据状态管理',       status: '启用' },
  { code: 'EXP_WARN',  name: '效期预警等级字典', level: '全局',   usage: '效期预警标识',       status: '启用' },
  { code: 'CHK_TYPE',  name: '盘点类型字典',     level: '全局',   usage: '盘点任务分类',       status: '启用' },
  { code: 'DEPT',      name: '科室字典',         level: '院区级', usage: '院内科室对应',       status: '启用' },
  { code: 'SUP_CAT',   name: '供应商分类字典',   level: '全局',   usage: '供应商分类管理',     status: '启用' }
];

// ===== 字典项（refs = 被引用次数，>0 不可删除仅可停用 5.3.4） =====
var DICT_ITEMS = {
  DRUG_CAT:  [
    { code: 'XY',  name: '西药',         sort: 1, status: '启用', refs: 328 },
    { code: 'ZCY', name: '中成药',       sort: 2, status: '启用', refs: 156 },
    { code: 'ZYXP',name: '中药饮片',     sort: 3, status: '启用', refs: 89 },
    { code: 'MJYP',name: '麻精药品',     sort: 4, status: '启用', refs: 23 },
    { code: 'TSGL',name: '特殊管理药品', sort: 5, status: '启用', refs: 12 }
  ],
  PACK_UNIT: [
    { code: 'PIAN', name: '片', sort: 1, status: '启用', refs: 412 },
    { code: 'LI',   name: '粒', sort: 2, status: '启用', refs: 236 },
    { code: 'ZHI',  name: '支', sort: 3, status: '启用', refs: 198 },
    { code: 'HE',   name: '盒', sort: 4, status: '启用', refs: 402 },
    { code: 'XIANG',name: '箱', sort: 5, status: '启用', refs: 377 },
    { code: 'PING', name: '瓶', sort: 6, status: '启用', refs: 145 },
    { code: 'DAI',  name: '袋', sort: 7, status: '启用', refs: 67 }
  ],
  NODE_TYPE: [
    { code: 'ZXK',  name: '中心库',   sort: 1, status: '启用', refs: 1 },
    { code: 'FYK',  name: '分院库',   sort: 2, status: '启用', refs: 2 },
    { code: 'MZYF', name: '门诊药房', sort: 3, status: '启用', refs: 1 },
    { code: 'ZYYF', name: '住院药房', sort: 4, status: '启用', refs: 1 },
    { code: 'JZYF', name: '急诊药房', sort: 5, status: '启用', refs: 1 }
  ],
  STORE_TYPE: [
    { code: 'CW', name: '常温库',   sort: 1, status: '启用', refs: 2 },
    { code: 'YL', name: '阴凉库',   sort: 2, status: '启用', refs: 1 },
    { code: 'LC', name: '冷藏库',   sort: 3, status: '启用', refs: 1 },
    { code: 'MJZK',name: '麻精专库',sort: 4, status: '启用', refs: 1 }
  ],
  IO_TYPE: [
    { code: 'CGRK', name: '采购入库', sort: 1, status: '启用', refs: 86 },
    { code: 'DBRK', name: '调拨入库', sort: 2, status: '启用', refs: 152 },
    { code: 'DBCK', name: '调拨出库', sort: 3, status: '启用', refs: 152 },
    { code: 'FYCK', name: '发药出库', sort: 4, status: '启用', refs: 1204 },
    { code: 'BSCK', name: '报损出库', sort: 5, status: '启用', refs: 9 },
    { code: 'TYRK', name: '退药入库', sort: 6, status: '启用', refs: 31 }
  ],
  AUDIT_ST: [
    { code: 'DTJ', name: '待提交',     sort: 1, status: '启用', refs: 0 },
    { code: 'DSH', name: '待审核',     sort: 2, status: '启用', refs: 0 },
    { code: 'TG',  name: '审核通过',   sort: 3, status: '启用', refs: 0 },
    { code: 'BTG', name: '审核不通过', sort: 4, status: '启用', refs: 0 },
    { code: 'YZF', name: '已作废',     sort: 5, status: '停用', refs: 0 }
  ],
  EXP_WARN: [
    { code: 'ZC', name: '正常', sort: 1, status: '启用', refs: 0 },
    { code: 'YJ', name: '预警', sort: 2, status: '启用', refs: 0 },
    { code: 'GQ', name: '过期', sort: 3, status: '启用', refs: 0 }
  ],
  CHK_TYPE: [
    { code: 'QP',  name: '全盘',     sort: 1, status: '启用', refs: 12 },
    { code: 'CP',  name: '抽盘',     sort: 2, status: '启用', refs: 45 },
    { code: 'DTPD',name: '动态盘点', sort: 3, status: '启用', refs: 8 }
  ],
  DEPT: [
    { code: 'HXNK', name: '呼吸内科', sort: 1, status: '启用', refs: 0 },
    { code: 'XHNK', name: '消化内科', sort: 2, status: '启用', refs: 0 },
    { code: 'XWK',  name: '心外科',   sort: 3, status: '启用', refs: 0 },
    { code: 'PTWK', name: '普通外科', sort: 4, status: '启用', refs: 0 },
    { code: 'JZKS', name: '急诊科室', sort: 5, status: '启用', refs: 0 }
  ],
  SUP_CAT: [
    { code: 'SCQY', name: '生产企业', sort: 1, status: '启用', refs: 18 },
    { code: 'PFQY', name: '批发企业', sort: 2, status: '启用', refs: 42 }
  ]
};

// ===== 演示登录账号（登录页快速填充）：覆盖五种登录路径 =====
var DEMO_ACCOUNTS = [
  { account: 'admin',       pwd: '123456', label: '超级用户 · 登录选院区' },
  { account: 'yq.sun',      pwd: '123456', label: '双栖用户 · 选库房/药房管理' },
  { account: 'pharm.wu',    pwd: '123456', label: '跨院区药师 · 切换院区' },
  { account: 'keeper.wang', pwd: '123456', label: '库管员 · 单库房直达' },
  { account: 'pharm.chen',  pwd: '123456', label: '发药药师 · 单药房直达' }
];

// ===== 工具函数 =====
function findUser(account) {
  for (var i = 0; i < USERS.length; i++) if (USERS[i].account === account) return USERS[i];
  return null;
}
function findRole(code) {
  for (var i = 0; i < ROLES.length; i++) if (ROLES[i].code === code) return ROLES[i];
  return null;
}
// 用户数据范围展示 = 整院区授权 + 节点授权合并（超管天然全部）
function userScopeText(user) {
  if (user.super) return '全部院区 · 全部节点';
  var parts = [];
  var alls = user.orgAll || [];
  if (alls.length) parts.push(alls.join('、') + '（整院区，含新增节点）');
  var ns = user.nodes || [];
  if (ns.length) parts.push('已授权 ' + ns.length + ' 个：' + ns.join('、'));
  return parts.join('；') || '待授权';
}
// 用户角色名拼接
function userRoleNames(user) {
  return (user.roles || []).map(function (rc) { var r = findRole(rc); return r ? r.name : rc; }).join('、');
}
// 院区 → 下属节点
function nodesOfOrg(orgName) {
  var out = [];
  ORG_TREE.children.forEach(function (yq) {
    if (!orgName || yq.name === orgName) (yq.children || []).forEach(function (n) { out.push(n); });
  });
  return out;
}
// 节点 → 所属院区名（找不到返回 null）
function orgOfNode(nodeName) {
  for (var i = 0; i < ORG_TREE.children.length; i++) {
    var yq = ORG_TREE.children[i];
    var hit = (yq.children || []).some(function (n) { return n.name === nodeName; });
    if (hit) return yq.name;
  }
  return null;
}
// 节点类型 → 业务模块（'库房' / '药房'）：类型名含「药房」归药房管理，其余归库房管理
function nodeKind(type) { return /药房/.test(type || '') ? '药房' : '库房'; }
// 登录流（2026-09-28 终稿口径）：候选上下文 = 授权唯一来源
// 超管 → 全部院区全部节点；orgAll → 整院区 L3 节点（含新增）；nodes → 逐节点
// 返回 [{org, node, type, kind}]；长度 1 = 直达；含两种 kind = 需先选「库房管理/药房管理」
function candidateContexts(user) {
  var out = [];
  function push(org, node) {
    if (!org || !node) return;
    var dup = out.some(function (c) { return c.node === node.name; }); // 授权重叠时按节点名去重
    if (!dup) out.push({ org: org, node: node.name, type: node.type, kind: nodeKind(node.type) });
  }
  function pushOrg(orgName) {
    ORG_TREE.children.forEach(function (yq) {
      if (!orgName || yq.name === orgName) (yq.children || []).forEach(function (n) { push(yq.name, n); });
    });
  }
  function pushNode(name) {
    ORG_TREE.children.forEach(function (yq) {
      (yq.children || []).forEach(function (n) { if (n.name === name) push(yq.name, n); });
    });
  }
  if (user.super) { pushOrg(null); return out; }
  (user.orgAll || []).forEach(pushOrg);
  (user.nodes || []).forEach(pushNode);
  return out;
}

window.PUL = { ORG_TREE: ORG_TREE, ORGS: ORGS, ROLES: ROLES, USERS: USERS,
  MENU_TREE: MENU_TREE, PERM_MAP: PERM_MAP, ISOLATION_RULES: ISOLATION_RULES, CHANGE_FLOWS: CHANGE_FLOWS,
  DICT_TYPES: DICT_TYPES, DICT_ITEMS: DICT_ITEMS, DEMO_ACCOUNTS: DEMO_ACCOUNTS,
  findUser: findUser, findRole: findRole, userScopeText: userScopeText,
  userRoleNames: userRoleNames, nodesOfOrg: nodesOfOrg, orgOfNode: orgOfNode,
  nodeKind: nodeKind, candidateContexts: candidateContexts };
