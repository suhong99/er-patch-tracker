'use client';

import type { PatchEntry } from '@/types/patch';
import { isNumericChange } from '@/types/patch';
import { getChangeTypeLabel, getChangeTypeBgColor, formatDate } from '@/lib/patch-utils';

type PatchCardItemProps = {
  patch: PatchEntry;
  patchLink?: string;
  onEdit: () => void;
  onDelete: () => void;
};

export function PatchCardItem({
  patch,
  patchLink,
  onEdit,
  onDelete,
}: PatchCardItemProps): React.JSX.Element {
  return (
    <div className="p-4 bg-[var(--er-surface)] border border-[var(--er-border)] rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${getChangeTypeBgColor(patch.overallChange)}`}
          >
            {getChangeTypeLabel(patch.overallChange)}
          </span>
          <span className="text-white font-medium">{patch.patchVersion}</span>
          <span className="text-gray-500 text-xs">(ID: {patch.patchId})</span>
          <span className="text-gray-400 text-sm">{formatDate(patch.patchDate)}</span>
        </div>
        <div className="flex items-center gap-2">
          {patchLink && (
            <a
              href={patchLink}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-gray-600/20 border border-gray-500/30 rounded text-sm text-gray-400 hover:bg-gray-600/30 transition-colors"
            >
              원문
            </a>
          )}
          <button
            onClick={onEdit}
            className="px-3 py-1.5 bg-violet-600/20 border border-violet-500/30 rounded text-sm text-violet-400 hover:bg-violet-600/30 transition-colors"
          >
            수정
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 bg-rose-600/20 border border-rose-500/30 rounded text-sm text-rose-400 hover:bg-rose-600/30 transition-colors"
          >
            삭제
          </button>
        </div>
      </div>

      {patch.devComment && (
        <p className="text-sm text-gray-400 mb-3 italic">&quot;{patch.devComment}&quot;</p>
      )}

      <div className="space-y-2">
        {patch.changes.map((change, index) => (
          <div key={index} className="text-sm p-2 bg-[#1a1c23] rounded flex items-start gap-2">
            <span
              className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${getChangeTypeBgColor(change.changeType)}`}
            >
              {getChangeTypeLabel(change.changeType)}
            </span>
            <span className="text-gray-500 shrink-0">{change.target}</span>
            {isNumericChange(change) ? (
              <>
                <span className="text-gray-400">{change.stat}:</span>
                <span className="text-rose-400 line-through">{change.before}</span>
                <span className="text-gray-500">→</span>
                <span className="text-emerald-400">{change.after}</span>
              </>
            ) : (
              <span className="text-gray-300 whitespace-pre-line">{change.description}</span>
            )}
            {change.changeCategory && (
              <span className="ml-auto text-xs text-gray-500">[{change.changeCategory}]</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
