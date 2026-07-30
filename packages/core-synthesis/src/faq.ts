/**
 * 常见问题库 —— 按居家 / 商业分流。
 *
 * 这些是请风水师上门时问得最多的问题。此前问答页只有五条通用预设，
 * 店铺用户看到「主卧设在哪一方对夫妻感情最有利」是没有意义的。
 *
 * 每条问题带：所属场景、类别、以及「该问题实际要看盘上哪几处」——
 * 后者会一并交给 AI，令其作答时知道该引用哪部分事实，而非泛泛而谈。
 */

import type { RiskDomain } from '@hidefate/core-fengshui';
import type { Scenario } from '@hidefate/core-fengshui';

export type FaqCategory =
  | '财富' | '格局形煞' | '情感家庭' | '学业' | '健康人丁'
  | '人际' | '事业' | '择日仪式' | '神位摆设';

export interface FaqItem {
  readonly id: string;
  /** '居家' | '商业' | '通用' */
  readonly scenario: Scenario | '通用';
  readonly category: FaqCategory;
  readonly question: string;
  /** 作答时该重点引用盘上何处 —— 一并送给 AI。 */
  readonly lookAt: readonly string[];
  readonly domains: readonly RiskDomain[];
}

export const FAQ_BANK: readonly FaqItem[] = [
  // ═══════════════ 居家 ═══════════════
  // 财富
  { id: 'h-w1', scenario: '居家', category: '财富', question: '客厅的明财位与暗财位在哪里？怎么布置才能聚财？',
    lookAt: ['向星当旺之方（暗财位）', '大门进来的斜对角（明财位）', '客厅所在宫位'], domains: ['财运'] },
  { id: 'h-w2', scenario: '居家', category: '财富', question: '摆植物、鱼缸还是水晶催财？放哪一方才对？',
    lookAt: ['向星当旺之方', '各方五行属性', '是否犯山星下水'], domains: ['财运'] },
  { id: 'h-w3', scenario: '居家', category: '财富', question: '我家是不是有穿堂煞、开门见灶或漏财格局？',
    lookAt: ['大门与后门/阳台是否对穿', '大门是否正对厨房灶位', '布局体检结果'], domains: ['财运'] },
  { id: 'h-w4', scenario: '居家', category: '财富', question: '投资一直不顺，跟西北或东南受损有关系吗？',
    lookAt: ['西北（乾）宫飞星与缺角', '东南（巽）宫飞星与缺角', '男主人命卦'], domains: ['财运', '事业'] },

  // 格局形煞
  { id: 'h-s1', scenario: '居家', category: '格局形煞', question: '横梁压床、压沙发、压书桌要怎么化解？',
    lookAt: ['主卧所在宫位', '客厅所在宫位', '书房所在宫位'], domains: ['健康'] },
  { id: 'h-s2', scenario: '居家', category: '格局形煞', question: '我家是手枪型／菜刀型户型，影响大吗？怎么补？',
    lookAt: ['各宫缺角程度', '缺角所属六亲与脏腑'], domains: ['健康', '人丁'] },
  { id: 'h-s3', scenario: '居家', category: '格局形煞', question: '房子正中间是厕所（或厨房），有多严重？',
    lookAt: ['中宫房间', '布局体检之中宫受污项'], domains: ['健康', '财运'] },
  { id: 'h-s4', scenario: '居家', category: '格局形煞', question: '西北角／西南角缺了一块，对家人有什么影响？怎么补？',
    lookAt: ['西北宫缺角（父亲、肺骨）', '西南宫缺角（母亲、脾胃）', '缺角化解清单'], domains: ['健康', '人丁'] },

  // 情感家庭
  { id: 'h-e1', scenario: '居家', category: '情感家庭', question: '夫妻最近常吵架，跟卧室风水有关吗？',
    lookAt: ['主卧宫位之飞星与八宅星', '是否见五鬼六煞二黑五黄', '夫妻二人命卦'], domains: ['感情'] },
  { id: 'h-e2', scenario: '居家', category: '情感家庭', question: '我还单身，桃花位（正缘）在哪一方？怎么催？',
    lookAt: ['一白所到之方', '本人命卦之延年方', '桃花位吉方清单'], domains: ['感情'] },
  { id: 'h-e3', scenario: '居家', category: '情感家庭', question: '小孩顶嘴叛逆，跟他房间或床头朝向有关吗？',
    lookAt: ['儿童房宫位飞星', '是否见三碧七赤五鬼', '孩子命卦之四吉方'], domains: ['感情', '人丁'] },

  // 学业
  { id: 'h-a1', scenario: '居家', category: '学业', question: '文昌位在哪里？书桌应该摆哪一方？',
    lookAt: ['四绿所到之方', '一四同宫之方', '文昌位吉方清单'], domains: ['事业'] },
  { id: 'h-a2', scenario: '居家', category: '学业', question: '文昌塔、毛笔这类东西真的有用吗？怎么用才对？',
    lookAt: ['文昌位所在宫', '该宫五行'], domains: ['事业'] },
  { id: 'h-a3', scenario: '居家', category: '学业', question: '孩子注意力差、成绩下滑，风水上能调什么？',
    lookAt: ['儿童房与书房宫位', '文昌位', '孩子命卦'], domains: ['事业'] },

  // 健康人丁
  { id: 'h-h1', scenario: '居家', category: '健康人丁', question: '我常失眠头痛、肠胃不好，跟床头靠厕或灶对水槽有关吗？',
    lookAt: ['主卧宫位与其脏腑应象', '厨房宫位', '二黑五黄所到之方'], domains: ['健康'] },
  { id: 'h-h2', scenario: '居家', category: '健康人丁', question: '久婚不孕（或曾流产），风水上要注意什么？',
    lookAt: ['主卧宫位山星（主人丁）', '当元旺山之方（添丁位）', '西南坤宫（母）状况'], domains: ['人丁', '健康'] },
  { id: 'h-h3', scenario: '居家', category: '健康人丁', question: '窗外有尖角／天斩煞／电塔，要怎么化解？',
    lookAt: ['外部环境（峦头）清单', '形煞所在方位', '峦头化解建议'], domains: ['健康', '意外'] },

  // 择日仪式
  { id: 'h-d1', scenario: '居家', category: '择日仪式', question: '买房、设计、施工、入住，各阶段的时机怎么挑？',
    lookAt: ['当前元运', '流年五黄二黑所到之方', '太岁方'], domains: ['财运'] },
  { id: 'h-d2', scenario: '居家', category: '择日仪式', question: '装修开工和入伙（搬家）要选什么日子？',
    lookAt: ['流年与流月紫白', '动土忌方'], domains: ['健康', '财运'] },
  { id: 'h-d3', scenario: '居家', category: '择日仪式', question: '买的是二手房，需要净宅吗？怎么做？',
    lookAt: ['入住年之元运', '全宅综合评级'], domains: ['健康'] },

  // 神位
  { id: 'h-g1', scenario: '居家', category: '神位摆设', question: '祖先牌位、佛像、财神的高度和朝向有什么禁忌？',
    lookAt: ['神位所在宫位', '八宅四吉方', '是否对厕对灶或在梁下'], domains: ['健康', '事业'] },
  { id: 'h-g2', scenario: '居家', category: '神位摆设', question: '貔貅、麒麟、葫芦、五帝钱要不要开光？挂哪里？',
    lookAt: ['需化解之凶方', '五行化解建议'], domains: ['财运', '健康'] },

  // ═══════════════ 商业 ═══════════════
  // 财富
  { id: 'b-w1', scenario: '商业', category: '财富', question: '收银台／收款区／老板桌，应该放在哪一方最旺财？',
    lookAt: ['向星当旺之方（正财位）', '收银台现所在宫位', '老板位现所在宫位'], domains: ['财运'] },
  { id: 'b-w2', scenario: '商业', category: '财富', question: '怎么布局才能聚客留财，不让客人进来就走？',
    lookAt: ['大门所在宫位', '明堂（向方）状况', '动线是否直冲'], domains: ['财运'] },
  { id: 'b-w3', scenario: '商业', category: '财富', question: '门对门、大门对电梯、动线冲收银台，是不是在漏财？',
    lookAt: ['大门宫位与对宫', '布局体检穿堂项', '收银台宫位'], domains: ['财运'] },
  { id: 'b-w4', scenario: '商业', category: '财富', question: '投资或合作老是失败，跟哪个方位受损有关？',
    lookAt: ['西北乾宫（主事者）', '向星失令之方', '老板命卦'], domains: ['财运', '事业'] },

  // 格局形煞
  { id: 'b-s1', scenario: '商业', category: '格局形煞', question: '大门对门、对电梯、对下楼梯，怎么化解？',
    lookAt: ['大门宫位', '对宫状况', '峦头开口煞'], domains: ['财运'] },
  { id: 'b-s2', scenario: '商业', category: '格局形煞', question: '横梁压老板位或收银台，影响大吗？',
    lookAt: ['老板位宫位', '收银台宫位'], domains: ['财运', '事业'] },
  { id: 'b-s3', scenario: '商业', category: '格局形煞', question: '办公室缺角，对事业和财运有多大影响？',
    lookAt: ['各宫缺角程度', '缺角所属方位之应象'], domains: ['事业', '财运'] },

  // 人际
  { id: 'b-p1', scenario: '商业', category: '人际', question: '公司小人多、口舌不断，跟风水有关吗？',
    lookAt: ['三碧七赤所到之方', '斗牛煞（二三同宫）', '办公区宫位'], domains: ['官非'] },
  { id: 'b-p2', scenario: '商业', category: '人际', question: '团队不和、员工留不住，座位或接待区要怎么调？',
    lookAt: ['办公位所在宫位', '前台接待宫位', '各员工命卦与座位交叉'], domains: ['官非', '事业'] },

  // 事业
  { id: 'b-c1', scenario: '商业', category: '事业', question: '我的座位背后没有靠，怎么借力？',
    lookAt: ['老板位／办公位宫位', '坐方是否有靠（峦头）'], domains: ['事业'] },
  { id: 'b-c2', scenario: '商业', category: '事业', question: '店铺大门应该朝哪个方向？现在这个朝向好不好？',
    lookAt: ['坐向与立向线品级', '向星当旺之方', '大门现所在宫位'], domains: ['财运'] },
  { id: 'b-c3', scenario: '商业', category: '事业', question: '招牌颜色怎么配？跟行业五行有关系吗？',
    lookAt: ['向首宫位五行', '当元旺星五行', '行业属性'], domains: ['财运'] },
  { id: 'b-c4', scenario: '商业', category: '事业', question: '老板位要怎样才算有靠山、有明堂？',
    lookAt: ['老板位宫位', '坐方有靠（峦头）', '向方明堂（峦头）'], domains: ['事业'] },

  // 健康
  { id: 'b-h1', scenario: '商业', category: '健康人丁', question: '员工常生病或出小意外，跟座位或公共区形煞有关吗？',
    lookAt: ['二黑五黄所到之方', '办公区宫位', '机台区宫位'], domains: ['健康', '意外'] },
  { id: 'b-h2', scenario: '商业', category: '健康人丁', question: '外面的形煞会影响办公环境吗？',
    lookAt: ['外部环境（峦头）清单', '形煞所在方位'], domains: ['健康', '意外'] },

  // 择日
  { id: 'b-d1', scenario: '商业', category: '择日仪式', question: '开业、开市、乔迁要选什么日子？有什么仪式讲究？',
    lookAt: ['当前元运', '流年紫白', '太岁与三煞方'], domains: ['财运'] },

  // 神位
  { id: 'b-g1', scenario: '商业', category: '神位摆设', question: '财神、关公、招财物件在店里或办公室要怎么摆？',
    lookAt: ['神位所在宫位', '向星当旺之方', '八宅四吉方'], domains: ['财运'] },

  // ═══════════════ 通用（侧重点随场景变）═══════════════
  { id: 'u-1', scenario: '通用', category: '财富', question: '本宅的财位到底在哪一方？现在有没有用起来？',
    lookAt: ['向星当旺之方', '该宫现有房间', '吉方清单'], domains: ['财运'] },
  { id: 'u-2', scenario: '通用', category: '格局形煞', question: '整体来看，我这里最大的问题是什么？请按轻重排序。',
    lookAt: ['综合分拆解', '布局体检全部项', '峦头形煞', '各宫风险等级'], domains: ['健康', '财运'] },
  { id: 'u-3', scenario: '通用', category: '格局形煞', question: '预算有限，只做一件事的话，先做哪一件？',
    lookAt: ['化解清单优先级第一项', '否决机制是否触发'], domains: ['财运', '健康'] },
  { id: 'u-4', scenario: '通用', category: '格局形煞', question: '外面的形煞怎么化解？哪一个最要紧？',
    lookAt: ['峦头负向修正排序', '峦头化解建议'], domains: ['意外', '健康'] },
  { id: 'u-5', scenario: '通用', category: '择日仪式', question: '今年哪几个方位不能动土装修？',
    lookAt: ['流年五黄二黑三碧所到之方', '太岁方'], domains: ['健康', '意外'] },
  { id: 'u-6', scenario: '通用', category: '神位摆设', question: '神位／财神应该安在哪一方？现在这个位置行吗？',
    lookAt: ['神位现所在宫位', '八宅四吉方', '是否对厕对灶'], domains: ['健康', '财运'] },
  { id: 'u-7', scenario: '通用', category: '事业', question: '未来三年有哪几年要特别小心？为什么？',
    lookAt: ['宅运时间轴', '换运年份', '逐年热点'], domains: ['财运', '健康'] },
];

/** 按场景取问题（含通用）。 */
export function faqFor(scenario: Scenario): FaqItem[] {
  return FAQ_BANK.filter((f) => f.scenario === scenario || f.scenario === '通用');
}

/** 按场景 + 类别取问题。 */
export function faqByCategory(scenario: Scenario): { category: FaqCategory; items: FaqItem[] }[] {
  const list = faqFor(scenario);
  const cats: FaqCategory[] = [];
  for (const f of list) if (!cats.includes(f.category)) cats.push(f.category);
  return cats.map((category) => ({ category, items: list.filter((f) => f.category === category) }));
}

/** 该场景下最值得先问的几条（首页 / 问答页快捷入口）。 */
export function faqHighlights(scenario: Scenario, n = 5): FaqItem[] {
  const ids =
    scenario === '居家'
      ? ['u-2', 'u-3', 'h-w1', 'h-e1', 'h-a1']
      : ['u-2', 'u-3', 'b-w1', 'b-w3', 'b-c1'];
  const picked = ids.map((id) => FAQ_BANK.find((f) => f.id === id)).filter((f): f is FaqItem => Boolean(f));
  return picked.slice(0, n);
}
