'use client';

import Link from 'next/link';
import type { Character, ChangeType } from '@/types/patch';
import {
  getChangeTypeColor,
  formatDate,
} from '@/lib/patch-utils';

type Props = {
  character: Character;
};

// 순수 함수: 스트릭 아이콘 렌더링
const renderStreakIcon = (type: ChangeType | null): string => {
  if (!type) return '';
  const icons: Record<ChangeType, string> = {
    buff: '▲',
    nerf: '▼',
    mixed: '◆',
  };
  return icons[type] ?? '';
};

// 순수 함수: 퍼센트 계산
const calculatePercent = (value: number, total: number): number =>
  total > 0 ? Math.round((value / total) * 100) : 0;

export default function CharacterCard({ character }: Props): React.ReactElement {
  const { name, stats, patchHistory } = character;
  const latestPatch = patchHistory[0];
  const streakType = stats.currentStreak.type;

  const buffPercent = calculatePercent(stats.buffCount, stats.totalPatches);
  const nerfPercent = calculatePercent(stats.nerfCount, stats.totalPatches);
  const mixedPercent = calculatePercent(stats.mixedCount, stats.totalPatches);

  return (
    <Link href={`/character/${encodeURIComponent(name)}`}>
      <div className="group relative overflow-hidden rounded-lg border border-[#2a2d35] bg-[#13151a] p-5 transition-all duration-300 hover:border-violet-500/50 hover:shadow-[0_0_30px_rgba(139,92,246,0.15)]">
        {/* 배경 그라데이션 효과 */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-cyan-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* 헤더 */}
        <div className="relative mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-100 transition-colors group-hover:text-violet-300">
              {name}
            </h3>
            <p className="text-sm text-zinc-500">
              총 <span className="font-mono text-cyan-400">{stats.totalPatches}</span>회 패치
            </p>
          </div>
          {streakType && stats.currentStreak.count > 0 && (
            <div
              className={`flex items-center gap-1 rounded border px-2 py-1 text-xs font-bold ${
                streakType === 'buff'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : streakType === 'nerf'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
              }`}
            >
              <span>{renderStreakIcon(streakType)}</span>
              <span>{stats.currentStreak.count}연속</span>
            </div>
          )}
        </div>

        {/* 통계 바 */}
        <div className="relative mb-4">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-[#1a1d24]">
            {stats.buffCount > 0 && (
              <div
                className="bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                style={{ width: `${buffPercent}%` }}
              />
            )}
            {stats.mixedCount > 0 && (
              <div
                className="bg-gradient-to-r from-amber-500 to-amber-400 transition-all"
                style={{ width: `${mixedPercent}%` }}
              />
            )}
            {stats.nerfCount > 0 && (
              <div
                className="bg-gradient-to-r from-rose-500 to-rose-400 transition-all"
                style={{ width: `${nerfPercent}%` }}
              />
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded bg-emerald-500/10 px-2 py-1.5">
              <span className="font-mono font-bold text-emerald-400">{stats.buffCount}</span>
              <span className="ml-1 text-zinc-500">상향</span>
            </div>
            <div className="rounded bg-amber-500/10 px-2 py-1.5">
              <span className="font-mono font-bold text-amber-400">{stats.mixedCount}</span>
              <span className="ml-1 text-zinc-500">조정</span>
            </div>
            <div className="rounded bg-rose-500/10 px-2 py-1.5">
              <span className="font-mono font-bold text-rose-400">{stats.nerfCount}</span>
              <span className="ml-1 text-zinc-500">하향</span>
            </div>
          </div>
        </div>

        {/* 최근 패치 */}
        {latestPatch && (
          <div className="relative border-t border-[#2a2d35] pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">최근</span>
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono font-bold ${getChangeTypeColor(latestPatch.overallChange)}`}
                >
                  v{latestPatch.patchVersion}
                </span>
                <span className="text-xs text-zinc-600">
                  {formatDate(latestPatch.patchDate)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 하단 글로우 라인 */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-violet-500 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>
    </Link>
  );
}
