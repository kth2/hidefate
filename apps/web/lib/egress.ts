'use client';

/**
 * 出网确认 —— 第一次真正把数据发出本机之前的那一道闸。
 *
 * 本 App 其余部分一律离线，AI 对话是唯一的例外。既然是唯一的例外，就不该
 * 用一句「我们可能会收集…」的模糊说明糊弄过去。这里的做法是：
 *
 *   1. **把真正要发出去的那串文本原样摆出来**，不是摘要，不是示意；
 *   2. 写清楚发往哪个主机名；
 *   3. 给两个开关，让用户把成员八字与健康类断语从上下文里剔掉再发。
 *
 * 剔除是真的从 payload 里删，不是发了再说「我们不看」——
 * 删掉的部分模型确实拿不到，代价是相关问题它答不了，这一点也如实写在界面上。
 */

import type { AppSettings } from './db';

export interface EgressExclusions {
  /** 剔除成员的八字四柱、日主、喜忌 —— 只留命卦（命卦只需生年性别）。 */
  readonly memberBazi: boolean;
  /** 剔除健康类预测与断语。 */
  readonly healthFindings: boolean;
}

export const DEFAULT_EXCLUSIONS: EgressExclusions = { memberBazi: false, healthFindings: false };

/** 目的地主机名。取不出来时原样回显用户填的字符串，不假装知道。 */
export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl.trim() || '（未填写）';
  }
}

/** 是否为本机地址 —— 本机推理其实没有出网，界面上该说清楚。 */
export function isLocalHost(baseUrl: string): boolean {
  const h = hostOf(baseUrl).split(':')[0]!.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local');
}

/** 八字相关的字段名 —— 出现在成员行的哪一段里就删哪一段。 */
const BAZI_BITS = ['八字精度', '已知柱', '日主', '未能推算', '无日柱'];

/**
 * 按用户的选择裁剪事实区块。
 *
 * 直接在 buildAnswerContext 产出的文本上做，因为那份文本本身就是要发出去的
 * 东西 —— 在别处裁剪都可能与实际发出的内容对不上，那会让上面那张预览失去意义。
 */
export function redactFacts(facts: string, ex: EgressExclusions): string {
  if (!ex.memberBazi && !ex.healthFindings) return facts;

  const out: string[] = [];
  let section = '';
  let droppedHealth = 0;
  let trimmedMembers = 0;

  for (const line of facts.split('\n')) {
    if (line.startsWith('#')) section = line;

    if (ex.healthFindings && section.includes('本年预测') && line.startsWith('- [健康]')) {
      droppedHealth += 1;
      continue;
    }

    if (ex.memberBazi && section.includes('成员与命理') && line.startsWith('- ')) {
      const bits = line.slice(2).split('｜');
      const kept = bits.filter((b) => !BAZI_BITS.some((k) => b.includes(k)));
      if (kept.length !== bits.length) trimmedMembers += 1;
      out.push(`- ${kept.join('｜')}｜（八字四柱与日主已按用户要求剔除，只保留命卦）`);
      continue;
    }

    out.push(line);
  }

  const notes: string[] = [];
  if (trimmedMembers) {
    notes.push(
      `已剔除 ${trimmedMembers} 位成员的八字四柱与日主喜忌。凡需用到八字的结论一概不可作答，请直接说明「该资料未提供」。`,
    );
  }
  if (droppedHealth) {
    notes.push(`已剔除 ${droppedHealth} 条健康类预测。涉及健康的问题请说明「该项未提供」，不要凭其余资料推测。`);
  }
  return notes.length ? `${out.join('\n')}\n\n# 用户已剔除的内容\n${notes.map((n) => `- ${n}`).join('\n')}` : out.join('\n');
}

/**
 * 组装出网预览 —— **必须与实际发出的请求体逐字一致**。
 * 预览与真实请求各算各的，是这类界面最常见也最要命的谎言。
 */
export function serialiseEgressPayload(input: {
  readonly model: string;
  readonly system: string;
  readonly facts: string;
  readonly question: string;
  readonly exclusions: EgressExclusions;
}): string {
  return JSON.stringify(
    {
      model: input.model,
      messages: [
        {
          role: 'system',
          content: `${input.system}\n\n===== 事实（由确定性引擎算出，不可修改） =====\n${redactFacts(input.facts, input.exclusions)}`,
        },
        { role: 'user', content: input.question },
      ],
      stream: true,
      temperature: 0.4,
    },
    null,
    2,
  );
}

/** 出网闸门的判定结果。 */
export type EgressGate = 'blocked' | 'allowed';

/**
 * 第一次出网前必须拿到确认。
 *
 * 只看 `aiEgressConsentAt` 一个字段：确认过一次就不再打扰
 * （用户随时可在 AI 设置里撤回）。
 */
export function guardEgress(settings: Pick<AppSettings, 'aiEgressConsentAt'> | null): EgressGate {
  return settings?.aiEgressConsentAt ? 'allowed' : 'blocked';
}

export function needsEgressConsent(settings: Pick<AppSettings, 'aiEgressConsentAt'> | null): boolean {
  return guardEgress(settings) === 'blocked';
}

/** 从设置里读出当前的剔除选项。 */
export function exclusionsOf(
  settings: Pick<AppSettings, 'aiExcludeMemberBazi' | 'aiExcludeHealthFindings'> | null,
): EgressExclusions {
  return {
    memberBazi: Boolean(settings?.aiExcludeMemberBazi),
    healthFindings: Boolean(settings?.aiExcludeHealthFindings),
  };
}
