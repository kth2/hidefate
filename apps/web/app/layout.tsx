import type { Metadata, Viewport } from 'next';
import './globals.css';
import { RegisterSW } from '../components/RegisterSW';
import { BottomTabs } from '../components/mobile/BottomTabs';
import { PropertyProvider } from '../lib/PropertyContext';

export const metadata: Metadata = {
  title: '藏聚 HideFate',
  description:
    '把每一处房产当作会随年份变化的活系统：玄空飞星 + 八宅派 + 山向奇门三派合参，结合家人八字，给出带概率与化解方案的逐年推演。',
  manifest: '/manifest.json',
  applicationName: '藏聚',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '藏聚' },
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: '#a8352a',
  width: 'device-width',
  initialScale: 1,
  // 允许双指放大（户型图要看细节），但不因聚焦输入框而自动缩放
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-[100dvh]">
        <RegisterSW />
        <PropertyProvider>
          {/* 手机优先：正文限宽 lg，桌面上就是「把手机版居中」，不另做一套布局 */}
          <div className="mx-auto min-h-[100dvh] max-w-lg pb-tab">{children}</div>
          <BottomTabs />
        </PropertyProvider>
      </body>
    </html>
  );
}
