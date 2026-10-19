/**
 * _t-round-z-codemod.node.js — Round Z 一次性改名 codemod（2026-09-30，跑完即留档不删，部署排除 _t-*）
 * 数据源：app-shell.js NAV（唯一事实源）。改三类载体：
 *   ① scripts/*.js 的 crumb（按 active key 重写为 [组, 客户原名]）
 *   ② 每页 .html 的 <title> / business-category meta / plan-title 徽章 / subtitle 组名
 *   ③ 全局安全的组名/菜单名文本替换（带环视防子串误伤）
 * 跑：node scripts/_t-round-z-codemod.node.js（在 pul-fms-base-v1 目录）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = __dirname;
const base = path.join(dir, '..');

// ---- 载入 NAV ----
const window_ = { console };
const ctx = vm.createContext({ window: window_, console, Object, Array, String, JSON, Number, Boolean, Date, Math });
window_.window = window_;
vm.runInContext(fs.readFileSync(path.join(dir, 'app-shell.js'), 'utf8'), ctx, { filename: 'app-shell.js' });
const NAV = window_.AppShell.NAV;
const byKey = {}, byHref = {};
NAV.forEach(e => {
  (e.items || []).forEach(it => {
    byKey[it.key] = { name: it.name, group: e.name };
    if (it.href) byHref[it.href] = { name: it.name, group: e.name, key: it.key };
  });
});

let touched = 0;
function edit(file, fn) {
  const p = path.join(base, file);
  if (!fs.existsSync(p)) return;
  const old = fs.readFileSync(p, 'utf8');
  const cur = fn(old);
  if (cur !== old) { fs.writeFileSync(p, cur); touched++; console.log('  改 ' + file); }
}

// ---- ① crumb 重写 ----
fs.readdirSync(dir).filter(f => f.endsWith('.js') && !/^_t-|app-shell|data\.js|guide/.test(f)).forEach(f => {
  edit(path.join('scripts', f), src => {
    const m = src.match(/active:\s*'([A-Za-z]+)'/);
    if (!m || !byKey[m[1]]) return src;
    const nav = byKey[m[1]];
    return src.replace(/crumb:\s*\[([^\]]*)\]/, (whole, inner) => {
      const parts = inner.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length === 3 && parts[0][0] === "'") {
        // 三级面包屑（dict-types/dict-items）：只换前两级
        return "crumb: ['" + nav.group + "', '" + nav.name + "', " + parts[2] + "]";
      }
      return "crumb: ['" + nav.group + "', '" + nav.name + "']";
    });
  });
});
// inv.js 条件面包屑特判
edit('scripts/inv.js', src => src.replace(
  /crumb:\s*\[[^\]]*\]/,
  "crumb: ['盘点管理', isInit ? '期初存量（期初盘点）' : '药品盘点单']"
));

// ---- ② 页面四类载体（按 NAV href 精确映射） ----
Object.keys(byHref).forEach(href => {
  const nav = byHref[href];
  edit(href, src => {
    let out = src;
    out = out.replace(/<title>[^<]* · PUL-FMS<\/title>/, '<title>' + nav.name + ' · PUL-FMS</title>');
    out = out.replace(/(business-category" content="PUL-FMS 药品精细化管理系统 · )[^"]*(")/, '$1' + nav.group + '$2');
    out = out.replace(/(plan-title">PUL-FMS 药品精细化管理系统 · )[^<]*(<\/span>)/, '$1' + nav.group + '$2');
    out = out.replace(/(<p class="subtitle">)[^·<]*·/, '$1' + nav.group + ' ·');
    return out;
  });
});

// ---- ③ 全局安全文本替换（组名 + 无子串冲突的菜单名） ----
const GLOBAL = [
  [/基础管理(?!员)/g, '基础管理'],          // 「院区管理员」防误伤在下行单独护
  [/出库管理/g, '出库管理'],
  [/库房管理/g, '库房管理'],                // 损耗 2 页载体已在②按 NAV 改对，正文残留统一入库房管理（量极小）
  [/权限管理/g, '权限管理'],
  [/领用备货单/g, '领用备货单'],
  [/入库明细查询/g, '入库明细查询'],
  [/采购到货单(?!单)/g, '采购到货单'],
  [/采购入库单(?!单)/g, '采购入库单'],
  [/采购退货单(?!单)/g, '采购退货单'],
  [/库房库存查询(?!查询)/g, '库房库存查询'],
  [/退回入库单(?!单)/g, '退回入库单'],
  [/其他入库单(?!单)/g, '其他入库单'],
  [/其他出库单(?!单)/g, '其他出库单'],
  [/药房库存查询(?!查询)/g, '药房库存查询'],
  [/领用申请单(?!单)/g, '领用申请单'],
  [/领用入库单(?!单)/g, '领用入库单'],
  [/退回出库单(?!单)/g, '退回出库单'],
  [/待上架药品查询/g, '待上架药品查询'],
  [/药品扫码上架/g, '药品扫码上架'],
  [/摆药单批量赋码/g, '摆药单批量赋码'],
  [/摆药单退药查询/g, '摆药单退药查询'],
  [/摆药单退药/g, '摆药单退药'],
  [/处方单退药查询/g, '处方单退药查询'],
  [/处方单退药(?!查询)/g, '处方单退药'],
  [/处方取药赋码/g, '处方取药赋码'],
  [/(?<!单)处方单批量赋码/g, '处方单批量赋码'],
  [/(?<!单)处方单赋码查询/g, '处方单赋码查询'],
  [/(?<!方)处方药品明细查询/g, '处方药品明细查询'],   // 「处方药品明细查询」含「方药品明细查询」环视挡住
  [/(?<!处方药品)(?<!摆药单)处方药品汇总查询/g, '处方药品汇总查询'],
  [/(?<!HIS)HIS摆药单查询/g, 'HIS摆药单查询'],         // 护已有「HIS摆药单查询」
  [/(?<!HIS)HIS处方单查询/g, 'HIS处方单查询'],
  [/HIS摆药单药品汇总/g, 'HIS摆药单药品汇总'],
  [/HISHISHISHISHIS处方药品汇总(?!查询)/g, 'HISHISHISHISHISHIS处方药品汇总'],
  [/(?<!存量（)期初存量（期初盘点）/g, '期初存量（期初盘点）'],  // 护已转换文本的内层，防嵌套
  [/(?<!药品)药品盘点单/g, '药品盘点单'],
  [/盘盈入库单(?!单)/g, '盘盈入库单'],
  [/盘亏出库单(?!单)/g, '盘亏出库单'],
  [/盈亏明细查询/g, '盈亏明细查询'],
  [/日记账查询/g, '日记账查询'],
  [/月记账查询(?!查询)/g, '月记账查询'],
  [/院区字典维护(?!员)/g, '院区字典维护'],             // 护「院区管理员」
  [/库房库位维护(?!维护)/g, '库房库位维护'],
  [/药房货位维护(?!维护)/g, '药房货位维护'],
  [/基站灯组维护(?!维护|设置)/g, '基站灯组维护']
];
const SKIP = new Set(['app-shell.js', 'data.js', 'guide-data.js']);
fs.readdirSync(dir).filter(f => f.endsWith('.js') && !SKIP.has(f)).forEach(f => {
  edit(path.join('scripts', f), src => GLOBAL.reduce((s, [re, to]) => s.replace(re, to), src));
});
fs.readdirSync(base).filter(f => f.endsWith('.html')).forEach(f => {
  edit(f, src => GLOBAL.reduce((s, [re, to]) => s.replace(re, to), src));
});

console.log('\n共改 ' + touched + ' 个文件');
