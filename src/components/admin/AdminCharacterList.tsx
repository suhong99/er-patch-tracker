'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Character } from '@/types/patch';

type AdminCharacterListProps = {
  characters: Character[];
};

export function AdminCharacterList({ characters }: AdminCharacterListProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCharacters = useMemo(() => {
    if (!searchQuery.trim()) return characters;
    const query = searchQuery.toLowerCase();
    return characters.filter((char) => char.name.toLowerCase().includes(query));
  }, [characters, searchQuery]);

  return (
    <div>
      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="캐릭터 검색..."
          className="w-full max-w-md px-4 py-2 bg-[var(--er-surface)] border border-[var(--er-border)] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {filteredCharacters.map((character) => (
          <Link
            key={character.name}
            href={`/admin/character/${encodeURIComponent(character.name)}`}
            className="block p-4 bg-[var(--er-surface)] border border-[var(--er-border)] rounded-lg hover:border-violet-500/50 hover:bg-[var(--er-surface-hover)] transition-all"
          >
            <div className="text-white font-medium mb-1">{character.name}</div>
            <div className="text-xs text-gray-400">
              {character.stats.totalPatches}개 패치
            </div>
            <div className="flex gap-2 mt-2 text-xs">
              <span className="text-emerald-400">+{character.stats.buffCount}</span>
              <span className="text-rose-400">-{character.stats.nerfCount}</span>
              <span className="text-amber-400">~{character.stats.mixedCount}</span>
            </div>
          </Link>
        ))}
      </div>

      {filteredCharacters.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          검색 결과가 없습니다.
        </div>
      )}
    </div>
  );
}
