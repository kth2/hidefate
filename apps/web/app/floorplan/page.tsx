'use client';

/**
 * 户型图叠盘 —— 把二十四山、分宫线与飞星直接画在户型图上。
 *
 * 用户只需做两件事：上传图纸，然后点一下图上哪一边是「向」（或图上方是哪个方向）。
 * 坐向度数取自房屋资料，图的旋转由此算出，不必手动转图。
 * 之后可描外墙（太极点随之取重心、可得缺角初判）、在图上点房间 —— 房间落哪一宫由几何算出，
 * 取代原来的「手动把房间填进九宫」。
 *
 * 纪律：
 *   - 只做几何，不改任何排盘规则；分宫法照门派设置。
 *   - 缺角只给初判，套用前由用户确认。
 *   - 图纸未必按比例（尤其 AI 生成或手绘的），页面照实提示。
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  PALACE_DIRECTION,
  ROOM_CATEGORIES,
  RADIAL_CENTER_RATIO,
  analyzeLine,
  bearingFromTaiji,
  bearingToImageAngle,
  boundingBox,
  floorLevelsOf,
  gridCells,
  imageAngleToBearing,
  nearestEdgeAngle,
  northFromFacing,
  degreeToMountain,
  norm360,
  palaceAtPoint,
  polygonCentroid,
  rectPolygon,
  resolveMountain,
  roomKindsByCategory,
  suggestMissingCorners,
  type MissingCorner,
  type PalaceDivision,
  type PalaceIndex,
  type PlanGeometry,
  type PlanPoint,
  type RoomKind,
  type RoomPlacement,
} from '@hidefate/core-fengshui';
import { AppBar, Empty, Expandable, SegRow, Sheet, Skeleton } from '../../components/mobile/ui';
import { db, newId, type StoredPlan } from '../../lib/db';
import { downscaleImage } from '../../lib/image';
import { useProperty } from '../../lib/PropertyContext';
import { useSchool } from '../../lib/schoolStore';

type Mode = '看盘' | '外墙' | '太极' | '房间';

const EDGES: readonly { angle: 0 | 90 | 180 | 270; label: string }[] = [
  { angle: 0, label: '上' },
  { angle: 90, label: '右' },
  { angle: 180, label: '下' },
  { angle: 270, label: '左' },
];

/** 图上方是哪个方向 → 北在图上的角度。 */
const TOP_IS: readonly { label: string; north: number }[] = [
  { label: '北', north: 0 },
  { label: '东', north: 270 },
  { label: '南', north: 180 },
  { label: '西', north: 90 },
];

const MODE_HINT: Record<Mode, string> = {
  看盘: '双指可放大。红线为向首，金线为八卦分界，细线为二十四山分界。',
  外墙: '沿外墙依次点各个转角，至少三点。院子算不算宅内，由你决定：圈进来就算。',
  太极: '点一下设太极点。默认取外墙几何重心。',
  房间: '点房间所在位置，选类别即可；落哪一宫由图上位置算出。',
};

const MOUNTAIN_CENTERS = Array.from({ length: 24 }, (_, i) => i * 15);

/** 宫位在放射法下的标注方位（宫的中线）。 */
const PALACE_BEARING: Record<Exclude<PalaceIndex, 5>, number> = { 1: 0, 8: 45, 3: 90, 4: 135, 9: 180, 2: 225, 7: 270, 6: 315 };

/** 自 c 沿图上角度射出，与矩形 [x0,x1]×[y0,y1] 的交点（c 须在矩形内）。 */
function rayToRect(c: PlanPoint, imageAng: number, x0: number, y0: number, x1: number, y1: number): PlanPoint {
  const rad = (imageAng * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const ts: number[] = [];
  if (dx > 1e-9) ts.push((x1 - c[0]) / dx);
  if (dx < -1e-9) ts.push((x0 - c[0]) / dx);
  if (dy > 1e-9) ts.push((y1 - c[1]) / dy);
  if (dy < -1e-9) ts.push((y0 - c[1]) / dy);
  const t = Math.max(0, Math.min(...ts));
  return [c[0] + dx * t, c[1] + dy * t];
}

function polar(c: PlanPoint, imageAng: number, r: number): PlanPoint {
  const rad = (imageAng * Math.PI) / 180;
  return [c[0] + Math.sin(rad) * r, c[1] - Math.cos(rad) * r];
}

export default function FloorPlanPage() {
  const { property, result, loading, reload } = useProperty();
  const [school, setSchool] = useSchool();
  const [plan, setPlan] = useState<StoredPlan | null>(null);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>('看盘');
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [pending, setPending] = useState<PlanPoint | null>(null);
  const [roomLabel, setRoomLabel] = useState('');
  const [floorLevel, setFloorLevel] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  /** 刚从资料库载入（或刚整张写入）的那一次不必再存。 */
  const firstSave = useRef(true);

  // 载入本房屋的户型图
  useEffect(() => {
    if (!property) return;
    let alive = true;
    setPlanLoaded(false);
    db()
      .plans.get(property.id)
      .then((p) => {
        if (!alive) return;
        firstSave.current = true;
        setPlan(p ?? null);
        setPlanLoaded(true);
      })
      .catch(() => alive && setPlanLoaded(true));
    return () => {
      alive = false;
    };
  }, [property?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 改动即存（防抖），手机上不必记得按保存
  useEffect(() => {
    if (!plan) return;
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      db().plans.put(plan).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, 400);
    return () => window.clearTimeout(t);
  }, [plan]);

  const updatePlan = useCallback((patch: Partial<StoredPlan>) => {
    setPlan((cur) => (cur ? { ...cur, ...patch, updatedAt: new Date().toISOString() } : cur));
  }, []);

  const levels = useMemo(() => (property ? floorLevelsOf(property) : []), [property]);
  useEffect(() => {
    if (levels.length > 1 && floorLevel == null) setFloorLevel(levels[0]!.level);
  }, [levels, floorLevel]);

  const sitting = useMemo(() => {
    if (!property) return null;
    try {
      return resolveMountain(property.sitting);
    } catch {
      return null;
    }
  }, [property]);
  const sittingDeg = sitting?.degree ?? 0;
  const facingDeg = norm360(sittingDeg + 180);

  const polygon: PlanPoint[] = useMemo(() => {
    if (!plan) return [];
    return plan.polygon.length >= 3 ? plan.polygon : rectPolygon(plan.width, plan.height);
  }, [plan]);
  const geometry: PlanGeometry | null = useMemo(() => {
    if (!plan || polygon.length === 0) return null;
    return {
      polygon,
      taiji: plan.taiji ?? polygonCentroid(polygon),
      northImageAngle: plan.northImageAngle,
      sittingDegree: sittingDeg,
    };
  }, [plan, polygon, sittingDeg]);
  const division: PalaceDivision = school.palaceDivision;

  const cells = useMemo(() => (geometry ? gridCells(geometry) : []), [geometry]);
  const missing = useMemo(() => (geometry && plan && plan.polygon.length >= 3 ? suggestMissingCorners(geometry) : []), [geometry, plan]);
  const line = useMemo(() => (sitting ? analyzeLine(sittingDeg, school.jianThreshold) : null), [sitting, sittingDeg, school.jianThreshold]);

  const rooms = property?.rooms ?? [];
  const pinned = useMemo(() => {
    if (!plan || !geometry) return [];
    return plan.pins
      .map((pin) => {
        const room = rooms.find((r) => r.id === pin.roomId);
        if (!room) return null;
        const palace = palaceAtPoint([pin.x, pin.y], geometry, division);
        return { pin, room, palace, changed: room.primaryPalace !== palace || room.palaces.length !== 1 };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [plan, geometry, rooms, division]);
  const changedCount = pinned.filter((p) => p.changed).length;
  const unpinnedRooms = rooms.filter((r) => !plan?.pins.some((p) => p.roomId === r.id));

  async function onPickFile(file: File | undefined) {
    if (!file || !property) return;
    setBusy(true);
    setError(null);
    try {
      const img = await downscaleImage(file);
      // 默认假设「向」在图下方（多数平面图如此），用户随后一键改
      const next: StoredPlan = {
        propertyId: property.id,
        image: img.dataUrl,
        width: img.width,
        height: img.height,
        polygon: [],
        northImageAngle: northFromFacing(facingDeg, 180),
        pins: plan?.width === img.width && plan?.height === img.height ? plan.pins : [],
        updatedAt: new Date().toISOString(),
      };
      await db().plans.put(next);
      firstSave.current = true;
      setPlan(next);
      setMode('看盘');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function toImagePoint(e: MouseEvent<SVGSVGElement>): PlanPoint | null {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return [Math.round(pt.x * 10) / 10, Math.round(pt.y * 10) / 10];
  }

  function onTap(e: MouseEvent<SVGSVGElement>) {
    if (!plan) return;
    const p = toImagePoint(e);
    if (!p) return;
    const clamped: [number, number] = [Math.min(plan.width, Math.max(0, p[0])), Math.min(plan.height, Math.max(0, p[1]))];
    if (mode === '外墙') setDraft((d) => [...d, clamped]);
    else if (mode === '太极') updatePlan({ taiji: clamped });
    else if (mode === '房间') {
      setRoomLabel('');
      setPending(clamped);
    }
  }

  function finishOutline() {
    if (draft.length < 3) return;
    updatePlan({ polygon: draft, taiji: undefined });
    setDraft([]);
    setMode('看盘');
  }

  async function saveRooms(next: RoomPlacement[]) {
    if (!property) return;
    await db().properties.update(property.id, { rooms: next, updatedAt: new Date().toISOString() });
    reload();
  }

  async function addRoom(kind: RoomKind) {
    if (!pending || !geometry || !plan) return;
    const palace = palaceAtPoint(pending, geometry, division);
    const room: RoomPlacement = {
      id: newId('r'),
      kind,
      ...(roomLabel.trim() ? { label: roomLabel.trim() } : {}),
      palaces: [palace],
      primaryPalace: palace,
      ...(levels.length > 1 && floorLevel != null ? { floorLevel } : {}),
    };
    await saveRooms([...rooms, room]);
    updatePlan({ pins: [...plan.pins, { roomId: room.id, x: pending[0], y: pending[1] }] });
    setPending(null);
  }

  async function pinExisting(room: RoomPlacement) {
    if (!pending || !geometry || !plan) return;
    const palace = palaceAtPoint(pending, geometry, division);
    await saveRooms(rooms.map((r) => (r.id === room.id ? { ...r, palaces: [palace], primaryPalace: palace } : r)));
    updatePlan({ pins: [...plan.pins, { roomId: room.id, x: pending[0], y: pending[1] }] });
    setPending(null);
  }

  async function removePinnedRoom(roomId: string) {
    if (!plan) return;
    if (!window.confirm('删除这个房间？（同时移出房屋资料）')) return;
    await saveRooms(rooms.filter((r) => r.id !== roomId));
    updatePlan({ pins: plan.pins.filter((p) => p.roomId !== roomId) });
  }

  async function syncPalaces() {
    const byId = new Map(pinned.map((p) => [p.room.id, p.palace]));
    await saveRooms(rooms.map((r) => (byId.has(r.id) ? { ...r, palaces: [byId.get(r.id)!], primaryPalace: byId.get(r.id)! } : r)));
    setNotice(`已按图上位置更新 ${changedCount} 个房间的宫位。`);
  }

  async function applyMissing() {
    if (!property) return;
    const next: MissingCorner[] = missing.map((m) => ({ palace: m.palace, severity: m.severity }));
    await db().properties.update(property.id, { missingCorners: next, updatedAt: new Date().toISOString() });
    reload();
    setNotice(next.length ? `缺角已更新为：${next.map((m) => `${PALACE_DIRECTION[m.palace]}${m.severity >= 1 ? '几乎全缺' : '缺一半'}`).join('、')}。` : '已清除缺角。');
  }

  async function deletePlan() {
    if (!property || !window.confirm('删除这张户型图？房间资料保留。')) return;
    await db().plans.delete(property.id);
    setPlan(null);
    firstSave.current = true;
  }

  if (loading) {
    return (
      <>
        <AppBar title="户型图叠盘" back />
        <div className="px-4 py-4">
          <Skeleton lines={5} />
        </div>
      </>
    );
  }

  if (!property) {
    return (
      <>
        <AppBar title="户型图叠盘" back="/" />
        <div className="px-4 py-4">
          <Empty
            title="先建一处房屋"
            desc="叠盘要用房屋的坐向度数。建好后回到这里上传户型图。"
            action={
              <Link href="/new" className="btn btn-primary btn-block">
                ＋ 新房屋
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const W = plan?.width ?? 0;
  const H = plan?.height ?? 0;
  const u = Math.max(W, H) / 100;
  const minSide = Math.min(W, H);
  const pad = 7 * u;
  const taiji = geometry?.taiji ?? ([W / 2, H / 2] as PlanPoint);
  const north = plan?.northImageAngle ?? 0;
  const facingImg = bearingToImageAngle(facingDeg, north);
  const sittingImg = bearingToImageAngle(sittingDeg, north);
  const rayLen = Math.hypot(W, H);
  const facingEdge = nearestEdgeAngle(facingImg);
  const fineOffset = Math.round(((((facingImg - facingEdge + 540) % 360) - 180) * 10)) / 10;
  const topBearing = imageAngleToBearing(0, north);
  const box = geometry ? boundingBox(geometry.polygon) : null;
  const chart = result?.flyingStar ?? null;
  const period = chart?.period.period;

  const starAnchor = (p: PalaceIndex): PlanPoint => {
    if (division === '九宫井字') return cells.find((c) => c.palace === p)?.center ?? taiji;
    if (p === 5) return taiji;
    return polar(taiji, bearingToImageAngle(PALACE_BEARING[p], north), minSide * 0.27);
  };

  return (
    <>
      <AppBar title="户型图叠盘" subtitle={property.name} back="/house" />

      <div className="space-y-4 px-4 py-4 pb-tab">
        {error && <p className="rounded-xl border border-cinnabar/40 bg-cinnabar/5 p-3 text-[0.875rem] text-cinnabar">{error}</p>}
        {notice && (
          <p className="rounded-xl border border-jade/40 bg-jade/5 p-3 text-[0.875rem] text-jade" onClick={() => setNotice(null)}>
            {notice}
          </p>
        )}

        {!planLoaded && <Skeleton lines={4} />}

        {planLoaded && !plan && (
          <section className="card space-y-3">
            <p className="font-serif text-[1.0625rem] font-semibold">上传户型图</p>
            <p className="text-[0.8125rem] leading-relaxed text-ink-mute">
              售楼图、拍下的图纸、手绘都可以。图只存在本机，不会上传。上传后点一下「向」在图的哪一边，二十四山就会叠上去。
            </p>
            <FilePick busy={busy} onPick={onPickFile} />
          </section>
        )}

        {plan && (
          <>
            <section className="card space-y-2 p-2">
              <svg
                ref={svgRef}
                viewBox={`${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}`}
                className={`block w-full select-none rounded-xl bg-white ${mode === '看盘' ? '' : 'cursor-crosshair'}`}
                onClick={onTap}
                role="img"
                aria-label="户型图与二十四山叠图"
              >
                <image href={plan.image} x={0} y={0} width={W} height={H} />

                {/* 二十四山分界（细）与八卦分界（粗） */}
                {MOUNTAIN_CENTERS.map((c) => {
                  const b = c + 7.5;
                  const isGua = (b - 22.5) % 45 === 0;
                  const end = polar(taiji, bearingToImageAngle(b, north), rayLen);
                  if (division === '九宫井字' && isGua) return null;
                  return (
                    <line
                      key={b}
                      x1={taiji[0]}
                      y1={taiji[1]}
                      x2={end[0]}
                      y2={end[1]}
                      stroke={isGua ? '#b8913a' : '#8b817a'}
                      strokeOpacity={isGua ? 0.85 : 0.45}
                      strokeWidth={isGua ? 0.45 * u : 0.18 * u}
                      strokeDasharray={isGua ? undefined : `${u} ${u}`}
                    />
                  );
                })}

                {/* 井字格 */}
                {division === '九宫井字' && box && (
                  <g stroke="#b8913a" strokeWidth={0.45 * u} strokeOpacity={0.9} fill="none">
                    <rect x={box.minX} y={box.minY} width={box.maxX - box.minX} height={box.maxY - box.minY} />
                    {[1, 2].map((k) => (
                      <g key={k}>
                        <line x1={box.minX + ((box.maxX - box.minX) * k) / 3} y1={box.minY} x2={box.minX + ((box.maxX - box.minX) * k) / 3} y2={box.maxY} />
                        <line x1={box.minX} y1={box.minY + ((box.maxY - box.minY) * k) / 3} x2={box.maxX} y2={box.minY + ((box.maxY - box.minY) * k) / 3} />
                      </g>
                    ))}
                  </g>
                )}
                {division !== '九宫井字' && box && (
                  <circle
                    cx={taiji[0]}
                    cy={taiji[1]}
                    r={Math.min(box.maxX - box.minX, box.maxY - box.minY) * RADIAL_CENTER_RATIO}
                    fill="none"
                    stroke="#b8913a"
                    strokeWidth={0.45 * u}
                  />
                )}

                {/* 外墙 */}
                {plan.polygon.length >= 3 && (
                  <polygon
                    points={plan.polygon.map((p) => p.join(',')).join(' ')}
                    fill="none"
                    stroke="#a8352a"
                    strokeWidth={0.5 * u}
                    strokeDasharray={`${1.6 * u} ${0.8 * u}`}
                  />
                )}
                {mode === '外墙' && draft.length > 0 && (
                  <g>
                    <polyline points={draft.map((p) => p.join(',')).join(' ')} fill="rgba(168,53,42,0.08)" stroke="#a8352a" strokeWidth={0.5 * u} />
                    {draft.map((p, i) => (
                      <circle key={i} cx={p[0]} cy={p[1]} r={1.1 * u} fill={i === 0 ? '#a8352a' : 'white'} stroke="#a8352a" strokeWidth={0.4 * u} />
                    ))}
                  </g>
                )}

                {/* 坐向线 */}
                {(() => {
                  const f = rayToRect(taiji, facingImg, 3 * u, 3 * u, W - 3 * u, H - 3 * u);
                  const s = rayToRect(taiji, sittingImg, 0, 0, W, H);
                  return (
                    <g>
                      <line x1={s[0]} y1={s[1]} x2={f[0]} y2={f[1]} stroke="#a8352a" strokeWidth={0.6 * u} />
                      <circle cx={f[0]} cy={f[1]} r={2.6 * u} fill="#a8352a" />
                      <text x={f[0]} y={f[1]} fontSize={2.8 * u} fill="white" textAnchor="middle" dominantBaseline="central" fontWeight={700}>
                        向
                      </text>
                    </g>
                  );
                })()}

                {/* 飞星 */}
                {chart &&
                  ([1, 2, 3, 4, 5, 6, 7, 8, 9] as PalaceIndex[]).map((p) => {
                    const [x, y] = starAnchor(p);
                    const s = chart.palaces[p];
                    return (
                      <g key={p} transform={`translate(${x} ${y})`} pointerEvents="none">
                        <rect x={-5.5 * u} y={-4 * u} width={11 * u} height={8 * u} rx={1.2 * u} fill="white" fillOpacity={0.82} stroke="#d9cfc2" strokeWidth={0.15 * u} />
                        <text x={-3 * u} y={-1.2 * u} fontSize={2.8 * u} textAnchor="middle" dominantBaseline="central" fontWeight={700} fill="#3d3733">
                          {s.shan}
                        </text>
                        <text x={3 * u} y={-1.2 * u} fontSize={2.8 * u} textAnchor="middle" dominantBaseline="central" fontWeight={700} fill="#a8352a">
                          {s.xiang}
                        </text>
                        <text x={0} y={2.1 * u} fontSize={2.1 * u} textAnchor="middle" dominantBaseline="central" fill={s.yun === period ? '#b8913a' : '#8b817a'}>
                          {s.yun} · {PALACE_DIRECTION[p].replace('正', '')}
                        </text>
                      </g>
                    );
                  })}

                {/* 太极点 */}
                <g pointerEvents="none">
                  <circle cx={taiji[0]} cy={taiji[1]} r={1.4 * u} fill="white" stroke="#3d3733" strokeWidth={0.4 * u} />
                  <circle cx={taiji[0]} cy={taiji[1]} r={0.5 * u} fill="#3d3733" />
                </g>

                {/* 房间钉 */}
                {pinned.map(({ pin, room, palace }) => (
                  <g key={pin.roomId} pointerEvents="none">
                    <circle cx={pin.x} cy={pin.y} r={1.3 * u} fill="#2e7d32" stroke="white" strokeWidth={0.4 * u} />
                     <text x={pin.x} y={pin.y + 3.6 * u} fontSize={2.4 * u} textAnchor="middle" fill="#1f4a22" stroke="white" strokeWidth={0.5 * u} paintOrder="stroke" fontWeight={600}>
                      {room.label ?? room.kind}·{PALACE_DIRECTION[palace].replace('正', '')}
                    </text>
                  </g>
                ))}

                {/* 二十四山字 */}
                {MOUNTAIN_CENTERS.map((c) => {
                  const m = degreeToMountain(c);
                  const [x, y] = rayToRect(taiji, bearingToImageAngle(c, north), -pad / 2, -pad / 2, W + pad / 2, H + pad / 2);
                  const isF = sitting && m.name === degreeToMountain(facingDeg).name;
                  const isS = sitting && m.name === sitting.mountain.name;
                  return (
                    <text
                      key={c}
                      x={x}
                      y={y}
                      fontSize={(isF || isS ? 3.6 : 2.9) * u}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontWeight={isF || isS ? 800 : 600}
                      fill={isF ? '#a8352a' : isS ? '#3d3733' : '#6b625b'}
                      stroke="white"
                      strokeWidth={0.7 * u}
                      paintOrder="stroke"
                      pointerEvents="none"
                    >
                      {m.name}
                    </text>
                  );
                })}
              </svg>

              <div className="px-1">
                <SegRow
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    if (m !== '外墙') setDraft([]);
                  }}
                  options={[
                    { value: '看盘', label: '看盘' },
                    { value: '外墙', label: '描外墙' },
                    { value: '太极', label: '太极点' },
                    { value: '房间', label: '标房间' },
                  ]}
                />
                <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink-mute">{MODE_HINT[mode]}</p>

                {mode === '外墙' && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <button className="btn btn-sm" disabled={draft.length === 0} onClick={() => setDraft((d) => d.slice(0, -1))}>
                      撤销一点
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        setDraft([]);
                        updatePlan({ polygon: [], taiji: undefined });
                      }}
                    >
                      用整张图
                    </button>
                    <button className="btn btn-primary btn-sm" disabled={draft.length < 3} onClick={finishOutline}>
                      完成（{draft.length}点）
                    </button>
                  </div>
                )}
                {mode === '太极' && (
                  <button className="btn btn-sm mt-2 w-full" disabled={!plan.taiji} onClick={() => updatePlan({ taiji: undefined })}>
                    回到外墙重心
                  </button>
                )}
                {mode === '房间' && levels.length > 1 && (
                  <div className="mt-2">
                    <SegRow
                      label="这张图是哪一层"
                      value={floorLevel ?? levels[0]!.level}
                      onChange={setFloorLevel}
                      options={levels.map((l) => ({ value: l.level, label: l.label }))}
                    />
                  </div>
                )}
              </div>
            </section>

            {/* 定向 */}
            <section className="card space-y-3">
              <div className="flex items-baseline justify-between">
                <p className="font-serif text-[1rem] font-semibold">
                  {sitting ? `坐${sitting.mountain.name}向${degreeToMountain(facingDeg).name}` : '坐向未定'}
                </p>
                <p className="text-[0.75rem] text-ink-mute">
                  坐 {sittingDeg.toFixed(1)}° · 向 {facingDeg.toFixed(1)}°
                </p>
              </div>
              {line && (
                <p className="text-[0.75rem] leading-relaxed text-ink-soft">
                  {line.label}
                  {chart ? (chart.usedTiXing ? ' · 本盘已起替卦' : ' · 本盘用下卦') : ''}。坐向取自房屋资料，改度数请到
                  <Link href="/edit" className="text-cinnabar underline underline-offset-2">
                    修改房屋
                  </Link>
                  。
                </p>
              )}

              <div>
                <p className="label">「向」（大门、阳台、纳气口那一侧）在图的哪一边？</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {EDGES.map((e) => (
                    <button
                      key={e.angle}
                      type="button"
                      className={`btn btn-sm ${facingEdge === e.angle && Math.abs(fineOffset) < 0.05 ? 'btn-primary' : ''}`}
                      onClick={() => updatePlan({ northImageAngle: northFromFacing(facingDeg, e.angle) })}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label" htmlFor="fine">
                  微调：图纸斜放时 {fineOffset > 0 ? '+' : ''}
                  {fineOffset.toFixed(1)}°
                </label>
                <input
                  id="fine"
                  type="range"
                  min={-45}
                  max={45}
                  step={0.5}
                  value={fineOffset}
                  onChange={(e) => updatePlan({ northImageAngle: northFromFacing(facingDeg, facingEdge + Number(e.target.value)) })}
                  className="w-full accent-cinnabar"
                />
              </div>

              <div>
                <p className="label">或者：图上有指北针／方位字，图的上方是</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {TOP_IS.map((t) => (
                    <button key={t.label} type="button" className="btn btn-sm" onClick={() => updatePlan({ northImageAngle: t.north })}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[0.75rem] text-ink-mute">
                  目前图的上方约 {topBearing.toFixed(0)}°（{degreeToMountain(topBearing).name}）。按指北针定向时，「向」会落在度数所指的位置，不一定正对某一边 —— 若与实景不符，多半是坐向度数或指北针其中一个有误，宜现场复核。
                </p>
              </div>

              <SegRow
                label="分宫法（门派设置，全 App 共用）"
                value={division}
                onChange={(v) => setSchool({ palaceDivision: v })}
                options={[
                  { value: '九宫井字' as const, label: '九宫井字' },
                  { value: '八卦放射' as const, label: '八卦 45°' },
                  { value: '二十四山放射' as const, label: '廿四山 15°' },
                ]}
              />
            </section>

            {/* 房间 */}
            <section className="card space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="font-serif text-[1rem] font-semibold">图上的房间</p>
                <button className="text-[0.8125rem] text-cinnabar" onClick={() => setMode('房间')}>
                  ＋ 标房间
                </button>
              </div>
              {pinned.length === 0 ? (
                <p className="text-[0.8125rem] text-ink-mute">还没有在图上标房间。切到「标房间」，在图上点一下即可。</p>
              ) : (
                <ul className="divide-y divide-rice-line">
                  {pinned.map(({ room, palace, changed }) => (
                    <li key={room.id} className="flex items-center justify-between gap-2 py-2 text-[0.875rem]">
                      <span className="min-w-0 truncate">
                        {room.label ? `${room.label}（${room.kind}）` : room.kind}
                        <span className="ml-1.5 text-ink-mute">{PALACE_DIRECTION[palace]}</span>
                        {changed && <span className="ml-1.5 text-[0.75rem] text-risk-warn">资料仍记作{PALACE_DIRECTION[room.primaryPalace]}</span>}
                      </span>
                      <button className="shrink-0 text-[0.75rem] text-ink-mute" onClick={() => void removePinnedRoom(room.id)}>
                        删除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {changedCount > 0 && (
                <button className="btn btn-primary btn-block" onClick={() => void syncPalaces()}>
                  按图上位置更新 {changedCount} 个房间的宫位
                </button>
              )}
              {unpinnedRooms.length > 0 && (
                <p className="text-[0.75rem] text-ink-mute">
                  另有 {unpinnedRooms.length} 个房间未钉到图上（{unpinnedRooms.map((r) => r.label ?? r.kind).join('、')}），宫位照原来手填的算。在「标房间」点一下图，可把它们钉上。
                </p>
              )}
            </section>

            {/* 缺角初判 */}
            <section className="card space-y-2">
              <p className="font-serif text-[1rem] font-semibold">缺角初判</p>
              {plan.polygon.length < 3 ? (
                <p className="text-[0.8125rem] leading-relaxed text-ink-mute">先「描外墙」，才能看哪几宫有缺。</p>
              ) : missing.length === 0 ? (
                <p className="text-[0.8125rem] leading-relaxed text-ink-mute">按井字格看，没有哪一格缺去三分之一以上。</p>
              ) : (
                <ul className="space-y-1 text-[0.875rem]">
                  {missing.map((m) => (
                    <li key={m.palace}>
                      <b>{PALACE_DIRECTION[m.palace]}</b>：缺约 {Math.round(m.missingFraction * 100)}%（{m.severity >= 1 ? '几乎全缺' : '缺一半'}）
                    </li>
                  ))}
                </ul>
              )}
              {plan.polygon.length >= 3 && (
                <button className="btn btn-block" onClick={() => void applyMissing()}>
                  {missing.length ? '套用到房屋的缺角' : '清除房屋的缺角'}
                </button>
              )}
              <p className="text-[0.6875rem] leading-relaxed text-ink-mute">
                以外墙外接矩形三等分，看每格多少面积落在墙外：缺三分之一以上作「缺一半」，三分之二以上作「几乎全缺」。这是按面积的初判；有的门派看凹入边长是否过一边三分之一，套用前请对照实景。
              </p>
            </section>

            <Expandable title="图纸与精度">
              <ul className="list-disc space-y-1.5 pl-5 text-[0.8125rem] leading-relaxed text-ink-soft">
                <li>方位来自房屋的坐向度数加上你指定的图上定向，不是从图纸识别出来的。度数错了，整张叠图跟着错。</li>
                <li>售楼图、AI 生成图、手绘图常常不按比例，缺角与太极点只能作参考；要紧的判断以现场量度为准。</li>
                <li>太极点默认取外墙几何重心。院子、阳台、车库圈不圈进外墙，各派做法不一，圈进来就算宅内。</li>
                <li>
                  分宫：{division}
                  {division === '九宫井字' ? '，格子与图边平行，正对「向」的中格为向首之宫' : `，中宫取太极点周围外接矩形短边六分之一为半径的圆（工程取值）`}。
                </li>
                <li>飞星九宫以房屋资料排出（{chart?.provenance?.ruleSet ?? '玄空飞星'}），叠图不改变任何星数。</li>
              </ul>
            </Expandable>

            <section className="card space-y-2">
              <p className="font-serif text-[1rem] font-semibold">换图</p>
              <FilePick busy={busy} onPick={onPickFile} compact />
              <button className="btn btn-sm w-full text-cinnabar" onClick={() => void deletePlan()}>
                删除户型图
              </button>
            </section>
          </>
        )}
      </div>

      <Sheet open={pending != null} onClose={() => setPending(null)} title={<p className="font-serif text-[1.0625rem] font-semibold">这里是什么房间？</p>}>
        {pending && geometry && (
          <div className="space-y-4">
            <p className="text-[0.8125rem] text-ink-mute">
              落在<b className="text-ink">{PALACE_DIRECTION[palaceAtPoint(pending, geometry, division)]}</b>（
              {degreeToMountain(bearingFromTaiji(pending, geometry.taiji, north)).name}山方向）
            </p>
            <input className="field" value={roomLabel} onChange={(e) => setRoomLabel(e.target.value)} placeholder="名称（可留空），如：小明房" />
            {ROOM_CATEGORIES.map((cat) => (
              <div key={cat}>
                <p className="mb-1.5 text-[0.75rem] text-ink-mute">{cat}</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {roomKindsByCategory(cat).map((k) => (
                    <button key={k} type="button" className="btn btn-sm px-1" onClick={() => void addRoom(k)}>
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {unpinnedRooms.length > 0 && (
              <div>
                <p className="mb-1.5 text-[0.75rem] text-ink-mute">或把已有的房间钉到这里</p>
                <div className="flex flex-wrap gap-1.5">
                  {unpinnedRooms.map((r) => (
                    <button key={r.id} type="button" className="btn btn-sm" onClick={() => void pinExisting(r)}>
                      {r.label ?? r.kind}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}

function FilePick({ busy, onPick, compact }: { busy: boolean; onPick: (f: File | undefined) => void; compact?: boolean }) {
  return (
    <div className={compact ? 'grid grid-cols-2 gap-2' : 'space-y-2'}>
      <label className={`btn ${compact ? 'btn-sm' : 'btn-primary btn-block'} cursor-pointer`}>
        {busy ? '处理中…' : '拍照'}
        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={(e) => onPick(e.target.files?.[0])} />
      </label>
      <label className={`btn ${compact ? 'btn-sm' : 'btn-block'} cursor-pointer`}>
        从相册选择
        <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => onPick(e.target.files?.[0])} />
      </label>
    </div>
  );
}
