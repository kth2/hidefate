'use client';

/**
 * 二十四山罗盘盘面 —— 随手机转动，正上方红针永远是「手机现在指的方向」。
 *
 * 每山 15°，扇区中心即山的中线（子 0°、癸 15° ……）。
 * 「向」所在之山填朱红，「坐」所在之山填墨色，其余按八卦宫分深浅两色，一眼看出出卦与否。
 */

import { MOUNTAINS } from '@hidefate/core-fengshui';

const SIZE = 320;
const C = SIZE / 2;
const R = 150;
const R_IN = 92;

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function wedge(center: number): string {
  const [x1, y1] = polar(R, center - 7.5);
  const [x2, y2] = polar(R, center + 7.5);
  const [x3, y3] = polar(R_IN, center + 7.5);
  const [x4, y4] = polar(R_IN, center - 7.5);
  return `M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2} L${x3},${y3} A${R_IN},${R_IN} 0 0 0 ${x4},${y4} Z`;
}

/** 八卦宫交替底色（坎、艮、震……依次深浅相间）。 */
const GUA_ORDER = ['坎', '艮', '震', '巽', '离', '坤', '兑', '乾'];

export function MountainRing({
  heading,
  sittingName,
  facingName,
  centerTop,
  centerBottom,
  locked,
}: {
  /** 手机所指方位角；null 时按上北显示。 */
  heading: number | null;
  sittingName: string;
  facingName: string;
  /** 中心大字（通常是度数）。 */
  centerTop: string;
  centerBottom: string;
  locked: boolean;
}) {
  const rot = -(heading ?? 0);
  return (
    <div className="relative mx-auto w-full max-w-[20rem]">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full" role="img" aria-label="随手机转动的二十四山罗盘">
        <path d={`M${C - 9},2 L${C + 9},2 L${C},18 Z`} fill="#a8352a" />
        <g style={{ transform: `rotate(${rot}deg)`, transformOrigin: `${C}px ${C}px`, transition: locked ? 'none' : 'transform 160ms linear' }}>
          {MOUNTAINS.map((m) => {
            const isFacing = m.name === facingName;
            const isSitting = m.name === sittingName;
            const shade = GUA_ORDER.indexOf(m.gua) % 2 === 0 ? '#f7f3ec' : '#ece4d6';
            const fill = isFacing ? '#a8352a' : isSitting ? '#2b2522' : shade;
            const [tx, ty] = polar((R + R_IN) / 2, m.center);
            return (
              <g key={m.name}>
                <path d={wedge(m.center)} fill={fill} stroke="#ddd2c0" strokeWidth={1} />
                <g style={{ transform: `rotate(${-rot}deg)`, transformOrigin: `${tx}px ${ty}px`, transition: locked ? 'none' : 'transform 160ms linear' }}>
                  <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize="17" fontWeight="700"
                    fontFamily="'Songti SC','Noto Serif SC',serif" fill={isFacing || isSitting ? '#ffffff' : '#1a1614'}>
                    {m.name}
                  </text>
                </g>
              </g>
            );
          })}
          {/* 八卦分界粗线 */}
          {[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((b) => {
            const [x1, y1] = polar(R_IN, b);
            const [x2, y2] = polar(R, b);
            return <line key={b} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#b08b3f" strokeWidth={2} />;
          })}
          {(() => {
            const [nx, ny] = polar(R + 5, 0);
            return <text x={nx} y={ny + 1} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#a8352a">北</text>;
          })()}
        </g>
        <circle cx={C} cy={C} r={R_IN - 6} fill="#ffffff" stroke={locked ? '#b08b3f' : '#ddd2c0'} strokeWidth={locked ? 3 : 1} />
        <text x={C} y={C - 8} textAnchor="middle" dominantBaseline="middle" fontSize="34" fontWeight="700" fill="#1a1614">
          {centerTop}
        </text>
        <text x={C} y={C + 24} textAnchor="middle" fontSize="12" fill="#6b625c">
          {centerBottom}
        </text>
      </svg>
    </div>
  );
}
