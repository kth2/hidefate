/**
 * 症状详情路由。
 *
 * 这一层刻意是服务端组件：静态导出（GitHub Pages）需要 generateStaticParams
 * 把五个类别各导出一份 HTML，而 generateStaticParams 不能出现在客户端组件里。
 * 真正的界面在 SymptomView（客户端），因为它要读本机 IndexedDB 里的物业。
 */

import { SYMPTOM_CATEGORIES } from '../../../lib/symptoms';
import { SymptomView } from './SymptomView';

export function generateStaticParams() {
  return SYMPTOM_CATEGORIES.map((c) => ({ category: c.id }));
}

export const dynamicParams = false;

export default async function SymptomPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  return <SymptomView categoryId={category} />;
}
