'use client';

/** 我的 —— 房屋切换、对轨、报告、时间轴、化解追踪、AI 设置、数据与隐私。 */

import Link from 'next/link';
import { useState } from 'react';
import { periodOfYear } from '@hidefate/core-fengshui';
import { AppBar, Empty, Sheet } from '../../components/mobile/ui';
import { useProperty } from '../../lib/PropertyContext';
import { deleteProperty, describeImpact, propertyDeletionImpact } from '../../lib/cascade';
import { exportAll, importAll } from '../../lib/db';

export default function MePage() {
  const { properties, property, members, activeId, setActive, reload, year, setYear, enableQiMen, setEnableQiMen } = useProperty();
  const [switching, setSwitching] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleExport() {
    const json = await exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hidefate-备份-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('已导出到下载文件夹。这是本 App 唯一一次由你主动触发的数据外流。');
  }

  async function handleImport(file: File) {
    try {
      const r = await importAll(await file.text());
      setMsg(`已导入 ${r.properties} 处房屋、${r.members} 位成员。`);
      reload();
    } catch (e) {
      setMsg(`导入失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <>
      <AppBar title="我的" />

      <div className="space-y-4 px-4 py-4">
        {msg && <p className="rounded-xl border border-jade/30 bg-jade/5 p-3 text-[0.8125rem] leading-relaxed text-jade">{msg}</p>}

        {/* 当前房屋 */}
        <section>
          <h2 className="section-title">当前房屋</h2>
          {property ? (
            <button
              type="button"
              onClick={() => setSwitching(true)}
              className="card flex w-full items-center gap-3 text-left active:bg-rice-deep/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-[1.0625rem] font-semibold">{property.name}</p>
                <p className="mt-0.5 text-[0.75rem] text-ink-mute">
                  {property.buildingType}
                  {property.floor != null && ` · ${property.floor} 楼`} · {periodOfYear(property.moveInYear).label}
                </p>
              </div>
              <span className="shrink-0 text-[0.8125rem] text-cinnabar">
                {properties.length > 1 ? '切换 · 删除' : '管理 · 删除'}
              </span>
            </button>
          ) : (
            <Empty
              title="还没有房屋"
              action={
                <Link href="/new" className="btn btn-primary btn-block">
                  建立房屋
                </Link>
              }
            />
          )}
        </section>

        {/* 分析设置 */}
        {property && (
          <section>
            <h2 className="section-title">分析设置</h2>
            <div className="overflow-hidden rounded-2xl border border-rice-line bg-white">
              <div className="row">
                <span className="flex-1">分析年份</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="w-24 rounded-lg border border-rice-line px-2 py-1.5 text-center text-base"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                />
              </div>
              <button type="button" className="row" onClick={() => setEnableQiMen(!enableQiMen)}>
                <span className="flex-1">
                  山向奇门层
                  <span className="block text-[0.75rem] text-ink-mute">开启后按需下载引擎（约 416 KB），之后离线可用</span>
                </span>
                <span
                  className={`h-7 w-12 shrink-0 rounded-full p-0.5 transition ${enableQiMen ? 'bg-cinnabar' : 'bg-rice-line'}`}
                >
                  <span className={`block h-6 w-6 rounded-full bg-white transition ${enableQiMen ? 'translate-x-5' : ''}`} />
                </span>
              </button>
            </div>
          </section>
        )}

        {/* 家人 —— 这房子对每个人的影响，一人一页 */}
        {property && (
          <section>
            <h2 className="section-title">家人</h2>
            <div className="overflow-hidden rounded-2xl border border-rice-line bg-white">
              {members.map((m) => (
                <Link key={m.id} href={`/person?id=${encodeURIComponent(m.id)}`} className="row">
                  <span className="flex-1">
                    这屋对{m.name}
                    <span className="block text-[0.75rem] text-ink-mute">
                      {m.relation ? `${m.relation} · ` : ''}{m.mingGua.gua}{m.mingGua.number}命 · 今年各方面、逐月、该做的事
                    </span>
                  </span>
                  <Chevron />
                </Link>
              ))}
              <Link href="/members" className="row">
                <span className="flex-1">
                  成员管理
                  <span className="block text-[0.75rem] text-ink-mute">添加成员、生辰、住哪间</span>
                </span>
                <Chevron />
              </Link>
            </div>
          </section>
        )}

        {/* 看分析 */}
        {property && (
          <section>
            <h2 className="section-title">看分析</h2>
            <div className="overflow-hidden rounded-2xl border border-rice-line bg-white">
              <Link href="/analysis/fusion" className="row">
                <span className="flex-1">
                  家庭融合报告
                  <span className="block text-[0.75rem] text-ink-mute">谁最受益、谁该换房、未来高冲突年份</span>
                </span>
                <Chevron />
              </Link>
              <Link href="/analysis/matrix" className="row">
                <span className="flex-1">
                  房间 × 成员 风险矩阵
                  <span className="block text-[0.75rem] text-ink-mute">每个人在每间房的实际影响</span>
                </span>
                <Chevron />
              </Link>
              <Link href="/analysis/timeline" className="row">
                <span className="flex-1">
                  宅运时间轴
                  <span className="block text-[0.75rem] text-ink-mute">这处房子未来十二年的起伏</span>
                </span>
                <Chevron />
              </Link>
              <Link href="/analysis/ask" className="row">
                <span className="flex-1">
                  问答与 AI 对话
                </span>
                <Chevron />
              </Link>
              <Link href="/report" className="row">
                <span className="flex-1">
                  生成 PDF 报告
                </span>
                <Chevron />
              </Link>
            </div>
          </section>
        )}

        {/* 调整与记录 */}
        {property && (
          <section>
            <h2 className="section-title">调整与记录</h2>
            <div className="overflow-hidden rounded-2xl border border-rice-line bg-white">
              <Link href="/edit" className="row">
                <span className="flex-1">
                  房屋设置
                  <span className="block text-[0.75rem] text-ink-mute">修改坐向、元运、楼层、缺角</span>
                </span>
                <Chevron />
              </Link>
              <Link href="/rooms" className="row">
                <span className="flex-1">
                  房间管理
                  <span className="block text-[0.75rem] text-ink-mute">增删改房间与楼层，{property.rooms.length} 个已标注</span>
                </span>
                <Chevron />
              </Link>
              <Link href="/simulate" className="row">
                <span className="flex-1">
                  What-If 模拟
                  <span className="block text-[0.75rem] text-ink-mute">改坐向、改房间，看前后对比</span>
                </span>
                <Chevron />
              </Link>
              <Link href="/analysis/cures" className="row">
                <span className="flex-1">
                  化解追踪与回访
                  <span className="block text-[0.75rem] text-ink-mute">做了哪些化解、效果如何</span>
                </span>
                <Chevron />
              </Link>
              <Link href="/calibrate" className="row">
                <span className="flex-1">
                  对轨 · 用真实经历收敛取象
                  <span className="block text-[0.75rem] text-ink-mute">先出回溯并锁定，再由你逐条评 —— 系统据此学你这盘走哪条道</span>
                </span>
                <Chevron />
              </Link>
            </div>
          </section>
        )}

        {/* 设置与数据 */}
        <section>
          <h2 className="section-title">设置与数据</h2>
          <div className="overflow-hidden rounded-2xl border border-rice-line bg-white">
            <Link href="/settings" className="row">
              <span className="flex-1">AI 设置</span>
              <Chevron />
            </Link>
            <Link href="/new" className="row">
              <span className="flex-1">建立新房屋</span>
              <Chevron />
            </Link>
            <button type="button" className="row" onClick={handleExport}>
              <span className="flex-1">导出备份</span>
              <Chevron />
            </button>
            <label className="row cursor-pointer">
              <span className="flex-1">导入备份</span>
              <Chevron />
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImport(f);
                }}
              />
            </label>
          </div>
        </section>

        <p className="px-1 text-[0.75rem] leading-relaxed text-ink-mute">
          所有飞星、八宅、山向奇门与八字推算均在本机离线完成，资料默认不离开此设备。
          本工具为传统文化研究与生活参考之用，不构成医疗、法律或投资建议。健康疑虑请就医。
        </p>
      </div>

      {/* 房屋切换 */}
      <Sheet open={switching} onClose={() => setSwitching(false)} title={<span className="font-serif text-[1.0625rem] font-semibold">房屋（点选切换）</span>}>
        <div className="space-y-2">
          {properties.map((p) => (
            <div
              key={p.id}
              className={`flex items-stretch rounded-2xl border transition ${
                p.id === activeId ? 'border-cinnabar bg-cinnabar/[0.06]' : 'border-rice-line bg-white'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setActive(p.id);
                  setSwitching(false);
                }}
                className="min-w-0 flex-1 p-3.5 text-left active:scale-[0.99]"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-serif text-[1rem] font-semibold">{p.name}</span>
                  {p.id === activeId && <span className="tag border-cinnabar/40 bg-cinnabar/10 text-cinnabar">当前</span>}
                </div>
                <p className="mt-0.5 text-[0.75rem] text-ink-mute">
                  {p.buildingType}
                  {p.floor != null && ` · ${p.floor} 楼`} · {p.entryMode}建档 · {p.rooms.length} 个房间
                </p>
              </button>
              <button
                type="button"
                aria-label={`删除${p.name}`}
                className="shrink-0 border-l border-rice-line px-3.5 text-[0.8125rem] text-ink-mute active:text-cinnabar"
                onClick={async () => {
                  const extra = describeImpact(await propertyDeletionImpact(p.id), { includeMembers: true });
                  const msg =
                    `确定删除「${p.name}」？` +
                    (extra ? `${extra}会一并删除，` : '') +
                    '且无法撤销。';
                  if (!confirm(msg)) return;
                  await deleteProperty(p.id);
                  reload();
                }}
              >
                删除
              </button>
            </div>
          ))}

          <Link href="/new" className="btn btn-primary btn-block mt-2">
            建立新房屋
          </Link>

        </div>
      </Sheet>
    </>
  );
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b3aaa2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
