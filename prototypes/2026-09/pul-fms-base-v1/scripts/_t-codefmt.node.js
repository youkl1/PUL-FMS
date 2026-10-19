/**
 * _t-codefmt.node.js — 码解析三格式归一回归（2026-10-14 需求方图二）
 * 断言：阿里 20 位 / GS1（01 开头）/ IDCODE（MA. 开头）解析与归一转换；node scripts/_t-codefmt.node.js
 */
'use strict';
global.window = {};
require('./store.js');        // 2026-10-15 词表收敛：PUL_VOCAB 挂在 store.js，须最先加载
require('./purchase-data.js');
var P = window.PUL_PCH;
var dict = [
  { idcode: '8461935', drugCode: 'YP010245', drugName: '依姆多', level: 1, unit: '盒', packUnit: '盒' },
  { idcode: '8400431', drugCode: 'YP010201', drugName: '乳酸依沙吖啶溶液', level: 1, unit: '盒', packUnit: '盒' }
];
var fails = 0;
function eq(name, got, want) {
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log('✗ ' + name + '\n  got:  ' + JSON.stringify(got) + '\n  want: ' + JSON.stringify(want)); }
  else console.log('✓ ' + name);
}

// 图二 GS1 示例：01|06901234567890|11|241231|17|261231|10|260508|21|00001
var g = P.parseCode('01069012345678901124123117261231102605082100001', dict);
eq('GS1 codeType', g.codeType, 'GS1');
eq('GS1 归一标识码（GTIN→阿里）', g.idcode, '8461935');
eq('GS1 批次 AI(10)', g.batch, '260508');
eq('GS1 生产日期 AI(11)', g.prodDate, '2024-12-31');
eq('GS1 效期 AI(17)', g.expDate, '2026-12-31');
eq('GS1 序列号 AI(21)', g.serial, '00001');
eq('GS1 命中字典', !!g.dict, true);

// 图二 IDCODE 示例
var m = P.parseCode('MA.156.M0.123456.N123456C.M241231.E261231.L260508.S00001', dict);
eq('IDCODE codeType', m.codeType, 'IDCODE');
eq('IDCODE 归一标识码（.N→阿里）', m.idcode, '8400431');
eq('IDCODE 批次 .L', m.batch, '260508');
eq('IDCODE 生产日期 .M', m.prodDate, '2024-12-31');
eq('IDCODE 效期 .E', m.expDate, '2026-12-31');
eq('IDCODE 序列号 .S', m.serial, '00001');
eq('IDCODE 命中字典', !!m.dict, true);

// 阿里 20 位（现行口径不回归）
var a = P.parseCode('84619350001188237741', dict);
eq('阿里 codeType', a.codeType, '阿里');
eq('阿里 标识码', a.idcode, '8461935');
eq('阿里 序列', a.serial, '000118823');
eq('阿里 校验', a.check, '7741');
eq('阿里 命中字典', !!a.dict, true);

// 异常码兜底：未知标识码 / 未维护 GTIN → dict=null（进异常码台账）
eq('未知 20 位=解析失败', P.parseCode('89999990000005010001', dict).dict, null);
eq('未知 GS1 GTIN=解析失败', P.parseCode('01999999999999991124123117261231102605082100001', dict).dict, null);
eq('乱串=解析失败', P.parseCode('abc', dict).dict, null);

console.log(fails ? '\n' + fails + ' FAIL' : '\nALL PASS');
process.exit(fails ? 1 : 0);
