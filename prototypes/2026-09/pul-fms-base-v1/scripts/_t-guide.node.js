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
  var want = (navGroups[m.group] || []).slice().sort();
  var got = Object.keys(GD.modules[m.key].menus || {}).sort();
  ok(m.group + ' menus 键与 NAV 对齐', JSON.stringify(want) === JSON.stringify(got));
});

// 3) 除医保/组织/系统（纯维护类）外每模块至少一个 fix 兜底入口
GD.order.forEach(function (m) {
  if (m.key === 'mi' || m.key === 'sys' || m.key === 'org') return;
  var menus = GD.modules[m.key].menus || {};
  ok(m.group + ' 有兜底入口', Object.keys(menus).some(function (k) { return menus[k].cat === 'fix'; }));
});

// 4) diagrams 图文件存在（引用 docs 唯一源，不拷贝）
GD.order.forEach(function (m) {
  (GD.modules[m.key].diagrams || []).forEach(function (dg) {
    ok(m.group + ' 图 ' + dg.f + ' 存在',
      fs.existsSync(path.join(dir, '..', '..', '..', 'docs', 'diagrams', 'fireworks', dg.f)));
  });
});

// 5) xlinks 指向真实 NAV 键
GD.order.forEach(function (m) {
  (GD.modules[m.key].xlinks || []).forEach(function (x) { ok(m.group + ' xlink ' + x.key + ' 有效', !!navKeys[x.key]); });
});

// 6) 「仅扫码·人工通道规划中」标注落在约定三处（pick/disp/wardSign）
['pick', 'disp', 'wardSign'].forEach(function (k) {
  var found = GD.order.some(function (m) {
    var meta = (GD.modules[m.key].menus || {})[k];
    return meta && /规划中/.test(meta.note || '');
  });
  ok('标注 ' + k + ' 人工通道规划中', found);
});

console.log(failed ? '\n' + failed + ' 项失败' : '\n全部通过');
process.exit(failed ? 1 : 0);
