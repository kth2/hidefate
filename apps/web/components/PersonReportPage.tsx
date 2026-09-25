'use client';

/**
 * 报告里的「每人一页」—— 打印出来能直接交给那位家人看的一页纸。
 *
 * 内容与「这屋对我」一致，但为纸面重排：先一句话，再今年各方面、自己的房间、该做的事、
 * 逐月、方位。所有数字都来自同一套引擎（buildPersonView / monthlyOutlook），本组件不算任何东西。
 */

import { RELATIVE_NOTE, type MemberMonthly, type PersonView } from '@hidefate/core-synthesis';

const TREND_COLOR: Record<string, string> = { 加重: '#a8352a', 如常: '#6b625c', 缓和: '#2e7d32' };

export function PersonReportPage({
  view,
  months,
  year,
  propertyName,
  today,
  kicker,
}: {
  view: PersonView;
  months: MemberMonthly | null;
  year: number;
  propertyName: string;
  today: string;
  /** 章节小标，如「七、每人一页」；单独打印一人时省略。 */
  kicker?: string;
}) {
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  return (
    <section className="page person-page">
      {kicker && <p className="kicker">{kicker}</p>}
      <h2>
        这屋对{view.name}
        <span className="dim small">　{propertyName} · {year} 年 · 出具 {today}</span>
      </h2>

      <p className="person-tags small">
        {view.mingGua}（{view.group}）· {view.stage}
        {view.roleLabel && ` · 六亲：${view.roleLabel}${view.role?.basis === '推定' ? '（推定）' : ''}`}
      </p>
      <p className="lead person-summary">{view.summary}</p>

      <h3>{year} 年各方面</h3>
      <table className="tbl">
        <thead>
          <tr>
            {view.domains.map((d) => (
              <th key={d.domain}>{d.label ?? d.domain}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {view.domains.map((d) => (
              <td key={d.domain}>
                {!d.label ? (
                  <span className="dim">不适用</span>
                ) : d.relative == null ? (
                  <span className="dim">—</span>
                ) : (
                  <>
                    <b style={{ color: d.relative.includes('偏高') ? '#a8352a' : d.relative.includes('偏低') ? '#2e7d32' : undefined }}>
                      {d.relative === '与平常相当' ? '如常' : d.relative}
                    </b>
                    <span className="dim small">（指数 {pct(d.probability!)}）</span>
                  </>
                )}
              </td>
            ))}
          </tr>
          <tr>
            {view.domains.map((d) => (
              <td key={d.domain} className="small dim">
                {d.top ? `${d.top.direction}${d.top.room ? `·${d.top.room}` : ''}` : ''}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="cap">
        和「平常」比：{RELATIVE_NOTE}括号里的「指数」是模型给{view.name}个人的原始分数。
        {view.stage === '儿童' || view.stage === '少年' ? '孩子不看感情、子女、事业、财运。' : view.stage === '长者' ? '长者不看学业。' : ''}
      </p>

      <div className="two-col">
        <div>
          <h3>{view.name}的房间</h3>
          {view.unassigned ? (
            <p className="small">还没指定{view.name}住哪间，自己卧房、书桌的影响未计入。</p>
          ) : (
            <ul className="small">
              {view.rooms.map((r) => (
                <li key={r.roomId}>
                  <b>{r.label}</b>（{r.direction}）：
                  {r.personStar ? `于其命为「${r.personStar}」，${r.auspicious ? '对其有利' : '是其凶方'}；` : '中宫；'}
                  此宫今年{r.palaceRisk}
                </li>
              ))}
            </ul>
          )}
          {view.rolePalace && (
            <>
              <h3>六亲应象 · {view.rolePalace.direction}</h3>
              <p className="small">{view.rolePalace.note}</p>
            </>
          )}
        </div>
        <div>
          <h3>方位</h3>
          <p className="small">
            <b>床头、书桌宜朝</b>：{view.bestDirections.map((d) => `${d.direction}（${d.star}）`).join('、')}
          </p>
          <p className="small">
            <b>宜避</b>：{view.worstDirections.map((d) => `${d.direction}（${d.star}）`).join('、')}
          </p>
        </div>
      </div>

      {view.advice.length > 0 && (
        <>
          <h3>风水师建言 · {view.advice.length} 个方面</h3>
          <div className="advice small">
            {view.advice.map((a) => (
              <div key={a.aspect} className="advice-item">
                <b>
                  {a.aspect}
                  <span className="dim">（{a.status == null ? '平稳' : a.status === '与平常相当' ? '如常' : a.status}）</span>
                </b>
                ：{a.focus}
                <div>
                  <span className="yi">宜</span> {a.yi.join('；')}
                </div>
                <div>
                  <span className="ji">忌</span> {a.ji.join('；')}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {view.todo.length > 0 && (
        <>
          <h3>{view.name}该做的事</h3>
          <ol className="small">
            {view.todo.map((c, i) => (
              <li key={i}>
                {c.action}
                <span className="dim">
                  （{c.memberId ? `只针对${view.name}` : `${c.direction}${c.room ? `·${c.room}` : ''}`} · {c.urgency}）
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      {months && (
        <>
          <h3>逐月</h3>
          <table className="tbl months">
            <thead>
              <tr>
                <th>月</th>
                <th>公历</th>
                <th>最该留意</th>
                <th>机率（平时）</th>
                <th>比平时</th>
                <th>原因</th>
              </tr>
            </thead>
            <tbody>
              {months.months.map((c) => (
                <tr key={`${c.slot.year}-${c.slot.monthIndex}`}>
                  <td>{c.slot.label}</td>
                  <td className="small">{c.slot.range}</td>
                  <td>{c.top?.label ?? <span className="dim">—</span>}</td>
                  <td className="num">
                    {c.top ? (
                      <>
                        {pct(c.top.probability)}
                        <span className="dim">（{pct(c.top.baseline)}）</span>
                      </>
                    ) : (
                      ''
                    )}
                  </td>
                  <td style={{ color: TREND_COLOR[c.trend] }}>{c.top ? c.trend : ''}</td>
                  <td className="small">{c.top?.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cap">
            以今年的个人机率为底（括号内「平时」），再按每月飞入各处的流月星加减，并只按{view.name}受那一处影响的程度计。
            月份按节气换，不是公历月。
          </p>
        </>
      )}

      <p className="cap">
        以上为传统文化研究与生活参考，不构成医疗、法律或投资建议；健康方面仅作「留意与检查」提示，身体不适请就医。
      </p>
    </section>
  );
}
