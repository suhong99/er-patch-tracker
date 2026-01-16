'use client';

import { useState } from 'react';
import type { PatchEntry } from '@/types/patch';
import { isNumericChange } from '@/types/patch';
import { PatchEditForm } from './PatchEditForm';
import { getChangeTypeLabel, getChangeTypeBgColor, formatDate } from '@/lib/patch-utils';
import { useAuth } from '@/contexts/AuthContext';

type ExtendedPatchEntry = PatchEntry;

type AdminPatchListProps = {
  characterName: string;
  patches: ExtendedPatchEntry[];
  patchLinks: Record<number, string>;
};

type RecalculateResult = {
  success: boolean;
  message: string;
};

export function AdminPatchList({
  characterName,
  patches,
  patchLinks,
}: AdminPatchListProps): React.JSX.Element {
  const [patchList, setPatchList] = useState<ExtendedPatchEntry[]>(patches);
  const [editingPatch, setEditingPatch] = useState<ExtendedPatchEntry | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  const [deletingPatchId, setDeletingPatchId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalculateResult, setRecalculateResult] = useState<RecalculateResult | null>(null);
  const { getIdToken } = useAuth();

  const handleSave = (updatedPatch: ExtendedPatchEntry): void => {
    setPatchList((prev) =>
      prev.map((p) => (p.patchId === updatedPatch.patchId ? updatedPatch : p))
    );
    setEditingPatch(null);
  };

  const handleAddSave = (newPatch: ExtendedPatchEntry): void => {
    setPatchList((prev) => {
      const updated = [...prev, newPatch];
      // 날짜 내림차순 정렬
      return updated.sort(
        (a, b) => new Date(b.patchDate).getTime() - new Date(a.patchDate).getTime()
      );
    });
    setIsAddMode(false);
  };

  const handleDelete = async (patchId: number): Promise<void> => {
    if (isDeleting) return;

    setIsDeleting(true);

    try {
      const token = await getIdToken();
      if (!token) {
        alert('인증이 필요합니다.');
        return;
      }

      const response = await fetch(
        `/api/admin/characters/${encodeURIComponent(characterName)}/patches/${patchId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        setPatchList((prev) => prev.filter((p) => p.patchId !== patchId));
        setDeletingPatchId(null);
      } else {
        const data = await response.json();
        alert(data.error || '삭제 중 오류가 발생했습니다.');
      }
    } catch {
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRecalculateStreaks = async (): Promise<void> => {
    if (isRecalculating) return;

    setIsRecalculating(true);
    setRecalculateResult(null);

    try {
      const token = await getIdToken();
      if (!token) {
        setRecalculateResult({ success: false, message: '인증이 필요합니다.' });
        return;
      }

      const response = await fetch(
        `/api/admin/characters/${encodeURIComponent(characterName)}/recalculate-streaks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        setRecalculateResult({
          success: true,
          message: data.message,
        });
        // 페이지 새로고침으로 업데이트된 데이터 반영
        window.location.reload();
      } else {
        setRecalculateResult({
          success: false,
          message: data.error || '재계산 중 오류가 발생했습니다.',
        });
      }
    } catch {
      setRecalculateResult({
        success: false,
        message: '네트워크 오류가 발생했습니다.',
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">총 {patchList.length}개 패치</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddMode(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg transition-colors"
          >
            패치 추가
          </button>
          <button
            onClick={handleRecalculateStreaks}
            disabled={isRecalculating}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-800 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
          >
            {isRecalculating ? '재계산 중...' : '연속 재계산'}
          </button>
        </div>
      </div>

      {recalculateResult && !recalculateResult.success && (
        <div className="p-3 rounded-lg bg-rose-900/50 border border-rose-500/50 text-rose-300 text-sm">
          {recalculateResult.message}
        </div>
      )}
      {patchList.map((patch) => (
        <div
          key={patch.patchId}
          className="p-4 bg-[var(--er-surface)] border border-[var(--er-border)] rounded-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${getChangeTypeBgColor(patch.overallChange)}`}
              >
                {getChangeTypeLabel(patch.overallChange)}
              </span>
              <span className="text-white font-medium">{patch.patchVersion}</span>
              <span className="text-gray-400 text-sm">{formatDate(patch.patchDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              {patchLinks[patch.patchId] && (
                <a
                  href={patchLinks[patch.patchId]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-gray-600/20 border border-gray-500/30 rounded text-sm text-gray-400 hover:bg-gray-600/30 transition-colors"
                >
                  원문
                </a>
              )}
              <button
                onClick={() => setEditingPatch(patch)}
                className="px-3 py-1.5 bg-violet-600/20 border border-violet-500/30 rounded text-sm text-violet-400 hover:bg-violet-600/30 transition-colors"
              >
                수정
              </button>
              <button
                onClick={() => setDeletingPatchId(patch.patchId)}
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
      ))}

      {editingPatch && (
        <PatchEditForm
          characterName={characterName}
          patch={editingPatch}
          onSave={handleSave}
          onCancel={() => setEditingPatch(null)}
        />
      )}

      {isAddMode && (
        <PatchEditForm
          characterName={characterName}
          patch={null}
          onSave={handleAddSave}
          onCancel={() => setIsAddMode(false)}
        />
      )}

      {deletingPatchId !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--er-surface)] border border-[var(--er-border)] rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-white mb-4">패치 삭제 확인</h3>
            <p className="text-gray-400 mb-6">
              이 패치를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingPatchId(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => handleDelete(deletingPatchId)}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-800 text-white rounded-lg transition-colors"
              >
                {isDeleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
