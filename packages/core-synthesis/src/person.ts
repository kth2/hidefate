/**
 * 「这屋对我」与「全家今年」。
 *
 * 预测引擎的产物是「宫 × 维度」的条目；使用者想问的却是「这房子对我、对我太太、
 * 对孩子各有什么影响，今年各要注意什么」。本模块只做**重新组织**，不新算任何数字：
 * 所有概率都取自 `predict()` 里此人的个人概率（`probabilityFor`）。
 */

import {
  PALACE_DIRECTION,
  YOU_NIAN_META,
  crossPersonHouse,
  personalDirections,
  type PalaceIndex,
  type RiskDomain,
  type YouNianStar,
} from '@hidefate/core-fengshui';
import {
  ROLE_LABEL,
  ROLE_PALACE,
  assignFamilyRoles,
  domainReading,
  lifeStageOf,
  type FamilyRoleInfo,
  type LifeStage,
} from './family.js';
import { probabilityFor } from './predict.js';
import { isElevated, relativeDelta, type RelativeLevel } from './relative.js';
import type { Cure, Member, Prediction, RiskLevel, SynthesisResult } from './types.js';

/** 总览固定列。孩子的「事业」读作「学业」。 */
export const OVERVIEW_DOMAINS: readonly RiskDomain[] = ['健康', '意外', '事业', '财运', '感情'] as const;

/*
 * 「今年最该留意」看的是**比平常高出多少**（这间房子带来的影响），不是绝对百分比：
 * 孩子健康指数本来就高，按绝对值排，孩子永远排第一、成年人的真问题被挤掉。
 * 只有「偏高」以上才算（isElevated）；都没有就明说没有，不硬凑。
 */

export interface PersonDomainCell {
  readonly domain: RiskDomain;
  /** 对此人的叫法；不适用（孩子的财运）为 null。 */
  readonly label: string | null;
  /** 此人此维度今年的最高个人概率；无相关预测为 null。 */
  readonly probability: number | null;
  /** 同一条的「平常」概率。 */
  readonly neutral: number | null;
  /** 比平常高还是低（取此维度里比平常高出最多的那一条）。 */
  readonly relative: RelativeLevel | null;
  readonly top: Prediction | null;
}

export interface PersonRoomLine {
  readonly roomId: string;
  readonly label: string;
  readonly direction: string;
  readonly palace: PalaceIndex;
  /** 此方于其命卦的八宅星；中宫为 null。 */
  readonly personStar: YouNianStar | null;
  readonly auspicious: boolean | null;
  readonly palaceRisk: RiskLevel;
}

export interface PersonItem {
  readonly prediction: Prediction;
  readonly probability: number;
  readonly neutral: number;
  readonly relative: RelativeLevel;
  readonly label: string;
  readonly reading: string;
  readonly via: string;
}

export interface PersonView {
  readonly memberId: string;
  readonly name: string;
  readonly stage: LifeStage;
  readonly role: FamilyRoleInfo | null;
  readonly roleLabel: string | null;
  /** 六亲之宫今年的情况。 */
  readonly rolePalace: { palace: PalaceIndex; direction: string; riskLevel: RiskLevel; note: string } | null;
  readonly mingGua: string;
  readonly group: string;
  readonly rooms: readonly PersonRoomLine[];
  /** 还没指定此人住哪间。 */
  readonly unassigned: boolean;
  readonly bestDirections: readonly { star: string; direction: string }[];
  readonly worstDirections: readonly { star: string; direction: string }[];
  readonly domains: readonly PersonDomainCell[];
  readonly items: readonly PersonItem[];
  /** 此人该做的事：个人化解在前，再取其最高风险条目的化凶，去重，至多 5 条。 */
  readonly todo: readonly Cure[];
  /** 一句话。 */
  readonly summary: string;
}

function cellsFor(s: SynthesisResult, m: Member, stage: LifeStage): PersonDomainCell[] {
  return OVERVIEW_DOMAINS.map((domain) => {
    const reading = domainReading(domain, stage);
    if (!reading) return { domain, label: null, probability: null, neutral: null, relative: null, top: null };
    // 取比平常高出最多的一条 —— 那才是「房子对此人此事的影响」最大的地方
    let best: { p: Prediction; prob: number; neutral: number; relative: RelativeLevel; d: number } | null = null;
    for (const p of s.predictions) {
      if (p.domain !== domain) continue;
      const prob = probabilityFor(p, m.id);
      const pm = p.perMember.find((x) => x.memberId === m.id);
      if (prob == null || !pm) continue;
      const d = relativeDelta(prob, pm.neutral);
      if (!best || d > best.d) best = { p, prob, neutral: pm.neutral, relative: pm.relative, d };
    }
    return {
      domain,
      label: reading.label,
      probability: best?.prob ?? null,
      neutral: best?.neutral ?? null,
      relative: best?.relative ?? null,
      top: best?.p ?? null,
    };
  });
}

export function buildPersonView(s: SynthesisResult, members: readonly Member[], memberId: string): PersonView | null {
  const m = members.find((x) => x.id === memberId);
  if (!m) return null;
  const stage = lifeStageOf(m, s.year);
  const role = assignFamilyRoles(members, s.year).get(m.id) ?? null;
  const cells = crossPersonHouse(s.baZhai.houseGua, m.mingGua.gua as never);

  const rooms: PersonRoomLine[] = s.profile.rooms
    .filter((r) => r.occupants?.includes(m.id))
    .map((r) => {
      const p = r.primaryPalace;
      const star = p === 5 ? null : cells[p as Exclude<PalaceIndex, 5>].personStar;
      return {
        roomId: r.id,
        label: r.label ?? r.kind,
        direction: PALACE_DIRECTION[p],
        palace: p,
        personStar: star,
        auspicious: star ? YOU_NIAN_META[star].auspicious : null,
        palaceRisk: s.palaces[p].riskLevel,
      };
    });

  let rolePalace: PersonView['rolePalace'] = null;
  if (role) {
    const p = ROLE_PALACE[role.role];
    const a = s.palaces[p];
    const bits = [`今年评为「${a.riskLevel}」`];
    if (a.missing) bits.push(`有缺角（${a.missing.summary}）`);
    bits.push(`飞星「${a.combinationName}」`);
    rolePalace = {
      palace: p,
      direction: a.direction,
      riskLevel: a.riskLevel,
      note: `${a.direction}属后天八卦${ROLE_LABEL[role.role]}之位，${bits.join('，')}。此方的吉凶古法断为应在${m.name}身上，不论其睡在哪里。`,
    };
  }

  const items: PersonItem[] = s.predictions
    .map((p) => {
      const pm = p.perMember.find((x) => x.memberId === m.id);
      const prob = probabilityFor(p, m.id);
      if (!pm || prob == null) return null;
      return {
        prediction: p,
        probability: prob,
        neutral: pm.neutral,
        relative: pm.relative,
        label: pm.domainLabel,
        reading: pm.reading,
        via: pm.via,
      };
    })
    .filter((x): x is PersonItem => x != null)
    // 按「比平常高出多少」排，同档再按指数
    .sort((a, b) => relativeDelta(b.probability, b.neutral) - relativeDelta(a.probability, a.neutral) || b.probability - a.probability);

  const seen = new Set<string>();
  const todo: Cure[] = [];
  const push = (c: Cure) => {
    if (seen.has(c.action) || todo.length >= 5) return;
    seen.add(c.action);
    todo.push(c);
  };
  for (const it of items) for (const c of it.prediction.cures) if (c.memberId === m.id) push(c);
  for (const it of items.slice(0, 4)) for (const c of it.prediction.cures) if (!c.memberId) push(c);

  const dirs = personalDirections(m.mingGua.gua as never);
  const top = items[0];
  const parts: string[] = [];
  if (top && isElevated(top.relative)) {
    parts.push(
      `今年${m.name}最该留意${top.label}：${top.reading}的可能比平常${top.relative}` +
        `（来自${top.prediction.direction}${top.prediction.room ? `的${top.prediction.room}` : ''}）。`,
    );
  } else {
    parts.push(`今年这处房子没有让${m.name}哪一方面比平常明显偏高 —— 这是好消息，不是没算出来。`);
  }
  if (rooms.some((r) => r.auspicious === false)) {
    const bad = rooms.filter((r) => r.auspicious === false);
    parts.push(`${bad.map((r) => r.label).join('、')}落在其「${bad.map((r) => r.personStar).join('、')}」方，床头转向本人的四吉方可挽回大半。`);
  }
  if (rooms.length === 0) parts.push(`还没指定${m.name}住哪间，自己房间的影响还算不进来。`);

  return {
    memberId: m.id,
    name: m.name,
    stage,
    role,
    roleLabel: role ? ROLE_LABEL[role.role] : null,
    rolePalace,
    mingGua: `${m.mingGua.gua}${m.mingGua.number}命`,
    group: m.mingGua.group,
    rooms,
    unassigned: rooms.length === 0,
    bestDirections: dirs.best.map((d) => ({ star: d.star, direction: PALACE_DIRECTION[d.palace] })),
    worstDirections: dirs.worst.map((d) => ({ star: d.star, direction: PALACE_DIRECTION[d.palace] })),
    domains: cellsFor(s, m, stage),
    items,
    todo,
    summary: parts.join(''),
  };
}

export interface FamilyOverviewRow {
  readonly memberId: string;
  readonly name: string;
  readonly stage: LifeStage;
  readonly roleLabel: string | null;
  readonly cells: readonly PersonDomainCell[];
  /** 此人今年比平常高出最多的一项；没有偏高的为 null。 */
  readonly worst: { label: string; probability: number; relative: RelativeLevel } | null;
}

/** 全家今年：成员 × 领域。 */
export function familyOverview(s: SynthesisResult, members: readonly Member[]): FamilyOverviewRow[] {
  const roles = assignFamilyRoles(members, s.year);
  return members.map((m) => {
    const stage = lifeStageOf(m, s.year);
    const cells = cellsFor(s, m, stage);
    const hi = cells
      .filter((c) => c.probability != null && c.neutral != null && c.label)
      .sort((a, b) => relativeDelta(b.probability!, b.neutral!) - relativeDelta(a.probability!, a.neutral!))[0];
    const role = roles.get(m.id);
    return {
      memberId: m.id,
      name: m.name,
      stage,
      roleLabel: role ? ROLE_LABEL[role.role] : null,
      cells,
      worst: hi && isElevated(hi.relative) ? { label: hi.label!, probability: hi.probability!, relative: hi.relative! } : null,
    };
  });
}
