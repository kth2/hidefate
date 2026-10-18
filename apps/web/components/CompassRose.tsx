'use client';

/**
 * 八方罗盘盘面 —— 随手机转动，正上方永远是「你现在面向的方向」。
 *
 * 八个扇区各占 45°，扇区中心即八宫方位角（北 0°、东北 45° ……）。
 * 扇内大字为时星，财星扇区以金色／浅金／描边区分当旺、生气、退气；五黄、二黑扇区淡红，示「宜静」。
 */

import { PALACE_DIRECTION, type PalaceIndex, type WealthSpot } from '@hidefate/core-fengshui';

const SECTORS: readonly { palace: PalaceIndex; bearing: number }[] = [
  { palace: 1, bearing: 0 },
  { palace: 8, bearing: 45 },
  { palace: 3, bearing: 90 },
  { palace: 4, bearing: 135 },
  { palace: 9, bearing: 180 },
  { palace: 2, bearing: 225 },
  { palace: 7, bearing: 270 },
  { palace: 6, bearing: 315 },
];

const SIZE = 320;
const C = SIZE / 2;
const R = 150;
const R_IN = 52;

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function wedge(bearing: number): string {
  const [x1, y1] = polar(R, bearing - 22.5);
  const [x2, y2] = polar(R, bearing + 22.5);
  const [x3, y3] = polar(R_IN, bearing + 22.5);
  const [x4, y4] = polar(R_IN, bearing - 22.5);
  return `M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2} L${x3},${y3} A${R_IN},${R_IN} 0 0 0 ${x4},${y4} Z`;
}

const ROLE_FILL: Record<WealthSpot['role'], string> = {
  当旺: '#b08b3f',
  生气: 'rgba(176,139,63,0.38)',
  退气: 'rgba(176,139,63,0.12)',
};

export function CompassRose({
  heading,
  plate,
  wealth,
  centerStar,
}: {
  /** 手机所指方位角；null 时按上北显示。 */
  heading: number | null;
  plate: Record<PalaceIndex, PalaceIndex>;
  wealth: readonly WealthSpot[];
  centerStar: PalaceIndex;
}) {
  const rot = -(heading ?? 0);
  const roleOf = (p: PalaceIndex) => wealth.find((w) => w.palace === p)?.role;
  const centerRole = roleOf(5);

  return (
    <div className="relative mx-auto w-full max-w-[20rem]">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full" role="img" aria-label="随手机转动的八方时盘">
        {/* 固定指针：正上方 = 手机顶端所指 */}
        <path d={`M${C - 9},6 L${C + 9},6 L${C},22 Z`} fill="#a8352a" />
        <g style={{ transform: `rotate(${rot}deg)`, transformOrigin: `${C}px ${C}px`, transition: 'transform 180ms linear' }}>
          {SECTORS.map(({ palace, bearing }) => {
            const star = plate[palace];
            const role = roleOf(palace);
            const quiet = star === 5 || star === 2;
            const fill = role ? ROLE_FILL[role] : quiet ? 'rgba(168,53,42,0.10)' : '#ffffff';
            const [tx, ty] = polar((R + R_IN) / 2 + 4, bearing);
            return (
              <g key={palace}>
                <path
                  d={wedge(bearing)}
                  fill={fill}
                  stroke={role === '退气' ? '#b08b3f' : '#ddd2c0'}
                  strokeWidth={role === '退气' ? 2 : 1}
                />
                {/* 星数与方位标签同组：随盘转到位后再反转回正，上下叠放，任何角度都不互相遮挡 */}
                <g style={{ transform: `rotate(${-rot}deg)`, transformOrigin: `${tx}px ${ty}px`, transition: 'transform 180ms linear' }}>
                  <text x={tx} y={ty - 7} textAnchor="middle" dominantBaseline="middle" fontSize="30" fontWeight="700"
                    fontFamily="'Songti SC','Noto Serif SC',serif" fill={role === '当旺' ? '#ffffff' : quiet ? '#a8352a' : '#1a1614'}>
                    {star}
                  </text>
                  <text x={tx} y={ty + 17} textAnchor="middle" dominantBaseline="middle" fontSize="11"
                    fill={role === '当旺' ? '#ffffff' : '#6b625c'}>
                    {PALACE_DIRECTION[palace].replace('正', '')}
                    {role ? `·${role === '当旺' ? '财' : role}` : ''}
                  </text>
                </g>
              </g>
            );
          })}
          {/* 北标 */}
          {(() => {
            const [nx, ny] = polar(R + 2, 0);
            return <circle cx={nx} cy={ny} r={4} fill="#a8352a" />;
          })()}
        </g>
        {/* 中宫（不随转） */}
        <circle cx={C} cy={C} r={R_IN - 4} fill={centerRole ? ROLE_FILL[centerRole] : '#f7f3ec'} stroke="#ddd2c0" />
        <text x={C} y={C - 6} textAnchor="middle" dominantBaseline="middle" fontSize="32" fontWeight="700"
          fontFamily="'Songti SC','Noto Serif SC',serif" fill={centerRole === '当旺' ? '#ffffff' : '#1a1614'}>
          {centerStar}
        </text>
        <text x={C} y={C + 20} textAnchor="middle" fontSize="11" fill={centerRole === '当旺' ? '#ffffff' : '#6b625c'}>
          中宫{centerRole ? `·${centerRole === '当旺' ? '财' : centerRole}` : ''}
        </text>
      </svg>
    </div>
  );
}
