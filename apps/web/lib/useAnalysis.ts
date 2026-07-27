'use client';

/**
 * 把「本地存储的物业 + 成员」接到三个计算核心上。
 *
 * 关键性能设计：
 *   - 飞星 / 八宅 / 合参全部同步计算，毫秒级，随输入即时重算
 *   - 山向奇门（416 KB 引擎）**按需异步懒载**，未开启此层就完全不下载
 *   - 坐山没变时不重排奇门盘，故搬房间、改缺角是瞬时的
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeBaziChart } from '@hidefate/core-bazi';
import { fengShuiYearOf, solarMonthIndexOf, type PropertyProfile } from '@hidefate/core-fengshui';
import { computeShanXiang, type ShanXiangResult } from '@hidefate/core-qimen';
import {
  analyse,
  synthesise,
  type AnalysisInput,
  type AppliedCure,
  type Member,
  type SynthesisResult,
} from '@hidefate/core-synthesis';
import type { StoredCure, StoredMember } from './db';

export function toMembers(rows: readonly StoredMember[]): Member[] {
  return rows.map((r) => {
    const chart = computeBaziChart({
      id: r.id,
      name: r.name,
      gender: r.gender,
      calendar: r.calendar,
      year: r.year,
      month: r.month,
      day: r.day,
      hour: r.hour,
      minute: r.minute,
      isLeapMonth: r.isLeapMonth,
      longitude: r.longitude,
      useTrueSolarTime: r.useTrueSolarTime,
    });
    return {
      id: r.id,
      name: r.name,
      relation: r.relation,
      chart,
      mingGua: chart.mingGua,
      primaryRoomIds: r.roomIds,
    };
  });
}

export function toCures(rows: readonly StoredCure[]): AppliedCure[] {
  return rows.map((r) => ({
    id: r.id,
    palace: r.palace,
    wuXing: r.wuXing,
    item: r.item,
    appliedOn: r.appliedOn,
    domains: r.domains,
    effectiveness: r.effectiveness,
    note: r.note,
  }));
}

export interface UseAnalysisArgs {
  profile: PropertyProfile | null;
  members: readonly Member[];
  cures: readonly AppliedCure[];
  year: number;
  monthIndex?: number;
  /** 是否启用山向奇门层。 */
  enableQiMen: boolean;
}

export interface UseAnalysisResult {
  result: SynthesisResult | null;
  qiMen: ShanXiangResult | null;
  qiMenLoading: boolean;
  qiMenError: string | null;
  /** 手动重试载入奇门引擎。 */
  retryQiMen: () => void;
}

export function useAnalysis(args: UseAnalysisArgs): UseAnalysisResult {
  const { profile, members, cures, year, monthIndex, enableQiMen } = args;

  const [qiMen, setQiMen] = useState<ShanXiangResult | null>(null);
  const [qiMenLoading, setQiMenLoading] = useState(false);
  const [qiMenError, setQiMenError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // 奇门只依赖「坐山 + 入住年」；房间与缺角变动不触发重排。
  const sitting = profile?.sitting;
  const moveInYear = profile?.moveInYear;

  useEffect(() => {
    let cancelled = false;
    if (!enableQiMen || sitting == null || moveInYear == null) {
      setQiMen(null);
      setQiMenError(null);
      setQiMenLoading(false);
      return;
    }
    setQiMenLoading(true);
    setQiMenError(null);
    computeShanXiang({ sitting, year: moveInYear, purpose: '风水' })
      .then((r) => {
        if (!cancelled) setQiMen(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setQiMen(null);
          setQiMenError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setQiMenLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enableQiMen, sitting, moveInYear, retryToken]);

  const result = useMemo(() => {
    if (!profile) return null;
    const input: AnalysisInput = {
      profile: { ...profile, enableQiMen },
      members,
      year,
      monthIndex,
      appliedCures: cures,
      qiMen: enableQiMen ? qiMen : null,
    };
    try {
      return analyse(input, synthesise(input));
    } catch {
      return null;
    }
  }, [profile, members, cures, year, monthIndex, enableQiMen, qiMen]);

  const retryQiMen = useCallback(() => setRetryToken((t) => t + 1), []);

  return { result, qiMen, qiMenLoading, qiMenError, retryQiMen };
}

/** 当前的风水年与节气月（立春为年界）。 */
export function currentFengShuiTime(): { year: number; monthIndex: number } {
  const now = new Date();
  return { year: fengShuiYearOf(now), monthIndex: solarMonthIndexOf(now) };
}
