'use client';

/**
 * 底部主导航 —— 拇指区优先。
 *
 * 五个 tab 固定在底部（拇指最容易够到的地方），高度 60px + 安全区，
 * 图标用内联 SVG 以免多一次网络请求、离线也不缺图。
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
    href: '/house',
    label: '房屋',
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stroke(a)} strokeWidth="1.8" strokeLinecap="round">
        <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
        <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" />
      </svg>
    ),
  },
  {
    href: '/members',
    label: '成员',
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stroke(a)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
        <path d="M16 5.5a3 3 0 0 1 0 5.6M17.5 14.8c2 .7 3.2 2.5 3.2 5.2" />
      </svg>
    ),
  },
  {
    href: '/simulate',
    label: '模拟',
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stroke(a)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 17V9M10 17V5M16 17v-6M22 17h-2" />
        <path d="M2 20.5h20" />
        <circle cx="16" cy="8" r="2.2" />
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
