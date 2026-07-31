'use client';

/**
 * 占局的存取。
 *
 * 占局同样进预测账本 —— 它是三层里唯一能在几天内结算的一层，
 * 也就是取象收敛最快的证据来源。不进账本就白占了。
 *
 * 盘面本身另存一张表：账本只认「断语 + 判据 + 结论」，
 * 而盘面是排出来的中间产物，随时可由 `replayDivination()` 依时刻重建。
 */

import type { Divination } from '@hidefate/core-qimen';
import { freezePrediction, resolvePrediction, type PredictionRecord, type Verdict } from '@hidefate/core-ledger';
import { db, newId, type StoredDivinationRow } from './db';

/**
 * 复用 db 里的行类型，只把 `outcome` 收窄为账本的 Verdict ——
 * 两处各写一份接口迟早会漂移，而漂移的那一处不会有人发现。
 */
export type StoredDivination = Omit<StoredDivinationRow, 'outcome'> & { outcome?: Verdict };

/** 占局的领域归类 —— 与象意字典的映射表保持一致。 */
const CATEGORY_DOMAIN: Record<string, string> = {
  求财: '财运', 讨债: '财运', 寻物: '财运',
  功名: '事业', 竞赛: '事业',
  词讼: '官非', 官司: '官非', 追捕: '官非',
  婚姻: '感情',
  逃亡: '迁移', 出行: '迁移',
  避难: '意外', 盗贼: '意外',
  文书音讯: '人际', 口舌斗殴: '人际', 行人: '人际', 寻人: '人际',
  疾病: '健康',
  怀孕: '人丁',
  家宅: '家庭', 风水: '家庭',
};

/**
 * 存一局：盘面进 divinations 表，可结算的断语进账本。
 *
 * 账本那条的 `statement` 取占问原文加上用神落宫 —— 它必须能被
 * `resolution.criterion` 判定，所以照抄断法纲要没有用，那是方法不是结论。
 */
export async function saveDivination(d: Divination, id: string): Promise<StoredDivination> {
  const domain = (CATEGORY_DOMAIN[d.category] ?? '事业') as never;
  const yong = d.yongShen.map((y) => `${y.name}落${y.gong}宫`).join('、');

  const prediction: PredictionRecord = freezePrediction(
    {
      personId: 'self',
      engineVersion: d.engineSignature,
      inputHash: d.key,
      window: {
        fromYear: new Date(d.castAt).getFullYear(),
        toYear: new Date(d.resolveBy).getFullYear(),
        fromISO: d.castAt,
        toISO: d.resolveBy,
      },
      domain,
      statement: `占「${d.question}」${yong ? `——用神 ${yong}` : '——按综合断'}`,
      candidateXiangIds: [`qimen.${d.category}`],
      layers: ['运'],
      // 占局本身不预设吉凶，概率取中位；真正的判断在用神与年命的生克，
      // 那属于断局，本项目不代劳，交给使用者与 AI 解读。
      probability: 0.5,
      baseRate: null,
      resolution: { criterion: d.resolution.criterion, judge: d.resolution.judge },
      interventionability: '择时可避',
    },
    newId('pred'),
    d.castAt,
  );

  const row: StoredDivination = {
    id,
    key: d.key,
    sequence: d.sequence,
    question: d.question,
    category: d.category,
    castAt: d.castAt,
    resolveBy: d.resolveBy,
    juShu: d.juShu.fullName,
    status: '待结算',
    resolution: d.resolution,
    predictionId: prediction.id,
    chartJson: JSON.stringify(d),
  };

  await db().transaction('rw', [db().divinations, db().predictions], async () => {
    await db().divinations.put(row);
    await db().predictions.put(prediction);
  });
  return row;
}

export async function loadDivinations(): Promise<StoredDivination[]> {
  const rows = (await db().divinations.toArray()) as StoredDivination[];
  return rows.sort((a, b) => b.castAt.localeCompare(a.castAt));
}

/** 结算：账本那条走 core-ledger 的 resolve（产出新记录），本表只记结论。 */
export async function settleDivination(id: string, verdict: Verdict): Promise<void> {
  const row = await db().divinations.get(id);
  if (!row) return;
  const pred = await db().predictions.get(row.predictionId);
  if (pred && pred.status === '待结算') {
    const next = resolvePrediction(pred, { verdict, recordedAt: new Date().toISOString() });
    await db().predictions.put(next);
  }
  await db().divinations.put({ ...row, status: '已结算', outcome: verdict });
}

