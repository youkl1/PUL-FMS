/**
 * _t-doc-detail.node.js — PulDocDetail 共享单据明细组件独立回归
 * 跑：node scripts/_t-doc-detail.node.js（在 pul-fms-base-v1 目录）
 * 真实加载 purchase-shared.js + doc-detail.js；DOM 事件用最小 fake root，不依赖 jsdom
 */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var dir = __dirname;
var window = { console: console };
var ctx = vm.createContext({ window: window, console: console });
window.window = window;
function load(f) { vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }); }
var failed = 0;
function ok(name, cond) { console.log((cond ? '  ok   ' : '  FAIL ') + name); if (!cond) failed++; }
function eq(name, got, exp) {
  var g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g === e) console.log('  ok   ' + name);
  else { failed++; console.log('  FAIL ' + name + '\n       got ' + g + '\n       exp ' + e); }
}
function has(name, html, part) { ok(name, html.indexOf(part) > -1); }
function notHas(name, html, part) { ok(name, html.indexOf(part) < 0); }
function throws(name, fn, text) {
  try { fn(); } catch (e) { ok(name + '：' + e.message, e.message.indexOf(text) > -1); return; }
  ok(name + '（未抛错）', false);
}
function finish() { console.log(failed ? '\nFAILED ' + failed : '\nall passed'); process.exit(failed ? 1 : 0); }
function headers(html) {
  var part = (html.match(/<thead><tr>(.*?)<\/tr><\/thead>/) || [])[1] || '';
  var out = [], re = /<th>(.*?)<\/th>/g, m;
  while ((m = re.exec(part))) out.push(m[1]);
  return out;
}

load('purchase-shared.js');
if (!fs.existsSync(path.join(dir, 'doc-detail.js'))) {
  ok('doc-detail.js 存在（预期 RED：组件尚未实现）', false);
  finish();
}
load('doc-detail.js');
var D = window.PulDocDetail;
if (!D) { ok('window.PulDocDetail 已暴露', false); finish(); }
['renderTabs', 'renderDrugs', 'renderCodes', 'renderBad', 'bind'].forEach(function (key) {
  eq('公开 API ' + key, typeof D[key], 'function');
});

// ===== 1. 默认公共列：列名与顺序是跨页面契约 =====
eq('药品默认 11 列', headers(D.renderDrugs({})),
  ['序号', '药品名称', '药品规格', '生产厂家', '批准文号', '单价（元）', '数量', '扫码总量', '差异', '单位', '金额（元）']);
eq('码默认 12 列', headers(D.renderCodes({})),
  ['序号', '药品追溯码', '药名通用名', '码层级', '父级码', '生产批次', '生产日期', '有效期至', '扫码数量', '核对状态', '标识码', '发码机构']);
eq('异常码默认 6 列', headers(D.renderBad({})),
  ['序号', '药品追溯码', '标识码', '异常原因', '时间', '操作']);

// ===== 2. 页签计数、顺序、活动态与异常红色 =====
var countModel = { drugs: [{}], codes: [{ scanQty: 2 }, { scanQty: 3 }], bad: [{}], activeTab: 'drugs' };
var tabRows = D.renderTabs(countModel, { counts: { codes: 'rows' }, drugs: { columns: ['seq'] } });
has('码页签 rows 计数', tabRows, '码详情（2）');
has('药品页签行数计数', tabRows, '药品清单（1）');
has('异常非 0 红色加粗', tabRows, '异常码（<b class="text-danger">1</b>）');
var tabScan = D.renderTabs(countModel, { counts: { codes: 'scanQty' }, drugs: { columns: ['seq'] } });
has('码页签 scanQty 累加', tabScan, '码详情（5）');
var tabFallback = D.renderTabs({ activeTab: 'invalid' }, { tabs: ['bad', 'drugs'], bad: { columns: ['seq'] } });
has('tabs 顺序按 options 且无效 activeTab 回退首项', tabFallback, 'class="pch-tab active" data-dd-tab="bad"');
var tabZero = D.renderTabs({}, { bad: { columns: ['seq'] } });
has('异常为 0 普通计数', tabZero, '异常码（0）');
notHas('异常为 0 不标红', tabZero, '异常码（<b class="text-danger">0</b>）');

// ===== 3. 真空数组与未选单是两种空态；colspan=实际列数 =====
var emptyTable = D.renderDrugs({ drugs: [] }, {
  columns: ['seq', 'drugName'], emptyText: '空<药品>',
  extraColumns: [{ key: 'x', title: '扩展', cell: function () { return '—'; } }]
});
has('空态 colspan 含 extraColumns', emptyTable, 'colspan="3"');
has('空态文案转义', emptyTable, '空&lt;药品&gt;');
has('默认药品空态 colspan=11', D.renderDrugs({}), 'colspan="11"');
var noDoc = D.renderTabs({ empty: true, drugs: [], codes: [], bad: [] }, { emptyText: '点选上方单据行查看明细' });
has('model.empty=true 未选单空态', noDoc, '点选上方单据行查看明细');
notHas('未选单不误渲染真实表格空态', noDoc, '<table');

// ===== 4. 公共扩展字段、extraColumns、progress/diff/status/className =====
var extraRow = { drugCode: 'YP<1>', packSpec: '盒10片', location: 'A-01', expectLoc: 'B-02', split: '是', expDate: '2027-01-01' };
var extraArgs = null;
var extended = D.renderDrugs({ drugs: [extraRow] }, {
  columns: ['drugCode', 'packSpec', 'location', 'expectLoc', 'split', 'expDate'],
  extraColumns: [{ key: 'custom', title: '扩展列', cell: function (row, index) { extraArgs = [row, index]; return '<em>页面HTML</em>'; } }]
});
eq('补充公共字段注册表列名', headers(extended), ['药品编码', '包装规格', '库位', '预期货位', '拆零', '有效期至', '扩展列']);
ok('extraColumns cell 收到 row/index', extraArgs && extraArgs[0] === extraRow && extraArgs[1] === 0);
has('extraColumns cell 保留页面 HTML', extended, '<td><em>页面HTML</em></td>');
has('公共字段动态值转义', extended, 'YP&lt;1&gt;');
var features = D.renderDrugs({ drugs: [
  { scanText: '2 盒', progress: 50, diff: { kind: 'full', text: '备齐' }, className: 'pch-row-checked' },
  { scanText: '1 盒', progress: 101, diff: { kind: 'short', text: '缺 1' } },
  { scanText: '3 盒', progress: -1, diff: { kind: 'over', text: '超 1' } }
] }, { columns: ['scanQty', 'diff'] });
has('scanText 加粗', features, '<b>2 盒</b>');
eq('仅 0-100 数值渲染 6px progress', (features.match(/class="progress"/g) || []).length, 1);
has('progress 使用现有 6px 样式与百分比', features, 'height:6px');
has('progress 宽度', features, 'width:50%');
has('diff full 绿 badge', features, '<span class="badge bg-green-lt">备齐</span>');
has('diff short 橙 badge', features, '<span class="badge bg-orange-lt">缺 1</span>');
has('diff over 红 badge', features, '<span class="badge bg-red-lt">超 1</span>');
has('row.className 保留', features, '<tr class="pch-row-checked">');
var statuses = D.renderCodes({ codes: [
  { status: { kind: 'done', text: '已核对' } }, { status: { kind: 'todo', text: '未核对' } }
] }, { columns: ['checkStatus'] });
has('核对状态 done 绿', statuses, '<span class="text-success">已核对</span>');
has('核对状态 todo 灰', statuses, '<span class="text-secondary">未核对</span>');

// ===== 5. 操作注册表、panelActions、异常说明 =====
var actionHtml = D.renderBad({ bad: [{ actions: ['removeBad', 'editBad', 'maintainBad', 'goScan'] }] }, {
  columns: ['actions'], panelActions: ['reparse'], note: '处理后放行审核'
});
['removeBad', 'editBad', 'maintainBad', 'goScan'].forEach(function (key) {
  has('行操作 data-dd-action=' + key, actionHtml, 'data-dd-action="' + key + '" data-dd-table="bad" data-dd-index="0"');
});
has('面板 reparse index 为空', actionHtml, 'data-dd-action="reparse" data-dd-table="bad" data-dd-index=""');
['>移除</button>', '>编辑</button>', '>去维护</button>', '>去扫码录入</button>', '>重新解析</button>'].forEach(function (label) {
  has('集中中文操作 label ' + label, actionHtml, label);
});
has('异常说明沿用 pch-tabbar', actionHtml, '<div class="pch-tabbar">');
has('异常说明含总数与 note', actionHtml, '异常码 <b class="text-danger">1</b> 个 · 处理后放行审核');
var codeAction = D.renderCodes({ codes: [{ actions: ['removeCode'] }] }, { columns: ['actions'] });
has('removeCode 指向 codes 行', codeAction, 'data-dd-action="removeCode" data-dd-table="codes" data-dd-index="0"');
has('removeCode 中文 label（公约 §4.3 统一「移除」）', codeAction, '>移除</button>');

// 面板操作最小禁用扩展：保留字符串用法，对象只选择已登记 key 并表达 disabled
var disabledPanelHtml = '';
try {
  disabledPanelHtml = D.renderBad({ bad: [{}] }, {
    columns: ['seq'], panelActions: [{ key: 'reparse', disabled: true }]
  });
} catch (e) {}
ok('panelActions 对象 disabled=true 输出原生 disabled', /<button[^>]*data-dd-action="reparse"[^>]*disabled/.test(disabledPanelHtml));
var enabledPanelHtml = '';
try {
  enabledPanelHtml = D.renderBad({ bad: [{}] }, {
    columns: ['seq'], panelActions: [{ key: 'reparse', disabled: false }]
  });
} catch (e) {}
ok('panelActions 对象 disabled=false 不输出 disabled', enabledPanelHtml.indexOf('data-dd-action="reparse"') > -1 &&
  !/<button[^>]*data-dd-action="reparse"[^>]*disabled/.test(enabledPanelHtml));
throws('panelActions 对象未知 key 明确抛错', function () {
  D.renderBad({ bad: [{}] }, { columns: ['seq'], panelActions: [{ key: 'notAnAction', disabled: true }] });
}, 'notAnAction');

// ===== 6. 最小 fake root：真实 bind 回调与上下文 =====
function fakeEl(attrs) {
  return {
    attrs: attrs, listeners: {},
    getAttribute: function (key) { return this.attrs[key]; },
    addEventListener: function (type, fn) { this.listeners[type] = fn; },
    click: function (event) { this.listeners.click(event); }
  };
}
var tabEl = fakeEl({ 'data-dd-tab': 'codes' });
var rowEl = fakeEl({ 'data-dd-action': 'removeBad', 'data-dd-table': 'bad', 'data-dd-index': '0' });
var panelEl = fakeEl({ 'data-dd-action': 'reparse', 'data-dd-table': 'bad', 'data-dd-index': '' });
var root = { querySelectorAll: function (selector) {
  return selector === '[data-dd-tab]' ? [tabEl] : [rowEl, panelEl];
} };
var bindModel = { bad: [{ code: 'BAD1' }] };
var tabKey = null, rowCtx = null, panelCtx = null;
D.bind(root, {
  model: bindModel,
  onTab: function (key) { tabKey = key; },
  actions: {
    removeBad: function (ctx) { rowCtx = ctx; },
    reparse: function (ctx) { panelCtx = ctx; }
  }
});
var event1 = { type: 'click' }, event2 = { type: 'click' };
tabEl.click(event1); rowEl.click(event1); panelEl.click(event2);
eq('bind onTab 返回 key', tabKey, 'codes');
ok('操作 ctx.row 取 handlers.model 对应行', rowCtx && rowCtx.row === bindModel.bad[0]);
eq('操作 ctx action/table/index', rowCtx && [rowCtx.action, rowCtx.table, rowCtx.index], ['removeBad', 'bad', 0]);
ok('操作 ctx.event 透传', rowCtx && rowCtx.event === event1);
ok('面板操作 row/index 为空且 event 透传', panelCtx && panelCtx.row === null && panelCtx.index === null && panelCtx.event === event2);
var disabledCalls = 0;
var disabledEl = fakeEl({ 'data-dd-action': 'reparse', 'data-dd-table': 'bad', 'data-dd-index': '' });
disabledEl.disabled = true;
D.bind({ querySelectorAll: function (selector) { return selector === '[data-dd-action]' ? [disabledEl] : []; } }, {
  model: bindModel,
  onTab: function () {},
  actions: { reparse: function () { disabledCalls++; } }
});
disabledEl.click({ type: 'click' });
eq('disabled 操作 bind 防御不执行回调', disabledCalls, 0);
var missingEl = fakeEl({ 'data-dd-action': 'removeBad', 'data-dd-table': 'bad', 'data-dd-index': '0' });
D.bind({ querySelectorAll: function (selector) { return selector === '[data-dd-action]' ? [missingEl] : []; } }, { model: bindModel, actions: {} });
throws('缺操作回调抛带 key 的明确错误', function () { missingEl.click({}); }, 'removeBad');

// ===== 7. 普通动态文本统一转义；metaHtml/footerHtml 是显式可信 HTML =====
var escaped = D.renderBad({ bad: [{ code: '<20码>&"', idcode: '<7>', reason: '解析<失败>&"' }] }, { columns: ['code', 'idcode', 'reason'] });
has('code 转义', escaped, '&lt;20码&gt;&amp;&quot;');
has('idcode 转义', escaped, '&lt;7&gt;');
has('reason 转义', escaped, '解析&lt;失败&gt;&amp;&quot;');
notHas('动态文本不输出原始标签', escaped, '<20码>');
var card = D.renderTabs({ empty: true }, {
  title: '<单据明细>', metaHtml: '<span id="meta">M</span>', footerHtml: '<b id="foot">F</b>', footerClass: 'extra-foot'
});
has('卡片 title 转义', card, '&lt;单据明细&gt;');
has('metaHtml 仅作卡片头 HTML', card, '<span id="meta">M</span>');
has('footerHtml/footerClass 仅作卡片尾', card, '<div class="card-footer extra-foot"><b id="foot">F</b></div>');

// ===== 8. 明确错误与金额格式 =====
throws('未知列抛带 key 的错误', function () { D.renderDrugs({}, { columns: ['notAColumn'] }); }, 'notAColumn');
throws('未知计数模式抛带模式的错误', function () {
  D.renderTabs({}, { counts: { codes: 'unknownMode' } });
}, 'unknownMode');
var money = D.renderDrugs({ drugs: [{ price: 12.5, amount: null }, { price: null, amount: 8 }] }, { columns: ['price', 'amount'] });
has('price 数值 toFixed(2)', money, '<tbody><tr><td>12.50</td><td>—</td></tr>');
has('amount 数值 toFixed(2)，空值为 —', money, '<tr><td>—</td><td>8.00</td></tr></tbody>');
var emptyValues = D.renderDrugs({ drugs: [{ drugName: '', qty: null, scanText: '' }] }, { columns: ['drugName', 'qty', 'scanQty'] });
eq('普通空值与数量空值均为 —', (emptyValues.match(/—/g) || []).length, 3);

// ===== 9. 质量复核：原型链键不得穿透注册表 / 枚举 / 回调表 =====
['toString', 'constructor', '__proto__'].forEach(function (key) {
  throws('原型链未知列被拒绝：' + key, function () { D.renderDrugs({}, { columns: [key] }); }, key);
  throws('原型链未知操作被拒绝：' + key, function () {
    D.renderBad({ bad: [{ actions: [key] }] }, { columns: ['actions'] });
  }, key);
  throws('原型链未知页签被拒绝：' + key, function () { D.renderTabs({}, { tabs: [key] }); }, key);
});
var prototypeDiff = D.renderDrugs({ drugs: [{ diff: { kind: 'constructor', text: '异常枚举' } }] }, { columns: ['diff'] });
has('diff.constructor 回退中性 badge', prototypeDiff, '<span class="badge bg-secondary-lt">异常枚举</span>');
notHas('diff 枚举不拼接原型函数源码', prototypeDiff, 'function');
['toString', 'constructor'].forEach(function (key) {
  var inheritedEl = fakeEl({ 'data-dd-action': key, 'data-dd-table': 'bad', 'data-dd-index': '0' });
  D.bind({ querySelectorAll: function (selector) { return selector === '[data-dd-action]' ? [inheritedEl] : []; } },
    { model: bindModel, actions: {} });
  throws('bind 不把 Object.prototype.' + key + ' 当操作回调', function () { inheritedEl.click({}); }, key);
});
var noTabEl = fakeEl({ 'data-dd-tab': 'drugs' });
D.bind({ querySelectorAll: function (selector) { return selector === '[data-dd-tab]' ? [noTabEl] : []; } }, { model: {}, actions: {} });
throws('缺 onTab 抛带页签 key 的错误', function () { noTabEl.click({}); }, 'drugs');

// ===== 10. 空列必须有扩展列兜底；空页签明确拒绝 =====
throws('零公共列且零扩展列抛错', function () { D.renderDrugs({}, { columns: [] }); }, '至少');
var onlyExtra = D.renderDrugs({ drugs: [{ drugName: '药品A' }] }, {
  columns: [], extraColumns: [{ key: 'only', title: '仅扩展', cell: function (row) { return row.drugName; } }]
});
eq('零公共列允许一个扩展列', headers(onlyExtra), ['仅扩展']);
has('零公共列表体仍正常渲染', onlyExtra, '<tbody><tr><td>药品A</td></tr></tbody>');
has('零公共列空态 colspan=扩展列数', D.renderDrugs({}, {
  columns: [], extraColumns: [{ key: 'only', title: '仅扩展', cell: function () { return ''; } }]
}), 'colspan="1"');
throws('tabs=[] 明确抛错', function () { D.renderTabs({}, { tabs: [] }); }, 'tabs');
throws('extraColumns 缺 cell 函数抛带 key 的错误', function () {
  D.renderDrugs({}, { extraColumns: [{ key: 'broken', title: '坏扩展' }] });
}, 'broken');

// ===== 11. 非有限数：表体统一显示 —，scanQty 计数跳过 =====
var nonFiniteModel = { drugs: [], bad: [], activeTab: 'codes', codes: [
  { scanQty: 1 }, { scanQty: NaN }, { scanQty: Infinity }, { scanQty: -Infinity }, { scanQty: 2 }
] };
var nonFiniteTable = D.renderCodes(nonFiniteModel, { columns: ['scanQty'] });
eq('scanQty NaN/±Infinity 表体均为 —', (nonFiniteTable.match(/—/g) || []).length, 3);
notHas('scanQty 表体不错显 NaN', nonFiniteTable, 'NaN');
notHas('scanQty 表体不错显 Infinity', nonFiniteTable, 'Infinity');
var nonFiniteTabs = D.renderTabs(nonFiniteModel, { counts: { codes: 'scanQty' }, codes: { columns: ['scanQty'] } });
has('scanQty 计数跳过非有限数且与表体一致', nonFiniteTabs, '码详情（3）');
// 拆零码贡献 3/7 等循环小数：页签计数与旧口径 fmtN 一致取两位（2.43），不显长浮点（Task 2 规格复核偏差）
var fractionTabs = D.renderTabs({ drugs: [], bad: [], activeTab: 'codes', codes: [
  { scanQty: 2 }, { scanQty: 3 / 7 }
] }, { counts: { codes: 'scanQty' }, codes: { columns: ['scanQty'] } });
has('scanQty 计数两位取整（fmtN 口径）', fractionTabs, '码详情（2.43）');
notHas('scanQty 计数不显长浮点', fractionTabs, '2.42857');
var nonFiniteMoney = D.renderDrugs({ drugs: [
  { price: NaN, amount: Infinity }, { price: -Infinity, amount: 12.345 }
] }, { columns: ['price', 'amount'] });
has('price NaN 与 amount Infinity 均为 —', nonFiniteMoney, '<tbody><tr><td>—</td><td>—</td></tr>');
has('price -Infinity 为 —，有限 amount 仍格式化', nonFiniteMoney, '<tr><td>—</td><td>12.35</td></tr></tbody>');

// ===== 11.5 页签显示名覆盖 names（2026-10-18 拍板方案①：仅 drugs/codes/bad 三 key、只覆盖显示名、esc 转义、计数括号仍组件生成） =====
var namedTabs = D.renderTabs({ drugs: [], codes: [], bad: [], activeTab: 'bad' }, {
  tabs: ['codes', 'drugs', 'bad'], names: { bad: '无库存码' }, bad: { columns: ['seq'] }
});
has('names 覆盖页签显示名（计数括号仍组件生成）', namedTabs, '>无库存码（0）</button>');
notHas('names 覆盖后页签按钮不再出现默认名「异常码」', namedTabs, '>异常码（');
var namedEsc = D.renderTabs({}, { names: { drugs: '<脚本>' } });
has('names 值 esc 转义', namedEsc, '&lt;脚本&gt;');
notHas('names 值不输出原始标签', namedEsc, '<脚本>');
throws('names 未知 key 明确抛错', function () { D.renderTabs({}, { names: { nocode: '无码' } }); }, 'nocode');
throws('names 原型链 key 被拒', function () { D.renderTabs({}, { names: { toString: 'x' } }); }, 'toString');
has('默认不加 names 行为不变', D.renderTabs({}, { bad: { columns: ['seq'] } }), '异常码（0）');

// ===== 12. 采购到货单接入：静态接线契约 + 原业务函数保留 + 公共表头只来自组件 =====
var arriveHtml = fs.readFileSync(path.join(dir, '..', 'purchase-arrive.html'), 'utf8');
var arriveSrc = fs.readFileSync(path.join(dir, 'purchase-arrive.js'), 'utf8');
var sharedAt = arriveHtml.indexOf('scripts/purchase-shared.js');
var scanCoreAt = arriveHtml.indexOf('scripts/scan-core.js');
var docDetailAt = arriveHtml.indexOf('scripts/doc-detail.js?v=20261016-1');
var arriveAt = arriveHtml.indexOf('scripts/purchase-arrive.js');
ok('purchase-arrive.html 在 purchase-shared/scan-core 后、purchase-arrive 前加载 doc-detail',
  sharedAt > -1 && scanCoreAt > sharedAt && docDetailAt > scanCoreAt && arriveAt > docDetailAt);
eq('purchase-arrive.html 仅加载一次指定版本 doc-detail', arriveHtml.split('scripts/doc-detail.js?v=20261016-1').length - 1, 1);
ok('purchase-arrive.js 使用 PulDocDetail.renderTabs', /(?:window\.)?PulDocDetail\.renderTabs\s*\(/.test(arriveSrc));
ok('purchase-arrive.js 使用 PulDocDetail.bind', /(?:window\.)?PulDocDetail\.bind\s*\(/.test(arriveSrc));
['docBad', 'dupCodes', 'issueCount', 'scanTotalNum', 'scannedBase', 'fixedCodes',
  'statusOf', 'editable', 'auditFlow', 'openBadFix', 'goScan', 'reparseSel'].forEach(function (name) {
  ok('采购到货原关键业务函数保留：' + name, new RegExp('function\\s+' + name + '\\s*\\(').test(arriveSrc));
});
[
  ['药品公共 11 列', '<thead><tr><th>序号</th><th>药品名称</th><th>药品规格</th><th>生产厂家</th><th>批准文号</th><th>单价（元）</th><th>数量</th><th>扫码总量</th><th>差异</th><th>单位</th><th>金额（元）</th></tr></thead>'],
  ['码公共 12 列', '<thead><tr><th>序号</th><th>药品追溯码</th><th>药名通用名</th><th>码层级</th><th>父级码</th><th>生产批次</th><th>生产日期</th><th>有效期至</th><th>扫码数量</th><th>核对状态</th><th>标识码</th><th>发码机构</th></tr></thead>'],
  ['异常码公共列', '<thead><tr><th>序号</th><th>药品追溯码</th><th>标识码</th><th>异常原因</th><th>操作</th></tr></thead>']
].forEach(function (item) {
  notHas('purchase-arrive.js 不再本地拼接' + item[0] + ' thead', arriveSrc, item[1]);
});

// ===== 13. 统一扫码工作台接入：加载顺序 + 组件使用 + 业务调用保留 + 公共表头只来自组件（Task 3） =====
var hubHtml = fs.readFileSync(path.join(dir, '..', 'scan-hub.html'), 'utf8');
var hubUiSrc = fs.readFileSync(path.join(dir, 'scan-hub-ui.js'), 'utf8');
var hubScanCoreAt = hubHtml.indexOf('scripts/scan-core.js');
var hubDocDetailAt = hubHtml.indexOf('scripts/doc-detail.js?v=20261016-1');
var hubUiAt = hubHtml.indexOf('scripts/scan-hub-ui.js');
ok('scan-hub.html 在 scan-core.js 后、scan-hub-ui.js 前加载 doc-detail',
  hubScanCoreAt > -1 && hubDocDetailAt > hubScanCoreAt && hubUiAt > hubDocDetailAt);
eq('scan-hub.html 仅加载一次指定版本 doc-detail', hubHtml.split('scripts/doc-detail.js?v=20261016-1').length - 1, 1);
ok('scan-hub-ui.js 双栏并示（renderDrugs+renderCodes，不再 renderTabs）',
  /(?:window\.)?PulDocDetail\.renderDrugs\s*\(/.test(hubUiSrc) &&
  /(?:window\.)?PulDocDetail\.renderCodes\s*\(/.test(hubUiSrc) &&
  !/(?:window\.)?PulDocDetail\.renderTabs\s*\(/.test(hubUiSrc));
ok('scan-hub-ui.js 双栏容器类 hub-duo', /hub-duo/.test(hubUiSrc));
ok('scan-hub-ui.js 异常码 chip 展开切换属性 data-dd-badtgl', /data-dd-badtgl/.test(hubUiSrc));
ok('scan-hub-ui.js 使用 PulDocDetail.bind', /(?:window\.)?PulDocDetail\.bind\s*\(/.test(hubUiSrc));
['上架进度：', 'hubBackBtn', 'hubAudit', 'hubClose', 'hubClear', 'hub-fixed-foot'].forEach(function (mark) {
  ok('scan-hub-ui.js footer 分支特征保留：' + mark, hubUiSrc.indexOf(mark) > -1);
});
notHas('scan-hub-ui.js 旧页签状态已清理（无 data-ltab）', hubUiSrc, 'data-ltab');
['HUB\\.ctxOf\\(', 'SC\\.codeContrib\\(', 'SC\\.scannedBase\\(', 'SC\\.decomp\\(',
  'SC\\.fmtN\\(', 'SC\\.planBase\\(', 'SC\\.saleUnit\\('].forEach(function (call) {
  ok('scan-hub-ui.js 保留关键业务调用：' + call, new RegExp(call).test(hubUiSrc));
});
[
  ['药品公共 11 列', '<thead><tr><th>序号</th><th>药品名称</th><th>药品规格</th><th>生产厂家</th><th>批准文号</th><th>单价（元）</th><th>数量</th><th>扫码总量</th><th>差异</th><th>单位</th><th>金额（元）</th></tr></thead>'],
  ['码公共 12 列', '<thead><tr><th>序号</th><th>药品追溯码</th><th>药名通用名</th><th>码层级</th><th>父级码</th><th>生产批次</th><th>生产日期</th><th>有效期至</th><th>扫码数量</th><th>核对状态</th><th>标识码</th><th>发码机构</th>'],
  ['异常码头', '<thead><tr><th>药品追溯码</th><th>标识码</th><th>异常原因</th><th>时间</th>']
].forEach(function (item) {
  notHas('scan-hub-ui.js 不再本地拼接' + item[0] + ' thead', hubUiSrc, item[1]);
});
// 二期 Task D：异常码恒收起（chip 点击展开）+ 展开区移到双栏上方 + 双栏固定高度
notHas('scan-hub-ui.js BAD_OPEN 默认收起（无 bad>0 自动展开旧逻辑）', hubUiSrc, 'bad > 0 && BAD_OPEN !== false');
ok('scan-hub-ui.js 展开态判定为 BAD_OPEN === true（null=恒收起，chip 点击切换）', /BAD_OPEN === true/.test(hubUiSrc));
ok('scan-hub-ui.js bad 展开区在双栏上方（hub-duo-bad 先于 hub-duo 渲染）',
  hubUiSrc.indexOf('<div class="hub-duo-bad">') > -1 &&
  hubUiSrc.indexOf('<div class="hub-duo-bad">') < hubUiSrc.indexOf('<div class="hub-duo">'));
ok('scan-hub.html hub-duo 双栏固定高度（height:360px，非 max-height）',
  /\.hub-duo-col \.table-responsive \{ height: ?360px/.test(hubHtml));
ok('scan-hub.html bad 展开区内滚上限（max-height:260px）',
  /\.hub-duo-bad \.table-responsive \{ max-height: ?260px/.test(hubHtml));

// 二期 Task E：扫码标题头统一五字段（单据类型/单据单号/单据时间/发货方/收货方）——scan-hub banner 特征
// 词与取值同各页列表列（Round BZ 单据类型列 + 各列表发货/收货列）；值全部取自单据已有字段，缺概念显 —；shelf 移位作业无五字段保现状头
var P2E_LABELS = ['单据类型', '单据单号', '单据时间', '发货方', '收货方'];
P2E_LABELS.forEach(function (lb) {
  ok('scan-hub-ui.js 五字段标签「' + lb + '」', hubUiSrc.indexOf(lb) > -1);
});
ok('scan-hub-ui.js 五字段行容器（pch-scan-fields + pch-scan-field-label）',
  hubUiSrc.indexOf('pch-scan-fields') > -1 && hubUiSrc.indexOf('pch-scan-field-label') > -1);
['采购到货', '采购退货', '调拨出库', '调拨入库', '处方出库', '摆药出库'].forEach(function (t) {
  ok('scan-hub-ui.js 场景单据类型词与列表列一致：' + t, hubUiSrc.indexOf(t) > -1);
});
ok('scan-hub-ui.js shelf 无五字段场景映射（保现状头：单号+标题兜底行仍在）',
  hubUiSrc.indexOf("esc(hd.billNo) + '（' + esc(hd.title)") > -1);
ok('scan-hub-ui.js 状态徽标靠右保留（ms-auto + UI.light(stateText)）',
  hubUiSrc.indexOf("'<span class=\"ms-auto\"></span>' + UI.light(stateText)") > -1);
ok('purchase.css 五字段样式类已追加（pch-scan-fields / pch-scan-field-label）',
  fs.readFileSync(path.join(dir, '..', 'styles', 'purchase.css'), 'utf8').indexOf('pch-scan-fields') > -1 &&
  fs.readFileSync(path.join(dir, '..', 'styles', 'purchase.css'), 'utf8').indexOf('pch-scan-field-label') > -1);

// ===== 14. Task4 第一批接入防回退清单：purchase-out / purchase-in / wh-other-in =====
// 静态接线契约（加载顺序+仅一次）+ 组件使用（renderTabs/bind）+ 原关键业务函数保留 + 公共表头只来自组件
var FULL_TAB_PAGES = [
  { page: 'purchase-out', script: 'purchase-out.js',
    fns: ['parseFailCodes', 'issueCount'],
    heads: [
      ['码 12 列 thead', '<thead><tr><th>序号</th><th>药品追溯码(一级)</th><th>批次号</th>'],
      ['药品 13 列 thead', '<thead><tr><th>序号</th><th>药名通用名</th><th>制剂规格</th>'],
      ['异常码 thead', '<thead><tr><th>序号</th><th>药品追溯码</th><th>标识码</th><th>异常原因</th><th>登记时间</th>']
    ] },
  { page: 'purchase-in', script: 'purchase-in.js',
    fns: ['codesPanel', 'drugsPanel'],
    tabsOnly: /tabs:\s*\[\s*'codes'\s*,\s*'drugs'\s*\]/,
    heads: [
      ['码 8 列 thead', '<thead><tr><th>序号</th><th>药品追溯码(一级)</th><th>批次号</th>'],
      ['药品 11 列 thead', '<thead><tr><th>序号</th><th>药名通用名</th><th>制剂规格</th>']
    ] },
  { page: 'wh-other-in', script: 'wh-other-in.js',
    fns: ['badCodesOf', 'openScanModal', 'openEdit'],
    heads: [
      ['码 12 列 thead', '<thead><tr><th>序号</th><th>药品追溯码(一级)</th><th>批次号</th>'],
      ['药品 9 列 thead', '<thead><tr><th>序号</th><th>药品通用名</th><th>制剂规格</th>'],
      ['异常码 thead', '<thead><tr><th>序号</th><th>药品追溯码</th><th>标识码</th><th>异常原因</th><th>操作</th>']
    ] },
  // —— Task4 第二批：wh-other-out / wh-pick / ph-req-in / wh-pick-out（第三页签「无库存码」经 names 覆盖 bad 显示名，2026-10-18 拍板方案①） ——
  { page: 'wh-other-out', script: 'wh-other-out.js',
    fns: ['checkedCount', 'openPickModal', 'openAdd'],
    heads: [
      ['码详情旧 8 列 thead', '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>库位</th><th>核对</th>'],
      ['药品清单旧 6 列 thead', '<thead><tr><th>序号</th><th>药品通用名</th><th>制剂规格</th><th>批次</th><th>应出</th><th>已核对</th>']
    ] },
  { page: 'wh-pick', script: 'wh-pick.js',
    fns: ['itemsTable', 'codesTable', 'docBaseQty'],
    heads: [
      ['药品清单计划 11 列 thead', '<thead><tr><th>序号</th><th>药品编码</th><th>药名通用名</th><th>制剂规格</th><th>生产厂家</th><th>批准文号</th><th>上架货位</th><th>计划数量</th>'],
      ['药品清单聚合 10 列 thead', '<thead><tr><th>序号</th><th>药品编码</th><th>药名通用名</th><th>制剂规格</th><th>生产厂家</th><th>批准文号</th><th>上架货位</th><th>扫码数量</th>'],
      ['追溯码明细 9 列 thead', '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>库位</th><th>预期货位</th>']
    ] },
  { page: 'ph-req-in', script: 'ph-req-in.js',
    fns: ['phScanQty', 'docBaseQty'],
    heads: [
      ['药品清单旧 9 列 thead', '<thead><tr><th>序号</th><th>药品编码</th><th>药名通用名</th><th>规格</th><th>生产厂家</th><th>批准文号</th><th>计划数量</th>'],
      ['码详情旧 7 列 thead', '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>预期货位</th><th>状态</th>']
    ] },
  { page: 'wh-pick-out', script: 'wh-pick-out.js',
    fns: ['openCodes', 'drugRows'],
    namesTab: /names:\s*\{\s*bad:\s*'无库存码'/,
    heads: [
      ['码详情旧 7 列 thead', '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>预期货位</th><th>上架货位</th>'],
      ['药品清单旧 12 列 thead', '<thead><tr><th>序号</th><th>取药槽编码</th><th>药名通用名</th><th>药品规格</th><th>计划数量</th>']
    ] }
];
FULL_TAB_PAGES.forEach(function (item) {
  var pageHtml = fs.readFileSync(path.join(dir, '..', item.page + '.html'), 'utf8');
  var pageSrc = fs.readFileSync(path.join(dir, item.script), 'utf8');
  var pageSharedAt = pageHtml.indexOf('scripts/purchase-shared.js');
  var pageDdAt = pageHtml.indexOf('scripts/doc-detail.js?v=20261016-1');
  var pageScriptAt = pageHtml.indexOf('scripts/' + item.script);
  ok(item.page + '.html 在 purchase-shared 后、页面脚本前加载 doc-detail',
    pageSharedAt > -1 && pageDdAt > pageSharedAt && pageScriptAt > pageDdAt);
  eq(item.page + '.html 仅加载一次指定版本 doc-detail', pageHtml.split('scripts/doc-detail.js?v=20261016-1').length - 1, 1);
  ok(item.script + ' 使用 PulDocDetail.renderTabs', /(?:window\.)?PulDocDetail\.renderTabs\s*\(/.test(pageSrc));
  ok(item.script + ' 使用 PulDocDetail.bind', /(?:window\.)?PulDocDetail\.bind\s*\(/.test(pageSrc));
  if (item.tabsOnly) ok(item.script + ' 页签只读双签（无 bad）', item.tabsOnly.test(pageSrc));
  if (item.namesTab) ok(item.script + ' 页签名经 names 覆盖（bad→无库存码）', item.namesTab.test(pageSrc));
  item.fns.forEach(function (name) {
    ok(item.script + ' 保留关键业务函数：' + name, new RegExp('function\\s+' + name + '\\s*\\(').test(pageSrc));
  });
  item.heads.forEach(function (head) {
    notHas(item.script + ' 不再本地拼接' + head[0], pageSrc, head[1]);
  });
  notHas(item.script + ' 旧页签监听已清理（无 data-ptab）', pageSrc, 'data-ptab');
});

// ===== 15. Task4 第二批补充断言：旧页签监听清理 + 关键业务语义保留 =====
var pickOut2Src = fs.readFileSync(path.join(dir, 'wh-pick.js'), 'utf8');
notHas('wh-pick.js 旧明细页签监听已清理（无 data-dtab）', pickOut2Src, 'data-dtab');
ok('wh-pick.js 明细卡尾状态提示保留（footerHtml）', pickOut2Src.indexOf('统一扫码页完成') > -1 && pickOut2Src.indexOf('在途——待药房') > -1);
var reqIn2Src = fs.readFileSync(path.join(dir, 'ph-req-in.js'), 'utf8');
notHas('ph-req-in.js 旧明细页签监听已清理（无 data-tab）', reqIn2Src, 'data-tab');
ok('ph-req-in.js 审核统一判定保留（计划数量=扫码数量才放行 → auditPickIn）',
  reqIn2Src.indexOf('不一致不允许审核') > -1 && reqIn2Src.indexOf('auditPickIn') > -1);
ok('ph-req-in.js 行内扫码录入深链保留（scan-hub.html?billNo=）', reqIn2Src.indexOf('scan-hub.html?billNo=') > -1);
var othOut2Src = fs.readFileSync(path.join(dir, 'wh-other-out.js'), 'utf8');
ok('wh-other-out.js 底部审核出库钮 disabled 语义保留（全核对才 enabled）',
  othOut2Src.indexOf('id="btnAudit"') > -1 && othOut2Src.indexOf('全部核对完成才能审核出库') > -1);
ok('wh-other-out.js 选在架码入口保留（btnPick）', othOut2Src.indexOf('id="btnPick"') > -1);
var pkoSrc = fs.readFileSync(path.join(dir, 'wh-pick-out.js'), 'utf8');
ok('wh-pick-out.js 无库存码静态说明经 emptyText 承载', pkoSrc.indexOf('非在架码在备货出库扫码时已被拦截') > -1);
ok('wh-pick-out.js 码列表按钮保留（data-codes → openCodes）', pkoSrc.indexOf('data-codes') > -1 && new RegExp('function\\s+openCodes\\s*\\(').test(pkoSrc));

// ===== 16. Task5 独立卡片/工作台页接入：PulDocDetail 独立表格 API（renderDrugs/renderCodes） =====
// 静态接线契约（purchase-shared 后、页面脚本前加载 doc-detail 且仅一次）+ 独立表格 API 使用
// + 原关键业务函数/页面专属交互属性保留 + 公共表头只来自组件（旧本地 thead 消失）
var STANDALONE_PAGES = [
  { page: 'scan-lab', script: 'scan-lab-ui.js',
    apis: ['renderDrugs', 'renderCodes'],
    fns: ['itemsTableHtml', 'codesTableHtml', 'shelfFooterHtml'],
    keeps: ['data-rmcode', 'data-rmbad', 'data-ltab'],
    heads: [
      ['药品清单旧 7 列 thead', '<thead><tr><th>序号</th><th>药品</th><th>生产厂家</th><th>数量</th><th>换算</th><th>扫码总量</th><th>差异</th>'],
      ['码明细旧 10 列 thead', '<thead><tr><th>序号</th><th>药品追溯码</th><th>标识码</th><th>药品</th><th>层级</th><th>折合</th><th>批次</th><th>效期</th><th>拆零</th><th>时间</th>']
    ] },
  { page: 'ph-ret-out', script: 'ph-ret-out.js',
    apis: ['renderDrugs', 'renderCodes'],
    fns: ['drugsCard', 'codesCard', 'checkedCount', 'confirmOut', 'openScanModal', 'openPickModal'],
    keeps: ['data-uncode', 'pch-progress', 'id="btnPick"', 'id="btnOut"'],
    heads: [
      ['药品明细旧 6 列 thead', '<thead><tr><th>序号</th><th>药品通用名</th><th>制剂规格</th><th>批次</th><th>应退</th><th>已核对</th>'],
      ['追溯码明细旧 7 列 thead', '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>拆零提示</th><th>核对</th>']
    ] },
  { page: 'ph-req', script: 'ph-req.js',
    apis: ['renderDrugs'],
    fns: ['itemsCard', 'openEdit'],
    keeps: ['data-edit', 'data-submit'],
    heads: [
      ['申请药品明细旧 9 列 thead', '<thead><tr><th>序号</th><th>药品编码</th><th>药品通用名</th><th>制剂规格</th><th>生产厂家</th><th>批准文号</th><th>上架货位</th><th>计划数量</th><th>单位</th>']
    ] },
  { page: 'disp', script: 'disp.js',
    apis: ['renderDrugs', 'renderCodes'],
    fns: ['itemsCard', 'openScan', 'openBind', 'pullHis'],
    keeps: ['data-mbind'],
    heads: [
      ['药品清单旧 9 列 thead', '<thead><tr><th>#</th><th>药品</th><th>规格</th><th>应发</th><th>已扫/应扫</th><th>锁 / 在架</th><th>建议货位</th><th>建议码</th><th>操作</th>'],
      ['已绑码旧 5 列 thead', '<thead><tr><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>货位</th>']
    ] },
  { page: 'tray', script: 'tray.js',
    apis: ['renderDrugs'],
    fns: ['itemsCard', 'openScan', 'openBind', 'finishTray'],
    keeps: ['data-mbind', 'data-finish'],
    heads: [
      ['药品清单旧 9 列 thead', '<thead><tr><th>#</th><th>药品</th><th>规格</th><th>应摆</th><th>已扫/应扫</th><th>锁 / 在架</th><th>建议货位</th><th>建议码</th><th>操作</th>']
    ] },
  { page: 'wh-return-in', script: 'wh-return-in.js',
    apis: ['renderCodes'],
    fns: ['checkCard', 'openScanModal', 'openAudit', 'openAdd'],
    keeps: ['data-ck', 'data-uncode', 'pch-progress'],
    heads: [
      ['核对表旧 7 列 thead', '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>拆零提示</th><th>']
    ] },
  { page: 'wh-loss-out', script: 'wh-loss-out.js',
    apis: ['renderCodes'],
    fns: ['codesCard', 'openAudit', 'openEdit', 'openScanModal'],
    keeps: ['data-del'],
    heads: [
      ['报损码清单旧 6 列 thead', '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>操作</th>']
    ] },
  { page: 'ph-loss', script: 'ph-loss.js',
    apis: ['renderCodes'],
    fns: ['codesCard', 'openAudit', 'openScanModal'],
    keeps: ['data-del'],
    heads: [
      ['报损码清单旧 6 列 thead', '<thead><tr><th>序号</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>操作</th>']
    ] },
  { page: 'rx-ret', script: 'rx-ret.js',
    apis: ['renderCodes'],
    fns: ['codesCard', 'doRet', 'allCodes'],
    keeps: ['data-ret'],
    heads: [
      ['已绑码旧 6 列 thead', '<thead><tr><th>#</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>货位</th>']
    ] },
  { page: 'tray-ret', script: 'tray-ret.js',
    apis: ['renderCodes'],
    fns: ['codesCard', 'doRet', 'allCodes'],
    keeps: ['data-pick', 'id="ckAll"', 'id="retReason"', 'id="btnRet"'],
    heads: [
      ['已绑码旧 8 列 thead', '<th>#</th><th>追溯码</th><th>药品</th><th>批次</th><th>效期</th><th>货位</th><th>拆零</th>']
    ] },
  { page: 'ward-sign', script: 'ward-sign.js',
    apis: ['renderCodes'],
    fns: ['codesCard', 'openScan', 'markSigned'],
    keeps: ['pch-light'],
    heads: [
      ['码清单旧 6 列 thead', '<thead><tr><th>#</th><th>追溯码</th><th>药品</th><th>批次</th><th>货位</th><th>签收</th>']
    ] }
];
STANDALONE_PAGES.forEach(function (item) {
  var pageHtml = fs.readFileSync(path.join(dir, '..', item.page + '.html'), 'utf8');
  var pageSrc = fs.readFileSync(path.join(dir, item.script), 'utf8');
  var pageSharedAt = pageHtml.indexOf('scripts/purchase-shared.js');
  var pageDdAt = pageHtml.indexOf('scripts/doc-detail.js?v=20261016-1');
  var pageScriptAt = pageHtml.indexOf('scripts/' + item.script);
  ok(item.page + '.html 在 purchase-shared 后、页面脚本前加载 doc-detail',
    pageSharedAt > -1 && pageDdAt > pageSharedAt && pageScriptAt > pageDdAt);
  eq(item.page + '.html 仅加载一次指定版本 doc-detail', pageHtml.split('scripts/doc-detail.js?v=20261016-1').length - 1, 1);
  item.apis.forEach(function (api) {
    ok(item.script + ' 使用独立表格 PulDocDetail.' + api, new RegExp('(?:window\\.)?PulDocDetail\\.' + api + '\\s*\\(').test(pageSrc));
  });
  ok(item.script + ' 不用卡片壳 renderTabs（独立表格直嵌页面卡片）', !/(?:window\.)?PulDocDetail\.renderTabs\s*\(/.test(pageSrc));
  item.fns.forEach(function (name) {
    ok(item.script + ' 保留关键业务函数：' + name, new RegExp('function\\s+' + name + '\\s*\\(').test(pageSrc));
  });
  item.keeps.forEach(function (attr) {
    ok(item.script + ' 页面专属交互保留：' + attr, pageSrc.indexOf(attr) > -1);
  });
  item.heads.forEach(function (head) {
    notHas(item.script + ' 不再本地拼接' + head[0], pageSrc, head[1]);
  });
});

// ===== 16.1 wh-return-in 行勾选交互回归（Task6）：组件行无行级 data，页面侧行级委托恢复「点行任意处勾选」 =====
var wriSrc = fs.readFileSync(path.join(dir, 'wh-return-in.js'), 'utf8');
ok('wh-return-in.js 存在核对表行级委托监听（#retCheckCard tbody tr）',
  wriSrc.indexOf("querySelectorAll('#retCheckCard tbody tr')") > -1);
ok('wh-return-in.js 行级委托排除事件源在 data-ck/data-uncode/按钮内（防双触发）',
  wriSrc.indexOf("closest('[data-ck],[data-uncode],button") > -1);
ok('wh-return-in.js tabbar 提示文案恢复行勾选口径', wriSrc.indexOf('也可点码行人工勾选') > -1);
notHas('wh-return-in.js 不再残留「点码行核对列」收窄文案', wriSrc, '点码行核对列人工勾选');

// ===== 17. 20 页收编总清单防回退：任一页从接线清单遗漏/多登记即 FAIL（Task6 总断言） =====
var PAGE_INVENTORY = [
  'purchase-arrive', 'purchase-out', 'purchase-in', 'wh-other-in', 'wh-other-out',
  'wh-pick', 'wh-pick-out', 'ph-req', 'ph-req-in', 'ph-ret-out',
  'scan-hub', 'scan-lab', 'disp', 'tray', 'wh-return-in',
  'wh-loss-out', 'ph-loss', 'rx-ret', 'tray-ret', 'ward-sign'
];
// 页面 → 页面脚本名（scan-hub/scan-lab 页面脚本为 *-ui.js，其余同名）
var INVENTORY_SCRIPTS = {
  'scan-hub': 'scan-hub-ui.js', 'scan-lab': 'scan-lab-ui.js'
};
var registeredPages = ['purchase-arrive']   // §12 采购到货
  .concat(['scan-hub'])                     // §13 统一扫码工作台
  .concat(FULL_TAB_PAGES.map(function (p) { return p.page; }))
  .concat(STANDALONE_PAGES.map(function (p) { return p.page; }));
eq('收编总清单固定 20 页', PAGE_INVENTORY.length, 20);
var invMissing = PAGE_INVENTORY.filter(function (p) { return registeredPages.indexOf(p) < 0; });
var invExtra = registeredPages.filter(function (p) { return PAGE_INVENTORY.indexOf(p) < 0; });
ok('20 页全部登记于防回退接线清单' + (invMissing.length ? '（缺：' + invMissing.join(',') + '）' : ''), !invMissing.length);
ok('接线清单无多登记/重复页' + (invExtra.length ? '（多：' + invExtra.join(',') + '）' : ''),
  !invExtra.length && registeredPages.length === 20);
// 逐页独立接线检查：doc-detail 指定版本仅一次，且位于 purchase-shared 后、页面脚本前
PAGE_INVENTORY.forEach(function (page) {
  var script = INVENTORY_SCRIPTS[page] || page + '.js';
  var pageHtml = fs.readFileSync(path.join(dir, '..', page + '.html'), 'utf8');
  var ddAt = pageHtml.indexOf('scripts/doc-detail.js?v=20261016-1');
  ok(page + '.html 加载指定版本 doc-detail 且在 ' + script + ' 之前',
    ddAt > -1 &&
    pageHtml.indexOf('scripts/purchase-shared.js') < ddAt &&
    ddAt < pageHtml.indexOf('scripts/' + script));
  eq(page + '.html 仅加载一次 doc-detail', pageHtml.split('scripts/doc-detail.js?v=20261016-1').length - 1, 1);
});

// ===== 18. _t-* 测试壳防回退：凡执行已收编页脚本的壳必须引入 doc-detail（Task6） =====
var SHELLS_WITH_PAGES = [
  ['_t-oth-in', 'wh-other-in.js'],
  ['_t-pch-add', 'purchase-arrive.js'],
  ['_t-pch-audit', 'purchase-arrive.js'],
  ['_t-pch-edit', 'purchase-arrive.js'],
  ['_t-pch-plan', 'purchase-arrive.js'],
  ['_t-pout', 'purchase-out.js'],
  ['_t-wh-pick', 'wh-pick.js'],
  ['_t-ph-req', 'ph-req.js'],
  ['_t-ph-req-open', 'ph-req.js'],
  ['_t-wh-return-in', 'wh-return-in.js']
];
SHELLS_WITH_PAGES.forEach(function (item) {
  var shellHtml = fs.readFileSync(path.join(dir, '..', item[0] + '.html'), 'utf8');
  var shellDdAt = shellHtml.indexOf('scripts/doc-detail.js?v=20261016-1');
  var shellPageAt = shellHtml.indexOf('scripts/' + item[1]);
  ok(item[0] + '.html 执行 ' + item[1] + ' 且在前加载 doc-detail',
    shellHtml.indexOf(item[1]) > -1 && shellDdAt > -1 && shellPageAt > shellDdAt);
});

// ===== 19. 仓库级手拼明细表清扫（终审 I-1）：变体表头 / 新增页自写表格即 FAIL =====
// 两层守卫：① 三类公共表头**精确串**全仓禁止（含白名单文件——弹窗/查询表不会逐字拼出 11/12 列公共表头）；
// ② 明细表特征串（<th>药品名称</th> 等）在**非白名单**脚本中出现即 FAIL。白名单 = 范围外的合法表格所有者，
// 新页面要自写明细表必须改本白名单（登记理由）或走 PulDocDetail，二选一，不允许静默绕过。
var SWEEP_FULL_HEADS = [
  '<thead><tr><th>序号</th><th>药品名称</th><th>药品规格</th><th>生产厂家</th><th>批准文号</th><th>单价（元）</th><th>数量</th><th>扫码总量</th><th>差异</th><th>单位</th><th>金额（元）</th></tr></thead>',
  '<thead><tr><th>序号</th><th>药品追溯码</th><th>药名通用名</th><th>码层级</th><th>父级码</th><th>生产批次</th><th>生产日期</th><th>有效期至</th><th>扫码数量</th><th>核对状态</th><th>标识码</th><th>发码机构</th></tr></thead>'
];
var SWEEP_MARKERS = ['<th>药品名称</th>', '<th>药名通用名</th>', '<th>药品追溯码(一级)</th>', '<th>追溯码</th>'];
// 白名单：文件 → 理由（均为范围外表格：弹窗选择列表 / 查询页 / 台账 / 字典 / 跳转壳遗留 / 盘点域未收编）
var SWEEP_WHITELIST = {
  'purchase-arrive.js': 'poolDetailHtml 供应商平台码单预览（码单池，非单据明细，基准既有）',
  'bad-codes.js': '异常码台账全页（跨单据台账，非单内明细）',
  'purchase-detail.js': '采购明细查询页 + 码明细弹窗',
  'drug.js': '药品字典维护页', 'drug-picker.js': '药品选择器弹窗', 'idcode.js': '标识码字典查询页',
  'rx-bind.js': '手动绑码弹窗内候选码表',
  'ph-ret-out.js': 'openPickModal/openAdd 选在架码弹窗（弹窗选择列表，非单据明细主表）',
  'wh-other-out.js': 'openPickModal 选在架码弹窗（同上）',
  'wh-pick-out.js': 'openCodes 码列表弹窗（同上）',
  'quick-scan.js': '旧工作台脚本（页面已重定向 scan-hub，壳遗留）',
  'ph-scan-in.js': '旧工作台脚本（页面已重定向 scan-hub，壳遗留）',
  'inv.js': '盘点域（未收编，后续轮次评估）', 'inv-gain.js': '盘盈域（同上）', 'inv-loss.js': '盘损域（同上）',
  'ph-stock.js': '药房库存查询页', 'wh-stock.js': '库房库存查询页',
  'ph-in-query.js': '入库明细查询页', 'wh-out-query.js': '出库明细查询页',
  'purchase-out-query.js': '退货明细查询页', 'wh-loss-query.js': '损耗明细查询页',
  'flow-q.js': '流转查询页', 'trace-q.js': '追溯查询页',
  'rx-item-q.js': '处方药品明细查询页', 'rx-agg-q.js': '处方药品汇总查询页', 'rx-ret-q.js': '处方退药查询页',
  'tray-q.js': '摆药赋码查询页', 'tray-ret-q.js': '摆药退药查询页',
  'ph-shelf.js': '药品扫码上架（扫码头信息表，非单据明细）', 'ph-shelf-q.js': '待上架查询页',
  'light.js': '补药指示灯', 'ledger.js': '台账流水', 'cabinet.js': '取药柜维护',
  'slot-drug-map.js': '槽药对照维护', 'slot-lamp-map.js': '槽灯对照维护', 'log-op.js': '操作日志', 'log-login.js': '登录日志'
};
function sweepHandTables(src) {
  return SWEEP_FULL_HEADS.filter(function (h) { return src.indexOf(h) > -1; });
}
function sweepMarkers(src, fileName) {
  if (SWEEP_WHITELIST[fileName]) return [];
  return SWEEP_MARKERS.filter(function (m) { return src.indexOf(m) > -1; });
}
// 自证：清扫逻辑必须能抓住合成反例（防清扫本身失效）
ok('清扫自证：合成公共表头被精确匹配', sweepHandTables(SWEEP_FULL_HEADS[0] + 'x').length === 1);
ok('清扫自证：非白名单文件特征串被匹配', sweepMarkers('<th>追溯码</th>', 'some-new-page.js').length === 1);
ok('清扫自证：白名单文件特征串豁免', sweepMarkers('<th>追溯码</th>', 'ph-stock.js').length === 0);
fs.readdirSync(dir).filter(function (f) {
  return f.slice(-3) === '.js' && f.indexOf('_t-') !== 0 && f !== 'doc-detail.js';
}).forEach(function (f) {
  var src = fs.readFileSync(path.join(dir, f), 'utf8');
  ok(f + ' 不含公共表头精确串', !sweepHandTables(src).length);
  var markHit = sweepMarkers(src, f);
  ok(f + ' 无未登记手拼明细表特征' + (markHit.length ? '（命中：' + markHit.join('、') + '；如确需自写请更新白名单并注明理由）' : ''), !markHit.length);
});

// ===== 20. 二期 Task B/D：PchUI.openScan 近全屏大版面（headerHtml 单据头 + drugsRows 药品清单双栏）契约 =====
// 静态接线契约（与 §12-16 同口径）：openScan 契约代码特征 + 降级守卫 + 宽度 1800 近全屏（Task D，原 1280）；9 调用页接线、inv.js 不接线
var p2bShared = fs.readFileSync(path.join(dir, 'purchase-shared.js'), 'utf8');
var p2bScanAt = p2bShared.indexOf('function openScan(');
var p2bScanEnd = p2bShared.indexOf('function renderScanItems(');
ok('purchase-shared.js openScan 函数区可定位', p2bScanAt > -1 && p2bScanEnd > p2bScanAt);
var p2bOpenScan = p2bShared.slice(p2bScanAt, p2bScanEnd);
ok('openScan 支持 opts.headerHtml 单据头摘要区（pch-scan-header）',
  p2bOpenScan.indexOf('opts.headerHtml') > -1 && p2bOpenScan.indexOf('pch-scan-header') > -1);
ok('openScan 支持 opts.drugsRows 药品清单行模型工厂', p2bOpenScan.indexOf('opts.drugsRows') > -1);
ok('openScan 双栏降级守卫（window.PulDocDetail.renderDrugs 存在性检查后才走双栏）',
  /typeof\s+opts\.drugsRows\s*===\s*'function'[\s\S]{0,160}window\.PulDocDetail[\s\S]{0,160}renderDrugs/.test(p2bOpenScan));
ok('openScan 双栏容器（左 pchScanDrugs ⇄ 右 pchScanResult）', p2bOpenScan.indexOf('pch-scan-duo') > -1 && p2bOpenScan.indexOf('pchScanDrugs') > -1);
ok('openScan 默认宽度 1800 近全屏（不再 1280/720）',
  p2bOpenScan.indexOf(', 1800)') > -1 && p2bOpenScan.indexOf('1280') < 0 && p2bOpenScan.indexOf('720') < 0);
var p2dHubFn = p2bShared.slice(p2bShared.indexOf('function openScanHub('), p2bShared.indexOf('function auditBlock('));
ok('openScanHub 弹窗宽度 1800 近全屏', p2dHubFn.indexOf(', 1800)') > -1);
ok('openScanHub iframe 高度近满屏（86vh，EMBED 内部已有滚动）', p2dHubFn.indexOf('86vh') > -1);
ok('renderScanItems 刷新点顺带重渲染左栏（重调 drugsRows）',
  p2bShared.slice(p2bShared.indexOf('function renderScanItems('), p2bShared.indexOf('function closeScan(')).indexOf('pchScanDrugs') > -1);
ok('purchase.css 双栏样式类已追加（pch-scan-duo）',
  fs.readFileSync(path.join(dir, '..', 'styles', 'purchase.css'), 'utf8').indexOf('pch-scan-duo') > -1);

// 9 个调用页各自接线 headerHtml + drugsRows；inv.js（盘点域未收编）不接线
['disp', 'ph-loss', 'ph-ret-out', 'tray', 'ward-sign', 'wh-loss-out', 'wh-other-in', 'wh-other-out', 'wh-return-in']
  .forEach(function (p) {
    var src = fs.readFileSync(path.join(dir, p + '.js'), 'utf8');
    ok(p + '.js openScan 接线 headerHtml（单据号+关键头字段）', /headerHtml:\s*/.test(src));
    ok(p + '.js openScan 接线 drugsRows（本页行模型工厂）', /drugsRows:\s*function/.test(src));
  });
var p2bInv = fs.readFileSync(path.join(dir, 'inv.js'), 'utf8');
ok('inv.js 不接线（无 headerHtml/drugsRows，走降级单列路径）',
  p2bInv.indexOf('headerHtml:') < 0 && p2bInv.indexOf('drugsRows:') < 0);

// 二期 Task E：9 页 headerHtml 统一五字段行（label/value 结构与 scan-hub banner 一致；单据类型词与各页列表列一致；
// .pch-scan-header 容器契约仍在——§20 上文 /headerHtml:\s*/ 断言继续覆盖接线本身）
var P2E_TYPE = { 'disp': '处方出库', 'tray': '摆药出库', 'ward-sign': '病区签收', 'ph-loss': '报损出库',
  'wh-loss-out': '报损出库', 'ph-ret-out': '退回出库', 'wh-return-in': '领用退回',
  'wh-other-in': '其它入库', 'wh-other-out': '其它出库' };
var p2eCssSrc = fs.readFileSync(path.join(dir, '..', 'styles', 'purchase.css'), 'utf8');
Object.keys(P2E_TYPE).forEach(function (p) {
  var src = fs.readFileSync(path.join(dir, p + '.js'), 'utf8');
  ok(p + '.js headerHtml 五字段行容器（pch-scan-fields）', src.indexOf('pch-scan-fields') > -1);
  P2E_LABELS.forEach(function (lb) {
    ok(p + '.js 五字段标签「' + lb + '」', src.indexOf(lb) > -1);
  });
  ok(p + '.js 单据类型词与列表列一致（' + P2E_TYPE[p] + '）', src.indexOf(P2E_TYPE[p]) > -1);
});
ok('purchase.css 五字段样式类已追加（pch-scan-field-label）', p2eCssSrc.indexOf('pch-scan-field-label') > -1);

// scan-hub.html 详情介绍文案更新：双栏并示口径，无「双页签联动」残留
var p2bHub = fs.readFileSync(path.join(dir, '..', 'scan-hub.html'), 'utf8');
ok('scan-hub.html 介绍文案已更新为双栏并示', p2bHub.indexOf('药品清单⇄码明细双栏并示') > -1);
notHas('scan-hub.html 无「双页签联动」残留', p2bHub, '双页签联动');

// ===== 20.5 BAD_OPEN 状态机守卫（终审 Important-1）：四个重置点缺一即 FAIL =====
// openWork 切单 / 审核提交 / 切场景 / 清空重扫 都必须清 BAD_OPEN，否则 A 单展开态串到 B 单
eq('BAD_OPEN 声明 1 处 + 重置 4 处（切单/审核/切场景/清空）', (hubUiSrc.match(/BAD_OPEN = null/g) || []).length, 5);
ok('openWork 切单重置 BAD_OPEN', /VIEW\.doc = hd; RESULTS = \[\]; MODE = 'add'; BAD_OPEN = null/.test(hubUiSrc));

finish();
