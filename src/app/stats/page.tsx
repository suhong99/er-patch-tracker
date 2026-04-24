import type { Metadata } from 'next';
import Link from 'next/link';
import {
  loadAllStats,
  STAT_CATEGORIES,
  STAT_SECTIONS,
  findStatConfig,
  getWeaponStatRanking,
} from '@/lib/stats-data';
import { loadImageMap } from '@/lib/patch-data';
import CharacterImage from '@/components/CharacterImage';

export const metadata: Metadata = {
  title: '스텟 랭킹',
  description: '이터널 리턴 실험체별 기본 스텟을 비교하고 카테고리별 랭킹을 확인하세요.',
};

type Props = {
  searchParams: Promise<{ stat?: string }>;
};

type RankedItem = {
  characterName: string;
  weaponType: string | null;
  value: number;
  growth: number | null;
};

export default async function StatsPage({ searchParams }: Props): Promise<React.JSX.Element> {
  const { stat } = await searchParams;
  const config = findStatConfig(stat);

  const [allStats, imageMap] = await Promise.all([loadAllStats(), loadImageMap()]);

  const isWeaponStat = config.weaponStatKey !== undefined;

  const rankedItems: RankedItem[] = isWeaponStat
    ? getWeaponStatRanking(allStats, config.weaponStatKey!).map((e) => ({
        characterName: e.characterName,
        weaponType: e.weaponType,
        value: e.value,
        growth: null,
      }))
    : allStats
        .filter((c) => config.getValue(c.baseStats) !== null)
        .sort((a, b) => (config.getValue(b.baseStats) ?? 0) - (config.getValue(a.baseStats) ?? 0))
        .map((c) => ({
          characterName: c.name,
          weaponType: null,
          value: config.getValue(c.baseStats) ?? 0,
          growth: config.getGrowth(c.baseStats),
        }));

  const maxValue = rankedItems.length > 0 ? rankedItems[0].value : 1;

  const itemRanks: number[] = [];
  rankedItems.forEach((item, i) => {
    if (i === 0 || item.value !== rankedItems[i - 1].value) {
      itemRanks.push(i + 1);
    } else {
      itemRanks.push(itemRanks[i - 1]);
    }
  });

  return (
    <div className="min-h-screen bg-[#0a0b0f]">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.07),transparent_50%)]"
        aria-hidden="true"
      />

      <main className="relative mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {/* 헤더 */}
        <header className="mb-8">
          <h1 className="bg-linear-to-r from-indigo-300 via-violet-300 to-indigo-200 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl">
            스텟 랭킹
          </h1>
          <p className="mt-2 text-zinc-400">
            {isWeaponStat ? (
              <>
                캐릭터 × 무기군 조합 순위 ·{' '}
                <span className="font-mono text-indigo-400">{rankedItems.length}</span>개 집계
              </>
            ) : (
              <>
                실험체 기본 스텟 순위 ·{' '}
                <span className="font-mono text-indigo-400">{rankedItems.length}</span>명 집계
              </>
            )}
          </p>
        </header>

        {/* 카테고리 탭 - 섹션별 */}
        <nav className="mb-6 space-y-2" aria-label="스텟 카테고리">
          {STAT_SECTIONS.map(({ key: section, label: sectionLabel }) => {
            const cats = STAT_CATEGORIES.filter((c) => c.section === section);
            return (
              <div key={section} className="flex flex-wrap items-center gap-2">
                <span className="w-16 shrink-0 text-right text-xs text-zinc-600">
                  {sectionLabel}
                </span>
                {cats.map((cat) => {
                  const isActive = cat.key === config.key;
                  return (
                    <Link
                      key={cat.key}
                      href={`/stats?stat=${cat.key}`}
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                        isActive
                          ? `${cat.bgClass} ${cat.textClass}`
                          : 'bg-[#13151a] text-zinc-400 hover:bg-[#1a1d24] hover:text-zinc-200'
                      }`}
                    >
                      {cat.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <p className="mb-5 text-sm text-zinc-500">{config.description}</p>

        {/* 랭킹 리스트 */}
        <div className="space-y-2">
          {rankedItems.map((item, index) => {
            const pct = Math.round((item.value / maxValue) * 100);
            const rank = itemRanks[index];

            return (
              <Link
                key={`${item.characterName}-${item.weaponType ?? ''}-${index}`}
                href={`/stats/${encodeURIComponent(item.characterName)}`}
                className="group flex items-center gap-4 rounded-xl border border-[#2a2d35] bg-[#13151a] px-4 py-3 transition-all duration-200 hover:border-indigo-500/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.1)]"
              >
                {/* 순위 */}
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black ${
                    rank === 1
                      ? 'bg-yellow-400/20 text-yellow-300'
                      : rank === 2
                        ? 'bg-zinc-400/10 text-zinc-300'
                        : rank === 3
                          ? 'bg-orange-700/20 text-orange-400'
                          : 'bg-[#1a1d24] text-zinc-500'
                  }`}
                >
                  {rank}
                </div>

                {/* 이미지 */}
                <CharacterImage
                  name={item.characterName}
                  imageUrl={imageMap[item.characterName]}
                  size="sm"
                />

                {/* 이름 + 무기군 배지 + 바 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold text-zinc-100 transition-colors group-hover:text-indigo-300">
                        {item.characterName}
                      </span>
                      {item.weaponType && (
                        <span className="shrink-0 rounded-md bg-[#1a1d24] px-2 py-0.5 text-xs text-zinc-400">
                          {item.weaponType}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-sm">
                      {item.growth !== null && (
                        <span className="text-zinc-500">+{item.growth}</span>
                      )}
                      <span className={`font-mono font-bold ${config.textClass}`}>
                        {config.formatValue(item.value)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#1a1d24]">
                    <div
                      className={`h-full rounded-full bg-linear-to-r ${config.barClass} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
