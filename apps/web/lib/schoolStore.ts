'use client';

/**
 * 门派设置的本机存储。
 *
 * 风水师级别的偏好（一个人一套做法），故放 localStorage 而非 IndexedDB 的房屋表：
 * 换案件不该换门派。读写一律 try/catch —— 隐私模式或禁用存储时退回默认，不报错。
 */

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SCHOOL, resolveSchool, type SchoolSettings } from '@hidefate/core-fengshui';

const KEY = 'hidefate.school.v1';
const EVENT = 'hidefate:school';

export function loadSchool(): SchoolSettings {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    return raw ? resolveSchool(JSON.parse(raw) as Partial<SchoolSettings>) : DEFAULT_SCHOOL;
  } catch {
    return DEFAULT_SCHOOL;
  }
}

export function saveSchool(s: SchoolSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 存不了就只在本次会话生效 */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** 门派设置 hook：任一页面改动，其它页面即时跟上。 */
export function useSchool(): [SchoolSettings, (patch: Partial<SchoolSettings>) => void] {
  const [school, setSchool] = useState<SchoolSettings>(DEFAULT_SCHOOL);
  useEffect(() => {
    setSchool(loadSchool());
    const sync = () => setSchool(loadSchool());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const update = useCallback((patch: Partial<SchoolSettings>) => {
    const next = resolveSchool({ ...loadSchool(), ...patch });
    setSchool(next);
    saveSchool(next);
  }, []);
  return [school, update];
}
