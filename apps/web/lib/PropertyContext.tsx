'use client';

/**
 * 「当前物业」全局状态。
 *
 * 手机版用底部 tab 导航，五个 tab 共享同一处物业，因此不能像桌面版那样
 * 把 propertyId 放在路由里 —— 否则每切一个 tab 都要重新取一次数据、重算一次盘。
 * 这里统一持有：当前物业、成员、化解、以及合参结果，各 tab 直接取用。
 *
 * 未来移植 Expo 时，只需把 Dexie 换成 expo-sqlite，本文件的接口不必改。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SynthesisResult } from '@hidefate/core-synthesis';
import type { ShanXiangResult } from '@hidefate/core-qimen';
import { db, type StoredCure, type StoredMember, type StoredProperty } from './db';
import { currentFengShuiTime, toCures, toMembers, useAnalysis } from './useAnalysis';

const ACTIVE_KEY = 'hidefate.activeProperty';

interface PropertyContextValue {
  /** 全部物业（用于切换）。 */
  properties: StoredProperty[];
  activeId: string | null;
  property: StoredProperty | null;
  memberRows: StoredMember[];
  cureRows: StoredCure[];
  members: ReturnType<typeof toMembers>;
  cures: ReturnType<typeof toCures>;
  result: SynthesisResult | null;
  qiMen: ShanXiangResult | null;
  qiMenLoading: boolean;
  qiMenError: string | null;
  retryQiMen: () => void;
  /** 分析年（立春年）与节气月。 */
  year: number;
  monthIndex: number;
  setYear: (y: number) => void;
  enableQiMen: boolean;
  setEnableQiMen: (v: boolean) => void;
  loading: boolean;
  setActive: (id: string) => void;
  reload: () => void;
}

const Ctx = createContext<PropertyContextValue | null>(null);

export function PropertyProvider({ children }: { children: ReactNode }) {
  const [properties, setProperties] = useState<StoredProperty[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [memberRows, setMemberRows] = useState<StoredMember[]>([]);
  const [cureRows, setCureRows] = useState<StoredCure[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(0);

  const [now] = useState(() => currentFengShuiTime());
  const [year, setYear] = useState(now.year);
  const [enableQiMen, setEnableQiMenState] = useState(false);

  const reload = useCallback(() => setToken((t) => t + 1), []);

  // 载入物业列表 + 恢复上次选中的那处
  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      try {
        const list = await db().properties.orderBy('updatedAt').reverse().toArray();
        if (!alive) return;
        setProperties(list);
        const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_KEY) : null;
        const pick = list.find((p) => p.id === saved)?.id ?? list[0]?.id ?? null;
        setActiveId(pick);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  // 当前物业的成员与化解
  useEffect(() => {
    let alive = true;
    if (!activeId) {
      setMemberRows([]);
      setCureRows([]);
      return;
    }
    void (async () => {
      const d = db();
      const [ms, cs] = await Promise.all([
        d.members.where('propertyId').equals(activeId).toArray(),
        d.cures.where('propertyId').equals(activeId).toArray(),
      ]);
      if (!alive) return;
      setMemberRows(ms);
      setCureRows(cs);
    })();
    return () => {
      alive = false;
    };
  }, [activeId, token]);

  const property = useMemo(
    () => properties.find((p) => p.id === activeId) ?? null,
    [properties, activeId],
  );

  // 物业自带的奇门开关是持久化的真值来源
  useEffect(() => {
    if (property) setEnableQiMenState(Boolean(property.enableQiMen));
  }, [property?.id, property?.enableQiMen]);

  const members = useMemo(() => toMembers(memberRows), [memberRows]);
  const cures = useMemo(() => toCures(cureRows), [cureRows]);

  const { result, qiMen, qiMenLoading, qiMenError, retryQiMen } = useAnalysis({
    profile: property,
    members,
    cures,
    year,
    monthIndex: now.monthIndex,
    enableQiMen,
  });

  const setActive = useCallback((id: string) => {
    setActiveId(id);
    try {
      localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      /* 隐私模式下 localStorage 可能不可用，忽略即可 */
    }
  }, []);

  const setEnableQiMen = useCallback(
    (v: boolean) => {
      setEnableQiMenState(v);
      if (property) {
        void db().properties.update(property.id, { enableQiMen: v, updatedAt: new Date().toISOString() });
      }
    },
    [property],
  );

  const value: PropertyContextValue = {
    properties,
    activeId,
    property,
    memberRows,
    cureRows,
    members,
    cures,
    result,
    qiMen,
    qiMenLoading,
    qiMenError,
    retryQiMen,
    year,
    monthIndex: now.monthIndex,
    setYear,
    enableQiMen,
    setEnableQiMen,
    loading,
    setActive,
    reload,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProperty(): PropertyContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProperty 必须在 PropertyProvider 内使用。');
  return v;
}
