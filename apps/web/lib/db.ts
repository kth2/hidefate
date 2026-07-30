'use client';

/**
 * 本地优先存储（IndexedDB / Dexie）。
 *
 * 隐私设计：所有资料只存在本机浏览器，无任何自动上传。
 * 导出需用户明确点击「导出」，导入亦然。
 */

import Dexie, { type Table } from 'dexie';
import type { PropertyProfile } from '@hidefate/core-fengshui';
import type { AppliedCure } from '@hidefate/core-synthesis';
import type { BirthInput } from '@hidefate/core-bazi';
import type { FloorplanLayout } from './floorplan';

export interface StoredProperty extends PropertyProfile {
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * 户型图（dataURL）。只存在本机，不上传。
   *
   * 放在 StoredProperty 而不是 PropertyProfile 里：core-* 是纯函数层，
   * 不该知道有图片这回事 —— 它只认 rooms 里那份宫位映射。
   */
  readonly floorplanDataUrl?: string;
  /** 九宫格叠层在图上的位置、姿态与格子→房间的对应。 */
  readonly floorplanLayout?: FloorplanLayout;
}

export interface StoredMember extends BirthInput {
  id: string;
  propertyId: string;
  name: string;
  relation?: string;
  /** 常用房间 id。 */
  roomIds?: string[];
}

export interface StoredCure extends AppliedCure {
  propertyId: string;
  /** 化解生效年份（默认取 appliedOn 的年份）。 */
  effectiveFromYear?: number;
  photoDataUrl?: string;
}

export interface StoredScenario {
  id: string;
  propertyId: string;
  name: string;
  changesJson: string;
  note?: string;
  createdAt: string;
}

export interface AppSettings {
  key: 'settings';
  /** AI 供应商配置（全部可留空，不影响任何离线推算）。 */
  aiProvider?: 'deepseek' | 'groq' | 'openrouter' | 'gemini' | 'siliconflow' | 'ollama' | 'custom';
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
  /** 直连供应商而不经本机 Next 转发。 */
  aiDirect?: boolean;
  /** 用户是否已知悉「提问会把宅盘与成员命理送往第三方」。 */
  aiConsent?: boolean;
  /**
   * 首次出网确认的时间戳。空 = 还没确认过，任何外发请求都要先弹出网确认。
   * 与 aiConsent 的分工：aiConsent 是设置页上的一次勾选，这一项是真正拦在
   * 第一次发送之前的闸 —— 用户在那一刻看到的是**将要发出的原文**。
   */
  aiEgressConsentAt?: string;
  /** 出网时剔除成员八字（只留命卦）。 */
  aiExcludeMemberBazi?: boolean;
  /** 出网时剔除健康类断语与预测。 */
  aiExcludeHealthFindings?: boolean;
  /** 上次成功拉取的模型列表（离线时仍可选，避免每次进设置都要联网）。 */
  aiModelCache?: { id: string; name: string; free: boolean; contextLength: number | null }[];
  aiModelCacheAt?: string;
  language?: 'zh-CN' | 'en';
}

export const SETTINGS_KEY = 'settings' as const;

export async function loadSettings(): Promise<AppSettings> {
  const s = await db().settings.get(SETTINGS_KEY);
  return s ?? { key: SETTINGS_KEY };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const cur = await loadSettings();
  const next: AppSettings = { ...cur, ...patch, key: SETTINGS_KEY };
  await db().settings.put(next);
  return next;
}

class HideFateDB extends Dexie {
  properties!: Table<StoredProperty, string>;
  members!: Table<StoredMember, string>;
  cures!: Table<StoredCure, string>;
  scenarios!: Table<StoredScenario, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('hidefate');
    this.version(1).stores({
      properties: 'id, name, buildingType, updatedAt',
      members: 'id, propertyId, name',
      cures: 'id, propertyId, palace, appliedOn',
      scenarios: 'id, propertyId, createdAt',
      settings: 'key',
    });
  }
}

let _db: HideFateDB | null = null;

/** 惰性取得 DB —— 避免在服务端渲染时触碰 IndexedDB。 */
export function db(): HideFateDB {
  if (typeof window === 'undefined') {
    throw new Error('本地资料库只能在浏览器端使用。');
  }
  if (!_db) _db = new HideFateDB();
  return _db;
}

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

/** 导出全部资料为 JSON（用户主动触发）。 */
export async function exportAll(): Promise<string> {
  const d = db();
  const [properties, members, cures, scenarios] = await Promise.all([
    d.properties.toArray(),
    d.members.toArray(),
    d.cures.toArray(),
    d.scenarios.toArray(),
  ]);
  return JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), properties, members, cures, scenarios },
    null,
    2,
  );
}

export interface ExportShape {
  version?: number;
  exportedAt?: string;
  properties?: StoredProperty[];
  members?: StoredMember[];
  cures?: StoredCure[];
  scenarios?: StoredScenario[];
}

/** 导入 JSON（覆盖同 id 记录）。 */
export async function importAll(json: string): Promise<{ properties: number; members: number }> {
  const data = JSON.parse(json) as ExportShape;
  const d = db();
  await d.transaction('rw', d.properties, d.members, d.cures, d.scenarios, async () => {
    if (data.properties?.length) await d.properties.bulkPut(data.properties);
    if (data.members?.length) await d.members.bulkPut(data.members);
    if (data.cures?.length) await d.cures.bulkPut(data.cures);
    if (data.scenarios?.length) await d.scenarios.bulkPut(data.scenarios);
  });
  return { properties: data.properties?.length ?? 0, members: data.members?.length ?? 0 };
}
