'use client';

/**
 * 本地优先存储（IndexedDB / Dexie）。
 *
 * 隐私设计：所有资料只存在本机浏览器，无任何自动上传。
 * 导出需用户明确点击「导出」，导入亦然。
 */

import Dexie, { type Table } from 'dexie';
import type { PropertyProfile } from '@hidefate/core-fengshui';
import type { AppliedCure, ResidencePeriod } from '@hidefate/core-synthesis';
import type { BirthInput } from '@hidefate/core-bazi';
import type { PredictionRecord, QuietRecord } from '@hidefate/core-ledger';
import type { XiangPosterior } from '@hidefate/core-xiangyi';

export interface StoredProperty extends PropertyProfile {
  readonly createdAt: string;
  readonly updatedAt: string;
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

/** 居住史。人维度，跨房产，故与 properties／members 分表。 */
export interface StoredResidence extends ResidencePeriod {}

/**
 * 预测账本。**只增不改** —— 结算由 core-ledger 产出新对象后整条 put 回来，
 * 绝不在此处就地改字段。
 */
export interface StoredPrediction extends PredictionRecord {}

/** 负样本：「这年这方面平安无事」。只能由用户主动填写。 */
export interface StoredQuiet extends QuietRecord {}

/** 个人象意后验。可随时由账本重算，故此表是缓存而非事实来源。 */
export interface StoredPosterior extends XiangPosterior {
  /** 复合主键 `${personId}|${xiangId}`。 */
  key: string;
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
  residences!: Table<StoredResidence, string>;
  predictions!: Table<StoredPrediction, string>;
  quiets!: Table<StoredQuiet, string>;
  posteriors!: Table<StoredPosterior, string>;

  constructor() {
    super('hidefate');
    this.version(1).stores({
      properties: 'id, name, buildingType, updatedAt',
      members: 'id, propertyId, name',
      cures: 'id, propertyId, palace, appliedOn',
      scenarios: 'id, propertyId, createdAt',
      settings: 'key',
    });
    // v2：对轨回路的四张表。旧库升级时自动建表，既有资料不动。
    this.version(2).stores({
      residences: 'id, personId, propertyId, fromYear',
      predictions: 'id, personId, status, domain, createdAt',
      quiets: 'id, personId, year, domain',
      posteriors: 'key, personId, xiangId',
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
  const [properties, members, cures, scenarios, residences, predictions, quiets] = await Promise.all([
    d.properties.toArray(),
    d.members.toArray(),
    d.cures.toArray(),
    d.scenarios.toArray(),
    d.residences.toArray(),
    d.predictions.toArray(),
    d.quiets.toArray(),
  ]);
  // 后验（posteriors）刻意不导出 —— 它随时可由账本重算，
  // 导出它只会在导入后与账本不一致，且不一致时没人看得出来。
  return JSON.stringify(
    {
      version: 2,
      exportedAt: new Date().toISOString(),
      properties, members, cures, scenarios,
      residences, predictions, quiets,
    },
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
  residences?: StoredResidence[];
  predictions?: StoredPrediction[];
  quiets?: StoredQuiet[];
}

/** 导入 JSON（覆盖同 id 记录）。 */
export async function importAll(
  json: string,
): Promise<{ properties: number; members: number; predictions: number }> {
  const data = JSON.parse(json) as ExportShape;
  const d = db();
  await d.transaction(
    'rw',
    [d.properties, d.members, d.cures, d.scenarios, d.residences, d.predictions, d.quiets],
    async () => {
      if (data.properties?.length) await d.properties.bulkPut(data.properties);
      if (data.members?.length) await d.members.bulkPut(data.members);
      if (data.cures?.length) await d.cures.bulkPut(data.cures);
      if (data.scenarios?.length) await d.scenarios.bulkPut(data.scenarios);
      if (data.residences?.length) await d.residences.bulkPut(data.residences);
      if (data.predictions?.length) await d.predictions.bulkPut(data.predictions);
      if (data.quiets?.length) await d.quiets.bulkPut(data.quiets);
    },
  );
  return {
    properties: data.properties?.length ?? 0,
    members: data.members?.length ?? 0,
    predictions: data.predictions?.length ?? 0,
  };
}
