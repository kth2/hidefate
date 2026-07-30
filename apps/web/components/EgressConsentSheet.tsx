'use client';

/**
 * 首次出网确认弹层。
 *
 * 只出现一次，但那一次要把话说尽：发往哪台机器、发出去的原文长什么样、
 * 哪些内容可以先剔掉。用户在这里点的「发送」，是他确实看过内容之后的点头，
 * 而不是对一段隐私政策的默许。
 */

import { useMemo, useState } from 'react';
import {
  DEFAULT_EXCLUSIONS,
  hostOf,
  isLocalHost,
  serialiseEgressPayload,
  type EgressExclusions,
} from '../lib/egress';
import { Sheet } from './mobile/ui';

export function EgressConsentSheet({
  open,
  question,
  baseUrl,
  model,
  system,
  facts,
  initial = DEFAULT_EXCLUSIONS,
  onCancel,
  onAccept,
}: {
  open: boolean;
  question: string;
  baseUrl: string;
  model: string;
  system: string;
  facts: string;
  initial?: EgressExclusions;
  onCancel: () => void;
  /** 用户点头。回调里应保存确认时间与剔除选项，然后重发该问题。 */
  onAccept: (ex: EgressExclusions) => void;
}) {
  const [ex, setEx] = useState<EgressExclusions>(initial);

  // 预览与真正发出的请求体走同一个函数，杜绝「看到的和发出的不是一回事」
  const payload = useMemo(
    () => serialiseEgressPayload({ model, system, facts, question, exclusions: ex }),
    [model, system, facts, question, ex],
  );

  const host = hostOf(baseUrl);
  const local = isLocalHost(baseUrl);

  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={<span className="font-serif text-[1.0625rem] font-semibold">这是本 App 唯一一次把数据发出本机</span>}
    >
      <div className="space-y-4">
        <section className="rounded-xl border border-gold/40 bg-gold/[0.06] p-3">
          <p className="text-[0.8125rem] text-ink-mute">发往</p>
          <p className="mt-0.5 break-all font-mono text-[0.9375rem] font-semibold">{host}</p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-soft">
            {local
              ? '这是一台本机地址 —— 数据实际上没有离开这台设备。'
              : '这是一台第三方服务器。发出去之后，数据如何留存由该供应商决定，本 App 无从控制。'}
          </p>
        </section>

        <section>
          <h3 className="section-title px-0">发送前可以先剔掉</h3>
          <div className="overflow-hidden rounded-2xl border border-rice-line bg-white">
            <label className="row cursor-pointer">
              <span className="flex-1">
                成员八字
                <span className="block text-[0.75rem] leading-relaxed text-ink-mute">
                  剔除四柱、日主与喜忌，只保留命卦（命卦只需生年与性别）。
                  剔掉之后，凡需用到八字的问题模型会答「该资料未提供」。
                </span>
              </span>
              <input
                type="checkbox"
                className="ml-2 h-5 w-5 shrink-0 accent-cinnabar"
                checked={ex.memberBazi}
                onChange={(e) => setEx((v) => ({ ...v, memberBazi: e.target.checked }))}
              />
            </label>
            <label className="row cursor-pointer">
              <span className="flex-1">
                健康类断语
                <span className="block text-[0.75rem] leading-relaxed text-ink-mute">
                  剔除健康维度的预测。剔掉之后，健康相关的问题模型不会作答。
                </span>
              </span>
              <input
                type="checkbox"
                className="ml-2 h-5 w-5 shrink-0 accent-cinnabar"
                checked={ex.healthFindings}
                onChange={(e) => setEx((v) => ({ ...v, healthFindings: e.target.checked }))}
              />
            </label>
          </div>
        </section>

        <section>
          <h3 className="section-title px-0">将要发出的内容（{payload.length.toLocaleString('zh-CN')} 字符，原文）</h3>
          <pre className="max-h-72 overflow-auto rounded-xl border border-rice-line bg-rice-deep/40 p-3 text-[0.6875rem] leading-relaxed">
            {payload}
          </pre>
          <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink-mute">
            以上就是完整的请求体本身，不是摘要。勾选上面的开关，这段会当场跟着变。
            API Key 不在其中 —— 它走请求头，不进正文。
          </p>
        </section>

        <div className="flex gap-2">
          <button type="button" className="btn flex-1" onClick={onCancel}>
            取消，不发送
          </button>
          <button type="button" className="btn btn-primary flex-1" onClick={() => onAccept(ex)}>
            我看过了，发送
          </button>
        </div>
        <p className="text-[0.75rem] leading-relaxed text-ink-mute">
          确认一次之后不再打扰；随时可在 AI 设置里撤回，撤回后下次提问会重新弹出此确认。
        </p>
      </div>
    </Sheet>
  );
}
