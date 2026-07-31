'use client';

/**
 * 象意收敛 —— 对轨的回报。
 *
 * 这一页是整个产品的爽点：用户看到「你确认了那几年确实动过刀 →
 * 你这颗七杀走身体线不走官非线」。
 *
 * 但它同样是最容易变成自欺的一页，所以有两条硬规矩：
 *   1. 成熟度「未起步」时位移恒为 0，界面**明说还没学到东西**，
 *      不许把一两条证据造成的微小抖动画成「系统已经了解你」
 *   2. 只呈现已收敛与已排除，不呈现任何预测 —— 预测在对轨页，
 *      两者混在一起会让人分不清哪些是盘说的、哪些是自己说的
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isRuledOut } from '@hidefate/core-xiangyi';
import { AppBar, Empty, Meter } from '../../../components/mobile/ui';
import { useProperty } from '../../../lib/PropertyContext';
import { loadLearned, type LearnedRow } from '../../../lib/calibrateStore';

const MATURITY_TONE: Record<string, string> = {
  未起步: 'text-ink-mute',
  初步: 'text-gold',
  可参考: 'text-jade',
};

export default function LearnedPage() {
  const { memberRows } = useProperty();
  const person = memberRows[0] ?? null;
  const [rows, setRows] = useState<LearnedRow[] | null>(null);

  useEffect(() => {
    if (!person) return;
    void loadLearned(person.id).then(setRows);
  }, [person]);

  if (!person) {
    return (
      <>
        <AppBar title="象意收敛" back="/calibrate" />
        <div className="px-4 py-6">
          <Empty title="还没有成员" />
        </div>
      </>
    );
  }

  const list = rows ?? [];
  const moved = list.filter((r) => r.posterior.maturity !== '未起步');
  const ruledOut = list.filter((r) => isRuledOut(r.entry, r.posterior));

  return (
    <>
      <AppBar title="象意收敛" subtitle={person.name} back="/calibrate" />

      <div className="space-y-4 px-4 py-4">
        {list.length === 0 ? (
          <Empty
            title="还没有对轨记录"
            desc="先去对轨页把回溯条目逐条评一遍，这里就会显示你的取象往哪个方向收敛。"
            action={
              <Link href="/calibrate" className="btn btn-primary btn-block">
                去对轨
              </Link>
            }
          />
        ) : (
          <>
            <section className="card">
              <p className="text-[0.8125rem] leading-relaxed">
                共 {list.length} 条象意收到过证据，其中 {moved.length} 条已开始偏离古法先验
                {ruledOut.length > 0 && `，${ruledOut.length} 条已被证据排除`}。
              </p>
              {moved.length === 0 && (
                <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-mute">
                  目前每条的证据都还不足三次，权重基本等于古法先验 ——
                  <strong className="text-ink">系统还没有真正学到关于你的东西</strong>，
                  现在展示的只是起点。继续对轨。
                </p>
              )}
            </section>

            <section>
              <h2 className="section-title">这些象在你身上怎么走</h2>
              <div className="space-y-3">
                {list.map((r) => {
                  const p = r.posterior;
                  const out = isRuledOut(r.entry, p);
                  return (
                    <article key={p.xiangId} className="card">
                      <div className="flex items-start gap-2">
                        <span className="shrink-0 rounded-md border border-rice-line px-1.5 py-0.5 text-[0.6875rem] text-ink-mute">
                          {r.entry.source.layer}·{r.entry.domain}
                        </span>
                        <span className={`ml-auto shrink-0 text-[0.6875rem] ${MATURITY_TONE[p.maturity]}`}>
                          {p.maturity}
                        </span>
                      </div>
                      <p className={`mt-2 text-[0.9375rem] leading-relaxed ${out ? 'text-ink-mute line-through' : ''}`}>
                        {r.entry.statement}
                      </p>

                      {/*
                        成熟度未起步时**显示先验而非后验**。
                        后验此刻确实已经动了几个百分点，但那点位移在统计上没有意义，
                        画出来只会让人以为系统已经了解他 —— 说「尚未偏移」却显示一个
                        动过的数字，是自相矛盾，也是这类界面最容易骗到人的地方。
                      */}
                      <div className="mt-3 space-y-1.5">
                        <Meter
                          value={p.maturity === '未起步' ? r.entry.prior : p.weight}
                          color={out ? '#8b817a' : r.shift > 0 ? '#a8352a' : '#5b7f6f'}
                          label={`${Math.round((p.maturity === '未起步' ? r.entry.prior : p.weight) * 100)}%`}
                        />
                        <p className="text-[0.6875rem] text-ink-mute">
                          古法先验 {Math.round(r.entry.prior * 100)}%
                          {p.maturity === '未起步'
                            ? ` · 证据不足（${p.hits + p.partial + p.misses}/3），仍按先验显示`
                            : ` · 已${r.shift >= 0 ? '上调' : '下调'} ${Math.abs(Math.round(r.shift * 100))} 个百分点`}
                        </p>
                        <p className="text-[0.6875rem] text-ink-mute">
                          证据：{p.hits} 次发生、{p.partial} 次部分、{p.misses} 次未发生
                        </p>
                      </div>

                      {out && (
                        <p className="mt-2 rounded-lg border border-rice-line bg-rice-deep/40 p-2 text-[0.75rem] leading-relaxed text-ink-mute">
                          证据足够且持续不应，这条已从你的候选象里排除 ——
                          往后同类盘面不会再拿它来提醒你。
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>

            <p className="text-[0.75rem] leading-relaxed text-ink-mute">
              这里改变的只有「哪条象在你身上成立」。飞星取象、十神定义、八宅游年这些古法本身
              一个字都没有动 —— 几十条证据不该推翻千年积累，能推翻的只是它对你个人的适用性。
            </p>
          </>
        )}
      </div>
    </>
  );
}
