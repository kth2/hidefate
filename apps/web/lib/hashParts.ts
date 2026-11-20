import type { PropertyProfile, VoidLineChoice } from '@hidefate/core-fengshui';

/**
 * 写进账本 inputHash 的「空亡线择盘」部分。
 *
 * 只放择过盘的房屋：没择过（或房子不在空亡线上而择盘失效）时返回空物件，
 * 旧记录的哈希因此不变；一旦择盘，哈希随之改变，日后重放能分辨用的是哪张盘。
 */
export function voidLineHashPart(
  residences: readonly { readonly propertyId: string }[],
  properties: ReadonlyMap<string, PropertyProfile>,
): { voidLine?: [string, VoidLineChoice][] } {
  const picks: [string, VoidLineChoice][] = [];
  const seen = new Set<string>();
  for (const r of residences) {
    if (seen.has(r.propertyId)) continue;
    seen.add(r.propertyId);
    const c = properties.get(r.propertyId)?.voidLineChart;
    if (c) picks.push([r.propertyId, c]);
  }
  return picks.length ? { voidLine: picks.sort((a, b) => a[0].localeCompare(b[0])) } : {};
}
