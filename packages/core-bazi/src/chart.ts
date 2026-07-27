/**
 * 八字排盘主入口。
 *
 * 以 lunar-typescript（寿星万年历同源算法）作节气与干支的天文底座，
 * 上层按「已知到哪一柱」裁剪结论，绝不用假设值冒充真实数据。
 */

import { Lunar, Solar } from 'lunar-typescript';
import { computeElementStrength, type ScoringPillar } from './elementStrength.js';
import { computeMingGua } from './mingGua.js';
import {
  CANG_GAN,
  GAN_WUXING,
  ZHI_WUXING,
  ZHI_ZODIAC,
  shiShen,
} from './tables.js';
import {
  CONFIDENCE_BY_PRECISION,
  type BaziChartResult,
  type BaziPrecision,
  type BirthInput,
  type CangGanInfo,
  type DecadeData,
  type PillarData,
  type WuXing,
} from './types.js';

/** 默认时区（东八区）—— 中港台星马通用。 */
const DEFAULT_TIMEZONE = 8;

/** 判定输入精度。 */
export function precisionOf(input: BirthInput): BaziPrecision {
  if (input.month == null) return '仅年';
  if (input.day == null) return '年月';
  if (input.hour == null) return '年月日';
  return '四柱全';
}

/**
 * 真太阳时校正。
 *
 * 校正量 = 经度时差 + 均时差（EoT）。
 *   经度时差 = (出生地经度 − 时区中央经线) × 4 分钟
 *   均时差   = 采用标准近似式，全年误差 < 20 秒
 *
 * 若换算后跨越了时辰边界（每 2 小时一换），会在 unavailable 中提示复核。
 */
export function trueSolarAdjust(
  date: Date,
  longitude: number,
  timezone: number = DEFAULT_TIMEZONE,
): { adjusted: Date; deltaMinutes: number } {
  const meridian = timezone * 15;
  const lonDelta = (longitude - meridian) * 4; // 分钟

  // 均时差（分钟），Spencer / NOAA 近似式
  const start = new Date(date.getFullYear(), 0, 1).getTime();
  const dayOfYear = Math.floor((date.getTime() - start) / 86_400_000) + 1;
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);

  const deltaMinutes = lonDelta + eot;
  return { adjusted: new Date(date.getTime() + deltaMinutes * 60_000), deltaMinutes };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 排八字。 */
export function computeBaziChart(input: BirthInput): BaziChartResult {
  const precision = precisionOf(input);
  const confidence = CONFIDENCE_BY_PRECISION[precision];
  const unavailable: string[] = [];

  // ---- 1. 构造用于天文推算的时刻（缺失部分以安全缺省填充，但绝不参与结论）----
  const month = input.month ?? 6;   // 6 月远离立春，避免误跨年界
  const day = input.day ?? 15;
  const hour = input.hour ?? 12;    // 正午，午时正中，即便被误用也最稳定
  const minute = input.minute ?? 0;

  let solar: Solar;
  if (input.calendar === '农历') {
    const lunarObj = Lunar.fromYmdHms(
      input.year,
      (input.isLeapMonth ? -1 : 1) * month,
      day,
      hour,
      minute,
      0,
    );
    solar = lunarObj.getSolar();
  } else {
    solar = Solar.fromYmdHms(input.year, month, day, hour, minute, 0);
  }

  // ---- 2. 真太阳时 ----
  let trueSolarTime: string | null = null;
  let effectiveSolar = solar;
  if (input.useTrueSolarTime && input.longitude != null && input.hour != null) {
    const clock = new Date(
      solar.getYear(), solar.getMonth() - 1, solar.getDay(),
      solar.getHour(), solar.getMinute(), 0,
    );
    const { adjusted, deltaMinutes } = trueSolarAdjust(clock, input.longitude);
    effectiveSolar = Solar.fromYmdHms(
      adjusted.getFullYear(), adjusted.getMonth() + 1, adjusted.getDate(),
      adjusted.getHours(), adjusted.getMinutes(), 0,
    );
    trueSolarTime = `${fmt(adjusted)}（校正 ${deltaMinutes >= 0 ? '+' : ''}${deltaMinutes.toFixed(1)} 分钟）`;
    // 时辰边界复核：校正前后落入不同时辰则提示
    const beforeZhi = Math.floor(((clock.getHours() + 1) % 24) / 2);
    const afterZhi = Math.floor(((adjusted.getHours() + 1) % 24) / 2);
    if (beforeZhi !== afterZhi) {
      unavailable.push('真太阳时校正后跨越了时辰边界，时柱存在两解，建议以出生地实际经度复核。');
    }
  }

  const lunar = effectiveSolar.getLunar();
  const ec = lunar.getEightChar();
  // sect 2：晚子时（23:00 后）日柱进为次日，为当代主流用法。
  ec.setSect(2);

  // ---- 3. 组装可用的柱 ----
  const dayGan = precision === '年月日' || precision === '四柱全' ? ec.getDayGan() : null;

  const build = (
    position: PillarData['position'],
    gan: string,
    zhi: string,
    naYin: string,
    diShi: string | null,
    kongWang: readonly string[],
  ): PillarData => {
    const hidden = CANG_GAN[zhi] ?? [];
    const cangGan: CangGanInfo[] = hidden.map((g) => ({
      gan: g,
      wuXing: GAN_WUXING[g]!,
      shiShen: dayGan ? shiShen(dayGan, g) : null,
    }));
    return {
      position,
      gan,
      zhi,
      ganWuXing: GAN_WUXING[gan]!,
      zhiWuXing: ZHI_WUXING[zhi]!,
      ganShiShen: position === '日柱' ? '日主' : dayGan ? shiShen(dayGan, gan) : null,
      cangGan,
      naYin,
      diShi,
      isKongWang: kongWang.includes(zhi),
    };
  };

  const kongWang = dayGan ? ec.getDayXunKong().split('') : [];

  const pillars: PillarData[] = [];
  pillars.push(build('年柱', ec.getYearGan(), ec.getYearZhi(), ec.getYearNaYin(), dayGan ? ec.getYearDiShi() : null, kongWang));
  if (precision !== '仅年') {
    pillars.push(build('月柱', ec.getMonthGan(), ec.getMonthZhi(), ec.getMonthNaYin(), dayGan ? ec.getMonthDiShi() : null, kongWang));
  }
  if (precision === '年月日' || precision === '四柱全') {
    pillars.push(build('日柱', ec.getDayGan(), ec.getDayZhi(), ec.getDayNaYin(), ec.getDayDiShi(), kongWang));
  }
  if (precision === '四柱全') {
    pillars.push(build('时柱', ec.getTimeGan(), ec.getTimeZhi(), ec.getTimeNaYin(), ec.getTimeDiShi(), kongWang));
  }

  // ---- 4. 未能推算的项目（明示，不静默省略）----
  if (precision === '仅年') {
    unavailable.push('月柱、日柱、时柱：缺出生月日时。');
    unavailable.push('日主、十神、身强弱、大运：均需日柱，无法推算。');
    if (input.month == null) unavailable.push('若出生于 1–2 月，年柱与命卦须按立春复核，请补填出生月日。');
  } else if (precision === '年月') {
    unavailable.push('日柱、时柱：缺出生日与时辰。');
    unavailable.push('日主、十神、身强弱、大运：均需日柱，无法推算。');
  } else if (precision === '年月日') {
    unavailable.push('时柱：缺出生时辰。子女宫、晚年运、时柱神煞不作结论；采用三柱分析。');
  }

  // ---- 5. 五行力量 ----
  const scoringPillars: ScoringPillar[] = pillars.map((p) => ({
    position: p.position,
    gan: p.gan,
    zhi: p.zhi,
  }));
  const elementStrength = computeElementStrength(scoringPillars);

  // ---- 6. 大运（需日柱；缺时柱时起运时刻有偏差，明确降级）----
  const decades: DecadeData[] = [];
  let qiYunNote: string | null = null;
  if (precision === '四柱全' || precision === '年月日') {
    try {
      const yun = ec.getYun(input.gender === '男' ? 1 : 0, 2);
      const list = yun.getDaYun(9);
      for (const d of list) {
        if (d.getIndex() === 0) continue; // 0 为起运前的小运段
        const gz = d.getGanZhi();
        decades.push({
          index: d.getIndex(),
          ganZhi: gz,
          startAge: d.getStartAge(),
          endAge: d.getEndAge(),
          startYear: d.getStartYear(),
          endYear: d.getEndYear(),
          ganShiShen: dayGan && gz.length >= 1 ? shiShen(dayGan, gz.charAt(0)) : null,
        });
      }
      qiYunNote =
        `${yun.isForward() ? '顺行' : '逆行'}，${yun.getStartYear()} 年 ${yun.getStartMonth()} 月 ${yun.getStartDay()} 日起运。` +
        (precision === '年月日' ? '（缺时柱，起运时刻按正午估算，年份可信、月日误差可达数月。）' : '');
    } catch {
      unavailable.push('大运推算失败，请复核出生日期。');
    }
  }

  // ---- 7. 命卦（只需年 + 性别，任何精度下都成立）----
  const mingGua = computeMingGua(input.year, input.gender, {
    month: input.month,
    day: input.day,
    hour: input.hour,
    minute: input.minute,
  });

  const yearZhi = ec.getYearZhi();

  return {
    input,
    precision,
    confidence,
    pillars,
    dayMaster: dayGan,
    dayMasterWuXing: dayGan ? (GAN_WUXING[dayGan] as WuXing) : null,
    zodiac: ZHI_ZODIAC[yearZhi] ?? '',
    solarDate: precision === '仅年'
      ? `${input.year} 年（月日未知）`
      : precision === '年月'
        ? `${effectiveSolar.getYear()} 年 ${effectiveSolar.getMonth()} 月（日未知）`
        : `${effectiveSolar.getYear()}-${pad(effectiveSolar.getMonth())}-${pad(effectiveSolar.getDay())}` +
          (precision === '四柱全' ? ` ${pad(effectiveSolar.getHour())}:${pad(effectiveSolar.getMinute())}` : '（时辰未知）'),
    lunarDate: precision === '仅年' ? '（需月日方可换算农历）' : lunar.toString(),
    trueSolarTime,
    kongWang,
    elementStrength,
    mingGua,
    decades,
    qiYunNote,
    unavailable,
  };
}

/** 流年干支（立春年界）。 */
export function liuNianGanZhi(year: number): string {
  return Solar.fromYmdHms(year, 6, 15, 12, 0, 0).getLunar().getYearInGanZhiExact();
}

/**
 * 流年对某人的十神。用于「今年对这个人是什么性质的一年」。
 * 无日主时返回 null。
 */
export function liuNianShiShen(chart: BaziChartResult, year: number): string | null {
  if (!chart.dayMaster) return null;
  return shiShen(chart.dayMaster, liuNianGanZhi(year).charAt(0));
}
