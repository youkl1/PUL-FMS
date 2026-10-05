/**
 * guide-data.js — 模块导览叙述数据：定位语 / 贯穿案例 / 流程图 / 菜单解说 / 正逆兜底分类
 * 单一职责：只放叙述数据；菜单清单、href、交付状态从 AppShell.NAV 派生，不在此重复
 * cat：fwd=正向 rev=逆向 fix=兜底 qry=查询；note：缺口标注（橙色⚠）
 * 2026-09-30 Round Z：模块与 NAV 组 1:1 对齐客户原文（org 并入 base；采购自 wh 拆出为 purchase；
 * 发药管理→出库管理并吸收损耗 2 项；新增拆分待补项 pickOut/shelfOff/invSumQ/trayAssignQ/trayItemQ/traySumQ）
 */
window.GUIDE_DATA = {
  order: [
    { key: 'base',     group: '基础管理', icon: 'book'      },
    { key: 'purchase', group: '采购管理', icon: 'truck'     },
    { key: 'wh',       group: '库房管理', icon: 'warehouse' },
    { key: 'ph',       group: '药房管理', icon: 'box'       },
    { key: 'disp',     group: '出库管理', icon: 'rx'        },
    { key: 'his',      group: 'HIS单据',  icon: 'search'    },
    { key: 'inv',      group: '盘点管理', icon: 'clipboard' },
    { key: 'ledger',   group: '台账管理', icon: 'chart'     },
    { key: 'mi',       group: '医保管理', icon: 'shield'    },
    { key: 'sys',      group: '系统管理', icon: 'key'       }
  ],
  modules: {
    base: {
      tagline: '组织架子 + 药品、码规则、设备——业务的弹药库',
      roles: '系统管理员 · 院区管理员 · 库管员',
      case: '滨海院区新开急诊药房：院区管理加节点 → 药品字典建「1盒=7片」→ 标识码定码规则 → 货位上架，当天即可开单',
      diagrams: [
        { f: '10-permission.svg', t: '权限模型 + 登录上下文', note: '组织树决定你能看哪些数据' },
        { f: '07-conversion.svg', t: '码⇄药⇄单位 全链路转换', note: '基本单位在药品字典，不在码上' },
        { f: '13-code-flow.svg',  t: '箱码全链路 · 码怎么转', note: '1箱=60盒、1盒=7片的码形态变化' }
      ],
      menus: {
        orgs:    { desc: '院区与节点维护',   cat: 'fwd' },
        wh:      { desc: '库房与货架库位',   cat: 'fwd' },
        phloc:   { desc: '药房与货位',       cat: 'fwd' },
        drug:    { desc: '药品档案+审核',    cat: 'fwd' },
        cabinet: { desc: '取药柜设备维护',   cat: 'fix' },
        lamp:    { desc: '基站灯组维护',     cat: 'fix' },
        idcode:  { desc: '追溯码规则维护',   cat: 'fwd' },
        slotQ:   { desc: '取药槽信息查询',   cat: 'qry' },
        dict:    { desc: '字典类型与项',     cat: 'fwd' }
      }
    },
    purchase: {
      tagline: '药从供应商到库房：订、收、退',
      roles: '库管员',
      case: '阿莫西林60盒到货 → 扫码/人工验收入库；不合格品扫码退供应商，异常码人工补录不卡单',
      diagrams: [
        { f: '02-purchase-in.svg', t: '采购到货入库（到货单一页走完）', note: '自动拉取/手动新增 → 扫码或免扫码验收 → 审核生成入库单' },
        { f: '17-purchase-state-machine.svg', t: '到货单进度状态机', note: '进度一维 + 异常第二维' }
      ],
      menus: {
        arrive:  { desc: '下载/验收/审核一页走完 · 异常码台账补录在页内', cat: 'fwd', fix: true },
        pin:     { desc: '入库结果台账·反审核',   cat: 'qry' },
        pquery:  { desc: '入库明细导出',     cat: 'qry' },
        pout:    { desc: '不合格退供应商',   cat: 'rev' },
        pOutQ:   { desc: '退货明细追踪',     cat: 'qry' }
      }
    },
    wh: {
      tagline: '库房货架上的收、存、发、退',
      roles: '库管员',
      case: '门诊领用2盒 → 按申请单拣货出库 → 库存58盒；效期≤180天预警、过期自动冻结',
      diagrams: [
        { f: '23-pick-unified-state-machine.svg', t: '领用单全链统一状态机', note: '五态主流水线+三入口+扫码直生捷径（原图18已并入）' },
        { f: '08-stock-derivation.svg', t: '库存推导（集合加减法）',   note: '库存=入库集合−出库集合' }
      ],
      menus: {
        othIn:     { desc: '无单入库·扫码（赠品等）', cat: 'fix' },
        whstock:   { desc: '效期/冻结一目了然',  cat: 'qry' },
        pick:      { desc: '按申请单拣货出库',   cat: 'fwd', note: '仅扫码 · 人工通道规划中' },
        quickScan: { desc: '高拍仪连续扫码直出', cat: 'fwd' },
        pickOut:   { desc: '出库单台账·审核跳转', cat: 'qry' },
        retIn:     { desc: '药房退回接收+库房直收', cat: 'rev' },
        othOut:    { desc: '无单出库（救急）',   cat: 'fix' },
        whOutQ:    { desc: '领用/其他出库明细',  cat: 'qry' }
      }
    },
    ph: {
      tagline: '药从库房到药房货架：领、收、上架',
      roles: '药房药师',
      case: '领用2盒到货 → 扫码入药房上架 → 在架2盒/14片；码扫不出 → 待上架查询排查',
      diagrams: [
        { f: '24-ph-full-loop.svg', t: '药房管理全流程泳道图', note: '三泳道全直线：正向+直生捷径+逆向（原图03/21已并入）' },
        { f: '23-pick-unified-state-machine.svg', t: '领用单全链统一状态机', note: '一套单据五态走全程 · 含扫码直生捷径（原图19已并入）' },
        { f: '20-ph-ret-state-machine.svg', t: '退回出库单进度状态机', note: '逆向 · 进度一维三态 + 撤销回路 · 草稿不扣账' },
        { f: '08-stock-derivation.svg', t: '库存推导（集合加减法）',   note: '药房库存同样按集合算' }
      ],
      menus: {
        req:      { desc: '向库房申领',     cat: 'fwd' },
        reqIn:    { desc: '领用到货入库',   cat: 'fwd' },
        shelfQ:   { desc: '上架异常排查',   cat: 'fix' },
        shelf:    { desc: '扫码上架',       cat: 'fwd' },
        light:    { desc: '补药指示灯亮',   cat: 'fwd' },
        shelfOff: { desc: '扫码下架',       cat: 'rev' },
        retOut:   { desc: '按领用出库单退回', cat: 'rev' },
        phloss:   { desc: '破损损耗登记',   cat: 'fix' },
        phstock:  { desc: '药房在架库存',   cat: 'qry' },
        phInQ:    { desc: '入库明细对账',   cat: 'qry' }
      }
    },
    disp: {
      tagline: '药到患者手里：赋码、发药、签收',
      roles: '药房药师 · 病区护士',
      case: '处方2片 → 拆零扫码发药 → 盒余5片；患者退1片 → 扫码回收',
      diagrams: [
        { f: '04-dispensing.svg', t: '药房发药全流程', note: '开方与实物时序分离 · 退改需解锁' }
      ],
      menus: {
        disp:        { desc: '扫码发药·拆零',     cat: 'fwd', note: '扫码为主 · 手动补绑兜底' },
        assign:      { desc: '处方逐条赋码',      cat: 'fwd' },
        assignBatch: { desc: '扫码枪故障兜底',    cat: 'fix' },
        assignQ:     { desc: '已赋码处方追踪',    cat: 'qry' },
        rxExc:       { desc: '补绑日结·改绑纠错', cat: 'fix' },
        rxItemQ:     { desc: '发药明细对账',      cat: 'qry' },
        rxAggQ:      { desc: '发药汇总统计',      cat: 'qry' },
        rxret:       { desc: '退药扫码回收',      cat: 'rev' },
        rxRetQ:      { desc: '退药记录追踪',      cat: 'qry' },
        tray:        { desc: '摆药单拣药',        cat: 'fwd' },
        trayAssignQ: { desc: '摆药赋码追踪',      cat: 'qry' },
        trayItemQ:   { desc: '摆药明细对账',      cat: 'qry' },
        traySumQ:    { desc: '摆药汇总统计',      cat: 'qry' },
        trayRet:     { desc: '摆药退回药房',      cat: 'rev' },
        trayRetQ:    { desc: '摆药退药记录',      cat: 'qry' },
        lossOut:     { desc: '过期/破损出口',     cat: 'fix' },
        lossQ:       { desc: '损耗明细追踪',      cat: 'qry' },
        wardSign:    { desc: '病区扫码签收',      cat: 'fwd', note: '拒收/退回规划中' }
      },
      xlinks: [
        { key: 'arrive', note: '发药扫码异常在到货单页「异常码台账」补录（采购管理）' }
      ]
    },
    his: {
      tagline: 'HIS 侧单据对账：处方、摆药的只读视图',
      roles: '药房药师 · 院区管理员',
      case: '医保对账日：按处方单号查张伟的处方 → 药品汇总核对发药总量，与 HIS 逐张对齐',
      diagrams: [],
      menus: {
        rxQ:     { desc: '处方单明细查询',   cat: 'qry' },
        rxSum:   { desc: '处方药品汇总',     cat: 'qry' },
        trayQ:   { desc: 'HIS异常时对账',    cat: 'qry' },
        traySum: { desc: '摆药单汇总对账',   cat: 'qry' }
      }
    },
    inv: {
      tagline: '账实核对：期初、盘点、盈亏出口',
      roles: '库管员 · 药房药师',
      case: '月末盘点：账面5片实数4片 → 盘亏1片出库；另1盒码损 → 无码药品记录',
      diagrams: [
        { f: '14-stocktake.svg', t: '盘点流程（期初→盘点→盈亏）', note: '本期新画' }
      ],
      menus: {
        invInit:   { desc: '系统上线建账',       cat: 'fwd' },
        inv:       { desc: '创建/录入/审核',     cat: 'fwd' },
        invGain:   { desc: '盘盈入库（+）',      cat: 'fwd' },
        invLoss:   { desc: '盘亏出库（−）',      cat: 'rev' },
        invQ:      { desc: '盈亏明细导出',       cat: 'qry' },
        invSumQ:   { desc: '盈亏汇总统计',       cat: 'qry' },
        invNocode: { desc: '无码/码损人工登记',  cat: 'fix' }
      },
      xlinks: [
        { key: 'arrive', note: '盘点发现的坏码在到货单页「异常码台账」补录（采购管理）' }
      ]
    },
    ledger: {
      tagline: '每盒药的去向都能查',
      roles: '全员 · 审计',
      case: '输入盒码 → 看这盒药从供应商到患者的全部轨迹',
      diagrams: [
        { f: '01-lifecycle.svg', t: '药品全生命周期总览', note: '一盒药的 6 站旅程' }
      ],
      menus: {
        ledger:  { desc: '进销存台账导出', cat: 'qry' },
        ledgerM: { desc: '月度结转汇总',   cat: 'qry' },
        ledgerQ: { desc: '季度账汇总',     cat: 'qry' },
        traceQ:  { desc: '单码全程追踪',   cat: 'fix' },
        flowQ:   { desc: '药品流向汇总',   cat: 'qry' }
      }
    },
    mi: {
      tagline: '追溯码上传医保平台（预留）',
      roles: '系统管理员',
      case: '政策要求：发药追溯码须上传医保平台，接口预留中，待政策细则落地后开通',
      diagrams: [],
      menus: {
        miUpload:  { desc: '上传医保平台',   cat: 'fwd' },
        miUploadQ: { desc: '上传结果对账',   cat: 'qry' }
      }
    },
    sys: {
      tagline: '谁能用什么功能、看哪些数据',
      roles: '系统管理员',
      case: '新入职药师：用户管理建号 → 分配「药房药师」角色 → 只见本药房数据',
      diagrams: [
        { f: '10-permission.svg', t: '权限模型 + 登录上下文', note: '功能权限与数据范围随角色生效' }
      ],
      menus: {
        perm:        { desc: '菜单启停与资源',   cat: 'fwd' },
        users:       { desc: '账号与角色分配',   cat: 'fwd' },
        roles:       { desc: '功能权限+数据范围', cat: 'fwd' },
        loginLog:    { desc: '登录成功/失败记录', cat: 'qry' },
        opLog:       { desc: '关键业务操作审计',   cat: 'qry' },
        cabSet:      { desc: '取药柜参数设置',   cat: 'fix' },
        pickLamp:    { desc: '取药指示灯配置',   cat: 'fix' },
        fillLampSet: { desc: '补药灯组设置',     cat: 'fix' },
        slotLampMap: { desc: '取药槽⇄灯组对照',  cat: 'fix' },
        slotDrugMap: { desc: '取药槽⇄药品对照',  cat: 'fix' }
      }
    }
  }
};
