/**
 * 紫微格局判定。
 *
 * 移植自 kth2/bazi-app 的 `lib/core/analysis/ziwei_patterns.dart`，判据与断语逐条对齐，
 * 以便同一个人在两边得到相同的格局结论。
 *
 * **唯一一处有意偏离**：府相朝垣的宫位条件在上游写反，导致该规则永不触发。
 * 理由与实测见下方该条注释。其余各条完全等价。
 *
 * 刻意求实用而不求穷尽 —— 只收最常被引用的几个格局，
 * 保证「整体 / 事业 / 特别提点」几节永远有具体的结构可讲。
 *
 * iztro 只负责安星与落宫，不给格局；格局判定是本项目自己的一层。
 */

import type { ZiWeiPalace, ZiWeiPattern, ZiWeiStar } from './types.js';

interface PatternInput {
  readonly palaces: readonly ZiWeiPalace[];
}

const allStarsOf = (p: ZiWeiPalace): ZiWeiStar[] => [
  ...p.majorStars,
  ...p.minorStars,
  ...p.adjectiveStars,
];

/** 庙旺视为得地。 */
const isBright = (b: string | null): boolean => b === '庙' || b === '旺';

function findMajor(z: PatternInput, name: string): ZiWeiStar | null {
  for (const p of z.palaces) {
    for (const s of p.majorStars) {
      if (s.name === name) return s;
    }
  }
  return null;
}

/** 检出本命盘的格局。 */
export function detectPatterns(z: PatternInput): ZiWeiPattern[] {
  const soul = z.palaces.find((p) => p.name === '命宫');
  if (!soul) return [];

  const found: ZiWeiPattern[] = [];
  const soulMajors = new Set(soul.majorStars.map((s) => s.name));
  const soulAll = new Set(allStarsOf(soul).map((s) => s.name));
  const palaceByName = (n: string) => z.palaces.find((p) => p.name === n);
  const palaceHas = (palace: string, star: string) => {
    const p = palaceByName(palace);
    return p != null && allStarsOf(p).some((s) => s.name === star);
  };
  const soulHasAll = (names: readonly string[]) => names.every((n) => soulMajors.has(n));

  // 紫府同宫 —— 帝星与财库同守命宫。
  if (soulHasAll(['紫微', '天府'])) {
    found.push({
      name: '紫府同宫',
      text: '紫微与天府同守命宫，帝星与财库同宫，主一生格局稳重、有领导与理财之才，重体面与安全感，宜稳中掌权。',
      sections: ['overall', 'career', 'highlights'],
    });
  }

  // 日月同宫 —— 太阳太阴同守命宫（丑／未）。
  if (soulHasAll(['太阳', '太阴'])) {
    found.push({
      name: '日月同宫',
      text: '太阳太阴同守命宫，日月并处一宫，性情兼具阳刚外放与阴柔细腻，才华与人缘俱备；宜调和内外、动静得宜，善用则名利可期。',
      sections: ['overall', 'personality', 'highlights'],
    });
  }

  // 命宫双吉化 —— 生年四化中两个以上（禄权科）落命宫。
  const soulLucky = soul.majorStars
    .filter((s) => s.mutagen === '禄' || s.mutagen === '权' || s.mutagen === '科')
    .map((s) => `${s.name}化${s.mutagen}`);
  if (soulLucky.length >= 2) {
    found.push({
      name: '命宫双吉化',
      text:
        `命宫得生年吉化 ${soulLucky.join('、')}，主星能量得四化加持，本命自带助力与光彩，` +
        '利于才华显扬、贵人相助，是命宫难得的加分结构。',
      sections: ['overall', 'personality', 'highlights'],
    });
  }

  // 紫微天相 —— 帝星得印星辅弼。
  if (soulHasAll(['紫微', '天相'])) {
    found.push({
      name: '紫微天相',
      text: '紫微天相同宫，帝星得印星辅弼，处事端正得体、宜辅佐掌印，具管理与协调之长。',
      sections: ['overall', 'career'],
    });
  }

  // 命身三方（命宫、财帛、官禄、迁移）主星集合。
  const triad = new Set<string>();
  for (const name of ['命宫', '财帛', '官禄', '迁移']) {
    const p = palaceByName(name);
    if (p) for (const s of p.majorStars) triad.add(s.name);
  }

  // 机月同梁 —— 四星会齐其三。
  if (['天机', '太阴', '天同', '天梁'].filter((n) => triad.has(n)).length >= 3) {
    found.push({
      name: '机月同梁',
      text: '命身三方会齐机月同梁，性情稳健细致、善规划辅佐，宜从事行政、企划、专业、公职等安定积累之业。',
      sections: ['overall', 'career'],
    });
  }

  // 杀破狼 —— 三星会其二，主开创变动。
  if (['七杀', '破军', '贪狼'].filter((n) => triad.has(n)).length >= 2) {
    found.push({
      name: '杀破狼',
      text: '命宫三方见杀破狼，人生主基调为开创与变动，冲劲强、少安现状，宜主动求变、自立门户，忌原地固守。',
      sections: ['overall', 'career', 'luck'],
    });
  }

  // 火贪／铃贪 —— 贪狼与火铃同宫，主暴发。
  if (soulAll.has('贪狼') && (soulAll.has('火星') || soulAll.has('铃星'))) {
    found.push({
      name: '火贪/铃贪',
      text: '贪狼与火（铃）同宫，成暴发之格，主意外之财或事业骤发，爆发力强；然来去皆快，宜见好就收、稳固已得。',
      sections: ['wealth', 'highlights'],
    });
  }

  // 日月并明 / 日月反背 —— 太阳太阴的庙陷。
  const sun = findMajor(z, '太阳');
  const moon = findMajor(z, '太阴');
  if (sun && moon) {
    const sunBright = isBright(sun.brightness);
    const moonBright = isBright(moon.brightness);
    if (sunBright && moonBright) {
      found.push({
        name: '日月并明',
        text: '太阳太阴皆得庙旺，日月并明，主内外皆秀、才华与人缘俱佳，利名利双收，性情光明而细腻兼备。',
        sections: ['overall', 'personality', 'highlights'],
      });
    } else if (!sunBright && !moonBright) {
      found.push({
        name: '日月反背',
        text: '太阳太阴俱落陷（日月反背），早年或较辛劳、光华内敛，宜后天努力厚积，中晚运转佳，是先难后成之象。',
        sections: ['overall', 'challenges'],
      });
    }
  }

  // 石中隐玉 —— 巨门居子午坐命。
  if (soulAll.has('巨门') && (soul.earthlyBranch === '子' || soul.earthlyBranch === '午')) {
    found.push({
      name: '石中隐玉',
      text: '巨门居子午坐命，成石中隐玉之格，才华内蕴、以口才与专业见长，宜厚积薄发，中年后渐显。',
      sections: ['overall', 'career', 'highlights'],
    });
  }

  // 府相朝垣 —— 天府天相分守财官朝命。
  //
  // 此处**有意不与上游 Dart 版一致**：上游写的是「天府在财帛且天相在官禄」，
  // 该条件结构上永不成立 —— 天府系顺行安星，天相恒为天府 +4 宫；
  // 财帛为命宫 +8、官禄为命宫 +4，故天府若在财帛，天相必回到命宫而非官禄。
  // 1152 个样本实测：上游写法命中 0 次，对调后命中 97 次（另见 patterns.test.ts 的可达性回归）。
  // 因此按古法取「天府居官禄、天相居财帛，分守财官朝拱命宫」。
  if (soulAll.size > 0 && palaceHas('官禄', '天府') && palaceHas('财帛', '天相')) {
    found.push({
      name: '府相朝垣',
      text: '天府天相分守财官朝拱命宫，主一生衣食无缺、贵人有助、宜稳健求进，为富贵安稳之格。',
      sections: ['overall', 'wealth'],
    });
  }

  return found;
}
