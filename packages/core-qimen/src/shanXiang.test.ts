import { describe, expect, it } from 'vitest';
import { computeJu, computeShanXiang, outerAverageScore } from './shanXiang.js';
import { loadQiMenEngine } from './loader.js';
import { MOUNTAINS as FS_MOUNTAINS, PALACE_INDEXES, degreeToMountain } from '@hidefate/core-fengshui';

describe('上游引擎载入', () => {
  it('可在 Node 环境载入并暴露完整面', async () => {
    const { engine, shanXiang } = await loadQiMenEngine();
    expect(typeof engine.qimen.calculate).toBe('function');
    expect(typeof engine.qimen.calculateJuShu).toBe('function');
    expect(typeof shanXiang.generateShanXiangChart).toBe('function');
    expect(Object.keys(engine.JIU_GONG)).toHaveLength(9);
  });

  it('重复载入返回同一实例（幂等）', async () => {
    const a = await loadQiMenEngine();
    const b = await loadQiMenEngine();
    expect(a.engine).toBe(b.engine);
  });
});

describe('罗盘环与飞星核心一致（跨包关键不变量）', () => {
  it('二十四山名与度数逐山对齐', async () => {
    const { shanXiang } = await loadQiMenEngine();
    expect(shanXiang.MOUNTAINS).toHaveLength(24);
    for (const qm of shanXiang.MOUNTAINS) {
      const fs = FS_MOUNTAINS.find((m) => m.name === qm.name);
      expect(fs, `飞星核心缺少山：${qm.name}`).toBeDefined();
      expect(fs!.center, `「${qm.name}」山中心度数两核心不一致`).toBe(qm.center);
    }
  });

  it('度数归山结果两核心完全一致（逐度扫描）', async () => {
    const { shanXiang } = await loadQiMenEngine();
    for (let d = 0; d < 360; d += 1) {
      expect(shanXiang.degreeToMountain(d).name).toBe(degreeToMountain(d).name);
    }
  });
});

describe('坐山三元定局', () => {
  it('坐子山（默认中元）= 冬至中元 = 阳遁 7 局', async () => {
    const ju = await computeJu('子');
    expect(ju.jieqi).toBe('冬至');
    expect(ju.type).toBe('yang');
    expect(ju.number).toBe('7');
    expect(ju.yuan).toBe('中元');
  });

  it('坐午山 = 夏至中元 = 阴遁 3 局', async () => {
    const ju = await computeJu('午');
    expect(ju.jieqi).toBe('夏至');
    expect(ju.type).toBe('yin');
    expect(ju.number).toBe('3');
  });

  it('度数决定三元：子山偏前为上元、偏后为下元', async () => {
    expect((await computeJu(354)).yuan).toBe('上元');
    expect((await computeJu(0)).yuan).toBe('中元');
    expect((await computeJu(6)).yuan).toBe('下元');
  });

  it('二十四山定局与引擎三元定局全量对拍一致', async () => {
    const { engine, shanXiang } = await loadQiMenEngine();
    // 采集引擎「节气 + 元 → 局」
    const table: Record<string, string> = {};
    const start = Date.parse('2025-12-20T12:00:00');
    for (let i = 0; i < 380; i++) {
      const d = new Date(start + i * 86_400_000);
      const j = engine.qimen.calculateJuShu(d, '时家');
      const key = `${j.jieQiName}|${j.yuan}`;
      if (!table[key]) table[key] = j.type + j.number;
    }
    for (const m of shanXiang.MOUNTAINS) {
      const ju = shanXiang.sittingToJu(m.name); // 默认中元
      expect(ju.type + ju.number, `坐${m.name}山定局与引擎不一致`).toBe(table[`${m.jieqi}|中元`]);
    }
  });
});

describe('山向奇门九宫叠加', () => {
  it('坐子向午：九宫齐备，键与洛书数一致', async () => {
    const r = await computeShanXiang({ sitting: '子', date: new Date('2026-07-14T15:30:00') });
    expect(Object.keys(r.palaces).map(Number).sort((a, b) => a - b)).toEqual([...PALACE_INDEXES]);
    expect(r.ju.sitting).toBe('子');
    expect(r.ju.facing).toBe('午');
    expect(r.ju.number).toBe('7');
    for (const p of PALACE_INDEXES) {
      const o = r.palaces[p];
      expect(o.score).toBeGreaterThanOrEqual(-1);
      expect(o.score).toBeLessThanOrEqual(1);
      expect(o.direction).toBeTruthy();
      // 中宫寄出，星门神俱空 —— 这是引擎的正确古法行为，不是缺数据。
      if (p !== 5) {
        expect(o.xing, `${p} 宫应有九星`).toBeTruthy();
        expect(o.men, `${p} 宫应有八门`).toBeTruthy();
        expect(o.shen, `${p} 宫应有八神`).toBeTruthy();
      }
    }
  });

  it('中宫寄出：星门神俱空，天禽寄于他宫', async () => {
    const r = await computeShanXiang({ sitting: '子', date: new Date('2026-07-14T15:30:00') });
    expect(r.palaces[5].men).toBe('');
    expect(r.palaces[5].shen).toBe('');
    expect(r.palaces[5].xing).toBe('');
    // 天禽不落中宫，必寄于某一外宫（与天芮同宫显示为「禽芮」）
    const outer = [1, 2, 3, 4, 6, 7, 8, 9] as const;
    expect(outer.some((p) => r.palaces[p].xing.includes('禽'))).toBe(true);
  });

  it('八方九星互异（中宫除外）', async () => {
    const r = await computeShanXiang({ sitting: '子', date: new Date('2026-07-14T15:30:00') });
    const xings = [1, 2, 3, 4, 6, 7, 8, 9].map((p) => r.palaces[p as 1].xing);
    expect(new Set(xings).size).toBe(8);
  });

  it('八门齐布于八方（中宫无门）', async () => {
    const r = await computeShanXiang({ sitting: '乾', date: new Date('2026-03-01T09:00:00') });
    const outerMen = [1, 2, 3, 4, 6, 7, 8, 9].map((p) => r.palaces[p as 1].men);
    expect(new Set(outerMen).size).toBe(8);
    expect(r.palaces[5].men).toBe('');
  });

  it('入住年可作时间激活层', async () => {
    const r = await computeShanXiang({ sitting: '午', year: 2020 });
    expect(r.ju.activationSource).toContain('立春');
    expect(r.raw.shanXiang!.activation.date.getFullYear()).toBe(2020);
  });

  it('定局推导链完整，可供「传承与依据」展示', async () => {
    const r = await computeShanXiang({ sitting: '艮', year: 2024 });
    expect(r.ju.derivation.length).toBeGreaterThanOrEqual(5);
    expect(r.ju.derivation.join('')).toContain('坐山三元');
    expect(r.ju.method).toContain('坐山三元');
  });

  it('缺坐山报错，未知流派报错（不静默出错盘）', async () => {
    await expect(computeShanXiang({ sitting: '' })).rejects.toThrow();
    await expect(computeShanXiang({ sitting: '子', method: 'liujia' })).rejects.toThrow(/坐山三元|method/);
  });

  it('全部 24 山均可出盘', async () => {
    const { shanXiang } = await loadQiMenEngine();
    for (const m of shanXiang.MOUNTAINS) {
      const r = await computeShanXiang({ sitting: m.name, year: 2026 });
      expect(Object.keys(r.palaces)).toHaveLength(9);
      expect(Math.abs(outerAverageScore(r))).toBeLessThanOrEqual(1);
    }
  });

  it('相同输入得相同盘（确定性）', async () => {
    const a = await computeShanXiang({ sitting: '巽', date: new Date('2026-05-05T08:00:00') });
    const b = await computeShanXiang({ sitting: '巽', date: new Date('2026-05-05T08:00:00') });
    expect(JSON.stringify(a.palaces)).toBe(JSON.stringify(b.palaces));
  });
});
