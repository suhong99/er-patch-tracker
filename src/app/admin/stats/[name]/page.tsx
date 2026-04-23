import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/firebase-admin';
import { CharacterStatEditor } from '@/components/admin/CharacterStatEditor';
import type { BaseStats } from '@/types/patch';

type PageProps = {
  params: Promise<{ name: string }>;
};

type CharacterDoc = {
  name: string;
  baseStats?: BaseStats;
};

export default async function AdminStatsDetailPage({
  params,
}: PageProps): Promise<React.JSX.Element> {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  const docRef = db.collection('characters').doc(decodedName);
  const doc = await docRef.get();

  if (!doc.exists) {
    notFound();
  }

  const data = doc.data() as CharacterDoc;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href="/admin/stats"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← 스탯 관리 목록으로
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{decodedName} — 스탯 편집</h1>
        {!data.baseStats && (
          <p className="mt-2 text-amber-400 text-sm">
            스탯 데이터가 없습니다. 아래에서 입력하세요.
          </p>
        )}
      </div>

      <CharacterStatEditor characterName={decodedName} initialStats={data.baseStats ?? null} />
    </div>
  );
}
