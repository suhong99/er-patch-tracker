'use client';

import type { Change, ChangeType } from '@/types/patch';

type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';

type ExtendedChange = Change & {
  changeCategory?: ChangeCategory;
};

type ChangeEditRowProps = {
  change: ExtendedChange;
  index: number;
  onChange: (index: number, updated: ExtendedChange) => void;
  onDelete: (index: number) => void;
};

const CHANGE_TYPES: { value: ChangeType; label: string; color: string }[] = [
  { value: 'buff', label: '상향', color: 'text-emerald-400' },
  { value: 'nerf', label: '하향', color: 'text-rose-400' },
  { value: 'mixed', label: '조정', color: 'text-amber-400' },
];

const CHANGE_CATEGORIES: { value: ChangeCategory; label: string }[] = [
  { value: 'numeric', label: '수치 변경' },
  { value: 'mechanic', label: '메커니즘' },
  { value: 'added', label: '효과 추가' },
  { value: 'removed', label: '효과 제거' },
  { value: 'unknown', label: '미분류' },
];

export function ChangeEditRow({
  change,
  index,
  onChange,
  onDelete,
}: ChangeEditRowProps): React.JSX.Element {
  const handleFieldChange = (field: keyof ExtendedChange, value: string): void => {
    onChange(index, { ...change, [field]: value });
  };

  return (
    <div className="p-4 bg-[#1a1c23] border border-[var(--er-border)] rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">#{index + 1}</span>
        <button
          type="button"
          onClick={() => onDelete(index)}
          className="text-xs text-rose-400 hover:text-rose-300"
        >
          삭제
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">스킬/대상</label>
          <input
            type="text"
            value={change.target}
            onChange={(e) => handleFieldChange('target', e.target.value)}
            className="w-full px-3 py-2 bg-[var(--er-surface)] border border-[var(--er-border)] rounded text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">스탯</label>
          <input
            type="text"
            value={change.stat}
            onChange={(e) => handleFieldChange('stat', e.target.value)}
            className="w-full px-3 py-2 bg-[var(--er-surface)] border border-[var(--er-border)] rounded text-sm text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">변경 전</label>
          <input
            type="text"
            value={change.before}
            onChange={(e) => handleFieldChange('before', e.target.value)}
            className="w-full px-3 py-2 bg-[var(--er-surface)] border border-[var(--er-border)] rounded text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">변경 후</label>
          <input
            type="text"
            value={change.after}
            onChange={(e) => handleFieldChange('after', e.target.value)}
            className="w-full px-3 py-2 bg-[var(--er-surface)] border border-[var(--er-border)] rounded text-sm text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">변경 타입</label>
          <select
            value={change.changeType}
            onChange={(e) => handleFieldChange('changeType', e.target.value)}
            className="w-full px-3 py-2 bg-[var(--er-surface)] border border-[var(--er-border)] rounded text-sm text-white"
          >
            {CHANGE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">카테고리</label>
          <select
            value={change.changeCategory || 'unknown'}
            onChange={(e) => handleFieldChange('changeCategory', e.target.value)}
            className="w-full px-3 py-2 bg-[var(--er-surface)] border border-[var(--er-border)] rounded text-sm text-white"
          >
            {CHANGE_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
