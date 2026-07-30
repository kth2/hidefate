'use client';

/**
 * 常见问题选单 —— 按居家 / 商业分流。
 *
 * 店铺用户不该看到「主卧设哪一方对夫妻感情最好」，
 * 住家用户也不该被问「招牌颜色怎么配」。故按场景过滤，并按类别分组。
 *
 * 点选后会把该问题的「该看盘上何处」一并交给作答方 ——
 * 令 AI 知道该引用哪一段事实，而非泛泛而谈。
 */

import { useState } from 'react';
import { scenarioOf, type BuildingType } from '@hidefate/core-fengshui';
import { faqByCategory, faqHighlights, type FaqItem } from '@hidefate/core-synthesis';

export function FaqPicker({
  buildingType,
  onPick,
}: {
  buildingType: BuildingType;
  onPick: (item: FaqItem) => void;
}) {
  const scenario = scenarioOf(buildingType);
  const groups = faqByCategory(scenario);
  const highlights = faqHighlights(scenario);
  const [openCat, setOpenCat] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <p className="label">
          最常问的几条（{scenario}）
        </p>
        <div className="space-y-1.5">
          {highlights.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onPick(f)}
              className="w-full rounded-xl border border-cinnabar/30 bg-cinnabar/[0.04] p-3 text-left text-[0.9375rem] leading-snug active:scale-[0.99]"
            >
              {f.question}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label">按类别浏览</p>
        <div className="space-y-2">
          {groups.map((g) => {
            const open = openCat === g.category;
            return (
              <div key={g.category} className="overflow-hidden rounded-xl border border-rice-line bg-white">
                <button
                  type="button"
                  onClick={() => setOpenCat(open ? null : g.category)}
                  className="flex min-h-[3rem] w-full items-center gap-2 px-3.5 text-left active:bg-rice-deep/40"
                >
                  <span className="flex-1 text-[0.9375rem] font-medium">{g.category}</span>
                  <span className="tag border-rice-line text-ink-mute">{g.items.length}</span>
                  <svg
                    width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="#8b817a" strokeWidth="2" strokeLinecap="round"
                    className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {open && (
                  <ul className="border-t border-rice-line">
                    {g.items.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => onPick(f)}
                          className="w-full border-b border-rice-line px-3.5 py-3 text-left text-[0.875rem] leading-relaxed last:border-b-0 active:bg-rice-deep/40"
                        >
                          {f.question}
                          <span className="mt-1 block text-[0.75rem] text-ink-mute">
                            将查看：{f.lookAt.join('、')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
