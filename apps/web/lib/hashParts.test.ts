import { describe, expect, it } from 'vitest';
import type { PropertyProfile } from '@hidefate/core-fengshui';
import { voidLineHashPart } from './hashParts';

const p = (id: string, v?: '下卦' | '替卦') =>
  ({ id, sitting: 351.5, moveInYear: 2025, ...(v ? { voidLineChart: v } : {}) }) as unknown as PropertyProfile;

describe('账本哈希：空亡线择盘', () => {
  it('没有房屋择过盘：返回空物件，旧哈希不变', () => {
    expect(voidLineHashPart([{ propertyId: 'a' }], new Map([['a', p('a')]]))).toEqual({});
  });
  it('择过盘：按房屋编号排序列出，重复居住段只记一次', () => {
    const props = new Map([['b', p('b', '下卦')], ['a', p('a', '替卦')], ['c', p('c')]]);
    expect(voidLineHashPart([{ propertyId: 'b' }, { propertyId: 'a' }, { propertyId: 'b' }, { propertyId: 'c' }], props)).toEqual({
      voidLine: [['a', '替卦'], ['b', '下卦']],
    });
  });
});
