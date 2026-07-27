/**
 * 山向奇门 core 单元测试（纯 Node，无框架）。
 * 运行：node core/shanxiang.test.js
 * 关键验证：坐山→局 与引擎三元定局对拍一致；全九宫层齐备；时家未受影响。
 */
'use strict';
var path = require('path');
var assert = require('assert');

// 载入引擎(挂到 global.window.QM)与被测模块
global.window = {};
require(path.join(__dirname, '..', 'engine.bundle.js'));
var QM = global.window.QM;
var SX = require('./shanxiang.js');

var pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '  ->  ' + e.message); }
}

console.log('== 二十四山度数解析 ==');
t('0° → 子', function () { assert.strictEqual(SX.degreeToMountain(0).name, '子'); });
t('90° → 卯(正东)', function () { assert.strictEqual(SX.degreeToMountain(90).name, '卯'); });
t('180° → 午(正南)', function () { assert.strictEqual(SX.degreeToMountain(180).name, '午'); });
t('270° → 酉(正西)', function () { assert.strictEqual(SX.degreeToMountain(270).name, '酉'); });
t('47° → 艮(45±7.5)', function () { assert.strictEqual(SX.degreeToMountain(47).name, '艮'); });
t('353° → 子(跨 360 回包)', function () { assert.strictEqual(SX.degreeToMountain(353).name, '子'); });
t('负度/超 360 归一化', function () { assert.strictEqual(SX.degreeToMountain(-10).name, SX.degreeToMountain(350).name); });

console.log('== 向首取冲(+180°) ==');
t('坐子 → 向午', function () { assert.strictEqual(SX.oppositeMountain('子'), '午'); });
t('坐艮 → 向坤', function () { assert.strictEqual(SX.oppositeMountain('艮'), '坤'); });
t('坐 90° → 向酉', function () { assert.strictEqual(SX.oppositeMountain(90), '酉'); });

console.log('== 三元(五度分段) ==');
t('子山心(0°) → 中元', function () { assert.strictEqual(SX.sittingToJu(0).yuan, '中元'); });
t('子山偏前(354°) → 上元', function () { assert.strictEqual(SX.sittingToJu(354).yuan, '上元'); });
t('子山偏后(6°) → 下元', function () { assert.strictEqual(SX.sittingToJu(6).yuan, '下元'); });
t('只给山名 → 默认中元', function () { assert.strictEqual(SX.sittingToJu('子').yuan, '中元'); });

console.log('== 坐山定局：与引擎三元定局对拍 ==');
// 已知例：子=冬至；冬至 上1/中7/下4（引擎采集值）
t('坐子山中元 = 阳邁7局', function () {
  var ju = SX.sittingToJu('子');
  assert.strictEqual(ju.jieqi, '冬至'); assert.strictEqual(ju.type, 'yang'); assert.strictEqual(ju.number, '7');
});
t('坐午山中元 = 阴邁3局(夏至中)', function () {
  var ju = SX.sittingToJu('午');
  assert.strictEqual(ju.jieqi, '夏至'); assert.strictEqual(ju.type, 'yin'); assert.strictEqual(ju.number, '3');
});
// 全量对拍：对每个山名(默认中元)，其(节气,中元)→局 必须与引擎在该节气中元某真实日期算出的局一致
t('24 山坐局全量与引擎一致', function () {
  // 采集引擎 节气+元 -> 局
  var eng = {};
  var start = Date.parse('2025-12-20T12:00:00');
  for (var i = 0; i < 380; i++) {
    var d = new Date(start + i * 86400000);
    var j = QM.qimen.calculateJuShu(d, '时家');
    var key = j.jieQiName + '|' + j.yuan;
    if (!eng[key]) eng[key] = j.type + j.number;
  }
  SX.MOUNTAINS.forEach(function (m) {
    var ju = SX.sittingToJu(m.name); // 默认中元
    var engv = eng[m.jieqi + '|中元'];
    assert.strictEqual(ju.type + ju.number, engv, '坐' + m.name + '山: core=' + ju.type + ju.number + ' engine=' + engv);
  });
});

console.log('== generateShanXiangChart 全九宫齐备 ==');
t('基本盘：坐子向午 + 固定日期', function () {
  var pan = SX.generateShanXiangChart({ sitting: '子', date: new Date('2026-07-14T15:30:00'), purpose: '风水' }, QM);
  assert.ok(!pan.error, 'no error');
  ['diPan', 'tianPan', 'baMen', 'jiuXing', 'baShen', 'anGan'].forEach(function (k) {
    assert.ok(pan[k] && Object.keys(pan[k]).length >= 8, '缺 ' + k);
  });
  assert.ok(pan.jiuGongAnalysis && Object.keys(pan.jiuGongAnalysis).length >= 9, '缺 jiuGongAnalysis');
  // 地盘须等于坐子山所定局(阳7)之地盘
  var ref = QM.qimen.diPanModule.getDiPan('yang', 7);
  assert.strictEqual(JSON.stringify(pan.diPan), JSON.stringify(ref), '地盘与阳 7 局一致');
  // 元数据
  assert.strictEqual(pan.shanXiang.sitting.name, '子');
  assert.strictEqual(pan.shanXiang.facing.name, '午');
  assert.strictEqual(pan.shanXiang.juBasis.number, '7');
});
t('不给日期 → 默认当下，仍出完整盘', function () {
  var pan = SX.generateShanXiangChart({ sitting: 45 }, QM); // 艮山, 度数
  assert.ok(!pan.error);
  assert.ok(pan.tianPan && pan.baMen && pan.baShen);
  assert.strictEqual(pan.shanXiang.activation.source, 'now');
});
t('year → 以立春激活', function () {
  var pan = SX.generateShanXiangChart({ sitting: '午', year: 2025 }, QM);
  assert.strictEqual(pan.shanXiang.activation.source, 'year-立春');
  assert.strictEqual(pan.shanXiang.activation.date.getFullYear(), 2025);
});
t('缺坐山 → 报错', function () {
  assert.throws(function () { SX.generateShanXiangChart({}, QM); }, /坐山/);
});
t('未知 method → 报错(不静默出错盘)', function () {
  assert.throws(function () { SX.generateShanXiangChart({ sitting: '子', method: 'liujia' }, QM); }, /method/);
});

console.log('== 时家向后兼容(回归) ==');
t('无覆盖的时家 calculate 仍正常', function () {
  var pan = QM.qimen.calculate(new Date('2026-07-14T15:30:00'), { type: '四柱', method: '时家', purpose: '求财' });
  assert.ok(!pan.error && pan.diPan && pan.tianPan);
  assert.ok(!pan.shanXiang, '时家盘不应有 shanXiang 字段');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
