import Link from 'next/link';
import { loadBalanceData, extractCharacters } from '@/lib/patch-data';
import { BugPatchEditorWrapper } from '@/components/admin/BugPatchEditorWrapper';

type Props = {
  params: Promise<{ patchId: string }>;
};

export default async function AdminBugPatchDetailPage({
  params,
}: Props): Promise<React.JSX.Element> {
  const { patchId } = await params;

  const balanceData = await loadBalanceData();
  const characters = extractCharacters(balanceData);
  const characterNames = characters.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'ko'));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href="/admin/bugs"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← 버그 관리로
        </Link>
      </div>

      <BugPatchEditorWrapper patchId={patchId} characterNames={characterNames} />
    </div>
  );
}
