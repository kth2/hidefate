import { describe, expect, it } from 'vitest';
import {
  AUSPICIOUS_FEATURES,
  SHA_FEATURES,
  XING_SHI_META,
  assessCubicle,
  isCubicleType,
  scenarioOf,
  scenarioProfile,
  scoreXingShi,
  xingShiCures,
  type BuildingType,
  type PropertyProfile,
  type XingShiFeature,
  type XingShiItem,
} from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { predict } from './predict.js';
import {
  UNASSESSED_LANDFORM_WEIGHT,
  VETO_CAP,
  computeComposite,
} from './composite.js';
import { FAQ_BANK, faqByCategory, faqFor, faqHighlights } from './faq.js';
import { buildAnswerContext } from './answer.js';
import { SAMPLE_PROFILE, sampleInput } from './fixtures.js';

const prof = (extra: Partial<PropertyProfile> = {}): PropertyProfile => ({
  ...SAMPLE_PROFILE,
  ...extra,
});

const synth = (p: PropertyProfile) => synthesise({ ...sampleInput(2026), profile: p });

describe('峦头模型', () => {
  it('每项都有性质、权重、应象、古法依据与化解', () => {
    for (const f of Object.keys(XING_SHI_META) as XingShiFeature[]) {
      const m = XING_SHI_META[f];
      expect(['吉', '凶']).toContain(m.kind);
      expect(['全局', '方位']).toContain(m.scope);
      expect(Math.abs(m.weight)).toBeGreaterThan(0);
      expect(m.affects.length).toBeGreaterThan(1);
      expect(m.classical.length).toBeGreaterThan(8);
      expect(m.cures.length).toBeGreaterThan(0);
      expect(m.note.length).toBeGreaterThan(4);
    }
  });

  it('吉象权重为正、凶象为负', () => {
    for (const f of AUSPICIOUS_FEATURES) expect(XING_SHI_META[f].weight).toBeGreaterThan(0);
    for (const f of SHA_FEATURES) expect(XING_SHI_META[f].weight).toBeLessThan(0);
  });

  it('主要形煞权重符合规格区间', () => {
    expect(XING_SHI_META['大路直冲'].weight).toBeLessThanOrEqual(-0.35);
    expect(XING_SHI_META['大路直冲'].weight).toBeGreaterThanOrEqual(-0.5);
    expect(XING_SHI_META['天斩煞'].weight).toBeCloseTo(-0.3, 2);
    expect(XING_SHI_META['电塔变压器'].weight).toBeLessThanOrEqual(-0.25);
    expect(XING_SHI_META['电塔变压器'].weight).toBeGreaterThanOrEqual(-0.4);
    expect(XING_SHI_META['有水朝堂'].weight).toBeGreaterThanOrEqual(0.2);
    expect(XING_SHI_META['有水朝堂'].weight).toBeLessThanOrEqual(0.3);
    expect(XING_SHI_META['后方有靠'].weight).toBeGreaterThanOrEqual(0.15);
    expect(XING_SHI_META['后方有靠'].weight).toBeLessThanOrEqual(0.25);
  });

  it('峦头分归一化在 [-1,1]，且煞多则愈低', () => {
    const none = scoreXingShi([]);
    expect(none.score).toBe(0);
    expect(none.assessed).toBe(false);

    const one = scoreXingShi([{ feature: '大路直冲', palace: 9 }]);
    const many = scoreXingShi([
      { feature: '大路直冲', palace: 9 },
      { feature: '天斩煞', palace: 3 },
      { feature: '电塔变压器', palace: 6 },
      { feature: '后方空旷' },
    ]);
    expect(one.score).toBeLessThan(0);
    expect(many.score).toBeLessThan(one.score);
    expect(many.score).toBeGreaterThanOrEqual(-1);
  });

  it('吉象可抵消部分凶象，但不改变符号方向', () => {
    const bad = scoreXingShi([{ feature: '大路直冲', palace: 9 }]);
    const mixed = scoreXingShi([
      { feature: '大路直冲', palace: 9 },
      { feature: '后方有靠' },
      { feature: '明堂开阔' },
    ]);
    expect(mixed.score).toBeGreaterThan(bad.score);
  });

  it('强度可调，0 强度不计入', () => {
    const full = scoreXingShi([{ feature: '大路直冲', palace: 9, intensity: 1 }]);
    const half = scoreXingShi([{ feature: '大路直冲', palace: 9, intensity: 0.5 }]);
    const zero = scoreXingShi([{ feature: '大路直冲', palace: 9, intensity: 0 }]);
    expect(half.score).toBeGreaterThan(full.score);
    expect(zero.contributions).toHaveLength(0);
  });

  it('负向修正单独累计，供否决机制判据', () => {
    const s = scoreXingShi([
      { feature: '大路直冲', palace: 9 }, // -0.45
      { feature: '后方有靠' }, // +0.2
    ]);
    expect(s.negativeCorrection).toBeCloseTo(-0.45, 2);
    expect(s.positive).toBeCloseTo(0.2, 2);
  });

  it('化解清单按严重度排序并带古法依据', () => {
    const s = scoreXingShi([
      { feature: '枯树烂木', palace: 9 },
      { feature: '大路直冲', palace: 1 },
    ]);
    const cures = xingShiCures(s);
    expect(cures[0]!.feature).toBe('大路直冲');
    expect(cures[0]!.severity).toBe('严重');
    expect(cures[0]!.classical.length).toBeGreaterThan(8);
    expect(cures[0]!.cures.length).toBeGreaterThan(0);
  });
});

describe('居家 / 商业 场景分流', () => {
  it('住宅归居家，商业公共工业归商业', () => {
    expect(scenarioOf('公寓')).toBe('居家');
    expect(scenarioOf('独立屋')).toBe('居家');
    expect(scenarioOf('店铺零售')).toBe('商业');
    expect(scenarioOf('办公室')).toBe('商业');
    expect(scenarioOf('工厂车间')).toBe('商业');
    expect(scenarioOf('学校课室')).toBe('商业');
  });

  it('房间优先序按场景不同', () => {
    expect(scenarioProfile('公寓').roomOrder).toEqual(['大门', '主卧', '厨房', '儿童房', '客厅']);
    expect(scenarioProfile('店铺零售').roomOrder).toEqual(['大门', '收银台', '老板位', '办公位', '前台接待']);
  });

  it('峦头 / 理气权重按场景：居家 0.45/0.55，商业 0.35/0.65', () => {
    expect(scenarioProfile('公寓').landformWeight).toBeCloseTo(0.45, 3);
    expect(scenarioProfile('公寓').qiWeight).toBeCloseTo(0.55, 3);
    expect(scenarioProfile('店铺零售').landformWeight).toBeCloseTo(0.35, 3);
    expect(scenarioProfile('店铺零售').qiWeight).toBeCloseTo(0.65, 3);
  });

  it('居家重山星、商业重向星', () => {
    expect(scenarioProfile('公寓').shanEmphasis).toBeGreaterThan(scenarioProfile('公寓').xiangEmphasis);
    expect(scenarioProfile('店铺零售').xiangEmphasis).toBeGreaterThan(scenarioProfile('店铺零售').shanEmphasis);
  });

  it('商业场景下收银台排序优先于主卧', () => {
    const rooms = [
      { id: 'a', kind: '主卧' as const, primaryPalace: 2 as const, palaces: [2 as const], occupants: [] },
      { id: 'b', kind: '收银台' as const, primaryPalace: 3 as const, palaces: [3 as const], occupants: [] },
    ];
    const shop = prof({ buildingType: '店铺零售', rooms, missingCorners: [] });
    const i = { ...sampleInput(2026), profile: shop };
    const preds = predict(i, synth(shop));
    const kinds = preds.map((p) => p.roomKind).filter((k) => k === '主卧' || k === '收银台');
    if (kinds.includes('收银台') && kinds.includes('主卧')) {
      expect(kinds.indexOf('收银台')).toBeLessThan(kinds.indexOf('主卧'));
    }
  });
});

describe('隔间（Cubicle）', () => {
  it('识别隔间类别', () => {
    expect(isCubicleType('格子间工位')).toBe(true);
    expect(isCubicleType('共享办公')).toBe(true);
    expect(isCubicleType('公寓')).toBe(false);
  });

  it('背后无靠列为严重且排最前', () => {
    const issues = assessCubicle({ palace: 3, hasBacking: false });
    expect(issues[0]!.item).toBe('背后有靠');
    expect(issues[0]!.severity).toBe('严重');
    expect(issues[0]!.action).toContain('靠');
  });

  it('背后有靠则判良好', () => {
    const issues = assessCubicle({ palace: 3, hasBacking: true });
    const backing = issues.find((i) => i.item === '背后有靠')!;
    expect(backing.severity).toBe('良好');
  });

  it('逐项检出对门、梁压、风吹、龙虎失衡', () => {
    const issues = assessCubicle({
      palace: 3,
      hasBacking: true,
      facingDoorOrAisle: true,
      beamOverhead: true,
      airDraft: true,
      rightOverbearing: true,
    });
    const items = issues.map((i) => i.item);
    expect(items).toContain('正对门口或主通道');
    expect(items).toContain('横梁压顶');
    expect(items).toContain('风口直吹');
    expect(items).toContain('青龙白虎失衡');
    for (const i of issues) {
      expect(i.classical.length).toBeGreaterThan(6);
      expect(i.action.length).toBeGreaterThan(6);
    }
  });

  it('命卦不合时给「坐凶向吉」的退路，而非叫人换工位', () => {
    const issues = assessCubicle({ palace: 2, hasBacking: true }, '乾', [6, 7, 8, 2]);
    const seat = issues.find((i) => i.item === '座位所在宫与命卦')!;
    expect(seat.severity).toBe('良好'); // 2 在四吉内
    const bad = assessCubicle({ palace: 3, hasBacking: true }, '乾', [6, 7, 8, 2]);
    const seatBad = bad.find((i) => i.item === '座位所在宫与命卦')!;
    expect(seatBad.action).toContain('坐凶向吉');
  });
});

describe('峦头 × 理气 综合加权', () => {
  it('未填峦头时权重降至 15% 并如实说明', () => {
    const s = synth(prof());
    const c = computeComposite(s, []);
    expect(c.weights.landform).toBeCloseTo(UNASSESSED_LANDFORM_WEIGHT, 3);
    expect(c.weights.qi).toBeCloseTo(1 - UNASSESSED_LANDFORM_WEIGHT, 3);
    expect(c.landform.assessed).toBe(false);
    expect(c.confidenceReasons.join('')).toContain('未填外部环境');
  });

  it('填了峦头则用场景权重', () => {
    const s = synth(prof({ buildingType: '公寓' }));
    const c = computeComposite(s, [{ feature: '后方有靠' }]);
    expect(c.weights.landform).toBeCloseTo(0.45, 3);
    expect(c.scenario).toBe('居家');
  });

  it('理气三派权重 0.5/0.3/0.2；关闭奇门则归一化为 0.625/0.375', () => {
    const s = synth(prof());
    const c = computeComposite(s, []);
    expect(c.qi.qiMen).toBeNull();
    expect(c.qi.weights.qiMen).toBe(0);
    expect(c.qi.weights.feiXing).toBeCloseTo(0.625, 3);
    expect(c.qi.weights.baZhai).toBeCloseTo(0.375, 3);
    expect(c.qi.weights.feiXing + c.qi.weights.baZhai).toBeCloseTo(1, 6);
  });

  it('综合分恒在 [-1,1]，且拆解可复算', () => {
    const s = synth(prof());
    const c = computeComposite(s, [{ feature: '大路直冲', palace: 9 }, { feature: '后方有靠' }]);
    expect(c.score).toBeGreaterThanOrEqual(-1);
    expect(c.score).toBeLessThanOrEqual(1);
    const sum = c.breakdown.reduce((a, b) => a + b.contribution, 0);
    expect(sum).toBeCloseTo(c.score, 5);
    for (const b of c.breakdown) {
      expect(b.note.length).toBeGreaterThan(4);
      expect(b.contribution).toBeCloseTo(b.value * b.weight, 6);
    }
  });

  it('理气分须能真正拉到高位 —— 否则否决门槛 0.7 永远够不着（回归）', () => {
    // 八运乾山巽向为旺山旺向；大门开在向首巽宫（当元旺向星）
    // 八运坐未向丑：旺山旺向，且向首艮宫同时是坤宅之生气方并得当旺向星 ——
    // 飞星与八宅俱佳，这才叫「理气极好」。大门安生气、主卧安天医。
    const excellent = prof({
      sitting: '未',
      moveInYear: 2010,
      missingCorners: [],
      rooms: [
        { id: 'd', kind: '大门', primaryPalace: 8, palaces: [8], occupants: [] },
        { id: 'm', kind: '主卧', primaryPalace: 7, palaces: [7], occupants: [] },
      ],
    });
    const s = synth(excellent);
    expect(s.flyingStar.pattern).toBe('旺山旺向');
    const c = computeComposite(s, [{ feature: '后方有靠' }]);
    // 飞星 0.6+ 已属高位：格局满分，大门得旺向星，惟主卧未落旺星故未至满分 —— 这是如实评分。
    expect(c.qi.feiXing, '旺山旺向且旺星到门，飞星分应显著为高').toBeGreaterThan(0.6);
    expect(c.qi.baZhai, '大门安生气、主卧安天医，八宅分应显著为高').toBeGreaterThan(0.6);
    expect(c.qi.score, '理气分应能过否决门槛 0.7').toBeGreaterThan(0.7);
  });

  it('八宅分随要位所落吉凶而变，不是常数（回归）', () => {
    // 同一坤宅，大门安生气 vs 安绝命，八宅分必须明显不同
    const base = { sitting: '未', moveInYear: 2010, missingCorners: [] };
    const good = synth(prof({ ...base, rooms: [{ id: 'd', kind: '大门', primaryPalace: 8, palaces: [8], occupants: [] }] }));
    const bad = synth(prof({ ...base, rooms: [{ id: 'd', kind: '大门', primaryPalace: 1, palaces: [1], occupants: [] }] }));
    const cg = computeComposite(good, []);
    const cb = computeComposite(bad, []);
    expect(cg.qi.baZhai).toBeGreaterThan(0.6); // 生气
    expect(cb.qi.baZhai).toBeLessThan(-0.6); // 坤宅坎为绝命
    expect(cg.qi.baZhai - cb.qi.baZhai).toBeGreaterThan(1);
  });

  it('未标要位时八宅分为中性 0，不臆测', () => {
    const s = synth(prof({ sitting: '未', moveInYear: 2010, missingCorners: [], rooms: [] }));
    expect(computeComposite(s, []).qi.baZhai).toBe(0);
  });

  it('上山下水的理气分应显著为负', () => {
    const bad = prof({ sitting: '子', moveInYear: 2010, missingCorners: [], rooms: [] });
    const s = synth(bad);
    const c = computeComposite(s, []);
    if (s.flyingStar.pattern === '上山下水') {
      expect(c.qi.feiXing).toBeLessThan(-0.3);
    }
  });

  it('否决机制：理气好而峦头大凶时，综合分强制压至 0.1 以下', () => {
    // 八运坐未向丑：旺山旺向，且向首艮宫同时是坤宅之生气方并得当旺向星 ——
    // 飞星与八宅俱佳，这才叫「理气极好」。大门安生气、主卧安天医。
    const excellent = prof({
      sitting: '未',
      moveInYear: 2010,
      missingCorners: [],
      rooms: [
        { id: 'd', kind: '大门', primaryPalace: 8, palaces: [8], occupants: [] },
        { id: 'm', kind: '主卧', primaryPalace: 7, palaces: [7], occupants: [] },
      ],
    });
    const s = synth(excellent);
    const heavySha: XingShiItem[] = [
      { feature: '大路直冲', palace: 8 },
      { feature: '天斩煞', palace: 3 },
    ];
    const c = computeComposite(s, heavySha);

    expect(c.qi.score, '此局理气应过 0.7').toBeGreaterThan(0.7);
    expect(c.landform.negativeCorrection, '峦头负修正应低于 -0.4').toBeLessThan(-0.4);
    expect(c.veto.triggered, '两条件俱足，否决须触发').toBe(true);
    expect(c.score).toBeLessThanOrEqual(VETO_CAP);
    expect(c.veto.reason).toContain('峦头有缺');
    expect(c.veto.reason).toContain('优先化解形煞');
  });

  it('同一好局，峦头无碍时不触发否决且综合分为正', () => {
    const excellent = prof({
      sitting: '乾',
      moveInYear: 2010,
      missingCorners: [],
      rooms: [{ id: 'd', kind: '大门', primaryPalace: 4, palaces: [4], occupants: [] }],
    });
    const s = synth(excellent);
    const c = computeComposite(s, [{ feature: '后方有靠' }, { feature: '明堂开阔' }]);
    expect(c.veto.triggered).toBe(false);
    expect(c.score).toBeGreaterThan(0.2);
  });

  it('否决只在两个条件同时成立时触发', () => {
    const s = synth(prof());
    // 峦头虽差，理气未过门槛 → 不触发
    const c1 = computeComposite(s, [{ feature: '大路直冲', palace: 9 }, { feature: '天斩煞', palace: 1 }]);
    if (c1.qi.score <= 0.7) expect(c1.veto.triggered).toBe(false);
    // 峦头无碍 → 不触发
    const c2 = computeComposite(s, [{ feature: '后方有靠' }, { feature: '明堂开阔' }]);
    expect(c2.veto.triggered).toBe(false);
  });

  it('摘要含场景、双分与权重', () => {
    const s = synth(prof());
    const c = computeComposite(s, [{ feature: '后方有靠' }]);
    expect(c.summary).toContain('居家');
    expect(c.summary).toContain('峦头');
    expect(c.summary).toContain('理气');
    expect(c.summary).toContain('综合');
  });
});

describe('常见问题分流', () => {
  it('居家与商业各有专属问题，通用问题两边都出', () => {
    const home = faqFor('居家');
    const biz = faqFor('商业');
    expect(home.some((f) => f.id.startsWith('h-'))).toBe(true);
    expect(home.some((f) => f.id.startsWith('b-'))).toBe(false);
    expect(biz.some((f) => f.id.startsWith('b-'))).toBe(true);
    expect(biz.some((f) => f.id.startsWith('h-'))).toBe(false);
    const u = FAQ_BANK.filter((f) => f.scenario === '通用');
    for (const f of u) {
      expect(home).toContain(f);
      expect(biz).toContain(f);
    }
  });

  it('覆盖规格所列全部类别', () => {
    const homeCats = faqByCategory('居家').map((g) => g.category);
    for (const c of ['财富', '格局形煞', '情感家庭', '学业', '健康人丁', '择日仪式', '神位摆设'] as const) {
      expect(homeCats, `居家缺类别 ${c}`).toContain(c);
    }
    const bizCats = faqByCategory('商业').map((g) => g.category);
    for (const c of ['财富', '格局形煞', '人际', '事业', '健康人丁', '择日仪式', '神位摆设'] as const) {
      expect(bizCats, `商业缺类别 ${c}`).toContain(c);
    }
  });

  it('每条问题都指明「该看盘上何处」', () => {
    for (const f of FAQ_BANK) {
      expect(f.lookAt.length, `${f.id} 未指明查看处`).toBeGreaterThan(0);
      expect(f.question.length).toBeGreaterThan(6);
      expect(f.domains.length).toBeGreaterThan(0);
    }
  });

  it('快捷入口按场景不同', () => {
    const h = faqHighlights('居家').map((f) => f.id);
    const b = faqHighlights('商业').map((f) => f.id);
    expect(h).not.toEqual(b);
    expect(h.length).toBeGreaterThan(2);
  });
});

describe('AI 上下文纳入峦头与场景', () => {
  it('含峦头拆解、场景与体用之序的硬规则', () => {
    const s = synth(prof());
    const c = computeComposite(s, [{ feature: '大路直冲', palace: 9 }]);
    const { system, facts } = buildAnswerContext(s, { composite: c });
    expect(facts).toContain('# 峦头（形势）与综合评分');
    expect(facts).toContain('大路直冲');
    expect(system).toContain('峦头为体，理气为用');
    expect(system).toContain('先讲化解形煞');
    expect(system).toContain('移形易位');
  });

  it('未填峦头时上下文要求 AI 主动提醒', () => {
    const s = synth(prof());
    const c = computeComposite(s, []);
    const { facts } = buildAnswerContext(s, { composite: c });
    expect(facts).toContain('用户未填外部环境');
    expect(facts).toContain('只有理气一半');
  });

  it('场景写入 system，商业不得套用居家话术', () => {
    const shop = prof({ buildingType: '店铺零售' });
    const s = synth(shop);
    const { system } = buildAnswerContext(s, {});
    expect(system).toContain('商业');
    expect(system).toContain('收银台');
  });

  it('点选常见问题时，把「该看何处」一并交给 AI', () => {
    const s = synth(prof());
    const { facts } = buildAnswerContext(s, {
      faq: { question: '财位在哪？', lookAt: ['向星当旺之方', '吉方清单'] },
    });
    expect(facts).toContain('# 本次提问');
    expect(facts).toContain('向星当旺之方');
  });
});
