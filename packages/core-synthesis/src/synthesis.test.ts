import { describe, expect, it } from 'vitest';
import { OUTER_PALACES, PALACE_INDEXES, type RoomKind } from '@hidefate/core-fengshui';
import { computeShanXiang } from '@hidefate/core-qimen';
import { bestPalaces, synthesise, worstPalaces } from './assess.js';
import { PROB_CEIL, PROB_FLOOR, analyse, predict } from './predict.js';
import { buildRoomMemberMatrix, buildYearMemberMatrix, filterMatrix } from './matrix.js';
import { buildTimeline, compareYears } from './timeline.js';
import { applyChanges, compareScenarios, isInstantChange, simulate, validateChanges } from './simulate.js';
import { buildFamilyFusionReport, memberFit } from './report.js';
import { answerBestPalaceFor, answerMultipleChoice, buildAnswerContext, parsePalaceFromText } from './answer.js';
import { buildAlerts, palaceOfStar, yearGlance } from './alerts.js';
import { SAMPLE_MEMBERS, SAMPLE_PROFILE, sampleInput } from './fixtures.js';

describe('三派合参', () => {
  const input = sampleInput(2026);
  const s = analyse(input, synthesise(input));

  it('九宫齐备且各带三派依据', () => {
    expect(Object.keys(s.palaces).map(Number).sort((a, b) => a - b)).toEqual([...PALACE_INDEXES]);
    for (const p of PALACE_INDEXES) {
      const a = s.palaces[p];
      expect(a.findings.length).toBeGreaterThan(0);
      expect(a.score).toBeGreaterThanOrEqual(-1);
      expect(a.score).toBeLessThanOrEqual(1);
      expect(a.combinationName).toBeTruthy();
      // 每条断语都必须挂门派与古法依据 —— 这是「可追溯」的硬约束
      for (const f of a.findings) {
        expect(f.schools.length).toBeGreaterThan(0);
        expect(f.principle.length).toBeGreaterThan(4);
        expect(['高', '中', '低']).toContain(f.confidence);
      }
    }
  });

  it('中宫不入八宅论断，八方皆有八宅星', () => {
    expect(s.palaces[5].baZhaiStar).toBeNull();
    for (const p of OUTER_PALACES) expect(s.palaces[p].baZhaiStar).toBeTruthy();
  });

  it('未启用奇门时各派权重仍归一（关掉奇门不会整体偏移）', () => {
    expect(s.qiMenEnabled).toBe(false);
    for (const p of PALACE_INDEXES) expect(s.palaces[p].qiMen).toBeNull();
    expect(Math.abs(s.overallScore)).toBeLessThanOrEqual(1);
  });

  it('缺角独立计入且不被吉星抵销', () => {
    const withMissing = s.palaces[6];
    expect(withMissing.missing).not.toBeNull();
    expect(withMissing.findings.some((f) => f.schools.includes('形峦缺角'))).toBe(true);

    const noMissing = synthesise({ ...input, profile: { ...SAMPLE_PROFILE, missingCorners: [] } });
    expect(noMissing.palaces[6].score).toBeGreaterThan(withMissing.score);
  });

  it('整体置信度带明列理由', () => {
    expect(['高', '中', '低']).toContain(s.confidence.level);
    expect(s.confidence.reasons.length).toBeGreaterThan(1);
    expect(s.confidence.reasons.join('')).toContain('九宫格');
  });

  it('化解清单已排序去重，急件在前', () => {
    const cures = s.prioritisedCures;
    expect(cures.length).toBeGreaterThan(0);
    expect(cures.map((c) => c.priority)).toEqual(cures.map((_, i) => i + 1));
    const rank = { 立即: 0, 本年内: 1, 可从容安排: 2 } as const;
    for (let i = 1; i < cures.length; i++) {
      expect(rank[cures[i]!.urgency]).toBeGreaterThanOrEqual(rank[cures[i - 1]!.urgency]);
    }
    const keys = cures.map((c) => `${c.palace}|${c.action}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('最凶最吉宫可取', () => {
    expect(worstPalaces(s, 3)).toHaveLength(3);
    expect(bestPalaces(s, 3)).toHaveLength(3);
    expect(bestPalaces(s, 1)[0]!.score).toBeGreaterThanOrEqual(worstPalaces(s, 1)[0]!.score);
  });

  it('确定性：同输入同输出', () => {
    const a = synthesise(input);
    const b = synthesise(input);
    expect(a.overallScore).toBe(b.overallScore);
    expect(JSON.stringify(a.palaces)).toBe(JSON.stringify(b.palaces));
  });
});

describe('概率预测', () => {
  const input = sampleInput(2026);
  const s = analyse(input, synthesise(input));

  it('概率恒在 [3%, 92%]，绝不输出确定性', () => {
    expect(s.predictions.length).toBeGreaterThan(0);
    for (const p of s.predictions) {
      expect(p.probability).toBeGreaterThanOrEqual(PROB_FLOOR);
      expect(p.probability).toBeLessThanOrEqual(PROB_CEIL);
    }
  });

  it('每条预测必带化解建议（无解则不出预测）', () => {
    for (const p of s.predictions) expect(p.cures.length).toBeGreaterThan(0);
  });

  it('每条预测都有可复算的加权明细', () => {
    for (const p of s.predictions) {
      expect(p.breakdown.length).toBeGreaterThan(2);
      for (const b of p.breakdown) {
        expect(b.factor).toBeTruthy();
        expect(b.note.length).toBeGreaterThan(4);
        expect(Number.isFinite(b.contribution)).toBe(true);
      }
    }
  });

  it('房间优先级严格：大门 > 主卧 > 厨房 > 儿童房 > 客厅', () => {
    const order: RoomKind[] = ['大门', '主卧', '厨房', '儿童房', '客厅'];
    const seq = s.predictions.map((p) => p.roomKind).filter((k): k is RoomKind => k != null && order.includes(k));
    const idx = seq.map((k) => order.indexOf(k));
    for (let i = 1; i < idx.length; i++) expect(idx[i]!).toBeGreaterThanOrEqual(idx[i - 1]!);
  });

  it('主卧见五鬼/六煞/二黑/五黄即强制触发感情预警', () => {
    // 把主卧搬到一个必定触发的宫位来验证规则本身
    const master = SAMPLE_PROFILE.rooms.find((r) => r.kind === '主卧')!;
    let triggered = false;
    for (const p of OUTER_PALACES) {
      const moved = {
        ...SAMPLE_PROFILE,
        rooms: SAMPLE_PROFILE.rooms.map((r) => (r.id === master.id ? { ...r, primaryPalace: p, palaces: [p] } : r)),
      };
      const i2 = { ...input, profile: moved };
      const s2 = synthesise(i2);
      const a = s2.palaces[p];
      const hit =
        a.baZhaiStar === '五鬼' || a.baZhaiStar === '六煞' ||
        [a.stars.shan, a.stars.xiang, a.stars.annual].some((x) => x === 2 || x === 5);
      if (!hit) continue;
      const preds = predict(i2, s2);
      const rel = preds.find((x) => x.id === `relation-${p}`);
      expect(rel, `主卧在 ${p} 宫命中触发条件却未出感情预警`).toBeDefined();
      expect(rel!.domain).toBe('感情');
      triggered = true;
    }
    expect(triggered).toBe(true);
  });

  it('健康预测挂脏腑映射依据', () => {
    const health = s.predictions.filter((p) => p.domain === '健康');
    for (const h of health) {
      expect(h.findings.some((f) => /肾|脾|肝|胆|肺|心|关节|毒/.test(f.statement + f.principle))).toBe(true);
    }
  });

  it('八字残缺的成员不会被臆测（明确标注不参与加权）', () => {
    const notes = s.predictions.flatMap((p) => p.breakdown).map((b) => b.note).join('');
    expect(notes).toContain('无日主可依');
  });
});

describe('房间 × 成员 矩阵', () => {
  const input = sampleInput(2026);
  const s = analyse(input, synthesise(input));

  it('行列齐全，格子可索引', () => {
    const m = buildRoomMemberMatrix(s, SAMPLE_MEMBERS);
    expect(m.members).toHaveLength(SAMPLE_MEMBERS.length);
    expect(m.columns).toHaveLength(SAMPLE_PROFILE.rooms.length);
    expect(m.cells).toHaveLength(SAMPLE_MEMBERS.length * SAMPLE_PROFILE.rooms.length);
    const cell = m.index[`m-dad|r-master`];
    expect(cell).toBeDefined();
    expect(cell!.brief.length).toBeGreaterThan(10);
    expect(cell!.findings.length).toBeGreaterThan(0);
  });

  it('同一间房对不同命卦的人强度可以不同', () => {
    const m = buildRoomMemberMatrix(s, SAMPLE_MEMBERS);
    const perRoom = new Map<string, Set<number>>();
    for (const c of m.cells) {
      const set = perRoom.get(c.columnId) ?? new Set<number>();
      set.add(Math.round(c.overall * 1000));
      perRoom.set(c.columnId, set);
    }
    expect([...perRoom.values()].some((v) => v.size > 1)).toBe(true);
  });

  it('强度恒在 0–1', () => {
    const m = buildRoomMemberMatrix(s, SAMPLE_MEMBERS);
    for (const c of m.cells) {
      expect(c.overall).toBeGreaterThanOrEqual(0);
      expect(c.overall).toBeLessThanOrEqual(1);
      for (const v of Object.values(c.intensity)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('可按风险类型筛选', () => {
    const m = buildRoomMemberMatrix(s, SAMPLE_MEMBERS);
    const health = filterMatrix(m, '健康', 0);
    expect(health.length).toBeGreaterThan(0);
    for (let i = 1; i < health.length; i++) {
      expect(health[i]!.intensity.健康).toBeLessThanOrEqual(health[i - 1]!.intensity.健康);
    }
  });

  it('年份矩阵可建', () => {
    const years = [2026, 2027, 2028].map((y) => {
      const i = sampleInput(y);
      return analyse(i, synthesise(i));
    });
    const m = buildYearMemberMatrix(years, SAMPLE_MEMBERS);
    expect(m.kind).toBe('年份');
    expect(m.columns.map((c) => c.label)).toEqual(['2026 年', '2027 年', '2028 年']);
  });
});

describe('多年时间轴', () => {
  const base = { profile: SAMPLE_PROFILE, members: SAMPLE_MEMBERS, qiMen: null };

  it('默认 12 年，逐年有评级与热点', () => {
    const t = buildTimeline(base, { startYear: 2026, span: 12 });
    expect(t.years).toHaveLength(12);
    expect(t.startYear).toBe(2026);
    expect(t.endYear).toBe(2037);
    for (const y of t.years) {
      expect(y.hotspots).toHaveLength(3);
      expect(y.annualStarName).toBeTruthy();
      expect(Object.keys(y.memberRisk)).toHaveLength(SAMPLE_MEMBERS.length);
    }
  });

  it('流年星逐年递退，九年一循环', () => {
    const t = buildTimeline(base, { startYear: 2026, span: 10 });
    expect(t.years[0]!.annualStar).toBe(1); // 2026 一白
    expect(t.years[1]!.annualStar).toBe(9);
    expect(t.years[9]!.annualStar).toBe(t.years[0]!.annualStar);
  });

  it('标出最凶与最吉年份、换运年份', () => {
    const t = buildTimeline(base, { startYear: 2035, span: 15 });
    expect(t.worstYears.length).toBeGreaterThan(0);
    expect(t.bestYears.length).toBeGreaterThan(0);
    expect(t.periodChangeYears).toContain(2044); // 九运 2024–2043，2044 入一运
    expect(t.summary).toContain('换运');
  });

  it('化解只在施用年之后生效', () => {
    const cure = {
      id: 'c1', palace: 6 as const, wuXing: '金' as const, item: '六帝钱',
      appliedOn: '2028-03-01', effectiveFromYear: 2028,
    };
    const t = buildTimeline(base, { startYear: 2026, span: 6, appliedCures: [cure] });
    expect(t.years[0]!.activeCureCount).toBe(0); // 2026
    expect(t.years[1]!.activeCureCount).toBe(0); // 2027
    expect(t.years[2]!.activeCureCount).toBe(1); // 2028
  });

  it('年度对比报告', () => {
    const c = compareYears(base, 2025, 2026);
    expect(['↑ 改善', '↓ 转差', '→ 持平']).toContain(c.direction);
    expect(c.narrative).toContain('2025');
    expect(c.narrative).toContain('2026');
  });
});

describe('What-If 模拟', () => {
  const input = sampleInput(2026);

  it('校验非法输入并明确报错，不静默出错', () => {
    expect(validateChanges({ sitting: '甴' }, SAMPLE_PROFILE).length).toBeGreaterThan(0);
    expect(validateChanges({ period: 12 as never }, SAMPLE_PROFILE).length).toBeGreaterThan(0);
    expect(validateChanges({ moveInYear: 1700 }, SAMPLE_PROFILE).length).toBeGreaterThan(0);
    expect(validateChanges({ moveRooms: { 'no-such-room': 1 } }, SAMPLE_PROFILE).length).toBeGreaterThan(0);
    expect(validateChanges({ sitting: '午', floor: 8 }, SAMPLE_PROFILE)).toHaveLength(0);
  });

  it('非法输入时返回 valid=false 且不改动结果', () => {
    const r = simulate(input, { id: 's0', name: '错误方案', changes: { sitting: '甴' } });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.overall.delta).toBe(0);
  });

  it('搬房间属瞬时变更，且确实改变结果', () => {
    const changes = { moveRooms: { 'r-master': 4 as const } };
    expect(isInstantChange(changes)).toBe(true);
    const r = simulate(input, { id: 's1', name: '主卧搬到东南', changes });
    expect(r.valid).toBe(true);
    expect(r.memberDeltas).toHaveLength(SAMPLE_MEMBERS.length);
    const moved = applyChanges(SAMPLE_PROFILE, changes).rooms.find((x) => x.id === 'r-master')!;
    expect(moved.primaryPalace).toBe(4);
  });

  it('改坐向属重排级变更，会改动飞星组合', () => {
    const changes = { sitting: '午' as const };
    expect(isInstantChange(changes)).toBe(false);
    const r = simulate(input, { id: 's2', name: '改坐午向子', changes });
    expect(r.valid).toBe(true);
    expect(r.palaceDeltas.some((d) => d.before.combination !== d.after.combination)).toBe(true);
    expect(r.after.flyingStar.sitting.mountain.name).toBe('午');
  });

  it('输出整体变化方向、前三改善与前三恶化', () => {
    const r = simulate(input, { id: 's3', name: '改九宫', changes: { sitting: '乾' } });
    expect(['↑', '↓', '→']).toContain(r.overall.direction);
    expect(r.topImproved.length).toBeLessThanOrEqual(3);
    expect(r.topWorsened.length).toBeLessThanOrEqual(3);
    expect(r.palaceDeltas).toHaveLength(8);
    expect(r.narrative).toContain('方案');
  });

  it('可模拟「谁在家」', () => {
    const r = simulate(input, { id: 's4', name: '只有夫妻在家', changes: { presentMemberIds: ['m-dad', 'm-mom'] } });
    expect(r.memberDeltas).toHaveLength(2);
  });

  it('补缺角可改善该宫', () => {
    const r = simulate(input, { id: 's5', name: '西北补齐', changes: { missingCorners: [] } });
    const nw = r.palaceDeltas.find((d) => d.palace === 6)!;
    expect(nw.delta).toBeGreaterThan(0);
  });

  it('并排比较最多 3 个方案，超过则报错', () => {
    const rs = [
      simulate(input, { id: 'a', name: '甲案', changes: { sitting: '午' } }),
      simulate(input, { id: 'b', name: '乙案', changes: { sitting: '乾' } }),
      simulate(input, { id: 'c', name: '丙案', changes: { moveRooms: { 'r-master': 4 } } }),
    ];
    const cmp = compareScenarios(input, rs);
    expect(cmp.scenarios).toHaveLength(3);
    expect(cmp.scenarios[0]!.rank).toBe(1);
    expect(cmp.recommendation.length).toBeGreaterThan(5);
    expect(() => compareScenarios(input, [...rs, rs[0]!])).toThrow(/3/);
  });
});

describe('家庭融合报告', () => {
  const base = { profile: SAMPLE_PROFILE, members: SAMPLE_MEMBERS, qiMen: null };

  it('每位成员都有契合度、最宜与最忌房间', () => {
    const r = buildFamilyFusionReport(base, 2026, 6);
    expect(r.members).toHaveLength(3);
    for (const m of r.members) {
      expect(m.fitScore).toBeGreaterThanOrEqual(0);
      expect(m.fitScore).toBeLessThanOrEqual(100);
      expect(m.bestRooms.length).toBeGreaterThan(0);
      expect(m.worstRooms.length).toBeGreaterThan(0);
      expect(m.auspiciousDirections).toHaveLength(4);
      expect(m.inauspiciousDirections).toHaveLength(4);
      expect(m.dataNote.length).toBeGreaterThan(4);
    }
  });

  it('标出最受益与最受损者', () => {
    const r = buildFamilyFusionReport(base, 2026, 5);
    expect(r.mostHelped).not.toBeNull();
    expect(r.familyFitScore).toBeGreaterThanOrEqual(0);
    expect(r.summary).toContain('契合度');
  });

  it('残缺八字成员的命卦部分照常完整', () => {
    const s = synthesise(sampleInput(2026));
    const son = SAMPLE_MEMBERS.find((m) => m.id === 'm-son')!;
    expect(son.chart.precision).toBe('年月');
    const fit = memberFit(s, son);
    expect(fit.auspiciousDirections).toHaveLength(4);
    expect(fit.dataNote).toContain('命卦');
  });

  it('给出房间分配建议', () => {
    const r = buildFamilyFusionReport(base, 2026, 5);
    expect(r.roomAssignmentAdvice.length).toBeGreaterThan(0);
  });
});

describe('标准三段式作答', () => {
  const input = sampleInput(2026);
  const s = analyse(input, synthesise(input));

  it('方位文字解析（长别名优先）', () => {
    expect(parsePalaceFromText('东南角')).toBe(4);
    expect(parsePalaceFromText('正东方')).toBe(3);
    expect(parsePalaceFromText('西北')).toBe(6);
    expect(parsePalaceFromText('坎宫')).toBe(1);
    expect(parsePalaceFromText('坐向 187 度')).toBe(9);
    expect(parsePalaceFromText('没有方位')).toBeNull();
  });

  it('选择题输出严格三段格式', () => {
    const a = answerMultipleChoice(s, '书房设在哪个方位最有利考试升学？', [
      { key: 'A', text: '正北' },
      { key: 'B', text: '东南' },
      { key: 'C', text: '西南' },
      { key: 'D', text: '正西' },
    ], '最吉', '事业');
    expect(a.formatted).toMatch(/^答案：/);
    expect(a.formatted).toContain('\n理：\n');
    expect(a.formatted).toContain('\n化解建议：\n');
    expect(a.reasoning).toContain('【玄空飞星】');
    expect(a.reasoning).toContain('【八宅】');
    expect(a.reasoning).toContain('【概率】');
    expect(a.reasoning).toContain('【房间】');
    expect(['A', 'B', 'C', 'D']).toContain(a.answer.charAt(0));
  });

  it('问「最凶」时选出评分最低者', () => {
    const opts = [
      { key: 'A', text: '正北', palace: 1 as const },
      { key: 'B', text: '西南', palace: 2 as const },
      { key: 'C', text: '正东', palace: 3 as const },
    ];
    const worst = answerMultipleChoice(s, '哪个方位今年最需回避？', opts, '最凶');
    const best = answerMultipleChoice(s, '哪个方位今年最有利？', opts, '最吉');
    const scoreOf = (k: string) => s.palaces[opts.find((o) => o.key === k)!.palace].score;
    expect(scoreOf(worst.answer.charAt(0))).toBeLessThanOrEqual(scoreOf(best.answer.charAt(0)));
  });

  it('启用奇门后理据中出现山向奇门段', async () => {
    const qm = await computeShanXiang({ sitting: SAMPLE_PROFILE.sitting, year: SAMPLE_PROFILE.moveInYear });
    const i2 = { ...input, profile: { ...SAMPLE_PROFILE, enableQiMen: true }, qiMen: qm };
    const s2 = analyse(i2, synthesise(i2));
    expect(s2.qiMenEnabled).toBe(true);
    const a = answerBestPalaceFor(s2, '大门开在哪一方最好？', '最吉', '财运');
    expect(a.reasoning).toContain('【山向奇门】');
    expect(a.schools).toContain('山向奇门');
  });

  it('选项无法解析方位时明说无法判定，不猜', () => {
    const a = answerMultipleChoice(s, '随便问', [
      { key: 'A', text: '随便' },
      { key: 'B', text: '都行' },
    ]);
    expect(a.answer).toBe('无法判定');
    expect(a.reasoning).toContain('不作猜测');
  });

  it('LLM 上下文含全部事实且明令禁止改数', () => {
    const { system, facts } = buildAnswerContext(s);
    expect(system).toContain('绝对不可以修改');
    expect(system).toContain('简体中文');
    expect(system).toContain('答案：X');
    expect(facts).toContain('# 九宫明细');
    expect(facts).toContain('全屋综合分');
    expect(facts.split('\n').filter((l) => l.includes('宫）')).length).toBe(9);
  });

  it('上下文含成员命卦、四吉四凶方与八字精度', () => {
    const { facts } = buildAnswerContext(s, { members: SAMPLE_MEMBERS });
    expect(facts).toContain('# 成员与命理');
    for (const m of SAMPLE_MEMBERS) {
      expect(facts).toContain(m.name);
      expect(facts).toContain(`命卦 ${m.mingGua.gua}${m.mingGua.number}`);
    }
    expect(facts).toContain('四吉方');
    expect(facts).toContain('四凶方');
    expect(facts).toContain('八字精度');
  });

  it('残缺八字在上下文中明写「不可推断」，不给模型编造的余地', () => {
    const { facts, system } = buildAnswerContext(s, { members: SAMPLE_MEMBERS });
    // 小明仅年月，无日柱 → 必须明说无日主
    expect(facts).toContain('无日柱故无日主');
    expect(facts).toContain('一概不可推断');
    expect(system).toContain('绝不可为了把话说圆而假设一个时辰');
  });

  it('无成员时明确告知「涉及个人的问题无法作答」', () => {
    const { facts } = buildAnswerContext(s, { members: [] });
    expect(facts).toContain('尚未录入任何成员');
    expect(facts).toContain('无法作答');
  });

  it('模拟状态会进上下文，且 system 要求点明是哪个方案', () => {
    const withSim = buildAnswerContext(s, {
      members: SAMPLE_MEMBERS,
      simulation: {
        scenarioName: '主卧搬到东南',
        narrative: '整体改善。',
        overallBefore: -0.3,
        overallAfter: -0.1,
        topImproved: [{ direction: '西南', note: '警戒→留意' }],
        topWorsened: [],
      },
    });
    expect(withSim.facts).toContain('当前 What-If 模拟状态');
    expect(withSim.facts).toContain('主卧搬到东南');
    expect(withSim.facts).toContain('用户正在看的是这个假设方案');
    expect(withSim.system).toContain('此为方案');

    // 没有模拟时也要明说「无」，免得模型以为在看某个方案
    const noSim = buildAnswerContext(s, { members: SAMPLE_MEMBERS });
    expect(noSim.facts).toContain('均为现况原盘');
  });

  it('时间轴摘要可选并入上下文', () => {
    const { facts } = buildAnswerContext(s, {
      members: SAMPLE_MEMBERS,
      timeline: {
        startYear: 2026,
        endYear: 2028,
        summary: '测试摘要。',
        years: [
          { year: 2026, annualStarName: '一白', overallRisk: '警戒' },
          { year: 2027, annualStarName: '九紫', overallRisk: '留意' },
        ],
      },
    });
    expect(facts).toContain('# 宅运时间轴 2026–2028');
    expect(facts).toContain('2026(一白/警戒)');
  });
});

describe('智能预警', () => {
  const base = { profile: SAMPLE_PROFILE, members: SAMPLE_MEMBERS, qiMen: null, appliedCures: [] };

  it('年星飞宫推算', () => {
    // 2026 一白入中：五黄飞到巽四宫（东南）
    expect(palaceOfStar(2026, 1)).toBe(5);
    expect(palaceOfStar(2026, 2)).toBe(6);
    expect(palaceOfStar(2026, 5)).toBe(9);
    expect(yearGlance(2026).name).toBe('一白');
  });

  it('生成预警并按严重度排序', () => {
    const alerts = buildAlerts(base, 2026, 1, 6);
    expect(alerts.length).toBeGreaterThan(0);
    const sev = { 紧急: 0, 高危: 1, 警戒: 2, 留意: 3, 安全: 4 } as const;
    for (let i = 1; i < alerts.length; i++) {
      expect(sev[alerts[i]!.severity]).toBeGreaterThanOrEqual(sev[alerts[i - 1]!.severity]);
    }
    for (const a of alerts) {
      expect(a.title.length).toBeGreaterThan(4);
      expect(a.action.length).toBeGreaterThan(4);
    }
  });

  it('换运预警在换运前数年即出现', () => {
    const alerts = buildAlerts(base, 2041, 1, 3);
    const change = alerts.find((a) => a.kind === '换运');
    expect(change).toBeDefined();
    expect(change!.fromYear).toBe(2044);
    expect(change!.body).toContain('当旺');
  });

  it('可按成员与风险类型过滤', () => {
    const all = buildAlerts(base, 2026, 1, 6);
    const onlyHealth = buildAlerts(base, 2026, 1, 6, { domains: ['健康'] });
    expect(onlyHealth.length).toBeLessThanOrEqual(all.length);
    for (const a of onlyHealth) expect(a.domains).toContain('健康');

    const onlySon = buildAlerts(base, 2026, 1, 6, { memberIds: ['m-son'] });
    for (const a of onlySon) {
      if (a.memberIds.length) expect(a.memberIds).toEqual(['m-son']);
    }
  });

  it('未回访的化解会生成回访提醒', () => {
    const withCure = {
      ...base,
      appliedCures: [{ id: 'c9', palace: 6 as const, wuXing: '金' as const, item: '铜葫芦', appliedOn: '2026-02-10' }],
    };
    const alerts = buildAlerts(withCure, 2026, 1, 3);
    const followup = alerts.find((a) => a.kind === '化解回访');
    expect(followup).toBeDefined();
    expect(followup!.body).toContain('铜葫芦');
  });
});

describe('化解回馈闭环', () => {
  it('用户回馈「明显改善」会实际下调该宫风险', () => {
    const base = sampleInput(2026);
    const cure = { id: 'c1', palace: 6 as const, wuXing: '金' as const, item: '六帝钱', appliedOn: '2026-01-01' };
    const noFeedback = synthesise({ ...base, appliedCures: [{ ...cure, effectiveness: '未评价' as const }] });
    const good = synthesise({ ...base, appliedCures: [{ ...cure, effectiveness: '明显改善' as const }] });
    const bad = synthesise({ ...base, appliedCures: [{ ...cure, effectiveness: '反而更差' as const }] });
    expect(good.palaces[6].score).toBeGreaterThan(bad.palaces[6].score);
    expect(good.palaces[6].score).toBeGreaterThanOrEqual(noFeedback.palaces[6].score);
  });
});
