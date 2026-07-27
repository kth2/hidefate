/**
 * 站点基路径。
 *
 * 本机构建为空字符串；部署到 GitHub Pages 时为 `/<repo>`（由构建时注入）。
 * 凡是**不经 next/link 与 next/image**的路径（Service Worker、vendor 静态资源、
 * manifest 等），都必须自己加上这个前缀，否则在 Pages 的子路径下会 404。
 *
 * next/link 与 next/image 会由 Next 自动加前缀，不要重复加。
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** 给站内静态资源路径加上基路径。传入应以 `/` 开头。 */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
