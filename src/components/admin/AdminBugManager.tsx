'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useRecentPatches } from '@/hooks/useRecentPatches';
import { parsePatchId, formatPatchDate } from '@/lib/patch-api';

type CharacterBugStat = {
  name: string;
  totalBugCount: number;
  bugPatchCount: number;
};

type Props = {
  characterStats: CharacterBugStat[];
};

export function AdminBugManager({ characterStats }: Props): React.JSX.Element {
  const [tab, setTab] = useState<'patch' | 'character'>('patch');

  return (
    <div>
      {/* 탭 */}
      <div className="flex gap-1 mb-8 border-b border-er-border">
        <button
          onClick={() => setTab('patch')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'patch'
              ? 'border-violet-500 text-violet-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          패치별
        </button>
        <button
          onClick={() => setTab('character')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'character'
              ? 'border-violet-500 text-violet-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          실험체별
        </button>
      </div>

      {tab === 'patch' ? <PatchTab /> : <CharacterTab characterStats={characterStats} />}
    </div>
  );
}

// ─── 패치별 탭 ───────────────────────────────────────────────

function PatchTab(): React.JSX.Element {
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
    router.push(`/admin/bugs/patches/${result.id}`);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-medium text-gray-300 mb-3">최근 패치</h2>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {patches.slice(0, 10).map((patch) => (
              <a
                key={patch.id}
                href={`/admin/bugs/patches/${patch.id}`}
                className="flex items-center justify-between px-4 py-3 bg-er-surface border border-er-border rounded-lg hover:border-amber-500/40 hover:bg-amber-600/5 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 text-xs text-gray-500 font-mono w-14">#{patch.id}</span>
                  <span className="text-sm text-gray-200 truncate group-hover:text-white transition-colors">
                    {patch.title}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-gray-500 ml-3">
                  {formatPatchDate(patch.createdAt)}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm font-medium text-gray-300">패치 ID 직접 입력</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={patchId}
            onChange={(e) => setPatchId(e.target.value)}
            placeholder="예: 3444"
            className="flex-1 px-4 py-2.5 bg-er-surface border border-er-border rounded-lg text-white placeholder-gray-500 focus:outline-hidden focus:border-violet-500 transition-colors"
          />
          <button
            type="submit"
            className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-lg transition-colors"
          >
            이동
          </button>
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </form>
    </div>
  );
}

// ─── 실험체별 탭 ─────────────────────────────────────────────

function CharacterTab({
  characterStats,
}: {
  characterStats: CharacterBugStat[];
}): React.JSX.Element {
  const { user } = useAuth();
  const [recalculating, setRecalculating] = useState<string | null>(null);
  const [results, setResults] = useState<
    Record<string, { bugPatchIds: number[]; totalBugCount: number }>
  >({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleRecalculate = async (charName: string): Promise<void> => {
    if (!user || recalculating) return;
    setRecalculating(charName);
    setErrors((prev) => ({ ...prev, [charName]: '' }));

    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/bugs/characters/${encodeURIComponent(charName)}/recalculate-bugs`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) throw new Error('재계산 실패');

      const data = await res.json();
      setResults((prev) => ({
        ...prev,
        [charName]: { bugPatchIds: data.bugPatchIds, totalBugCount: data.totalBugCount },
      }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [charName]: err instanceof Error ? err.message : '오류 발생',
      }));
    } finally {
      setRecalculating(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-400 mb-4">
        총 <span className="text-white font-mono">{characterStats.length}</span>명 · 버그 데이터
        있는 캐릭터:{' '}
        <span className="text-amber-400 font-mono">
          {characterStats.filter((c) => c.totalBugCount > 0).length}
        </span>
        명
      </p>

      {characterStats.map((char) => {
        const result = results[char.name];
        const err = errors[char.name];
        const isRecalculating = recalculating === char.name;

        return (
          <div
            key={char.name}
            className="flex items-center gap-3 px-4 py-3 bg-er-surface border border-er-border rounded-lg"
          >
            <span className="flex-1 text-sm text-gray-200">{char.name}</span>

            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>
                버그{' '}
                <span className="font-mono text-amber-400">
                  {result?.totalBugCount ?? char.totalBugCount}
                </span>
                건
              </span>
              <span>
                패치{' '}
                <span className="font-mono text-zinc-400">
                  {result?.bugPatchIds.length ?? char.bugPatchCount}
                </span>
                개
              </span>
            </div>

            {err && <span className="text-xs text-rose-400">{err}</span>}
            {result && !err && <span className="text-xs text-emerald-400">✓ 재계산됨</span>}

            <button
              onClick={() => handleRecalculate(char.name)}
              disabled={!!recalculating}
              className="shrink-0 px-2.5 py-1 bg-amber-600/15 border border-amber-500/25 rounded text-xs text-amber-400 hover:bg-amber-600/25 disabled:opacity-40 transition-colors"
            >
              {isRecalculating ? '...' : '재계산'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
