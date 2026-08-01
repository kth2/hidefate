/**
 * 九星知识库：星性、旺衰、脏腑应象、二星组合断语、五行化解法。
 *
 * 全部为查表数据 + 确定性推导，绝无模型生成。AI 只负责把这些结论写成通顺中文。
 */

import {
  CONTROLS,
  GENERATES,
  STAR_ALIAS,
  STAR_NAME,
  STAR_WUXING,
  wuXingRelation,
  type PalaceIndex,
  type WuXing,
} from './constants.js';

/** 星之旺衰状态（相对于当元运）。 */
export type StarPhase = '当旺' | '生气' | '进气' | '退气' | '死气' | '煞气';

export interface StarMeta {
  readonly star: PalaceIndex;
  readonly name: string;
  readonly alias: string;
  readonly wuXing: WuXing;
  /** 本性吉凶：'吉' | '凶' | '中'。当旺失运会翻转部分效果，但本性不变。 */
  readonly nature: '吉' | '凶' | '中';
  /** 当旺时主事。 */
  readonly whenProsperous: string;
  /** 失运时主事。 */
  readonly whenDeclining: string;
  /** 对应脏腑 / 身体部位。 */
  readonly organs: readonly string[];
  /** 对应疾病倾向。 */
  readonly ailments: readonly string[];
  /** 对应人物（后天卦人物）。 */
  readonly person: string;
  /** 主要风险维度。 */
  readonly riskDomains: readonly RiskDomain[];
}

export type RiskDomain = '健康' | '财运' | '感情' | '事业' | '人丁' | '意外' | '官非';

export const STAR_META: Record<PalaceIndex, StarMeta> = {
  1: {
    star: 1, name: '一白', alias: '贪狼', wuXing: '水', nature: '吉',
    whenProsperous: '主中榜功名、官运亨通、聪明智慧、桃花人缘佳',
    whenDeclining: '主漂泊、肾虚、耳疾、酒色、水厄与刑妻',
    organs: ['肾', '膀胱', '耳', '血液', '泌尿生殖'],
    ailments: ['肾虚', '泌尿系统炎症', '耳鸣耳聋', '贫血', '妇科', '寒湿'],
    person: '中男', riskDomains: ['事业', '健康', '感情'],
  },
  2: {
    star: 2, name: '二黑', alias: '巨门', wuXing: '土', nature: '凶',
    whenProsperous: '当运可发田产之财、旺妇人当家、利医药与地产',
    whenDeclining: '病符星，主久病缠身、寡妇当家、腹疾、难产、阴煞',
    organs: ['脾', '胃', '腹部', '皮肤', '子宫'],
    ailments: ['慢性肠胃病', '妇科肿瘤', '皮肤病', '孕产风险', '免疫低下', '中毒'],
    person: '老母·女主人', riskDomains: ['健康', '感情', '财运'],
  },
  3: {
    star: 3, name: '三碧', alias: '禄存', wuXing: '木', nature: '凶',
    whenProsperous: '当运主兴家创业、进取有为、利法律与传媒',
    whenDeclining: '蚩尤星，主口舌是非、官司诉讼、盗贼、暴戾伤足',
    organs: ['肝', '胆', '足', '四肢', '神经'],
    ailments: ['肝炎', '筋骨扭伤', '手足外伤', '焦躁失眠', '哮喘'],
    person: '长男', riskDomains: ['官非', '意外', '健康', '事业'],
  },
  4: {
    star: 4, name: '四绿', alias: '文曲', wuXing: '木', nature: '吉',
    whenProsperous: '文昌星，主科名文章、学业进益、驿马远行、婚喜',
    whenDeclining: '主淫荡桃花、精神耗弱、自缢漂流、股疾',
    organs: ['胆', '股', '呼吸道', '神经', '毛发'],
    ailments: ['神经衰弱', '抑郁焦虑', '哮喘', '肩颈', '风湿'],
    person: '长女', riskDomains: ['事业', '感情', '健康'],
  },
  5: {
    star: 5, name: '五黄', alias: '廉贞', wuXing: '土', nature: '凶',
    whenProsperous: '五黄无正卦，居中御极；当令亦须静，动则为祸',
    whenDeclining: '正关煞，最毒之星，主重病、伤亡、破财、意外、诉讼',
    organs: ['中焦', '毒素', '肿瘤', '全身'],
    ailments: ['恶性肿瘤', '急重症', '手术', '中毒', '突发意外伤'],
    person: '全家', riskDomains: ['健康', '意外', '财运', '官非'],
  },
  6: {
    star: 6, name: '六白', alias: '武曲', wuXing: '金', nature: '吉',
    whenProsperous: '主武贵权威、驿马财、领导决断、利公职与金融',
    whenDeclining: '主刑妻孤克、肺疾骨伤、官非、车祸金刃',
    organs: ['肺', '头', '骨骼', '大肠'],
    ailments: ['肺病', '头痛', '骨折', '大肠疾患', '车祸金属外伤'],
    person: '老父·男主人', riskDomains: ['事业', '财运', '健康', '意外'],
  },
  7: {
    star: 7, name: '七赤', alias: '破军', wuXing: '金', nature: '凶',
    whenProsperous: '当运主口才辩才、偏财横财、娱乐服务业兴旺',
    whenDeclining: '主盗贼劫掠、刀伤火险、口舌官非、桃花劫',
    organs: ['肺', '口', '舌', '齿', '呼吸道'],
    ailments: ['口腔咽喉病', '肺疾', '刀伤手术', '性病'],
    person: '少女', riskDomains: ['意外', '财运', '官非', '感情'],
  },
  8: {
    star: 8, name: '八白', alias: '左辅', wuXing: '土', nature: '吉',
    whenProsperous: '当元财星，主富贵功名、田产丰盈、孝义忠良、旺丁旺财',
    whenDeclining: '主脾胃损、关节痛、小口损伤、田产纠纷',
    organs: ['脾', '手', '背', '关节', '鼻'],
    ailments: ['脾胃虚', '关节炎', '腰背伤', '鼻炎'],
    person: '少男', riskDomains: ['财运', '人丁', '健康'],
  },
  9: {
    star: 9, name: '九紫', alias: '右弼', wuXing: '火', nature: '吉',
    whenProsperous: '喜庆星，主婚喜连连、名声显达、贵子、文明进取',
    whenDeclining: '主火灾目疾、心血管、性急争讼、血光',
    organs: ['心', '眼', '血液循环', '小肠'],
    ailments: ['心脏病', '高血压', '眼疾', '烧烫伤', '失眠心悸'],
    person: '中女', riskDomains: ['感情', '事业', '健康', '意外'],
  },
};

/**
 * 星之旺衰判定（以当元运为准）。
 *   当旺 = 当运之星
 *   生气 = 下一运之星（未来当旺，宜提前布局）
 *   进气 = 再下一运
 *   退气 = 刚过去一运
 *   死气 / 煞气 = 更远之退运星；二五七为煞
 */
export function starPhase(star: PalaceIndex, period: PalaceIndex): StarPhase {
  const d = (((star - period) % 9) + 9) % 9;
  if (d === 0) return '当旺';
  if (d === 1) return '生气';
  if (d === 2) return '进气';
  if (d === 8) return '退气';
  return star === 5 || star === 2 || star === 7 ? '煞气' : '死气';
}

/** 旺衰对吉凶评分的乘数。 */
export const PHASE_FACTOR: Record<StarPhase, number> = {
  当旺: 1.4,
  生气: 1.2,
  进气: 1.0,
  退气: 0.75,
  死气: 0.5,
  煞气: 0.4,
};

/**
 * 单星在某运下的「吉凶分」：+1（大吉）… -1（大凶）。
 * 吉星失运则减力，凶星当运则减害（但二五永不为吉，只是减害）。
 */
export function starScore(star: PalaceIndex, period: PalaceIndex): number {
  const phase = starPhase(star, period);
  const meta = STAR_META[star];
  const base = meta.nature === '吉' ? 0.8 : meta.nature === '凶' ? -0.85 : 0.1;
  const f = PHASE_FACTOR[phase];
  if (base >= 0) return Math.max(-1, Math.min(1, base * f));
  // 凶星：当旺时凶性收敛，失运时凶性全开
  const severity = base * (2 - f);
  return Math.max(-1, Math.min(1, star === 5 || star === 2 ? Math.min(severity, -0.35) : severity));
}

/** 二星组合断语。 */
export interface Combination {
  /** 组合键，如 '2-5'（前者为山星，后者为向星；对称组合两向都收录）。 */
  readonly key: string;
  readonly name: string;
  readonly nature: '吉' | '凶' | '中';
  /** 严重度 0–1（凶）或吉度 0–1（吉）。 */
  readonly magnitude: number;
  readonly domains: readonly RiskDomain[];
  readonly meaning: string;
  readonly classical: string;
  readonly cures: readonly string[];
}

/**
 * 玄空经典二星组合表（山星-向星）。
 * 收录以「实务高频 + 后果严重」为准；未收录者由 五行生克 通则自动推导。
 */
export const COMBINATIONS: readonly Combination[] = [
  { key: '2-5', name: '二五交加', nature: '凶', magnitude: 1.0, domains: ['健康', '意外', '财运'],
    meaning: '病符会正关煞，主重病损主、孕妇难产、破大财，为玄空第一凶组合。',
    classical: '《飞星赋》：「二五交加，罹死亡并生疾病。」',
    cures: ['此方绝对静止：不动土、不装修、不长时间停留、不设炉灶与卧床。', '悬挂六帝古钱或纯铜风铃（金泄土），忌用红色与三角形（火生土助凶）。', '若为大门必经之处，加放铜葫芦并保持长明弱光，慎选就医体检时间。'] },
  { key: '5-2', name: '五二交加', nature: '凶', magnitude: 1.0, domains: ['健康', '意外', '财运'],
    meaning: '五黄正煞与二黑病符同宫，山星五黄主人丁伤病尤烈，向星二黑主因病耗财；为玄空第一凶组合之一。',
    classical: '《飞星赋》：「二五交加，罹死亡并生疾病。」',
    cures: ['该宫化为静区（储藏、走道），移走卧床与灶位。', '铜制品泄土，六铜钱或铜葫芦；忌红色灯饰。'] },
  { key: '2-3', name: '斗牛煞', nature: '凶', magnitude: 0.8, domains: ['官非', '感情', '健康'],
    meaning: '二黑坤土与三碧震木相斗，主家人反目、婆媳失和、官司缠讼、脾胃与肝胆同病。',
    classical: '《紫白诀》：「斗牛煞起，惹官刑；蚩尤黑曜，斗争频。」',
    cures: ['以红色系（火）通木土之关：红地毯、红中国结、暖色灯。', '忌摆放金属与流水（金助土克木、水生木斗土）。', '家庭会议、签约避开此方。'] },
  { key: '3-2', name: '斗牛煞', nature: '凶', magnitude: 0.8, domains: ['官非', '感情', '健康'],
    meaning: '三碧震木与二黑坤土相斗，山星三碧主人事争执反目，向星二黑主因争斗与疾病而耗财。',
    classical: '《紫白诀》：「斗牛煞起，惹官刑。」',
    cures: ['红色系通关（火），忌金属与水景。', '此方不宜作会客与谈判之所。'] },
  { key: '3-7', name: '穿心煞', nature: '凶', magnitude: 0.85, domains: ['意外', '财运', '官非'],
    meaning: '七赤金克三碧木，主被劫盗、刀伤手术、被人背叛出卖、突发破财。',
    // 引文原为「碧绿风魔，他处廉贞莫见；蚩尤破军，同宫劫盗更凶」，
    // 但前半句「碧绿风魔」指的是三碧配四绿（见 3-4 条），与本条无关，故只留后半句。
    classical: '《玄空秘旨》：「蚩尤破军，同宫劫盗更凶。」',
    cures: ['置水（黑色鱼缸、深色水器）通金木之关，金生水、水生木。', '加强门锁与监控；避免此方摆放贵重物与保险箱。', '忌红色（火）与刀剑利器摆件。'] },
  { key: '7-3', name: '穿心煞', nature: '凶', magnitude: 0.85, domains: ['意外', '财运', '官非'],
    meaning: '七赤金克三碧木，主口舌升级为官非诉讼，亦主被盗、被诈与突发破财。',
    classical: '《玄空秘旨》：「蚩尤破军，同宫劫盗更凶。」',
    cures: ['以水通关，忌火忌利器。', '慎签合约、慎作担保。'] },
  { key: '1-4', name: '文昌局', nature: '吉', magnitude: 0.9, domains: ['事业'],
    meaning: '一四同宫，水木相生，主科名文章、考试升迁、创作灵感，为读书人第一吉方。',
    classical: '《玄机赋》：「一四同宫，准发科名之显。」',
    cures: ['宜设书桌、书房、办公位；置四支富贵竹于清水中催文昌。', '保持整洁明亮，忌堆杂物与厕所。'] },
  { key: '4-1', name: '文昌局', nature: '吉', magnitude: 0.9, domains: ['事业', '感情'],
    meaning: '四绿文曲与一白贪狼同宫，主科名文章、考试得中；向星一白兼主人缘桃花，未婚者可于此方催正缘。',
    classical: '《玄机赋》：「一四同宫，准发科名之显。」',
    cures: ['书桌、办公位首选；置文昌塔或富贵竹。'] },
  { key: '6-8', name: '武曲财局', nature: '吉', magnitude: 0.95, domains: ['财运', '事业'],
    meaning: '八白土生六白金，当元财星得武曲相辅，主权贵之财、不动产与正财丰盈。',
    classical: '《紫白诀》：「八逢紫曜，婚喜重来；六八武科发迹。」',
    cures: ['宜设大门、收银台、保险箱、老板位；置金属摆件或铜制聚宝盆助旺。'] },
  { key: '8-6', name: '武曲财局', nature: '吉', magnitude: 0.95, domains: ['财运', '人丁'],
    meaning: '山星八白当元旺丁，向星六白主权威之财，主家中出掌权者且置业顺利。',
    classical: '《紫白诀》：「六八武科发迹。」',
    cures: ['宜作主卧或老板位；置泰山石或玉器旺山星。'] },
  { key: '9-7', name: '火烧天门', nature: '凶', magnitude: 0.75, domains: ['意外', '健康', '官非'],
    meaning: '九紫火克七赤金，主火灾、烫伤、呼吸道与口腔急症、因口舌招祸。',
    classical: '《飞星赋》：「午酉逢而江湖花酒；火照天门，必当吐血。」',
    cures: ['置土泄火生金：黄玉、陶瓷、大颗粒粗盐罐。', '此方忌炉灶、忌电器密集、忌红色与尖角。', '检查电线与燃气，装烟感器。'] },
  { key: '7-9', name: '火烧天门', nature: '凶', magnitude: 0.75, domains: ['意外', '健康'],
    meaning: '七赤金与九紫火相战，主火险、血光与回禄之灾；向星九紫见火，尤忌厨房与电器房设于此。',
    classical: '《飞星赋》：「火照天门，必当吐血。」',
    cures: ['土泄火：陶瓷、黄玉；忌红色装饰与明火。'] },
  { key: '1-6', name: '金水相涵', nature: '吉', magnitude: 0.8, domains: ['事业', '财运'],
    meaning: '六白金生一白水，主官贵功名、思路清晰、异地发展有成。',
    classical: '《玄机赋》：「金水多情，贪花恋酒」（当运则主聪明，失运则主淫佚）。',
    cures: ['宜作书房、办公位；置金属与清水组合（如金属底座流水摆件）。'] },
  { key: '6-1', name: '金水相涵', nature: '吉', magnitude: 0.8, domains: ['事业', '人丁'],
    meaning: '山星六白主男主人得权，向星一白主智慧财，合作与仕途皆利。',
    classical: '《玄机赋》：「金水多情。」',
    cures: ['宜作男主人卧房或办公位。'] },
  { key: '8-9', name: '紫辅同宫', nature: '吉', magnitude: 0.9, domains: ['财运', '感情'],
    meaning: '九紫火生八白土，当元财星得生，主婚喜连连、置业添丁、名利双收。',
    classical: '《紫白诀》：「八逢紫曜，婚喜重来。」',
    cures: ['宜设大门、主卧、客厅；置红色或紫色饰物助火生土。'] },
  { key: '9-8', name: '紫辅同宫', nature: '吉', magnitude: 0.9, domains: ['财运', '人丁'],
    meaning: '九紫右弼与八白左辅相辉，山星九紫主添丁贵子、喜庆临门，向星八白主财源广进、田宅丰盈。',
    classical: '《紫白诀》：「八逢紫曜，婚喜重来。」',
    cures: ['宜设主卧催丁；忌此方设厕污秽。'] },
  { key: '4-5', name: '风廉相值', nature: '凶', magnitude: 0.7, domains: ['健康'],
    meaning: '五黄土被四绿木克，土怒反噬，主乳疾、皮肤恶疮、精神疾患与自缢之危。',
    classical: '《飞星赋》：「青楼染疾，只因七弼同黄；寒户遭瘟，缘自三廉夹绿。」',
    cures: ['铜器与金属泄五黄之土：六帝钱、金属风铃。', '忌置盆栽（木克土反激）；此方保持静与净。', '有情绪困扰者切勿在此方设卧床。'] },
  { key: '5-4', name: '风廉相值', nature: '凶', magnitude: 0.7, domains: ['健康'],
    meaning: '五黄正煞与四绿文曲同宫，山星五黄主人身重疾，向星四绿主因情绪起伏与人际纠葛而受损。',
    classical: '《飞星赋》：「寒户遭瘟，缘自三廉夹绿。」',
    cures: ['金属泄土，静置不动。'] },
  { key: '5-9', name: '廉贞得火', nature: '凶', magnitude: 0.9, domains: ['健康', '意外'],
    meaning: '九紫火生五黄土，火上加油，五黄凶性倍增，主急重症、火灾、突发意外。',
    classical: '《紫白诀》：「五主孕妇受灾，黄遇黑时出寡妇……九紫虽司喜庆，然六会九而长房血症。」',
    cures: ['大量金属泄土：铜钟、铜葫芦、六帝钱成串。', '严禁红色、灯光过亮、明火与电器密集。', '此方年内避免动土装修。'] },
  { key: '9-5', name: '廉贞得火', nature: '凶', magnitude: 0.9, domains: ['健康', '意外'],
    meaning: '九紫火助五黄土，火土相激，主因喜事、应酬或过劳而生急病与血光。',
    classical: '《紫白诀》：「五主孕妇受灾。」',
    cures: ['金属泄土；忌明火与红色。'] },
  { key: '2-7', name: '先天火数', nature: '凶', magnitude: 0.7, domains: ['意外', '健康', '财运'],
    meaning: '二七合先天火数，主火险、心血管急症、因色破财、家宅不宁。',
    classical: '《飞星赋》：「七逢二数，运至何忧？失运则火厄堪虞。」',
    cures: ['置水（深色鱼缸）与金属并用，泄火制煞。', '厨房、电箱若在此方，须加强消防与线路检修。'] },
  { key: '7-2', name: '先天火数', nature: '凶', magnitude: 0.7, domains: ['意外', '健康'],
    meaning: '七赤金与二黑土同宫，先天合火数，主火险、血光；阴卦重叠，家中男丁尤须留意。',
    classical: '《飞星赋》：「七逢二数，失运则火厄堪虞。」',
    cures: ['水金并用，忌红色与明火。'] },
  { key: '3-3', name: '双碧临门', nature: '凶', magnitude: 0.65, domains: ['官非', '意外'],
    meaning: '三碧重叠，蚩尤气盛，主强烈口舌争斗、诉讼、被盗、伤足。',
    classical: '《紫白诀》：「蚩尤碧色，好勇斗狠之神。」',
    cures: ['置红色系（火泄木）与柔和圆形灯具。', '忌绿植与水景；重要沟通避开此方。'] },
  { key: '2-2', name: '双黑临门', nature: '凶', magnitude: 0.8, domains: ['健康'],
    meaning: '二黑重叠，病符加倍，主慢性病久治不愈、女主人身心俱疲。',
    classical: '《紫白诀》：「黑遇黄时出寡妇。」',
    cures: ['铜制品与金属大量泄土；保持通风干燥、日照充足。', '此方不宜作卧床、久坐与用餐区。'] },
  { key: '5-5', name: '双五叠临', nature: '凶', magnitude: 1.0, domains: ['健康', '意外', '财运'],
    meaning: '五黄重叠，最凶之局，主重大伤亡、破产、急症手术。',
    classical: '《紫白诀》：「五黄正煞，不拘临方到向，人口常损。」',
    cures: ['封闭化静，最好作储藏或完全不使用。', '成串六帝钱 + 铜铃 + 铜葫芦；全年禁动土。'] },
  { key: '1-1', name: '双白同宫', nature: '吉', magnitude: 0.7, domains: ['事业', '感情'],
    meaning: '一白重叠，主智慧与桃花皆盛；当运利名利，失运则易溺于情色。',
    classical: '《玄机赋》：「坎宫高塞而耳聋。」',
    cures: ['宜书房与谈判位；置清水与金属摆件。'] },
  { key: '8-8', name: '双白财星', nature: '吉', magnitude: 1.0, domains: ['财运', '人丁'],
    meaning: '当元八白重叠，为九运前后最强财丁之局，主大发田产、家门兴旺。',
    classical: '《紫白诀》：「八白之土，为三吉之一。」',
    cures: ['宜设大门、收银台、主卧、保险箱；置泰山石、玉器、聚宝盆。'] },
  { key: '9-9', name: '双紫齐临', nature: '吉', magnitude: 0.95, domains: ['财运', '感情', '事业'],
    meaning: '九运当元九紫重叠，主名声大显、婚喜重重、事业腾达。',
    classical: '《紫白诀》：「九紫虽司喜庆。」',
    cures: ['宜设大门、客厅、直播/展示区；忌此方设厕。'] },
  { key: '6-7', name: '交剑煞', nature: '凶', magnitude: 0.7, domains: ['意外', '官非', '感情'],
    meaning: '六白七赤双金相激，如两剑交锋，主争执动武、金属外伤、手术、兄弟阋墙。',
    classical: '《紫白诀》：「交剑煞兴，多劫掠。」',
    cures: ['置水（深色鱼缸或黑色水器）泄双金之气。', '忌金属摆件、刀具外露与红色（火克金反激）。'] },
  { key: '7-6', name: '交剑煞', nature: '凶', magnitude: 0.7, domains: ['意外', '官非'],
    meaning: '七赤与六白双金相击，是为交剑，主血光刀伤、盗劫、官非与正面冲突。',
    classical: '《紫白诀》：「交剑煞兴，多劫掠。」',
    cures: ['以水泄金；收好刀具利器。'] },
  { key: '4-4', name: '双绿同宫', nature: '中', magnitude: 0.5, domains: ['事业', '感情'],
    meaning: '四绿重叠，当运主文名远播、桃花旺；失运则主神经衰弱、烂桃花、优柔寡断。',
    classical: '《玄空秘旨》：「同来震巽，昧事无常。」',
    cures: ['当运置文昌塔催名；失运则以火（红色）泄木定神。'] },
  { key: '2-4', name: '风见病符', nature: '凶', magnitude: 0.6, domains: ['感情', '健康'],
    meaning: '四绿木克二黑土，主婆媳姑嫂不和、女性长辈患病、家中女性争执。',
    classical: '《玄空秘旨》：「风行地上，决定伤脾。」',
    cures: ['置红色系通关（木生火、火生土）。', '女性长辈卧房避开此方。'] },
  { key: '4-2', name: '风见病符', nature: '凶', magnitude: 0.6, domains: ['感情', '健康'],
    meaning: '四绿巽木与二黑坤土同宫，木克土而风动病符，主脾胃与情绪交互恶化，女性尤须留意。',
    classical: '《玄空秘旨》：「风行地上，决定伤脾。」',
    cures: ['红色通关；忌绿植加剧木克土。'] },
  { key: '1-7', name: '金水桃花', nature: '中', magnitude: 0.55, domains: ['感情', '财运'],
    meaning: '七赤金生一白水，当运主偏财与人缘；失运则主酒色财气、桃花破财。',
    classical: '《玄机赋》：「金水多情，贪花恋酒。」',
    cures: ['已婚者此方忌设卧床；置绿植泄水收敛桃花。'] },
  { key: '7-1', name: '金水桃花', nature: '中', magnitude: 0.55, domains: ['感情'],
    meaning: '七赤兑金生一白坎水，当令主口才与人缘；向星一白失运则主感情不专、酒色损身。',
    classical: '《玄机赋》：「金水多情，贪花恋酒。」',
    cures: ['夫妻卧房避开；置木属性物件泄水。'] },
  { key: '6-9', name: '火烧天门', nature: '凶', magnitude: 0.8, domains: ['健康', '意外', '官非'],
    meaning: '九紫火克六白乾金，乾为老父为头，主男主人头疾、心血管、吐血，及火灾官非。',
    classical: '《飞星赋》：「火照天门，必当吐血。」',
    cures: ['置厚重土性物（黄玉、陶瓷、粗盐）通关泄火生金。', '男主人卧房、书房避开此方；忌炉灶与红色。', '定期检查血压与心血管。'] },
  { key: '9-6', name: '火烧天门', nature: '凶', magnitude: 0.8, domains: ['健康', '意外'],
    meaning: '九紫火照六白乾金，火克天门，山星九紫主人身受火克，应在长辈头部、心血管与目疾。',
    classical: '《飞星赋》：「火照天门，必当吐血。」',
    cures: ['土性通关；忌明火与红色。'] },
  { key: '3-8', name: '损小口', nature: '凶', magnitude: 0.6, domains: ['人丁', '健康'],
    meaning: '三碧木克八白土，艮为少男，主幼儿跌伤、关节脾胃受损、儿童叛逆。',
    classical: '《玄空秘旨》：「山风值而泉石膏肓。」',
    cures: ['置红色系通关（木生火、火生土）。', '儿童房避开此方，或加铺厚地毯与防撞条。'] },
  { key: '8-3', name: '损小口', nature: '凶', magnitude: 0.6, domains: ['人丁', '财运'],
    meaning: '八白艮土被三碧震木所克，艮为少男，主损伤小口；向星三碧主因幼儿之事或纠纷而破财。',
    classical: '《玄空秘旨》：「山风值而泉石膏肓。」',
    cures: ['红色通关；儿童房另择吉方。'] },

  /* ── 以下七组补于「双星断事」知识梳理之后，原表未收 ── */

  { key: '3-4', name: '碧绿风魔', nature: '凶', magnitude: 0.7, domains: ['健康', '感情'],
    meaning: '三碧震木与四绿巽木同宫，木气过盛而风动，主神经衰弱、中风偏枯、情绪失控，亦主淫佚漂荡。',
    classical: '《玄空秘旨》：「碧绿风魔，他处廉贞莫见。」',
    cures: ['以火泄木（暖色灯、红色饰物），忌再添水与深绿。', '此方不宜久坐久卧；有长者或神经系统病史者尤须避开。'] },
  { key: '4-3', name: '碧绿风魔', nature: '凶', magnitude: 0.7, domains: ['健康', '感情'],
    meaning: '四绿与三碧双木过盛而风动，山星四绿主人事漂荡不定、神经衰弱，向星三碧主因争执而耗财。',
    classical: '《玄空秘旨》：「碧绿风魔，他处廉贞莫见。」',
    cures: ['火泄木气，忌水木再助。', '避免在此方作长时间的思虑性工作。'] },

  { key: '3-5', name: '三五同宫', nature: '凶', magnitude: 0.85, domains: ['健康', '财运', '意外'],
    meaning: '三碧木克五黄土，动则触煞，主急症中风、肝胆之疾、破财伤人；五黄本忌被克动。',
    classical: '《紫白诀》：「五黄正煞，不拘临方到向，人口常损。」木克土动之则祸。',
    cures: ['此方务求静止：不动土、不敲打、不作主要通道。', '铜金泄土而不助木：六帝钱、铜器；忌绿色植物与红色。'] },
  { key: '5-3', name: '三五同宫', nature: '凶', magnitude: 0.85, domains: ['健康', '财运', '意外'],
    meaning: '五黄土被三碧木所克，动则触煞，山星五黄主人丁急症伤病，向星三碧主因是非官非而破财。',
    classical: '《紫白诀》：「五黄正煞，不拘临方到向，人口常损。」',
    cures: ['化为静区，移走卧床与灶位。', '铜器泄土，忌木与火。'] },

  { key: '1-2', name: '水土相荡', nature: '凶', magnitude: 0.6, domains: ['健康', '感情'],
    meaning: '一白坎水入二黑坤腹，主腹疾水肿、脾胃不和、泌尿与妇科同病；中男与老母失和。',
    classical: '《玄空秘旨》：「腹多水而膨胀。」',
    cures: ['金泄土而生水，用白色与铜器。', '忌此方设卧床与灶位；有肠胃或妇科旧疾者尤须避开。'] },
  { key: '2-1', name: '水土相荡', nature: '凶', magnitude: 0.6, domains: ['健康', '财运'],
    meaning: '二黑坤土与一白坎水相荡，山星二黑主久病缠身、脾胃不和，向星一白主财来财去如水、因病耗财。',
    classical: '《玄空秘旨》：「腹多水而膨胀。」',
    cures: ['金泄土通关；忌红色与土色堆叠。'] },

  { key: '1-3', name: '水木相生', nature: '中', magnitude: 0.45, domains: ['事业', '官非'],
    meaning: '一白水生三碧木，当令主长男进取、创业得助；失令则木盛水泄，主奔波争讼、是非缠身。',
    classical: '《紫白诀》三碧「蚩尤黑曜，斗争频」；一白当令主贵，失令主漂泊。',
    cures: ['当令可作书房与创业办公位。', '失令则以火泄木、忌再添水；避免在此方谈判与签约。'] },
  { key: '3-1', name: '水木相生', nature: '中', magnitude: 0.45, domains: ['事业', '官非'],
    meaning: '三碧木得一白水生，当令主长男进取有成；山星三碧亦主人事争斗，向星一白主财路流动不居。',
    classical: '《紫白诀》三碧主斗争；一白主智慧与流动之财。',
    cures: ['当令宜进取；失令则少争一时之气，凡事留书面。'] },

  { key: '1-5', name: '五黄污水', nature: '凶', magnitude: 0.75, domains: ['健康', '人丁'],
    meaning: '五黄土克一白水，主肾与膀胱之疾、妇科与生育之忧，久之损丁。',
    classical: '《紫白诀》：「五黄正煞，人口常损。」土克水则伤中男与泌尿生殖。',
    cures: ['铜金泄土生水，忌土色与红色。', '此方不宜设卧床，备孕者尤须避开。'] },
  { key: '5-1', name: '五黄污水', nature: '凶', magnitude: 0.75, domains: ['健康', '人丁'],
    meaning: '五黄土克一白水，山星五黄主人丁伤病、肾与泌尿之疾，向星一白主财如浊水、进而复失。',
    classical: '《紫白诀》：「五黄正煞，人口常损。」',
    cures: ['化为静区；铜器泄土，忌动土与红色灯饰。'] },

  { key: '2-8', name: '双土比和', nature: '中', magnitude: 0.5, domains: ['财运', '健康'],
    meaning: '二黑与八白同为土，当元八白得令则主田产丰盈；八白退气则二黑病符坐大，主久病与旧屋之累。',
    classical: '《紫白诀》：「八白为当元财星，二黑为病符。」同气则视谁当令。',
    cures: ['当令可作财位与储藏；失令则以金泄土，忌再添火土。', '有慢性病者不宜以此方为卧房。'] },
  { key: '8-2', name: '双土比和', nature: '中', magnitude: 0.5, domains: ['财运', '健康'],
    meaning: '八白与二黑双土比和，山星八白主人丁稳固、田宅有靠，向星二黑主因病耗财或为旧产所累。',
    classical: '《紫白诀》八白当元财星、二黑病符。',
    cures: ['金泄土，白色与铜器；忌红色。'] },

  { key: '5-8', name: '五黄压土', nature: '凶', magnitude: 0.7, domains: ['健康', '财运'],
    meaning: '五黄与八白同为土而五黄污之，主脊椎与关节、消化与鼻呼吸之疾；八白财星被污，进财受阻。',
    classical: '《紫白诀》：「五黄正煞。」八白属艮，主鼻、手、脊背。',
    cures: ['铜金泄土，此方务求静止不动土。', '有脊椎或鼻呼吸旧疾者避开此方久坐久卧。'] },
  { key: '8-5', name: '五黄压土', nature: '凶', magnitude: 0.7, domains: ['健康', '财运'],
    meaning: '八白艮土被五黄所污，山星八白应在少男与手足脊背，向星五黄主因病破财、进财受阻。',
    classical: '《紫白诀》五黄正煞；八白属艮主鼻手脊背。',
    cures: ['铜器泄土；忌在此方装修动工。'] },
];

const COMBO_MAP = new Map(COMBINATIONS.map((c) => [c.key, c]));

/** 查二星组合；未收录则返回 null，交由通则推导。 */
export function lookupCombination(shan: PalaceIndex, xiang: PalaceIndex): Combination | null {
  return COMBO_MAP.get(`${shan}-${xiang}`) ?? null;
}

/**
 * 通则推导：无经典组合时，以五行生克 + 双星本性合成断语。
 * 保证任何组合都有可解释的结论，不留空白。
 */
export function deriveCombination(shan: PalaceIndex, xiang: PalaceIndex, period: PalaceIndex): Combination {
  const hit = lookupCombination(shan, xiang);
  if (hit) return hit;
  const ws = STAR_WUXING[shan];
  const wx = STAR_WUXING[xiang];
  const rel = wuXingRelation(ws, wx);
  const ss = starScore(shan, period);
  const sx = starScore(xiang, period);
  const avg = (ss + sx) / 2;
  const relText: Record<typeof rel, string> = {
    同: '二星同气，力量叠加',
    生我: '向星生山星，利人丁健康甚于财',
    我生: '山星生向星，人丁之力泄于财，主辛劳得财',
    我克: '山星克向星，主因人事压制财路',
    克我: '向星克山星，主因财损丁、为财伤身',
  } as const;
  const nature = avg > 0.25 ? '吉' : avg < -0.25 ? '凶' : '中';
  return {
    key: `${shan}-${xiang}`,
    name: `${STAR_NAME[shan]}${STAR_NAME[xiang]}同宫`,
    nature,
    magnitude: Math.min(1, Math.abs(avg) * 1.2),
    domains: Array.from(new Set([...STAR_META[shan].riskDomains, ...STAR_META[xiang].riskDomains])).slice(0, 3),
    meaning:
      `山星${STAR_NAME[shan]}（${STAR_ALIAS[shan]}·${ws}）配向星${STAR_NAME[xiang]}（${STAR_ALIAS[xiang]}·${wx}）：${relText[rel]}。` +
      `当${period}运，${STAR_NAME[shan]}为${starPhase(shan, period)}、${STAR_NAME[xiang]}为${starPhase(xiang, period)}。`,
    classical: '（无专属经典断语，依五行生克与星曜旺衰通则推导）',
    cures: genericCures(shan, xiang, period),
  };
}

/** 通用化解：泄凶星之气、生吉星之气。 */
function genericCures(shan: PalaceIndex, xiang: PalaceIndex, period: PalaceIndex): string[] {
  const out: string[] = [];
  for (const s of [shan, xiang] as const) {
    const score = starScore(s, period);
    const wx = STAR_WUXING[s];
    if (score < -0.2) {
      const drain = GENERATES[wx]; // 泄其气者
      out.push(`${STAR_NAME[s]}（${wx}）失令为患，宜以「${drain}」泄之：${MATERIAL_BY_WUXING[drain].join('、')}；忌用「${reverseGenerate(wx)}」之物助其凶。`);
    } else if (score > 0.4) {
      const feed = reverseGenerate(wx);
      out.push(`${STAR_NAME[s]}（${wx}）当令有力，宜以「${feed}」生之：${MATERIAL_BY_WUXING[feed].join('、')}，可加强其吉应。`);
    }
  }
  if (out.length === 0) out.push('此宫星力平和，维持整洁通风即可，不必刻意布局。');
  return out;
}

/** 生我者（即 X 生 wx 的那个 X）。 */
export function reverseGenerate(wx: WuXing): WuXing {
  const found = (Object.keys(GENERATES) as WuXing[]).find((k) => GENERATES[k] === wx);
  return found!;
}

/** 克我者。 */
export function reverseControl(wx: WuXing): WuXing {
  const found = (Object.keys(CONTROLS) as WuXing[]).find((k) => CONTROLS[k] === wx);
  return found!;
}

/** 五行 → 常用化解物件（实操清单）。 */
export const MATERIAL_BY_WUXING: Record<WuXing, readonly string[]> = {
  金: ['六帝古钱', '纯铜风铃', '铜葫芦', '金属摆钟', '白色圆形金属器'],
  木: ['阔叶绿植', '富贵竹（清水养）', '实木家具', '绿色系布艺'],
  水: ['深色鱼缸', '黑色水器', '流水摆件', '蓝黑色地毯', '加湿器'],
  火: ['红色中国结', '暖色灯具', '紫色/红色布艺', '长明小夜灯', '三角形装饰'],
  土: ['黄玉', '陶瓷大瓮', '泰山石敢当', '粗盐罐', '方形土黄色摆件'],
};

/** 化解物之「禁忌」：助长该五行者不可用。 */
export function forbiddenMaterialFor(target: WuXing): readonly string[] {
  return MATERIAL_BY_WUXING[reverseGenerate(target)];
}

/** 健康风险引擎：星 → 脏腑（供 Room × Person 矩阵与预警使用）。 */
export function organRisksOf(stars: readonly PalaceIndex[], period: PalaceIndex): {
  organ: string;
  star: PalaceIndex;
  ailments: readonly string[];
  severity: number;
}[] {
  const out: { organ: string; star: PalaceIndex; ailments: readonly string[]; severity: number }[] = [];
  for (const s of stars) {
    const sc = starScore(s, period);
    if (sc >= -0.1) continue; // 只在星失令为患时报健康风险
    const meta = STAR_META[s];
    for (const organ of meta.organs) {
      out.push({ organ, star: s, ailments: meta.ailments, severity: Math.min(1, -sc) });
    }
  }
  return out.sort((a, b) => b.severity - a.severity);
}

export { STAR_NAME, STAR_ALIAS, STAR_WUXING };
