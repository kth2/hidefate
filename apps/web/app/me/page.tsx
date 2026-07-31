'use client';

/** 我的 —— 房屋切换、对轨、报告、时间轴、化解追踪、AI 设置、数据与隐私。 */

import Link from 'next/link';
import { useState } from 'react';
import { periodOfYear } from '@hidefate/core-fengshui';
import { AppBar, Empty, Sheet } from '../../components/mobile/ui';
import { useProperty } from '../../lib/PropertyContext';
import { db, exportAll, importAll } from '../../lib/db';

export default function MePage() {
  const { properties, property, activeId, setActive, reload, year, setYear, enableQiMen, setEnableQiMen } = useProperty();
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
                {properties.length > 1 ? '切换' : '管理'}
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

        {/* 更多分析 */}
        {property && (
          <section>
            <h2 className="section-title">更多</h2>
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
                  <span className="block text-[0.75rem] text-ink-mute">
                    增删改房间与楼层，{property.rooms.length} 个已标注
                  </span>
                </span>
                <Chevron />
              </Link>
              <Link href="/calibrate" className="row">
                <span className="flex-1">
                  对轨 · 用真实经历收敛取象
                  <span className="block text-[0.75rem] text-ink-mute">
                    先出回溯并锁定，再由你逐条评 —— 系统据此学你这盘走哪条道
                  </span>
                </span>
                <Chevron />
              </Link>
              <Link href="/analysis/timeline" className="row">
                <span className="flex-1">宅运时间轴</span>
                <Chevron />
              </Link>
              <Link href="/analysis/matrix" className="row">
                <span className="flex-1">房间 × 成员 风险矩阵</span>
                <Chevron />
              </Link>
              <Link href="/analysis/fusion" className="row">
                <span className="flex-1">家庭融合报告</span>
                <Chevron />
              </Link>
              <Link href="/analysis/cures" className="row">
                <span className="flex-1">化解追踪与回访</span>
                <Chevron />
              </Link>
              <Link href="/analysis/ask" className="row">
                <span className="flex-1">问答与 AI 对话</span>
                <Chevron />
              </Link>
              <Link href="/report" className="row">
                <span className="flex-1">生成 PDF 报告</span>
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
      <Sheet open={switching} onClose={() => setSwitching(false)} title={<span className="font-serif text-[1.0625rem] font-semibold">选择房屋</span>}>
        <div className="space-y-2">
          {properties.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setActive(p.id);
                setSwitching(false);
              }}
              className={`w-full rounded-2xl border p-3.5 text-left transition active:scale-[0.99] ${
                p.id === activeId ? 'border-cinnabar bg-cinnabar/[0.06]' : 'border-rice-line bg-white'
              }`}
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
          ))}

          <Link href="/new" className="btn btn-primary btn-block mt-2">
            建立新房屋
          </Link>

          {property && properties.length > 0 && (
            <button
              type="button"
              className="btn btn-block mt-2 text-cinnabar"
              onClick={async () => {
                if (!confirm(`确定删除「${property.name}」？其成员与化解记录会一并删除，且无法撤销。`)) return;
                const d = db();
                await d.transaction('rw', d.properties, d.members, d.cures, async () => {
                  await d.properties.delete(property.id);
                  await d.members.where('propertyId').equals(property.id).delete();
                  await d.cures.where('propertyId').equals(property.id).delete();
                });
                setSwitching(false);
                reload();
              }}
            >
              删除当前房屋
            </button>
          )}
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
