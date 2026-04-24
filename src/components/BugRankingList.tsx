'use client';

import { useState } from 'react';
import Link from 'next/link';
import CharacterImage from '@/components/CharacterImage';
import type { CharacterBugSummary } from '@/types/patch';

type RankingMode = 'bugsPerMonth' | 'totalBugCount';

type Props = {
  data: CharacterBugSummary[];
  imageMap: Record<string, string>;
};

export default function BugRankingList({ data, imageMap }: Props): React.ReactElement {
  const [mode, setMode] = useState<RankingMode>('totalBugCount');

  const sorted = [...data].sort((a, b) =>
    mode === 'bugsPerMonth' ? b.bugsPerMonth - a.bugsPerMonth : b.totalBugCount - a.totalBugCount
  );

  const maxValue = mode === 'bugsPerMonth' ? sorted[0]?.bugsPerMonth : sorted[0]?.totalBugCount;

  return (
    <>
      {/* 랭킹 모드 토글 */}
      <div className="mb-6 inline-flex rounded-lg border border-[#2a2d35] bg-[#13151a] p-1">
        <button
          onClick={() => setMode('bugsPerMonth')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
            mode === 'bugsPerMonth'
              ? 'bg-amber-500/20 text-amber-300'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          기간 대비
        </button>
        <button
          onClick={() => setMode('totalBugCount')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
            mode === 'totalBugCount'
              ? 'bg-amber-500/20 text-amber-300'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          총 개수
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((char, index) => (
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
                  {mode === 'bugsPerMonth' ? (
                    <>
                      <span>
                        <span className="font-mono font-bold text-amber-400">
                          {char.bugsPerMonth.toFixed(1)}
                        </span>
                        건/월
                      </span>
                      <span className="text-zinc-700">·</span>
                      <span>총 {char.totalBugCount}건</span>
                    </>
                  ) : (
                    <>
                      <span>
                        <span className="font-mono font-bold text-amber-400">
                          {char.totalBugCount}
                        </span>
                        건
                      </span>
                      <span className="text-zinc-700">·</span>
                      <span>{char.bugPatchCount}개 패치</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 버그 바 */}
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-[#1a1d24]">
              <div
                className="h-full bg-linear-to-r from-amber-500 to-orange-400 transition-all"
                style={{
                  width: `${Math.round(((mode === 'bugsPerMonth' ? char.bugsPerMonth : char.totalBugCount) / (maxValue ?? 1)) * 100)}%`,
                }}
              />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
