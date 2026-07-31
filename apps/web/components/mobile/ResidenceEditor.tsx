'use client';

/**
 * 居住史编辑器。
 *
 * 关键在 `fidelity`：老宅资料残缺是常态，用户不会记得二十年前那间屋的坐向。
 * 所以这里**明说每一档能换来什么**，而不是逼人填一个他不知道的数字 ——
 * 「只记得入住年」也是合法答案，只是那一段不参与学习，界面照实讲。
 */

import { useState } from 'react';
import {
  FIDELITY_CAPABILITY,
  validateResidenceHistory,
  type ResidenceFidelity,
  type ResidencePeriod,
  type ResidenceRole,
} from '@hidefate/core-synthesis';
import { newId, type StoredProperty } from '../../lib/db';

const FIDELITIES: ResidenceFidelity[] = ['罗盘实测', '大致朝向', '仅入住年', '无资料'];
const ROLES: ResidenceRole[] = ['居家', '办公', '兼'];

export function ResidenceEditor({
  personId,
  properties,
  value,
  onChange,
}: {
  personId: string;
  properties: StoredProperty[];
  value: ResidencePeriod[];
  onChange: (next: ResidencePeriod[]) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Partial<ResidencePeriod>>({
    role: '居家',
    fidelity: '大致朝向',
  });

  const issues = validateResidenceHistory(value);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  function add() {
    if (draft.fromYear == null) return;
    const next: ResidencePeriod = {
      id: newId('res'),
      personId,
      propertyId: draft.propertyId ?? '',
      fromYear: draft.fromYear,
      toYear: draft.toYear ?? null,
      role: draft.role ?? '居家',
      fidelity: draft.fidelity ?? '大致朝向',
    };
    void onChange([...value, next].sort((a, b) => a.fromYear - b.fromYear));
    setDraft({ role: '居家', fidelity: '大致朝向' });
  }

  const cap = FIDELITY_CAPABILITY[draft.fidelity ?? '大致朝向'];

  return (
    <div className="space-y-4 pb-2">
      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((r) => {
            const c = FIDELITY_CAPABILITY[r.fidelity];
            const prop = properties.find((p) => p.id === r.propertyId);
            return (
              <li key={r.id} className="flex items-start gap-3 rounded-xl border border-rice-line bg-white p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.875rem]">
                    {r.fromYear}–{r.toYear ?? '今'} · {r.role}
                    {prop ? ` · ${prop.name}` : ''}
                  </p>
                  <p className={`mt-0.5 text-[0.6875rem] ${c.learnable ? 'text-ink-mute' : 'text-cinnabar'}`}>
                    {r.fidelity} —— {c.learnable ? `可作证据（权重 ${c.weight}）` : '不作证据'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onChange(value.filter((x) => x.id !== r.id))}
                  className="shrink-0 px-2 py-1 text-[0.75rem] text-ink-mute active:opacity-60"
                >
                  删除
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {errors.map((e) => (
        <p key={e.message} className="rounded-lg border border-cinnabar/40 bg-cinnabar/5 p-2.5 text-[0.75rem] leading-relaxed text-cinnabar">
          {e.message}
        </p>
      ))}
      {warnings.map((w) => (
        <p key={w.message} className="rounded-lg border border-gold/40 bg-gold/5 p-2.5 text-[0.75rem] leading-relaxed">
          {w.message}
        </p>
      ))}

      <div className="space-y-3 rounded-xl border border-rice-line bg-rice-deep/30 p-3">
        <p className="text-[0.8125rem] font-medium">加一段</p>

        <div className="flex gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-[0.6875rem] text-ink-mute">从（年）</span>
            <input
              type="number"
              inputMode="numeric"
              value={draft.fromYear ?? ''}
              onChange={(e) => setDraft({ ...draft, fromYear: Number(e.target.value) || undefined })}
              className="w-full rounded-lg border border-rice-line bg-white px-3 py-2.5 text-[1rem]"
              placeholder="2005"
            />
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-[0.6875rem] text-ink-mute">到（留空＝至今）</span>
            <input
              type="number"
              inputMode="numeric"
              value={draft.toYear ?? ''}
              onChange={(e) => setDraft({ ...draft, toYear: Number(e.target.value) || undefined })}
              className="w-full rounded-lg border border-rice-line bg-white px-3 py-2.5 text-[1rem]"
              placeholder="2012"
            />
          </label>
        </div>

        <div>
          <span className="mb-1 block text-[0.6875rem] text-ink-mute">用途</span>
          <div className="flex gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDraft({ ...draft, role: r })}
                className={`min-h-11 flex-1 rounded-lg border text-[0.8125rem] active:opacity-60 ${
                  (draft.role ?? '居家') === r
                    ? 'border-cinnabar bg-cinnabar/10 text-cinnabar'
                    : 'border-rice-line bg-white text-ink-mute'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {properties.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-[0.6875rem] text-ink-mute">对应哪处房屋（可留空）</span>
            <select
              value={draft.propertyId ?? ''}
              onChange={(e) => setDraft({ ...draft, propertyId: e.target.value })}
              className="w-full rounded-lg border border-rice-line bg-white px-3 py-2.5 text-[1rem]"
            >
              <option value="">未建档</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div>
          <span className="mb-1 block text-[0.6875rem] text-ink-mute">这段房子的资料记得多少</span>
          <div className="grid grid-cols-2 gap-2">
            {FIDELITIES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setDraft({ ...draft, fidelity: f })}
                className={`min-h-11 rounded-lg border text-[0.8125rem] active:opacity-60 ${
                  (draft.fidelity ?? '大致朝向') === f
                    ? 'border-cinnabar bg-cinnabar/10 text-cinnabar'
                    : 'border-rice-line bg-white text-ink-mute'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-mute">{cap.note}</p>
        </div>

        <button
          type="button"
          onClick={add}
          disabled={draft.fromYear == null}
          className="btn btn-primary btn-block"
        >
          加入
        </button>
      </div>

      <p className="text-[0.75rem] leading-relaxed text-ink-mute">
        记不清的年份不必勉强填 —— 空着的年份系统会明说「无居住记录、风水层置零」，
        绝不会拿最近一间房去顶替。
      </p>
    </div>
  );
}
