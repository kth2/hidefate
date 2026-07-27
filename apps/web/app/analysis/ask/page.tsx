'use client';

/** 问答 —— 离线内置作答 + AI 对话。 */

import { AppBar, Empty, Skeleton } from '../../../components/mobile/ui';
import { AskTab } from '../../../components/AskTab';
import { useProperty } from '../../../lib/PropertyContext';

export default function AskPage() {
  const { property, result, members, loading } = useProperty();

  if (loading) return <><AppBar title="问答" back="/me" /><div className="px-4 py-4"><Skeleton lines={4} /></div></>;

  if (!property || !result) {
    return (
      <>
        <AppBar title="问答" back="/me" />
        <div className="px-4 py-4">
          <Empty title="请先建立房屋" desc="问答要基于某一处房屋的实际盘面。" />
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar title="问答" subtitle={property.name} back="/me" />
      <div className="px-4 py-4">
        <AskTab result={result} members={members} />
      </div>
    </>
  );
}
