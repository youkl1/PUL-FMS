/**
 * check-prd-menu-sync.js — 菜单 ⇄ PRD 同步校验
 * 用法：node scripts/check-prd-menu-sync.js
 * 校验：① NAV 菜单 key 是否有对应 PRD（缺失仅列出）
 *       ② PRD frontmatter 的 menu_key 是否仍存在于 NAV（孤儿 = 报错）
 *       ③ PRD prototype 路径与 NAV href 是否一致（失配 = 报错）
 *       ④ PRD menu_name 与 NAV name 一致性（警告）
 * 退出码：有孤儿/失配 = 1，否则 = 0
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NAV_FILE = path.join(ROOT, 'prototypes/2026-09/pul-fms-base-v1/scripts/app-shell.js');
const PRD_DIR = path.join(ROOT, 'specs/2026-09/pul-fms');

// ---- 1. 解析 app-shell.js 中的 NAV 字面量 ----
function loadNav() {
  const src = fs.readFileSync(NAV_FILE, 'utf8');
  const start = src.indexOf('var NAV = [');
  if (start < 0) throw new Error('app-shell.js 中找不到 var NAV = [');
  const arrStart = src.indexOf('[', start);
  let depth = 0, end = -1;
  for (let i = arrStart; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error('NAV 数组括号未闭合');
  const literal = src.slice(arrStart, end + 1);
  return new Function('return ' + literal)();
}

function flatMenus(nav) {
  const out = [{ group: null, sub: null, key: 'index', name: '工作台', href: 'index.html', badge: null }];
  nav.forEach(entry => {
    if (entry.type === 'item') return; // 工作台已加
    (entry.items || []).forEach(it => out.push({ group: entry.name, sub: null, ...pick(it) }));
    (entry.subs || []).forEach(s => s.items.forEach(it => out.push({ group: entry.name, sub: s.name, ...pick(it) })));
  });
  return out;
}
function pick(it) { return { key: it.key, name: it.name, href: it.href || null, badge: it.badge || null }; }

// ---- 2. 扫描 PRD frontmatter ----
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.md') && e.name !== 'README.md' && !e.name.startsWith('_')) yield p;
  }
}
function parseFm(file) {
  const head = fs.readFileSync(file, 'utf8').slice(0, 2000);
  const m = head.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  m[1].split(/\r?\n/).forEach(line => {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  });
  fm._file = path.relative(ROOT, file);
  return fm;
}

// ---- 3. 校验 ----
const menus = flatMenus(loadNav());
const byKey = new Map(menus.map(m => [m.key, m]));
const prds = fs.existsSync(PRD_DIR) ? [...walk(PRD_DIR)].map(parseFm).filter(Boolean) : [];
const prdKeys = new Set(prds.map(p => p.menu_key));

const missing = menus.filter(m => !prdKeys.has(m.key));
const orphans = prds.filter(p => !byKey.has(p.menu_key));
const mismatches = [], nameWarns = [];
prds.forEach(p => {
  const m = byKey.get(p.menu_key);
  if (!m) return;
  if (m.href && p.prototype && p.prototype !== '~' && !p.prototype.endsWith('/' + m.href)) {
    mismatches.push(`${p._file}: prototype=${p.prototype}，但 NAV href=${m.href}`);
  }
  if (p.menu_name && m.name !== p.menu_name) {
    nameWarns.push(`${p._file}: menu_name=${p.menu_name}，NAV name=${m.name}`);
  }
});

// ---- 4. 报告 ----
console.log(`菜单 ${menus.length} 项 · PRD ${prds.length} 篇\n`);
console.log(`【待写 PRD】${missing.length} 项（不阻塞）`);
missing.forEach(m => console.log(`  ⬜ ${m.group || '—'}${m.sub ? '/' + m.sub : ''} · ${m.name} (${m.key})${m.badge ? ' [' + m.badge + ']' : ''}`));
if (nameWarns.length) {
  console.log(`\n【命名不一致 · 警告】${nameWarns.length} 项`);
  nameWarns.forEach(w => console.log('  ⚠️  ' + w));
}
if (orphans.length) {
  console.log(`\n【孤儿 PRD · 报错】${orphans.length} 篇（menu_key 已不在 NAV 中，需改名/挪组/标 deprecated）`);
  orphans.forEach(p => console.log(`  ❌ ${p._file} (menu_key=${p.menu_key})`));
}
if (mismatches.length) {
  console.log(`\n【原型路径失配 · 报错】${mismatches.length} 项`);
  mismatches.forEach(w => console.log('  ❌ ' + w));
}
const fail = orphans.length + mismatches.length;
console.log(`\n${fail ? '❌ 失配 ' + fail + ' 项' : '✅ 无失配'}`);
process.exit(fail ? 1 : 0);
