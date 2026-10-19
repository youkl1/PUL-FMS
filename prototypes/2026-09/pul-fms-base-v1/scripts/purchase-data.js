/**
 * purchase-data.js — 采购模块 Mock 数据（字段口径对齐老系统 121.37.95.55:8090，便于后续数据迁移）
 * 覆盖：供应商平台码单池（下载单据弹窗数据源）/ 采购到货单（全流程：下载·新增→验收→审核入库）/ 采购入库单（纯结果记录）/ 采购退货单 / 异常标识码 / 采购明细
 * Round CA（2026-10-14）：四分支演示单直出列表（下载失败 9419121 / 库存码已存在 223342530 / 手动空单 DH20261014001 / 短收 204-13825501〔Round DB 已退役〕）+ 码单池联动
 * Round DB（2026-10-16）：拉取正常场景去重只留 204-13824814——退役 204-13825501（短收）/ FK5XSG01484628-1（全核对通过），_migDB 幂等清老会话
 *   （9419121/223342530 标已下载联动、删池单 9384236、补 dlFail 池单 9419124）；精简不一致冗余演示单 9384236/4VS26091000041665；
 *   分支验证清单=仓库根 verification/pul-fms/arrive-branches.html（37 分支待办）
 * Round CB（2026-10-14 批1 采购域收尾：入库单+退货单演示数据）：入库快照单 204-13826100（反审核+到货单缺失重建）、
 *   FK5XSG01481687-1 码 000220062 预置 phLoc=M-01（码已入药房拦截）、退货 TH20261013001 已审核（引用拦截+终态+ro 态）、
 *   TH20261014002 干净可审（refOrder=204-13832933，审核通过+关联列）、TH20261014003 解析失败（删除该码）；
 *   清单=verification/pul-fms/purchase-in-branches.html + purchase-out-branches.html
 * 状态经 store（sessionStorage）持久化，跨页联动：到货单审核→生成已审核入库单；入库单反审核→删除并回链到货单待审核；异常维护→解析恢复
 */
(function () {
  'use strict';

  var V = window.PUL_VOCAB.ST;   // 状态词表常量（store.js 先行加载）

  // ===== 标识码字典（药品主子表之"子"：一条药品 ↔ 多条标识码；前 7 位 = 产品资源码） =====
  var IDCODE_DICT = [
    { idcode: '8400431', level: 1, drugName: '乳酸依沙吖啶溶液', formSpec: '0.1%', packSpec: '盒1瓶', maker: '北京京丰制药（河北）有限公司', approval: '国药准字H23023728', drugCode: 'YP010201', ipUnpack: '否', opUnpack: '否', unit: '盒' },
    { idcode: '8461935', level: 1, drugName: '依姆多', formSpec: '60mg', packSpec: '盒7片', maker: '华益药业科技(安徽)有限公司', approval: '国药准字H20030418', drugCode: 'YP010245', ipUnpack: '否', opUnpack: '是', unit: '盒' },
    { idcode: '8433386', level: 1, drugName: '健脾生血片', formSpec: '每片含硫酸亚铁100mg', packSpec: '盒3板', maker: '健民集团叶开泰国药(随州)有限公司', approval: '国药准字Z19991066', drugCode: 'YP010312', ipUnpack: '是', opUnpack: '是', unit: '盒' },
    { idcode: '8414784', level: 1, drugName: '加罗新', formSpec: '100ml:盐酸替罗非班5mg', packSpec: '箱60瓶', maker: '四川科伦药业股份有限公司', approval: '国药准字H20203013', drugCode: 'YP010388', ipUnpack: '否', opUnpack: '否', unit: '箱' },
    { idcode: '8416917', level: 1, drugName: '唯可来', formSpec: '100mg', packSpec: '盒28片', maker: 'AbbVie Ireland NL B.V.', approval: '国药准字HJ20200055', drugCode: 'YP010401', ipUnpack: '否', opUnpack: '否', unit: '盒' },
    { idcode: '8130779', level: 1, drugName: '复方氨基酸注射液(3AA)', formSpec: '250ml:10.65g(总氨基酸)', packSpec: '箱30瓶', maker: '山东齐都药业有限公司', approval: '国药准字H20063949', drugCode: 'YP010477', ipUnpack: '否', opUnpack: '否', unit: '箱' },
    { idcode: '8441916', level: 1, drugName: '复方甘草口服溶液', formSpec: '复方', packSpec: '盒90毫升', maker: '福州海王金象中药制药有限公司', approval: '国药准字H35020932', drugCode: 'YP010529', ipUnpack: '否', opUnpack: '是', unit: '盒' }
  ];

  // 拼 20 位码：标识码(7) + 序列号(9) + 校验位(4)
  function mk(idcode, serial, check) { return idcode + serial + check; }
  // 码记录（老系统「码详情」字段：拆零/拆零数/批次号/生产日期/有效期至/已验收/二三级码/库位）
  function code(idcode, serial, check, batch, prod, exp, extra) {
    return Object.assign({ code: mk(idcode, serial, check), level: 1, split: '否', splitQty: '',
      batch: batch, prodDate: prod, expDate: exp, checked: false, code2: '', code3: '', location: '' }, extra || {});
  }

  // ===== 采购到货单（院内单据：来源=「下载单据」拉取 / 手动新增；downloaded='是' 表示已审核入库） =====
  // 字段对齐老系统「药品销售管理」：单据编号/单据时间/单据类型/发货企业/收货企业/确认状态
  // 状态由数据推导（不冗余状态字段）：已退货 > 已入库(downloaded='是') > 待审核；异常码=可叠加的阻断标记（第二维，审核守卫=全部码解析成功）
  var ARRIVE_ORDERS = [
    // ===== Round CO（2026-10-15 用户拍板：模拟数据收敛，列表每种大场景保留一条，解析异常全部集中到 223342530） =====
    // ===== Round CA 演示单（2026-10-14）：四分支补齐——全分支验证清单见仓库根 verification/pul-fms/arrive-branches.html =====
    // 手动·扫码空单：来源徽标「手动·扫码」+ 审核拦截「码清单为空且计划数量为 0」+ 手动未扫码删除钮（一单三用）
    { orderNo: 'DH20261014001', orderTime: '2026-10-14 09:00:00', supplier: '三明鹭燕医药有限公司', shipper: '三明鹭燕医药有限公司', receiver: '中心院区', docType: '销售出库', source: '手动', confirm: '未确认', downloaded: '否', dlStatus: '成功', invoice: '', warehouse: '中心库', loc: 'A-01',
      items: [], codes: [] },
    // 下载失败演示单（列表直出，此前需进下载弹窗手动下载才可见）：审核拦截 + 行内重新下载 + 删除释放码单池
    { orderNo: '9419121', orderTime: '2026-09-30 10:19:37', supplier: '福建三明同春医药有限公司', shipper: '福建三明同春医药有限公司', receiver: '中心院区', docType: '销售出库', source: '拉取', confirm: '未确认', downloaded: '否',
      dlStatus: '失败', dlError: '供应商平台接口超时，码单明细下载失败', invoice: '', warehouse: '中心库', loc: 'A-01', codes: [] },
    // 解析异常演示单（2026-10-15 Round CO 全异常集中，列表每场景一条）：①唯可来 000220061 与入库单 FK5XSG01481687-1 重复 → 库存码已存在；
    // ②8999001 标识码未维护 → 解析失败（下载带来批次/效期，码详情五字段有值）；③8999002 标识码未维护且五字段全空 → 行内「编辑」人工补录保存转正常码（manualFix）
    { orderNo: '223342530', orderTime: '2026-09-30 14:52:52', supplier: '华润（三明）医药有限公司', shipper: '华润东大(福建)医药有限公司', receiver: '中心院区', docType: '销售出库', source: '拉取', confirm: '未确认', downloaded: '否', dlStatus: '成功', invoice: 'FP2026093002', warehouse: '中心库', loc: 'A-01',
      codes: [code('8461935', '000118830', '7741', '240516', '2024-06-10', '2027-06-09'), code('8461935', '000118831', '7742', '240516', '2024-06-10', '2027-06-09'),
              code('8416917', '000220050', '1201', '241105', '2024-11-20', '2027-11-19'), code('8416917', '000220061', '1201', '241105', '2024-11-20', '2027-11-19'),
              code('8999001', '000000001', '9999', '250600', '2025-06-01', '2028-05-31'),
              code('8999002', '000000001', '8888', '', '', '')] },
    { orderNo: '204-13824814', orderTime: '2026-09-11 17:13:05', supplier: '三明鹭燕医药有限公司', shipper: '三明鹭燕医药有限公司', receiver: '中心院区', docType: '销售出库', source: '拉取', confirm: '未确认', downloaded: '否', invoice: 'FP2026091102', warehouse: '中心库', loc: 'A-01',
      codes: [code('8400431', '002611300', '3301', '601753', '2025-02-26', '2028-01-31'), code('8400431', '002611301', '3302', '601753', '2025-02-26', '2028-01-31')] },
    { orderNo: '204-13807319', orderTime: '2026-09-09 09:15:00', supplier: '三明鹭燕医药有限公司', shipper: '三明鹭燕医药有限公司', receiver: '中心院区', docType: '销售出库', source: '拉取', confirm: '已确认', downloaded: '是', invoice: 'FP2026090901', warehouse: '中心库', loc: 'A-01', auditDate: '2026-09-09 16:20', auditor: '王铁军',
      codes: [code('8414784', '000770201', '7701', '250702', '2025-07-10', '2027-07-09', { checked: true, location: 'A-01-02' }),
              code('8414784', '000770202', '7702', '250702', '2025-07-10', '2027-07-09', { checked: true, location: 'A-01-03' })] },
    // 2026-10-16 Round DB 用户拍板「场景数据重复，去掉重复的」：拉取正常场景只留 204-13824814（2 码未核对——直接审批翻转/编辑弹窗/扫码核对
    // 全链测试锚点），退役 204-13825501（短收）与 FK5XSG01484628-1（全核对通过）——短收/审核通过/编辑下限分支由 audit-leftover、
    // audit-pass、edit-floor-block 测试在 204-13824814 上预写态复验；分支分工见 verification/pul-fms/arrive-branches.html
    // 2026-10-11 Round BI 清单录入演示单：手动单 + items 计划清单（qty=库存单位数量）、码清单空 → 统一扫码「采购入库」队列核对录入（有清单无码单格）
    // （⚠️ 必须保持数组末位——_migBI 用 ARRIVE_ORDERS[length-1] 取本单注入老会话）
    { orderNo: 'DH20261011001', orderTime: '2026-10-11 09:30:00', supplier: '三明鹭燕医药有限公司', shipper: '三明鹭燕医药有限公司', receiver: '中心院区', docType: '销售出库', source: '手动', confirm: '未确认', downloaded: '否', dlStatus: '成功', invoice: '', warehouse: '中心库', loc: 'A-01',
      items: [{ drugCode: 'YP010201', qty: 2 }, { drugCode: 'YP010245', qty: 1 }], codes: [] }
  ];

  // ===== 供应商平台码单池（外网自助平台，「下载单据」弹窗数据源；pulled='是' 表示已下载到院内到货单） =====
  // dlFail='是'：演示「下载失败」（接口超时）——首次下载生成 dlStatus='失败' 的到货单（无码明细），行内「重新下载」后成功（2026-10-07）
  // '223342530' 末码 8416917-000220061 与入库单 FK5XSG01481687-1 重复：演示「库存码已存在」异常（下载后自动校验，审核硬拦）
  var PLATFORM_POOL = [
    { orderNo: 'FK5XSG01484347-1', orderTime: '2026-09-30 21:43:25', supplier: '三明九州通医药有限公司', shipper: '三明九州通医药有限公司', pulled: '否', invoice: 'FP2026093001',
      codes: [code('8400431', '002611400', '3301', '601753', '2025-02-26', '2028-01-31'), code('8400431', '002611401', '3302', '601753', '2025-02-26', '2028-01-31')] },
    { orderNo: '223342530', orderTime: '2026-09-30 14:52:52', supplier: '华润（三明）医药有限公司', shipper: '华润东大(福建)医药有限公司', pulled: '是', invoice: 'FP2026093002',   // Round CA：标已下载——与列表库存码已存在演示单联动
      codes: [code('8461935', '000118830', '7741', '240516', '2024-06-10', '2027-06-09'), code('8461935', '000118831', '7742', '240516', '2024-06-10', '2027-06-09'), code('8416917', '000220050', '1201', '241105', '2024-11-20', '2027-11-19'),
              code('8416917', '000220061', '1201', '241105', '2024-11-20', '2027-11-19')] },
    { orderNo: '9419121', orderTime: '2026-09-30 10:19:37', supplier: '福建三明同春医药有限公司', shipper: '福建三明同春医药有限公司', pulled: '是', invoice: '', dlFail: '是',   // Round CA：标已下载——与列表下载失败演示单联动（重新下载/删除释放链路通）
      codes: [code('8441916', '000410100', '6601', '250518', '2025-05-20', '2028-05-19'), code('8441916', '000410101', '6602', '250518', '2025-05-20', '2028-05-19')] },
    { orderNo: '4VS26093000006264', orderTime: '2026-09-30 00:00:00', supplier: '国药控股三明有限公司', shipper: '国药控股三明有限公司', pulled: '否', invoice: 'FP2026093004',
      codes: [code('8433386', '000550110', '8801', '250302', '2025-03-15', '2028-03-14')] },
    // Round CA 新增：下载失败演示单（下载弹窗侧——9419121 已挪列表，池里保一张未下载的 dlFail 单；避开 9419122=「更新列表」运行时拉新单）
    { orderNo: '9419124', orderTime: '2026-10-13 16:08:22', supplier: '福建三明同春医药有限公司', shipper: '福建三明同春医药有限公司', pulled: '否', invoice: '', dlFail: '是',
      codes: [code('8441916', '000410110', '6603', '250518', '2025-05-20', '2028-05-19'), code('8441916', '000410111', '6604', '250518', '2025-05-20', '2028-05-19')] }
  ];

  // ===== 采购入库单（纯结果记录：到货单「审核入库」时生成，全部已审核；反审核=删除本单并回链到货单待审核） =====
  // hisPush（HIS 推送）/ miPush（医保推送）：未推送 → 行内「推送HIS / 推送医保」；已推送可重推；不推送=人工标记跳过
  var IN_DOCS = [
    // Round CB 反审核演示单：到货单缺失（快照单）→ 反审核成功 + 按入库单快照重建到货单（purchase-in 反审核兜底分支）
    { billNo: '204-13826100', date: '2026-10-13 10:35', supplier: '三明九州通医药有限公司', shipper: '三明九州通医药有限公司', receiver: '中心院区', invoice: 'FP2026101305', warehouse: '中心库', location: 'A-01-02',
      audit: V.AUDITED, hisPush: '未推送', miPush: '未推送', downloadTime: '2026-10-13 10:35', auditDate: '2026-10-13 11:02', auditor: '王铁军', source: '下载',
      codes: [code('8461935', '000118840', '7743', '240516', '2024-06-10', '2027-06-09', { checked: true, location: 'A-01-02' }),
              code('8461935', '000118841', '7744', '240516', '2024-06-10', '2027-06-09', { checked: true, location: 'A-01-02' }),
              code('8414784', '000770210', '7711', '250702', '2025-07-10', '2027-07-09', { checked: true, location: 'A-01-02' })] },
    { billNo: '204-13898695', date: '2026-09-22 18:20', supplier: '三明鹭燕医药有限公司', shipper: '三明鹭燕医药有限公司', receiver: '中心院区', invoice: '91350424', warehouse: '中心库', location: 'B-01-01',
      audit: V.AUDITED, hisPush: '未推送', miPush: '未推送', downloadTime: '2026-09-22 18:20', auditDate: '2026-09-23 10:22', auditor: '王铁军', source: '下载',
      codes: [code('8433386', '000550201', '8801', '251202', '2025-12-04', '2027-11-30', { checked: true, location: 'B-01-01' }),
              code('8433386', '000550202', '8802', '251202', '2025-12-04', '2027-11-30', { checked: true, location: 'B-01-01' })] },
    { billNo: 'FK5XSG01481687-1', date: '2026-09-14 19:00', supplier: '三明九州通医药有限公司', shipper: '三明九州通医药有限公司', receiver: '中心院区', invoice: '91350424', warehouse: '中心库', location: 'A-02-03',
      audit: V.AUDITED, hisPush: '未推送', miPush: '未推送', downloadTime: '2026-09-14 19:00', auditDate: '2026-09-14 19:57', auditor: '王铁军', source: '下载',
      codes: [code('8416917', '000220061', '1201', '241105', '2024-11-20', '2027-11-19', { checked: true, location: 'A-02-03' }),
              code('8416917', '000220062', '1202', '241105', '2024-11-20', '2027-11-19', { checked: true, location: 'A-02-03', phLoc: 'M-01' })] },   // 末码 phLoc：已入药房上架（Round CB 反审核「码已入药房」拦截演示）
    { billNo: '204-13832933', date: '2026-09-14 18:20', supplier: '三明鹭燕医药有限公司', shipper: '三明鹭燕医药有限公司', receiver: '中心院区', invoice: 'FP2026091403', warehouse: '中心库', location: 'A-01-04',
      audit: V.AUDITED, hisPush: '已推送', miPush: '未推送', downloadTime: '2026-09-14 18:20', auditDate: '2026-09-14 19:58', auditor: '王铁军', source: '下载',
      codes: [code('8441916', '000410120', '6601', '250518', '2025-05-20', '2028-05-19', { checked: true, location: 'A-01-04' }),
              code('8441916', '000410121', '6602', '250518', '2025-05-20', '2028-05-19', { checked: true, location: 'A-01-04' })] },
    { billNo: '204-13807319', date: '2026-09-09 16:20', supplier: '三明鹭燕医药有限公司', shipper: '三明鹭燕医药有限公司', receiver: '中心院区', invoice: 'FP2026090901', warehouse: '中心库', location: 'A-01',
      audit: V.AUDITED, hisPush: '已推送', miPush: '已推送', downloadTime: '2026-09-09 16:20', auditDate: '2026-09-09 16:20', auditor: '王铁军', source: '下载',
      codes: ARRIVE_ORDERS.filter(function (o) { return o.orderNo === '204-13807319'; })[0].codes.map(function (c) { return Object.assign({}, c); }) }
  ];

  // ===== 采购退货单（逆向：库房在架 → 退回供应商） =====
  // 2026-10-12 Round BL：无库存码并入统一异常码 badCodes（审核硬拦、移除放行，对齐其他入库未解析码口径）
  // 2026-10-13 Round BU：到货退货功能删除（用户拍板——到货未入库直接删到货单即可）；单一只「库房退货」类型
  var OUT_DOCS = [
    // ===== Round CB 退货演示单三张：可审通过 / 解析失败 / 已审核终态（全分支清单见 verification/pul-fms/purchase-out-branches.html） =====
    // 干净可审单：2 码已核对无异常 → 审核通过扣架演示；refOrder 回链 204-13832933（关联列+流转「在途退货单复用」跳转演示）
    { billNo: 'TH20261014002', date: '2026-10-14 09:25:00', supplier: '三明鹭燕医药有限公司', shipper: '三明鹭燕医药有限公司', receiver: '中心院区', warehouse: '中心库', type: '库房退货', refOrder: '204-13832933',
      status: '未审核', auditTime: '', auditor: '',
      codes: [code('8441916', '000410120', '6601', '250518', '2025-05-20', '2028-05-19', { checked: true, location: 'A-01-04' }),
              code('8441916', '000410121', '6602', '250518', '2025-05-20', '2028-05-19', { checked: true, location: 'A-01-04' })],
      badCodes: [] },
    // 解析失败单：末码 8999001 系未维护标识码 → 「删除该码」演示 + 审核解析失败硬拦
    { billNo: 'TH20261014003', date: '2026-10-14 10:05:00', supplier: '国药控股三明有限公司', shipper: '国药控股三明有限公司', receiver: '中心院区', warehouse: '中心库', type: '库房退货', refOrder: '',
      status: '未审核', auditTime: '', auditor: '',
      codes: [code('8433386', '000550203', '8803', '251202', '2025-12-04', '2027-11-30', { checked: true, location: 'B-01-01' }),
              code('8999001', '000000002', '9998', '250600', '2025-06-01', '2028-05-31', { checked: true })],
      badCodes: [] },
    // 已审核终态单：引用 204-13898695 的码 000550202 → 入库单反审核「被已审核退货单引用」拦截演示 + 退货单已审核终态/ro 态
    // （引用码避用 000550201——_t-scan-hub 第 9 节退货场景扫它「在架自由码加入」，已审核退货预扣会致 bad）
    { billNo: 'TH20261013001', date: '2026-10-13 14:20:15', supplier: '三明鹭燕医药有限公司', shipper: '三明鹭燕医药有限公司', receiver: '中心院区', warehouse: '中心库', type: '库房退货', refOrder: '204-13898695',
      status: V.AUDITED, auditTime: '2026-10-13 15:02', auditor: '王铁军',
      codes: [code('8433386', '000550202', '8802', '251202', '2025-12-04', '2027-11-30', { checked: true, location: 'B-01-01' })],
      badCodes: [] },
    { billNo: '202609110002', date: '2026-09-11 14:09:59', supplier: '三明鹭燕医药有限公司', shipper: '三明鹭燕医药有限公司', receiver: '中心院区', warehouse: '中心库', type: '库房退货', refOrder: '',
      status: '未审核', auditTime: '', auditor: '',
      codes: [code('8414784', '000770202', '7702', '250702', '2025-07-10', '2027-07-09', { checked: true, location: 'A-01-03' })],
      badCodes: [{ code: '8400431002599999001', reason: '无库存码：库存不存在该码（扫码时本库在架不存在）', time: '2026-09-11 14:12' }] }
  ];

  // ===== 异常标识码（跨单据台账；异常信息 = 未维护标识码：xxxxxxx） =====
  var BAD_CODES = [
    { idcode: '8631149', level: 2, drugName: '乳酸依沙吖啶溶液', formSpec: '0.1%', packSpec: '盒1瓶', maker: '北京京丰制药（河北）有限公司', approval: '国药准字H23023728', type: '未维护标识码' },
    { idcode: '8419479', level: 1, drugName: '乳酸依沙吖啶溶液', formSpec: '0.1%', packSpec: '盒1瓶', maker: '北京京丰制药（河北）有限公司', approval: '国药准字H23023728', type: '未维护标识码' },
    { idcode: '8461936', level: 1, drugName: '依姆多', formSpec: '60mg', packSpec: '盒7片', maker: '华益药业科技(安徽)有限公司', approval: '国药准字H20030418', type: '未维护标识码' },
    { idcode: '8433387', level: 2, drugName: '健脾生血片', formSpec: '每片含硫酸亚铁100mg', packSpec: '盒3板', maker: '健民集团叶开泰国药(随州)有限公司', approval: '国药准字Z19991066', type: '未维护标识码' },
    { idcode: '8999001', level: 1, drugName: '（未知药品）', formSpec: '-', packSpec: '-', maker: '-', approval: '-', type: '解析失败' }
  ];

  // ===== 状态持久化：store 命名空间 pch；首次用种子 =====
  // 迁移：老会话已存的 pch 缺新字段时补默认值（新增字段只加不改，保证迁移友好）
  // 2026-10-02 流程重构：入库单改为「到货单审核时直接生成的结果记录」——
  // 旧会话里 audit='未审核' 的 inDocs 折返：验收态并回对应到货单（无对应到货单则重建），入库单删除；
  // audit='已退货' 的冲销记录直接丢弃（到货单已是已退货终态）
  function migrate(s) {
    (s.arrive || []).forEach(function (o) {
      if (!o.docType) o.docType = '销售出库';
      // 2026-10-13 Round BT：收货方=院区（中心院区），旧值「云岭总医院」一并刷新
      if (!o.receiver || o.receiver === '云岭总医院') o.receiver = '中心院区';
      if (!o.confirm) o.confirm = o.downloaded === '是' ? '已确认' : '未确认';
      if (!o.source) o.source = '拉取';
      // 2026-10-03 收货事实字段（到货库房/库位）：建单/下载时确定，审核前可编辑
      if (o.warehouse === undefined) o.warehouse = '';
      if (o.loc === undefined) o.loc = '';
      // 2026-10-07 下载状态：成功 | 失败（供应商平台接口异常，码明细未下载，可「重新下载」）
      if (!o.dlStatus) o.dlStatus = '成功';
      // 2026-10-11 Round BI 清单录入模式：计划清单字段（无=扫码录入单）
      if (!o.items) o.items = [];
    });
    // 2026-10-11 Round BI 演示种子补丁（一次性标记，用户删单不复活）：清单录入演示单
    if (!s._migBI) {
      s._migBI = 1;
      if (!(s.arrive || []).some(function (o) { return o.orderNo === 'DH20261011001'; })) {
        var demo = ARRIVE_ORDERS[ARRIVE_ORDERS.length - 1];
        (s.arrive = s.arrive || []).unshift(Object.assign({}, demo, {
          items: demo.items.map(function (it) { return Object.assign({}, it); }), codes: [] }));
      }
    }
    // 2026-10-15 Round CO 种子收敛补丁（一次性标记）：①异常集中——223342530 按码值幂等补 8999001（解析失败·五字段有值）+8999002（五字段全空）；
    // ②退役 FK5XSG01481340-1（解析失败并入 223342530）/ 204-13824815（已审核场景并入 204-13807319，其入库单同步退役）
    if (!s._migCO2) {   // Round CP：标记升级重跑——_migCO 曾被中途部署烧进老会话
      s._migCO2 = 1;
      var tgt = (s.arrive || []).filter(function (o) { return o.orderNo === '223342530'; })[0];
      if (tgt) {
        [['8999001', '000000001', '9999', '250600', '2025-06-01', '2028-05-31'], ['8999002', '000000001', '8888', '', '', '']].forEach(function (a) {
          var cd = a[0] + a[1] + a[2];
          if (!(tgt.codes || []).some(function (c) { return c.code === cd; }))
            tgt.codes.push({ code: cd, level: 1, split: '否', splitQty: '', batch: a[3], prodDate: a[4], expDate: a[5], checked: false, code2: '', code3: '', location: '' });
        });
      }
      var RET = ['FK5XSG01481340-1', '204-13824815', 'DH20261015001'];
      s.arrive = (s.arrive || []).filter(function (o) { return RET.indexOf(o.orderNo) === -1; });
      s.inDocs = (s.inDocs || []).filter(function (d) { return RET.indexOf(d.billNo) === -1; });
    }
    // 已入库老数据：从对应入库单回填库房/库位/发票号（幂等）
    (s.arrive || []).forEach(function (o) {
      if (o.downloaded === '是' && !o.warehouse) {
        var hit = (s.inDocs || []).filter(function (x) { return x.billNo === o.orderNo; })[0];
        if (hit) { o.warehouse = hit.warehouse || ''; o.loc = hit.location || o.loc; if (!o.invoice) o.invoice = hit.invoice || ''; }
      }
    });
    (s.outDocs || []).forEach(function (d) {
      if (!d.type) { d.type = '库房退货'; d.refOrder = d.refOrder || ''; }
      // 2026-10-12 Round BL：审核人字段兜底 + 无库存码并入统一异常码 badCodes（审核硬拦口径）
      if (d.auditor === undefined) d.auditor = '';
      if (!d.badCodes) d.badCodes = [];
      // 2026-10-13 Round BU：发货方/收货方字段（老会话从 supplier 带出，收货方=院区）
      if (!d.shipper) d.shipper = d.supplier;
      if (!d.receiver) d.receiver = '中心院区';
      (d.noStock || []).forEach(function (cd) {
        if (!d.badCodes.some(function (b) { return b.code === cd; })) {
          d.badCodes.push({ code: cd, reason: '无库存码：库存不存在该码（扫码时本库在架不存在）', time: '' });
        }
      });
      if (d.noStock) delete d.noStock;
    });
    // 2026-10-13 Round BP 演示种子补丁（一次性标记，用户删单不复活）：可审核通过演示单（码已核对·计划=扫码·无异常）
    if (!s._migBP) {
      s._migBP = 1;
      var demoBP = null;
      ARRIVE_ORDERS.forEach(function (o) { if (o.orderNo === 'FK5XSG01484628-1') demoBP = o; });
      if (demoBP && !(s.arrive || []).some(function (o) { return o.orderNo === 'FK5XSG01484628-1'; })) {
        (s.arrive = s.arrive || []).unshift(Object.assign({}, demoBP, {
          codes: demoBP.codes.map(function (c) { return Object.assign({}, c); }) }));
      }
    }
    // 2026-10-13 Round BU：到货退货功能删除——老会话清掉存量的到货退货单（含 _migBL 演示单 TH20261012001），
    // 被标「已退货」的到货单复位回未确认（可删可审）；关联码 unChecked 复位（整单带出时置过 checked=true）
    (s.outDocs = (s.outDocs || []).filter(function (d) { return d.type !== '到货退货'; }));
    (s.arrive || []).forEach(function (o) {
      if (o.confirm === '已退货') {
        o.confirm = '未确认';
        (o.codes || []).forEach(function (c) { if (!o.downloaded || o.downloaded !== '是') c.checked = false; });
      }
    });
    (s.inDocs || []).forEach(function (d) {
      if (d.location === undefined) d.location = '';
      // 2026-10-03 推送双通道 + 流转：老会话补默认值（已审核入库单历史口径 HIS 已推送）
      if (d.hisPush === undefined) d.hisPush = '已推送';
      if (d.miPush === undefined) d.miPush = '未推送';
      // 2026-10-13 Round BT：发货方/收货方字段（老会话从 supplier 带出，收货方=院区）
      if (!d.shipper) d.shipper = d.supplier;
      if (!d.receiver) d.receiver = '中心院区';
    });
    if (!s.platform) s.platform = PLATFORM_POOL.map(function (p) {
      return Object.assign({}, p, { codes: p.codes.map(function (c) { return Object.assign({}, c); }) });
    });
    // 2026-10-07 演示种子补丁（幂等，旧会话补）：9419121=下载失败演示；223342530 末码与入库单 FK5XSG01481687-1 重复=「库存码已存在」演示
    (s.platform || []).forEach(function (p) {
      if (p.orderNo === '9419121' && !p.dlFail) p.dlFail = '是';
      if (p.orderNo === '223342530' && p.pulled !== '是' &&
          !(p.codes || []).some(function (c) { return c.code === mk('8416917', '000220061', '1201'); })) {
        p.codes.push(code('8416917', '000220061', '1201', '241105', '2024-11-20', '2027-11-19'));
      }
    });
    // 2026-10-14 Round CA 演示种子补丁（一次性标记，用户删单不复活）：四分支演示单直出列表 + 码单池联动
    if (!s._migCA) {
      s._migCA = 1;
      // ① 精简 2 张数量不一致冗余演示单（仅未审核态才删，用户已审核过的单不动）
      s.arrive = (s.arrive || []).filter(function (o) {
        return !(o.downloaded !== '是' && (o.orderNo === '9384236' || o.orderNo === '4VS26091000041665'));
      });
      // ② 4 张新演示单不存在才注入（倒序 unshift → 空单/短收/下载失败/库存码已存在 置顶）
      ARRIVE_ORDERS.filter(function (o) {
        return ['DH20261014001', '204-13825501', '9419121', '223342530'].indexOf(o.orderNo) > -1;
      }).slice().reverse().forEach(function (d) {
        if (!(s.arrive || []).some(function (o) { return o.orderNo === d.orderNo; })) {
          (s.arrive = s.arrive || []).unshift(Object.assign({}, d, {
            items: (d.items || []).map(function (it) { return Object.assign({}, it); }),
            codes: (d.codes || []).map(function (c) { return Object.assign({}, c); }) }));
        }
      });
      // ③ 码单池联动：9419121/223342530 标已下载；删池单 9384236；补 dlFail 池单 9419124
      (s.platform = s.platform || []).forEach(function (p) {
        if (p.orderNo === '9419121' || p.orderNo === '223342530') p.pulled = '是';
      });
      s.platform = s.platform.filter(function (p) { return p.orderNo !== '9384236'; });
      if (!s.platform.some(function (p) { return p.orderNo === '9419124'; })) {
        var p4 = null;
        PLATFORM_POOL.forEach(function (p) { if (p.orderNo === '9419124') p4 = p; });
        if (p4) s.platform.push(Object.assign({}, p4, { codes: p4.codes.map(function (c) { return Object.assign({}, c); }) }));
      }
    }
    // 2026-10-16 Round DB 种子再收敛补丁（一次性标记）：退役拉取重复场景单 204-13825501（短收）/ FK5XSG01484628-1（全核对通过），
    // 拉取正常场景统一由 204-13824814 承载；仅未审核态才删（用户已审核过的单与入库结果台账不动）
    if (!s._migDB) {
      s._migDB = 1;
      var RET_DB = ['204-13825501', 'FK5XSG01484628-1'];
      s.arrive = (s.arrive || []).filter(function (o) {
        return !(o.downloaded !== '是' && RET_DB.indexOf(o.orderNo) > -1);
      });
    }
    // 2026-10-14 Round CB 演示种子补丁（一次性标记）：入库反审核三分支 + 退货三演示单
    if (!s._migCB) {
      s._migCB = 1;
      // ① FK5XSG01481687-1 码 000220062 补 phLoc（药房上架态）
      (s.inDocs || []).forEach(function (d) {
        if (d.billNo === 'FK5XSG01481687-1') (d.codes || []).forEach(function (c) {
          if (c.code === mk('8416917', '000220062', '1202') && !c.phLoc) c.phLoc = 'M-01';
        });
      });
      // ② 入库快照单不存在才注入（用户删单不复活）
      var cbIn = IN_DOCS.filter(function (d) { return d.billNo === '204-13826100'; })[0];
      if (cbIn && !(s.inDocs || []).some(function (x) { return x.billNo === '204-13826100'; })) {
        (s.inDocs = s.inDocs || []).unshift(Object.assign({}, cbIn, { codes: cbIn.codes.map(function (c) { return Object.assign({}, c); }) }));
      }
      // ③ 退货三演示单不存在才注入
      OUT_DOCS.filter(function (d) { return /^TH202610/.test(d.billNo); }).forEach(function (d) {
        if (!(s.outDocs || []).some(function (x) { return x.billNo === d.billNo; })) {
          (s.outDocs = s.outDocs || []).unshift(Object.assign({}, d, {
            codes: d.codes.map(function (c) { return Object.assign({}, c); }),
            badCodes: (d.badCodes || []).map(function (b) { return Object.assign({}, b); }) }));
        }
      });
    }
    var keep = [];
    (s.inDocs || []).forEach(function (d) {
      if (d.audit === V.AUDITED) { keep.push(d); return; }
      if (d.audit === '已退货') return;
      var o = null;
      (s.arrive || []).forEach(function (x) { if (x.orderNo === d.billNo) o = x; });
      if (o) {
        // 并回验收态（扫码/勾选进度保留），到货单回到可继续验收状态
        (o.codes || []).forEach(function (c) {
          (d.codes || []).forEach(function (dc) {
            if (dc.code === c.code) { c.checked = !!dc.checked; c.split = dc.split; c.splitQty = dc.splitQty; }
          });
        });
        o.downloaded = '否';
      } else {
        (s.arrive = s.arrive || []).unshift({ orderNo: d.billNo, orderTime: d.date || '', supplier: d.supplier, shipper: d.supplier,
          receiver: '中心院区', docType: '销售出库', source: d.source === '手动' ? '手动' : '拉取',
          confirm: '未确认', downloaded: '否', invoice: d.invoice || '',
          warehouse: d.warehouse || '', loc: d.location || '', codes: d.codes || [] });
      }
    });
    s.inDocs = keep;
    return s;
  }
  function load() {
    var s = window.store ? window.store.load() : {};
    // 字典唯一事实源已迁至 PUL_DRUG（drug-data.js 主子表）；s.dict 刷新为其 flat() 内存视图，调用方零改动
    if (window.PUL_DRUG && s.pch) { s.pch.dict = window.PUL_DRUG.flat(); return migrate(s.pch); }
    if (s.pch) return migrate(s.pch);
    var seed = { dict: IDCODE_DICT.slice(), arrive: ARRIVE_ORDERS, inDocs: IN_DOCS, outDocs: OUT_DOCS, badCodes: BAD_CODES, platform: PLATFORM_POOL };
    if (window.PUL_DRUG) seed.dict = window.PUL_DRUG.flat();
    if (window.store) window.store.update({ pch: seed });
    return seed;
  }
  function save(state) { if (window.store) window.store.update({ pch: state }); }

  // 库位预设（手动新增入库单「库位」下拉；真实场景来自库房维护的库位档案）
  var LOC_PRESET = ['A-01-01', 'A-01-02', 'A-01-03', 'B-02-01', 'B-02-02', '冷藏柜-01'];

  // ===== 码格式归一（2026-10-14 需求方图二：发码机构三格式 → 阿里标识码）=====
  // 阿里码：8 开头 20 位纯数字（标识码 7 + 序列 9 + 校验 4，现行口径）
  // GS1：'01' 开头纯数字——AI(01)+GTIN 14 位、AI(11) 生产日期 6 位定长、AI(17) 效期 6 位定长、AI(10) 批次不定长、AI(21) 序列号不定长
  // IDCODE：'MA.' 开头——.M 生产日期 / .E 有效期至 / .L 批次 / .S 序列号，.N 段=药品标识
  // 归一：GS1/IDCODE 按下方映射表转阿里标识码（真实环境由字典主数据维护映射；原型 mock 按图二示例绑定两种演示药品）
  var GS1_GTIN = { '06901234567890': '8461935' };   // 依姆多 盒码（图二 GS1 示例）
  var IDC_NSEG = { '123456C': '8400431' };          // 乳酸依沙吖啶溶液 盒码（图二 IDCODE 示例）
  function ymd(v) { return v && v.length === 6 ? '20' + v.slice(0, 2) + '-' + v.slice(2, 4) + '-' + v.slice(4, 6) : ''; }
  function parseCodeImpl(code, dict) {
    var s = String(code || '').trim();
    var d = dict || load().dict;
    function hit(id7) { var h = null; d.forEach(function (x) { if (x.idcode === id7) h = x; }); return h; }
    // 阿里 20 位
    if (/^\d{20}$/.test(s)) {
      var id7 = s.slice(0, 7);
      return { codeType: '阿里', idcode: id7, serial: s.slice(7, 16), check: s.slice(16), dict: hit(id7) };
    }
    // GS1（AI 顺序按图二示例 11/17/10/21；10/21 不定长=截到下一个已知 AI 或串尾，原型演示口径）
    if (/^01\d{14}(11|17|10|21)/.test(s)) {
      var gtin = s.slice(2, 16), batch = '', prod = '', exp = '', serial = '', rest = s.slice(16);
      while (rest.length >= 3) {
        var ai = rest.slice(0, 2);
        if (ai === '11' || ai === '17') {
          if (rest.length < 8) break;   // 定长 AI（2+6）不足整段
          if (ai === '11') prod = rest.slice(2, 8); else exp = rest.slice(2, 8);
          rest = rest.slice(8);
        } else if (ai === '10' || ai === '21') {
          var tail = rest.slice(2), m = tail.slice(2).search(/(11|17|10|21)\d{2}/);
          var val = m === -1 ? tail : tail.slice(0, m + 2);
          if (ai === '10') batch = val; else serial = val;
          rest = m === -1 ? '' : tail.slice(m + 2);
        } else break;
      }
      var id1 = GS1_GTIN[gtin] || '';
      return { codeType: 'GS1', idcode: id1, gtin: gtin, serial: serial, check: '',
        batch: batch, prodDate: ymd(prod), expDate: ymd(exp), dict: id1 ? hit(id1) : null };
    }
    // IDCODE（段结构 MA.156.M0.123456.N…C.M…E…L…S…；从第 4 段起取 M/E/L/N/S 首字母段）
    if (/^MA\./i.test(s)) {
      var seg = s.split('.'), f = {};
      for (var i2 = 3; i2 < seg.length; i2++) {
        var k = seg[i2].charAt(0).toUpperCase();
        if ('MELSN'.indexOf(k) > -1 && f[k] === undefined) f[k] = seg[i2].slice(1);
      }
      var id2 = IDC_NSEG[f.N] || '';
      return { codeType: 'IDCODE', idcode: id2, serial: f.S || '', check: '',
        batch: f.L || '', prodDate: ymd(f.M), expDate: ymd(f.E), dict: id2 ? hit(id2) : null };
    }
    // 兜底：按阿里口径取前 7 位（dict=null → 异常码，与现状一致）
    var id3 = s.slice(0, 7);
    return { codeType: '未知', idcode: id3, serial: s.slice(7, 16), check: s.slice(16), dict: hit(id3) };
  }

  window.PUL_PCH = {
    load: load, save: save, LOC_PRESET: LOC_PRESET,
    // 可选入库库房 = 组织树里类型含「库」的节点（中心库/分院库/麻精专库，排除药房）
    warehouses: function () {
      var out = [];
      (window.PUL ? window.PUL.ORG_TREE.children : []).forEach(function (yq) {
        (yq.children || []).forEach(function (n) { if (n.type.indexOf('库') !== -1) out.push(n.name); });
      });
      return out;
    },
    // 追溯码解析（三格式归一，见上方 parseCodeImpl 注释）：命中字典=药品信息；未命中=null → 异常码
    parseCode: parseCodeImpl,
    // 单据异常码 = 码清单里解析不到字典的码
    badCodesOf: function (doc, dict) {
      var self = this;
      return (doc.codes || []).filter(function (c) { return !self.parseCode(c.code, dict).dict; });
    },
    // 药品清单 = 码清单按 标识码+批次 聚合（双层表达：码 → 人读品规数量）
    // onlyChecked=true 时只聚合计已核对码（扫码数量口径，与列表「扫码数量」列同源）；缺省聚合计全部码（下载单据预览/编辑预填用）
    summarize: function (codes, dict, onlyChecked) {
      var self = this, map = {};
      (codes || []).forEach(function (c) {
        if (onlyChecked && !c.checked) return;
        var p = self.parseCode(c.code, dict);
        if (!p.dict) return;
        var key = p.idcode + '|' + c.batch;
        if (!map[key]) {
          map[key] = { idcode: p.idcode, drugName: p.dict.drugName, formSpec: p.dict.formSpec, packSpec: p.dict.packSpec, batch: c.batch,
            prodDate: c.prodDate, expDate: c.expDate, qty: 0, unit: p.dict.unit, approval: p.dict.approval, maker: p.dict.maker,
            drugCode: p.dict.drugCode, ipUnpack: p.dict.ipUnpack, opUnpack: p.dict.opUnpack };
        }
        map[key].qty += 1;
      });
      return Object.keys(map).map(function (k) { return map[k]; });
    },
    // 库房在架码 = 已审核入库 - 已审核退货（退货选码的数据源）
    stockCodes: function (state) {
      var inCodes = [];
      state.inDocs.forEach(function (d) {
        if (d.audit !== V.AUDITED) return;
        (d.codes || []).forEach(function (c) { inCodes.push(Object.assign({}, c, { supplier: d.supplier })); });
      });
      state.outDocs.forEach(function (d) {
        if (d.status !== V.AUDITED) return;
        (d.codes || []).forEach(function (rc) {
          inCodes = inCodes.filter(function (c) { return c.code !== rc.code; });
        });
      });
      return inCodes;
    }
  };
})();
