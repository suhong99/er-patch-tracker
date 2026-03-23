import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { loadCharacterBugHistory, loadImageMap } from '@/lib/patch-data';
import { formatDate } from '@/lib/patch-utils';
import {
  groupPatchesBySeason,
  getSeasonsFromPatches,
  formatSeasonLabel,
  getSeasonEndDate,
} from '@/lib/seasons';
import CharacterImage from '@/components/CharacterImage';
import SeasonNav from '@/components/SeasonNav';

type Props = {
  params: Promise<{ name: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  return {
    title: `${decodedName} 버그 히스토리`,
    description: `이터널 리턴 ${decodedName} 실험체의 버그 수정 기록입니다.`,
  };
}

export default async function CharacterBugPage({ params }: Props): Promise<React.ReactElement> {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  const [bugHistory, imageMap] = await Promise.all([
    loadCharacterBugHistory(decodedName),
    loadImageMap(),
  ]);

  if (bugHistory.length === 0) {
    notFound();
  }

  const totalBugCount = bugHistory.reduce((sum, p) => sum + p.bugs.length, 0);
  const grouped = groupPatchesBySeason(bugHistory);
  const seasons = getSeasonsFromPatches(bugHistory);

  return (
    <div className="min-h-screen bg-[#0a0b0f]">
      {/* 배경 효과 */}
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,146,60,0.07),transparent_50%)]"
        aria-hidden="true"
      />

      <main className="relative mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* 뒤로가기 */}
        <nav aria-label="뒤로가기" className="mb-8">
          <Link
            href="/bugs"
            className="group inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-amber-400"
          >
            <svg
              className="h-4 w-4 transition-transform group-hover:-translate-x-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            버그 랭킹으로
          </Link>
        </nav>

        {/* 헤더 */}
        <header className="mb-10">
          <div className="flex items-center gap-5">
            <CharacterImage name={decodedName} imageUrl={imageMap[decodedName]} size="lg" />
            <div>
              <h1 className="bg-linear-to-r from-white to-zinc-400 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl">
                {decodedName}
              </h1>
              <p className="mt-2 text-zinc-500">버그 수정 히스토리</p>
            </div>
          </div>

          {/* 통계 */}
          <div className="mt-6 flex gap-3">
            <div className="rounded-xl border border-[#2a2d35] bg-[#13151a] px-5 py-4 text-center">
              <p className="font-mono text-2xl font-black text-amber-400">{totalBugCount}</p>
              <p className="mt-1 text-xs text-zinc-500">총 버그</p>
            </div>
            <div className="rounded-xl border border-[#2a2d35] bg-[#13151a] px-5 py-4 text-center">
              <p className="font-mono text-2xl font-black text-orange-400">{bugHistory.length}</p>
              <p className="mt-1 text-xs text-zinc-500">버그 패치</p>
            </div>
          </div>
        </header>

        {/* 버그 히스토리 (시즌별) */}
        <section aria-labelledby="bug-history-heading">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <span className="text-lg">🪲</span>
            </div>
            <div>
              <h2 id="bug-history-heading" className="text-xl font-bold text-zinc-100">
                버그 수정 기록
              </h2>
              <p className="text-sm text-zinc-500">{bugHistory.length}개 패치에서 수정됨</p>
            </div>
          </div>

          <div className="space-y-8">
            {Array.from(grouped.entries()).map(([season, patches]) => (
              <div key={season.number} id={`season-${season.number}`} className="scroll-mt-6">
                {/* 시즌 헤더 */}
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
                    <span className="text-sm font-bold text-amber-400">S{season.number}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-200">{formatSeasonLabel(season)}</h3>
                    <p className="text-xs text-zinc-500">
                      {patches.length}개 패치
                      {season.number !== 0 &&
                        ` · ${season.startDate} ~ ${getSeasonEndDate(season) ?? '현재'}`}
                    </p>
                  </div>
                </div>

                {/* 패치 목록 */}
                <div className="relative space-y-4">
                  {/* 타임라인 라인 */}
                  <div
                    className="absolute bottom-0 left-6 top-0 w-px bg-linear-to-b from-amber-500/50 via-[#2a2d35] to-transparent"
                    aria-hidden="true"
                  />

                  {patches.map((patch, index) => (
                    <article key={patch.patchId} className="relative pl-16">
                      {/* 타임라인 도트 */}
                      <div
                        className={`absolute left-4 top-5 h-4 w-4 rounded-full border-2 ${
                          index === 0
                            ? 'border-amber-500 bg-amber-500'
                            : 'border-[#2a2d35] bg-[#13151a]'
                        }`}
                        aria-hidden="true"
                      />

                      <div className="rounded-xl border border-[#2a2d35] bg-[#13151a] p-4">
                        {/* 패치 메타 */}
                        <div className="mb-3 flex items-center gap-2">
                          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-sm font-bold text-amber-400">
                            v{patch.patchVersion}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {formatDate(patch.patchDate)}
                          </span>
                        </div>

                        {/* 버그 목록 */}
                        <ul className="space-y-2">
                          {patch.bugs.map((bug, bugIndex) => (
                            <li key={bugIndex} className="flex gap-2 text-sm text-zinc-300">
                              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/60" />
                              <span>{bug}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 시즌 네비게이션 */}
        <SeasonNav seasons={seasons} />
      </main>
    </div>
  );
}
