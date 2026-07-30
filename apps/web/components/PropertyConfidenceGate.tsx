'use client';

/**
 * 挂在当前物业上的置信度提示。
 *
 * 各分析页只需在内容顶部放一个 `<PropertyConfidenceGate />`，
 * 置信度够高时它自己消失，不必每页各写一遍取数逻辑。
 */

import { ConfidenceGate } from './ConfidenceLadder';
import { useProperty } from '../lib/PropertyContext';

export function PropertyConfidenceGate() {
  const { property, members } = useProperty();
  return <ConfidenceGate profile={property} members={members} />;
}
