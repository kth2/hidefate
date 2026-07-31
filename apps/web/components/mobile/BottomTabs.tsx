'use client';

/**
 * 底部主导航 —— 拇指区优先。
 *
 * 五个 tab 固定在底部（拇指最容易够到的地方），高度 60px + 安全区，
 * 图标用内联 SVG 以免多一次网络请求、离线也不缺图。
 *
 * 导航顺序即产品顺序：**一命、二运、三风水**。
 * 此前五个 tab 全是宅视角（首页/房屋/成员/模拟/我的），
 * 结果紫微、占局、一生轨迹全埋在「我的」二级页里，界面看着与从前无异。
 * 现改为「一生 · 占局 · 房屋」三层各占一席；
 * 成员与模拟降到二级（它们是配置与深度分析，不是日常入口）。
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface TabDef {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

const stroke = (active: boolean) => (active ? '#a8352a' : '#8b817a');

const TABS: TabDef[] = [
  {
    href: '/',
    label: '首页',
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stroke(a)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20h14V9.5" />
      </svg>
    ),
  },
  {
    // 一命 —— 八字大运 + 紫微十二宫，一生轨迹的过去现在未来
    href: '/life',
    label: '一生',
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stroke(a)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 18c3-9 6-9 9 0s6 9 9 0" />
        <circle cx="12" cy="12.6" r="1.6" fill={stroke(a)} stroke="none" />
      </svg>
    ),
  },
  {
    // 二运 —— 飞盘鸣法时家奇门，回答「此刻这件事」
    href: '/divination',
    label: '占局',
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stroke(a)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18" />
      </svg>
    ),
  },
  {
    // 三风水 —— 玄空飞星 / 八宅 / 山向奇门
    href: '/house',
    label: '风水',
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stroke(a)} strokeWidth="1.8" strokeLinecap="round">
        <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
        <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" />
      </svg>
    ),
  },
  {
    href: '/me',
    label: '我的',
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stroke(a)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3.6" />
        <path d="M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
      </svg>
    ),
  },
];

export function BottomTabs() {
  const pathname = usePathname() ?? '/';

  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rice-line bg-rice/95 backdrop-blur"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((t) => {
          const active = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className="flex h-[3.75rem] flex-col items-center justify-center gap-0.5 active:opacity-60"
              >
                {t.icon(active)}
                <span className={`text-[0.6875rem] leading-none ${active ? 'font-medium text-cinnabar' : 'text-ink-mute'}`}>
                  {t.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
