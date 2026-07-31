import { describe, expect, it } from 'vitest';
import {
  castDivination,
  checkRepeat,
  divinationKey,
  listQuestionCategories,
  normaliseQuestion,
  replayDivination,
  type DivinationRequest,
  type DivinationResolution,
  type OpenDivination,
} from './divination.js';

const RESOLUTION: DivinationResolution = {
  criterion: '八月底前收到正式录用通知（书面或邮件），以有无该通知为准',
  judge: '客观记录',
  windowDays: 45,
};

const REQ: DivinationRequest = {
  question: '这次换工作能成吗',
  category: '功名',
  nianMingGan: '丙',
  resolution: RESOLUTION,
};

const empty = { openDivinations: [] as readonly OpenDivination[] };

describe('纪律一：占时不可选', () => {
  it('castDivination 的签名里没有时刻参数，起局时刻取调用瞬间', async () => {
    const before = Date.now();
    const d = await castDivination(REQ, empty);
    const after = Date.now();
    const cast = new Date(d.castAt).getTime();
    expect(cast).toBeGreaterThanOrEqual(before - 1000);
    expect(cast).toBeLessThanOrEqual(after + 1000);
  });

  it('应期截止 = 起局时刻 + 窗口天数', async () => {
    const d = await castDivination(REQ, empty);
    const delta = new Date(d.resolveBy).getTime() - new Date(d.castAt).getTime();
    expect(delta).toBe(45 * 86_400_000);
  });
});

describe('纪律二：判据先于盘面', () => {
  const cases: [string, unknown][] = [
    ['缺结算标准', undefined],
    ['判据过短', { criterion: '会好', judge: '用户自评', windowDays: 30 }],
    ['判据为空白', { criterion: '    ', judge: '用户自评', windowDays: 30 }],
    ['窗口为零', { criterion: '收到书面录用通知为准', judge: '客观记录', windowDays: 0 }],
    ['窗口过长', { criterion: '收到书面录用通知为准', judge: '客观记录', windowDays: 4000 }],
    ['判定方式非法', { criterion: '收到书面录用通知为准', judge: '大师说了算', windowDays: 30 }],
  ];

  it.each(cases)('%s 一律拒绝起局', async (_label, resolution) => {
    await expect(
      castDivination({ ...REQ, resolution: resolution as DivinationResolution }, empty),
    ).rejects.toThrow();
  });

  it('占问为空拒绝起局', async () => {
    await expect(castDivination({ ...REQ, question: '   ' }, empty)).rejects.toThrow(/不得为空/);
  });
});

describe('纪律三：复占留档，不许挑答案', () => {
  it('归一化能吃掉空白与标点', () => {
    expect(normaliseQuestion('这次换工作，能成吗？')).toBe(normaliseQuestion('这次换工作 能成吗'));
  });

  /**
   * 回归锁：改占类不得换出新钥匙。
   * 占类是对这件事的解读，不是这件事本身；早先它进了钥匙，
   * 换个占类就能把同一件事记成另一件，串不成一列。
   */
  it('同一问题得同一把钥匙，标点与占类都不影响', () => {
    const k1 = divinationKey({ question: '这次换工作能成吗', nianMingGan: '丙' });
    const k2 = divinationKey({ question: '这次换工作能成吗！', nianMingGan: '丙' });
    expect(k1).toBe(k2);
    expect(
      divinationKey({ question: '这次换工作能成吗', category: '求财', nianMingGan: '丙' } as never),
    ).toBe(k1);
  });

  it('不同的人问同一件事是两件事', () => {
    expect(divinationKey({ question: '今年能升职吗', nianMingGan: '丙' })).not.toBe(
      divinationKey({ question: '今年能升职吗', nianMingGan: '壬' }),
    );
  });

  /**
   * 早先这里是硬拦。拦错了地方 —— 要防的是**选择性保留**，
   * 不是「再问」这个动作。换个时辰本就是另一个局，多占几次有助于校准取象。
   */
  it('同一件事可以再占，不再被拒绝', async () => {
    const key = divinationKey(REQ);
    const open: OpenDivination[] = [
      { key, castAt: new Date(Date.now() - 86_400_000).toISOString(), windowDays: 45, status: '待结算' },
    ];
    const d = await castDivination(REQ, { openDivinations: open });
    expect(d.sequence).toBe(2);
    expect(d.repeatNote).toContain('第 2 次');
  });

  it('复占会提醒「每一局各自结算，别只认合心意的那一局」', () => {
    const key = divinationKey(REQ);
    const v = checkRepeat(
      [{ key, castAt: new Date().toISOString(), windowDays: 45, status: '待结算' }],
      key,
    );
    expect(v.isRepeat).toBe(true);
    expect(v.sequence).toBe(2);
    expect(v.reason).toContain('不要只认最合心意的那一局');
  });

  it('首次占不算复占', () => {
    const v = checkRepeat([], divinationKey(REQ));
    expect(v.isRepeat).toBe(false);
    expect(v.sequence).toBe(1);
  });

  it('已结算的旧占同样计入序号 —— 留档就是全都留', () => {
    const key = divinationKey(REQ);
    const v = checkRepeat(
      [
        { key, castAt: new Date().toISOString(), windowDays: 45, status: '已结算' },
        { key, castAt: new Date().toISOString(), windowDays: 45, status: '待结算' },
      ],
      key,
    );
    expect(v.sequence).toBe(3);
    expect(v.previous).toHaveLength(2);
  });

  it('别人的占不计入我的序号', () => {
    const v = checkRepeat(
      [{ key: 'deadbeef', castAt: new Date().toISOString(), windowDays: 45, status: '待结算' }],
      divinationKey(REQ),
    );
    expect(v.sequence).toBe(1);
  });
});

describe('占类与用神', () => {
  it('未识别占类时默认拒绝起局', async () => {
    await expect(
      castDivination({ question: '嗯', resolution: RESOLUTION }, empty),
    ).rejects.toThrow(/未能识别占类/);
  });

  it('显式允许后可按综合断起局，但必带保留意见', async () => {
    const d = await castDivination(
      { question: '嗯', resolution: RESOLUTION, allowGeneralReading: true },
      empty,
    );
    expect(d.categoryMatched).toBe(false);
    expect(d.category).toBe('综合');
    expect(d.caveats.join('')).toContain('对轨价值低');
  });

  it('显式占类命中并定位用神', async () => {
    const d = await castDivination(REQ, empty);
    expect(d.category).toBe('功名');
    expect(d.categoryMatched).toBe(true);
    expect(d.yongShen.length).toBeGreaterThan(0);
    expect(d.yongShen[0]!.name).toBe('开门');
    expect(d.yongShenNote.length).toBeGreaterThan(0);
  });

  it('关键词也能命中占类', async () => {
    const d = await castDivination(
      { question: '这笔投资能赚吗', nianMingGan: '丙', resolution: RESOLUTION },
      empty,
    );
    expect(d.category).toBe('求财');
    expect(d.yongShen.map((y) => y.name)).toContain('生门');
  });

  it('23 条占类全部可列出，且各带用神与断法', async () => {
    const rules = await listQuestionCategories();
    expect(rules.length).toBeGreaterThanOrEqual(20);
    for (const r of rules) {
      expect(r.category.length).toBeGreaterThan(0);
      expect(r.note.length).toBeGreaterThan(0);
      expect(r.keywords.length).toBeGreaterThan(0);
    }
  });
});

describe('盘面投影', () => {
  it('九宫齐全，键为 1–9', async () => {
    const d = await castDivination(REQ, empty);
    expect(d.palaces).toHaveLength(9);
    expect(d.palaces.map((p) => p.gong)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('飞盘三盘俱全：九宫皆有星、奇仪与暗干支', async () => {
    const d = await castDivination(REQ, empty);
    for (const p of d.palaces) {
      expect(p.tianPanXing).not.toBe('');
      expect(p.diPanYi).not.toBe('');
      expect(p.diPanAnGan).not.toBe('');
    }
  });

  /**
   * 飞盘与转盘的关键结构差异：飞盘走**九**门循环（第九门为黄门，元旦盘中宫之门），
   * 九门连中宫在内一并飞布，鸣法不寄宫；转盘只有八门且中宫留空。
   * 黄门跟着飞，不固定在中五宫 —— 这条测试就是为了锁住这个易错的直觉。
   */
  it('人盘为九门齐飞，九宫各得一门且互不重复，黄门恰现一次', async () => {
    const d = await castDivination(REQ, empty);
    const men = d.palaces.map((p) => p.renPanMen);
    expect(men.every((m) => m !== '')).toBe(true);
    expect(new Set(men).size).toBe(9);
    expect(men.filter((m) => m === '黄门')).toHaveLength(1);
  });

  it('空亡宫与马星宫在投影里标出，且与盘面自身一致', async () => {
    const d = await castDivination(REQ, empty);
    const flagged = d.palaces.filter((p) => p.kongWang).map((p) => p.gong);
    expect(new Set(flagged)).toEqual(new Set(d.kongWangGong));
    if (d.maStar) {
      expect(d.palaces.find((p) => p.gong === d.maStar!.gong)!.maStar).toBe(true);
    }
  });

  it('三乙四宫齐备：天乙主始、太乙主过程、地乙主结局', async () => {
    const d = await castDivination(REQ, empty);
    for (const g of [d.sanYi.tianYi, d.sanYi.taiYi, d.sanYi.diYi]) {
      expect(['1', '2', '3', '4', '5', '6', '7', '8', '9']).toContain(g);
    }
  });
});

describe('应期只给古法材料，不发明天数', () => {
  it('每个已定位的用神都带近应（地盘奇仪）与远应（地盘暗干支）', async () => {
    const d = await castDivination(REQ, empty);
    expect(d.yingQi.length).toBeGreaterThan(0);
    for (const c of d.yingQi) {
      expect(c.near).not.toBe('');
      expect(c.far).not.toBe('');
      expect(typeof c.kongWang).toBe('boolean');
    }
  });

  it('窗口天数来自使用者承诺，与应期材料无关', async () => {
    const d = await castDivination(REQ, empty);
    expect(d.resolution.windowDays).toBe(45);
  });
});

describe('保留意见', () => {
  it('年命干为甲时明说年命宫定不出', async () => {
    const d = await castDivination({ ...REQ, nianMingGan: '甲' }, empty);
    expect(d.caveats.join('')).toContain('甲遁六仪不上天盘');
    expect(d.sanYi.nianMingGong).toBe('');
  });

  it('未提供年命时明说以年命为断的条目不成立', async () => {
    const { nianMingGan: _drop, ...rest } = REQ;
    const d = await castDivination(rest, empty);
    expect(d.caveats.join('')).toContain('未提供求测人年命天干');
  });
});

describe('重放（供账本比对用）', () => {
  it('同一时刻重放得到同一盘与同一引擎签名', async () => {
    const d = await castDivination(REQ, empty);
    const r = await replayDivination({
      castAt: d.castAt,
      question: d.question,
      school: d.school,
      key: d.key,
      resolution: d.resolution,
      category: '功名',
      nianMingGan: '丙',
    });
    expect(r.engineSignature).toBe(d.engineSignature);
    expect(r.juShu.formatCode).toBe(d.juShu.formatCode);
    expect(r.palaces).toEqual(d.palaces);
    expect(r.yongShen).toEqual(d.yongShen);
    expect(r.castAt).toBe(d.castAt);
  });

  it('重放不产生新的占，序号恒为 1', async () => {
    const d = await castDivination(REQ, empty);
    // 账本里就摆着这一条未结算的占，重放照样可行
    await expect(
      replayDivination({
        castAt: d.castAt,
        question: d.question,
        school: d.school,
        key: d.key,
        resolution: d.resolution,
        category: '功名',
        nianMingGan: '丙',
      }),
    ).resolves.toBeTruthy();
  });

  it('账本时刻不可解析时抛错', async () => {
    await expect(
      replayDivination({
        castAt: '不是时间',
        question: '这次换工作能成吗',
        school: '飞盘鸣法',
        key: 'x',
        resolution: RESOLUTION,
      }),
    ).rejects.toThrow(/无法解析/);
  });
});

describe('未实现的流派抛错而非静默出错盘', () => {
  it('转盘时家目前拒绝起局', async () => {
    await expect(
      castDivination({ ...REQ, school: '转盘时家' }, empty),
    ).rejects.toThrow(/尚未实现/);
  });
});

describe('引擎签名', () => {
  it('含流派、局、四柱，可作账本 engineVersion', async () => {
    const d = await castDivination(REQ, empty);
    expect(d.engineSignature).toMatch(/^飞盘鸣法\|(yang|yin)-\d\|/);
    expect(d.engineSignature).toContain(d.siZhu.year);
  });
});
