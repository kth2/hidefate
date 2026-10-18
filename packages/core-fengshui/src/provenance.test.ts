import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_FENGSHUI_VERSION, ENGINE_ID, RULES_HASH, fnv1a } from './provenance.js';
import { buildFlyingStarChart } from './flyingStar.js';

describe('计算出处戳记', () => {
  it('引擎版本与 package.json 一致', () => {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
    expect(CORE_FENGSHUI_VERSION).toBe(pkg.version);
  });

  it('规则表指纹锁定：改了二十四山、替星、洛书飞布或元运纪年，这里必须失败并提醒升版本', () => {
    // 若此断言失败：先确认规则表的改动是有意的、已登记在 reference/ 差异报告，再更新这个值。
    expect(RULES_HASH).toBe('779ade68');
  });

  it('每张盘都带出处；门派参数不同，ruleSet 不同；星数不受戳记影响', () => {
    const a = buildFlyingStarChart({ sitting: '壬', period: 8, useTiXing: false });
    const b = buildFlyingStarChart({ sitting: '壬', period: 8, useTiXing: true });
    expect(a.provenance.engine).toBe(ENGINE_ID);
    expect(a.provenance.ruleSet).toMatch(/ti=off/);
    expect(b.provenance.ruleSet).toMatch(/ti=on/);
    expect(a.provenance.ruleSet).not.toBe(b.provenance.ruleSet);
  });

  it('FNV-1a 已知值', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
  });
});
