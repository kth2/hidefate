/**
 * 相对说法：比「平常」高还是低。
 *
 * 「小明今年健康 87%」这句话很容易被误读 —— 孩子一年里本来就常看病，
 * 87% 究竟是这间房子的问题，还是谁都差不多？绝对百分比回答不了。
 *
 * 我们没有可靠的人群基准率（README 硬规则：引擎不发明数字），所以「平常」取的是
 * **同一个人，住在吉凶平和的位置**时模型给出的水平：宫位不吉不凶、此方于其命不吉不凶，
 * 只保留与房子无关的部分（建筑类别、人生阶段的易感度）。
 * 两者之差，正好就是「这间房子对这个人的影响」—— 也就是使用者真正想知道的东西。
 *
 * 分档按 logit 差，而不是百分点差：概率贴近上下限时，百分点会被压扁，logit 不会。
 */

export type RelativeLevel = '明显偏高' | '偏高' | '与平常相当' | '偏低' | '明显偏低';

/** logit 差的分档门槛。 */
export const RELATIVE_STEP = 0.6;
export const RELATIVE_STRONG = 1.5;

const logit = (p: number) => Math.log(p / (1 - p));

export function relativeDelta(probability: number, neutral: number): number {
  return logit(probability) - logit(neutral);
}

export function relativeLevel(probability: number, neutral: number): RelativeLevel {
  const d = relativeDelta(probability, neutral);
  if (d >= RELATIVE_STRONG) return '明显偏高';
  if (d >= RELATIVE_STEP) return '偏高';
  if (d <= -RELATIVE_STRONG) return '明显偏低';
  if (d <= -RELATIVE_STEP) return '偏低';
  return '与平常相当';
}

/** 值得留意：比平常偏高以上。 */
export function isElevated(level: RelativeLevel | null | undefined): boolean {
  return level === '偏高' || level === '明显偏高';
}

/** 短写，给窄格子用。 */
export const RELATIVE_SHORT: Readonly<Record<RelativeLevel, string>> = {
  明显偏高: '↑↑',
  偏高: '↑',
  与平常相当: '—',
  偏低: '↓',
  明显偏低: '↓↓',
};

/** 界面上解释「平常」是什么的一句话 —— 各处共用，免得说法走样。 */
export const RELATIVE_NOTE =
  '「平常」指同一个人住在吉凶平和的位置时的水平，不是人口统计；高出的部分，就是这间房子带来的影响。';
