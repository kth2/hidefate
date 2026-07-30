/**
 * 形势峦头（体）—— 此前整个系统只有理气，没有峦头。
 *
 * 《葬书》以「龙穴砂水向」为纲，无论三元三合，均以峦头为先。
 * 「峦头为体，理气为用；峦头差，理气无用；理气差，峦头吉地亦减分。」
 *
 * 都市阳宅之峦头，以类比法论：**道路即水，高楼即山**。
 *   - 明堂 = 向方之开阔处
 *   - 靠山 = 坐方之实体（后有高楼、山丘为有靠）
 *   - 青龙白虎 = 左右护砂（左东为龙，右西为虎，以人面向向首而分）
 *   - 水口 = 道路来去、河流形态
 *
 * 本模块只做确定性计分与查表，每一项都带古法依据与化解法。
 */

import { PALACE_DIRECTION, type PalaceIndex } from './constants.js';

/** 峦头项目。 */
export type XingShiFeature =
  // ── 吉象 ──
  | '明堂开阔'
  | '有水朝堂'
  | '后方有靠'
  | '青龙得位'
  | '白虎驯服'
  | '案山有情'
  | '环抱之水'
  // ── 凶象（形煞）──
  | '大路直冲'
  | '反弓路'
  | '天斩煞'
  | '壁刀煞'
  | '尖角冲射'
  | '电塔变压器'
  | '明堂被挡'
  | '高楼压迫'
  | '后方空旷'
  | '孤峰独耸'
  | '寺庙坟场'
  | '高架桥'
  | '垃圾站'
  | '医院殡仪'
  | '水流直去'
  | '污水臭沟'
  | '枯树烂木'
  | '开口煞'
  | '路桥反弓';

export type XingShiKind = '吉' | '凶';

/** 峦头项目性质：全局气势，或某一方位之修正。 */
export type XingShiScope = '全局' | '方位';

export interface XingShiMeta {
  readonly feature: XingShiFeature;
  readonly kind: XingShiKind;
  readonly scope: XingShiScope;
  /**
   * 基础权重（满强度时对峦头分的贡献），吉为正、凶为负。
   * 取值区间依用户所定之规格，并对齐传统对各煞轻重的判断。
   */
  readonly weight: number;
  /** 应象 —— 主要影响什么。 */
  readonly affects: string;
  readonly classical: string;
  readonly cures: readonly string[];
  /** 一句话说明，供勾选界面提示。 */
  readonly note: string;
}

export const XING_SHI_META: Record<XingShiFeature, XingShiMeta> = {
  // ───────────── 吉象 ─────────────
  明堂开阔: {
    feature: '明堂开阔', kind: '吉', scope: '全局', weight: 0.25,
    affects: '财禄、事业格局、心境开阔',
    classical: '《葬书》：「明堂宽绰，气象万千。」向首之前须有开阔平坦之地以聚气纳财。',
    cures: ['既有此利，宜保持向方通透，勿自行加建遮挡；阳台不宜封死堆物。'],
    note: '大门／主窗朝向前方开阔（有广场、公园、宽路、空地）',
  },
  有水朝堂: {
    feature: '有水朝堂', kind: '吉', scope: '方位', weight: 0.25,
    affects: '财运、聚财',
    classical: '《水龙经》：「水抱边可寻地。」水为财，来水朝堂而有情，主财源汇聚。都市中缓流之路、河渠、湖池皆可类比为水。',
    cures: ['此为吉象。若在向星当旺之方，更可于室内该方置水景相应，取「零神得水」之意。'],
    note: '前方或某方有河、湖、池、缓流大路（水为财）',
  },
  后方有靠: {
    feature: '后方有靠', kind: '吉', scope: '全局', weight: 0.2,
    affects: '人丁、健康、事业稳固、心神安定',
    classical: '《葬书》：「玄武垂头。」坐方须有实体为靠，主根基稳固、人丁安泰。都市中后有高楼、山丘即为有靠。',
    cures: ['既有此利，坐方室内宜「实」：置高柜、厚墙、山水画（有山者），忌开大窗致气泄。'],
    note: '房屋背后有高楼、山丘、稳固建筑（有靠山）',
  },
  青龙得位: {
    feature: '青龙得位', kind: '吉', scope: '全局', weight: 0.15,
    affects: '男丁、事业助力、贵人',
    classical: '《葬书》：「青龙蜿蜒。」左砂（面向向首之左手方）宜略高而绵长有情，主男丁与事业。',
    cures: ['宜维持左方之实与整洁，勿堆废物。'],
    note: '面向大门站立时，左手方有建筑、绿篱护卫且不压迫',
  },
  白虎驯服: {
    feature: '白虎驯服', kind: '吉', scope: '全局', weight: 0.15,
    affects: '女眷、口舌、意外',
    classical: '《葬书》：「白虎驯頫。」右砂宜低伏顺服，不宜高压过龙，否则主女强口舌、意外之伤。',
    cures: ['右方宜低伏整洁；若右高于左，可于左方加植高树或立柱以扶龙。'],
    note: '面向大门站立时，右手方低伏顺服，不高压左方',
  },
  案山有情: {
    feature: '案山有情', kind: '吉', scope: '方位', weight: 0.15,
    affects: '事业有成、财禄有收',
    classical: '《地理五诀》：「有案山则财禄丰。」向首之外中距处有低矮建筑或土丘横列，如案在前，主气有所收。',
    cures: ['此为吉象，宜保持向方中距之景不被高楼取代。'],
    note: '向方中距处有低矮楼房或小丘横列（如案几在前）',
  },
  环抱之水: {
    feature: '环抱之水', kind: '吉', scope: '方位', weight: 0.2,
    affects: '财运、家宅安稳',
    classical: '《水龙经》：「金城环抱。」水路弯环抱向本宅（弓内），主聚财护宅；若弓背向宅则为反弓，主退败。',
    cures: ['此为吉象。可在该方置聚宝之物或收银台，取其环抱之利。'],
    note: '弯路或河流以「内弯」环抱本宅（非弓背相向）',
  },

  // ───────────── 凶象 ─────────────
  大路直冲: {
    feature: '大路直冲', kind: '凶', scope: '方位', weight: -0.45,
    affects: '意外、破财、家人不安、健康',
    classical: '《阳宅十书》：「当门路冲，如箭射心。」路冲又名弓箭煞，气以直冲为杀，主意外与耗散。',
    cures: [
      '首选「移形易位」：把大门或主气口移出直冲之线，或加设玄关、影壁使气路转折。',
      '门前立泰山石敢当，或置屏风、高身绿植（阔叶、密实）作阻挡 —— 要挡得住视线，不可用通透玻璃。',
      '门上可悬凸面镜反射（须朝外，且不可正对邻户门口，以免招邻里之争）。',
      '此方室内忌设卧床与久坐之位。',
    ],
    note: '有道路（尤其大路）直冲大门或主窗',
  },
  反弓路: {
    feature: '反弓路', kind: '凶', scope: '方位', weight: -0.35,
    affects: '破财、退败、家人离散',
    classical: '《水龙经》：「反弓无情，退财伤丁。」弯路以弓背相向，如刀背割宅，气不聚而反割。',
    cures: [
      '此煞难化，最彻底者为迁离或改向。',
      '退而求次：沿弓背方向筑实墙、密植高篱以隔断，勿留通透。',
      '弓背方之室内不宜作主要活动区与卧房。',
    ],
    note: '弯路／河流以「弓背」朝向本宅（反弓）',
  },
  天斩煞: {
    feature: '天斩煞', kind: '凶', scope: '方位', weight: -0.3,
    affects: '意外、血光、夫妻不和、健康',
    classical: '《阳宅撮要》：两楼相夹之缝正对本宅，如刀斩下，谓之天斩。缝隙愈窄、距离愈近，煞气愈烈。',
    cures: [
      '受冲之窗宜常闭或加厚窗帘、贴磨砂膜，先断其直视。',
      '窗台置铜葫芦或厚重石器化其锐气。',
      '该窗后不宜设卧床、书桌与久坐之位。',
    ],
    note: '正对两栋高楼之间的狭缝',
  },
  壁刀煞: {
    feature: '壁刀煞', kind: '凶', scope: '方位', weight: -0.28,
    affects: '意外、外伤、口舌',
    classical: '邻楼墙角之棱线正切本宅，如刀刃切来，主外伤与突发之事。',
    cures: ['受切之处置凸面镜或厚窗帘阻断视线；窗台置石器。', '此方忌设卧床。'],
    note: '邻楼的墙角棱线正切向本宅',
  },
  尖角冲射: {
    feature: '尖角冲射', kind: '凶', scope: '方位', weight: -0.25,
    affects: '意外、口舌、健康',
    classical: '《阳宅十书》论尖角冲射，凡屋角、招牌尖端、雕塑锐角冲门冲窗者，皆主刑伤口舌。',
    cures: ['以凸面镜化之，或以厚重绿植、屏风遮断。', '室内该方置圆润之物（圆形器皿、球状石）以圆化尖。'],
    note: '邻建筑尖角、招牌锐角冲射门窗',
  },
  电塔变压器: {
    feature: '电塔变压器', kind: '凶', scope: '方位', weight: -0.32,
    affects: '健康、神经、意外、火险',
    classical: '古无电塔，然以形势论，高压电塔属「孤峰带煞」兼火金之气，主神经不宁、血光与火厄。',
    cures: [
      '受冲之窗加厚窗帘常闭；该方室内忌设卧床，尤忌儿童房。',
      '置厚重土性之物（黄玉、陶瓮、粗盐）以厚土制之。',
      '实务上亦请留意实体因素：电磁与噪音本身即影响睡眠，此非玄学而是常理。',
    ],
    note: '附近有高压电塔、变压器、信号基站',
  },
  明堂被挡: {
    feature: '明堂被挡', kind: '凶', scope: '方位', weight: -0.28,
    affects: '事业受阻、财路不通、心境压抑',
    classical: '《葬书》重明堂，明堂闭塞则气不入。向首为纳气之处，被高墙大楼紧压则前程受阻。',
    cures: [
      '向方室内宜极力争取明亮：加强照明、用镜面扩展视觉（勿正对门），保持通透不堆物。',
      '于向方悬挂开阔景致之画（远山、平原、海景）以「意象开明堂」。',
      '若尚可选择，宁取楼层较高者以越过遮挡。',
    ],
    note: '大门／主窗前方被高墙、大楼紧密遮挡',
  },
  高楼压迫: {
    feature: '高楼压迫', kind: '凶', scope: '方位', weight: -0.25,
    affects: '压抑、事业受制、健康',
    classical: '客山高压主山，谓之「奴欺主」，主受制于人、诸事不由己。',
    cures: ['该方加强采光与暖色照明以提气。', '室内该方置向上生长之高身绿植，取其生发之势。'],
    note: '邻近有远高于本宅的建筑压迫',
  },
  后方空旷: {
    feature: '后方空旷', kind: '凶', scope: '全局', weight: -0.25,
    affects: '根基不稳、人丁、事业无援、心神不宁',
    classical: '《葬书》：「玄武藏头」为忌。坐方无靠则如背后无墙而坐，主根基虚浮、缺贵人相助。',
    cures: [
      '坐方室内造「人造靠山」：置高大厚实之柜、书墙，或挂厚重之山水画（须有主峰）。',
      '坐方之窗宜加厚窗帘，勿终日敞开致气泄。',
      '床头、办公椅之后须紧贴实墙，绝不可背窗背门。',
    ],
    note: '房屋背后空旷、临水、临下坡或无建筑',
  },
  孤峰独耸: {
    feature: '孤峰独耸', kind: '凶', scope: '全局', weight: -0.22,
    affects: '孤立无援、人丁单薄',
    classical: '《葬书》：「孤峰独耸，气散不聚。」四周无护而独高者，风吹气散，主孤寡无助。',
    cures: ['四周宜加植树木、围墙以生护砂之意。', '室内忌过度空旷，宜以家具分隔围合，造「藏风」之势。'],
    note: '本宅孤立独高，四周无建筑护卫',
  },
  寺庙坟场: {
    feature: '寺庙坟场', kind: '凶', scope: '方位', weight: -0.25,
    affects: '阴气、健康、心神、家运冷退',
    classical: '《阳宅十书》：「宅近寺庙坟茔，主人丁冷退。」阴气重之地，阳宅不宜太近。',
    cures: ['该方窗户加厚窗帘、常保室内明亮通风。', '室内可置长明灯或暖色光源以助阳气。', '该方不宜作卧房与儿童房。'],
    note: '附近有寺庙、教堂、坟场、殡仪馆',
  },
  高架桥: {
    feature: '高架桥', kind: '凶', scope: '方位', weight: -0.28,
    affects: '不安、破财、健康、噪音',
    classical: '高架如「腰带煞」横过，气流湍急且噪音不绝，主家宅不宁、财来财去。',
    cures: ['临桥之窗加装隔音与厚帘。', '该方不宜设卧房；室内置厚重之物稳定气场。'],
    note: '临近高架桥、高速公路、铁路',
  },
  垃圾站: {
    feature: '垃圾站', kind: '凶', scope: '方位', weight: -0.22,
    affects: '健康、财运、口舌',
    classical: '污秽之气冲门，主病气与破财。《阳宅十书》忌「门对秽污」。',
    cures: ['该方门窗常闭并加强除味通风。', '门口置绿植与洁净照明改善第一观感。'],
    note: '附近有垃圾站、污水处理、排污口',
  },
  医院殡仪: {
    feature: '医院殡仪', kind: '凶', scope: '方位', weight: -0.24,
    affects: '健康、阴气、心神',
    classical: '病气与死气之所，阳宅忌近。理同寺庙坟场而更重于病气。',
    cures: ['该方窗帘常闭，保持室内干燥明亮。', '不宜以该方作卧房、老人房。'],
    note: '紧邻医院、殡仪馆、火化场',
  },
  水流直去: {
    feature: '水流直去', kind: '凶', scope: '方位', weight: -0.25,
    affects: '破财、财不聚',
    classical: '《水龙经》：「水直流而去，财随之泄。」去水须有关锁，直流无收则财不聚。',
    cures: ['室内于该方置屏风、高柜「关锁」气路。', '忌在该方设收银台、保险箱。', '门口可置泰山石以镇。'],
    note: '门前之路／水笔直流去，一望无锁',
  },
  污水臭沟: {
    feature: '污水臭沟', kind: '凶', scope: '方位', weight: -0.2,
    affects: '健康、财运',
    classical: '水为财，然浊水非财而为病。臭沟当门，主病气与财路混浊。',
    cures: ['该方门窗加强密闭与除味。', '室内该方保持极度洁净干燥。'],
    note: '门前或近处有臭水沟、死水池',
  },
  枯树烂木: {
    feature: '枯树烂木', kind: '凶', scope: '方位', weight: -0.18,
    affects: '生气不足、健康、家运',
    classical: '《阳宅十书》：「门前枯树，主凶。」枯木无生气，立于气口尤忌。',
    cures: ['最直接者：移除枯树，另植新绿。此煞化解成本最低而见效最快。'],
    note: '门前或窗前有枯死树木',
  },
  开口煞: {
    feature: '开口煞', kind: '凶', scope: '方位', weight: -0.25,
    affects: '破财、不安、人来人往之扰',
    classical: '停车场出入口、地下道口如巨口张开正对本宅，吞吐之气不定，主财物耗散。',
    cures: ['门口设屏风、影壁或密实绿植遮断。', '该方不宜设主气口与收银位。'],
    note: '正对停车场出入口、地下道口、隧道口',
  },
  路桥反弓: {
    feature: '路桥反弓', kind: '凶', scope: '方位', weight: -0.3,
    affects: '破财、意外',
    classical: '天桥、匝道以弓背向宅，兼具反弓与高压之势，较平地反弓更烈。',
    cures: ['沿弓背方筑实墙密植遮断；该方忌设卧房与主要活动区。'],
    note: '天桥、匝道以弓背朝向本宅',
  },
};

/** 用户勾选的一项峦头。 */
export interface XingShiItem {
  readonly feature: XingShiFeature;
  /** 所在方位；全局项目可省。 */
  readonly palace?: PalaceIndex | null;
  /** 强度 0–1，默认 1（勾选即视为明显）。 */
  readonly intensity?: number;
  readonly note?: string;
}

export interface XingShiContribution {
  readonly feature: XingShiFeature;
  readonly kind: XingShiKind;
  readonly scope: XingShiScope;
  readonly palace: PalaceIndex | null;
  readonly direction: string | null;
  readonly intensity: number;
  /** 实际贡献（已乘强度）。 */
  readonly contribution: number;
  readonly meta: XingShiMeta;
}

export interface XingShiScore {
  /** 峦头总分，归一化到 [-1, +1]。 */
  readonly score: number;
  /** 全局气势分（明堂/靠山/龙虎等）。 */
  readonly overall: number;
  /**
   * 方位修正之和（仅凶项的负向合计，用于否决机制的判据）。
   * 规格所定「峦头修正 < -0.4 触发否决」即指此值。
   */
  readonly negativeCorrection: number;
  /** 吉项合计。 */
  readonly positive: number;
  readonly contributions: readonly XingShiContribution[];
  /** 是否有用户填写（无则置信度须下调）。 */
  readonly assessed: boolean;
  readonly summary: string;
}

/**
 * 峦头计分。
 *
 * 分两部分：
 *   - 全局气势：明堂、靠山、龙虎等，决定基调
 *   - 方位修正：各方形煞与吉象，逐项加减
 *
 * 归一化用 tanh 压缩而非硬截断 —— 硬截断会让「三个煞」与「六个煞」得同一个分，
 * 失去区分度；tanh 则单调递减且自然收敛于 ±1。
 */
export function scoreXingShi(items: readonly XingShiItem[]): XingShiScore {
  const contributions: XingShiContribution[] = [];
  let overall = 0;
  let negative = 0;
  let positive = 0;

  for (const it of items) {
    const meta = XING_SHI_META[it.feature];
    if (!meta) continue;
    const intensity = Math.max(0, Math.min(1, it.intensity ?? 1));
    if (intensity === 0) continue;
    const contribution = meta.weight * intensity;

    contributions.push({
      feature: it.feature,
      kind: meta.kind,
      scope: meta.scope,
      palace: it.palace ?? null,
      direction: it.palace != null ? PALACE_DIRECTION[it.palace] : null,
      intensity,
      contribution,
      meta,
    });

    if (meta.scope === '全局') overall += contribution;
    if (contribution < 0) negative += contribution;
    else positive += contribution;
  }

  // 全局项与方位项都已计入 negative／positive，故总和即为二者相加。
  const total = negative + positive;
  const score = Math.tanh(total * 1.2);

  const worst = [...contributions].sort((a, b) => a.contribution - b.contribution)[0];
  const best = [...contributions].sort((a, b) => b.contribution - a.contribution)[0];

  const summary = !items.length
    ? '未填外部环境。峦头为体，缺此一环则判断只剩理气一半 —— 建议补填，哪怕只勾几项最明显的。'
    : `峦头合计 ${score >= 0 ? '+' : ''}${score.toFixed(2)}` +
      (worst && worst.contribution < 0
        ? `；最须处理者为${worst.direction ? worst.direction + '之' : ''}「${worst.feature}」（${worst.contribution.toFixed(2)}）`
        : '') +
      (best && best.contribution > 0
        ? `；可借力者为「${best.feature}」（+${best.contribution.toFixed(2)}）`
        : '') +
      '。';

  return {
    score,
    overall: Math.tanh(overall * 1.2),
    negativeCorrection: negative,
    positive,
    contributions: contributions.sort((a, b) => a.contribution - b.contribution),
    assessed: items.length > 0,
    summary,
  };
}

/** 全部吉象。 */
export const AUSPICIOUS_FEATURES: readonly XingShiFeature[] = (
  Object.keys(XING_SHI_META) as XingShiFeature[]
).filter((f) => XING_SHI_META[f].kind === '吉');

/** 全部凶象（形煞）。 */
export const SHA_FEATURES: readonly XingShiFeature[] = (
  Object.keys(XING_SHI_META) as XingShiFeature[]
).filter((f) => XING_SHI_META[f].kind === '凶');

/** 形煞化解清单（按严重度排序）。 */
export function xingShiCures(score: XingShiScore): {
  feature: XingShiFeature;
  direction: string | null;
  severity: '严重' | '中等' | '轻微';
  cures: readonly string[];
  classical: string;
  affects: string;
}[] {
  return score.contributions
    .filter((c) => c.contribution < 0)
    .map((c) => ({
      feature: c.feature,
      direction: c.direction,
      severity: c.contribution <= -0.3 ? '严重' : c.contribution <= -0.2 ? '中等' : '轻微',
      cures: c.meta.cures,
      classical: c.meta.classical,
      affects: c.meta.affects,
    }));
}
