/**
 * 居住史 —— 把「一间房子的入住年」升级为「一个人住过哪些地方」。
 *
 * 现有 `PropertyProfile.moveInYear` 是宅视角：给一间房子看运。
 * 人生轨迹要的是人视角：某一年这个人住在哪、在哪上班，那一段的风水层才算数。
 *
 * ## 老宅资料残缺是常态
 *
 * 用户不会记得二十年前那间屋的坐向。这里比照 core-bazi 的
 * 「残缺八字是一等公民」，按 `fidelity` 分级决定能算什么 ——
 * 但多一条更硬的规矩：**低保真段不得参与学习**。
 * 宁可标「这段看不了」，也不能把噪声当断点证据喂给校准层。
 */

import type { PropertyProfile } from '@hidefate/core-fengshui';

/** 该段房产资料的可信程度。 */
export type ResidenceFidelity = '罗盘实测' | '大致朝向' | '仅入住年' | '无资料';

/** 一个人使用某处房产的角色。 */
export type ResidenceRole = '居家' | '办公' | '兼';

export interface ResidencePeriod {
  readonly id: string;
  readonly personId: string;
  readonly propertyId: string;
  /** 立春年。 */
  readonly fromYear: number;
  /** null 表示至今仍在住。 */
  readonly toYear: number | null;
  readonly role: ResidenceRole;
  readonly fidelity: ResidenceFidelity;
  readonly note?: string;
}

export interface FidelityCapability {
  /** 能否排飞星盘（需坐向）。 */
  readonly flyingStar: boolean;
  /** 能否落到房间层（需户型）。 */
  readonly roomLevel: boolean;
  /** 能否算元运与流年紫白（只需年份）。 */
  readonly periodLayer: boolean;
  /**
   * 该段能否作为学习证据。
   * **这是本模块最要紧的一个字段** —— 低保真段进了校准层，
   * 学到的是噪声，而且学错了没人看得出来。
   */
  readonly learnable: boolean;
  /** 学习时的降权系数。 */
  readonly weight: number;
  readonly note: string;
}

export const FIDELITY_CAPABILITY: Readonly<Record<ResidenceFidelity, FidelityCapability>> = {
  罗盘实测: {
    flyingStar: true, roomLevel: true, periodLayer: true, learnable: true, weight: 1,
    note: '坐向与户型俱全，全套飞星、宫位与房间层均可推算。',
  },
  大致朝向: {
    flyingStar: true, roomLevel: false, periodLayer: true, learnable: true, weight: 0.6,
    note: '有大致朝向无户型：宅盘与宫位吉凶成立，房间层放弃，学习时降权。',
  },
  仅入住年: {
    flyingStar: false, roomLevel: false, periodLayer: true, learnable: false, weight: 0,
    note: '只知入住年：仅元运与流年紫白可算，不足以作断点证据，不参与学习。',
  },
  无资料: {
    flyingStar: false, roomLevel: false, periodLayer: false, learnable: false, weight: 0,
    note: '该段无任何房产资料，风水层置零 —— 明说看不了，不用缺省值冒充。',
  },
};

export interface ResidenceIssue {
  readonly level: 'error' | 'warning';
  readonly message: string;
  readonly periodIds: readonly string[];
}

const endOf = (p: ResidencePeriod): number => p.toYear ?? Number.POSITIVE_INFINITY;

/**
 * 校验一个人的居住史。
 *
 * 重叠是 **error**（同一角色同一年不可能住两处，必是记错）；
 * 空档只是 **warning**（人确实可能有几年没记录，不该拦着他继续用）。
 */
export function validateResidenceHistory(
  periods: readonly ResidencePeriod[],
): ResidenceIssue[] {
  const issues: ResidenceIssue[] = [];

  for (const p of periods) {
    if (p.toYear != null && p.toYear < p.fromYear) {
      issues.push({
        level: 'error',
        message: `居住段「${p.id}」起止颠倒：${p.fromYear} → ${p.toYear}。`,
        periodIds: [p.id],
      });
    }
  }

  // 按人 + 角色分组检查重叠与空档。「兼」同时占居家与办公两条轨。
  const tracks = new Map<string, ResidencePeriod[]>();
  const push = (key: string, p: ResidencePeriod) => {
    const list = tracks.get(key);
    if (list) list.push(p);
    else tracks.set(key, [p]);
  };
  for (const p of periods) {
    if (p.role === '兼') {
      push(`${p.personId}|居家`, p);
      push(`${p.personId}|办公`, p);
    } else {
      push(`${p.personId}|${p.role}`, p);
    }
  }

  for (const [key, list] of tracks) {
    const sorted = [...list].sort((a, b) => a.fromYear - b.fromYear);
    const open = sorted.filter((p) => p.toYear == null);
    if (open.length > 1) {
      issues.push({
        level: 'error',
        message: `${key} 有 ${open.length} 段标为「至今」，最多只能有一段。`,
        periodIds: open.map((p) => p.id),
      });
    }
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      if (cur.fromYear <= endOf(prev)) {
        issues.push({
          level: 'error',
          message: `${key} 的「${prev.id}」与「${cur.id}」在 ${cur.fromYear} 年重叠。`,
          periodIds: [prev.id, cur.id],
        });
      } else if (cur.fromYear > endOf(prev) + 1) {
        issues.push({
          level: 'warning',
          message: `${key} 在 ${endOf(prev) + 1}–${cur.fromYear - 1} 年无居住记录，该段风水层将置零。`,
          periodIds: [prev.id, cur.id],
        });
      }
    }
  }

  return issues;
}

/** 取某人某年生效的居住段。「兼」会同时命中居家与办公两种查询。 */
export function residenceAt(
  periods: readonly ResidencePeriod[],
  personId: string,
  year: number,
  role?: ResidenceRole,
): ResidencePeriod[] {
  return periods.filter((p) => {
    if (p.personId !== personId) return false;
    if (year < p.fromYear || year > endOf(p)) return false;
    if (!role) return true;
    return p.role === role || p.role === '兼';
  });
}

/** 居住段 + 该段房产（若资料齐全）。 */
export interface ResolvedResidence {
  readonly period: ResidencePeriod;
  /** 房产档案；`fidelity` 不足或未建档时为 null。 */
  readonly profile: PropertyProfile | null;
  readonly capability: FidelityCapability;
}

export function resolveResidence(
  period: ResidencePeriod,
  properties: ReadonlyMap<string, PropertyProfile>,
): ResolvedResidence {
  const capability = FIDELITY_CAPABILITY[period.fidelity];
  const profile = capability.flyingStar ? (properties.get(period.propertyId) ?? null) : null;
  return { period, profile, capability };
}

/** 搬家年份 —— 断点归因的主要素材，见 breakpoints.ts。 */
export function moveYears(periods: readonly ResidencePeriod[], personId: string): number[] {
  const mine = periods.filter((p) => p.personId === personId);
  const years = new Set<number>();
  for (const p of mine) years.add(p.fromYear);
  // 最早一段的起始年是「出生／建档」而非搬家，剔除。
  const earliest = Math.min(...mine.map((p) => p.fromYear));
  years.delete(earliest);
  return [...years].sort((a, b) => a - b);
}
