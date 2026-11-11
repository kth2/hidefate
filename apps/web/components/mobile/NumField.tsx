'use client';

/**
 * 数字输入框。
 *
 * 为什么不直接 `value={n} onChange={e => set(Number(e.target.value))}`：
 *   - 打字途中的值（「1」「19」「101.」「-」）不是合法的最终值。若把框的内容绑在解析后的数字上，
 *     这些中间值会被吃掉 —— 出生年打不满四位、经度打不出小数点、清空后跳回 0。
 * 做法：框里保留用户打的原文（draft）；原文能解析成范围内的数字时才回报；
 * 离开输入框时，若原文不合法，还原为最后一个合法值。外部值改变（如按「取得位置」）时同步原文。
 *
 * 用 type="text" 加 inputMode，而不用 type="number"：后者在桌面滚轮会改值，
 * 且浏览器对「1e3」「--1」等非法输入回报空字串，无法分辨「清空」与「打错」。
 */

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

export interface NumFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'inputMode'> {
  value: number | null | undefined;
  /** 合法时回报数字；allowEmpty 时清空回报 null。 */
  onValue: (v: number | null) => void;
  min?: number;
  max?: number;
  /** 允许小数（经度、度数）。默认只收整数。 */
  decimal?: boolean;
  /** 允许留空。不允许时，清空只改框里的字，不回报，离开时还原。 */
  allowEmpty?: boolean;
}

export function parseNum(raw: string, opts: { min?: number; max?: number; decimal?: boolean }): number | null {
  const s = raw.trim().replace(/[，,]/g, '').replace(/[０-９．－]/g, (c) =>
    c === '．' ? '.' : c === '－' ? '-' : String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
  if (!(opts.decimal ? /^-?\d+(\.\d+)?$/ : /^-?\d+$/).test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (opts.min != null && n < opts.min) return null;
  if (opts.max != null && n > opts.max) return null;
  return n;
}

const show = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? '' : String(v));

export function NumField({ value, onValue, min, max, decimal, allowEmpty, onBlur, ...rest }: NumFieldProps) {
  const [draft, setDraft] = useState(show(value));
  /** 最后一次由本框回报的值，用来区分「外部改了值」与「我自己回报的值」。 */
  const reported = useRef<number | null | undefined>(value);

  useEffect(() => {
    if (value !== reported.current) {
      reported.current = value;
      setDraft(show(value));
    }
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={draft}
      aria-invalid={draft.trim() !== '' && parseNum(draft, { min, max, decimal }) == null ? true : undefined}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() === '') {
          if (allowEmpty) {
            reported.current = null;
            onValue(null);
          }
          return;
        }
        const n = parseNum(raw, { min, max, decimal });
        if (n != null) {
          reported.current = n;
          onValue(n);
        }
      }}
      onBlur={(e) => {
        const n = draft.trim() === '' ? null : parseNum(draft, { min, max, decimal });
        if (n == null && !(allowEmpty && draft.trim() === '')) setDraft(show(value));
        onBlur?.(e);
      }}
    />
  );
}
