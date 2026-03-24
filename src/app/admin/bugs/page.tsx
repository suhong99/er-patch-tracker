import { db } from '@/lib/firebase-admin';
import { AdminBugManager } from '@/components/admin/AdminBugManager';

type CharacterBugStat = {
  name: string;
  totalBugCount: number;
  bugPatchCount: number;
};

async function loadCharacterBugStats(): Promise<CharacterBugStat[]> {
  const snapshot = await db.collection('characters').get();
  const results: CharacterBugStat[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    const totalBugCount = (data.totalBugCount as number | undefined) ?? 0;
    const bugPatchIds = (data.bugPatchIds as number[] | undefined) ?? [];
    results.push({
      name: data.name as string,
      totalBugCount,
      bugPatchCount: bugPatchIds.length,
    });
  });

  return results.sort((a, b) => b.totalBugCount - a.totalBugCount);
}

export default async function AdminBugsPage(): Promise<React.JSX.Element> {
  const characterStats = await loadCharacterBugStats();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">버그 관리</h1>
        <p className="text-gray-400">패치별 bugFixes 수정 및 실험체별 통계 재계산</p>
      </div>

      <AdminBugManager characterStats={characterStats} />
    </div>
  );
}
