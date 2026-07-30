/**
 * 先看结果，再建档 —— 建房向导之前的快速分诊。
 *
 * 现有的建房向导有 6 步，第一次打开 App 的人要走完才看得到任何东西。
 * 这对「最近老生病，想看看是不是房子的问题」的人门槛太高了。
 *
 * 分诊只问三件事，**其中只有出生年是必填的**：
 *   1. 最近哪方面不顺（可跳过）—— 决定先给他看哪一类结论
 *   2. 大门朝哪（可跳过）—— 有它才起得了九宫盘
 *   3. 出生年 —— 命卦只需生年与性别，这一项就足以产出真结论
 *
 * 只填出生年时给出的是**八宅命卦层**的结论：四吉四凶方位。
 * 那不是安慰奖，是完整成立的一层判断（README 硬规则 #5）——
 * 但置信度必然很低，界面上会如实盖章，并列出每一条暂定的假设。
 *
 * 本文件只做**组装**：命卦、游年星、九宫盘全部来自 core-*，
 * 这里既不新算吉凶，也不新造数字。
 */

import { computeBaziChart, computeMingGua, type MingGuaResult } from '@hidefate/core-bazi';
import {
  PALACE_DIRECTION,
  YOU_NIAN_META,
  facingOf,
  personalDirections,
  type PropertyProfile,
  type RiskDomain,
} from '@hidefate/core-fengshui';
import {
  analyse,
  synthesise,
  type AnalysisInput,
  type Finding,
  type Member,
  type SynthesisResult,
} from '@hidefate/core-synthesis';
import { eightDirectionById } from './compass';
import { assessConfidence, confidenceLadder, type ConfidenceState, type LadderRow } from './confidence';

export interface TriageInput {
  /** 症状类别 id（见 lib/symptoms.ts）；null = 说不上来。 */
  readonly symptomId?: string | null;
  /** 大门朝向的八方 id；null = 跳过（此时不起九宫盘）。 */
  readonly facingEightId?: string | null;
  /** 唯一必填项。 */
  readonly birthYear: number;
  readonly gender: '男' | '女';
}

export interface ProvisionalOutcome {
  readonly findings: readonly Finding[];
  readonly confidence: ConfidenceState;
  readonly ladder: readonly LadderRow[];
  readonly mingGua: MingGuaResult;
  /** 有朝向时才起得出九宫盘；跳过朝向时为 null。 */
  readonly result: SynthesisResult | null;
  /** 暂用的档案（保存时可直接拿去建房）。 */
  readonly profile: PropertyProfile | null;
  readonly member: Member;
  /**
   * 为了先给出结果而暂定的假设，逐条列出。
   * 这些不是「小字」—— 界面上必须与结论并排显示。
   */
  readonly caveats: readonly string[];
}

/**
 * 游年星涉及哪些风险维度。
 *
 * 取自 `YOU_NIAN_META` 自带的 `governs` / `summary` 文本 ——
 * 是**读既有元数据打标**，不是另立一套吉凶判断。打标的用途只有一个：
 * 让分诊选的症状能筛出对应的方位。
 */
const DOMAIN_WORDS: Record<RiskDomain, readonly string[]> = {
  健康: ['健康', '病', '寿'],
  财运: ['财', '禄'],
  感情: ['感情', '婚姻', '桃花', '和合'],
  事业: ['事业', '升迁', '小人', '文昌'],
  人丁: ['添丁', '绝嗣', '人缘', '子女'],
  意外: ['意外', '横祸', '失窃', '火险', '手术'],
  官非: ['官非', '口舌', '争执'],
};

function domainsOfStar(governs: string, summary: string): RiskDomain[] {
  const text = `${governs}${summary}`;
  const out = (Object.keys(DOMAIN_WORDS) as RiskDomain[]).filter((d) =>
    DOMAIN_WORDS[d].some((w) => text.includes(w)),
  );
  // 一条都没打到时归入健康 —— 八宅游年星本就以人身吉凶为主
  return out.length ? out : ['健康'];
}

/**
 * 由命卦生成八宅个人方位的断语。
 *
 * 每条都满足 README 硬规则 #2 的三问：
 * 门派（八宅）、置信度、古法依据（大游年翻卦掌）。
 */
export function mingGuaFindings(mingGua: MingGuaResult): Finding[] {
  const dirs = personalDirections(mingGua.gua as never);
  const out: Finding[] = [];

  for (const d of [...dirs.best, ...dirs.worst]) {
    const meta = YOU_NIAN_META[d.star];
    out.push({
      schools: ['八宅'],
      // 命卦只需生年与性别即可定，故这一层本身是确凿的；
      // 「这间房子怎么样」的不确定性在别处，不该记在这条断语头上。
      confidence: '高',
      statement:
        `你是${mingGua.gua}${mingGua.number}命（${mingGua.group}），${PALACE_DIRECTION[d.palace]}` +
        `是你的「${d.star}」方（${meta.alias}·主${meta.governs}）。${meta.summary}`,
      principle:
        '八宅大游年：以命卦卦爻按翻卦掌变爻次序推得八方游年星。' +
        '命卦只需出生年与性别即可定，不受八字残缺影响 —— 缺月日时也照样成立。',
      impact: meta.power / 3,
      domains: domainsOfStar(meta.governs, meta.summary),
    });
  }
  return out;
}

/** 分诊用的暂定档案。每一处「暂定」都会同步写进 caveats。 */
function provisionalProfile(facingEightId: string, year: number): PropertyProfile | null {
  const e = eightDirectionById(facingEightId);
  if (!e) return null;
  // 用户报的是大门朝向（向首），整套理气以坐山起，故取其冲
  const sitting = facingOf(e.mountain).mountain.name;
  return {
    id: 'provisional',
    name: '待建档的房屋',
    buildingType: '公寓',
    sitting,
    moveInYear: year,
    missingCorners: [],
    rooms: [],
    xingShi: [],
    entryMode: '九宫格',
    enableQiMen: false,
  };
}

/**
 * 跑一次分诊。
 *
 * 保证：**只要给了出生年，findings 就非空** ——
 * 分诊页面永远有真东西可看，不会走完三步却拿到一张空屏。
 */
export function provisionalOutcome(input: TriageInput): ProvisionalOutcome {
  const year = new Date().getFullYear();
  const caveats: string[] = [];

  const mingGua = computeMingGua(input.birthYear, input.gender);
  const chart = computeBaziChart({ id: 'triage', gender: input.gender, year: input.birthYear });
  const member: Member = { id: 'triage', name: '你', chart, mingGua: chart.mingGua };

  caveats.push(
    '只用了出生年与性别，因此八字层面只有年柱可用 —— 日主、十神、身强弱一概未推算。' +
      '命卦与八宅方位不受影响，那一层是完整的。',
  );

  const findings: Finding[] = mingGuaFindings(mingGua);

  let profile: PropertyProfile | null = null;
  let result: SynthesisResult | null = null;

  if (input.facingEightId) {
    profile = provisionalProfile(input.facingEightId, year);
    if (profile) {
      caveats.push(
        `朝向按八方近似处理（每方 45°，一山只有 15°）—— 无法判断兼向与空亡，实测度数后结论可能变动。`,
      );
      caveats.push(`元运暂按今年（${year}）推，若房子是更早入住的，元运会不同，整盘随之改变。`);
      caveats.push('建筑类别暂按「公寓」，房间一间未标，故只到方位这一层，未计入房间轻重。');
      try {
        const analysisInput: AnalysisInput = {
          profile,
          members: [member],
          year,
          appliedCures: [],
          qiMen: null,
        };
        result = analyse(analysisInput, synthesise(analysisInput));
        for (const p of Object.values(result.palaces)) findings.push(...p.findings);
      } catch {
        // 起盘失败不该让整个分诊失败 —— 命卦那一层照样给得出来
        result = null;
        caveats.push('九宫盘暂时起不出来（朝向资料不足），当前只给出八宅命卦层的结论。');
      }
    }
  } else {
    caveats.push(
      // 这些文案是直接当纯文本渲染的，别写 markdown 记号
      '没有填大门朝向，因此没有起九宫盘 —— 以下只是你个人的八宅吉凶方位，' +
        '与具体哪一间房子无关。补上朝向才谈得上「这间房对你如何」。',
    );
  }

  return {
    findings,
    confidence: assessConfidence(profile, [member]),
    ladder: confidenceLadder(profile, [member]),
    mingGua,
    result,
    profile,
    member,
    caveats,
  };
}
