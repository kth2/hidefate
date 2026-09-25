/**
 * 家人的身份：后天八卦六亲 + 人生阶段。
 *
 * 两件事都是为了让「房子对这个人意味着什么」说得具体：
 *
 * 1. **六亲应象**：后天八卦每宫各主一位家人（乾父、坤母、震长男、坎中男、艮少男、
 *    巽长女、离中女、兑少女）。西北缺角、二黑到西北，古法断「应在男主人」——
 *    不管他睡不睡在西北。所以一宫的吉凶，除了落在用这间房的人身上，
 *    还要落在这一宫所主的那位家人身上。
 * 2. **人生阶段**：同一句「事业受阻」，对十二岁的孩子毫无意义 —— 对他是学业；
 *    「官非」对他是和同学师长起口角；财运、感情、人丁则根本不该报给孩子。
 *    长者与小儿气弱，健康与意外要看得更重。
 *
 * 六亲先认称谓（「长子」「女主人」），认不出再按性别与年龄推定，并明说是推定的。
 */

import type { PalaceIndex, RiskDomain } from '@hidefate/core-fengshui';
import type { Member } from './types.js';

export type FamilyRole = '父' | '母' | '长男' | '中男' | '少男' | '长女' | '中女' | '少女';

/** 六亲所主之宫（后天八卦）。 */
export const ROLE_PALACE: Readonly<Record<FamilyRole, PalaceIndex>> = {
  父: 6, 母: 2, 长男: 3, 中男: 1, 少男: 8, 长女: 4, 中女: 9, 少女: 7,
};

export const ROLE_LABEL: Readonly<Record<FamilyRole, string>> = {
  父: '父亲／男主人', 母: '母亲／女主人',
  长男: '长子', 中男: '次子', 少男: '幼子',
  长女: '长女', 中女: '次女', 少女: '幼女',
};

export interface FamilyRoleInfo {
  readonly role: FamilyRole;
  /** 依据：认了称谓，还是按性别年龄推定。 */
  readonly basis: '称谓' | '推定';
  readonly reason: string;
}

/** 称谓关键词 → 六亲。顺序有意义：先长后短，免得「长女」被「女」吃掉。 */
const RELATION_KEYWORDS: readonly [RegExp, FamilyRole][] = [
  [/长子|大儿子/, '长男'],
  [/次子|二儿子/, '中男'],
  [/幼子|小儿子|三子/, '少男'],
  [/长女|大女儿/, '长女'],
  [/次女|二女儿/, '中女'],
  [/幼女|小女儿|三女/, '少女'],
  [/男主人|父亲|爸爸|丈夫|老公|先生|户主/, '父'],
  [/女主人|母亲|妈妈|妻子|老婆|太太/, '母'],
];

/**
 * 祖辈：只有在没人以「男主人／女主人」等称谓认领时，才补父母之位；
 * 认领不到也不排进子女序 —— 爷爷不该变成「长男」。
 */
const ELDER_KEYWORDS: readonly [RegExp, FamilyRole][] = [
  [/爷爷|外公|祖父|姥爷/, '父'],
  [/奶奶|外婆|祖母|姥姥/, '母'],
];

function birthYear(m: Member): number {
  return m.chart.input.year;
}

/**
 * 推定全家每个人的六亲。
 *
 * 规则：
 *   1. 称谓认得出的，照称谓
 *   2. 父、母尚空缺时，由最年长的成年男性／女性补上
 *   3. 其余男孩女孩按出生先后排长、中、少（第四个起都算少）
 *   4. 独居者即宅主，按性别归父或母
 * 同一个位子被两人的称谓同时认领时，年长者得之，另一人按第 3 条重排。
 */
export function assignFamilyRoles(members: readonly Member[], year: number): Map<string, FamilyRoleInfo> {
  const out = new Map<string, FamilyRoleInfo>();
  const taken = new Set<FamilyRole>();
  const byAge = [...members].sort((a, b) => birthYear(a) - birthYear(b));

  const elders = new Set<string>();
  for (const table of [RELATION_KEYWORDS, ELDER_KEYWORDS]) {
    for (const m of byAge) {
      const rel = m.relation?.trim();
      if (!rel || out.has(m.id)) continue;
      const hit = table.find(([re]) => re.test(rel));
      if (!hit) continue;
      if (table === ELDER_KEYWORDS) elders.add(m.id);
      if (taken.has(hit[1])) continue;
      out.set(m.id, { role: hit[1], basis: '称谓', reason: `称谓「${rel}」` });
      taken.add(hit[1]);
    }
  }

  const rest = byAge.filter((m) => !out.has(m.id) && !elders.has(m.id));
  const isMale = (m: Member) => m.chart.input.gender === '男';
  const adult = (m: Member) => year - birthYear(m) >= 18;

  if (members.length === 1 && rest.length === 1) {
    const m = rest[0]!;
    const role: FamilyRole = isMale(m) ? '父' : '母';
    out.set(m.id, { role, basis: '推定', reason: '独居即宅主' });
    return out;
  }

  for (const [role, pickMale] of [['父', true], ['母', false]] as const) {
    if (taken.has(role)) continue;
    const m = rest.find((x) => !out.has(x.id) && isMale(x) === pickMale && adult(x));
    if (!m) continue;
    out.set(m.id, { role, basis: '推定', reason: `家中最年长的成年${pickMale ? '男性' : '女性'}` });
    taken.add(role);
  }

  const order = (male: boolean): FamilyRole[] => (male ? ['长男', '中男', '少男'] : ['长女', '中女', '少女']);
  for (const male of [true, false]) {
    const kids = rest.filter((x) => !out.has(x.id) && isMale(x) === male);
    const free = order(male).filter((r) => !taken.has(r));
    kids.forEach((k, i) => {
      const role = free[Math.min(i, free.length - 1)];
      if (!role) return;
      out.set(k.id, {
        role,
        basis: '推定',
        reason: `按出生先后排为${ROLE_LABEL[role]}`,
      });
      taken.add(role);
    });
  }
  return out;
}

export type LifeStage = '儿童' | '少年' | '成人' | '长者';

export function lifeStageOf(m: Member, year: number): LifeStage {
  const age = year - birthYear(m);
  if (age < 13) return '儿童';
  if (age < 18) return '少年';
  if (age >= 65) return '长者';
  return '成人';
}

/**
 * 人生八个方面 —— 风水师看一个人时逐项过的那几件事。
 *
 * 引擎内部的维度（RiskDomain）是古法的应事分类；这里是给人看的叫法：
 * 「人丁」读作子女、「官非」读作人际（口舌是非、官司都在其中）。
 * 孩子没有事业财运感情可言，也不谈子女；长者不谈学业。
 */
export type Aspect = '健康' | '意外' | '感情' | '子女' | '学业' | '事业' | '财运' | '人际';

export const ASPECTS: readonly Aspect[] = ['健康', '意外', '感情', '子女', '学业', '事业', '财运', '人际'] as const;

/** 某个风险维度对某阶段的人意味着什么；null = 不适用，不该报给此人。 */
export interface DomainReading {
  /** 显示用的名目，即八个方面之一（孩子的「事业」读作「学业」）。 */
  readonly label: Aspect;
  /** 对此人具体会是什么样的事。 */
  readonly text: string;
}

const ADULT: Readonly<Record<RiskDomain, DomainReading>> = {
  健康: { label: '健康', text: '出现相关症状或需要就医' },
  意外: { label: '意外', text: '跌碰、器械伤或突发事故' },
  感情: { label: '感情', text: '争执、疏离或第三者困扰' },
  人丁: { label: '子女', text: '求子不顺、子女操心或亲子不和' },
  学业: { label: '学业', text: '进修、考证或资格审核受阻' },
  事业: { label: '事业', text: '升迁受阻或职务动荡' },
  财运: { label: '财运', text: '破财、投资失利或收入停滞' },
  官非: { label: '人际', text: '口舌是非、合约纠纷或卷入官司' },
};

const MINOR: Readonly<Partial<Record<RiskDomain, DomainReading>>> = {
  健康: { label: '健康', text: '生病、体弱或需要就医' },
  意外: { label: '意外', text: '跌碰、烫伤或运动受伤' },
  学业: { label: '学业', text: '读书不专心、考试失常或成绩下滑' },
  // 官星压力对孩子即课业压力
  事业: { label: '学业', text: '课业压力大、考试失常或注意力难集中' },
  官非: { label: '人际', text: '与同学、师长起口角，被误会或受欺负' },
};

const ELDER: Readonly<Partial<Record<RiskDomain, DomainReading>>> = {
  健康: { label: '健康', text: '慢性病反复、体力下滑，宜定期检查' },
  意外: { label: '意外', text: '跌倒碰伤，尤其夜间起身与浴室' },
  人丁: { label: '子女', text: '为儿孙之事操心' },
  感情: ADULT.感情,
  事业: ADULT.事业,
  财运: ADULT.财运,
  官非: ADULT.官非,
};

/** 此维度对此阶段的人意味着什么。孩子不报财运、感情、子女；长者不报学业。 */
export function domainReading(domain: RiskDomain, stage: LifeStage): DomainReading | null {
  if (stage === '儿童' || stage === '少年') return MINOR[domain] ?? null;
  if (stage === '长者') return ELDER[domain] ?? null;
  return ADULT[domain];
}

/** 此方面对此阶段的人适不适用。 */
export function aspectApplies(aspect: Aspect, stage: LifeStage): boolean {
  const table = stage === '儿童' || stage === '少年' ? MINOR : stage === '长者' ? ELDER : ADULT;
  return Object.values(table).some((r) => r?.label === aspect);
}

/**
 * 体质上的易感度：小儿与长者气弱，健康与意外看得更重（logit 加项）。
 * 依据 ROOM_META：「小儿气弱，最忌五鬼、五黄与三碧」「长者体虚，尤忌二黑病符与五黄」。
 */
export function stageVulnerability(domain: RiskDomain, stage: LifeStage): { add: number; note: string } | null {
  if (domain !== '健康' && domain !== '意外') return null;
  if (stage === '儿童') return { add: 0.25, note: '小儿气弱，健康与意外看得更重。' };
  if (stage === '长者') return { add: 0.3, note: '长者体虚，健康与意外看得更重。' };
  return null;
}
