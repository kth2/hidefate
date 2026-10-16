import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHOOL, resolveSchool } from '@hidefate/core-fengshui';
import { EXPORT_VERSION, buildExport, parseImport } from './db';

const empty = { properties: [], members: [], cures: [], scenarios: [], residences: [], predictions: [], quiets: [], divinations: [] };

describe('导出与导入（第零期审计 D5）', () => {
  it('v3 含占局盘面与门派设置，往返不失真', () => {
    const div = [{ id: 'd1', key: 'k', sequence: 1, question: '这单签不签', category: '求财', castAt: '2026-10-16T04:00:00.000Z', resolveBy: '2026-11-16', juShu: '阳遁三局', status: '待结算', resolution: { criterion: '十一月十六日前签约', judge: '客观记录', windowDays: 31 }, predictionId: 'p1', chartJson: '{}' }];
    const school = resolveSchool({ phaseBasis: '时运' });
    const out = buildExport({ ...empty, divinations: div as never }, school, new Date('2026-10-16T00:00:00Z'));
    const back = parseImport(JSON.stringify(out));
    expect(back.version).toBe(EXPORT_VERSION);
    expect(back.divinations).toEqual(div);
    expect(back.school).toEqual(school);
  });

  it('导出内容不含 AI Key 一类的设置', () => {
    const json = JSON.stringify(buildExport(empty, DEFAULT_SCHOOL, new Date()));
    expect(json).not.toMatch(/aiApiKey|apiKey/i);
  });

  it('旧版（v2）备份照样可导入；比本 App 新的版本拒绝', () => {
    expect(parseImport(JSON.stringify({ version: 2, properties: [] })).divinations).toBeUndefined();
    expect(() => parseImport(JSON.stringify({ version: EXPORT_VERSION + 1 }))).toThrow(/更新 App/);
  });
});
