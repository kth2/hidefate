/**
 * 怎么分房最好 —— 把全家的卧房分配方式都试一遍，找出房子对全家影响最小的那一种。
 *
 * 前面所有功能都在回答「问题在哪」；最直接的解法往往不是摆件，而是**换个房间睡**。
 * 八宅本来就讲「人各有其吉方」：同一间房，对这个人是六煞，对那个人可能是生气。
 *
 * 规矩：
 *   - 只调**卧房**（睡觉的地方影响最深）；书房、座位不动
 *   - 现在同住一间的人（夫妻）当作一组，不拆开
 *   - 没被指定卧房的人不硬塞进去 —— 我们不替人发明睡觉的地方
 *   - 房间容量：现在住几人就容几人；空房主卧容两人，其余空房容一人
 *   - 目标：全家负担之和最小。每人的负担 = **高出平常最多的那一项**（看每个人最严重的问题）。
 *     不把各项相加，哪怕只给其余项小权重也不行：各宫所主之事不同，孩子不计财运人丁，
 *     相加会让「凶事多半不适用于孩子」的宫看起来对孩子更好 ——
 *     实测曾因此建议把孩子搬进全宅最凶、有缺角的西北。
 *     同分时选搬动最少的方案 —— 能不搬就不搬
 *
 * 宫位吉凶与谁住无关，所以合参只算一次；每种分法只重算预测。
 */

import { ROOM_META, type PropertyProfile, type RoomPlacement } from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { predict, probabilityFor } from './predict.js';
import { relativeDelta, relativeLevel, type RelativeLevel } from './relative.js';
import type { AnalysisInput, Member, Prediction, SynthesisResult } from './types.js';

/** 一次最多试这么多种分法，超过就只报「房间太多，不自动排」。 */
export const MAX_PLANS = 50_000;
/** 每搬动一组人加的罚分 —— 同分时宁可不搬。 */
const MOVE_PENALTY = 0.05;


export interface PersonBurden {
  readonly memberId: string;
  readonly name: string;
  /** 负担：高出平常最多的那一项（logit 差；不高于平常则为 0）。 */
  readonly burden: number;
  /** 高出最多的一项。 */
  readonly worst: { label: string; relative: RelativeLevel; where: string } | null;
  /** 睡哪间。 */
  readonly bedroom: string | null;
}

export interface RoomMove {
  readonly names: readonly string[];
  readonly from: string;
  readonly to: string;
}

export interface RoomPlanResult {
  /** 能不能排：卧房少于两间、没有人被指定卧房、或组合太多时为 false。 */
  readonly feasible: boolean;
  readonly reason: string;
  readonly current: readonly PersonBurden[];
  readonly best: readonly PersonBurden[];
  readonly moves: readonly RoomMove[];
  /** 全家高出平常之和：现在 → 最好。 */
  readonly totalBefore: number;
  readonly totalAfter: number;
  /** 最好方案的房间分配（room.id → 成员 id），套用时写回 occupants。 */
  readonly assignment: Readonly<Record<string, readonly string[]>>;
  /** 没被指定卧房、因此不参与排的人。 */
  readonly skipped: readonly string[];
}

const isBedroom = (r: RoomPlacement) => ROOM_META[r.kind].category === '卧房';
const label = (r: RoomPlacement) => r.label ?? r.kind;

function burdens(preds: readonly Prediction[], members: readonly Member[], profile: PropertyProfile): PersonBurden[] {
  return members.map((m) => {
    let worst: { d: number; label: string; relative: RelativeLevel; where: string } | null = null;
    for (const p of preds) {
      const prob = probabilityFor(p, m.id);
      const pm = p.perMember.find((x) => x.memberId === m.id);
      if (prob == null || !pm) continue;
      const d = relativeDelta(prob, pm.neutral);
      if (!worst || d > worst.d) {
        worst = { d, label: pm.domainLabel, relative: relativeLevel(prob, pm.neutral), where: `${p.direction}${p.room ? `·${p.room}` : ''}` };
      }
    }
    const burden = worst && worst.d > 0 ? worst.d : 0;
    const bed = profile.rooms.find((r) => isBedroom(r) && r.occupants?.includes(m.id));
    return {
      memberId: m.id,
      name: m.name,
      burden,
      worst: worst && worst.d > 0 ? { label: worst.label, relative: worst.relative, where: worst.where } : null,
      bedroom: bed ? label(bed) : null,
    };
  });
}

/** 把「组 → 房」写回 profile（非卧房的 occupants 不动）。 */
function withAssignment(
  profile: PropertyProfile,
  groups: readonly (readonly string[])[],
  rooms: readonly RoomPlacement[],
  pick: readonly number[],
): PropertyProfile {
  const inBed = new Set(groups.flat());
  const byRoom = new Map<string, string[]>();
  pick.forEach((ri, gi) => byRoom.set(rooms[ri]!.id, [...(byRoom.get(rooms[ri]!.id) ?? []), ...groups[gi]!]));
  return {
    ...profile,
    rooms: profile.rooms.map((r) => {
      if (!isBedroom(r)) return r;
      const others = (r.occupants ?? []).filter((id) => !inBed.has(id));
      return { ...r, occupants: [...others, ...(byRoom.get(r.id) ?? [])] };
    }),
  };
}

/**
 * 合参结果里每宫缓存了一份房间清单（含 occupants），预测读的是它而不是 profile。
 * 换了分房，要把每宫的房间换成新 profile 里的同一间，否则换了等于没换。
 */
function withRooms(s: SynthesisResult, profile: PropertyProfile): SynthesisResult {
  const byId = new Map(profile.rooms.map((r) => [r.id, r]));
  const palaces = Object.fromEntries(
    Object.entries(s.palaces).map(([k, a]) => [k, { ...a, rooms: a.rooms.map((r) => byId.get(r.id) ?? r) }]),
  ) as unknown as SynthesisResult['palaces'];
  return { ...s, profile, palaces };
}

export function planRooms(input: AnalysisInput): RoomPlanResult {
  const { profile, members } = input;
  const bedrooms = profile.rooms.filter(isBedroom);
  const s = synthesise(input);
  const currentPreds = predict(input, s);
  const current = burdens(currentPreds, members, profile);
  const totalBefore = current.reduce((a, b) => a + b.burden, 0);

  // 现在同住一间的人为一组
  const groupsByRoom = new Map<string, string[]>();
  for (const r of bedrooms) {
    const ids = (r.occupants ?? []).filter((id) => members.some((m) => m.id === id));
    if (ids.length) groupsByRoom.set(r.id, ids);
  }
  const groups = [...groupsByRoom.values()];
  const assigned = new Set(groups.flat());
  const skipped = members.filter((m) => !assigned.has(m.id)).map((m) => m.name);

  const infeasible = (reason: string): RoomPlanResult => ({
    feasible: false,
    reason,
    current,
    best: current,
    moves: [],
    totalBefore,
    totalAfter: totalBefore,
    assignment: Object.fromEntries(bedrooms.map((r) => [r.id, r.occupants ?? []])),
    skipped,
  });

  if (bedrooms.length < 2) return infeasible('只有一间卧房，没有可调的余地。');
  if (groups.length === 0) return infeasible('还没有人被指定住哪间卧房 —— 先到成员页指定，才能比较怎么分最好。');

  const capacity = bedrooms.map((r) => {
    const n = groupsByRoom.get(r.id)?.length ?? 0;
    return n > 0 ? n : r.kind === '主卧' ? 2 : 1;
  });
  const currentRoomOfGroup = groups.map((g) => bedrooms.findIndex((r) => groupsByRoom.get(r.id) === g));

  // 枚举：每组选一间容量够、且尚未被占的房
  const plans: number[][] = [];
  const used = new Array<boolean>(bedrooms.length).fill(false);
  const cur: number[] = [];
  let overflow = false;
  const walk = (gi: number) => {
    if (overflow) return;
    if (gi === groups.length) {
      plans.push([...cur]);
      if (plans.length > MAX_PLANS) overflow = true;
      return;
    }
    for (let ri = 0; ri < bedrooms.length; ri++) {
      if (used[ri] || capacity[ri]! < groups[gi]!.length) continue;
      used[ri] = true;
      cur.push(ri);
      walk(gi + 1);
      cur.pop();
      used[ri] = false;
    }
  };
  walk(0);
  if (overflow) return infeasible('卧房与人数组合太多，不自动排；可以在模拟里手动试。');

  let bestPick = currentRoomOfGroup;
  let bestScore = totalBefore;
  let bestPreds = currentPreds;
  for (const pick of plans) {
    const moved = pick.filter((ri, gi) => ri !== currentRoomOfGroup[gi]).length;
    if (moved === 0) continue;
    const p2 = withAssignment(profile, groups, bedrooms, pick);
    const preds = predict({ ...input, profile: p2 }, withRooms(s, p2));
    const total = burdens(preds, members, p2).reduce((a, b) => a + b.burden, 0);
    if (total + moved * MOVE_PENALTY < bestScore - 1e-9) {
      bestScore = total + moved * MOVE_PENALTY;
      bestPick = pick;
      bestPreds = preds;
    }
  }

  const bestProfile = withAssignment(profile, groups, bedrooms, bestPick);
  const best = burdens(bestPreds, members, bestProfile);
  const moves: RoomMove[] = groups
    .map((g, gi) => ({ g, from: currentRoomOfGroup[gi]!, to: bestPick[gi]! }))
    .filter((x) => x.from !== x.to)
    .map((x) => ({
      names: x.g.map((id) => members.find((m) => m.id === id)!.name),
      from: label(bedrooms[x.from]!),
      to: label(bedrooms[x.to]!),
    }));

  return {
    feasible: true,
    reason: moves.length === 0 ? '现在的分房已经是这几间卧房里最好的一种。' : `调整 ${moves.length} 处，全家受房子的不利影响会减少。`,
    current,
    best,
    moves,
    totalBefore,
    totalAfter: best.reduce((a, b) => a + b.burden, 0),
    assignment: Object.fromEntries(
      bestProfile.rooms.filter(isBedroom).map((r) => [r.id, r.occupants ?? []]),
    ),
    skipped,
  };
}
