'use client';

/** 成员 —— 卡片列表 + 分步录入（不再是一张长表单）。 */

import Link from 'next/link';
import { useState } from 'react';
import { PALACE_DIRECTION, personalDirections } from '@hidefate/core-fengshui';
import { AppBar, Empty, Expandable, Sheet, Skeleton } from '../../components/mobile/ui';
import { useProperty } from '../../lib/PropertyContext';
import { db, newId, type StoredMember } from '../../lib/db';

const CONF_TONE: Record<string, string> = {
  高: 'border-jade/40 bg-jade/10 text-jade',
  中等: 'border-gold/40 bg-gold/10 text-gold',
  偏低: 'border-risk-warn/40 bg-risk-warn/10 text-risk-warn',
  低: 'border-ink-mute/30 bg-ink-mute/10 text-ink-mute',
};

export default function MembersPage() {
  const { property, members, loading, reload } = useProperty();
  const [adding, setAdding] = useState(false);

  if (loading) {
    return (
      <>
        <AppBar title="成员" />
        <div className="px-4 py-4">
          <Skeleton lines={4} />
        </div>
      </>
    );
  }

  if (!property) {
    return (
      <>
        <AppBar title="成员" />
        <div className="px-4 py-4">
          <Empty
            title="请先建立房屋"
            desc="成员是挂在某一处房屋下的，因为同一个人在不同房子里吉凶不同。"
            action={
              <Link href="/new" className="btn btn-primary btn-block">
                建立房屋
              </Link>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar
        title="成员"
        subtitle={property.name}
        right={
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
            添加
          </button>
        }
      />

      <div className="space-y-3 px-4 py-4">
        {members.length === 0 && (
          <Empty
            title="还没有成员"
            desc="只要知道出生年与性别就能加入 —— 命卦（八宅个人方位）只需这两项，完全不受八字残缺影响。"
            action={
              <button type="button" className="btn btn-primary btn-block" onClick={() => setAdding(true)}>
                添加第一位成员
              </button>
            }
          />
        )}

        {members.map((m) => {
          const dirs = personalDirections(m.mingGua.gua as never);
          const es = m.chart.elementStrength;
          return (
            <div key={m.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-serif text-[1.0625rem] font-semibold">
                    {m.name}
                    {m.relation && <span className="ml-2 text-[0.75rem] font-normal text-ink-mute">{m.relation}</span>}
                  </p>
                  <p className="mt-0.5 text-[0.75rem] text-ink-mute">
                    {m.chart.input.gender} · {m.chart.input.year} 年{m.chart.zodiac && ` · 属${m.chart.zodiac}`}
                  </p>
                </div>
                <button
                  type="button"
                  className="min-h-[2.5rem] shrink-0 px-2 text-[0.8125rem] text-ink-mute active:text-cinnabar"
                  onClick={async () => {
                    await db().members.delete(m.id);
                    reload();
                  }}
                >
                  移除
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="tag border-cinnabar/40 bg-cinnabar/10 text-cinnabar">
                  {m.mingGua.gua}
                  {m.mingGua.number}命
                </span>
                <span className="tag border-rice-line text-ink-mute">{m.mingGua.group}</span>
                <span className={`tag ${CONF_TONE[m.chart.confidence.label.split('（')[0]!] ?? 'border-rice-line'}`}>
                  八字{m.chart.confidence.label}
                </span>
              </div>

              {/* 四柱 */}
              <div className="mt-3 flex gap-1.5">
                {m.chart.pillars.map((p) => (
                  <div key={p.position} className="flex-1 rounded-lg border border-rice-line bg-rice-deep/40 py-1.5 text-center">
                    <p className="text-[0.625rem] leading-none text-ink-mute">{p.position.replace('柱', '')}</p>
                    <p className="mt-1 font-serif text-[1.0625rem] leading-none">
                      {p.gan}
                      {p.zhi}
                    </p>
                  </div>
                ))}
                {Array.from({ length: 4 - m.chart.pillars.length }).map((_, i) => (
                  <div
                    key={`u${i}`}
                    className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-rice-line py-2 text-[0.6875rem] text-ink-mute"
                  >
                    未知
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-1 text-[0.8125rem] leading-relaxed">
                <p>
                  <span className="text-jade">四吉方</span>：
                  {dirs.best.map((d) => `${PALACE_DIRECTION[d.palace]}(${d.star})`).join('、')}
                </p>
                <p>
                  <span className="text-cinnabar">四凶方</span>：
                  {dirs.worst.map((d) => `${PALACE_DIRECTION[d.palace]}(${d.star})`).join('、')}
                </p>
              </div>

              {es.dayMasterElement ? (
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">
                  日主 <b>{m.chart.dayMaster}</b>（{es.dayMasterElement}
                  {es.dayMasterSeasonState && `·${es.dayMasterSeasonState}`}）·{es.verdict}·喜
                  <b className="text-jade">{es.favourable.join('')}</b>
                  {es.unfavourable.length > 0 && (
                    <>
                      {' '}忌<b className="text-cinnabar">{es.unfavourable.join('')}</b>
                    </>
                  )}
                </p>
              ) : (
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-mute">{es.note}</p>
              )}

              {m.chart.unavailable.length > 0 && (
                <div className="mt-2">
                  <Expandable title={<span className="text-[0.8125rem]">因资料不全而未推算（{m.chart.unavailable.length}）</span>}>
                    <ul className="list-disc space-y-1 pl-4 text-[0.8125rem] leading-relaxed text-ink-mute">
                      {m.chart.unavailable.map((u, i) => (
                        <li key={i}>{u}</li>
                      ))}
                    </ul>
                  </Expandable>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title={<span className="font-serif text-[1.0625rem] font-semibold">添加成员</span>}>
        <AddMemberWizard
          propertyId={property.id}
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      </Sheet>
    </>
  );
}

/** 分步录入：一屏一件事，不做长表单。 */
function AddMemberWizard({ propertyId, onDone }: { propertyId: string; onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [gender, setGender] = useState<'男' | '女'>('男');
  const [year, setYear] = useState<number>(1990);
  const [month, setMonth] = useState<number | ''>('');
  const [day, setDay] = useState<number | ''>('');
  const [hour, setHour] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  const precision =
    month === '' ? '仅年' : day === '' ? '年月' : hour === '' ? '年月日（缺时柱）' : '四柱全';

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    const rec: StoredMember = {
      id: newId('m'),
      propertyId,
      name: name.trim(),
      relation: relation.trim() || undefined,
      gender,
      year,
      month: month === '' ? undefined : Number(month),
      day: day === '' ? undefined : Number(day),
      hour: hour === '' ? undefined : Number(hour),
    };
    await db().members.put(rec);
    onDone();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[0.8125rem]">
        {['是谁', '出生年', '更精确（可跳过）'].map((l, i) => (
          <span key={l} className={`flex items-center gap-1 ${step === i + 1 ? 'text-cinnabar' : 'text-ink-mute'}`}>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.6875rem] ${
                step === i + 1 ? 'bg-cinnabar text-white' : 'border border-rice-line'
              }`}
            >
              {i + 1}
            </span>
            {l}
          </span>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <div>
            <label className="label">姓名</label>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：陈先生" autoFocus />
          </div>
          <div>
            <label className="label">称谓（选填）</label>
            <input className="field" value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="例：男主人" />
          </div>
          <div>
            <label className="label">性别</label>
            <div className="flex gap-2">
              {(['男', '女'] as const).map((g) => (
                <button key={g} type="button" className={`btn flex-1 ${gender === g ? 'btn-primary' : ''}`} onClick={() => setGender(g)}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-block" disabled={!name.trim()} onClick={() => setStep(2)}>
            下一步
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div>
            <label className="label">出生年（必填）</label>
            <input
              type="number"
              inputMode="numeric"
              className="field text-center font-serif text-2xl"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <p className="rounded-xl border border-rice-line bg-rice-deep/40 p-3 text-[0.8125rem] leading-relaxed text-ink-soft">
            只填这一项就已经够用 —— <b>命卦与八宅个人方位只需出生年与性别</b>，
            后面的月日时都是可选的，填得越多八字层面越准。
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn flex-1" onClick={() => setStep(1)}>
              上一步
            </button>
            <button type="button" className="btn btn-primary flex-1" onClick={() => setStep(3)}>
              下一步
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">月</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={12}
                className="field text-center"
                value={month}
                onChange={(e) => setMonth(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="—"
              />
            </div>
            <div>
              <label className="label">日</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                className="field text-center"
                value={day}
                onChange={(e) => setDay(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="—"
              />
            </div>
            <div>
              <label className="label">时辰</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={23}
                className="field text-center"
                value={hour}
                onChange={(e) => setHour(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="—"
              />
            </div>
          </div>

          <p className="rounded-xl border border-rice-line bg-rice-deep/40 p-3 text-[0.8125rem] leading-relaxed text-ink-soft">
            当前精度：<b>{precision}</b>。
            问不到时辰很常见 —— 会自动改用三柱分析并标注「中等（缺时柱）」，
            绝不会拿假设的时辰充数。
          </p>

          <div className="flex gap-2">
            <button type="button" className="btn flex-1" onClick={() => setStep(2)}>
              上一步
            </button>
            <button type="button" className="btn btn-primary flex-1" onClick={submit} disabled={saving}>
              {saving ? '保存中…' : '完成'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
