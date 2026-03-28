import type { Metadata } from 'next';
import { loadBugRankingData, loadImageMap } from '@/lib/patch-data';
import BugRankingList from '@/components/BugRankingList';

export const metadata: Metadata = {
  title: '버그 랭킹',
  description: '이터널 리턴 실험체별 버그 수정 횟수 순위를 확인하세요.',
};

export default async function BugsPage(): Promise<React.ReactElement> {
  const [bugData, imageMap] = await Promise.all([loadBugRankingData(), loadImageMap()]);

  return (
    <div className="min-h-screen bg-[#0a0b0f]">
      {/* 배경 효과 */}
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,146,60,0.07),transparent_50%)]"
        aria-hidden="true"
      />

      <main className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* 헤더 */}
        <header className="mb-10">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-sm text-amber-300">
            <span>🪲</span>
            버그 수정 기록
          </div>
          <h1 className="bg-linear-to-r from-amber-300 via-orange-300 to-amber-200 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl">
            버그 랭킹
          </h1>
          <p className="mt-2 text-zinc-400">
            실험체별 버그 수정 순위 ·{' '}
            <span className="font-mono text-amber-400">{bugData.length}</span>명 집계
          </p>
        </header>

        {bugData.length === 0 ? (
          <div className="rounded-xl border border-[#2a2d35] bg-[#13151a] p-16 text-center">
            <p className="text-zinc-500">버그 수정 데이터가 아직 없습니다.</p>
          </div>
        ) : (
          <BugRankingList data={bugData} imageMap={imageMap} />
        )}
      </main>
    </div>
  );
}
