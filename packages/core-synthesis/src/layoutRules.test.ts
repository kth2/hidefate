import { describe, expect, it } from 'vitest';
import {
  ROOM_CATEGORIES,
  ROOM_META,
  floorLevelsOf,
  requiresStoreys,
  roomKindsByCategory,
  roomNature,
  roomsOnFloor,
  type PropertyProfile,
  type RoomKind,
  type RoomPlacement,
} from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { predict } from './predict.js';
import { checkLayout, judgeRoomPlacement, layoutSummary } from './layoutRules.js';
import { SAMPLE_PROFILE, sampleInput } from './fixtures.js';

const room = (
  id: string,
  kind: RoomKind,
  primaryPalace: RoomPlacement['primaryPalace'],
  floorLevel?: number,
): RoomPlacement => ({ id, kind, primaryPalace, palaces: [primaryPalace], occupants: [], floorLevel });

function withRooms(rooms: RoomPlacement[], extra: Partial<PropertyProfile> = {}): PropertyProfile {
  return { ...SAMPLE_PROFILE, rooms, missingCorners: [], ...extra };
}

describe('房间种类与分类', () => {
  it('每种房间都有分类、权重与宜忌，且权重在 0–1', () => {
    for (const k of Object.keys(ROOM_META) as RoomKind[]) {
      const m = ROOM_META[k];
      expect(ROOM_CATEGORIES).toContain(m.category);
      expect(m.priority).toBeGreaterThan(0);
      expect(m.priority).toBeLessThanOrEqual(1);
      expect(['宜吉', '宜凶', '中性']).toContain(m.nature);
      expect(m.note.length).toBeGreaterThan(6);
    }
  });

  it('分类分组覆盖全部房间种类，无遗漏', () => {
    const grouped = ROOM_CATEGORIES.flatMap((c) => roomKindsByCategory(c));
    expect(new Set(grouped).size).toBe(Object.keys(ROOM_META).length);
  });

  it('补齐了传统风水必备但常被漏掉的空间', () => {
    for (const k of ['神位', '祖先牌位', '灶位', '后门', '楼梯', '电箱', '老人房', '天井'] as RoomKind[]) {
      expect(ROOM_META[k]).toBeDefined();
    }
  });

  it('污秽与储物类为「宜凶」，气口与卧房为「宜吉」', () => {
    for (const k of ['厕所', '卫浴', '储藏', '楼梯', '仓储区'] as RoomKind[]) {
      expect(roomNature(k), `${k} 应为宜凶`).toBe('宜凶');
    }
    for (const k of ['大门', '主卧', '神位', '收银台'] as RoomKind[]) {
      expect(roomNature(k), `${k} 应为宜吉`).toBe('宜吉');
    }
  });

  it('大门权重仍为最高', () => {
    const max = Math.max(...(Object.keys(ROOM_META) as RoomKind[]).map((k) => ROOM_META[k].priority));
    expect(ROOM_META['大门'].priority).toBe(max);
  });
});

describe('多层住宅', () => {
  it('有地住宅需填总层数，高层单位不需要', () => {
    expect(requiresStoreys('排屋')).toBe(true);
    expect(requiresStoreys('独立屋')).toBe(true);
    expect(requiresStoreys('公寓')).toBe(false);
    expect(requiresStoreys('高层单位')).toBe(false);
  });

  it('三层排屋列出三层，含地下室则多一层', () => {
    const p = withRooms([], { buildingType: '排屋', storeys: 3 });
    expect(floorLevelsOf(p).map((f) => f.level)).toEqual([1, 2, 3]);
    const withBase = { ...p, hasBasement: true };
    expect(floorLevelsOf(withBase).map((f) => f.level)).toEqual([-1, 1, 2, 3]);
    expect(floorLevelsOf(withBase)[0]!.label).toBe('地下室');
  });

  it('高层单位恒为单层', () => {
    const p = withRooms([], { buildingType: '公寓', floor: 12 });
    expect(floorLevelsOf(p)).toHaveLength(1);
  });

  it('房间可按层取用，未标层者视为地面层', () => {
    const p = withRooms(
      [room('a', '大门', 9), room('b', '主卧', 2, 2), room('c', '书房', 4, 3)],
      { buildingType: '排屋', storeys: 3 },
    );
    expect(roomsOnFloor(p, 1).map((r) => r.id)).toEqual(['a']);
    expect(roomsOnFloor(p, 2).map((r) => r.id)).toEqual(['b']);
    expect(roomsOnFloor(p, 3).map((r) => r.id)).toEqual(['c']);
  });
});

describe('压凶：厕所落凶方是正解，不该被判成高风险', () => {
  /** 找出一个综合分为负的宫位。 */
  function badPalace(profile: PropertyProfile) {
    const s = synthesise({ ...sampleInput(2026), profile });
    return ([1, 2, 3, 4, 6, 7, 8, 9] as const).reduce((a, b) =>
      s.palaces[b].score < s.palaces[a].score ? b : a,
    );
  }

  it('同一凶宫：放厕所的风险显著低于放主卧', () => {
    const base = withRooms([]);
    const p = badPalace(base);

    const withToilet = withRooms([room('t', '厕所', p)]);
    const withBedroom = withRooms([room('b', '主卧', p)]);

    const toiletPreds = predict({ ...sampleInput(2026), profile: withToilet }, synthesise({ ...sampleInput(2026), profile: withToilet }));
    const bedPreds = predict({ ...sampleInput(2026), profile: withBedroom }, synthesise({ ...sampleInput(2026), profile: withBedroom }));

    const maxAt = (preds: { palace: number; probability: number }[]) => {
      const here = preds.filter((x) => x.palace === p);
      return here.length ? Math.max(...here.map((x) => x.probability)) : 0;
    };

    expect(maxAt(bedPreds)).toBeGreaterThan(maxAt(toiletPreds));
  });

  it('加权明细里明确写出「凶方宜压」的理由', () => {
    const base = withRooms([]);
    const p = badPalace(base);
    const profile = withRooms([room('t', '储藏', p)]);
    const i = { ...sampleInput(2026), profile };
    const preds = predict(i, synthesise(i));
    const notes = preds.flatMap((x) => x.breakdown).map((b) => b.note).join('');
    if (preds.some((x) => x.palace === p)) {
      expect(notes).toContain('凶方宜压');
    }
  });
});

describe('房间落位判定：九宫详情与布局体检不得打架', () => {
  it('同一间房、同一宫，两处结论必然一致', () => {
    // 坐午（离宅）：正东为生气吉方，西南为六煞凶方
    for (const [palace, kind] of [[3, '厕所'], [2, '厕所'], [5, '楼梯'], [3, '主卧'], [2, '主卧']] as const) {
      const profile = withRooms([room('x', kind, palace)], { sitting: '午' });
      const s = synthesise({ ...sampleInput(2026), profile });
      const j = judgeRoomPlacement(s, palace, kind);
      const issues = checkLayout(s);
      const flaggedAsWaste = issues.some((i) => i.title.includes('吉方') && i.palaces.includes(palace));

      // 「浪费吉方」当且仅当布局体检报了压吉
      expect(flaggedAsWaste, `${kind}@${palace}：判定=${j.verdict}，体检报压吉=${flaggedAsWaste}`).toBe(
        j.verdict === '浪费吉方',
      );
    }
  });

  it('宜凶之房落凶方判「得当」，落吉方判「浪费吉方」', () => {
    const profile = withRooms([], { sitting: '午' });
    const s = synthesise({ ...sampleInput(2026), profile });
    expect(judgeRoomPlacement(s, 3, '厕所').verdict).toBe('浪费吉方'); // 正东＝生气
    expect(judgeRoomPlacement(s, 2, '厕所').verdict).toBe('得当'); // 西南＝六煞
  });

  it('宜吉之房落吉方判「得当」，落凶方判「不利」', () => {
    const profile = withRooms([], { sitting: '午' });
    const s = synthesise({ ...sampleInput(2026), profile });
    expect(judgeRoomPlacement(s, 3, '大门').verdict).toBe('得当');
    expect(judgeRoomPlacement(s, 2, '大门').verdict).toBe('不利');
  });

  it('中性之房不给吉凶结论', () => {
    const profile = withRooms([], { sitting: '午' });
    const s = synthesise({ ...sampleInput(2026), profile });
    const j = judgeRoomPlacement(s, 3, '阳台');
    expect(j.verdict).toBe('平常');
    expect(j.text).toBe('');
  });
});

describe('布局体检', () => {
  const mk = (rooms: RoomPlacement[], extra: Partial<PropertyProfile> = {}) => {
    const profile = withRooms(rooms, extra);
    return checkLayout(synthesise({ ...sampleInput(2026), profile }));
  };

  it('大门与后门一线对穿 → 穿堂煞', () => {
    const issues = mk([room('d', '大门', 9), room('b', '后门', 1)]);
    const hit = issues.find((i) => i.title.includes('穿堂煞'));
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe('严重');
    expect(hit!.cures[0]!.action).toContain('玄关');
    expect(hit!.finding.principle).toContain('穿心');
  });

  it('大门与后门不对宫则无穿堂煞', () => {
    const issues = mk([room('d', '大门', 9), room('b', '后门', 3)]);
    expect(issues.some((i) => i.title.includes('穿堂煞'))).toBe(false);
  });

  it('楼梯落中宫 → 穿心煞', () => {
    const issues = mk([room('s', '楼梯', 5)]);
    const hit = issues.find((i) => i.title.includes('楼梯'));
    expect(hit).toBeDefined();
    expect(hit!.finding.statement).toContain('穿心');
    expect(hit!.severity).toBe('严重');
  });

  it('厕所落中宫 → 污秽压心', () => {
    const issues = mk([room('t', '厕所', 5)]);
    expect(issues.some((i) => i.palaces.includes(5) && i.severity === '严重')).toBe(true);
  });

  it('厕所占八宅吉方 → 报「压吉」', () => {
    // 坐午（离宅）：正东为生气方
    const issues = mk([room('t', '厕所', 3)], { sitting: '午' });
    const hit = issues.find((i) => i.title.includes('吉方'));
    expect(hit).toBeDefined();
    expect(hit!.finding.principle).toContain('吉方宜开');
  });

  it('神位落凶方或对厕 → 报安神有碍', () => {
    const issues = mk([room('a', '神位', 2), room('t', '厕所', 2)], { sitting: '午' });
    const hit = issues.find((i) => i.title.includes('神位'));
    expect(hit).toBeDefined();
    expect(hit!.finding.principle).toContain('安神三忌');
  });

  it('灶位与五黄二黑同宫 → 火生土助凶', () => {
    const s = synthesise({ ...sampleInput(2026), profile: withRooms([]) });
    const target = ([1, 2, 3, 4, 6, 7, 8, 9] as const).find((p) =>
      [s.palaces[p].stars.shan, s.palaces[p].stars.xiang, s.palaces[p].stars.annual].some((x) => x === 5 || x === 2),
    );
    expect(target, '样例盘中应存在五黄或二黑之宫').toBeDefined();
    const issues = mk([room('k', '灶位', target!)]);
    const hit = issues.find((i) => i.title.includes('灶位'));
    expect(hit).toBeDefined();
    expect(hit!.finding.statement).toContain('火生土');
    expect(hit!.cures[0]!.action).toContain('灶口');
  });

  it('布局无硬伤时给出正面结论', () => {
    const issues = mk([room('d', '大门', 9), room('l', '客厅', 1)]);
    const chuantang = issues.filter((i) => i.title.includes('穿堂'));
    expect(chuantang).toHaveLength(0);
    expect(layoutSummary([])).toContain('未见明显硬伤');
  });

  it('每条问题都带门派、古法依据与可执行化解', () => {
    const issues = mk([
      room('d', '大门', 9), room('b', '后门', 1),
      room('s', '楼梯', 5), room('t', '厕所', 3),
    ], { sitting: '午' });
    expect(issues.length).toBeGreaterThan(2);
    for (const i of issues) {
      expect(i.finding.schools.length).toBeGreaterThan(0);
      expect(i.finding.principle.length).toBeGreaterThan(8);
      expect(i.cures.length).toBeGreaterThan(0);
      expect(i.cures[0]!.action.length).toBeGreaterThan(10);
      expect(i.palaces.length).toBeGreaterThan(0);
    }
  });

  it('严重问题排在前面', () => {
    const issues = mk([
      room('d', '大门', 9), room('b', '后门', 1), room('t', '厕所', 3),
    ], { sitting: '午' });
    const rank = { 严重: 0, 中等: 1, 轻微: 2 } as const;
    for (let i = 1; i < issues.length; i++) {
      expect(rank[issues[i]!.severity]).toBeGreaterThanOrEqual(rank[issues[i - 1]!.severity]);
    }
  });

  it('跨层的门不算穿堂（楼上阳台不与楼下大门对冲）', () => {
    const issues = mk(
      [room('d', '大门', 9, 1), room('b', '阳台', 1, 2)],
      { buildingType: '排屋', storeys: 2 },
    );
    expect(issues.some((i) => i.title.includes('穿堂煞'))).toBe(false);
  });
});
