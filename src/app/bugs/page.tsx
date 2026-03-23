import type { Metadata } from 'next';
import Link from 'next/link';
import { loadBugRankingData, loadImageMap } from '@/lib/patch-data';
import CharacterImage from '@/components/CharacterImage';

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
            버그 수정이 가장 많은 실험체 순위 ·{' '}
            <span className="font-mono text-amber-400">{bugData.length}</span>명 집계
          </p>
        </header>

        {bugData.length === 0 ? (
          <div className="rounded-xl border border-[#2a2d35] bg-[#13151a] p-16 text-center">
            <p className="text-zinc-500">버그 수정 데이터가 아직 없습니다.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {bugData.map((char, index) => (
              <Link
                key={char.name}
                href={`/bugs/${encodeURIComponent(char.name)}`}
                className="group relative overflow-hidden rounded-xl border border-[#2a2d35] bg-[#13151a] p-5 transition-all duration-200 hover:border-amber-500/40 hover:shadow-[0_0_24px_rgba(251,146,60,0.12)]"
              >
                {/* 상단 악센트 라인 */}
                <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-amber-500/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                <div className="flex items-center gap-4">
                  {/* 순위 */}
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black ${
                      index === 0
                        ? 'bg-amber-400/20 text-amber-300'
                        : index === 1
                          ? 'bg-zinc-400/10 text-zinc-300'
                          : index === 2
                            ? 'bg-orange-700/20 text-orange-400'
                            : 'bg-[#1a1d24] text-zinc-500'
                    }`}
                  >
                    {index + 1}
                  </div>

                  {/* 초상화 */}
                  <CharacterImage name={char.name} imageUrl={imageMap[char.name]} size="sm" />

                  {/* 이름 + 통계 */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-zinc-100 transition-colors group-hover:text-amber-300">
                      {char.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                      <span>
                        <span className="font-mono font-bold text-amber-400">
                          {char.totalBugCount}
                        </span>
                        건
                      </span>
                      <span className="text-zinc-700">·</span>
                      <span>{char.bugPatchCount}개 패치</span>
                    </div>
                  </div>
                </div>

                {/* 버그 바 (전체 대비 비율) */}
                <div className="mt-4 h-1 overflow-hidden rounded-full bg-[#1a1d24]">
                  <div
                    className="h-full bg-linear-to-r from-amber-500 to-orange-400 transition-all"
                    style={{
                      width: `${Math.round((char.totalBugCount / bugData[0].totalBugCount) * 100)}%`,
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
