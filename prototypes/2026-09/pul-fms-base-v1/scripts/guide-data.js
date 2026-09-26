/**
 * guide-data.js — 模块导览叙述数据：定位语 / 贯穿案例 / 流程图 / 菜单解说 / 正逆兜底分类
 * 单一职责：只放叙述数据；菜单清单、href、交付状态从 AppShell.NAV 派生，不在此重复
 * cat：fwd=正向 rev=逆向 fix=兜底 qry=查询；note：缺口标注（橙色⚠）
 */
window.GUIDE_DATA = {
  order: [
    { key: 'org',    group: '组织管理', icon: 'building'  },
    { key: 'base',   group: '基础管理', icon: 'book'      },
    { key: 'wh',     group: '库房管理', icon: 'warehouse' },
    { key: 'ph',     group: '药房管理', icon: 'box'       },
    { key: 'disp',   group: '发药管理', icon: 'rx'        },
    { key: 'his',    group: 'HIS单据',  icon: 'search'    },
    { key: 'inv',    group: '盘点管理', icon: 'clipboard' },
    { key: 'ledger', group: '台账管理', icon: 'chart'     },
    { key: 'mi',     group: '医保管理', icon: 'shield'    },
    { key: 'sys',    group: '系统管理', icon: 'key'       }
  ],
  modules: {
    org: {
      tagline: '三级架子：总院 → 院区 → 库房/药房',
      roles: '系统管理员 · 院区管理员',
      case: '滨海院区新开急诊药房：院区管理加节点 → 货位上架 → 当天即可开单',
      diagrams: [
        { f: '10-permission.svg', t: '权限模型 + 登录上下文', note: '组织树决定你能看哪些数据' }
      ],
      menus: {
        orgs:  { desc: '院区与节点维护', cat: 'fwd' },
        wh:    { desc: '库房与货架库位', cat: 'fwd' },
        phloc: { desc: '药房与货位',     cat: 'fwd' }
      }
    },
    base: {
      tagline: '药品、码规则、设备——业务的弹药库',
      roles: '系统管理员 · 库管员',
      case: '新增阿莫西林：药品字典建「1盒=7片」→ 标识码字典定码规则 → 到货扫码才有校验依据',
      diagrams: [
        { f: '07-conversion.svg', t: '码⇄药⇄单位 全链路转换', note: '基本单位在药品字典，不在码上' },
        { f: '13-code-flow.svg',  t: '箱码全链路 · 码怎么转', note: '1箱=60盒、1盒=7片的码形态变化' }
      ],
      menus: {
        dict:    { desc: '字典类型与项',     cat: 'fwd' },
        drug:    { desc: '药品档案+审核',    cat: 'fwd' },
        idcode:  { desc: '追溯码规则维护',   cat: 'fwd' },
        cabinet: { desc: '取药柜设备维护',   cat: 'fix' },
        lamp:    { desc: '基站灯组维护',     cat: 'fix' }
      }
    },
    wh: {
      tagline: '药从供应商到库房货架：收、存、发、退',
      roles: '库管员',
      case: '阿莫西林60盒到货 → 扫码/人工验收入库 → 门诊领用2盒 → 库存58盒；效期≤180天预警、过期自动冻结 → 损耗出库',
      diagrams: [
        { f: '02-purchase-in.svg',      t: '采购入库（异常码人工兜底）', note: '扫码失败不卡单' },
        { f: '03-pick-loop.svg',        t: '领用出库 → 药房入库闭环',   note: '库房发、药房收，库存同时动' },
        { f: '08-stock-derivation.svg', t: '库存推导（集合加减法）',     note: '库存=入库集合−出库集合' }
      ],
      menus: {
        arrive:  { desc: '供应商到货确认',       cat: 'fwd' },
        pin:     { desc: '扫码/人工双通道验收',  cat: 'fwd' },
        pout:    { desc: '不合格退供应商',       cat: 'rev' },
        pdone:   { desc: '已审单·可反审核',      cat: 'qry' },
        badcode: { desc: '扫码失败人工补录',     cat: 'fix' },
        pquery:  { desc: '采购明细导出',         cat: 'qry' },
        pOutQ:   { desc: '退货明细追踪',         cat: 'qry' },
        whstock: { desc: '效期/冻结一目了然',    cat: 'qry' },
        pick:    { desc: '按申请单拣货出库',     cat: 'fwd', note: '仅扫码 · 人工通道规划中' },
        retIn:   { desc: '药房退回接收',         cat: 'rev' },
        othIn:   { desc: '无单入库（捐赠等）',   cat: 'fix' },
        othOut:  { desc: '无单出库（救急）',     cat: 'fix' },
        lossOut: { desc: '过期/破损出口',        cat: 'fix' },
        lossQ:   { desc: '损耗明细追踪',         cat: 'qry' },
        whOutQ:  { desc: '领用/其他出库明细',    cat: 'qry' }
      }
    },
    ph: {
      tagline: '药从库房到药房货架：领、收、上架',
      roles: '药房药师',
      case: '领用2盒到货 → 扫码入药房上架 → 在架2盒/14片；码扫不出 → 待上架查询排查',
      diagrams: [
        { f: '03-pick-loop.svg',        t: '领用出库 → 药房入库闭环', note: '本模块是闭环的下半段' },
        { f: '08-stock-derivation.svg', t: '库存推导（集合加减法）',   note: '药房库存同样按集合算' }
      ],
      menus: {
        phstock: { desc: '药房在架库存',   cat: 'qry' },
        req:     { desc: '向库房申领',     cat: 'fwd' },
        reqIn:   { desc: '领用到货入库',   cat: 'fwd' },
        phInQ:   { desc: '入库明细对账',   cat: 'qry' },
        retOut:  { desc: '余药退回库房',   cat: 'rev' },
        shelfQ:  { desc: '上架异常排查',   cat: 'fix' },
        shelf:   { desc: '扫码上架/下架',  cat: 'fwd' },
        light:   { desc: '补药指示灯',     cat: 'fwd' },
        phloss:  { desc: '破损损耗登记',   cat: 'fix' }
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
        disp:        { desc: '扫码发药·拆零',     cat: 'fwd', note: '仅扫码 · 人工通道规划中' },
        assign:      { desc: '处方逐条赋码',      cat: 'fwd' },
        assignBatch: { desc: '扫码枪故障兜底',    cat: 'fix' },
        assignQ:     { desc: '已赋码处方追踪',    cat: 'qry' },
        rxItemQ:     { desc: '发药明细对账',      cat: 'qry' },
        rxAggQ:      { desc: '发药汇总统计',      cat: 'qry' },
        rxret:       { desc: '退药扫码回收',      cat: 'rev' },
        rxRetQ:      { desc: '退药记录追踪',      cat: 'qry' },
        tray:        { desc: '摆药单拣药',        cat: 'fwd' },
        trayRet:     { desc: '摆药退回药房',      cat: 'rev' },
        trayRetQ:    { desc: '摆药退药记录',      cat: 'qry' },
        wardSign:    { desc: '病区扫码签收',      cat: 'fwd', note: '拒收/退回规划中' }
      },
      xlinks: [
        { key: 'badcode', note: '发药扫码异常也在这里补录（库房管理）' }
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
        invNocode: { desc: '无码/码损人工登记',  cat: 'fix' }
      },
      xlinks: [
        { key: 'badcode', note: '盘点发现的坏码在这里补录（库房管理）' }
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
        users: { desc: '账号与角色分配',     cat: 'fwd' },
        roles: { desc: '功能权限+数据范围',  cat: 'fwd' },
        perm:  { desc: '菜单启停与资源',     cat: 'fwd' }
      }
    }
  }
};
