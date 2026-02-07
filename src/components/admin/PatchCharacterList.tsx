'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PatchEntry } from '@/types/patch';
import { PatchEditForm } from './PatchEditForm';
import { PatchCardItem } from './PatchCardItem';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { useAuth } from '@/contexts/AuthContext';

type PatchCharacterEntry = {
  characterName: string;
  patchEntry: PatchEntry;
};

type Props = {
  characters: PatchCharacterEntry[];
  patchId: number;
  patchLinks: Record<number, string>;
};

export function PatchCharacterList({
  characters: initialCharacters,
  patchId,
  patchLinks,
}: Props): React.JSX.Element {
  const [characters, setCharacters] = useState<PatchCharacterEntry[]>(initialCharacters);
  const [editingEntry, setEditingEntry] = useState<{
    characterName: string;
    patch: PatchEntry;
  } | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<{
    characterName: string;
    patchId: number;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [removingCharacter, setRemovingCharacter] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isAddCharacterMode, setIsAddCharacterMode] = useState(false);
  const [newCharacterName, setNewCharacterName] = useState('');
  const [addingCharacterName, setAddingCharacterName] = useState<string | null>(null);
  const { getIdToken } = useAuth();

  const handleEditSave =
    (characterName: string) =>
    (updatedPatch: PatchEntry): void => {
      setCharacters((prev) =>
        prev.map((entry) =>
          entry.characterName === characterName ? { ...entry, patchEntry: updatedPatch } : entry
        )
      );
      setEditingEntry(null);
    };

  const handleDelete = async (characterName: string, targetPatchId: number): Promise<void> => {
    if (isDeleting) return;
    setIsDeleting(true);

    try {
      const token = await getIdToken();
      if (!token) {
        alert('인증이 필요합니다.');
        return;
      }

      const response = await fetch(
        `/api/admin/characters/${encodeURIComponent(characterName)}/patches/${targetPatchId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        setCharacters((prev) => prev.filter((entry) => entry.characterName !== characterName));
        setDeletingEntry(null);
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

  const handleRemoveCharacter = async (characterName: string): Promise<void> => {
    if (isRemoving) return;
    setIsRemoving(true);

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
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        setCharacters((prev) => prev.filter((entry) => entry.characterName !== characterName));
        setRemovingCharacter(null);
      } else {
        const data = await response.json();
        alert(data.error || '삭제 중 오류가 발생했습니다.');
      }
    } catch {
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleAddCharacterSubmit = (): void => {
    const trimmed = newCharacterName.trim();
    if (!trimmed) return;

    const alreadyExists = characters.some((c) => c.characterName === trimmed);
    if (alreadyExists) {
      alert('이미 이 패치에 포함된 실험체입니다.');
      return;
    }

    setAddingCharacterName(trimmed);
    setIsAddCharacterMode(false);
    setNewCharacterName('');
  };

  const handleAddCharacterSave = (newPatch: PatchEntry): void => {
    if (!addingCharacterName) return;
    setCharacters((prev) => {
      const updated = [...prev, { characterName: addingCharacterName, patchEntry: newPatch }];
      return updated.sort((a, b) => a.characterName.localeCompare(b.characterName, 'ko'));
    });
    setAddingCharacterName(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">영향받은 캐릭터 ({characters.length}명)</h2>
        <button
          onClick={() => setIsAddCharacterMode(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg transition-colors"
        >
          실험체 추가
        </button>
      </div>

      {isAddCharacterMode && (
        <div className="p-4 bg-[var(--er-surface)] border border-emerald-500/30 rounded-lg">
          <h3 className="text-sm font-medium text-white mb-3">실험체 추가</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={newCharacterName}
              onChange={(e) => setNewCharacterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddCharacterSubmit();
              }}
              placeholder="캐릭터 이름 입력"
              className="flex-1 px-3 py-2 bg-[#1a1c23] border border-[var(--er-border)] rounded text-white text-sm placeholder-gray-500 focus:border-emerald-500/50 focus:outline-none"
            />
            <button
              onClick={handleAddCharacterSubmit}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded transition-colors"
            >
              다음
            </button>
            <button
              onClick={() => {
                setIsAddCharacterMode(false);
                setNewCharacterName('');
              }}
              className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {characters.map(({ characterName, patchEntry }) => (
        <div key={characterName} className="space-y-3">
          <div className="flex items-center justify-between">
            <Link
              href={`/admin/character/${encodeURIComponent(characterName)}`}
              className="text-lg font-medium text-white hover:text-violet-400 transition-colors"
            >
              {characterName}
            </Link>
            <button
              onClick={() => setRemovingCharacter(characterName)}
              className="px-3 py-1 text-xs text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded hover:bg-rose-600/10 transition-colors"
            >
              실험체 제거
            </button>
          </div>

          <PatchCardItem
            patch={patchEntry}
            patchLink={patchLinks[patchEntry.patchId]}
            onEdit={() => setEditingEntry({ characterName, patch: patchEntry })}
            onDelete={() => setDeletingEntry({ characterName, patchId: patchEntry.patchId })}
          />
        </div>
      ))}

      {editingEntry && (
        <PatchEditForm
          characterName={editingEntry.characterName}
          patch={editingEntry.patch}
          onSave={handleEditSave(editingEntry.characterName)}
          onCancel={() => setEditingEntry(null)}
        />
      )}

      {addingCharacterName && (
        <PatchEditForm
          characterName={addingCharacterName}
          patch={null}
          onSave={handleAddCharacterSave}
          onCancel={() => setAddingCharacterName(null)}
        />
      )}

      {deletingEntry && (
        <DeleteConfirmDialog
          title="패치 삭제 확인"
          message={`${deletingEntry.characterName}의 이 패치를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
          isDeleting={isDeleting}
          onConfirm={() => handleDelete(deletingEntry.characterName, deletingEntry.patchId)}
          onCancel={() => setDeletingEntry(null)}
        />
      )}

      {removingCharacter && (
        <DeleteConfirmDialog
          title="실험체 제거 확인"
          message={`이 패치에서 ${removingCharacter}를 제거하시겠습니까? 해당 캐릭터의 이 패치 데이터가 삭제됩니다.`}
          isDeleting={isRemoving}
          onConfirm={() => handleRemoveCharacter(removingCharacter)}
          onCancel={() => setRemovingCharacter(null)}
        />
      )}
    </div>
  );
}
