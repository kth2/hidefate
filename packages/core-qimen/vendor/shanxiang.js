/**
 * 山向奇门 / 宅盘奇门 core —— 纯函数、无副作用、可移植。
 *
 * 设计：山向奇门与时家奇门只在「如何定局」上不同，排盘机器（地盘/天盘/九星/
 * 八门/八神/暗干）完全相同。故本模块只负责「以坐山定局」，再把算出的局交给
 * 现有引擎(window.QM.qimen.calculate 的 juShu 覆盖)去排出标准九宫。
 *
 * 定局法（本实现，可查证）：
 *   1) 二十四山按罗盘顺时针排列，子=正北=0°，每山 15°。
 *   2) 山↔节气 采用通行的「罗盘节气」对应：子=冬至(正北)、午=夏至(正南)、
 *      卯=春分(正东)、酉=秋分(正西)，其余顺布。由此坐山→节气。
 *   3) 节气 + 三元(上/中/下) → 局数，直接复用引擎的三元定局(下方 JU_TABLE
 *      即由引擎 calculateJuShu 全量采集而来，与二十四节气定局歌一致)，
 *      因此局数与时家同源、可对拍验证，非杜撰。
 *   4) 三元由坐山精确度数在本山 15° 内的 5° 分段决定；只给山名(不给度数)时
 *      默认取中元。阴阳遁随节气自动落定(冬至→芒种阳遁、夏至→大雪阴遁)。
 * 值符/值使/天盘/暗干 = 时间激活层：坐山定「局/地盘」这一固定宅基，另给一个
 * 日期(默认当下，或入住年立春)激活动态层——即所选的「空间定局 + 时间起符」混合盘。
 *
 * 说明：山向/宅盘奇门流派众多，起局法不一(如另有以 315°–134° 定阴阳遁者)。
 * 本实现取「坐山→节气→三元定局」这一可查证且与引擎自洽的方案作 standard 默认，
 * method 参数预留以便日后接入其它流派。详见 README「山向奇门」节。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShanXiang = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 二十四山：顺时针自正北(子=0°)起，每山 15°。含所属卦宫(供楼层平面叠加/衍象)。
  var MOUNTAINS = [
    { name: '子', center: 0,   gua: '坎', jieqi: '冬至' },
    { name: '癸', center: 15,  gua: '坎', jieqi: '小寒' },
    { name: '丑', center: 30,  gua: '艮', jieqi: '大寒' },
    { name: '艮', center: 45,  gua: '艮', jieqi: '立春' },
    { name: '寅', center: 60,  gua: '艮', jieqi: '雨水' },
    { name: '甲', center: 75,  gua: '震', jieqi: '惊蛰' },
    { name: '卯', center: 90,  gua: '震', jieqi: '春分' },
    { name: '乙', center: 105, gua: '震', jieqi: '清明' },
    { name: '辰', center: 120, gua: '巽', jieqi: '谷雨' },
    { name: '巽', center: 135, gua: '巽', jieqi: '立夏' },
    { name: '巳', center: 150, gua: '巽', jieqi: '小满' },
    { name: '丙', center: 165, gua: '离', jieqi: '芒种' },
    { name: '午', center: 180, gua: '离', jieqi: '夏至' },
    { name: '丁', center: 195, gua: '离', jieqi: '小暑' },
    { name: '未', center: 210, gua: '坤', jieqi: '大暑' },
    { name: '坤', center: 225, gua: '坤', jieqi: '立秋' },
    { name: '申', center: 240, gua: '坤', jieqi: '处暑' },
    { name: '庚', center: 255, gua: '兑', jieqi: '白露' },
    { name: '酉', center: 270, gua: '兑', jieqi: '秋分' },
    { name: '辛', center: 285, gua: '兑', jieqi: '寒露' },
    { name: '戌', center: 300, gua: '乾', jieqi: '霜降' },
    { name: '乾', center: 315, gua: '乾', jieqi: '立冬' },
    { name: '亥', center: 330, gua: '乾', jieqi: '小雪' },
    { name: '壬', center: 345, gua: '坎', jieqi: '大雪' }
  ];

  // 节气 + [上元,中元,下元] → 局。由引擎 calculateJuShu 全量采集(见 core/build-ju-table 注释)，
  // 与《二十四节气定局歌》完全一致。t: yang/yin, n: 1-9。
  var JU_TABLE = {
    '冬至': [['yang',1],['yang',7],['yang',4]], '小寒': [['yang',2],['yang',8],['yang',5]],
    '大寒': [['yang',3],['yang',9],['yang',6]], '立春': [['yang',8],['yang',5],['yang',2]],
    '雨水': [['yang',9],['yang',6],['yang',3]], '惊蛰': [['yang',1],['yang',7],['yang',4]],
    '春分': [['yang',3],['yang',9],['yang',6]], '清明': [['yang',4],['yang',1],['yang',7]],
    '谷雨': [['yang',5],['yang',2],['yang',8]], '立夏': [['yang',4],['yang',1],['yang',7]],
    '小满': [['yang',5],['yang',2],['yang',8]], '芒种': [['yang',6],['yang',3],['yang',9]],
    '夏至': [['yin',9],['yin',3],['yin',6]],    '小暑': [['yin',8],['yin',2],['yin',5]],
    '大暑': [['yin',7],['yin',1],['yin',4]],    '立秋': [['yin',2],['yin',5],['yin',8]],
    '处暑': [['yin',1],['yin',4],['yin',7]],    '白露': [['yin',9],['yin',3],['yin',6]],
    '秋分': [['yin',7],['yin',1],['yin',4]],    '寒露': [['yin',6],['yin',9],['yin',3]],
    '霜降': [['yin',5],['yin',8],['yin',2]],    '立冬': [['yin',6],['yin',9],['yin',3]],
    '小雪': [['yin',5],['yin',8],['yin',2]],    '大雪': [['yin',4],['yin',7],['yin',1]]
  };

  var YUAN_NAMES = ['上元', '中元', '下元'];

  function norm360(d) { return ((d % 360) + 360) % 360; }

  // 度数 → 山（就近归山；每山中心为 15 的倍数，四舍五入即所属山）
  function degreeToMountain(deg) {
    var idx = Math.round(norm360(deg) / 15) % 24;
    return MOUNTAINS[idx];
  }

  function mountainByName(name) {
    for (var i = 0; i < MOUNTAINS.length; i++) if (MOUNTAINS[i].name === name) return MOUNTAINS[i];
    return null;
  }

  // 本山 15° 内的 5° 分段 → 元序号(0上/1中/2下)：度数越大(顺时针)元越靠后，合时序递进。
  function yuanIndexFromDegree(deg, center) {
    var offset = ((norm360(deg) - center + 540) % 360) - 180; // 就近有符号偏移 ∈ [-7.5,7.5]
    if (offset < -2.5) return 0;   // 上元
    if (offset > 2.5) return 2;    // 下元
    return 1;                      // 中元
  }

  // 解析坐山/向首输入：山名字符串 或 0–360 度数。返回 {name, degree, gua, jieqi, yuanIndex, hasDegree}
  function resolveMountain(input) {
    if (typeof input === 'number' && isFinite(input)) {
      var m = degreeToMountain(input);
      return { name: m.name, degree: norm360(input), gua: m.gua, jieqi: m.jieqi,
        yuanIndex: yuanIndexFromDegree(input, m.center), hasDegree: true };
    }
    if (typeof input === 'string') {
      var s = input.trim();
      // 允许 "子" 或 "子 5" / "子(5)" 之类；纯数字字符串按度数处理
      if (/^\d+(\.\d+)?$/.test(s)) return resolveMountain(parseFloat(s));
      var mm = mountainByName(s.charAt(0));
      if (mm) return { name: mm.name, degree: mm.center, gua: mm.gua, jieqi: mm.jieqi,
        yuanIndex: 1, hasDegree: false }; // 只给山名 → 默认中元
    }
    throw new Error('无法识别的坐山/向首输入：' + input + '（请用二十四山名如「子」或 0–360 度数）');
  }

  // 对山（向首默认取坐山之冲，+180°）
  function oppositeMountain(input) {
    var r = resolveMountain(input);
    return degreeToMountain(r.degree + 180).name;
  }

  // 坐山 → 局（{type, number, jieqi, yuan, yuanIndex, mountain, fullName, formatCode}）
  function sittingToJu(input) {
    var r = resolveMountain(input);
    var row = JU_TABLE[r.jieqi];
    if (!row) throw new Error('节气无对应局：' + r.jieqi);
    var cell = row[r.yuanIndex];
    var type = cell[0], number = String(cell[1]);
    return {
      type: type, number: number,
      jieqi: r.jieqi, yuan: YUAN_NAMES[r.yuanIndex], yuanIndex: r.yuanIndex,
      mountain: r.name, degree: r.degree, gua: r.gua,
      fullName: (type === 'yin' ? '阴遁' : '阳遁') + number + '局（' + YUAN_NAMES[r.yuanIndex] + '·坐' + r.name + '山）',
      formatCode: type + '-' + number
    };
  }

  // 引擎 juShu 覆盖对象（喂给 QM.qimen.calculate 的 opts.juShu）
  function juShuOverride(ju) {
    return { type: ju.type, number: ju.number, yuan: ju.yuan,
      fullName: ju.fullName, formatCode: ju.formatCode };
  }

  /**
   * 生成山向/宅盘奇门九宫盘。
   * @param {Object} options
   *   sitting  {string|number} 坐山：二十四山名或 0–360 度（必填）
   *   facing   {string|number} 向首：同上（可选，默认取坐山之冲）
   *   date     {Date}          激活时间（可选，默认当下）——决定值符/值使/天盘/暗干
   *   year     {number}        入住/动土年（可选）：无 date 时以该年立春 12:00 作激活时间
   *   method   {string}        定局法，默认 'standard'（坐山→节气→三元定局）
   *   purpose  {string}        占测目的（透传引擎，影响用神标注）
   * @param {Object} [engine]  奇门引擎，默认 global QM（便于其它项目注入自有引擎）
   * @returns {Object} 标准 QimenChart，另含 .shanXiang 元数据
   */
  function generateShanXiangChart(options, engine) {
    options = options || {};
    var QM = engine || (typeof window !== 'undefined' && window.QM) || (typeof globalThis !== 'undefined' && globalThis.QM);
    if (!QM || !QM.qimen || !QM.qimen.calculate) throw new Error('缺少奇门引擎(QM.qimen.calculate)');
    if (options.sitting == null || options.sitting === '') throw new Error('坐山(sitting)为必填');
    if (options.method && options.method !== 'standard')
      throw new Error('暂仅实现 method="standard"（坐山→节气→三元定局）；其它流派留待接入');

    var ju = sittingToJu(options.sitting);
    var facingInput = (options.facing == null || options.facing === '') ? oppositeMountain(options.sitting) : options.facing;
    var facing = resolveMountain(facingInput);

    // 激活时间：优先 date；否则 year 的立春(2/4 12:00 近似)；再否则当下
    var date = options.date instanceof Date && !isNaN(options.date) ? options.date
      : (typeof options.year === 'number' ? new Date(options.year, 1, 4, 12, 0, 0) : new Date());

    var pan = QM.qimen.calculate(date, {
      type: '四柱', method: '时家', purpose: options.purpose || '综合',
      location: '默认位置', juShu: juShuOverride(ju)
    });
    if (pan && pan.error) return pan;

    pan.shanXiang = {
      sitting: { name: ju.mountain, degree: ju.degree, gua: ju.gua },
      facing: { name: facing.name, degree: facing.degree, gua: facing.gua },
      juBasis: { jieqi: ju.jieqi, yuan: ju.yuan, type: ju.type, number: ju.number },
      method: 'standard',
      activation: { date: date, source: options.date ? 'date' : (typeof options.year === 'number' ? 'year-立春' : 'now') },
      label: '山向/宅盘奇门 · 坐' + ju.mountain + '向' + facing.name + ' · ' + ju.fullName
    };
    return pan;
  }

  return {
    MOUNTAINS: MOUNTAINS,
    JU_TABLE: JU_TABLE,
    degreeToMountain: degreeToMountain,
    resolveMountain: resolveMountain,
    oppositeMountain: oppositeMountain,
    sittingToJu: sittingToJu,
    generateShanXiangChart: generateShanXiangChart
  };
});
