'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPatchesPage(): React.JSX.Element {
  const router = useRouter();
  const [patchId, setPatchId] = useState('');
  const [error, setError] = useState('');

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

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="patchId" className="block text-sm font-medium text-gray-300 mb-2">
            패치 ID
          </label>
          <input
            type="text"
            id="patchId"
            value={patchId}
            onChange={(e) => setPatchId(e.target.value)}
            placeholder="예: 1654"
            className="w-full px-4 py-3 bg-[var(--er-surface)] border border-[var(--er-border)] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
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

      <div className="mt-8 p-4 bg-[var(--er-surface)] border border-[var(--er-border)] rounded-lg">
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
