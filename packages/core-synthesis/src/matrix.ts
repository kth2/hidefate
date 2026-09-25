/**
 * 房间 × 成员 风险矩阵。
 *
 * 行 = 家庭/公司成员，列 = 房间（或年份）。
 * 每格给两个数：
 *   - `intensity`：按**实际使用**算的风险 —— 别人的卧房对你是 0，卫浴只是偶尔经过
 *   - `ifUsed`：假如此人就用这间（睡这里、坐这里），风险多高 —— 供「谁住哪间」参考
 * 早先只有后者，于是卫浴、阳台对全家人人 100，看起来比自己的卧房还危险。
 */

import {
  PALACE_DIRECTION,
  ROOM_PRIORITY,
  STAR_NAME,
  YOU_NIAN_META,
  crossPersonHouse,
  exposureOf,
  roomExposure,
  roomNature,
  type PalaceIndex,
  type RiskDomain,
  type RoomPlacement,
} from '@hidefate/core-fengshui';
import { riskLevelOf, type Cure, type Finding, type Member, type RiskLevel, type SynthesisResult } from './types.js';

export const MATRIX_DOMAINS: readonly RiskDomain[] = ['健康', '财运', '感情', '事业'] as const;

export interface MatrixCell {
  readonly memberId: string;
  readonly memberName: string;
  /** 房间 id；按年矩阵时为年份字符串。 */
  readonly columnId: string;
  readonly columnLabel: string;
  readonly palace: PalaceIndex | null;
  readonly direction: string | null;
  /** 按实际使用算的四维风险强度 0–1（已乘受影响程度）。 */
  readonly intensity: Readonly<Record<RiskDomain, number>>;
  /** 综合强度（取四维最大项）。 */
  readonly overall: number;
  /** 假如此人就用这间，四维风险强度 0–1。 */
  readonly ifUsed: Readonly<Record<RiskDomain, number>>;
  /** 受影响程度 0–1：自己的房 1、共用 0.6、少停留 0.25、别人的房 0。 */
  readonly exposure: number;
  /** 此人是否被指定为这间房的使用者。 */
  readonly occupied: boolean;
  readonly riskLevel: RiskLevel;
  readonly findings: readonly Finding[];
  readonly cures: readonly Cure[];
  /** 一句话结论，供格子 tooltip。 */
  readonly brief: string;
}

export interface RiskMatrix {
  readonly kind: '房间' | '年份';
  readonly year: number;
  readonly members: readonly { id: string; name: string }[];
  readonly columns: readonly { id: string; label: string }[];
  readonly cells: readonly MatrixCell[];
  /** 便捷索引：`${memberId}|${columnId}`。 */
  readonly index: Readonly<Record<string, MatrixCell>>;
}

function domainIntensity(
  s: SynthesisResult,
  palace: PalaceIndex,
  member: Member,
  room: RoomPlacement | null,
): Record<RiskDomain, number> {
  const a = s.palaces[palace];
  const base = Math.max(0, -a.score); // 0–1
  const out: Record<RiskDomain, number> = {
    健康: 0, 财运: 0, 感情: 0, 事业: 0, 人丁: 0, 意外: 0, 官非: 0,
  };

  // 厕所、储藏落在凶方是「以凶制凶」的正解 —— 凶气被压住，宫位部分大幅打折
  const pressed = room != null && roomNature(room.kind) === '宜凶' && a.score < 0 ? 0.3 : 1;

  // 该宫各 finding 按其 domain 累积
  for (const f of a.findings) {
    const w = Math.max(0, -f.impact) * pressed;
    for (const d of f.domains) out[d] = Math.min(1, out[d] + w * 0.45);
  }

  // 八宅命卦：个人化的关键一层（只取「此方于其命」那颗星；宅星已在宫位分里）
  if (palace !== 5) {
    const cell = crossPersonHouse(s.baZhai.houseGua, member.mingGua.gua as never)[palace as Exclude<PalaceIndex, 5>];
    const personal = Math.max(0, -YOU_NIAN_META[cell.personStar].power / 3);
    for (const d of MATRIX_DOMAINS) out[d] = Math.min(1, out[d] + personal * 0.35);
    // 五鬼六煞专攻感情与意外，绝命专攻健康与财
    if (cell.personStar === '五鬼' || cell.personStar === '六煞') {
      out.感情 = Math.min(1, out.感情 + 0.25);
      out.意外 = Math.min(1, out.意外 + 0.2);
    }
    if (cell.personStar === '绝命') {
      out.健康 = Math.min(1, out.健康 + 0.3);
      out.财运 = Math.min(1, out.财运 + 0.2);
    }
  }

  // 八字喜忌微调
  const es = member.chart.elementStrength;
  if (es.dayMasterElement) {
    const factor = member.chart.confidence.factor;
    for (const d of MATRIX_DOMAINS) out[d] = Math.min(1, out[d] * (0.75 + 0.25 * factor) + base * pressed * 0.15);
  } else {
    // 八字残缺：只用命卦层，强度不因缺料而虚高
    for (const d of MATRIX_DOMAINS) out[d] = Math.min(1, out[d] * 0.85);
  }
  return out;
}

function scaleBy(v: Readonly<Record<RiskDomain, number>>, k: number): Record<RiskDomain, number> {
  const out = { ...v } as Record<RiskDomain, number>;
  for (const d of Object.keys(out) as RiskDomain[]) out[d] = out[d] * k;
  return out;
}

function usageNote(room: RoomPlacement | null, member: Member): string {
  if (!room) return '';
  const kind = roomExposure(room.kind);
  const name = room.label ?? room.kind;
  if (room.occupants?.includes(member.id)) return `${name}是${member.name}常用的地方，按全量计。`;
  if (kind === '专属') {
    return room.occupants?.length
      ? `${name}不是${member.name}的房间，对其实际影响不计。`
      : `${name}还没指定谁住，对${member.name}的实际影响暂不计。`;
  }
  return kind === '共用'
    ? `${name}全家共用，按六成计。`
    : `${name}只是偶尔经过，按两成半计${roomNature(room.kind) === '宜凶' ? '；且它正好压住本宫凶气' : ''}。`;
}

function briefOf(
  s: SynthesisResult,
  palace: PalaceIndex,
  member: Member,
  room: RoomPlacement | null,
  ifUsed: Readonly<Record<RiskDomain, number>>,
): string {
  const a = s.palaces[palace];
  const hypo = Math.max(...MATRIX_DOMAINS.map((d) => ifUsed[d]));
  const tail = `假如${member.name}就用这里，风险强度 ${(hypo * 100).toFixed(0)}%。${usageNote(room, member)}`;
  if (palace === 5) return `中宫：${a.combinationName}，不入八宅论断，仅以飞星与流年论。${tail}`;
  const cell = crossPersonHouse(s.baZhai.houseGua, member.mingGua.gua as never)[palace as Exclude<PalaceIndex, 5>];
  return (
    `${PALACE_DIRECTION[palace]}：飞星${STAR_NAME[a.stars.shan]}／${STAR_NAME[a.stars.xiang]}成「${a.combinationName}」，` +
    `流年${STAR_NAME[a.stars.annual]}临；此方于${member.name}（${member.mingGua.gua}命）为「${cell.personStar}」` +
    `（${YOU_NIAN_META[cell.personStar].governs}）。${tail}`
  );
}

/** 房间 × 成员 矩阵。 */
export function buildRoomMemberMatrix(
  s: SynthesisResult,
  members: readonly Member[],
): RiskMatrix {
  const rooms = [...s.profile.rooms].sort((a, b) => ROOM_PRIORITY[b.kind] - ROOM_PRIORITY[a.kind]);
  const cells: MatrixCell[] = [];
  const index: Record<string, MatrixCell> = {};

  for (const m of members) {
    for (const room of rooms) {
      const palace = room.primaryPalace;
      const ifUsed = domainIntensity(s, palace, m, room);
      const exposure = exposureOf(room, m.id);
      const intensity = scaleBy(ifUsed, exposure);
      const overall = Math.max(...MATRIX_DOMAINS.map((d) => intensity[d]));
      const a = s.palaces[palace];
      const cell: MatrixCell = {
        memberId: m.id,
        memberName: m.name,
        columnId: room.id,
        columnLabel: room.label ?? room.kind,
        palace,
        direction: PALACE_DIRECTION[palace],
        intensity,
        overall,
        ifUsed,
        exposure,
        occupied: room.occupants?.includes(m.id) ?? false,
        riskLevel: riskLevelOf(-overall * 1.4 + 0.35),
        findings: a.findings,
        cures: a.cures.filter((c) => c.intent === '化凶'),
        brief: briefOf(s, palace, m, room, ifUsed),
      };
      cells.push(cell);
      index[`${m.id}|${room.id}`] = cell;
    }
  }

  return {
    kind: '房间',
    year: s.year,
    members: members.map((m) => ({ id: m.id, name: m.name })),
    columns: rooms.map((r) => ({ id: r.id, label: r.label ?? r.kind })),
    cells,
    index,
  };
}

/** 年份 × 成员 矩阵（需外部传入逐年合参结果）。 */
export function buildYearMemberMatrix(
  perYear: readonly SynthesisResult[],
  members: readonly Member[],
  /** 每人取哪一间房作代表；缺省取其主卧，再缺省取其任一房间，再缺省取主卧。 */
  representativeRoom?: (m: Member, s: SynthesisResult) => RoomPlacement | null,
): RiskMatrix {
  const cells: MatrixCell[] = [];
  const index: Record<string, MatrixCell> = {};
  const pick = representativeRoom ?? ((m: Member, s: SynthesisResult) =>
    s.profile.rooms.find((r) => r.occupants?.includes(m.id) && r.kind === '主卧')
    ?? s.profile.rooms.find((r) => r.occupants?.includes(m.id))
    ?? s.profile.rooms.find((r) => r.kind === '主卧')
    ?? s.profile.rooms[0]
    ?? null);

  for (const m of members) {
    for (const s of perYear) {
      const room = pick(m, s);
      const palace = room?.primaryPalace ?? 5;
      // 年份矩阵取此人的代表房间，按「就住这里」算
      const intensity = domainIntensity(s, palace, m, room);
      const overall = Math.max(...MATRIX_DOMAINS.map((d) => intensity[d]));
      const a = s.palaces[palace];
      const cell: MatrixCell = {
        memberId: m.id,
        memberName: m.name,
        columnId: String(s.year),
        columnLabel: `${s.year} 年`,
        palace,
        direction: PALACE_DIRECTION[palace],
        intensity,
        overall,
        ifUsed: intensity,
        exposure: 1,
        occupied: room?.occupants?.includes(m.id) ?? false,
        riskLevel: riskLevelOf(-overall * 1.4 + 0.35),
        findings: a.findings,
        cures: a.cures.filter((c) => c.intent === '化凶'),
        brief: briefOf(s, palace, m, room, intensity),
      };
      cells.push(cell);
      index[`${m.id}|${s.year}`] = cell;
    }
  }

  return {
    kind: '年份',
    year: perYear[0]?.year ?? new Date().getFullYear(),
    members: members.map((m) => ({ id: m.id, name: m.name })),
    columns: perYear.map((s) => ({ id: String(s.year), label: `${s.year} 年` })),
    cells,
    index,
  };
}

/** 按风险类型筛选矩阵格子。 */
export function filterMatrix(matrix: RiskMatrix, domain: RiskDomain, min = 0.3): MatrixCell[] {
  return matrix.cells.filter((c) => c.intensity[domain] >= min)
    .sort((a, b) => b.intensity[domain] - a.intensity[domain]);
}
