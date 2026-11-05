/**
 * 宅盘 × 流年／流月／时辰 叠星。
 *
 * 玄空看「此时此方」的做法是层层叠加：宅盘（山星、向星）为体，流年、流月、时辰紫白为用。
 * 同一宫里，客星（年、月、时星）与宅盘星的组合决定这一方此时宜动宜静。
 * 本模块只做最常用、各派分歧较小的几条，并在每条结论里写明依据：
 *
 *   1. 当运旺星（九运为九紫）作客星，落在宅盘向星当旺／生气／进气之宫 → 吉，宜求财、谈事。
 *   2. 当运旺星作客星，落在宅盘向星五黄之宫 → 旺气受制，力量打折。
 *   3. 客星五黄临宅盘山星或向星为五黄或二黑之宫（「五黄叠临」「二五交加」）→ 宜静，勿动土、敲打。
 *      客星二黑临宅盘五黄同论。二黑单独一颗是否算凶，视元运而定（九运中二黑为进气，各派说法不一），不单独判。
 *   4. 客星四绿临宅盘一白、或客星一白临宅盘四绿之宫（「一四同宫」）→ 文昌，宜读书、考试、写作。
 *
 * 只输出结论与依据，不评分，不改动任何宅盘星数。
 */

import { PALACE_DIRECTION, STAR_NAME, type PalaceIndex } from './constants.js';
import type { FlyingStarChart, StarPlate } from './flyingStar.js';
import { starPhase } from './starMeta.js';

export type OverlayLayer = '年' | '月' | '时';
export type OverlayLevel = '吉' | '宜静' | '打折';

export interface OverlayFinding {
  readonly layer: OverlayLayer;
  readonly palace: PalaceIndex;
  readonly direction: string;
  readonly level: OverlayLevel;
  readonly title: string;
  readonly basis: string;
}

const LAYER_NAME: Record<OverlayLayer, string> = { 年: '流年', 月: '流月', 时: '此时辰' };
const ORDER: Record<OverlayLevel, number> = { 宜静: 0, 打折: 1, 吉: 2 };
const LAYER_ORDER: Record<OverlayLayer, number> = { 时: 0, 月: 1, 年: 2 };

const PALACES: readonly PalaceIndex[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function dirOf(p: PalaceIndex): string {
  return p === 5 ? '中宫' : PALACE_DIRECTION[p];
}

/** 宅盘与一层或多层客星叠加后的结论。 */
export function overlayFindings(
  chart: Pick<FlyingStarChart, 'palaces' | 'period'>,
  layers: Partial<Record<OverlayLayer, StarPlate>>,
): OverlayFinding[] {
  const period = chart.period.period;
  const out: OverlayFinding[] = [];

  for (const layer of Object.keys(layers) as OverlayLayer[]) {
    const plate = layers[layer];
    if (!plate) continue;
    const ln = LAYER_NAME[layer];

    for (const p of PALACES) {
      const guest = plate[p];
      const { shan, xiang } = chart.palaces[p];
      const dir = dirOf(p);
      const push = (level: OverlayLevel, title: string, basis: string) =>
        out.push({ layer, palace: p, direction: dir, level, title, basis });

      // 1、2：当运旺星作客星
      if (guest === period) {
        const ph = starPhase(xiang, period);
        if (xiang === 5) {
          push('打折', `${ln}旺星到${dir}，但宅盘向星五黄`, `${ln}${STAR_NAME[guest]}（当运旺星）临宅盘向星五黄之宫，旺气受制，此方不宜借来求财。`);
        } else if (ph === '当旺' || ph === '生气' || ph === '进气') {
          push('吉', `${ln}旺星到${dir}，正落宅盘旺向星`, `${ln}${STAR_NAME[guest]}（当运旺星）临宅盘向星${STAR_NAME[xiang]}（${ph}）之宫，宅气、时气同旺，${layer === '时' ? '此时辰' : layer === '月' ? '本月' : '今年'}此方最宜求财、谈事、开张。`);
        }
      }

      // 3：五黄叠临、二五交加
      const houseHas5 = shan === 5 || xiang === 5;
      const houseHas2 = shan === 2 || xiang === 2;
      if (guest === 5 && (houseHas5 || houseHas2)) {
        const which = [shan === 5 || shan === 2 ? `山星${STAR_NAME[shan]}` : null, xiang === 5 || xiang === 2 ? `向星${STAR_NAME[xiang]}` : null]
          .filter(Boolean)
          .join('、');
        push('宜静', `${ln}五黄到${dir}，叠宅盘${which}`, `${ln}五黄临宅盘${which}之宫（${houseHas5 ? '五黄叠临' : '二五交加'}），${layer === '时' ? '此时辰' : layer === '月' ? '本月' : '今年'}此方宜静：勿动土、勿敲打、勿大声响。`);
      } else if (guest === 2 && houseHas5) {
        push('宜静', `${ln}二黑到${dir}，叠宅盘五黄`, `${ln}二黑临宅盘五黄之宫（二五交加），${layer === '时' ? '此时辰' : layer === '月' ? '本月' : '今年'}此方宜静。`);
      }

      // 4：一四同宫（客星四绿会宅盘一白，或客星一白会宅盘四绿）
      const houseHas = (n: PalaceIndex) => shan === n || xiang === n;
      if ((guest === 4 && houseHas(1)) || (guest === 1 && houseHas(4))) {
        const [g, h] = guest === 4 ? ['四绿', '一白'] : ['一白', '四绿'];
        push('吉', `${ln}${g}到${dir}，会宅盘${h}`, `${ln}${g}临宅盘${h}之宫（一四同宫，《玄空秘旨》「四一同宫，准发科名之显」），宜读书、考试、写作。`);
      }
    }
  }

  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level] || LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer]);
}
