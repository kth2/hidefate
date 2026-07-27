/** 测试与示例共用的样板数据。 */

import { computeBaziChart } from '@hidefate/core-bazi';
import type { PropertyProfile } from '@hidefate/core-fengshui';
import type { AnalysisInput, Member } from './types.js';

export function makeMember(
  id: string,
  name: string,
  gender: '男' | '女',
  year: number,
  opts: { month?: number; day?: number; hour?: number; relation?: string; rooms?: string[] } = {},
): Member {
  const chart = computeBaziChart({
    id, name, gender, year,
    month: opts.month, day: opts.day, hour: opts.hour,
  });
  return {
    id,
    name,
    relation: opts.relation,
    chart,
    mingGua: chart.mingGua,
    primaryRoomIds: opts.rooms,
  };
}

/** 一间九运坐子向午的三房公寓，含缺角与完整房间标注。 */
export const SAMPLE_PROFILE: PropertyProfile = {
  id: 'demo-1',
  name: '示范单位·晴湾苑 12 楼',
  buildingType: '公寓',
  floor: 12,
  sitting: 2, // 子山，偏 2°（未过 3°，属下卦正向）
  moveInYear: 2025,
  entryMode: '九宫格',
  enableQiMen: false,
  missingCorners: [{ palace: 6, severity: 0.45, note: '西北角为公共电梯井所占' }],
  rooms: [
    { id: 'r-door', kind: '大门', primaryPalace: 9, palaces: [9], occupants: [] },
    { id: 'r-master', kind: '主卧', label: '主卧', primaryPalace: 2, palaces: [2], occupants: ['m-dad', 'm-mom'] },
    { id: 'r-kitchen', kind: '厨房', primaryPalace: 3, palaces: [3], occupants: [] },
    { id: 'r-kid', kind: '儿童房', label: '小明房', primaryPalace: 7, palaces: [7], occupants: ['m-son'] },
    { id: 'r-living', kind: '客厅', primaryPalace: 1, palaces: [1], occupants: [] },
    { id: 'r-study', kind: '书房', primaryPalace: 4, palaces: [4], occupants: ['m-dad'] },
    { id: 'r-bath', kind: '卫浴', primaryPalace: 8, palaces: [8], occupants: [] },
    { id: 'r-balcony', kind: '阳台', primaryPalace: 6, palaces: [6], occupants: [] },
  ],
};

export const SAMPLE_MEMBERS: Member[] = [
  makeMember('m-dad', '陈先生', '男', 1982, { month: 7, day: 12, hour: 9, relation: '男主人' }),
  makeMember('m-mom', '陈太太', '女', 1985, { month: 3, day: 8, relation: '女主人' }), // 缺时柱
  makeMember('m-son', '小明', '男', 2014, { month: 11, relation: '长子' }),           // 仅年月
];

export function sampleInput(year = 2026): AnalysisInput {
  return {
    profile: SAMPLE_PROFILE,
    members: SAMPLE_MEMBERS,
    year,
    appliedCures: [],
    qiMen: null,
  };
}
