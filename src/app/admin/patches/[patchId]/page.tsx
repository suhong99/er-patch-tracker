'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { PatchCharacterList } from '@/components/admin/PatchCharacterList';
import type { PatchEntry, PatchNote } from '@/types/patch';

type PatchCharacterEntry = {
  characterName: string;
  patchEntry: PatchEntry;
};

type PatchData = {
  patchNote: PatchNote;
  characters: PatchCharacterEntry[];
};

export default function AdminPatchDetailPage(): React.JSX.Element {
  const { patchId } = useParams<{ patchId: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<PatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      if (!user) return;

      try {
        setLoading(true);
        setError(null);

        const token = await user.getIdToken();
        const response = await fetch(`/api/admin/patches/${patchId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            setError('해당 패치를 찾을 수 없습니다.');
          } else if (response.status === 401) {
            setError('권한이 없습니다.');
          } else {
            setError('데이터를 불러오는 중 오류가 발생했습니다.');
          }
          return;
        }

        const result = (await response.json()) as PatchData;
        setData(result);
      } catch {
        setError('네트워크 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [patchId, user]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-1/3 mb-4" />
          <div className="h-4 bg-gray-700 rounded w-1/2 mb-8" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/admin/patches"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            ← 패치 조회로
          </Link>
        </div>
        <div className="p-6 bg-rose-900/20 border border-rose-500/30 rounded-lg">
          <h2 className="text-lg font-medium text-rose-400 mb-2">오류</h2>
          <p className="text-gray-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-gray-400">데이터가 없습니다.</p>
      </div>
    );
  }

  const { patchNote, characters } = data;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href="/admin/patches"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← 패치 조회로
        </Link>
      </div>

      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">{patchNote.title}</h1>
            <p className="text-gray-400">
              패치 ID: {patchNote.id} | 작성일: {patchNote.createdAt.split('T')[0]} |{' '}
              {characters.length}명 캐릭터
            </p>
          </div>
          <a
            href={patchNote.link}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-3 py-1.5 bg-violet-600/20 border border-violet-500/30 rounded text-sm text-violet-400 hover:bg-violet-600/30 transition-colors"
          >
            원문 보기
          </a>
        </div>
      </div>

      {characters.length === 0 ? (
        <div className="p-6 bg-amber-900/20 border border-amber-500/30 rounded-lg">
          <p className="text-amber-400">이 패치에 영향받은 캐릭터가 없습니다.</p>
        </div>
      ) : (
        <PatchCharacterList characters={characters} patchId={patchNote.id} />
      )}
    </div>
  );
}
