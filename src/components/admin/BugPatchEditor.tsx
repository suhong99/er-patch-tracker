'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type BugFix = {
  character: string | null;
  description: string;
};

type Props = {
  patchId: number;
  initialBugFixes: BugFix[];
  characterNames: string[];
};

export function BugPatchEditor({
  patchId,
  initialBugFixes,
  characterNames,
}: Props): React.JSX.Element {
  const { user } = useAuth();
  const [bugFixes, setBugFixes] = useState<BugFix[]>(initialBugFixes);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = (index: number, field: keyof BugFix, value: string): void => {
    setBugFixes((prev) =>
      prev.map((bug, i) =>
        i === index
          ? { ...bug, [field]: field === 'character' && value === '' ? null : value }
          : bug
      )
    );
    setSaved(false);
  };

  const handleAdd = (): void => {
    setBugFixes((prev) => [...prev, { character: null, description: '' }]);
    setSaved(false);
  };

  const handleDelete = (index: number): void => {
    setBugFixes((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
  };

  const handleSave = async (): Promise<void> => {
    if (!user) return;
    setSaving(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/bugs/patches/${patchId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bugFixes }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? '저장 실패');
      }

      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류 발생');
    } finally {
      setSaving(false);
    }
  };

  const charBugs = bugFixes.filter((b) => b.character !== null);
  const generalBugs = bugFixes.filter((b) => b.character === null);

  return (
    <div className="space-y-6">
      {/* 툴바 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          총 <span className="text-white font-mono">{bugFixes.length}</span>개 항목
          {charBugs.length > 0 && (
            <span className="ml-2 text-amber-400">
              (실험체 {charBugs.length}개 / 일반 {generalBugs.length}개)
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAdd}
            className="px-3 py-1.5 bg-violet-600/20 border border-violet-500/30 rounded text-sm text-violet-400 hover:bg-violet-600/30 transition-colors"
          >
            + 항목 추가
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded text-sm text-white font-medium transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {saved && (
        <div className="px-4 py-2 bg-emerald-900/30 border border-emerald-500/30 rounded text-sm text-emerald-400">
          ✅ 저장 완료 (캐릭터 통계 재계산됨)
        </div>
      )}
      {error && (
        <div className="px-4 py-2 bg-rose-900/30 border border-rose-500/30 rounded text-sm text-rose-400">
          ❌ {error}
        </div>
      )}

      {/* 버그 목록 */}
      <div className="space-y-2">
        {bugFixes.map((bug, index) => (
          <div
            key={index}
            className="flex gap-2 items-start p-3 bg-er-surface border border-er-border rounded-lg"
          >
            {/* 번호 */}
            <span className="mt-2.5 text-xs font-mono text-gray-600 w-6 shrink-0 text-right">
              {index + 1}
            </span>

            {/* 실험체 선택 */}
            <select
              value={bug.character ?? ''}
              onChange={(e) => handleUpdate(index, 'character', e.target.value)}
              className="w-36 shrink-0 px-2 py-2 bg-[#1a1d24] border border-er-border rounded text-sm text-white focus:outline-hidden focus:border-violet-500"
            >
              <option value="">일반 버그</option>
              {characterNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            {/* 설명 */}
            <input
              type="text"
              value={bug.description}
              onChange={(e) => handleUpdate(index, 'description', e.target.value)}
              placeholder="버그 수정 내용"
              className="flex-1 px-3 py-2 bg-[#1a1d24] border border-er-border rounded text-sm text-white placeholder-gray-600 focus:outline-hidden focus:border-violet-500"
            />

            {/* 삭제 */}
            <button
              onClick={() => handleDelete(index)}
              className="mt-1.5 p-1.5 text-gray-600 hover:text-rose-400 transition-colors"
              aria-label="삭제"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {bugFixes.length === 0 && (
        <div className="py-12 text-center text-gray-500 border border-dashed border-er-border rounded-lg">
          버그 수정 항목이 없습니다.
        </div>
      )}
    </div>
  );
}
