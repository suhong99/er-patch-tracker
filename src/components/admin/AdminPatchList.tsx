'use client';

import { useState } from 'react';
import type { PatchEntry } from '@/types/patch';
import { PatchEditForm } from './PatchEditForm';
import { PatchCardItem } from './PatchCardItem';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { useAuth } from '@/contexts/AuthContext';

type AdminPatchListProps = {
  characterName: string;
  patches: PatchEntry[];
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
  const [patchList, setPatchList] = useState<PatchEntry[]>(patches);
  const [editingPatch, setEditingPatch] = useState<PatchEntry | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  const [deletingPatchId, setDeletingPatchId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalculateResult, setRecalculateResult] = useState<RecalculateResult | null>(null);
  const { getIdToken } = useAuth();

  const handleSave = (updatedPatch: PatchEntry): void => {
    setPatchList((prev) =>
      prev.map((p) => (p.patchId === updatedPatch.patchId ? updatedPatch : p))
    );
    setEditingPatch(null);
  };

  const handleAddSave = (newPatch: PatchEntry): void => {
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
        <PatchCardItem
          key={patch.patchId}
          patch={patch}
          patchLink={patchLinks[patch.patchId]}
          onEdit={() => setEditingPatch(patch)}
          onDelete={() => setDeletingPatchId(patch.patchId)}
        />
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
        <DeleteConfirmDialog
          title="패치 삭제 확인"
          message="이 패치를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
          isDeleting={isDeleting}
          onConfirm={() => handleDelete(deletingPatchId)}
          onCancel={() => setDeletingPatchId(null)}
        />
      )}
    </div>
  );
}
