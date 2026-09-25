'use client';

/** 成员 —— 卡片列表 + 分步录入（不再是一张长表单）。 */

import Link from 'next/link';
import { useState } from 'react';
import {
  PALACE_DIRECTION,
  YOU_NIAN_META,
  crossPersonHouse,
  personalDirections,
  roomExposure,
  type PalaceIndex,
} from '@hidefate/core-fengshui';
import { computeMingGua } from '@hidefate/core-bazi';
import { AppBar, Empty, Expandable, Sheet, Skeleton } from '../../components/mobile/ui';
import { useProperty } from '../../lib/PropertyContext';
import { deleteMember, describeImpact, memberDeletionImpact } from '../../lib/cascade';
import { db, newId, type StoredMember, type StoredProperty } from '../../lib/db';
import { ensureResidence, roomsOf, saveOccupancy } from '../../lib/occupancy';

const CONF_TONE: Record<string, string> = {
  高: 'border-jade/40 bg-jade/10 text-jade',
  中等: 'border-gold/40 bg-gold/10 text-gold',
  偏低: 'border-risk-warn/40 bg-risk-warn/10 text-risk-warn',
  低: 'border-ink-mute/30 bg-ink-mute/10 text-ink-mute',
};

export default function MembersPage() {
  const { property, result, members, memberRows, loading, reload } = useProperty();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StoredMember | null>(null);

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
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    className="min-h-[2.5rem] px-2 text-[0.8125rem] text-ink-mute active:text-cinnabar"
                    onClick={() => {
                      const row = memberRows.find((r) => r.id === m.id);
                      if (row) setEditing(row);
                    }}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className="min-h-[2.5rem] px-2 text-[0.8125rem] text-ink-mute active:text-cinnabar"
                    onClick={async () => {
                      const extra = describeImpact(await memberDeletionImpact(m.id), { includeMembers: false });
                      const msg =
                        `确定移除「${m.name}」？` +
                        (extra ? `此人名下的 ${extra} 会一并删除，` : '') +
                        '且无法撤销。';
                      if (!confirm(msg)) return;
                      await deleteMember(m.id);
                      reload();
                    }}
                  >
                    移除
                  </button>
                </div>
              </div>

              <Link
                href={`/person?id=${encodeURIComponent(m.id)}`}
                className="mt-2 flex min-h-[2.75rem] items-center justify-between rounded-xl border border-cinnabar/30 bg-cinnabar/[0.05] px-3 text-[0.875rem] text-cinnabar active:opacity-70"
              >
                <span>这屋对{m.name}的影响</span>
                <span aria-hidden>›</span>
              </Link>

              {(() => {
                const mine = property.rooms.filter((r) => r.occupants?.includes(m.id));
                return mine.length > 0 ? (
                  <p className="mt-2 text-[0.8125rem] text-ink-soft">
                    住／常待：<b>{mine.map((r) => `${r.label ?? r.kind}（${PALACE_DIRECTION[r.primaryPalace]}）`).join('、')}</b>
                  </p>
                ) : (
                  <button
                    type="button"
                    className="mt-2 w-full rounded-xl border border-dashed border-risk-warn/50 bg-risk-warn/[0.05] px-3 py-2.5 text-left text-[0.8125rem] leading-relaxed text-ink-soft active:opacity-70"
                    onClick={() => {
                      const row = memberRows.find((r) => r.id === m.id);
                      if (row) setEditing(row);
                    }}
                  >
                    还没指定{m.name}住哪间 —— 指定后才算得出这间房对{m.name}的影响。
                    <span className="text-cinnabar"> 指定 ›</span>
                  </button>
                );
              })()}

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
        <MemberWizard
          property={property}
          houseGua={result?.baZhai.houseGua ?? null}
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      </Sheet>

      <Sheet open={editing != null} onClose={() => setEditing(null)} title={<span className="font-serif text-[1.0625rem] font-semibold">编辑成员</span>}>
        {editing && (
          <MemberWizard
            property={property}
            houseGua={result?.baZhai.houseGua ?? null}
            member={editing}
            onDone={() => {
              setEditing(null);
              reload();
            }}
          />
        )}
      </Sheet>
    </>
  );
}

/**
 * 分步录入：一屏一件事，不做长表单。
 *
 * 传入 `member` 即为编辑模式：沿用原 id 与已有的常用房间等字段，只覆盖表单里这几项，
 * 不新建记录，也不丢掉用户之前挂在这个人身上的房间关联。
 */
function MemberWizard({
  property,
  houseGua,
  member,
  onDone,
}: {
  property: StoredProperty;
  /** 宅卦；用来当场告诉用户每间房于此人命卦是吉是凶。 */
  houseGua: string | null;
  member?: StoredMember;
  onDone: () => void;
}) {
  const propertyId = property.id;
  const editing = member != null;
  const [step, setStep] = useState(1);
  const [name, setName] = useState(member?.name ?? '');
  const [relation, setRelation] = useState(member?.relation ?? '');
  const [gender, setGender] = useState<'男' | '女'>((member?.gender as '男' | '女') ?? '男');
  const [year, setYear] = useState<number>(member?.year ?? 1990);
  const [month, setMonth] = useState<number | ''>(member?.month ?? '');
  const [day, setDay] = useState<number | ''>(member?.day ?? '');
  const [hour, setHour] = useState<number | ''>(member?.hour ?? '');
  const [saving, setSaving] = useState(false);
  const [roomIds, setRoomIds] = useState<string[]>(() => (member ? roomsOf(property, member.id) : []));

  /** 可指定给人的房间：卧房书房等专属房在前，其次是可能「常待」的共用空间（门不算）。 */
  const personalRooms = property.rooms.filter((r) => roomExposure(r.kind) === '专属');
  const sharedRooms = property.rooms.filter(
    (r) => roomExposure(r.kind) === '共用' && !['大门', '后门', '侧门', '玄关'].includes(r.kind),
  );
  const hasRoomStep = personalRooms.length + sharedRooms.length > 0;

  /** 此方于此人命卦是哪颗八宅星 —— 选房时当场可见。 */
  const starFor = (palace: PalaceIndex) => {
    if (!houseGua || palace === 5) return null;
    try {
      const mg = computeMingGua(
        year,
        gender,
        month === '' ? undefined : { month: Number(month), day: day === '' ? undefined : Number(day) },
      );
      return crossPersonHouse(houseGua as never, mg.gua as never)[palace as Exclude<PalaceIndex, 5>].personStar;
    } catch {
      return null;
    }
  };

  const precision =
    month === '' ? '仅年' : day === '' ? '年月' : hour === '' ? '年月日（缺时柱）' : '四柱全';

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    const rec: StoredMember = {
      ...member,
      id: member?.id ?? newId('m'),
      propertyId: member?.propertyId ?? propertyId,
      name: name.trim(),
      relation: relation.trim() || undefined,
      gender,
      year,
      month: month === '' ? undefined : Number(month),
      day: day === '' ? undefined : Number(day),
      hour: hour === '' ? undefined : Number(hour),
    };
    await db().members.put(rec);
    await saveOccupancy(propertyId, rec.id, roomIds);
    await ensureResidence(rec, property);
    onDone();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[0.8125rem]">
        {(hasRoomStep ? ['是谁', '出生年', '更精确', '住哪间'] : ['是谁', '出生年', '更精确（可跳过）']).map((l, i) => (
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
            {hasRoomStep ? (
              <button type="button" className="btn btn-primary flex-1" onClick={() => setStep(4)}>
                下一步
              </button>
            ) : (
              <button type="button" className="btn btn-primary flex-1" onClick={submit} disabled={saving}>
                {saving ? '保存中…' : editing ? '保存修改' : '完成'}
              </button>
            )}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <p className="rounded-xl border border-rice-line bg-rice-deep/40 p-3 text-[0.8125rem] leading-relaxed text-ink-soft">
            {name || '此人'}睡哪间、平时坐哪里？<b>这一步决定风水的吉凶落到谁身上</b> ——
            卧房的吉凶只影响睡在里面的人，不再摊给全家。可多选，也可以先跳过。
          </p>
          {[
            { title: '卧房、书房、座位', rooms: personalRooms },
            { title: '常待的共用空间（可选）', rooms: sharedRooms },
          ]
            .filter((g) => g.rooms.length > 0)
            .map((g) => (
              <div key={g.title}>
                <p className="label">{g.title}</p>
                <div className="space-y-1.5">
                  {g.rooms.map((r) => {
                    const on = roomIds.includes(r.id);
                    const star = starFor(r.primaryPalace);
                    const others = (r.occupants ?? []).filter((id) => id !== member?.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setRoomIds((cur) => (on ? cur.filter((x) => x !== r.id) : [...cur, r.id]))}
                        className={`flex min-h-[3rem] w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition active:scale-[0.99] ${
                          on ? 'border-cinnabar bg-cinnabar/[0.06]' : 'border-rice-line bg-white'
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[0.75rem] ${
                            on ? 'border-cinnabar bg-cinnabar text-white' : 'border-rice-line'
                          }`}
                        >
                          {on ? '✓' : ''}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.9375rem]">
                            {r.label ?? r.kind}
                            <span className="ml-1.5 text-[0.75rem] text-ink-mute">{PALACE_DIRECTION[r.primaryPalace]}</span>
                          </span>
                          {others.length > 0 && (
                            <span className="block text-[0.6875rem] text-ink-mute">已有 {others.length} 人使用</span>
                          )}
                        </span>
                        {star && (
                          <span
                            className={`tag shrink-0 ${
                              YOU_NIAN_META[star].auspicious
                                ? 'border-jade/40 bg-jade/10 text-jade'
                                : 'border-risk-warn/40 bg-risk-warn/10 text-risk-warn'
                            }`}
                          >
                            于其命「{star}」
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          <div className="flex gap-2">
            <button type="button" className="btn flex-1" onClick={() => setStep(3)}>
              上一步
            </button>
            <button type="button" className="btn btn-primary flex-1" onClick={submit} disabled={saving}>
              {saving ? '保存中…' : editing ? '保存修改' : '完成'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
