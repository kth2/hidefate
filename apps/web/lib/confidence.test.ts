import { describe, expect, it } from 'vitest';
import type { PropertyProfile, RoomPlacement } from '@hidefate/core-fengshui';
import { analyse, synthesise, type AnalysisInput, type Member } from '@hidefate/core-synthesis';
import { SAMPLE_PROFILE, makeMember } from '../../../packages/core-synthesis/src/fixtures';
import {
  CONFIDENCE_MAX,
  LADDER_THRESHOLD,
  assessConfidence,
  confidenceLadder,
  levelOfScore,
} from './confidence';

function run(profile: PropertyProfile, members: Member[]) {
  const input: AnalysisInput = { profile, members, year: 2026, appliedCures: [], qiMen: null };
  return analyse(input, synthesise(input));
}

const FULL_ROOMS: RoomPlacement[] = [
  { id: 'r1', kind: '大门', primaryPalace: 9, palaces: [9], occupants: [] },
  { id: 'r2', kind: '主卧', primaryPalace: 2, palaces: [2], occupants: [] },
  { id: 'r3', kind: '厨房', primaryPalace: 3, palaces: [3], occupants: [] },
  { id: 'r4', kind: '客厅', primaryPalace: 1, palaces: [1], occupants: [] },
  { id: 'r5', kind: '卫浴', primaryPalace: 8, palaces: [8], occupants: [] },
];

/**
 * 这一组是本文件存在的理由。
 *
 * lib/confidence.ts 是 assess.ts 那段记分逻辑的**镜像**，用来把总分拆成
 * 可执行的阶梯。镜像与本体一旦漂移，阶梯上的「+17%」就成了骗人的数字。
 * 所以这里拿一批真实档案跑核心的 analyse()，逐个断言两边给出同一个等级。
 */
describe('置信度拆解与核心 assess() 保持一致', () => {
  const variants: { name: string; profile: PropertyProfile; members: Member[] }[] = [
    {
      name: '九宫格 · 无成员 · 无奇门 · 房间不全',
      profile: { ...SAMPLE_PROFILE, entryMode: '九宫格', enableQiMen: false, rooms: [] },
      members: [],
    },
    {
      name: '罗盘实测 · 房间齐 · 四柱全成员 · 开奇门',
      profile: { ...SAMPLE_PROFILE, entryMode: '罗盘实测', enableQiMen: true, rooms: FULL_ROOMS },
      members: [makeMember('m1', '甲', '男', 1982, { month: 7, day: 12, hour: 9 })],
    },
    {
      name: '户型图 · 房间齐 · 仅年成员',
      profile: { ...SAMPLE_PROFILE, entryMode: '户型图', enableQiMen: false, rooms: FULL_ROOMS },
      members: [makeMember('m2', '乙', '女', 1985)],
    },
    {
      name: '罗盘实测 · 房间不全 · 无成员 · 无奇门',
      profile: { ...SAMPLE_PROFILE, entryMode: '罗盘实测', enableQiMen: false, rooms: [] },
      members: [],
    },
    {
      name: '示范档案原样',
      profile: SAMPLE_PROFILE,
      members: [makeMember('m3', '丙', '男', 1990, { month: 2, day: 3 })],
    },
  ];

  for (const v of variants) {
    it(`等级一致：${v.name}`, () => {
      const core = run(v.profile, v.members);
      const mirror = assessConfidence(v.profile, v.members);
      expect(mirror.level).toBe(core.confidence.level);
    });
  }

  it('分数不超过上限，百分比落在 0–1', () => {
    for (const v of variants) {
      const s = assessConfidence(v.profile, v.members);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(CONFIDENCE_MAX);
      expect(s.percent).toBeCloseTo(s.score / CONFIDENCE_MAX);
    }
  });

  it('等级阈值抄自 assess.ts（>=4 高、>=2 中、否则低）', () => {
    expect(levelOfScore(6)).toBe('高');
    expect(levelOfScore(4)).toBe('高');
    expect(levelOfScore(3)).toBe('中');
    expect(levelOfScore(2)).toBe('中');
    expect(levelOfScore(1)).toBe('低');
    expect(levelOfScore(0)).toBe('低');
  });

  it('每一项的说明文字与核心给出的理由同源', () => {
    const profile = { ...SAMPLE_PROFILE, entryMode: '九宫格' as const, enableQiMen: false };
    const core = run(profile, []);
    const mirror = assessConfidence(profile, []);
    const joined = core.confidence.reasons.join('｜');
    for (const c of mirror.contributors) {
      if (c.id === 'members') continue; // 无成员时核心不输出这一条
      expect(joined).toContain(c.note);
    }
  });
});

describe('阶梯：只要还有可选输入没补就非空', () => {
  const bare: PropertyProfile = {
    ...SAMPLE_PROFILE,
    entryMode: '九宫格',
    enableQiMen: false,
    rooms: [],
    xingShi: [],
  };

  it('什么都没补时四项全在', () => {
    const rows = confidenceLadder(bare, []);
    expect(rows.map((r) => r.id).sort()).toEqual(['direction', 'members', 'rooms', 'schools']);
  });

  it('缺任意一项就非空 —— 逐项单独验证', () => {
    const full: PropertyProfile = {
      ...SAMPLE_PROFILE,
      entryMode: '罗盘实测',
      enableQiMen: true,
      rooms: FULL_ROOMS,
    };
    const fullMembers = [makeMember('m', '甲', '男', 1982, { month: 7, day: 12, hour: 9 })];

    // 基准：全补齐 → 阶梯为空
    expect(confidenceLadder(full, fullMembers)).toEqual([]);

    // 逐项抽掉一项，阶梯都应恰好冒出对应那一行
    expect(confidenceLadder({ ...full, enableQiMen: false }, fullMembers).map((r) => r.id)).toEqual(['schools']);
    expect(confidenceLadder({ ...full, entryMode: '九宫格' }, fullMembers).map((r) => r.id)).toEqual(['direction']);
    expect(confidenceLadder({ ...full, rooms: [] }, fullMembers).map((r) => r.id)).toEqual(['rooms']);
    expect(confidenceLadder(full, []).map((r) => r.id)).toEqual(['members']);
    expect(confidenceLadder(full, [makeMember('m', '甲', '男', 1982)]).map((r) => r.id)).toEqual(['members']);
  });

  it('还没建房时也给得出阶梯（此时坐向与房间都还没着落）', () => {
    const rows = confidenceLadder(null, []);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.id === 'direction')).toBe(true);
  });

  it('每一行都有增量、功夫估计与去处，且增量为正', () => {
    for (const r of confidenceLadder(bare, [])) {
      expect(r.gain).toBeGreaterThan(0);
      expect(r.gainPercent).toBeCloseTo(r.gain / CONFIDENCE_MAX);
      expect(r.effort.length).toBeGreaterThan(3);
      expect(r.why.length).toBeGreaterThan(8);
      expect(r.href.startsWith('/')).toBe(true);
    }
  });

  it('能让等级跳一级的排在最前 —— 那是最值得先做的一条', () => {
    const rows = confidenceLadder(bare, []);
    const firstNonLevelling = rows.findIndex((r) => !r.levelsUp);
    if (firstNonLevelling >= 0) {
      expect(rows.slice(firstNonLevelling).every((r) => !r.levelsUp)).toBe(true);
    }
  });

  it('阶梯为空时置信度必然已过提示阈值', () => {
    const full: PropertyProfile = {
      ...SAMPLE_PROFILE,
      entryMode: '罗盘实测',
      enableQiMen: true,
      rooms: FULL_ROOMS,
    };
    const s = assessConfidence(full, [makeMember('m', '甲', '男', 1982, { month: 7, day: 12, hour: 9 })]);
    expect(confidenceLadder(full, [makeMember('m', '甲', '男', 1982, { month: 7, day: 12, hour: 9 })])).toEqual([]);
    expect(s.percent).toBeGreaterThanOrEqual(LADDER_THRESHOLD);
  });
});
