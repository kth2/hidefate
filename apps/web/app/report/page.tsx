'use client';

/**
 * 专业报告页 —— 排版即为 PDF。
 *
 * 采用浏览器原生「打印 / 另存为 PDF」而非引入 PDF 库：
 *   1. 完全离线，不需额外 800 KB 以上的字体与渲染依赖
 *   2. 中文字形交给系统字体，不会出现 PDF 库常见的缺字与豆腐块
 *   3. 用户可直接选纸张、页边距与是否加页眉
 * 打印样式见本文件末尾的 <style>，已处理分页、避免表格断行与色彩保留。
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  GRID_LAYOUT,
  PALACE_DIRECTION,
  PALACE_INDEXES,
  STAR_NAME,
  type PalaceIndex,
} from '@hidefate/core-fengshui';
import {
  RISK_COLOR,
  buildFamilyFusionReport,
  buildTimeline,
  synthesise,
  analyse,
  type AnalysisInput,
} from '@hidefate/core-synthesis';
import { computeShanXiang, type ShanXiangResult } from '@hidefate/core-qimen';
import { currentFengShuiTime } from '../../lib/useAnalysis';
import { useProperty } from '../../lib/PropertyContext';
import { PropertyConfidenceGate } from '../../components/PropertyConfidenceGate';

export default function ReportPage() {
  // 取「当前房屋」而非路由参数：静态导出没有服务器，动态段 [id] 无法预渲染，
  // 且报告本来就只会针对当前选中的那处房屋出具。
  const { property, members, cures, loading } = useProperty();
  const [now] = useState(() => currentFengShuiTime());
  const [qiMen, setQiMen] = useState<ShanXiangResult | null>(null);
  const [qiMenPending, setQiMenPending] = useState(false);

  // 报告须完整呈现「所有已启用门派」的盘，故此处主动把奇门层也载入，
  // 载入完成前不渲染报告 —— 否则会印出一份声称「未启用奇门」的错报告。
  useEffect(() => {
    if (!property?.enableQiMen) return;
    setQiMenPending(true);
    computeShanXiang({ sitting: property.sitting, year: property.moveInYear, purpose: '风水' })
      .then(setQiMen)
      .catch(() => setQiMen(null))
      .finally(() => setQiMenPending(false));
  }, [property?.enableQiMen, property?.sitting, property?.moveInYear]);

  const data = useMemo(() => {
    if (!property) return null;
    const input: AnalysisInput = {
      profile: property,
      members,
      year: now.year,
      monthIndex: now.monthIndex,
      appliedCures: cures,
      qiMen,
    };
    try {
      const result = analyse(input, synthesise(input));
      const timeline = buildTimeline({ profile: property, members, qiMen: null, appliedCures: cures }, {
        startYear: now.year,
        span: 12,
      });
      const fusion = members.length
        ? buildFamilyFusionReport({ profile: property, members, qiMen: null }, now.year, 10)
        : null;
      return { result, timeline, fusion };
    } catch {
      return null;
    }
  }, [property, members, cures, now, qiMen]);

  if (loading) return <p className="px-4 py-6 text-sm text-ink-mute">读取中…</p>;
  if (qiMenPending) {
    return <p className="text-sm text-ink-mute">正在载入山向奇门层，以确保报告涵盖全部已启用门派…</p>;
  }
  if (property === null || !data) return <p className="text-sm text-cinnabar">找不到此物业，或推算失败。</p>;

  const { result, timeline, fusion } = data;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="report">
      {/* 屏幕上的操作条，打印时隐藏 */}
      <div className="no-print mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-rice-line bg-white p-3">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          打印 / 另存为 PDF
        </button>
        <Link href="/house" className="btn">
          返回分析
        </Link>
        <span className="text-xs text-ink-mute">
          在打印对话框中选择「另存为 PDF」，并勾选「背景图形」以保留风险配色。
        </span>
        {/* 报告是要拿去给人看的，置信度不够时更该在导出前补齐 */}
        <div className="w-full">
          <PropertyConfidenceGate />
        </div>
      </div>

      {/* ── 封面 ── */}
      <section className="page">
        <div className="cover">
          <p className="cover-brand">藏聚 · HIDEFATE</p>
          <h1 className="cover-title">{property.name}</h1>
          <p className="cover-sub">风水综合勘察报告</p>
          <table className="cover-meta">
            <tbody>
              <tr>
                <th>建筑类别</th>
                <td>
                  {property.buildingType}
                  {property.floor != null && ` · ${property.floor} 楼`}
                </td>
              </tr>
              <tr>
                <th>坐向</th>
                <td>
                  坐{result.flyingStar.sitting.mountain.name}（{result.flyingStar.sitting.degree.toFixed(1)}°）向
                  {result.flyingStar.facing.mountain.name}　{result.flyingStar.jianXiang.label}
                </td>
              </tr>
              <tr>
                <th>元运 · 格局</th>
                <td>
                  {result.flyingStar.period.label}　{result.flyingStar.pattern}
                </td>
              </tr>
              <tr>
                <th>八宅</th>
                <td>{result.baZhai.label}</td>
              </tr>
              <tr>
                <th>合参门派</th>
                <td>
                  玄空飞星 · 八宅派
                  {result.qiMenEnabled && qiMen ? ` · 山向奇门（${qiMen.ju.label}）` : ''}
                  {property.enableQiMen && !qiMen && (
                    <span className="dim">　（山向奇门层载入失败，本报告未含该层）</span>
                  )}
                </td>
              </tr>
              <tr>
                <th>分析年度</th>
                <td>
                  {result.year} 年（流年{STAR_NAME[result.palaces[5].stars.annual]}入中）
                </td>
              </tr>
              <tr>
                <th>整体评级</th>
                <td>
                  <b style={{ color: RISK_COLOR[result.overallRisk] }}>{result.overallRisk}</b>
                  　综合分 {result.overallScore.toFixed(2)}　置信度 {result.confidence.level}
                </td>
              </tr>
              <tr>
                <th>出具日期</th>
                <td>{today}</td>
              </tr>
            </tbody>
          </table>
          <p className="cover-note">
            本报告全部推算于本机离线完成，资料未经任何网络传输。
            所载结论为传统文化研究与生活参考之用，不构成医疗、法律或投资建议。
          </p>
        </div>
      </section>

      {/* ── 一、总述 ── */}
      <section className="page">
        <h2>一、总述</h2>
        <p className="lead">{result.summary}</p>

        <h3>置信度与依据</h3>
        <ul>
          {result.confidence.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>

        <h3>排盘推导过程</h3>
        <ol className="derivation">
          {result.flyingStar.derivation.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
          {result.baZhai.derivation.map((d, i) => (
            <li key={`bz-${i}`}>{d}</li>
          ))}
        </ol>
      </section>

      {/* ── 二、九宫全盘 ── */}
      <section className="page">
        <h2>二、九宫全盘</h2>
        <div className="grid9">
          {GRID_LAYOUT.map((p) => {
            const a = result.palaces[p];
            return (
              <div key={p} className="gong9" style={{ borderBottom: `3px solid ${RISK_COLOR[a.riskLevel]}` }}>
                <div className="gong9-head">
                  <b>{a.direction}</b>
                  <span>{a.riskLevel}</span>
                </div>
                <div className="gong9-stars">
                  <span className="s-shan">{a.stars.shan}</span>
                  <span className="s-yun">{a.stars.yun}</span>
                  <span className="s-xiang">{a.stars.xiang}</span>
                </div>
                <div className="gong9-meta">
                  流年 {a.stars.annual}
                  {a.baZhaiStar && ` · ${a.baZhaiStar}`}
                  {a.qiMen?.men && ` · ${a.qiMen.men}`}
                </div>
                <div className="gong9-combo">{a.combinationName}</div>
                <div className="gong9-room">
                  {a.rooms.length ? a.rooms.map((r) => r.label ?? r.kind).join('·') : '未标注'}
                  {a.missing && ' · 缺角'}
                </div>
              </div>
            );
          })}
        </div>
        <p className="cap">左下＝山星（人丁·健康）　中＝运星　右下＝向星（财禄）。上为正北，与实地罗盘一致。</p>
      </section>

      {/* ── 三、逐宫分析 ── */}
      <section className="page">
        <h2>三、逐宫分析</h2>
        {PALACE_INDEXES.map((p) => {
          const a = result.palaces[p];
          return (
            <div key={p} className="palace-block">
              <h3>
                {a.direction}
                <span className="pill" style={{ background: RISK_COLOR[a.riskLevel] }}>
                  {a.riskLevel}
                </span>
                <span className="dim">
                  山{STAR_NAME[a.stars.shan]} 向{STAR_NAME[a.stars.xiang]} 运{STAR_NAME[a.stars.yun]} 流年
                  {STAR_NAME[a.stars.annual]}　「{a.combinationName}」
                  {a.baZhaiStar && `　八宅：${a.baZhaiStar}`}
                </span>
              </h3>
              <ul className="findings">
                {a.findings.slice(0, 4).map((f, i) => (
                  <li key={i}>
                    <span className="schools">[{f.schools.join('·')}／置信度{f.confidence}]</span> {f.statement}
                    <div className="principle">依据：{f.principle}</div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {/* ── 四、本年预测 ── */}
      {result.predictions.length > 0 && (
        <section className="page">
          <h2>四、{result.year} 年概率预测</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>维度</th>
                <th>方位 · 房间</th>
                <th>概率</th>
                <th>评级</th>
                <th>置信度</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {result.predictions.map((p) => (
                <tr key={p.id}>
                  <td>{p.domain}</td>
                  <td>
                    {p.direction}
                    {p.room && ` · ${p.room}`}
                  </td>
                  <td className="num">{Math.round(p.probability * 100)}%</td>
                  <td style={{ color: RISK_COLOR[p.riskLevel] }}>{p.riskLevel}</td>
                  <td>{p.confidence}</td>
                  <td className="small">{p.headline}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cap">
            概率由确定性模型加权算出，已收敛于 3%–92% 区间：风水不是决定论，本报告不作任何确定性断言。
          </p>
        </section>
      )}

      {/* ── 五、化解清单 ── */}
      <section className="page">
        <h2>五、化解建议（按优先级）</h2>
        <ol className="cures">
          {result.prioritisedCures.map((c) => (
            <li key={`${c.palace}-${c.priority}`}>
              <div className="cure-head">
                <span className="pill dark">{c.urgency}</span>
                <b>
                  {c.direction}
                  {c.room && ` · ${c.room}`}
                </b>
                <span className="dim">{c.domains.join('、')}</span>
              </div>
              <div>{c.action}</div>
              <div className="principle">理据：{c.rationale}</div>
              {c.avoid.length > 0 && <div className="avoid">切忌：{c.avoid.join('、')}</div>}
            </li>
          ))}
        </ol>
      </section>

      {/* ── 六、成员 ── */}
      {members.length > 0 && (
        <section className="page">
          <h2>六、成员与宅命交叉</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>姓名</th>
                <th>性别 · 生年</th>
                <th>命卦</th>
                <th>八字精度</th>
                <th>四吉方</th>
                <th>四凶方</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const fit = fusion?.members.find((f) => f.memberId === m.id);
                return (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>
                      {m.chart.input.gender} · {m.chart.input.year}
                    </td>
                    <td>
                      {m.mingGua.gua}
                      {m.mingGua.number}（{m.mingGua.group}）
                    </td>
                    <td className="small">{m.chart.confidence.label}</td>
                    <td className="small">
                      {fit?.auspiciousDirections.map((d) => `${d.direction}(${d.star})`).join('、')}
                    </td>
                    <td className="small">
                      {fit?.inauspiciousDirections.map((d) => `${d.direction}(${d.star})`).join('、')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {fusion && (
            <>
              <h3>家庭融合结论</h3>
              <p className="lead">{fusion.summary}</p>
              {fusion.roomAssignmentAdvice.length > 0 && (
                <>
                  <h3>房间分配建议</h3>
                  <ul>
                    {fusion.roomAssignmentAdvice.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      )}

      {/* ── 七、多年时间轴 ── */}
      <section className="page">
        <h2>{members.length > 0 ? '七' : '六'}、宅运时间轴（{timeline.startYear}–{timeline.endYear}）</h2>
        <p className="lead">{timeline.summary}</p>
        <table className="tbl">
          <thead>
            <tr>
              <th>年份</th>
              <th>流年星</th>
              <th>评级</th>
              <th>最需留意三方</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {timeline.years.map((y) => (
              <tr key={y.year}>
                <td className="num">{y.year}</td>
                <td>{y.annualStarName}</td>
                <td style={{ color: RISK_COLOR[y.overallRisk] }}>{y.overallRisk}</td>
                <td className="small">{y.hotspots.map((h) => `${h.direction}(${h.risk})`).join('、')}</td>
                <td className="small">
                  {y.isPeriodChange ? '换运年，全盘重排' : ''}
                  {y.activeCureCount > 0 ? ` 已生效化解 ${y.activeCureCount} 项` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── 附录：门派与置信度说明 ── */}
      <section className="page">
        <h2>附录：门派、置信度与免责</h2>
        <h3>本报告所用门派</h3>
        <ul>
          <li>
            <b>玄空飞星</b> —— 以元运数入中排运盘，取坐山与向首所在宫之运星分别入中排山盘与向盘，
            阴阳依该运星本宫中与坐山同元龙之山而定；兼向逾 3° 起替卦（二十四山起星诀）。
          </li>
          <li>
            <b>八宅派</b> —— 以坐山所属卦宫为宅卦，依翻卦掌次第布游年八星；
            个人层以命卦另起一盘，二者交叉方为「此人住此位」之真实吉凶。
          </li>
          {result.qiMenEnabled && (
            <li>
              <b>山向奇门</b> —— 以坐山定局（坐山三元法），八门九星八神叠于同一九宫，作第三重印证。
            </li>
          )}
          <li>
            <b>八字命理</b> —— 四柱五行力量加权判身强弱与喜忌；资料残缺时按精度分级降权，
            命卦部分只需出生年与性别，故不受影响。
          </li>
        </ul>

        <h3>置信度如何判定</h3>
        <ul>
          <li>多派同证者升，孤证者降。</li>
          <li>坐向来自现场罗盘实测 &gt; 户型图 &gt; 纯九宫格。</li>
          <li>关键房间（大门／主卧／厨房）标注齐全者升。</li>
          <li>成员八字四柱俱全者升；缺时柱按三柱论并标注「中等」。</li>
        </ul>

        <h3>免责声明</h3>
        <p className="small">
          本报告为传统文化研究与生活参考之用。所有概率均为基于古法规则的加权估计，
          不代表任何事件必然发生或必然不发生，亦不构成医疗、法律、投资或其他专业建议。
          健康方面的任何疑虑，请咨询合资格的医疗人员；报告中的健康提示仅作「留意与检查」之参考，
          不能替代诊断与治疗。
        </p>
        <p className="small dim">
          藏聚 HideFate · 出具于 {today} · 全部推算离线完成
        </p>
      </section>

      <style jsx global>{`
        .report {
          max-width: 48rem;
          margin: 0 auto;
          color: #1a1614;
          font-size: 13px;
          line-height: 1.85;
        }
        .report h2 {
          font-family: 'Songti SC', SimSun, serif;
          font-size: 19px;
          font-weight: 700;
          border-bottom: 2px solid #a8352a;
          padding-bottom: 6px;
          margin: 0 0 14px;
        }
        .report h3 {
          font-family: 'Songti SC', SimSun, serif;
          font-size: 15px;
          font-weight: 600;
          margin: 18px 0 8px;
        }
        .report ul,
        .report ol {
          padding-left: 1.3em;
          margin: 8px 0;
        }
        .report li {
          margin-bottom: 5px;
        }
        .lead {
          margin: 8px 0;
        }
        .small {
          font-size: 11.5px;
        }
        .dim {
          color: #6b625c;
          font-weight: 400;
        }
        .num {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .cap {
          font-size: 11px;
          color: #6b625c;
          margin-top: 8px;
        }
        .page {
          margin-bottom: 34px;
        }

        /* 封面 */
        .cover {
          border: 2px solid #a8352a;
          padding: 40px 32px;
          text-align: center;
        }
        .cover-brand {
          letter-spacing: 0.4em;
          color: #a8352a;
          font-size: 12px;
          margin: 0 0 26px;
        }
        .cover-title {
          font-family: 'Songti SC', SimSun, serif;
          font-size: 30px;
          font-weight: 700;
          margin: 0 0 6px;
        }
        .cover-sub {
          color: #6b625c;
          letter-spacing: 0.25em;
          margin: 0 0 28px;
        }
        .cover-meta {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          margin: 0 auto;
        }
        .cover-meta th,
        .cover-meta td {
          border-bottom: 1px solid #ddd2c0;
          padding: 7px 6px;
          vertical-align: top;
        }
        .cover-meta th {
          width: 6.5em;
          color: #6b625c;
          font-weight: 500;
          white-space: nowrap;
        }
        .cover-note {
          margin-top: 26px;
          font-size: 11px;
          color: #6b625c;
          line-height: 1.7;
        }

        /* 九宫 */
        .grid9 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
        }
        .gong9 {
          border: 1px solid #ddd2c0;
          padding: 8px;
          min-height: 110px;
        }
        .gong9-head {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #6b625c;
        }
        .gong9-stars {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin: 6px 2px 2px;
        }
        .s-shan,
        .s-xiang {
          font-size: 20px;
          font-weight: 700;
        }
        .s-yun {
          font-size: 12px;
          color: #6b625c;
        }
        .gong9-meta,
        .gong9-combo,
        .gong9-room {
          font-size: 10.5px;
          color: #3d3733;
        }
        .gong9-combo {
          color: #a8352a;
          margin-top: 3px;
        }
        .gong9-room {
          color: #6b625c;
          margin-top: 3px;
        }

        /* 表格 */
        .tbl {
          width: 100%;
          border-collapse: collapse;
          font-size: 11.5px;
        }
        .tbl th,
        .tbl td {
          border: 1px solid #ddd2c0;
          padding: 5px 7px;
          text-align: left;
          vertical-align: top;
        }
        .tbl th {
          background: #efe8dc;
          font-weight: 600;
        }

        /* 逐宫 */
        .palace-block {
          border-left: 3px solid #ddd2c0;
          padding-left: 10px;
          margin-bottom: 14px;
          break-inside: avoid;
        }
        .palace-block h3 {
          margin: 0 0 5px;
        }
        .pill {
          display: inline-block;
          color: #fff;
          font-size: 10px;
          padding: 1px 7px;
          border-radius: 8px;
          margin: 0 8px;
          vertical-align: middle;
        }
        .pill.dark {
          background: #1a1614;
        }
        .findings {
          margin: 0;
          font-size: 11.5px;
        }
        .schools {
          color: #a8352a;
        }
        .principle {
          color: #6b625c;
          font-size: 10.5px;
          border-left: 2px solid #ddd2c0;
          padding-left: 7px;
          margin-top: 2px;
        }
        .avoid {
          color: #a8352a;
          font-size: 10.5px;
        }
        .cures li {
          margin-bottom: 10px;
          break-inside: avoid;
        }
        .cure-head {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .derivation li {
          font-size: 11.5px;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: #fff !important;
          }
          header,
          footer {
            display: none !important;
          }
          main {
            padding: 0 !important;
            max-width: none !important;
          }
          .report {
            max-width: none;
            font-size: 11pt;
          }
          .page {
            break-after: page;
          }
          .page:last-child {
            break-after: auto;
          }
          .tbl,
          .grid9 {
            break-inside: auto;
          }
          .tbl tr {
            break-inside: avoid;
          }
          @page {
            margin: 16mm 14mm;
          }
        }
      `}</style>
    </div>
  );
}
