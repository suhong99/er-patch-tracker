'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { AddCharacterModal } from '@/components/admin/AddCharacterModal';
import type { CharacterStatEntry } from '@/lib/stats-data';

type AdminStatsListProps = {
  entries: CharacterStatEntry[];
  allCharacterNames: string[];
};

export function AdminStatsList({
  entries,
  allCharacterNames,
}: AdminStatsListProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);

  const statsMap = useMemo(() => new Map(entries.map((e) => [e.name, e])), [entries]);

  const filteredNames = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allCharacterNames;
    return allCharacterNames.filter((n) => n.toLowerCase().includes(q));
  }, [allCharacterNames, searchQuery]);

  const handleSuccess = (): void => {
    setShowModal(false);
    window.location.reload();
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="실험체 검색..."
          className="flex-1 max-w-md px-4 py-2 bg-er-surface border border-er-border rounded-lg text-white placeholder-gray-500 focus:outline-hidden focus:ring-2 focus:ring-violet-500"
        />
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm transition-colors whitespace-nowrap"
        >
          + 실험체 추가
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {filteredNames.map((name) => {
          const entry = statsMap.get(name);
          const hasStats = !!entry;

          return (
            <Link
              key={name}
              href={`/admin/stats/${encodeURIComponent(name)}`}
              className="block p-4 bg-er-surface border border-er-border rounded-lg hover:border-violet-500/50 hover:bg-er-surface-light transition-all"
            >
              <div className="text-white font-medium mb-1 truncate">{name}</div>
              {hasStats ? (
                <div className="text-xs text-gray-400">
                  <div className="text-emerald-400/80 mb-0.5">스탯 있음</div>
                  <div>{entry.baseStats.weaponStats.length}개 무기</div>
                </div>
              ) : (
                <div className="text-xs text-amber-400/80">스탯 없음</div>
              )}
            </Link>
          );
        })}
      </div>

      {filteredNames.length === 0 && (
        <div className="text-center py-12 text-gray-400">검색 결과가 없습니다.</div>
      )}

      {showModal && (
        <AddCharacterModal onClose={() => setShowModal(false)} onSuccess={handleSuccess} />
      )}
    </>
  );
}
