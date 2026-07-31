/**
 * 动气 —— 「星要动才应」。
 *
 * ## 为什么必须有这一层
 *
 * 同一颗五黄，飞到你天天进出的大门，和飞到一年不开一次的储藏室，
 * 是两回事。玄空实务里这是常识，但做成软件时极容易漏掉 ——
 * 漏掉之后，每一宫的凶星都被同等对待，报出来的东西既不具体也不可信。
 *
 * 判据不必玄：**这一宫有没有人在动**。
 * 大门、主卧、厨房、常走的通道是动；储藏、走廊尽头、闲置房是静。
 * `ROOM_META.priority` 本来就是按「这间房对宅运的分量」定的，
 * 拿来当动气强度正好，不必另立一套数。
 *
 * ## 一条纪律
 *
 * 无动气不等于无凶，只等于**不应期**。
 * 故本模块只调制「何时应」，不调制「凶不凶」——
 * 后者是宅盘的事，本来就该照实报。
 */

import { ROOM_META, type RoomKind, type RoomPlacement } from './property.js';
import type { PalaceIndex } from './constants.js';

/** 动气强度分档。 */
export type DongQiLevel = '强' | '中' | '弱' | '无';

export interface DongQiInfo {
  readonly palace: PalaceIndex;
  readonly level: DongQiLevel;
  /** 0–1，取该宫诸房间中最强者。 */
  readonly strength: number;
  /** 造成动气的房间（按强度降序）。 */
  readonly sources: readonly { kind: RoomKind; label: string | null; strength: number }[];
  /** 给人看的一句话。 */
  readonly note: string;
}

/**
 * 额外动气：装修动土。
 *
 * 古法最重此项 —— 「不动不应，一动即应」。动土是唯一能把静宫瞬间变成
 * 强动气的人为因素，故单独作为输入，不由房间推出。
 */
export interface DongQiOptions {
  /** 当年动过土／装修的宫位。 */
  readonly renovatedPalaces?: readonly PalaceIndex[];
}

const LEVEL_OF = (s: number): DongQiLevel =>
  s >= 0.8 ? '强' : s >= 0.5 ? '中' : s > 0 ? '弱' : '无';

/**
 * 算某宫的动气。
 *
 * 跨宫房间按其所占各宫一并计入 —— 一间横跨两宫的主卧，两宫都算动。
 */
export function dongQiOf(
  palace: PalaceIndex,
  rooms: readonly RoomPlacement[],
  opts: DongQiOptions = {},
): DongQiInfo {
  const sources = rooms
    .filter((r) => r.palaces.includes(palace))
    .map((r) => ({
      kind: r.kind,
      label: r.label ?? null,
      strength: ROOM_META[r.kind]?.priority ?? 0,
    }))
    .filter((x) => x.strength > 0)
    .sort((a, b) => b.strength - a.strength);

  const renovated = opts.renovatedPalaces?.includes(palace) ?? false;
  const roomMax = sources[0]?.strength ?? 0;
  // 动土直接顶格 —— 它比任何日常使用都更能触发。
  const strength = renovated ? 1 : roomMax;
  const level = LEVEL_OF(strength);

  let note: string;
  if (renovated) {
    note = '当年在此宫动土装修 —— 古法「不动不应，一动即应」，动气顶格。';
  } else if (sources.length === 0) {
    note = '此宫无房间落入，日常无人走动，星象再凶也难有应期。';
  } else {
    const names = sources.slice(0, 2).map((s) => s.label ?? s.kind).join('、');
    note =
      level === '强'
        ? `此宫有${names}，天天进出，是全宅最容易应事的地方之一。`
        : level === '中'
          ? `此宫有${names}，日常有人走动，星象能应但不算急。`
          : `此宫只有${names}，走动少，应期会拖后甚至不应。`;
  }

  return { palace, level, strength, sources, note };
}

/** 一次算齐九宫。 */
export function dongQiMap(
  rooms: readonly RoomPlacement[],
  opts: DongQiOptions = {},
): Record<PalaceIndex, DongQiInfo> {
  const out = {} as Record<PalaceIndex, DongQiInfo>;
  for (const p of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
    out[p] = dongQiOf(p, rooms, opts);
  }
  return out;
}

/**
 * 应期强度：宅盘凶吉 × 流年触发 × 动气。
 *
 * **相乘而非取平均。** 取平均会让「强凶星 + 零动气」得出一个中等数值，
 * 而实务上那种情形是**不应**；相乘才能让任一因子为零时整体归零。
 * 这跟本项目 composite.ts 里「峦头差则理气无用」的否决机制是同一条道理。
 *
 * @param boardStrength   宅盘该组合的力量 0–1
 * @param annualTrigger   流年触发强度 0–1（无触发为 0）
 * @param dongQiStrength  动气强度 0–1
 */
export function timingStrength(
  boardStrength: number,
  annualTrigger: number,
  dongQiStrength: number,
): number {
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  return Number((clamp01(boardStrength) * clamp01(annualTrigger) * clamp01(dongQiStrength)).toFixed(4));
}

/** 应期强度分档，供 UI 直接用。 */
export function timingBand(strength: number): '高' | '中' | '低' | '不应' {
  if (strength <= 0) return '不应';
  if (strength >= 0.45) return '高';
  if (strength >= 0.2) return '中';
  return '低';
}
