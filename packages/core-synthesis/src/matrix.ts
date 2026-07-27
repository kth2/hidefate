/**
 * 房间 × 成员 风险矩阵。
 *
 * 行 = 家庭/公司成员，列 = 房间（或年份）。
 * 每格是「这个人在这个位置」的四维风险强度，点开即见古法依据与化解。
 */

import {
  PALACE_DIRECTION,
  ROOM_PRIORITY,
  STAR_NAME,
  YOU_NIAN_META,
  crossPersonHouse,
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
  /** 四维风险强度 0–1，1 为最高。 */
  readonly intensity: Readonly<Record<RiskDomain, number>>;
  /** 综合强度（取四维加权最大项）。 */
  readonly overall: number;
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
): Record<RiskDomain, number> {
  const a = s.palaces[palace];
  const base = Math.max(0, -a.score); // 0–1
  const out: Record<RiskDomain, number> = {
    健康: 0, 财运: 0, 感情: 0, 事业: 0, 人丁: 0, 意外: 0, 官非: 0,
  };

  // 该宫各 finding 按其 domain 累积
  for (const f of a.findings) {
    const w = Math.max(0, -f.impact);
    for (const d of f.domains) out[d] = Math.min(1, out[d] + w * 0.45);
  }

  // 八宅宅命交叉：个人化的关键一层
  if (palace !== 5) {
    const cell = crossPersonHouse(s.baZhai.houseGua, member.mingGua.gua as never)[palace as Exclude<PalaceIndex, 5>];
    const personal = Math.max(0, -cell.score / 6);
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
    for (const d of MATRIX_DOMAINS) out[d] = Math.min(1, out[d] * (0.75 + 0.25 * factor) + base * 0.15);
  } else {
    // 八字残缺：只用命卦层，强度不因缺料而虚高
    for (const d of MATRIX_DOMAINS) out[d] = Math.min(1, out[d] * 0.85);
  }
  return out;
}

function briefOf(s: SynthesisResult, palace: PalaceIndex, member: Member, overall: number): string {
  const a = s.palaces[palace];
  if (palace === 5) return `中宫：${a.combinationName}，不入八宅论断，仅以飞星与流年论。`;
  const cell = crossPersonHouse(s.baZhai.houseGua, member.mingGua.gua as never)[palace as Exclude<PalaceIndex, 5>];
  return (
    `${PALACE_DIRECTION[palace]}：飞星${STAR_NAME[a.stars.shan]}／${STAR_NAME[a.stars.xiang]}成「${a.combinationName}」，` +
    `流年${STAR_NAME[a.stars.annual]}临；宅得「${cell.houseStar}」而${member.name}（${member.mingGua.gua}命）得「${cell.personStar}」` +
    `（${YOU_NIAN_META[cell.personStar].governs}），合判「${cell.verdict}」，风险强度 ${(overall * 100).toFixed(0)}%。`
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
      const intensity = domainIntensity(s, palace, m);
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
        riskLevel: riskLevelOf(-overall * 1.4 + 0.35),
        findings: a.findings,
        cures: a.cures,
        brief: briefOf(s, palace, m, overall),
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
  /** 每人取哪一间房作代表；缺省取主卧，再缺省取全屋均值。 */
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
      const intensity = domainIntensity(s, palace, m);
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
        riskLevel: riskLevelOf(-overall * 1.4 + 0.35),
        findings: a.findings,
        cures: a.cures,
        brief: briefOf(s, palace, m, overall),
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
