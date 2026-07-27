/**
 * 智能预警系统。
 *
 * 逻辑全部离线可算（流年/流月紫白是纯查表推算），推送只是可选的送达通道。
 * 预警按成员与风险类型可分别开关。
 */

import {
  PALACE_DIRECTION,
  STAR_META,
  STAR_NAME,
  annualStar,
  monthlyPlate,
  monthlyStar,
  starScore,
  type PalaceIndex,
  type RiskDomain,
} from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { predict } from './predict.js';
import type { AnalysisInput, RiskLevel } from './types.js';

export type AlertKind = '流月凶星' | '流年凶星' | '换运' | '感情预警' | '健康预警' | '化解回访';

export interface Alert {
  readonly id: string;
  readonly kind: AlertKind;
  readonly severity: RiskLevel;
  /** 应期起讫。 */
  readonly fromYear: number;
  readonly fromMonth: number | null;
  readonly palace: PalaceIndex | null;
  readonly direction: string | null;
  readonly room: string | null;
  readonly memberIds: readonly string[];
  readonly domains: readonly RiskDomain[];
  readonly title: string;
  readonly body: string;
  readonly action: string;
}

export interface AlertPreferences {
  /** 只对这些成员发预警；空 = 全部。 */
  readonly memberIds?: readonly string[];
  /** 只发这些类型的风险；空 = 全部。 */
  readonly domains?: readonly RiskDomain[];
  /** 只发这些种类；空 = 全部。 */
  readonly kinds?: readonly AlertKind[];
  /** 触发阈值（概率），默认 0.45。 */
  readonly threshold?: number;
}

const MONTH_LABEL = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];

/**
 * 预警标题里的「谁」。
 *
 * 直接写「对 1 位成员」既拗口又没信息量 —— 人少就点名，人多才用概称。
 */
function whoLabel(
  members: readonly { id: string; name: string }[],
  ids: readonly string[],
): string {
  if (ids.length === 0) return '全家';
  const names = ids
    .map((id) => members.find((m) => m.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return '全家';
  if (names.length <= 2) return names.join('与');
  return `${names[0]}等 ${names.length} 人`;
}

/**
 * 生成未来 N 个月的预警。
 *
 * @param monthsAhead 向前看几个节气月，默认 6
 */
export function buildAlerts(
  input: Omit<AnalysisInput, 'year' | 'monthIndex'>,
  fromYear: number,
  fromMonthIndex: number,
  monthsAhead = 6,
  prefs: AlertPreferences = {},
): Alert[] {
  const threshold = prefs.threshold ?? 0.45;
  const alerts: Alert[] = [];
  const allow = (kind: AlertKind) => !prefs.kinds?.length || prefs.kinds.includes(kind);
  const allowDomain = (d: RiskDomain) => !prefs.domains?.length || prefs.domains.includes(d);
  const allowMember = (id: string) => !prefs.memberIds?.length || prefs.memberIds.includes(id);

  // ---- 流年层 ----
  const yearInput: AnalysisInput = { ...input, year: fromYear };
  const s = synthesise(yearInput);
  const preds = predict(yearInput, s);
  const period = s.flyingStar.period.period;

  if (allow('流年凶星')) {
    for (const pr of preds) {
      if (pr.probability < threshold) continue;
      if (!allowDomain(pr.domain)) continue;
      const ids = pr.memberIds.filter(allowMember);
      if (pr.memberIds.length > 0 && ids.length === 0) continue;
      const kind: AlertKind = pr.domain === '感情' ? '感情预警' : pr.domain === '健康' ? '健康预警' : '流年凶星';
      if (!allow(kind)) continue;
      alerts.push({
        id: `year-${fromYear}-${pr.id}`,
        kind,
        severity: pr.riskLevel,
        fromYear,
        fromMonth: null,
        palace: pr.palace,
        direction: pr.direction,
        room: pr.room,
        memberIds: ids,
        domains: [pr.domain],
        title:
          pr.domain === '感情'
            ? `${fromYear} 年${whoLabel(input.members, ids)}的感情运受压（飞星与命理双重信号）`
            : `${fromYear} 年 ${pr.direction}${pr.room ? `的${pr.room}` : ''}${pr.domain}风险偏高`,
        body: `${pr.headline}。依据：${pr.findings[0]?.statement ?? ''}`,
        action: pr.cures[0]?.action ?? '详见化解清单。',
      });
    }
  }

  // ---- 流月层 ----
  if (allow('流月凶星')) {
    for (let i = 0; i < monthsAhead; i++) {
      const raw = fromMonthIndex - 1 + i;
      const y = fromYear + Math.floor(raw / 12);
      const mIdx = (raw % 12) + 1;
      const plate = monthlyPlate(y, mIdx);

      for (const p of [1, 2, 3, 4, 6, 7, 8, 9] as PalaceIndex[]) {
        const mStar = plate[p];
        const a = s.palaces[p];
        const mScore = starScore(mStar, period);
        // 只在「流月凶星 + 该宫本已不佳」时才报，避免月月刷屏
        if (mScore > -0.4 || a.score > -0.1) continue;

        const room = a.rooms.slice().sort((x, y2) => (x.kind === '主卧' ? -1 : y2.kind === '主卧' ? 1 : 0))[0] ?? null;
        const occupants = (room?.occupants ?? []).filter(allowMember);
        const meta = STAR_META[mStar];
        const domains = meta.riskDomains.filter(allowDomain);
        if (domains.length === 0) continue;

        alerts.push({
          id: `month-${y}-${mIdx}-${p}`,
          kind: '流月凶星',
          severity: a.riskLevel,
          fromYear: y,
          fromMonth: mIdx,
          palace: p,
          direction: PALACE_DIRECTION[p],
          room: room ? (room.label ?? room.kind) : null,
          memberIds: occupants,
          domains,
          title:
            `${MONTH_LABEL[mIdx - 1]}（${y} 年第 ${mIdx} 个节气月）${STAR_NAME[mStar]}进入${PALACE_DIRECTION[p]}` +
            (room ? `的${room.label ?? room.kind}` : ''),
          body:
            `本月流月${STAR_NAME[mStar]}加临，与本宫「${a.combinationName}」及流年${STAR_NAME[a.stars.annual]}叠加。` +
            `${meta.whenDeclining}。${occupants.length ? `此房使用者：${occupants.join('、')}。` : ''}` +
            `此宫全年评级为「${a.riskLevel}」，本月为其中较险的一段。`,
          action: a.cures[0]?.action ?? `本月此方保持静置，避免动土、搬迁与长时间停留。`,
        });
      }
    }
  }

  // ---- 换运预警 ----
  if (allow('换运')) {
    for (let y = fromYear; y < fromYear + 5; y++) {
      const cur = Math.floor((y - 1864) / 20);
      const next = Math.floor((y + 1 - 1864) / 20);
      if (cur !== next) {
        alerts.push({
          id: `period-${y + 1}`,
          kind: '换运',
          severity: '警戒',
          fromYear: y + 1,
          fromMonth: 1,
          palace: null,
          direction: null,
          room: null,
          memberIds: [],
          domains: ['财运', '健康', '事业'],
          title: `${y + 1} 年立春换运，全盘旺衰重排`,
          body:
            `换运后当旺之星更替，原本的旺山旺向可能变为上山下水，财位与丁位一并挪移。` +
            `本宅现为${s.flyingStar.period.label}、${s.flyingStar.pattern}，届时须整体重评。`,
          action: `请在 ${y + 1} 年立春前后重新生成一次全屋报告，并据新盘调整大门、财位与卧床布局。`,
        });
      }
    }
  }

  // ---- 化解回访 ----
  if (allow('化解回访')) {
    for (const c of input.appliedCures ?? []) {
      if (c.effectiveness && c.effectiveness !== '未评价') continue;
      alerts.push({
        id: `followup-${c.id}`,
        kind: '化解回访',
        severity: '留意',
        fromYear,
        fromMonth: null,
        palace: c.palace,
        direction: PALACE_DIRECTION[c.palace],
        room: null,
        memberIds: [],
        domains: c.domains ?? ['健康'],
        title: `请回访：${PALACE_DIRECTION[c.palace]}的「${c.item}」化解效果如何？`,
        body: `你在 ${c.appliedOn} 于${PALACE_DIRECTION[c.palace]}施用了「${c.item}」（${c.wuXing}）。回馈实际改善情况，系统会据此校准往后的风险评估。`,
        action: '在「化解追踪」中选择：明显改善 / 略有改善 / 无变化 / 反而更差。',
      });
    }
  }

  const sev: Record<RiskLevel, number> = { 紧急: 0, 高危: 1, 警戒: 2, 留意: 3, 安全: 4 };
  return alerts.sort(
    (a, b) =>
      sev[a.severity] - sev[b.severity] ||
      a.fromYear - b.fromYear ||
      (a.fromMonth ?? 0) - (b.fromMonth ?? 0),
  );
}

/** 某年的年星速览（用于首页卡片）。 */
export function yearGlance(year: number): { star: PalaceIndex; name: string; note: string } {
  const st = annualStar(year);
  return {
    star: st,
    name: STAR_NAME[st],
    note: `${year} 年${STAR_NAME[st]}入中顺飞。五黄到${PALACE_DIRECTION[palaceOfStar(year, 5)]}、二黑到${PALACE_DIRECTION[palaceOfStar(year, 2)]}、三碧到${PALACE_DIRECTION[palaceOfStar(year, 3)]}，此三方今年宜静不宜动。`,
  };
}

/** 求某年某颗年星飞到哪一宫。 */
export function palaceOfStar(year: number, star: PalaceIndex): PalaceIndex {
  const centre = annualStar(year);
  // 顺飞路线：5→6→7→8→9→1→2→3→4
  const route: PalaceIndex[] = [5, 6, 7, 8, 9, 1, 2, 3, 4];
  const steps = (((star - centre) % 9) + 9) % 9;
  return route[steps]!;
}

/** 求某年某月某颗月星飞到哪一宫。 */
export function palaceOfMonthlyStar(year: number, monthIndex: number, star: PalaceIndex): PalaceIndex {
  const centre = monthlyStar(year, monthIndex);
  const route: PalaceIndex[] = [5, 6, 7, 8, 9, 1, 2, 3, 4];
  const steps = (((star - centre) % 9) + 9) % 9;
  return route[steps]!;
}
