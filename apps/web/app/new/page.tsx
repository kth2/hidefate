'use client';

/**
 * 建立房屋 —— 分步向导，一屏一件事。
 *
 * 手机上最忌讳一张长表单：站在屋里、单手操作、随时被打断。
 * 因此拆成 5 步，每步只问一件事，都能返回修改，进度条随时可见。
 * 户型图走「相机优先」：直接调后置摄像头拍，而不是先让人去找文件。
 */

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  COMMERCIAL_TYPES,
  GRID_LAYOUT,
  MOUNTAINS,
  OUTER_PALACES,
  PALACE_DIRECTION,
  PALACE_FAMILY,
  RESIDENTIAL_TYPES,
  analyzeLine,
  periodOfYear,
  requiresFloor,
  requiresStoreys,
  type BuildingType,
  type MissingCorner,
  type PalaceIndex,
  type RoomPlacement,
  type XingShiItem,
} from '@hidefate/core-fengshui';
import { XingShiPicker } from '../../components/mobile/XingShiPicker';
import { AppBar } from '../../components/mobile/ui';
import { RoomEditor } from '../../components/mobile/RoomEditor';
import { DirectionPicker, toSitting, type MeasureEnd } from '../../components/mobile/DirectionPicker';
import { db, newId, type StoredProperty } from '../../lib/db';
import { useProperty } from '../../lib/PropertyContext';

type EntryMode = '九宫格' | '户型图' | '罗盘实测';

const STEPS = ['方式', '基本', '坐向', '房间', '缺角', '外部环境'] as const;

export default function NewPropertyPage() {
  const router = useRouter();
  const { reload, setActive } = useProperty();

  const [step, setStep] = useState(0);
  const [entryMode, setEntryMode] = useState<EntryMode>('九宫格');
  const [name, setName] = useState('');
  const [buildingType, setBuildingType] = useState<BuildingType>('公寓');
  const [floor, setFloor] = useState<number | ''>('');
  const [storeys, setStoreys] = useState<number>(1);
  const [hasBasement, setHasBasement] = useState(false);
  const [moveInYear, setMoveInYear] = useState<number>(new Date().getFullYear());
  const [enableQiMen, setEnableQiMen] = useState(false);

  const [end, setEnd] = useState<MeasureEnd>('向首');
  const [useDegree, setUseDegree] = useState(true);
  const [degree, setDegree] = useState(180);
  const [mountainName, setMountainName] = useState('午');

  const [rooms, setRooms] = useState<RoomPlacement[]>([]);
  const [missing, setMissing] = useState<MissingCorner[]>([]);
  const [xingShi, setXingShi] = useState<XingShiItem[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 用户可量坐山或向首，统一换算成坐山保存。 */
  const sitting: string | number = useMemo(
    () => toSitting(end, useDegree, degree, mountainName),
    [end, useDegree, degree, mountainName],
  );

  const preview = useMemo(() => {
    try {
      return { line: analyzeLine(sitting) };
    } catch {
      return null;
    }
  }, [sitting]);

  function cycleMissing(p: PalaceIndex) {
    setMissing((prev) => {
      const cur = prev.find((m) => m.palace === p)?.severity ?? 0;
      const next = cur === 0 ? 0.5 : cur === 0.5 ? 1 : 0;
      const without = prev.filter((m) => m.palace !== p);
      return next === 0 ? without : [...without, { palace: p, severity: next }];
    });
  }

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError('请填写房屋名称。');
      setStep(1);
      return;
    }
    if (!preview) {
      setError('坐山无法解析，请回上一步检查。');
      setStep(2);
      return;
    }
    if (requiresFloor(buildingType) && floor === '') {
      setError(`${buildingType}须填写楼层。`);
      setStep(1);
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const rec: StoredProperty = {
        id: newId('p'),
        name: name.trim(),
        buildingType,
        floor: floor === '' ? undefined : Number(floor),
        storeys: requiresStoreys(buildingType) ? storeys : undefined,
        hasBasement: requiresStoreys(buildingType) ? hasBasement : undefined,
        sitting,
        moveInYear,
        missingCorners: missing,
        rooms,
        xingShi,
        entryMode,
        enableQiMen,
        note: photo ? '已拍摄户型图' : undefined,
        createdAt: now,
        updatedAt: now,
      };
      await db().properties.put(rec);
      setActive(rec.id);
      reload();
      router.push('/house');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const canNext =
    step === 0 ||
    (step === 1 && name.trim() !== '' && (!requiresFloor(buildingType) || floor !== '')) ||
    step === 2 ||
    step === 3 ||
    step === 4 ||
    step === 5;

  return (
    <>
      <AppBar
        title="建立房屋"
        subtitle={`第 ${step + 1} / ${STEPS.length} 步 · ${STEPS[step]}`}
        back={step === 0 ? '/me' : undefined}
        right={
          step > 0 ? (
            <button type="button" className="btn btn-sm" onClick={() => setStep((s) => s - 1)}>
              上一步
            </button>
          ) : undefined
        }
      />

      {/* 进度条 */}
      <div className="h-1 bg-rice-deep">
        <div
          className="h-full bg-cinnabar transition-all"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <div className="space-y-4 px-4 py-4">
        {error && <p className="rounded-xl border border-cinnabar/40 bg-cinnabar/5 p-3 text-[0.875rem] text-cinnabar">{error}</p>}

        {/* ── 第 1 步：建档方式 ── */}
        {step === 0 && (
          <div className="space-y-3">
            <p className="card-sub px-1">三条路径分析能力完全相同，差别只反映在置信度上。</p>
            {(
              [
                ['九宫格', '不用户型图', '最常用。只要知道大门朝向就能开始 —— 人不在现场也可以。'],
                ['户型图', '拍下户型图', '直接调相机拍平面图，再标房间。宫位划分最贴近实况。'],
                ['罗盘实测', '现场实测度数', '人在屋里，用罗盘读精确度数，兼向与替卦判断最准。'],
              ] as const
            ).map(([mode, title, desc]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setEntryMode(mode)}
                className={`w-full rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
                  entryMode === mode ? 'border-cinnabar bg-cinnabar/[0.06]' : 'border-rice-line bg-white'
                }`}
              >
                <p className="font-serif text-[1.0625rem] font-semibold">{title}</p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-mute">{desc}</p>
              </button>
            ))}

            {entryMode === '户型图' && (
              <div className="card">
                <label className="btn btn-primary btn-block cursor-pointer">
                  {photo ? '重新拍摄' : '打开相机拍摄'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () => setPhoto(String(reader.result));
                      reader.readAsDataURL(f);
                    }}
                  />
                </label>
                <label className="btn btn-block mt-2 cursor-pointer">
                  从相册选择
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () => setPhoto(String(reader.result));
                      reader.readAsDataURL(f);
                    }}
                  />
                </label>
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="户型图" className="mt-3 w-full rounded-xl border border-rice-line" />
                )}
                <p className="card-sub mt-2">照片只存在本机，不会上传。稍后在第 4 步把房间落到九宫上。</p>
              </div>
            )}
          </div>
        )}

        {/* ── 第 2 步：基本资料 ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="label">房屋名称</label>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：晴湾苑 12 楼 A 座" autoFocus />
            </div>

            <div>
              <label className="label">入住 / 落成年（立春为年界）</label>
              <input
                type="number"
                inputMode="numeric"
                className="field text-center font-serif text-2xl"
                value={moveInYear}
                onChange={(e) => setMoveInYear(Number(e.target.value))}
              />
              <p className="mt-1.5 text-[0.8125rem] text-ink-mute">推得元运：{periodOfYear(moveInYear).label}</p>
            </div>

            <div>
              <p className="label">建筑类别（分析规则随之改变）</p>
              <p className="mb-1.5 text-[0.75rem] text-ink-mute">住宅</p>
              <div className="mb-3 grid grid-cols-3 gap-1.5">
                {RESIDENTIAL_TYPES.map((t) => (
                  <TypeBtn key={t} t={t} cur={buildingType} onPick={setBuildingType} />
                ))}
              </div>
              <p className="mb-1.5 text-[0.75rem] text-ink-mute">商业及其他</p>
              <div className="grid grid-cols-3 gap-1.5">
                {COMMERCIAL_TYPES.map((t) => (
                  <TypeBtn key={t} t={t} cur={buildingType} onPick={setBuildingType} />
                ))}
              </div>
            </div>

            {requiresFloor(buildingType) && (
              <div>
                <label className="label">所在楼层（必填）</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="field text-center font-serif text-2xl"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="12"
                />
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-mute">
                  这个单位在第几层。楼层影响楼层五行，并调节山星（人丁）与向星（财禄）的力度。
                </p>
              </div>
            )}

            {requiresStoreys(buildingType) && (
              <div>
                <label className="label">这栋房子共几层？</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setStoreys(n)}
                      className={`min-h-[3rem] rounded-xl border font-serif text-[1.125rem] transition active:scale-[0.97] ${
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
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-mute">
                  双层排屋填 2、三层半独立式填 3。
                  <b className="text-ink-soft">坐向与飞星盘全楼共用</b>，但每层各有一套房间布局 ——
                  下一步可逐层标注。
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── 第 3 步：坐向 ── */}
        {step === 2 && (
          <div className="space-y-4">
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

            <button
              type="button"
              className={`w-full rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
                enableQiMen ? 'border-gold bg-gold/[0.07]' : 'border-rice-line bg-white'
              }`}
              onClick={() => setEnableQiMen((v) => !v)}
            >
              <p className="font-serif text-[1rem] font-semibold">
                山向奇门层 {enableQiMen ? '已开启' : '（可选）'}
              </p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-mute">
                以坐山定局，把八门、九星、八神叠到同一张九宫上，作为飞星与八宅之外的第三重印证。
                引擎约 416 KB，开启时才下载，随时可关。
              </p>
            </button>
          </div>
        )}

        {/* ── 第 4 步：房间 ── */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="card-sub px-1">
              至少标 <b>大门</b>。标得越全预测越准，但现在标不完也没关系 ——
              建好后随时可在「我的 → 房间管理」里补。
            </p>
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="户型图" className="w-full rounded-xl border border-rice-line" />
            )}
            <RoomEditor
              profile={{ buildingType, storeys, hasBasement }}
              rooms={rooms}
              onChange={setRooms}
              newId={newId}
            />
          </div>
        )}

        {/* ── 第 5 步：缺角 ── */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="card-sub px-1">
              连点切换：完整 → 缺一半 → 几乎全缺。缺三分之一以上才作正式缺角论，
              且<b>不会因该宫飞星吉而被抵销</b>。没有缺角就直接完成。
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {GRID_LAYOUT.map((p) => {
                const sev = missing.find((m) => m.palace === p)?.severity ?? 0;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => cycleMissing(p)}
                    className="gong flex flex-col items-center justify-center rounded-xl border border-rice-line text-[0.8125rem] transition active:scale-[0.97]"
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
          </div>
        )}

        {/* ── 第 6 步：外部环境（峦头）── */}
        {step === 5 && (
          <div className="space-y-4">
            <p className="card-sub px-1">
              <b>「峦头为体，理气为用。」</b>
              门前有没有路冲、背后有没有靠、前方开不开阔 —— 这些比盘上的星更先决定吉凶。
              可以跳过，但下面会告诉你跳过的代价。
            </p>
            <XingShiPicker items={xingShi} onChange={setXingShi} />
          </div>
        )}
      </div>

      {/* 底部主操作：固定在 tab bar 之上，拇指可及 */}
      <div
        className="fixed inset-x-0 z-30 border-t border-rice-line bg-rice/95 px-4 py-3 backdrop-blur"
        style={{ bottom: 'calc(3.75rem + var(--safe-bottom))' }}
      >
        <div className="mx-auto max-w-lg">
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary btn-block" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              下一步
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-block" disabled={saving} onClick={save}>
              {saving ? '建立中…' : '完成，开始分析'}
            </button>
          )}
        </div>
      </div>
      {/* 为固定操作条留位 */}
      <div className="h-20" />
    </>
  );
}

function TypeBtn({ t, cur, onPick }: { t: BuildingType; cur: BuildingType; onPick: (t: BuildingType) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(t)}
      className={`min-h-[2.75rem] rounded-lg border px-1 text-[0.8125rem] leading-tight transition active:scale-[0.97] ${
        cur === t ? 'border-cinnabar bg-cinnabar text-white' : 'border-rice-line bg-white'
      }`}
    >
      {t}
    </button>
  );
}
