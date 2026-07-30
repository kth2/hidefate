import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AI_OPTIONAL_NOTICE, AI_OPTIONAL_NOTICE_ONE_LINE } from './aiNotice';

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/**
 * README 硬规则 #1 的守卫。
 *
 * 「AI 只是润色，不参与计算，不装也能用」这句话必须在 AI 设置与 AI 对话
 * 两个界面上常驻可见 —— 它是本 App 与「AI 算命 App」的分界线，
 * 不能因为界面改版而悄悄消失。
 */
describe('AI 可选性声明常驻存在', () => {
  it('文案覆盖三件事：AI 只组织语言、不改数字、不装也能用', () => {
    const all = `${AI_OPTIONAL_NOTICE.title}${AI_OPTIONAL_NOTICE.body}${AI_OPTIONAL_NOTICE.tail}${AI_OPTIONAL_NOTICE.precedence}`;
    expect(all).toContain('确定性');
    expect(all).toContain('离线');
    expect(all).toMatch(/不参与.*计算/);
    expect(all).toMatch(/不配置.*不影响/);
    expect(all).toContain('以九宫盘为准');
    expect(AI_OPTIONAL_NOTICE_ONE_LINE.length).toBeGreaterThan(10);
  });

  it('声明组件把每一段都渲染出来（不是只留个标题）', () => {
    const c = src('../components/AiOptionalNotice.tsx');
    for (const field of ['title', 'body', 'tail', 'precedence']) {
      expect(c).toContain(`AI_OPTIONAL_NOTICE.${field}`);
    }
    expect(c).toContain('AI_OPTIONAL_NOTICE_ONE_LINE');
  });

  it('AI 设置页渲染该声明', () => {
    const page = src('../app/settings/page.tsx');
    expect(page).toContain("from '../../components/AiOptionalNotice'");
    expect(page).toMatch(/<AiOptionalNotice\b/);
  });

  it('AI 对话页在每一种状态下都渲染该声明（未配置 / 未同意 / 正常）', () => {
    const chat = src('../components/AiChat.tsx');
    expect(chat).toContain("from './AiOptionalNotice'");
    // 三个 return 分支各一处，缺一处就意味着某个状态下声明消失了
    expect(chat.match(/<AiOptionalNotice\b/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
