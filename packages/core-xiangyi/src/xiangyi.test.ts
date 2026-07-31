import { describe, expect, it } from 'vitest';
import { STAR_META } from '@hidefate/core-fengshui';
import {
  MING_LAYER_DICTIONARY,
  MATURITY_THRESHOLDS,
  PRIOR_STRENGTH,
  analyseResonance,
  buildBaseDictionary,
  buildBaZhaiXiangYi,
  buildFengShuiDictionary,
  buildFlyingStarXiangYi,
  buildQiMenDictionary,
  computePosterior,
  conditionsMet,
  countEvidence,
  explainRejection,
  isRuledOut,
  learnedShift,
  maturityOf,
  posteriorWeight,
  type XiangEvidence,
  type XiangYi,
  type YongShenRuleLike,
} from './index.js';

const ALL = buildBaseDictionary();

describe('字典完整性', () => {
  it('id 全局唯一 —— id 是账本与后验的锚，撞号等于两条象意的证据混在一起', () => {
    const ids = ALL.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('先验一律落在 0–1', () => {
    for (const x of ALL) {
      expect(x.prior).toBeGreaterThan(0);
      expect(x.prior).toBeLessThanOrEqual(1);
    }
  });

  it('每条都有可判定的断语、古法出处与可干预性', () => {
    for (const x of ALL) {
      expect(x.statement.trim().length).toBeGreaterThan(4);
      expect(x.classic.trim().length).toBeGreaterThan(0);
      expect(['空间可调', '择时可避', '行为可调', '不可调']).toContain(x.interventionability);
    }
  });

  /**
   * 回归锁：同一句断语不得挂在两个不同领域下。
   *
   * 早先 fromFengShui 按 riskDomains 逐维度出条却共用同一句 whenDeclining，
   * 于是二黑的「感情」条目写着「久病缠身、寡妇当家、腹疾」—— 域名与文字对不上，
   * 用户无从判定，评出来的证据还会污染那条象意的后验。
   * 这条断言是通用的，任何来源再犯同类错都会被挡下。
   */
  it('同一句断语不得跨领域复用 —— 域名与文字必须对得上', () => {
    const byStatement = new Map<string, Set<string>>();
    for (const x of ALL) {
      const set = byStatement.get(x.statement) ?? new Set<string>();
      set.add(x.domain);
      byStatement.set(x.statement, set);
    }
    const offenders = [...byStatement.entries()]
      .filter(([, domains]) => domains.size > 1)
      .map(([s, d]) => `「${s.slice(0, 24)}…」同时挂在 ${[...d].join('、')}`);
    expect(offenders).toEqual([]);
  });

  it('凡涉健康、官非、意外者一律至少两层共振', () => {
    for (const x of ALL) {
      if (x.domain === '健康' || x.domain === '官非' || x.domain === '意外') {
        expect(x.minResonance).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('命层：七杀的五条候选', () => {
  const qisha = MING_LAYER_DICTIONARY.filter((x) => x.source.token === '七杀');

  it('一个象拆成五条候选，而不是合并成一句万金油', () => {
    expect(qisha).toHaveLength(5);
    expect(qisha.map((x) => x.id).sort()).toEqual(
      [
        'bazi.qisha.career.compete',
        'bazi.qisha.health.surgery',
        'bazi.qisha.legal.lawsuit',
        'bazi.qisha.mind.decisive',
        'bazi.qisha.person.martial',
      ].sort(),
    );
  });

  it('五条覆盖四个领域三个显化面', () => {
    expect(new Set(qisha.map((x) => x.domain))).toEqual(new Set(['事业', '官非', '健康', '心性']));
    expect(new Set(qisha.map((x) => x.facet))).toEqual(new Set(['事', '体', '人']));
  });

  it('开刀与官非门槛为 2，性格与职业倾向门槛为 1', () => {
    const by = (id: string) => qisha.find((x) => x.id === id)!;
    expect(by('bazi.qisha.health.surgery').minResonance).toBe(2);
    expect(by('bazi.qisha.legal.lawsuit').minResonance).toBe(2);
    expect(by('bazi.qisha.mind.decisive').minResonance).toBe(1);
    expect(by('bazi.qisha.person.martial').minResonance).toBe(1);
  });
});

describe('风水层由 core-fengshui 推导，不手写', () => {
  it('九星每颗都出一条身体象，内容取自该星的脏腑与病候', () => {
    const stars = buildFlyingStarXiangYi();
    for (const p of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
      const health = stars.find((x) => x.id === `fengshui.star${p}.health.organ`);
      expect(health).toBeDefined();
      expect(health!.statement).toContain(STAR_META[p].organs[0]!);
      expect(health!.minResonance).toBe(2);
    }
  });

  it('改上游知识库，象意自动跟上（断语取自 STAR_META 而非另抄一份）', () => {
    const erhei = buildFlyingStarXiangYi().find((x) => x.id === 'fengshui.star2.health.organ')!;
    expect(erhei.statement).toContain(STAR_META[2].ailments[0]!);
    expect(erhei.source.token).toBe(STAR_META[2].name);
  });

  it('游年八星各出一条，先验由吉凶强度换算', () => {
    const yn = buildBaZhaiXiangYi();
    expect(yn).toHaveLength(8);
    const juemin = yn.find((x) => x.source.token === '绝命')!;
    const fuwei = yn.find((x) => x.source.token === '伏位')!;
    expect(juemin.prior).toBeCloseTo(0.6, 5); // |power| = 3
    expect(fuwei.prior).toBeCloseTo(0.4, 5); // |power| = 1
    expect(juemin.valence).toBe('凶');
    expect(fuwei.valence).toBe('吉');
  });

  it('风水层一律标为空间可调 —— 这正是风水层存在的意义', () => {
    for (const x of buildFengShuiDictionary()) {
      expect(x.interventionability).toBe('空间可调');
    }
  });
});

describe('运层由奇门占类转出', () => {
  const RULES: YongShenRuleLike[] = [
    { category: '疾病', keywords: ['病'], yongshen: [{ kind: 'xing', name: '天芮' }, { kind: 'men', name: '生门' }], note: '芮内盘看奇仪、外盘看卦宫；生门为生、死门为死。' },
    { category: '求财', keywords: ['财'], yongshen: [{ kind: 'men', name: '生门' }], note: '生门宫生扶年命则得财。' },
    { category: '天气', keywords: ['雨'], yongshen: [{ kind: 'xing', name: '天蓬' }], note: '雨看天蓬。' },
    { category: '射覆', keywords: ['猜'], yongshen: [{ kind: 'sanyi', name: '天乙' }], note: '以八卦类象推具体数物。' },
    { category: '前所未见的占类', keywords: [], yongshen: [], note: '未登记。' },
  ];
  const { entries, skipped } = buildQiMenDictionary(RULES);

  it('断法纲要原样成为象意断语，不二次改写', () => {
    const disease = entries.find((x) => x.id === 'qimen.疾病.health')!;
    expect(disease.statement).toBe(RULES[0]!.note);
    expect(disease.domain).toBe('健康');
    expect(disease.facet).toBe('体');
  });

  it('用神成为触发条件 —— 定位不到用神则该象不成立', () => {
    const disease = entries.find((x) => x.id === 'qimen.疾病.health')!;
    expect(conditionsMet(disease.requires, new Set(['天芮']))).toBe(true);
    expect(conditionsMet(disease.requires, new Set(['开门']))).toBe(false);
  });

  it('天气与射覆明列在 skipped 而非静默丢弃，且各有理由', () => {
    const cats = skipped.map((s) => s.category);
    expect(cats).toContain('天气');
    expect(cats).toContain('射覆');
    expect(skipped.find((s) => s.category === '天气')!.reason).toContain('外部客观事件');
    expect(skipped.find((s) => s.category === '射覆')!.reason).toContain('术者功力');
  });

  it('未登记的占类也进 skipped，提示先决定它属哪个领域', () => {
    const unknown = skipped.find((s) => s.category === '前所未见的占类')!;
    expect(unknown.reason).toContain('未在占类映射表中登记');
  });

  it('占类本身不预设吉凶 —— 吉凶由起局时的生克定', () => {
    for (const e of entries) expect(e.valence).toBe('中');
  });

  /**
   * `CATEGORY_MAP` 是照着 core-qimen 的 `YONG_SHEN_RULES` 手抄的，
   * 抄错一个字该占类就会静默落进 skipped。这里把上游真实的 23 个占类名做成夹具，
   * 断言恰好 21 个转出、2 个有意跳过 —— 上游增删占类时这条会失败并逼人来处理。
   * （已对上游 vendor 引擎实跑核对过：23 → 21 转出 + 2 跳过，无重复 id。）
   */
  it('上游 23 个占类恰好 21 个转出、2 个有意跳过', () => {
    const UPSTREAM_CATEGORIES = [
      '求财', '功名', '词讼', '寻物', '追捕', '讨债', '婚姻', '逃亡',
      '避难', '文书音讯', '疾病', '口舌斗殴', '家宅', '盗贼', '出行',
      '行人', '天气', '怀孕', '官司', '风水', '寻人', '竞赛', '射覆',
    ];
    expect(UPSTREAM_CATEGORIES).toHaveLength(23);
    const fake: YongShenRuleLike[] = UPSTREAM_CATEGORIES.map((category) => ({
      category,
      keywords: [],
      yongshen: [],
      note: `${category}的断法纲要占位`,
    }));
    const r = buildQiMenDictionary(fake);
    expect(r.entries).toHaveLength(21);
    expect(r.skipped.map((s) => s.category).sort()).toEqual(['天气', '射覆'].sort());
    const ids = r.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('后验：向古法先验收缩', () => {
  const entry = { prior: 0.4 } as XiangYi;

  it('无证据时权重恒等于先验', () => {
    expect(posteriorWeight(0.4, { hits: 0, partial: 0, misses: 0 })).toBeCloseTo(0.4, 10);
  });

  it('第一条证据只能推动一点点 —— 三条证据不该推翻千年积累', () => {
    const w = posteriorWeight(0.4, { hits: 1, partial: 0, misses: 0 });
    expect(w).toBeGreaterThan(0.4);
    expect(w - 0.4).toBeLessThan(0.1);
  });

  it('证据数等于伪计数时，权重恰在先验与实测的中点', () => {
    const w = posteriorWeight(0.4, { hits: PRIOR_STRENGTH, partial: 0, misses: 0 });
    expect(w).toBeCloseTo((0.4 + 1) / 2, 10);
  });

  it('明确的「平安无事」会稀释权重', () => {
    const up = posteriorWeight(0.4, { hits: 2, partial: 0, misses: 0 });
    const down = posteriorWeight(0.4, { hits: 2, partial: 0, misses: 5 });
    expect(down).toBeLessThan(up);
  });

  it('部分应验按半次计', () => {
    const a = posteriorWeight(0.4, { hits: 0, partial: 2, misses: 0 });
    const b = posteriorWeight(0.4, { hits: 1, partial: 0, misses: 1 });
    expect(a).toBeCloseTo(b, 10);
  });

  it('负计数抛错', () => {
    expect(() => posteriorWeight(0.4, { hits: -1, partial: 0, misses: 0 })).toThrow();
  });

  it('「反向」与「未发生」同样计入 misses', () => {
    const ev: XiangEvidence[] = [
      { recordId: 'a', verdict: '中', recordedAt: '2026-01-01T00:00:00.000Z' },
      { recordId: 'b', verdict: '未发生', recordedAt: '2026-01-01T00:00:00.000Z' },
      { recordId: 'c', verdict: '反向', recordedAt: '2026-01-01T00:00:00.000Z' },
      { recordId: 'd', verdict: '部分中', recordedAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(countEvidence(ev)).toEqual({ hits: 1, partial: 1, misses: 2 });
  });

  it('成熟度门槛：未起步 / 初步 / 可参考', () => {
    expect(maturityOf({ hits: 0, partial: 0, misses: 0 })).toBe('未起步');
    expect(maturityOf({ hits: MATURITY_THRESHOLDS.初步, partial: 0, misses: 0 })).toBe('初步');
    expect(maturityOf({ hits: MATURITY_THRESHOLDS.可参考, partial: 0, misses: 0 })).toBe('可参考');
  });

  it('未起步时不许声称学到了东西', () => {
    const p = computePosterior(
      { ...entry, id: 'x' } as XiangYi,
      'p1',
      [{ recordId: 'a', verdict: '中', recordedAt: '2026-01-01T00:00:00.000Z' }],
      '2026-01-02T00:00:00.000Z',
    );
    expect(p.maturity).toBe('未起步');
    expect(learnedShift({ ...entry, id: 'x' } as XiangYi, p)).toBe(0);
  });

  it('排除门槛设得高：须成熟度可参考且权重跌破先验一半', () => {
    const x = { ...entry, id: 'x' } as XiangYi;
    const few = computePosterior(x, 'p1', misses(5), '2026-01-02T00:00:00.000Z');
    expect(isRuledOut(x, few)).toBe(false); // 初步，样本不足不排除
    const many = computePosterior(x, 'p1', misses(30), '2026-01-02T00:00:00.000Z');
    expect(many.maturity).toBe('可参考');
    expect(isRuledOut(x, many)).toBe(true);
  });

  function misses(n: number): XiangEvidence[] {
    return Array.from({ length: n }, (_, i) => ({
      recordId: `m${i}`,
      verdict: '未发生' as const,
      recordedAt: '2026-01-01T00:00:00.000Z',
    }));
  }
});

describe('三层共振（ROADMAP §4.4 的例子）', () => {
  const QIMEN = buildQiMenDictionary([
    {
      category: '疾病',
      keywords: ['病'],
      yongshen: [{ kind: 'xing', name: '天芮' }],
      note: '芮内盘看奇仪、外盘看卦宫。',
    },
  ]).entries;
  const DICT = [...ALL, ...QIMEN];

  it('命 + 运 + 风水三层同指健康 → 三层共振，开刀之象够格出报', () => {
    const r = analyseResonance(DICT, ['七杀', '二黑', '疾病', '天芮']);
    const health = r.find((x) => x.domain === '健康')!;
    expect(health.resonance).toBe(3);
    expect(new Set(health.layers)).toEqual(new Set(['命', '运', '风水']));
    expect(health.admitted.map((e) => e.id)).toContain('bazi.qisha.health.surgery');
    expect(health.rejected).toHaveLength(0);
  });

  it('只有命层一颗七杀时，开刀之象被门槛挡下', () => {
    const r = analyseResonance(DICT, ['七杀']);
    const health = r.find((x) => x.domain === '健康')!;
    expect(health.resonance).toBe(1);
    expect(health.admitted).toHaveLength(0);
    expect(health.rejected.map((e) => e.id)).toContain('bazi.qisha.health.surgery');
  });

  it('被挡下的条目答得出「为什么没提醒我」', () => {
    const r = analyseResonance(DICT, ['七杀']);
    const why = explainRejection(r, 'bazi.qisha.health.surgery');
    expect(why).toContain('2 层共振');
    expect(why).toContain('健康');
    expect(explainRejection(r, 'bazi.qisha.mind.decisive')).toBeNull();
  });

  it('触发条件未满足者根本不激活 —— 七杀无制才断官非', () => {
    const withoutCondition = analyseResonance(DICT, ['七杀', '二黑', '疾病', '天芮']);
    expect(withoutCondition.find((x) => x.domain === '官非')).toBeUndefined();
    const withCondition = analyseResonance(DICT, ['七杀', '七杀无制', '二黑']);
    expect(withCondition.find((x) => x.domain === '官非')).toBeDefined();
  });

  it('输出按共振层数排序且稳定，保证可重放', () => {
    const a = analyseResonance(DICT, ['七杀', '二黑', '疾病', '天芮']);
    const b = analyseResonance(DICT, ['天芮', '疾病', '二黑', '七杀']);
    expect(a.map((x) => x.domain)).toEqual(b.map((x) => x.domain));
    for (let i = 1; i < a.length; i++) {
      expect(a[i - 1]!.resonance).toBeGreaterThanOrEqual(a[i]!.resonance);
    }
  });
});
