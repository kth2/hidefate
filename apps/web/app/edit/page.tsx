'use client';

/**
 * 房屋设置 —— 建档之后修改坐向、元运、楼层、缺角。
 *
 * 之前建完就定死了：量错了一次，就只能删掉重建，成员与化解记录一并丢失。
 * 坐向是整套理气的根，量错重来是常事，必须可改。
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  COMMERCIAL_TYPES,
  GRID_LAYOUT,
  PALACE_DIRECTION,
  PALACE_FAMILY,
  RESIDENTIAL_TYPES,
  analyzeLine,
  degreeToMountain,
  facingOf,
  periodOfYear,
  requiresFloor,
  requiresStoreys,
  resolveMountain,
  type BuildingType,
  type MissingCorner,
  type PalaceIndex,
  type XingShiItem,
} from '@hidefate/core-fengshui';
import { AppBar, Empty, Expandable, Skeleton } from '../../components/mobile/ui';
import { XingShiPicker } from '../../components/mobile/XingShiPicker';
import { DirectionPicker, toSitting, type MeasureEnd } from '../../components/mobile/DirectionPicker';
import { useProperty } from '../../lib/PropertyContext';
import { db } from '../../lib/db';

export default function EditPage() {
  const router = useRouter();
  const { property, loading, reload } = useProperty();

  const [name, setName] = useState('');
  const [buildingType, setBuildingType] = useState<BuildingType>('公寓');
  const [floor, setFloor] = useState<number | ''>('');
  const [storeys, setStoreys] = useState(1);
  const [hasBasement, setHasBasement] = useState(false);
  const [moveInYear, setMoveInYear] = useState(2025);
  const [end, setEnd] = useState<MeasureEnd>('坐山');
  const [useDegree, setUseDegree] = useState(true);
  const [degree, setDegree] = useState(0);
  const [mountainName, setMountainName] = useState('子');
  const [missing, setMissing] = useState<MissingCorner[]>([]);
  const [xingShi, setXingShi] = useState<XingShiItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 载入现有设置
  useEffect(() => {
    if (!property) return;
    setName(property.name);
    setBuildingType(property.buildingType);
    setFloor(property.floor ?? '');
    setStoreys(property.storeys ?? 1);
    setHasBasement(Boolean(property.hasBasement));
    setMoveInYear(property.moveInYear);
    setMissing([...property.missingCorners]);
    setXingShi([...(property.xingShi ?? [])]);
    // 现有坐向一律以「坐山」呈现，用户可自行切到向首再改
    setEnd('坐山');
    try {
      const r = resolveMountain(property.sitting);
      setUseDegree(r.hasDegree);
      setDegree(r.degree);
      setMountainName(r.mountain.name);
    } catch {
      /* 数据异常时保留默认值 */
    }
  }, [property?.id]);

  const nextSitting = useMemo(
    () => toSitting(end, useDegree, degree, mountainName),
    [end, useDegree, degree, mountainName],
  );

  const changed = useMemo(() => {
    if (!property) return false;
    return (
      name !== property.name ||
      buildingType !== property.buildingType ||
      (floor === '' ? undefined : Number(floor)) !== property.floor ||
      (requiresStoreys(buildingType) ? storeys : undefined) !== property.storeys ||
      Boolean(hasBasement) !== Boolean(property.hasBasement) ||
      moveInYear !== property.moveInYear ||
      String(nextSitting) !== String(property.sitting) ||
      JSON.stringify(missing) !== JSON.stringify(property.missingCorners) ||
      JSON.stringify(xingShi) !== JSON.stringify(property.xingShi ?? [])
    );
  }, [property, name, buildingType, floor, storeys, hasBasement, moveInYear, nextSitting, missing, xingShi]);

  /** 坐向若改动，整盘会重排 —— 必须让用户看到差别再决定。 */
  const shift = useMemo(() => {
    if (!property) return null;
    try {
      const before = resolveMountain(property.sitting);
      const after = resolveMountain(nextSitting);
      if (before.mountain.name === after.mountain.name && Math.abs(before.degree - after.degree) < 0.05) return null;
      return {
        before: `坐${before.mountain.name}向${facingOf(property.sitting).mountain.name}`,
        after: `坐${after.mountain.name}向${facingOf(nextSitting).mountain.name}`,
        gradeBefore: analyzeLine(property.sitting).grade,
        gradeAfter: analyzeLine(nextSitting).grade,
      };
    } catch {
      return null;
    }
  }, [property, nextSitting]);

  function cycleMissing(p: PalaceIndex) {
    setMissing((prev) => {
      const cur = prev.find((m) => m.palace === p)?.severity ?? 0;
      const next = cur === 0 ? 0.5 : cur === 0.5 ? 1 : 0;
      const without = prev.filter((m) => m.palace !== p);
      return next === 0 ? without : [...without, { palace: p, severity: next }];
    });
  }

  async function save() {
    if (!property) return;
    setSaving(true);
    await db().properties.update(property.id, {
      name: name.trim() || property.name,
      buildingType,
      floor: floor === '' ? undefined : Number(floor),
      storeys: requiresStoreys(buildingType) ? storeys : undefined,
      hasBasement: requiresStoreys(buildingType) ? hasBasement : undefined,
      moveInYear,
      sitting: nextSitting,
      missingCorners: missing,
      xingShi,
      updatedAt: new Date().toISOString(),
    });
    reload();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) {
    return (
      <>
        <AppBar title="房屋设置" back="/me" />
        <div className="px-4 py-4">
          <Skeleton lines={5} />
        </div>
      </>
    );
  }

  if (!property) {
    return (
      <>
        <AppBar title="房屋设置" back="/me" />
        <div className="px-4 py-4">
          <Empty
            title="还没有房屋"
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
      <AppBar title="房屋设置" subtitle={property.name} back="/me" />

      <div className="space-y-4 px-4 py-4">
        {saved && (
          <p className="rounded-xl border border-jade/30 bg-jade/5 p-3 text-[0.875rem] text-jade">
            已保存。飞星盘、八宅盘与全部预测已按新坐向重排。
          </p>
        )}

        <section className="card space-y-3">
          <h2 className="card-title">基本</h2>
          <div>
            <label className="label">房屋名称</label>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">入住 / 落成年（决定元运）</label>
            <input
              type="number"
              inputMode="numeric"
              className="field text-center font-serif text-xl"
              value={moveInYear}
              onChange={(e) => setMoveInYear(Number(e.target.value))}
            />
            <p className="mt-1 text-[0.8125rem] text-ink-mute">{periodOfYear(moveInYear).label}</p>
          </div>
        </section>

        <Expandable title="建筑类别与楼层">
          <p className="mb-2 text-[0.75rem] text-ink-mute">住宅</p>
          <div className="mb-3 grid grid-cols-3 gap-1.5">
            {RESIDENTIAL_TYPES.map((t) => (
              <TypeBtn key={t} t={t} cur={buildingType} onPick={setBuildingType} />
            ))}
          </div>
          <p className="mb-2 text-[0.75rem] text-ink-mute">商业及其他</p>
          <div className="grid grid-cols-3 gap-1.5">
            {COMMERCIAL_TYPES.map((t) => (
              <TypeBtn key={t} t={t} cur={buildingType} onPick={setBuildingType} />
            ))}
          </div>

          {requiresFloor(buildingType) && (
            <div className="mt-3">
              <label className="label">所在楼层</label>
              <input
                type="number"
                inputMode="numeric"
                className="field text-center"
                value={floor}
                onChange={(e) => setFloor(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
          )}

          {requiresStoreys(buildingType) && (
            <div className="mt-3">
              <label className="label">共几层</label>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStoreys(n)}
                    className={`min-h-[2.75rem] rounded-xl border font-serif ${
                      storeys === n ? 'border-cinnabar bg-cinnabar text-white' : 'border-rice-line bg-white'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setHasBasement((v) => !v)}
                className={`btn btn-block mt-2 ${hasBasement ? 'btn-primary' : ''}`}
              >
                {hasBasement ? '✓ 含地下室' : '含地下室？'}
              </button>
            </div>
          )}
        </Expandable>

        <section className="card">
          <h2 className="card-title">坐向</h2>
          <p className="card-sub mb-3">
            坐向是整套理气的根。量错一次很常见，改了这里，飞星盘与八宅盘会整个重排。
          </p>
          <DirectionPicker
            end={end}
            onEndChange={setEnd}
            degree={degree}
            onDegreeChange={setDegree}
            useDegree={useDegree}
            onUseDegreeChange={setUseDegree}
            mountainName={mountainName}
            onMountainChange={setMountainName}
            moveInYear={moveInYear}
          />
        </section>

        {shift && (
          <section className="card border-gold/40 bg-gold/[0.05]">
            <h2 className="card-title text-gold">坐向将会改变</h2>
            <p className="text-[0.9375rem] leading-relaxed">
              <b>{shift.before}</b>（{shift.gradeBefore}） → <b>{shift.after}</b>（{shift.gradeAfter}）
            </p>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">
              保存后全盘重排：山盘、向盘、八宅四吉四凶方、全部预测与化解清单都会跟着变。
              房间与成员资料不受影响。
            </p>
          </section>
        )}

        <section className="card">
          <h2 className="card-title">外部环境（峦头）</h2>
          <p className="card-sub mb-3">
            「峦头为体，理气为用；峦头差，理气无用。」这一步决定峦头以 45%（居家）／35%（商业）
            还是仅 15% 的权重参与判断。
          </p>
          <XingShiPicker items={xingShi} onChange={setXingShi} />
        </section>

        <Expandable title={`缺角（已标 ${missing.length} 处）`}>
          <p className="mb-3 text-[0.8125rem] leading-relaxed text-ink-mute">
            连点切换：完整 → 缺一半 → 几乎全缺。
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {GRID_LAYOUT.map((p) => {
              const sev = missing.find((m) => m.palace === p)?.severity ?? 0;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => cycleMissing(p)}
                  className="gong flex flex-col items-center justify-center rounded-xl border border-rice-line text-[0.8125rem]"
                  style={{
                    background: sev >= 1 ? 'rgba(183,28,28,0.16)' : sev > 0 ? 'rgba(216,67,21,0.11)' : 'white',
                  }}
                >
                  <span className="font-medium">{PALACE_DIRECTION[p]}</span>
                  <span className="mt-1 text-[0.6875rem] text-ink-mute">
                    {sev === 0 ? '完整' : sev >= 1 ? '几乎全缺' : '缺一半'}
                  </span>
                  {p !== 5 && <span className="mt-0.5 text-[0.625rem] text-ink-mute/70">{PALACE_FAMILY[p].member}</span>}
                </button>
              );
            })}
          </div>
        </Expandable>

        <button type="button" className="btn btn-block text-cinnabar" onClick={() => router.push('/rooms')}>
          去修改房间布局 →
        </button>
      </div>

      {changed && (
        <>
          <div
            className="fixed inset-x-0 z-30 border-t border-rice-line bg-rice/95 px-4 py-3 backdrop-blur"
            style={{ bottom: 'calc(3.75rem + var(--safe-bottom))' }}
          >
            <div className="mx-auto max-w-lg">
              <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={saving}>
                {saving ? '保存中…' : '保存修改'}
              </button>
            </div>
          </div>
          <div className="h-20" />
        </>
      )}
    </>
  );
}

function TypeBtn({ t, cur, onPick }: { t: BuildingType; cur: BuildingType; onPick: (t: BuildingType) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(t)}
      className={`min-h-[2.75rem] rounded-lg border px-1 text-[0.8125rem] leading-tight ${
        cur === t ? 'border-cinnabar bg-cinnabar text-white' : 'border-rice-line bg-white'
      }`}
    >
      {t}
    </button>
  );
}
