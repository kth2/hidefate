/**
 * 独立参照对拍 harness（第零期 B）。
 *
 * 读 reference/transcribed（网页转录）、reference/book-pending（书例，须人工抄录）、
 * reference/derived（独立重实现），用引擎逐案计算，产出差异清单。
 *
 * 纪律：
 *   1. 期望值一律来自 reference/，**从不由引擎产生**；引擎输出只写进 reference/observed/。
 *   2. 只有 `review.status === 'reviewed'` 的案例才是会失败的回归测试。
 *      未审核的案例只进差异报告，不阻挡任何改动 —— 未审的「期望值」本身可能是错的。
 *   3. `REFERENCE_WRITE=1` 时把 observed/ 与差异报告写回磁盘；平时只在内存里比对。
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALACE_INDEXES, type PalaceIndex } from './constants.js';
import { MOUNTAINS, analyzeLine, degreeToMountain } from './mountains.js';
import { annualStar, liChunOf, monthlyStar, periodOfYear } from './period.js';
import { buildFlyingStarChart, flyFrom, type FlyingStarChart } from './flyingStar.js';
import { assessGeJu } from './geju.js';
import { resolveSchool } from './school.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'reference');

type Json = Record<string, any>;

function readDir(sub: string): Json[] {
  const d = join(ROOT, sub);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((f) => f.endsWith('.json') && f !== 'TEMPLATE.json')
    .map((f) => ({ __file: `${sub}/${f}`, ...JSON.parse(readFileSync(join(d, f), 'utf8')) }));
}

export interface Discrepancy {
  readonly caseId: string;
  readonly check: string;
  readonly expected: unknown;
  readonly observed: unknown;
  readonly reviewStatus: string;
}

function dirOf(plate: Record<PalaceIndex, PalaceIndex>): '顺' | '逆' {
  const c = plate[5];
  return plate[6] === (c === 9 ? 1 : c + 1) ? '顺' : '逆';
}

function chartFor(input: Json): FlyingStarChart {
  return buildFlyingStarChart({ sitting: input.sitting, period: input.period, useTiXing: Boolean(input.useTiXing) });
}

function snapshot(c: FlyingStarChart) {
  const plate = (p: Record<PalaceIndex, PalaceIndex>) => Object.fromEntries(PALACE_INDEXES.map((k) => [String(k), p[k]]));
  return {
    period: c.period.period,
    sitting: c.sitting.mountain.name,
    facing: c.facing.mountain.name,
    usedTiXing: c.usedTiXing,
    pattern: c.pattern,
    shanCenter: c.shanPan[5],
    shanDir: dirOf(c.shanPan),
    xiangCenter: c.xiangPan[5],
    xiangDir: dirOf(c.xiangPan),
    yun: plate(c.yunPan),
    shan: plate(c.shanPan),
    xiang: plate(c.xiangPan),
    derivation: c.derivation,
  };
}

/** 逐案比对；返回差异与引擎输出（供 observed/）。 */
function runAll() {
  const out: Discrepancy[] = [];
  const observed: Json[] = [];
  const push = (caseId: string, reviewStatus: string, check: string, expected: unknown, observedV: unknown) => {
    if (JSON.stringify(expected) !== JSON.stringify(observedV)) out.push({ caseId, check, expected, observed: observedV, reviewStatus });
  };

  // ---- 网页转录 / 书例 ----
  for (const t of [...readDir('transcribed'), ...readDir('book-pending')]) {
    const rs: string = t.review?.status ?? 'unreviewed';
    const exp = t.expected ?? {};
    if ((exp.chart || exp.assertions) && t.input?.sitting) {
      const c = chartFor(t.input);
      const snap = snapshot(c);
      const geju = assessGeJu(c, 2026).items;
      observed.push({ caseId: t.id, engine: snap, geju: geju.map((g) => ({ kind: g.kind, scope: g.scope })) });
      if (exp.intermediate) {
        for (const k of ['shanCenter', 'shanDir', 'xiangCenter', 'xiangDir'] as const) {
          if (exp.intermediate[k] != null) push(t.id, rs, `intermediate.${k}`, exp.intermediate[k], (snap as Json)[k]);
        }
      }
      if (exp.chart) {
        for (const p of PALACE_INDEXES) {
          const e = exp.chart[String(p)];
          if (!e) continue;
          push(t.id, rs, `chart.${p}`, [e.yun, e.shan, e.xiang], [snap.yun[String(p)], snap.shan[String(p)], snap.xiang[String(p)]]);
        }
      }
      for (const a of exp.assertions ?? []) {
        const [kind, arg, arg2] = String(a.path).split(':');
        if (/^(shan|xiang)\.\d$/.test(a.path)) {
          const [plate, p] = a.path.split('.');
          push(t.id, rs, a.path, a.equals, (snap as Json)[plate!][p!]);
        } else if (kind === 'set') {
          push(t.id, rs, a.path, [...a.equals].sort(), [snap.shan[arg!], snap.xiang[arg!]].sort());
        } else if (kind === 'geju' && arg === '伏吟') {
          push(t.id, rs, a.path, a.equals, geju.some((g) => g.kind.includes('伏吟')));
        } else if (kind === 'geju' && arg === '全盘伏吟') {
          push(t.id, rs, a.path, a.equals, geju.some((g) => g.scope === '全盘' && g.kind.includes('伏吟')));
        } else if (kind === 'pattern') {
          const pc = buildFlyingStarChart({ sitting: arg!, period: t.input.period, useTiXing: false });
          push(t.id, rs, a.path, a.equals, pc.pattern);
        } else if (kind === 'geju-any') {
          const pc = buildFlyingStarChart({ sitting: arg!, period: t.input.period, useTiXing: false });
          push(t.id, rs, a.path, a.equals, assessGeJu(pc, 2026).items.some((g) => g.kind.includes(arg2!)));
        }
      }
    }
    if (exp.assertions && !t.input?.sitting) {
      for (const a of exp.assertions) {
        const [kind, arg, arg2] = String(a.path).split(':');
        const pc = buildFlyingStarChart({ sitting: arg!, period: t.input.period, useTiXing: false });
        if (kind === 'pattern') push(t.id, rs, a.path, a.equals, pc.pattern);
        if (kind === 'geju-any') push(t.id, rs, a.path, a.equals, assessGeJu(pc, 2026).items.some((g) => g.kind.includes(arg2!)));
      }
    }
    if (exp.wangShanWangXiang) {
      for (let period = 1; period <= 9; period++) {
        const eng = MOUNTAINS.filter(
          (m) => buildFlyingStarChart({ sitting: m.name, period: period as PalaceIndex, useTiXing: false }).pattern === '旺山旺向',
        ).map((m) => `${m.name}${MOUNTAINS[(MOUNTAINS.indexOf(m) + 12) % 24]!.name}`);
        const src: string[] = exp.wangShanWangXiang[String(period)] ?? [];
        push(t.id, rs, `旺山旺向.${period}运.仅来源有`, [], src.filter((x) => !eng.includes(x)));
        push(t.id, rs, `旺山旺向.${period}运.仅引擎有`, [], eng.filter((x) => !src.includes(x)));
      }
    }
    if (exp.forward8) {
      const f = flyFrom(8, '顺');
      const b = flyFrom(8, '逆');
      for (const p of PALACE_INDEXES) {
        push(t.id, rs, `顺飞.${p}`, exp.forward8[String(p)], f[p]);
        push(t.id, rs, `逆飞.${p}`, exp.backward8[String(p)], b[p]);
      }
    }
    if (exp.annual) for (const [y, s] of Object.entries(exp.annual)) push(t.id, rs, `年星.${y}`, s, annualStar(Number(y)));
    if (exp.monthlyFirstByZhi) {
      const yearOf: Record<string, number> = { 子午卯酉: 2026, 辰戌丑未: 2027, 寅申巳亥: 2028 };
      for (const [g, s] of Object.entries(exp.monthlyFirstByZhi)) push(t.id, rs, `月星正月.${g}`, s, monthlyStar(yearOf[g]!, 1));
    }
    if (exp.yinYangPattern) {
      for (const m of MOUNTAINS) {
        const group = m.palace % 2 === 1 ? exp.yinYangPattern.odd : exp.yinYangPattern.even;
        const pos = ['地元', '天元', '人元'].indexOf(m.yuan);
        push(t.id, rs, `阴阳.${m.name}`, group[pos], m.yinYang);
      }
      const [lo, hi] = exp.renRange as [number, number];
      push(t.id, rs, '边界.337.5°（来源：不属壬）', '亥', degreeToMountain(lo - 0.1).name);
      push(t.id, rs, `边界.${hi}°（来源：属壬）`, '壬', degreeToMountain(hi).name);
      push(t.id, rs, '元运.2006', exp.periodOf2006, periodOfYear(2006).period);
    }
    if (exp.liChunUtcMinute) push(t.id, rs, '立春(UTC,分)', exp.liChunUtcMinute, liChunOf(t.input.year).toISOString().slice(0, 16) + 'Z');
    if (exp.liChunDateUtc8) {
      const d = new Date(liChunOf(t.input.year).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
      push(t.id, rs, '立春日期(UTC+8)', exp.liChunDateUtc8, d);
    }
    if (exp.schoolNote) {
      // 引擎能否表达「完全不用替卦」？门派设置的兼向阈值夹在 2°–4.5°，过阈值必替。
      const canDisable = resolveSchool({ jianThreshold: 99 }).jianThreshold >= 7.5;
      push(t.id, rs, '门派选项.可关闭替卦', !exp.schoolNote.usesTiXing, canDisable);
    }
  }

  // ---- 独立重实现 ----
  const derived = existsSync(join(ROOT, 'derived', 'charts.json'))
    ? JSON.parse(readFileSync(join(ROOT, 'derived', 'charts.json'), 'utf8'))
    : { cases: [], meta: {} };
  for (const d of derived.cases as Json[]) {
    const rs = derived.meta?.review?.status ?? 'unreviewed';
    if (d.expected.shan == null || d.expected.xiang == null) continue;
    const snap = snapshot(chartFor(d.input));
    observed.push({ caseId: d.id, engine: snap });
    for (const k of ['shanCenter', 'shanDir', 'xiangCenter', 'xiangDir'] as const) {
      if (d.expected.intermediate[k] != null) push(d.id, rs, `intermediate.${k}`, d.expected.intermediate[k], (snap as Json)[k]);
    }
    for (const p of PALACE_INDEXES) {
      push(d.id, rs, `chart.${p}`, [d.expected.yun[p], d.expected.shan[p], d.expected.xiang[p]], [snap.yun[String(p)], snap.shan[String(p)], snap.xiang[String(p)]]);
    }
  }
  const stars = existsSync(join(ROOT, 'derived', 'stars.json')) ? JSON.parse(readFileSync(join(ROOT, 'derived', 'stars.json'), 'utf8')) : null;
  if (stars) {
    for (const [y, s] of Object.entries(stars.annual)) push('D-STARS', 'unreviewed', `年星.${y}`, s, annualStar(Number(y)));
    for (const [k, s] of Object.entries(stars.monthly)) {
      const [y, m] = k.split('-').map(Number);
      push('D-STARS', 'unreviewed', `月星.${k}`, s, monthlyStar(y!, m!));
    }
  }
  const bounds = existsSync(join(ROOT, 'derived', 'boundaries.json')) ? JSON.parse(readFileSync(join(ROOT, 'derived', 'boundaries.json'), 'utf8')) : null;
  if (bounds) {
    for (const [deg, name] of Object.entries(bounds.degreeToMountain)) push('D-BOUNDS', 'unreviewed', `山.${deg}°`, name, degreeToMountain(Number(deg)).name);
    for (const [y, p] of Object.entries(bounds.periodOfYear)) push('D-BOUNDS', 'unreviewed', `元运.${y}`, p, periodOfYear(Number(y)).period);
  }

  // ---- 内部一致性（不是参照，是规格缺口探测）----
  // 立线判定说「空亡、不起替」时，排盘是否也没起替？两者对不上，使用者看到的结论与盘面就自相矛盾。
  for (let tenth = 0; tenth < 3600; tenth++) {
    const deg = tenth / 10;
    const line = analyzeLine(deg, 3);
    const c = buildFlyingStarChart({ sitting: deg, period: 9 });
    if (line.useTiXing !== c.usedTiXing) {
      push('I-LINE', 'internal', `立线与排盘.${deg.toFixed(1)}°.${line.grade}`, line.useTiXing, c.usedTiXing);
    }
  }

  return { discrepancies: out, observed };
}

describe('独立参照（第零期 B）', () => {
  const { discrepancies, observed } = runAll();

  if (process.env.REFERENCE_WRITE === '1') {
    writeFileSync(join(ROOT, 'observed', 'engine-outputs.json'), JSON.stringify({ note: '引擎输出，由 harness 生成，勿手改。', outputs: observed }, null, 1));
    writeFileSync(join(ROOT, 'observed', 'discrepancies.json'), JSON.stringify({ note: '引擎与参照的全部差异，由 harness 生成，勿手改。', count: discrepancies.length, discrepancies }, null, 1));
  }

  it('参照数据格式：转录与书例都注明出处与审核状态', () => {
    for (const t of [...readDir('transcribed'), ...readDir('book-pending')]) {
      expect(t.source?.title, `${t.__file} 缺来源标题`).toBeTruthy();
      expect(t.source?.url || t.source?.page, `${t.__file} 缺网址或页码`).toBeTruthy();
      expect(t.review?.status, `${t.__file} 缺审核状态`).toMatch(/^(unreviewed|reviewed|disputed)$/);
      expect(JSON.stringify(t), `${t.__file} 不得含引擎生成标记`).not.toMatch(/generatedBy.*engine/i);
    }
  });

  it('只有已审核的案例构成回归测试；已审核者不得有差异', () => {
    const reviewedFailures = discrepancies.filter((d) => d.reviewStatus === 'reviewed');
    expect(reviewedFailures).toEqual([]);
  });
});
