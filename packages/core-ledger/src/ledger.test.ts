import { describe, expect, it } from 'vitest';
import {
  MIN_SAMPLES_FOR_MEANING,
  PROB_CEIL,
  PROB_FLOOR,
  calibrationExclusionReason,
  canonicalise,
  expireStale,
  freezePrediction,
  hashInput,
  isCalibratable,
  isWindowExpired,
  outcomeValue,
  reliabilityBins,
  resolvePrediction,
  summariseCalibration,
  toXiangEvidence,
  verifyReplay,
  type Outcome,
  type PredictionDraft,
  type PredictionRecord,
} from './index.js';

const DRAFT: PredictionDraft = {
  personId: 'p1',
  engineVersion: 'bazi@0.1.0|fengshui@0.1.0|xiangyi@0.1.0',
  inputHash: 'deadbeefcafef00d',
  window: { fromYear: 2027, toYear: 2027 },
  domain: '健康',
  statement: '需接受一次外科手术或缝合处理',
  candidateXiangIds: ['bazi.qisha.health.surgery', 'fengshui.star2.health.organ'],
  layers: ['命', '风水'],
  probability: 0.42,
  baseRate: 0.12,
  resolution: { criterion: '当年是否有一次需缝合或全麻的外科处置，以就诊记录为准', judge: '客观记录' },
  interventionability: '空间可调',
};

const AT = '2026-07-31T09:00:00.000Z';
const freeze = (over: Partial<PredictionDraft> = {}, id = 'r1') =>
  freezePrediction({ ...DRAFT, ...over }, id, AT);

const OUTCOME: Outcome = {
  verdict: '中',
  recordedAt: '2027-11-02T00:00:00.000Z',
  attribution: '命层',
};

describe('守卫一：无判据不受理', () => {
  it('缺结算标准拒收', () => {
    expect(() =>
      freeze({ resolution: undefined as unknown as PredictionDraft['resolution'] }),
    ).toThrow(/必须写明/);
  });

  it('判据过短拒收', () => {
    expect(() => freeze({ resolution: { criterion: '会好', judge: '用户自评' } })).toThrow(/过短/);
  });

  it.each(['今年财运有起伏', '事业上有好有坏', '整体还可以吧', '这一年不太顺', '要看情况而定'])(
    '不可证伪的措辞「%s」在写入期就被拒',
    (criterion) => {
      expect(() => freeze({ resolution: { criterion, judge: '用户自评' } })).toThrow(/无法证伪/);
    },
  );

  it('判定方式非法拒收', () => {
    expect(() =>
      freeze({
        resolution: { criterion: '以就诊记录为准判定有无手术', judge: '大师说了算' as 'user' as never },
      }),
    ).toThrow(/结算方式/);
  });
});

describe('守卫二：必带引擎版本与输入哈希', () => {
  it('缺 engineVersion 拒收，并说明后果', () => {
    expect(() => freeze({ engineVersion: '' })).toThrow(/同一个模型/);
  });

  it('缺 inputHash 拒收', () => {
    expect(() => freeze({ inputHash: '' })).toThrow(/确定性重放/);
  });
});

describe('守卫三：概率与基准率', () => {
  it('概率超出 3%–92% 拒收', () => {
    expect(() => freeze({ probability: 0 })).toThrow(/决定论/);
    expect(() => freeze({ probability: 1 })).toThrow(/决定论/);
    expect(() => freeze({ probability: PROB_FLOOR })).not.toThrow();
    expect(() => freeze({ probability: PROB_CEIL })).not.toThrow();
  });

  it('基准率可以是 null（表示无基准），但不能是越界数值', () => {
    expect(() => freeze({ baseRate: null })).not.toThrow();
    expect(() => freeze({ baseRate: 1.4 })).toThrow(/基准率/);
  });

  it('无层、无象意 id 一律拒收 —— 否则日后无从归因与收敛', () => {
    expect(() => freeze({ layers: [] })).toThrow(/哪几层/);
    expect(() => freeze({ candidateXiangIds: [] })).toThrow(/象意 id/);
  });

  it('窗口起止颠倒拒收', () => {
    expect(() => freeze({ window: { fromYear: 2030, toYear: 2027 } })).toThrow(/颠倒/);
  });
});

describe('守卫四：只增不改', () => {
  it('冻结后的记录不可就地修改', () => {
    const r = freeze();
    expect(() => {
      (r as { probability: number }).probability = 0.9;
    }).toThrow();
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('结算返回新记录，原记录纹丝不动', () => {
    const r = freeze();
    const done = resolvePrediction(r, OUTCOME);
    expect(done).not.toBe(r);
    expect(r.status).toBe('待结算');
    expect(r.outcome).toBeUndefined();
    expect(done.status).toBe('已结算');
    expect(done.outcome!.verdict).toBe('中');
    expect(done.probability).toBe(r.probability);
  });

  it('重复结算被拒，并指出正确做法是另立更正记录', () => {
    const done = resolvePrediction(freeze(), OUTCOME);
    expect(() => resolvePrediction(done, OUTCOME)).toThrow(/另立一条更正记录/);
  });

  it('归因允许「现实层」—— 系统必须能说这次跟命理风水没关系', () => {
    const done = resolvePrediction(freeze(), { ...OUTCOME, attribution: '现实层' });
    expect(done.outcome!.attribution).toBe('现实层');
  });
});

describe('输入哈希', () => {
  it('键序不影响哈希', () => {
    expect(hashInput({ a: 1, b: { c: 2, d: 3 } })).toBe(hashInput({ b: { d: 3, c: 2 }, a: 1 }));
  });

  it('数组顺序有意义 —— 居住史与化解史的先后本来就是数据的一部分', () => {
    expect(hashInput([1, 2])).not.toBe(hashInput([2, 1]));
  });

  it('undefined 字段不影响哈希', () => {
    expect(hashInput({ a: 1, b: undefined })).toBe(hashInput({ a: 1 }));
  });

  it('内容改变则哈希改变', () => {
    expect(hashInput({ birth: '1984-03-12' })).not.toBe(hashInput({ birth: '1984-03-13' }));
  });

  it('规范化递归处理嵌套结构', () => {
    expect(canonicalise({ z: [{ b: 1, a: 2 }] })).toEqual({ z: [{ a: 2, b: 1 }] });
  });
});

describe('重放校验', () => {
  const r = freeze();

  it('引擎与输入一致时放行', () => {
    const v = verifyReplay(r, { engineVersion: r.engineVersion, inputHash: r.inputHash });
    expect(v.ok).toBe(true);
  });

  it('引擎版本不同时拒绝比对，并说明差异来自引擎而非预测', () => {
    const v = verifyReplay(r, { engineVersion: 'bazi@0.2.0', inputHash: r.inputHash });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('差异来自引擎改动');
  });

  it('输入哈希不同时拒绝比对，并提示可能被改过什么', () => {
    const v = verifyReplay(r, { engineVersion: r.engineVersion, inputHash: 'ffff0000ffff0000' });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('居住史');
  });
});

describe('校准资格：干预混杂必须排除', () => {
  it('窗口内施做过化解者不参与校准', () => {
    const done = resolvePrediction(freeze(), OUTCOME, true);
    expect(done.intervened).toBe(true);
    expect(isCalibratable(done)).toBe(false);
    expect(calibrationExclusionReason(done)).toContain('化解生效还是预测本来就错');
  });

  it('未结算者不参与校准', () => {
    expect(isCalibratable(freeze())).toBe(false);
    expect(calibrationExclusionReason(freeze())).toContain('尚未结算');
  });

  it('无基准率者不参与校准', () => {
    const done = resolvePrediction(freeze({ baseRate: null }), OUTCOME);
    expect(isCalibratable(done)).toBe(false);
    expect(calibrationExclusionReason(done)).toContain('无人群基准率');
  });

  it('干净的已结算记录才算数', () => {
    const done = resolvePrediction(freeze(), OUTCOME);
    expect(isCalibratable(done)).toBe(true);
    expect(calibrationExclusionReason(done)).toBeNull();
  });
});

describe('转成象意证据', () => {
  it('一条预测支持几条象意就出几条证据', () => {
    const done = resolvePrediction(freeze(), OUTCOME);
    const map = toXiangEvidence([done]);
    expect(map.get('bazi.qisha.health.surgery')).toHaveLength(1);
    expect(map.get('fengshui.star2.health.organ')).toHaveLength(1);
    expect(map.get('bazi.qisha.health.surgery')![0]!.verdict).toBe('中');
  });

  it('混杂样本一律不转 —— 否则后验学到的是化解的效果', () => {
    const dirty = resolvePrediction(freeze({}, 'r2'), OUTCOME, true);
    expect(toXiangEvidence([dirty]).size).toBe(0);
  });
});

describe('窗口到期', () => {
  it('年级窗口以次年立春为界', () => {
    const r = freeze();
    expect(isWindowExpired(r, new Date(2028, 0, 20))).toBe(false);
    expect(isWindowExpired(r, new Date(2028, 5, 1))).toBe(true);
  });

  it('精确窗口以 toISO 为界', () => {
    const r = freeze({
      window: { fromYear: 2026, toYear: 2026, fromISO: AT, toISO: '2026-09-14T09:00:00.000Z' },
    });
    expect(isWindowExpired(r, new Date('2026-09-01T00:00:00.000Z'))).toBe(false);
    expect(isWindowExpired(r, new Date('2026-10-01T00:00:00.000Z'))).toBe(true);
  });

  it('到期扫描只动待结算的，且不改内容', () => {
    const pending = freeze({}, 'a');
    const done = resolvePrediction(freeze({}, 'b'), OUTCOME);
    const [p, d] = expireStale([pending, done], new Date(2029, 5, 1));
    expect(p!.status).toBe('窗口过期');
    expect(p!.statement).toBe(pending.statement);
    expect(d!.status).toBe('已结算');
  });
});

describe('校准指标', () => {
  const make = (i: number, prob: number, base: number, verdict: Outcome['verdict']) =>
    resolvePrediction(
      freeze({ probability: prob, baseRate: base }, `c${i}`),
      { verdict, recordedAt: '2027-12-01T00:00:00.000Z' },
    );

  it('部分中按半次计，与象意后验口径一致', () => {
    expect(outcomeValue('中')).toBe(1);
    expect(outcomeValue('部分中')).toBe(0.5);
    expect(outcomeValue('未发生')).toBe(0);
    expect(outcomeValue('反向')).toBe(0);
  });

  it('报的就是基准率时技巧分为 0 —— 零信息不该看起来像本事', () => {
    const rs: PredictionRecord[] = [
      make(1, 0.3, 0.3, '中'),
      make(2, 0.3, 0.3, '未发生'),
      make(3, 0.3, 0.3, '未发生'),
    ];
    const s = summariseCalibration(rs);
    expect(s.skill).toBeCloseTo(0, 10);
  });

  it('比基准率报得更准则技巧分为正', () => {
    const rs: PredictionRecord[] = [
      make(1, 0.9, 0.5, '中'),
      make(2, 0.05, 0.5, '未发生'),
    ];
    const s = summariseCalibration(rs);
    expect(s.skill!).toBeGreaterThan(0);
  });

  it('样本不足时明确告知不足以下结论', () => {
    const s = summariseCalibration([make(1, 0.5, 0.3, '中')]);
    expect(s.n).toBe(1);
    expect(s.caveat).toContain(String(MIN_SAMPLES_FOR_MEANING));
  });

  it('被排除的样本按原因计数，不静默丢弃', () => {
    const s = summariseCalibration([
      freeze({}, 'x'),
      resolvePrediction(freeze({}, 'y'), OUTCOME, true),
      resolvePrediction(freeze({ baseRate: null }, 'z'), OUTCOME),
    ]);
    expect(s.n).toBe(0);
    expect(s.excluded).toEqual({ 未结算: 1, 窗口内已化解: 1, 无基准率: 1 });
  });

  it('可靠性曲线分档：我说 70% 的那些实际发生了几成', () => {
    const rs: PredictionRecord[] = [
      make(1, 0.75, 0.3, '中'),
      make(2, 0.72, 0.3, '中'),
      make(3, 0.78, 0.3, '未发生'),
      make(4, 0.1, 0.3, '未发生'),
    ];
    const bins = reliabilityBins(rs, 5);
    expect(bins).toHaveLength(5);
    const high = bins.find((b) => b.from === 0.6)!;
    expect(high.n).toBe(3);
    expect(high.meanActual).toBeCloseTo(2 / 3, 10);
    const low = bins.find((b) => b.from === 0)!;
    expect(low.n).toBe(1);
    expect(low.meanActual).toBe(0);
  });

  it('分档数非法抛错', () => {
    expect(() => reliabilityBins([], 1)).toThrow();
  });
});
