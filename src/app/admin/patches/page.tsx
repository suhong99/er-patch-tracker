'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import type { PatchNote } from '@/types/patch';

export default function AdminPatchesPage(): React.JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const [patchId, setPatchId] = useState('');
  const [error, setError] = useState('');
  const [recentPatches, setRecentPatches] = useState<PatchNote[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    const fetchRecentPatches = async (): Promise<void> => {
      if (!user) return;

      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/admin/patches', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = (await response.json()) as { patches: PatchNote[] };
          setRecentPatches(data.patches);
        }
      } catch {
        // 조용히 실패
      } finally {
        setLoadingRecent(false);
      }
    };

    fetchRecentPatches();
  }, [user]);

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    setError('');

    const trimmed = patchId.trim();
    if (!trimmed) {
      setError('패치 ID를 입력해주세요.');
      return;
    }

    const parsed = parseInt(trimmed, 10);
    if (isNaN(parsed) || parsed <= 0) {
      setError('유효한 패치 ID를 입력해주세요. (숫자)');
      return;
    }

    router.push(`/admin/patches/${parsed}`);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">패치 버전별 관리</h1>
        <p className="text-gray-400">
          패치 ID를 입력하면 해당 패치에 영향받은 모든 캐릭터의 패치 내역을 조회할 수 있습니다.
        </p>
      </div>

      {/* 최근 패치 목록 */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-gray-300 mb-3">최근 패치 10개</h2>
        {loadingRecent ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : recentPatches.length > 0 ? (
          <div className="space-y-2">
            {recentPatches.map((patch) => (
              <Link
                key={patch.id}
                href={`/admin/patches/${patch.id}`}
                className="flex items-center justify-between px-4 py-3 bg-er-surface border border-er-border rounded-lg hover:border-violet-500/50 hover:bg-violet-600/5 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 text-xs text-gray-500 font-mono w-14">#{patch.id}</span>
                  <span className="text-sm text-gray-200 truncate group-hover:text-white transition-colors">
                    {patch.title}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-gray-500 ml-3">
                  {patch.createdAt.split('T')[0]}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">패치 목록을 불러올 수 없습니다.</p>
        )}
      </div>

      {/* 직접 ID 입력 */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="patchId" className="block text-sm font-medium text-gray-300 mb-2">
            패치 ID 직접 입력
          </label>
          <input
            type="text"
            id="patchId"
            value={patchId}
            onChange={(e) => setPatchId(e.target.value)}
            placeholder="예: 1654"
            className="w-full px-4 py-3 bg-er-surface border border-er-border rounded-lg text-white placeholder-gray-500 focus:outline-hidden focus:border-violet-500 transition-colors"
          />
          {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
        </div>

        <button
          type="submit"
          className="w-full px-4 py-3 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-lg transition-colors"
        >
          조회하기
        </button>
      </form>

      <div className="mt-6 p-4 bg-er-surface border border-er-border rounded-lg">
        <h2 className="text-sm font-medium text-gray-300 mb-2">패치 ID란?</h2>
        <p className="text-sm text-gray-400">
          패치노트 URL에서 확인할 수 있습니다.
          <br />
          예: playeternalreturn.com/posts/news/<strong className="text-violet-400">1654</strong>
        </p>
      </div>
    </div>
  );
}
