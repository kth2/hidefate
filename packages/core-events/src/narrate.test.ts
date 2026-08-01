import { describe, expect, it } from 'vitest';
import {
  GLOSSARY,
  factsFor,
  glossaryOf,
  lineFor,
  narratePalace,
  narrateYear,
  summariseYear,
  termsIn,
  type PredictedEvent,
} from './index.js';

const evt = (over: Partial<PredictedEvent> = {}): PredictedEvent => ({
  templateId: 'career.layoff',
  title: '工作上遇裁员、被动调岗或降职',
  domain: '事业',
  valence: '凶',
  year: 2027,
  monthIndex: 3,
  whenLabel: '2027 年 4–5 月',
  granularity: '月',
  layers: ['命', '运'],
  resonance: 2,
  probability: 0.51,
  matched: ['七杀', '五黄'],
  criterion: '2027 年 4–5 月内是否发生非本人主动的工作变动',
  advice: '提前把手上成果与交接记录留档。',
  classic: '《三命通会·论七杀》',
  interventionability: '行为可调',
  ...over,
});

const base = { year: 2027, age: 44, ganZhi: '丁未', shiShen: '食神' as string | null };

describe('术语白话表', () => {
  it('每条解释都必须是人话，不能拿另一串术语搪塞', () => {
    // 用术语解释术语是这类词表最常见的失败方式，故此处逐条检查
    const jargon = ['旺相休囚', '纳音', '禄存', '三合', '六冲', '入墓'];
    for (const [term, plain] of Object.entries(GLOSSARY)) {
      expect(plain.length).toBeGreaterThan(6);
      for (const j of jargon) {
        expect(plain, `「${term}」的解释里出现了未加说明的术语 ${j}`).not.toContain(j);
      }
    }
  });

  it('十神、九星、神煞、时间尺度都收全了', () => {
    for (const t of ['七杀', '正官', '偏财', '伤官', '正印']) expect(glossaryOf(t)).not.toBeNull();
    for (const t of ['一白', '二黑', '五黄', '八白', '九紫']) expect(glossaryOf(t)).not.toBeNull();
    for (const t of ['红鸾', '天喜', '驿马', '桃花']) expect(glossaryOf(t)).not.toBeNull();
    for (const t of ['大运', '流年', '流月', '元运', '动气', '应期']) expect(glossaryOf(t)).not.toBeNull();
  });

  it('未收录的词返回 null，不编一个', () => {
    expect(glossaryOf('根本没有这个词')).toBeNull();
  });

  it('能从一段文字里找出可解释的术语', () => {
    const found = termsIn('今年七杀当值，五黄飞到大门，要留意动气');
    expect(found).toContain('七杀');
    expect(found).toContain('五黄');
    expect(found).toContain('动气');
  });
});

describe('年度一句话总结', () => {
  it('有凶事时先说要留意什么，再说好的', () => {
    const s = summariseYear({
      ...base,
      events: [evt(), evt({ templateId: 'wealth.windfall', title: '一笔计划外的进账', domain: '财运', valence: '吉', probability: 0.54, whenLabel: '2027 年 9–10 月' })],
    });
    expect(s.indexOf('最该留意')).toBeLessThan(s.indexOf('好的一面'));
    expect(s).toContain('工作上遇裁员');
    expect(s).toContain('51%');
  });

  it('只有吉事时直接说机会在哪', () => {
    const s = summariseYear({
      ...base,
      events: [evt({ templateId: 'wealth.windfall', title: '一笔计划外的进账', domain: '财运', valence: '吉', probability: 0.54 })],
    });
    expect(s).toContain('机会在');
    expect(s).not.toContain('最该留意');
  });

  /** 一句「今年运势平稳」正是这个项目一开始就要摆脱的东西。 */
  it('无事时明说没有够格出报的事，不编一句正能量', () => {
    const s = summariseYear({ ...base, events: [] });
    expect(s).toContain('没有达到出报门槛');
    expect(s).not.toMatch(/运势|平稳|顺利|注意身体/);
  });

  it('总结里不出现空话', () => {
    const s = summariseYear({ ...base, events: [evt()] });
    expect(s).not.toMatch(/运势不错|小心为上|逢凶化吉|万事如意/);
  });

  it('换大运与搬家会被点出来', () => {
    const a = summariseYear({ ...base, events: [evt()], breakpointKinds: ['大运交界'] });
    expect(a).toContain('换大运');
    const b = summariseYear({ ...base, events: [evt()], breakpointKinds: ['搬家'] });
    expect(b).toContain('搬迁');
  });
});

describe('逐条白话', () => {
  it('说清什么事、什么时候、多大把握、先做什么', () => {
    const l = lineFor(evt());
    expect(l).toContain('2027 年 4–5 月');
    expect(l).toContain('要留意');
    expect(l).toContain('51%');
    expect(l).toContain('交接记录留档');
  });

  it('吉事说「有机会」而不是「要留意」', () => {
    expect(lineFor(evt({ valence: '吉' }))).toContain('有机会');
  });
});

describe('给 AI 的事实清单', () => {
  /**
   * AI 的 system 提示会写死「只能引用以下事实」。
   * 若清单本身缺了概率或时间，AI 就只能自己编 —— 那正是铁律要防的。
   */
  it('每条事件都带齐时间、概率、层数、古法与提前量', () => {
    const f = factsFor({ ...base, events: [evt()] });
    const line = f.find((x) => x.startsWith('事件：'))!;
    expect(line).toContain('2027 年 4–5 月');
    expect(line).toContain('51%');
    expect(line).toContain('命、运');
    expect(line).toContain('《三命通会');
    expect(line).toContain('交接记录留档');
  });

  it('无事件时也明说，不留空白让 AI 自由发挥', () => {
    const f = factsFor({ ...base, events: [] });
    expect(f.join('')).toContain('没有达到共振门槛');
  });
});

describe('宫位白话', () => {
  it('凶且动气强 —— 直说这里最需要处理，并给出化解', () => {
    const n = narratePalace({
      direction: '正东',
      comboName: '碧绿风魔',
      comboMeaning: '木气过盛而风动，主神经衰弱、情绪失控。',
      comboNature: '凶',
      dongQiLevel: '强',
      dongQiNote: '此宫有大门，天天进出。',
      roomWords: ['大门'],
      cures: ['以火泄木（暖色灯、红色饰物），忌再添水与深绿。'],
    });
    expect(n.headline).toContain('大门');
    expect(n.headline).toContain('最需要处理');
    expect(n.meaning).toContain('神经衰弱');
    expect(n.action).toContain('暖色灯');
  });

  it('凶但无人走动 —— 明说暂时不急，不制造恐慌', () => {
    const n = narratePalace({
      direction: '西北', comboName: '二五交加', comboMeaning: '主重病损主。',
      comboNature: '凶', dongQiLevel: '无', dongQiNote: '此宫无房间落入。',
      roomWords: [], cures: ['此方绝对静止。'],
    });
    expect(n.headline).toContain('暂时不急');
  });

  it('吉位用得少时点出来 —— 那是可以改的', () => {
    const n = narratePalace({
      direction: '正南', comboName: '文昌局', comboMeaning: '主科名文书。',
      comboNature: '吉', dongQiLevel: '弱', dongQiNote: '此宫只有储藏。',
      roomWords: ['储藏'], cures: [],
    });
    expect(n.headline).toContain('可惜用得少');
    expect(n.action).toBeNull();
  });
});

describe('整套年度白话', () => {
  it('产出总结、分条、术语与事实四样', () => {
    const n = narrateYear({ ...base, events: [evt()] });
    expect(n.headline.length).toBeGreaterThan(10);
    expect(n.lines).toHaveLength(1);
    expect(n.terms.some((t) => t.term === '七杀' || t.term === '食神')).toBe(true);
    expect(n.facts.length).toBeGreaterThan(1);
  });

  it('同输入同输出 —— 可重放', () => {
    const a = narrateYear({ ...base, events: [evt()] });
    const b = narrateYear({ ...base, events: [evt()] });
    expect(a).toEqual(b);
  });
});
