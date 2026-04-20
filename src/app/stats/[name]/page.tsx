import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  loadAllStats,
  STAT_CATEGORIES,
  getRankings,
  getWeaponStatRanking,
  getCharacterWeaponRank,
  getRankForWeaponCombo,
} from '@/lib/stats-data';
import { loadImageMap } from '@/lib/patch-data';
import CharacterImage from '@/components/CharacterImage';

type Props = {
  params: Promise<{ name: string }>;
};

export async function generateStaticParams(): Promise<Array<{ name: string }>> {
  const allStats = await loadAllStats();
  return allStats.map((c) => ({ name: encodeURIComponent(c.name) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  return {
    title: `${decodedName} 스텟`,
    description: `이터널 리턴 ${decodedName}의 기본 스텟과 전체 순위를 확인하세요.`,
  };
}

type StatCardData = {
  key: string;
  label: string;
  description: string;
  statKey: string;
  value: number;
  growth: number | null;
  rankInfo: { rank: number; total: number } | undefined;
  minVal: number;
  maxVal: number;
  barClass: string;
  textClass: string;
  bgClass: string;
  formatValue: (v: number) => string;
};

export default async function StatsDetailPage({ params }: Props): Promise<React.JSX.Element> {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  const [allStats, imageMap] = await Promise.all([loadAllStats(), loadImageMap()]);
  const character = allStats.find((c) => c.name === decodedName);

  if (!character) notFound();

  const weaponRankings = {
    attackSpeedGrowth: getWeaponStatRanking(allStats, 'attackSpeedGrowth'),
    basicAttackAmpGrowth: getWeaponStatRanking(allStats, 'basicAttackAmpGrowth'),
    skillAmpGrowth: getWeaponStatRanking(allStats, 'skillAmpGrowth'),
  };

  const statCardData: StatCardData[] = STAT_CATEGORIES.flatMap((config) => {
    const value = config.getValue(character.baseStats);
    if (value === null) return [];

    const validValues = allStats
      .filter((e) => config.getValue(e.baseStats) !== null)
      .map((e) => config.getValue(e.baseStats) as number)
      .sort((a, b) => a - b);

    let rankInfo: { rank: number; total: number } | undefined;
    if (config.weaponStatKey) {
      const weaponRanking = getWeaponStatRanking(allStats, config.weaponStatKey);
      rankInfo = getCharacterWeaponRank(weaponRanking, character.name);
    } else {
      rankInfo = getRankings(allStats, config).get(character.name);
    }

    return [
      {
        key: config.key,
        label: config.label,
        description: config.description,
        statKey: config.key,
        value,
        growth: config.getGrowth(character.baseStats),
        rankInfo,
        minVal: validValues[0] ?? 0,
        maxVal: validValues[validValues.length - 1] ?? 1,
        barClass: config.barClass,
        textClass: config.textClass,
        bgClass: config.bgClass,
        formatValue: config.formatValue,
      },
    ];
  });

  const baseCards = statCardData.filter(
    (d) => STAT_CATEGORIES.find((c) => c.key === d.key)?.section === 'base'
  );
  const lv20Cards = statCardData.filter(
    (d) => STAT_CATEGORIES.find((c) => c.key === d.key)?.section === 'lv20'
  );
  const weaponCards = statCardData.filter(
    (d) => STAT_CATEGORIES.find((c) => c.key === d.key)?.section === 'weapon'
  );

  const renderStatCard = (d: StatCardData): React.JSX.Element => {
    const range = d.maxVal === d.minVal ? 1 : d.maxVal - d.minVal;
    const pct = Math.round(((d.value - d.minVal) / range) * 100);

    return (
      <div key={d.key} className={`rounded-xl border border-[#2a2d35] p-4 ${d.bgClass}`}>
        {/* 라벨 + 랭크 */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-zinc-300">{d.label}</span>
          {d.rankInfo && (
            <Link
              href={`/stats?stat=${d.statKey}`}
              className={`shrink-0 rounded-md bg-black/30 px-2 py-0.5 text-xs font-bold ${d.textClass} transition-opacity hover:opacity-70`}
            >
              {d.rankInfo.rank}위 / {d.rankInfo.total}
            </Link>
          )}
        </div>

        {/* 값 */}
        <p className={`font-mono text-3xl font-black ${d.textClass}`}>{d.formatValue(d.value)}</p>

        {/* 성장치 */}
        {d.growth !== null && (
          <p className="mt-1 text-xs text-zinc-500">
            레벨당 <span className="font-mono text-zinc-400">+{d.growth}</span>
          </p>
        )}

        {/* 바 (전체 분포 내 위치) */}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/30">
          <div
            className={`h-full rounded-full bg-linear-to-r ${d.barClass}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-zinc-600">
          <span>{d.formatValue(d.minVal)}</span>
          <span>{d.formatValue(d.maxVal)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0b0f]">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.07),transparent_50%)]"
        aria-hidden="true"
      />

      <main className="relative mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* 뒤로가기 */}
        <nav aria-label="뒤로가기" className="mb-8">
          <Link
            href="/stats"
            className="group inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-indigo-400"
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
            스텟 랭킹으로 돌아가기
          </Link>
        </nav>

        {/* 캐릭터 헤더 */}
        <header className="mb-10 flex items-center gap-5">
          <CharacterImage name={character.name} imageUrl={imageMap[character.name]} size="lg" />
          <div>
            <h1 className="bg-linear-to-r from-white to-zinc-400 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl">
              {character.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-zinc-500">기본 스텟</p>
              <span className="text-zinc-700">·</span>
              <Link
                href={`/character/${encodeURIComponent(character.name)}`}
                className="text-sm text-zinc-500 transition-colors hover:text-violet-400"
              >
                패치 히스토리 보기 →
              </Link>
            </div>
          </div>
        </header>

        {/* 기본 스텟 (Lv.1) */}
        {baseCards.length > 0 && (
          <section aria-labelledby="base-stats-heading" className="mb-10">
            <h2 id="base-stats-heading" className="mb-4 text-lg font-bold text-zinc-200">
              기본 스텟
              <span className="ml-2 text-sm font-normal text-zinc-600">Lv.1</span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {baseCards.map(renderStatCard)}
            </div>
          </section>
        )}

        {/* 레벨 20 최종 스텟 */}
        {lv20Cards.length > 0 && (
          <section aria-labelledby="lv20-stats-heading" className="mb-10">
            <h2 id="lv20-stats-heading" className="mb-4 text-lg font-bold text-zinc-200">
              최종 스텟
              <span className="ml-2 text-sm font-normal text-zinc-600">
                Lv.20 · 기본 + 성장 × 19
              </span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {lv20Cards.map(renderStatCard)}
            </div>
          </section>
        )}

        {/* 무기 성장치 */}
        {weaponCards.length > 0 && (
          <section aria-labelledby="weapon-growth-heading" className="mb-10">
            <h2 id="weapon-growth-heading" className="mb-4 text-lg font-bold text-zinc-200">
              무기 성장치
              <span className="ml-2 text-sm font-normal text-zinc-600">무기군 최댓값 기준</span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {weaponCards.map(renderStatCard)}
            </div>
          </section>
        )}

        {/* 무기군별 상세 */}
        {character.baseStats.weaponStats.length > 0 && (
          <section aria-labelledby="weapon-stats-heading">
            <h2 id="weapon-stats-heading" className="mb-4 text-lg font-bold text-zinc-200">
              무기군별 상세
            </h2>
            <div className="overflow-hidden rounded-xl border border-[#2a2d35] bg-[#13151a]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2d35]">
                      <th className="px-4 py-3 text-left font-semibold text-zinc-400">무기군</th>
                      <th className="px-4 py-3 text-right font-semibold text-zinc-400">
                        공속 성장
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-zinc-400">
                        기공 증폭
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-zinc-400">
                        스킬 증폭
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {character.baseStats.weaponStats.map((ws) => {
                      const atkRank = getRankForWeaponCombo(
                        weaponRankings.attackSpeedGrowth,
                        character.name,
                        ws.weaponType
                      );
                      const ampRank = getRankForWeaponCombo(
                        weaponRankings.basicAttackAmpGrowth,
                        character.name,
                        ws.weaponType
                      );
                      const skillRank = getRankForWeaponCombo(
                        weaponRankings.skillAmpGrowth,
                        character.name,
                        ws.weaponType
                      );

                      return (
                        <tr key={ws.weaponType} className="border-b border-[#1a1d24] last:border-0">
                          <td className="px-4 py-3 font-medium text-zinc-200">{ws.weaponType}</td>
                          <td className="px-4 py-3 text-right">
                            {ws.attackSpeedGrowth !== null ? (
                              <div className="flex items-center justify-end gap-2">
                                {atkRank && (
                                  <span className="text-xs text-zinc-500">
                                    {atkRank.rank}위/{atkRank.total}
                                  </span>
                                )}
                                <span className="font-mono text-purple-400">
                                  +{ws.attackSpeedGrowth}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-zinc-600">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {ws.basicAttackAmpGrowth !== null ? (
                              <div className="flex items-center justify-end gap-2">
                                {ampRank && (
                                  <span className="text-xs text-zinc-500">
                                    {ampRank.rank}위/{ampRank.total}
                                  </span>
                                )}
                                <span className="font-mono text-cyan-400">
                                  +{ws.basicAttackAmpGrowth}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-zinc-600">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {ws.skillAmpGrowth !== null ? (
                              <div className="flex items-center justify-end gap-2">
                                {skillRank && (
                                  <span className="text-xs text-zinc-500">
                                    {skillRank.rank}위/{skillRank.total}
                                  </span>
                                )}
                                <span className="font-mono text-orange-400">
                                  +{ws.skillAmpGrowth}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-zinc-600">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
