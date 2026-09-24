/**
 * 概率预测引擎。
 *
 * 输出的每一个百分比都必须能被追问「你怎么算出来的」，所以：
 *   - 所有加权项逐条记录在 Prediction.breakdown 中
 *   - 概率由 logistic 收敛到 [3%, 92%] —— 风水不是决定论，
 *     绝不输出 0% 或 100%，也绝不承诺「必定发生」
 *   - 每条预测都必须挂上至少一条「化凶」建议，无解则不出预测
 *
 * **按人算，不按全家摊。** 同一间房对不同的人轻重不同：
 *   - 卧房、书房这类专属房只影响它的使用者；没指定使用者就不落到任何人头上
 *   - 大门、客厅、厨房全家共用，人人都受影响，但比自己的卧房轻
 *   - 每人各算一个概率（`perMember`），不把几个人的命卦分数加在一起 ——
 *     早先的做法是全家相加，于是家里人越多、每条预测的概率就越高
 *
 * 房间优先级严格遵循：大门 > 主卧 > 厨房 > 儿童房 > 客厅。
 */

import {
  BUILDING_PROFILES,
  PALACE_DIRECTION,
  PALACE_FAMILY,
  ROOM_PRIORITY,
  STAR_META,
  STAR_NAME,
  STAR_WUXING,
  YOU_NIAN_META,
  crossPersonHouse,
  exposureOf,
  organRisksOf,
  personalDirections,
  roomExposure,
  roomNature,
  scenarioProfile,
  starScore,
  type PalaceIndex,
  type RiskDomain,
  type RoomKind,
  type RoomPlacement,
  type WuXing,
} from '@hidefate/core-fengshui';
import {
  riskLevelOf,
  type AnalysisInput,
  type ConfidenceLevel,
  type Cure,
  type Finding,
  type Member,
  type MemberExposure,
  type PalaceAssessment,
  type Prediction,
  type SynthesisResult,
} from './types.js';

/** 概率上下限 —— 永不输出确定性断言。 */
export const PROB_FLOOR = 0.03;
export const PROB_CEIL = 0.92;

/** 低于此概率不出报（强制规则除外），避免刷屏。 */
export const REPORT_THRESHOLD = 0.18;

/** 基准：默认低风险，须有实据才抬升。 */
const BASE_LOGIT = -1.15;

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

const label = (r: { label?: string; kind: string }) => r.label ?? r.kind;

function squash(logit: number): number {
  return Math.max(PROB_FLOOR, Math.min(PROB_CEIL, logistic(logit)));
}

/** 关系风险的凶星（主卧见此四者即触发感情预警）。 */
export const RELATIONSHIP_ALARM_BAZHAI = new Set(['五鬼', '六煞']);
export const RELATIONSHIP_ALARM_STARS = new Set<PalaceIndex>([2, 5]);

interface Contribution {
  factor: string;
  contribution: number;
  note: string;
}

/** 某位成员受某一宫影响的方式。 */
interface Exposed {
  readonly member: Member;
  readonly exposure: number;
  readonly via: string;
  readonly room: RoomPlacement;
}

/** 这一宫影响到哪些人、影响多深。取该宫内对此人影响最大的那间房。 */
export function exposuresFor(a: PalaceAssessment, members: readonly Member[]): Exposed[] {
  const out: Exposed[] = [];
  for (const m of members) {
    let best: Exposed | null = null;
    for (const r of a.rooms) {
      const e = exposureOf(r, m.id);
      if (e > 0 && (!best || e > best.exposure)) best = { member: m, exposure: e, via: viaText(r, m, e), room: r };
    }
    if (best) out.push(best);
  }
  return out.sort((x, y) => y.exposure - x.exposure);
}

function viaText(r: RoomPlacement, m: Member, e: number): string {
  const kind = roomExposure(r.kind);
  if (e >= 1) return kind === '专属' ? `${label(r)}是${m.name}的房间` : `${m.name}常待${label(r)}`;
  return kind === '共用' ? `全家共用${label(r)}` : `${label(r)}偶尔经过`;
}

/**
 * 成员八字与某宫五行的契合度。
 *
 * 用喜忌五行去看「这个宫位为患的那颗星，是不是正好打在这个人的忌神上」——
 * 是则风险显著上调；若该五行恰为其喜用，则同一颗凶星对其杀伤明显较小。
 * 无日主（八字残缺）时此项为 0，并在 note 中说明，不作臆测。
 */
function baziAffinity(member: Member, hostileWuXing: readonly WuXing[], direction: string): Contribution {
  const es = member.chart.elementStrength;
  if (!es.dayMasterElement || es.verdict === '无法判定') {
    return {
      factor: '八字五行契合',
      contribution: 0,
      note: `${member.name}八字${member.chart.confidence.label}，无日主可依，本项不参与加权（命卦部分仍完整参与）。`,
    };
  }
  if (hostileWuXing.length === 0) {
    return { factor: '八字五行契合', contribution: 0, note: `${direction}此宫无失令之凶星，与${member.name}的喜忌无冲。` };
  }
  const hitUnfav = hostileWuXing.filter((w) => es.unfavourable.includes(w));
  const hitFav = hostileWuXing.filter((w) => es.favourable.includes(w));
  const contribution = hitUnfav.length * 0.55 - hitFav.length * 0.4;
  const note =
    hitUnfav.length > 0
      ? `${member.name}日主${es.dayMasterElement}、${es.verdict}，忌${es.unfavourable.join('')}；本宫为患之${hitUnfav.join('')}正中其忌，风险上调。`
      : hitFav.length > 0
        ? `${member.name}喜${es.favourable.join('')}，本宫之${hitFav.join('')}反为其用，同一颗星对其杀伤较轻。`
        : `${member.name}喜${es.favourable.join('')}、忌${es.unfavourable.join('')}，与本宫为患五行无直接生克，本项中性。`;
  return { factor: '八字五行契合', contribution, note };
}

/**
 * 命卦与该宫的八宅交叉 —— 只取「此方于其命」的那颗星。
 *
 * 宅之八宅星对全家一样，已计入宫位合参分；再加一次就是重复计分，
 * 而且会把「这个人」与「这间房子」的差别抹平。
 */
function mingGuaAffinity(member: Member, houseGua: string, palace: PalaceIndex): Contribution {
  if (palace === 5) {
    return { factor: '八宅命卦', contribution: 0, note: '中宫不入八宅论断。' };
  }
  const cell = crossPersonHouse(houseGua as never, member.mingGua.gua as never)[palace as Exclude<PalaceIndex, 5>];
  const meta = YOU_NIAN_META[cell.personStar];
  return {
    factor: '八宅命卦',
    contribution: -meta.power * 0.3,
    note:
      `${member.name}为${member.mingGua.gua}${member.mingGua.number}命（${member.mingGua.group}），` +
      `${PALACE_DIRECTION[palace]}于其命为「${cell.personStar}」（${meta.governs}）` +
      `${meta.auspicious ? '，对其有利' : '，是其凶方'}。` +
      `${cell.harmonised ? '' : '宅命异组，其人住此宅本就吃力。'}`,
  };
}

/**
 * 个人化解：此人的专属房落在其命卦凶方时，教他把床头／座位转向自己的吉方。
 *
 * 这是八宅里最省事、最个人化的一条 —— 房间挪不动时，「坐凶向吉」仍可挽回大半。
 */
function personalCures(a: PalaceAssessment, exposed: readonly Exposed[], houseGua: string, domain: RiskDomain): Cure[] {
  if (a.palace === 5) return [];
  const out: Cure[] = [];
  for (const e of exposed) {
    if (e.exposure < 1 || roomExposure(e.room.kind) !== '专属') continue;
    const cell = crossPersonHouse(houseGua as never, e.member.mingGua.gua as never)[a.palace as Exclude<PalaceIndex, 5>];
    const meta = YOU_NIAN_META[cell.personStar];
    if (meta.auspicious) continue;
    const best = personalDirections(e.member.mingGua.gua as never).best.slice(0, 2);
    const facing = best.map((b) => `${PALACE_DIRECTION[b.palace]}（${b.star}）`).join('或');
    const isBed = e.room.kind.includes('卧') || e.room.kind === '儿童房' || e.room.kind === '老人房' || e.room.kind === '客房';
    out.push({
      priority: 2,
      palace: a.palace,
      direction: a.direction,
      room: label(e.room),
      action:
        `${e.member.name}：${isBed ? '床头' : '座位'}改朝${facing}。` +
        `${label(e.room)}落在其「${cell.personStar}」方，房间挪不动时，把${isBed ? '床头' : '座位'}转向自己的吉方最省事。`,
      rationale: `八宅以命卦定个人吉凶方：「${cell.personStar}」主${meta.governs}；坐凶向吉，可挽回大半。`,
      avoid: ['床头靠窗或悬梁', `${isBed ? '床头' : '座位'}朝向其四凶方`],
      domains: [domain],
      urgency: meta.power <= -3 ? '本年内' : '可从容安排',
      intent: '化凶',
      memberId: e.member.id,
    });
  }
  return out;
}

/** 生成一个宫位对某一维度的预测。 */
function buildPrediction(
  id: string,
  domain: RiskDomain,
  assessment: PalaceAssessment,
  input: AnalysisInput,
  synthesis: SynthesisResult,
  exposed: readonly Exposed[],
  extraFindings: readonly Finding[] = [],
  extraLogit = 0,
  /**
   * 强制规则：即使算出的概率很低也必须出报。
   * 用于「主卧见五鬼/六煞/二黑/五黄」这类古法明列、不容漏报的红线，
   * 概率仍按实算值如实呈现，绝不为了「看起来严重」而人为抬高。
   */
  mandatory = false,
): Prediction | null {
  const p = assessment.palace;
  const common: Contribution[] = [];
  const buildingWeight = BUILDING_PROFILES[input.profile.buildingType].weights;

  // 1. 宫位综合风险（负分即风险）
  const palaceRisk = -assessment.score;
  common.push({
    factor: '宫位三派合参分',
    contribution: palaceRisk * 2.4,
    note: `${assessment.direction}综合分 ${assessment.score.toFixed(2)}（${assessment.riskLevel}），由飞星${assessment.combinationName}、八宅${assessment.baZhaiStar ?? '—'}、流年${STAR_NAME[assessment.stars.annual]}${assessment.qiMen ? `、奇门${assessment.qiMen.men || '中宫'}` : ''}加权而得。`,
  });

  // 2. 房间权重 —— 同一颗凶星落在大门与落在储藏室，后果天差地别
  const topRoom = assessment.rooms.slice().sort((a, b) => ROOM_PRIORITY[b.kind] - ROOM_PRIORITY[a.kind])[0] ?? null;
  const roomWeight = topRoom ? ROOM_PRIORITY[topRoom.kind] : 0.3;

  /**
   * 房间的宜忌取向必须参与加权，否则会得出与实务相反的结论。
   *
   * 古法「吉方宜开、凶方宜压」：厕所、储藏、楼梯这类空间落在凶方，是**正解**而非问题
   * —— 它们把凶星压住了。故此处按 nature 分三种算法。
   *
   * 宜吉／中性之房是**放大**本宫吉凶，而不是固定加一笔风险：
   * 主卧落在吉方应当更安全，落在凶方才更危险。早先不论吉凶一律加分，
   * 于是综合分接近零的宫位，只因放了主卧就被报成八成以上的风险。
   */
  const nature = topRoom ? roomNature(topRoom.kind) : '中性';
  const palaceIsBad = assessment.score < 0;
  let roomContribution: number;
  let roomNote: string;

  if (!topRoom) {
    roomContribution = -0.3;
    roomNote = '此宫未标注房间，按少有人停留计；补标房间后预测会显著更准。';
  } else if (nature === '宜凶') {
    // 压凶到位则显著减险；占了吉方则是浪费吉气（由布局体检另行指出，不在此重复计负）
    roomContribution = palaceIsBad ? -roomWeight * 1.5 : -0.2;
    roomNote = palaceIsBad
      ? `此宫为「${label(topRoom)}」，属「宜凶」之用途 —— 正好压住本宫凶星，合古法「凶方宜压」，故风险大幅下调。`
      : `此宫为「${label(topRoom)}」，属「宜凶」之用途，却占了本宫吉气（详见布局体检），此处不计其为风险。`;
  } else {
    const k = nature === '中性' ? 0.8 : 1.6;
    roomContribution = palaceRisk * roomWeight * k;
    roomNote =
      `此宫为「${label(topRoom)}」（${nature === '中性' ? '中性' : '宜吉'}之用途，权重 ${roomWeight.toFixed(2)}），` +
      `放大本宫${palaceIsBad ? '凶' : '吉'}性（严格序：大门 > 主卧 > 厨房 > 儿童房 > 客厅）。`;
  }
  common.push({ factor: '房间权重与宜忌', contribution: roomContribution, note: roomNote });

  // 3. 建筑类别维度权重
  const bw = (buildingWeight as Record<string, number>)[domain] ?? 1;
  common.push({
    factor: '建筑类别侧重',
    contribution: (bw - 1) * 1.2,
    note: `${input.profile.buildingType}在「${domain}」维度权重 ${bw.toFixed(2)}：${BUILDING_PROFILES[input.profile.buildingType].note}`,
  });

  const commonSum = common.reduce((s, c) => s + c.contribution, 0);
  /** 按宅论（没有具体的人）时的 logit。 */
  const placeLogit = BASE_LOGIT + commonSum + extraLogit;

  // 4. 逐人：命卦 × 八字 × 受影响程度，各算各的
  const hostile: WuXing[] = [];
  for (const s of [assessment.stars.shan, assessment.stars.xiang, assessment.stars.annual]) {
    if (starScore(s, synthesis.flyingStar.period.period) < -0.2) hostile.push(STAR_WUXING[s]);
  }
  const findings: Finding[] = [...extraFindings];
  const perMember: MemberExposure[] = exposed
    .map((e) => {
      const b = baziAffinity(e.member, hostile, assessment.direction);
      const g = mingGuaAffinity(e.member, synthesis.baZhai.houseGua, p);
      const scale = (c: Contribution): Contribution => ({ ...c, contribution: c.contribution * e.exposure });
      /**
       * 受影响程度乘在「此处的风险」整体上，而不只是个人项：
       * 偶尔经过的阳台，凶星再重也不该对人报出与自己卧房同等的概率。
       */
      const personal = [
        {
          factor: '受影响程度',
          contribution: (commonSum + extraLogit) * (e.exposure - 1),
          note: `${e.via}，此处风险按 ${Math.round(e.exposure * 100)}% 计入。`,
        },
        scale(g),
        scale(b),
      ];
      findings.push({
        schools: ['八宅', '八字命理'],
        confidence: e.member.chart.confidence.level === '高' ? '高' : '中',
        statement: `${g.note}${b.contribution !== 0 ? b.note : ''}`,
        principle: '八宅以命卦定人之四吉四凶；八字以日主喜忌定同一颗星对不同人的轻重。二者交叉，才是「这个人住这间房」的真实吉凶。',
        impact: -(b.contribution + g.contribution) / 3,
        domains: [domain],
      });
      const logit = BASE_LOGIT + (commonSum + extraLogit + b.contribution + g.contribution) * e.exposure;
      return {
        memberId: e.member.id,
        name: e.member.name,
        probability: squash(logit),
        exposure: e.exposure,
        via: e.via,
        breakdown: personal,
      };
    })
    .sort((x, y) => y.probability - x.probability);

  const probability = perMember[0]?.probability ?? squash(placeLogit);
  if (probability < REPORT_THRESHOLD && !mandatory) return null;

  // 化解只挂「化凶」—— 催吉的句子放在风险条目下，会变成「报凶却教你催吉」
  const fix = assessment.cures.filter((c) => c.intent === '化凶');
  const relevant = fix.filter((c) => c.domains.includes(domain));
  let cures: Cure[] = [
    ...(relevant.length ? relevant : fix),
    ...personalCures(assessment, exposed, synthesis.baZhai.houseGua, domain),
  ];
  if (cures.length === 0) {
    // 铁律：无化解则不出预测。强制规则例外 —— 改为补一条通用化解，绝不漏报。
    if (!mandatory) return null;
    cures = [{
      priority: 1,
      palace: p,
      direction: assessment.direction,
      room: topRoom ? label(topRoom) : null,
      action: `${assessment.direction}主卧：将床头调向本宅四吉方，卧房保持整洁通风、忌镜对床；夫妻卧房宜设于延年方以固感情。`,
      rationale: '八宅论方不论星，房间挪不动时，「坐凶向吉」仍可挽回大半；延年（武曲）主婚姻和合、寿元绵长。',
      avoid: ['卧房堆放杂物与旧物', '床头靠窗或悬梁', '房内摆放尖角利器与仿真花'],
      domains: ['感情'],
      urgency: '本年内',
      intent: '化凶',
    }];
  }

  const confidence: ConfidenceLevel =
    synthesis.confidence.level === '高' && assessment.findings.length >= 3 ? '高'
      : synthesis.confidence.level === '低' ? '低' : '中';

  // 明细以受影响最深者为准：宫位共同项 + 其个人项
  const top = perMember[0];
  const breakdown: Contribution[] = top
    ? [...common, ...top.breakdown]
    : [...common, {
        factor: '受影响的人',
        contribution: 0,
        note: topRoom && roomExposure(topRoom.kind) === '专属'
          ? `「${label(topRoom)}」还没指定谁住，只能按宅论，算不到具体的人。到成员页指定住哪间，这一条就会落到人身上。`
          : '此处少有人停留，按宅论。',
      }];

  return {
    id,
    domain,
    probability,
    riskLevel: riskLevelOf(-(probability - 0.35) * 2),
    year: synthesis.year,
    palace: p,
    direction: assessment.direction,
    room: topRoom ? label(topRoom) : null,
    roomKind: topRoom?.kind ?? null,
    memberIds: perMember.filter((m) => m.probability >= REPORT_THRESHOLD || mandatory).map((m) => m.memberId),
    perMember,
    headline: headlineFor(domain, assessment, topRoom?.kind ?? null, probability, perMember),
    findings: [...assessment.findings.filter((f) => f.domains.some((d) => d === domain)), ...findings],
    cures,
    confidence,
    breakdown,
  };
}

function headlineFor(
  domain: RiskDomain,
  a: PalaceAssessment,
  roomKind: RoomKind | null,
  prob: number,
  perMember: readonly MemberExposure[],
): string {
  const shown = perMember.filter((m) => m.probability >= REPORT_THRESHOLD).slice(0, 3);
  const who = shown.length === 0 ? '住在这一带的人' : shown.map((m) => m.name).join('、');
  const where = roomKind ? `${a.direction}的${roomKind}` : a.direction;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const odds = shown.length > 1 ? `：${shown.map((m) => `${m.name} ${pct(m.probability)}`).join('、')}` : `约 ${pct(prob)}`;
  const map: Record<RiskDomain, string> = {
    健康: `${where}对${who}的健康构成压力，本年出现相关症状或就医的机率${odds}`,
    财运: `${where}影响${who}的财路，本年出现破财、投资失利或收入停滞的机率${odds}`,
    感情: `${where}不利${who}的感情，本年出现争执、疏离或第三者困扰的机率${odds}`,
    事业: `${where}牵动${who}的事业，本年出现升迁受阻或职务动荡的机率${odds}`,
    人丁: `${where}关乎${who}的人丁与家运，本年相关波折机率${odds}`,
    意外: `${where}有意外之虞，${who}本年发生跌碰、器械伤或突发事故的机率${odds}`,
    官非: `${where}主口舌官非，${who}本年卷入争讼、合约纠纷的机率${odds}`,
  };
  return map[domain];
}

/**
 * 生成全部预测。
 *
 * 三条硬规则：
 *   1. 按房间优先级排序，大门与主卧的问题永远排在储藏室前面
 *   2. 健康风险走独立的脏腑映射引擎
 *   3. 主卧见五鬼/六煞/二黑/五黄 → 强制触发感情预警
 */
export function predict(input: AnalysisInput, synthesis: SynthesisResult): Prediction[] {
  const out: Prediction[] = [];
  const period = synthesis.flyingStar.period.period;

  for (const p of Object.keys(synthesis.palaces).map(Number) as PalaceIndex[]) {
    const a = synthesis.palaces[p];
    const exposed = exposuresFor(a, input.members);

    // --- 健康风险引擎（脏腑映射）---
    const organRisks = organRisksOf([a.stars.shan, a.stars.xiang, a.stars.annual], period);
    if (organRisks.length > 0 && a.score < 0.1) {
      const organs = Array.from(new Set(organRisks.slice(0, 4).map((o) => o.organ)));
      const ailments = Array.from(new Set(organRisks.flatMap((o) => o.ailments))).slice(0, 5);
      const famNote = PALACE_FAMILY[p];
      const f: Finding = {
        schools: ['玄空飞星', '形峦缺角'],
        confidence: '高',
        statement:
          `${a.direction}失令之星应${organs.join('、')}，须留意${ailments.join('、')}；` +
          `此方于后天八卦属${famNote.member}位，故${famNote.member}受应最深。`,
        principle: '九星各有所属脏腑：一白肾耳、二黑脾胃、三碧肝足、四绿胆股、五黄毒瘤、六白肺骨、七赤口齿、八白脾关节、九紫心目。星失令则其所主之腑先见征兆。',
        impact: -0.5,
        domains: ['健康'],
      };
      const pred = buildPrediction(`health-${p}`, '健康', a, input, synthesis, exposed, [f], 0.35);
      if (pred) out.push(pred);
    }

    // --- 感情风险强制触发 ---
    const isMasterBedroom = a.rooms.some((r) => r.kind === '主卧');
    const badBaZhai = a.baZhaiStar && RELATIONSHIP_ALARM_BAZHAI.has(a.baZhaiStar);
    const badStar = [a.stars.shan, a.stars.xiang, a.stars.annual].filter((s) => RELATIONSHIP_ALARM_STARS.has(s));
    if (isMasterBedroom && (badBaZhai || badStar.length > 0)) {
      const reasons: string[] = [];
      if (badBaZhai) reasons.push(`宅之${a.direction}为「${a.baZhaiStar}」方（${YOU_NIAN_META[a.baZhaiStar!].governs}）`);
      if (badStar.length) reasons.push(`见${badStar.map((s) => STAR_NAME[s]).join('、')}`);
      const f: Finding = {
        schools: badBaZhai && badStar.length ? ['八宅', '玄空飞星'] : badBaZhai ? ['八宅'] : ['玄空飞星'],
        confidence: '高',
        statement: `主卧落于${a.direction}，${reasons.join('，')} —— 触发夫妻关系预警。此为强制规则，凡主卧见五鬼、六煞、二黑、五黄之一即报。`,
        principle: '五鬼主小人暗算与情绪失控，六煞主桃花酒色与无谓损耗，二黑主久病与阴气，五黄主横祸。四者临主卧，先坏枕边气氛，久则伤情分。',
        impact: -0.65,
        domains: ['感情'],
      };
      // 感情预警只落在睡主卧的人身上 —— 孩子不因父母的卧房吉凶而「感情受压」。
      const couple = exposed.filter((e) => e.room.kind === '主卧' && e.exposure >= 1);
      // mandatory = true：此为古法红线，无论算出概率高低都必须出报。
      const pred = buildPrediction(`relation-${p}`, '感情', a, input, synthesis, couple, [f], 0.5, true);
      if (pred) out.push(pred);
    }

    // --- 其余维度依组合本身所主 ---
    const domains = new Set<RiskDomain>();
    for (const f of a.findings) for (const d of f.domains) domains.add(d);
    for (const d of domains) {
      if (d === '健康' || d === '感情') continue; // 上面已专门处理
      const pred = buildPrediction(`${d}-${p}`, d, a, input, synthesis, exposed);
      if (pred) out.push(pred);
    }
  }

  /**
   * 排序：房间优先级 → 概率。
   *
   * 房间序按场景取 —— 居家用「大门 > 主卧 > 厨房 > 小孩房 > 客厅」，
   * 商业用「大门 > 收银台 > 老板位 > 办公位 > 前台」。
   * 此前只有一套居家序，用在店铺上会把主卧排到收银台前面，显然不合。
   */
  const order = scenarioProfile(input.profile.buildingType).roomOrder;
  const roomRank = (k: RoomKind | null) => (k ? order.indexOf(k) : -1);
  return out.sort((x, y) => {
    const rx = roomRank(x.roomKind);
    const ry = roomRank(y.roomKind);
    const nx = rx < 0 ? 99 : rx;
    const ny = ry < 0 ? 99 : ry;
    if (nx !== ny) return nx - ny;
    return y.probability - x.probability;
  });
}

/** 合参 + 预测一步到位。 */
export function analyse(
  input: AnalysisInput,
  synthesis: SynthesisResult,
): SynthesisResult {
  return { ...synthesis, predictions: predict(input, synthesis) };
}

/** 某成员在这条预测上的个人概率；此条不涉及此人则为 null。 */
export function probabilityFor(pred: Prediction, memberId: string): number | null {
  if (!pred.memberIds.includes(memberId)) return null;
  return pred.perMember.find((m) => m.memberId === memberId)?.probability ?? null;
}

/** 某成员在本年的全部预测，按此人的个人概率从高到低。 */
export function predictionsForMember(preds: readonly Prediction[], memberId: string): Prediction[] {
  return preds
    .filter((p) => p.memberIds.includes(memberId))
    .sort((a, b) => (probabilityFor(b, memberId) ?? 0) - (probabilityFor(a, memberId) ?? 0));
}

export { STAR_META };
