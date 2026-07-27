/**
 * 家庭八字 × 宅盘 融合报告。
 *
 * 回答四个问题：
 *   1. 这间房子最帮谁、最克谁？
 *   2. 每个人最好与最差的房间是哪一间？
 *   3. 哪几年某人与这间房子冲突最烈？
 *   4. 全家与这间房的整体契合度是多少？
 */

import {
  OUTER_PALACES,
  PALACE_DIRECTION,
  ROOM_PRIORITY,
  YOU_NIAN_META,
  crossPersonHouse,
  personalDirections,
  type PalaceIndex,
} from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { predict } from './predict.js';
import type { AnalysisInput, Member, SynthesisResult } from './types.js';

export interface MemberFit {
  readonly memberId: string;
  readonly name: string;
  readonly relation: string | null;
  readonly mingGua: string;
  readonly group: '东四命' | '西四命';
  /** 宅命契合度 0–100。 */
  readonly fitScore: number;
  readonly verdict: '极相宜' | '相宜' | '中性' | '不宜' | '极不宜';
  /** 最宜的房间（含理由）。 */
  readonly bestRooms: readonly { roomId: string; label: string; direction: string; reason: string }[];
  /** 最忌的房间。 */
  readonly worstRooms: readonly { roomId: string; label: string; direction: string; reason: string }[];
  /** 该人的四吉方（依命卦）。 */
  readonly auspiciousDirections: readonly { star: string; direction: string }[];
  readonly inauspiciousDirections: readonly { star: string; direction: string }[];
  /** 八字资料完整度说明。 */
  readonly dataNote: string;
  readonly narrative: string;
}

export interface ConflictYear {
  readonly year: number;
  readonly memberId: string;
  readonly name: string;
  readonly risk: number;
  readonly reason: string;
}

export interface FamilyFusionReport {
  readonly propertyName: string;
  readonly year: number;
  /** 全家整体契合度 0–100。 */
  readonly familyFitScore: number;
  readonly familyVerdict: string;
  readonly members: readonly MemberFit[];
  /** 最受益者与最受损者。 */
  readonly mostHelped: MemberFit | null;
  readonly mostHarmed: MemberFit | null;
  /** 未来数年的高冲突年份。 */
  readonly conflictYears: readonly ConflictYear[];
  /** 房间分配建议（谁该住哪间）。 */
  readonly roomAssignmentAdvice: readonly string[];
  readonly summary: string;
}

function verdictOf(score: number): MemberFit['verdict'] {
  if (score >= 72) return '极相宜';
  if (score >= 58) return '相宜';
  if (score >= 44) return '中性';
  if (score >= 30) return '不宜';
  return '极不宜';
}

/** 单一成员与本宅的契合度。 */
export function memberFit(s: SynthesisResult, m: Member): MemberFit {
  const cells = crossPersonHouse(s.baZhai.houseGua, m.mingGua.gua as never);

  // 契合度：以「实际有房间的宫位」加权，而非八方平均 —— 人不住的地方不该拉分。
  let numer = 0;
  let denom = 0;
  for (const p of OUTER_PALACES) {
    const rooms = s.profile.rooms.filter((r) => r.primaryPalace === p);
    const w = rooms.length ? Math.max(...rooms.map((r) => ROOM_PRIORITY[r.kind])) : 0.25;
    const cell = cells[p as Exclude<PalaceIndex, 5>];
    // cell.score ∈ [-6, 6]；再叠加该宫飞星综合分
    const combined = (cell.score / 6) * 0.6 + s.palaces[p].score * 0.4;
    numer += combined * w;
    denom += w;
  }
  const fitScore = Math.round(Math.max(0, Math.min(100, ((denom ? numer / denom : 0) + 1) * 50)));

  const scored = s.profile.rooms.map((r) => {
    const p = r.primaryPalace;
    const cell = p === 5 ? null : cells[p as Exclude<PalaceIndex, 5>];
    const combined = (cell ? cell.score / 6 : 0) * 0.6 + s.palaces[p].score * 0.4;
    return {
      roomId: r.id,
      label: r.label ?? r.kind,
      direction: PALACE_DIRECTION[p],
      score: combined,
      reason: cell
        ? `宅得「${cell.houseStar}」、${m.name}命得「${cell.personStar}」（${YOU_NIAN_META[cell.personStar].governs}），飞星成「${s.palaces[p].combinationName}」。`
        : `中宫，不入八宅论断；飞星成「${s.palaces[p].combinationName}」。`,
    };
  }).sort((a, b) => b.score - a.score);

  const dirs = personalDirections(m.mingGua.gua as never);
  const es = m.chart.elementStrength;
  const dataNote =
    m.chart.precision === '四柱全'
      ? '八字四柱俱全，个人化结论置信度高。'
      : `${m.chart.confidence.label} —— ${m.chart.confidence.reason}命卦部分完全不受影响，八宅方位建议照常有效。`;

  return {
    memberId: m.id,
    name: m.name,
    relation: m.relation ?? null,
    mingGua: `${m.mingGua.gua}${m.mingGua.number}`,
    group: m.mingGua.group,
    fitScore,
    verdict: verdictOf(fitScore),
    bestRooms: scored.slice(0, 2).map(({ roomId, label, direction, reason }) => ({ roomId, label, direction, reason })),
    worstRooms: scored.slice(-2).reverse().map(({ roomId, label, direction, reason }) => ({ roomId, label, direction, reason })),
    auspiciousDirections: dirs.best.map((d) => ({ star: d.star, direction: PALACE_DIRECTION[d.palace] })),
    inauspiciousDirections: dirs.worst.map((d) => ({ star: d.star, direction: PALACE_DIRECTION[d.palace] })),
    dataNote,
    narrative:
      `${m.name}（${m.mingGua.gua}${m.mingGua.number}命·${m.mingGua.group}）与本宅（${s.baZhai.label}）` +
      `${m.mingGua.group.startsWith(s.baZhai.group.charAt(0)) ? '宅命同组，先天相配' : '宅命异组，先天略有拉扯'}，契合度 ${fitScore}/100，判「${verdictOf(fitScore)}」。` +
      `其四吉方为${dirs.best.map((d) => `${PALACE_DIRECTION[d.palace]}(${d.star})`).join('、')}；` +
      `四凶方为${dirs.worst.map((d) => `${PALACE_DIRECTION[d.palace]}(${d.star})`).join('、')}。` +
      (es.dayMasterElement ? `八字日主${es.dayMasterElement}、${es.verdict}，喜${es.favourable.join('')}忌${es.unfavourable.join('')}。` : '') +
      dataNote,
  };
}

/** 生成完整家庭融合报告。 */
export function buildFamilyFusionReport(
  input: Omit<AnalysisInput, 'year'>,
  year: number,
  /** 冲突年扫描跨度，默认 10 年。 */
  conflictSpan = 10,
): FamilyFusionReport {
  const s = synthesise({ ...input, year });
  const fits = input.members.map((m) => memberFit(s, m));

  const familyFitScore = fits.length
    ? Math.round(fits.reduce((a, f) => a + f.fitScore, 0) / fits.length)
    : Math.round((s.overallScore + 1) * 50);

  const sortedFits = [...fits].sort((a, b) => b.fitScore - a.fitScore);

  // 冲突年扫描
  const conflictYears: ConflictYear[] = [];
  for (let i = 0; i < conflictSpan; i++) {
    const y = year + i;
    const yi: AnalysisInput = { ...input, year: y };
    const sy = synthesise(yi);
    const preds = predict(yi, sy);
    for (const m of input.members) {
      const mine = preds.filter((p) => p.memberIds.includes(m.id));
      if (mine.length === 0) continue;
      const worst = mine.reduce((a, b) => (b.probability > a.probability ? b : a));
      if (worst.probability >= 0.55) {
        conflictYears.push({
          year: y,
          memberId: m.id,
          name: m.name,
          risk: worst.probability,
          reason: `${worst.direction}${worst.room ? `的${worst.room}` : ''}：${worst.headline}`,
        });
      }
    }
  }
  conflictYears.sort((a, b) => b.risk - a.risk || a.year - b.year);

  // 房间分配建议：把每间关键房间配给最合适的人
  const advice: string[] = [];
  const keyRooms = s.profile.rooms
    .filter((r) => ROOM_PRIORITY[r.kind] >= 0.5)
    .sort((a, b) => ROOM_PRIORITY[b.kind] - ROOM_PRIORITY[a.kind]);
  for (const room of keyRooms) {
    const ranked = fits
      .map((f) => {
        const hit = [...f.bestRooms, ...f.worstRooms].find((r) => r.roomId === room.id);
        const p = room.primaryPalace;
        const cells = crossPersonHouse(s.baZhai.houseGua, input.members.find((m) => m.id === f.memberId)!.mingGua.gua as never);
        const cell = p === 5 ? null : cells[p as Exclude<PalaceIndex, 5>];
        return { f, score: cell ? cell.score : 0, hit };
      })
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (!best) continue;
    if (ranked.length === 1) {
      advice.push(`「${room.label ?? room.kind}」（${PALACE_DIRECTION[room.primaryPalace]}）：${best.f.name} 于此得${best.score >= 1 ? '吉' : best.score <= -1 ? '凶' : '平'}，${best.score <= -1 ? '建议另择四吉方' : '可用'}。`);
    } else if (best.score !== worst!.score) {
      advice.push(
        `「${room.label ?? room.kind}」（${PALACE_DIRECTION[room.primaryPalace]}）最宜 ${best.f.name}（${best.f.mingGua}命，得吉）；` +
        `最忌 ${worst!.f.name}（${worst!.f.mingGua}命，得凶）—— 若目前正是 ${worst!.f.name} 使用，建议与 ${best.f.name} 对调。`,
      );
    }
  }

  const helped = sortedFits[0] ?? null;
  const harmed = sortedFits.length > 1 ? sortedFits[sortedFits.length - 1]! : null;

  return {
    propertyName: s.profile.name,
    year,
    familyFitScore,
    familyVerdict: verdictOf(familyFitScore),
    members: fits,
    mostHelped: helped,
    mostHarmed: harmed,
    conflictYears: conflictYears.slice(0, 12),
    roomAssignmentAdvice: advice,
    summary:
      `${s.profile.name}（${s.baZhai.label}，${s.flyingStar.period.label}，${s.flyingStar.pattern}）与全家契合度 ${familyFitScore}/100，判「${verdictOf(familyFitScore)}」。` +
      (helped ? `最受本宅助益者：${helped.name}（${helped.mingGua}命，${helped.fitScore}/100）。` : '') +
      (harmed && harmed.memberId !== helped?.memberId ? `最受本宅压制者：${harmed.name}（${harmed.mingGua}命，${harmed.fitScore}/100），应优先为其调整房间与床向。` : '') +
      (conflictYears.length
        ? `未来 ${conflictSpan} 年内需重点留意：${conflictYears.slice(0, 3).map((c) => `${c.year} 年 ${c.name}`).join('、')}。`
        : `未来 ${conflictSpan} 年内无高冲突年份。`),
  };
}
