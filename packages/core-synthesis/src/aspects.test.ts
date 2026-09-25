/**
 * 人生八个方面与风水师建言 —— 行为锁。
 *
 * 使用者的反馈：「多数关于事业，没有健康、儿女、意外、感情、学业的考虑。」
 * 这里守住：感情不再只靠主卧红线、学业是独立维度、每人按阶段得到对应方面的建言。
 */

import { describe, expect, it } from 'vitest';
import { personalDirections, PALACE_DIRECTION, STAR_META } from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { aspectApplies, ASPECTS, domainReading } from './family.js';
import { buildPersonView } from './person.js';
import { analyse, predict } from './predict.js';
import { SAMPLE_MEMBERS, SAMPLE_PROFILE, makeMember, sampleInput } from './fixtures.js';

const decade = Array.from({ length: 10 }, (_, i) => 2026 + i);
const predsOf = (year: number, members = SAMPLE_MEMBERS) => {
  const input = { ...sampleInput(year), members };
  return predict(input, synthesise(input));
};

describe('覆盖面：不再几乎全是事业', () => {
  it('文昌星主学业：一白、四绿的应事含学业', () => {
    expect(STAR_META[1].riskDomains).toContain('学业');
    expect(STAR_META[4].riskDomains).toContain('学业');
  });

  it('感情预测不再只靠主卧红线：十年里出现过非红线的感情条目', () => {
    const general = decade.flatMap((y) => predsOf(y)).filter((p) => p.domain === '感情' && !p.id.startsWith('relation-'));
    expect(general.length).toBeGreaterThan(0);
  });

  it('十年里，成年人的条目至少涵盖五个不同方面', () => {
    const labels = new Set(
      decade.flatMap((y) => predsOf(y)).flatMap((p) => p.perMember.filter((m) => m.memberId === 'm-dad').map((m) => m.domainLabel)),
    );
    expect(labels.size).toBeGreaterThanOrEqual(5);
  });
});

describe('八个方面按阶段适用', () => {
  it('孩子：健康、意外、学业、人际；没有感情、子女、事业、财运', () => {
    const kid = ASPECTS.filter((a) => aspectApplies(a, '儿童'));
    expect(kid).toEqual(['健康', '意外', '学业', '人际']);
  });
  it('成人八项全有；长者不谈学业', () => {
    expect(ASPECTS.filter((a) => aspectApplies(a, '成人'))).toEqual([...ASPECTS]);
    expect(aspectApplies('学业', '长者')).toBe(false);
    expect(aspectApplies('子女', '长者')).toBe(true);
  });
  it('「人丁」读作子女、「官非」读作人际', () => {
    expect(domainReading('人丁', '成人')?.label).toBe('子女');
    expect(domainReading('官非', '成人')?.label).toBe('人际');
    expect(domainReading('学业', '长者')).toBeNull();
  });
});

describe('风水师建言', () => {
  const s = analyse(sampleInput(2026), synthesise(sampleInput(2026)));

  it('成人得八个方面，孩子得四个，每项都有宜、忌、依据', () => {
    const dad = buildPersonView(s, SAMPLE_MEMBERS, 'm-dad')!;
    const son = buildPersonView(s, SAMPLE_MEMBERS, 'm-son')!;
    expect(dad.advice.map((a) => a.aspect)).toEqual([...ASPECTS]);
    expect(son.advice.map((a) => a.aspect)).toEqual(['健康', '意外', '学业', '人际']);
    for (const a of [...dad.advice, ...son.advice]) {
      expect(a.focus.length).toBeGreaterThan(8);
      expect(a.yi.length).toBeGreaterThan(0);
      expect(a.ji.length).toBeGreaterThan(0);
      expect(a.basis.length).toBeGreaterThan(0);
    }
  });

  it('方位来自本人命卦：健康看天医、感情看延年、学业看伏位', () => {
    const dad = buildPersonView(s, SAMPLE_MEMBERS, 'm-dad')!;
    const best = personalDirections(SAMPLE_MEMBERS[0]!.mingGua.gua as never).best;
    const dir = (star: string) => PALACE_DIRECTION[best.find((b) => b.star === star)!.palace];
    expect(dad.advice.find((a) => a.aspect === '健康')!.focus).toContain(dir('天医'));
    expect(dad.advice.find((a) => a.aspect === '感情')!.focus).toContain(dir('延年'));
    expect(dad.advice.find((a) => a.aspect === '学业')!.focus).toContain(dir('伏位'));
  });

  it('已婚与单身的感情建言相反：已婚防烂桃花、单身催桃花', () => {
    const dad = buildPersonView(s, SAMPLE_MEMBERS, 'm-dad')!;
    const love = dad.advice.find((a) => a.aspect === '感情')!;
    expect(love.focus).toContain('已婚');
    expect(love.ji.join('')).toMatch(/桃花/);

    const single = makeMember('m-single', '阿杰', '男', 1996, { month: 5, day: 5, hour: 10 });
    const input = { ...sampleInput(2026), members: [single] };
    const s2 = analyse(input, synthesise(input));
    const love2 = buildPersonView(s2, [single], 'm-single')!.advice.find((a) => a.aspect === '感情')!;
    expect(love2.focus).toContain('单身');
    expect(love2.yi.join('')).toMatch(/桃花位/);
  });

  it('长者的子女建言是「为儿孙操心」而非求子', () => {
    const gp = makeMember('m-gp', '爷爷', '男', 1950, { month: 3, day: 3 });
    const input = { ...sampleInput(2026), members: [gp] };
    const s3 = analyse(input, synthesise(input));
    const kids = buildPersonView(s3, [gp], 'm-gp')!.advice.find((a) => a.aspect === '子女')!;
    expect(kids.focus).toContain('儿孙');
    expect(kids.focus).not.toContain('求子');
  });

  it('现状与这屋对我的各方面一致', () => {
    const son = buildPersonView(s, SAMPLE_MEMBERS, 'm-son')!;
    for (const a of son.advice) {
      const cell = son.domains.find((d) => d.domain === a.aspect)!;
      expect(a.status).toBe(cell.relative);
    }
  });

  it('确定性', () => {
    const a = buildPersonView(s, SAMPLE_MEMBERS, 'm-mom')!.advice;
    const b = buildPersonView(s, SAMPLE_MEMBERS, 'm-mom')!.advice;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(SAMPLE_PROFILE.rooms.length).toBeGreaterThan(0);
  });
});
