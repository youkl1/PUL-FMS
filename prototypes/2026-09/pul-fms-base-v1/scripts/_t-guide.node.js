/**
 * 导览数据校验：菜单键与 NAV 对齐 / 图资产存在 / 每模块至少一个兜底入口 / 人工通道标注落位
 * 跑：node scripts/_t-guide.node.js（在 pul-fms-base-v1 目录）
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var dir = __dirname;

var window = { console: console };
var ctx = vm.createContext({
  window: window, console: console, Object: Object, Array: Array, String: String,
  JSON: JSON, Number: Number, Boolean: Boolean, Date: Date, Math: Math
});
window.window = window;
function load(f) { vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }); }
load('app-shell.js');
load('guide-data.js');

var NAV = window.AppShell.NAV;
var GD = window.GUIDE_DATA;
var failed = 0;
function ok(name, cond) { console.log((cond ? '  ok   ' : '  FAIL ') + name); if (!cond) failed++; }

// NAV 全部菜单键（含子组）+ 组映射
var navKeys = {}, navGroups = {};
NAV.forEach(function (e) {
  if (e.type === 'item') return;
  var keys = [];
  (e.items || []).forEach(function (it) { navKeys[it.key] = it; keys.push(it.key); });
  (e.subs || []).forEach(function (s) { s.items.forEach(function (it) { navKeys[it.key] = it; keys.push(it.key); }); });
  navGroups[e.name] = keys;
});

// 1) order 的 group 都在 NAV 中
GD.order.forEach(function (m) { ok('order ' + m.key + ' → NAV 组「' + m.group + '」存在', !!navGroups[m.group]); });

// 2) 每个模块 menus 键集 == NAV 组键集（双向，防漏防多）
GD.order.forEach(function (m) {
  var mod = GD.modules[m.key] || {};
  var want = (navGroups[m.group] || []).slice().sort();
  var got = Object.keys(mod.menus || {}).sort();
  ok(m.group + ' menus 键与 NAV 对齐', JSON.stringify(want) === JSON.stringify(got));
});

// 3) 除医保/组织/系统/HIS（纯维护/纯查询类）外每模块至少一个 fix 兜底入口
//    cat='fix' 独立兜底页，或 fix:true 兜底能力并入主流程页（2026-10-03 异常码台账并入到货单页）
GD.order.forEach(function (m) {
  if (m.key === 'mi' || m.key === 'sys' || m.key === 'org' || m.key === 'his') return;
  var mod = GD.modules[m.key] || {};
  var menus = mod.menus || {};
  ok(m.group + ' 有兜底入口', Object.keys(menus).some(function (k) { return menus[k].cat === 'fix' || menus[k].fix === true; }));
});

// 4) diagrams 图文件存在（prototypes/shared/diagrams 唯一源，scripts/ 上三级到 prototypes/）
GD.order.forEach(function (m) {
  var mod = GD.modules[m.key] || {};
  (mod.diagrams || []).forEach(function (dg) {
    ok(m.group + ' 图 ' + dg.f + ' 存在',
      fs.existsSync(path.join(dir, '..', '..', '..', 'shared', 'diagrams', 'fireworks', dg.f)));
  });
});

// 5) xlinks 指向真实 NAV 键且可跳转（无 href 时兜底卡会无声消失，必须响）
GD.order.forEach(function (m) {
  var mod = GD.modules[m.key] || {};
  (mod.xlinks || []).forEach(function (x) {
    ok(m.group + ' xlink ' + x.key + ' 有效', !!(navKeys[x.key] && navKeys[x.key].href));
  });
});

// 6) 「仅扫码·人工通道规划中」标注落在约定两处（pick/wardSign；disp 已于 T3 补手动补绑）
['pick', 'wardSign'].forEach(function (k) {
  var found = GD.order.some(function (m) {
    var mod = GD.modules[m.key] || {};
    var meta = (mod.menus || {})[k];
    return meta && /规划中/.test(meta.note || '');
  });
  ok('标注 ' + k + ' 人工通道规划中', found);
});

console.log(failed ? '\n' + failed + ' 项失败' : '\n全部通过');
process.exit(failed ? 1 : 0);
