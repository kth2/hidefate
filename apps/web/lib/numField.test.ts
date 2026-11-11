import { describe, expect, it } from 'vitest';
import { parseNum } from '../components/mobile/NumField';

describe('数字输入解析', () => {
  const year = { min: 1900, max: 2100 };
  it('打字途中的年份不算合法，满四位才算', () => {
    expect(parseNum('1', year)).toBeNull();
    expect(parseNum('19', year)).toBeNull();
    expect(parseNum('198', year)).toBeNull();
    expect(parseNum('1988', year)).toBe(1988);
    expect(parseNum(' 1988 ', year)).toBe(1988);
    expect(parseNum('1899', year)).toBeNull();
  });
  it('全角数字照收', () => {
    expect(parseNum('１９８８', year)).toBe(1988);
  });
  it('经度：小数、负数；「101.」这种中间值不回报', () => {
    const lon = { min: -180, max: 180, decimal: true };
    expect(parseNum('101.', lon)).toBeNull();
    expect(parseNum('101.69', lon)).toBe(101.69);
    expect(parseNum('-', lon)).toBeNull();
    expect(parseNum('-73.9', lon)).toBe(-73.9);
    expect(parseNum('181', lon)).toBeNull();
  });
  it('整数框不收小数、科学记号', () => {
    expect(parseNum('12.5', { min: 0 })).toBeNull();
    expect(parseNum('1e3', {})).toBeNull();
    expect(parseNum('', {})).toBeNull();
  });
});
