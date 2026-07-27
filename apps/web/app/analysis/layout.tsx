/**
 * 深度分析子页的共用容器。
 *
 * 这些页面从「我的」进入，属于二级页面：保留底部 tab 以免用户迷路，
 * 但顶栏带返回，符合手机上的层级预期。
 */
export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
