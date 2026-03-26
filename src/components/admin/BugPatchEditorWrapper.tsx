'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { BugPatchEditor } from './BugPatchEditor';

type BugFix = {
  character: string | null;
  description: string;
};

type PatchBugData = {
  patchId: number;
  title: string;
  createdAt: string;
  link: string;
  bugFixes: BugFix[];
};

type Props = {
  patchId: string;
  characterNames: string[];
};

export function BugPatchEditorWrapper({ patchId, characterNames }: Props): React.JSX.Element {
  const { user } = useAuth();
  const [data, setData] = useState<PatchBugData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchData = async (): Promise<void> => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/bugs/patches/${patchId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          setError(res.status === 404 ? '패치를 찾을 수 없습니다.' : '데이터 로드 실패');
          return;
        }

        setData((await res.json()) as PatchBugData);
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
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-700 rounded w-1/3" />
        <div className="h-4 bg-gray-700 rounded w-1/2" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-700 rounded" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-rose-900/20 border border-rose-500/30 rounded-lg">
        <p className="text-rose-400">{error ?? '데이터가 없습니다.'}</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">{data.title}</h1>
          <p className="text-sm text-gray-400">
            패치 ID: <span className="font-mono text-violet-400">{data.patchId}</span>
            {' · '}
            {data.createdAt.split('T')[0]}
          </p>
        </div>
        {data.link && (
          <a
            href={data.link}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-3 py-1.5 bg-violet-600/20 border border-violet-500/30 rounded text-sm text-violet-400 hover:bg-violet-600/30 transition-colors"
          >
            원문 보기 ↗
          </a>
        )}
      </div>

      <BugPatchEditor
        patchId={data.patchId}
        initialBugFixes={data.bugFixes}
        characterNames={characterNames}
      />
    </>
  );
}
