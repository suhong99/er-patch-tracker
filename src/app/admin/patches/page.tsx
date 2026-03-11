'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useRecentPatches } from '@/hooks/useRecentPatches';
import { parsePatchId } from '@/lib/patch-api';
import { RecentPatchList } from '@/components/admin/RecentPatchList';

export default function AdminPatchesPage(): React.JSX.Element {
  const router = useRouter();
  const { patches, loading } = useRecentPatches();
  const [patchId, setPatchId] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const result = parsePatchId(patchId);

    if ('error' in result) {
      setError(result.error);
      return;
    }

    setError('');
    router.push(`/admin/patches/${result.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">패치 버전별 관리</h1>
        <p className="text-gray-400">
          패치 ID를 입력하면 해당 패치에 영향받은 모든 캐릭터의 패치 내역을 조회할 수 있습니다.
        </p>
      </div>

      <div className="mb-8">
        <h2 className="text-sm font-medium text-gray-300 mb-3">최근 패치 10개</h2>
        <RecentPatchList patches={patches} loading={loading} />
      </div>

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
