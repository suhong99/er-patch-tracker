'use client';

import Link from 'next/link';
import type { PatchEntry, ChangeType } from '@/types/patch';

type PatchCharacterEntry = {
  characterName: string;
  patchEntry: PatchEntry;
};

type Props = {
  characters: PatchCharacterEntry[];
  patchId: number;
};

function getChangeTypeStyle(type: ChangeType): string {
  switch (type) {
    case 'buff':
      return 'bg-emerald-900/30 border-emerald-500/30 text-emerald-400';
    case 'nerf':
      return 'bg-rose-900/30 border-rose-500/30 text-rose-400';
    case 'mixed':
      return 'bg-amber-900/30 border-amber-500/30 text-amber-400';
  }
}

function getChangeTypeLabel(type: ChangeType): string {
  switch (type) {
    case 'buff':
      return '상향';
    case 'nerf':
      return '하향';
    case 'mixed':
      return '조정';
  }
}

export function PatchCharacterList({ characters, patchId }: Props): React.JSX.Element {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-white">영향받은 캐릭터</h2>

      <div className="grid gap-4">
        {characters.map(({ characterName, patchEntry }) => (
          <div
            key={characterName}
            className="p-4 bg-[var(--er-surface)] border border-[var(--er-border)] rounded-lg"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <Link
                  href={`/admin/character/${encodeURIComponent(characterName)}`}
                  className="text-lg font-medium text-white hover:text-violet-400 transition-colors"
                >
                  {characterName}
                </Link>
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded border ${getChangeTypeStyle(
                    patchEntry.overallChange
                  )}`}
                >
                  {getChangeTypeLabel(patchEntry.overallChange)}
                </span>
                {patchEntry.streak > 1 && (
                  <span className="text-xs text-gray-400">{patchEntry.streak}연속</span>
                )}
              </div>
              <Link
                href={`/admin/character/${encodeURIComponent(characterName)}?highlight=${patchId}`}
                className="shrink-0 px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors border border-[var(--er-border)] rounded hover:border-violet-500/50"
              >
                수정하기
              </Link>
            </div>

            {patchEntry.devComment && (
              <p className="text-sm text-gray-400 mb-3 italic">
                &quot;{patchEntry.devComment.slice(0, 100)}
                {patchEntry.devComment.length > 100 ? '...' : ''}&quot;
              </p>
            )}

            <div className="space-y-1">
              {patchEntry.changes.slice(0, 5).map((change, idx) => (
                <div key={idx} className="text-sm text-gray-300">
                  <span className="text-gray-500">[{change.target}]</span>{' '}
                  {'stat' in change && change.stat ? (
                    <>
                      {change.stat}: {change.before} → {change.after}
                    </>
                  ) : (
                    'description' in change && change.description
                  )}
                </div>
              ))}
              {patchEntry.changes.length > 5 && (
                <p className="text-sm text-gray-500">+{patchEntry.changes.length - 5}개 더...</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
