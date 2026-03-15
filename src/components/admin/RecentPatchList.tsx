import Link from 'next/link';
import type { PatchNote } from '@/types/patch';
import { formatPatchDate } from '@/lib/patch-api';

function PatchListSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-12 bg-gray-800 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

function PatchListEmpty(): React.JSX.Element {
  return <p className="text-sm text-gray-500">패치 목록을 불러올 수 없습니다.</p>;
}

function PatchListItem({ patch }: { patch: PatchNote }): React.JSX.Element {
  return (
    <Link
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
        {formatPatchDate(patch.createdAt)}
      </span>
    </Link>
  );
}

type RecentPatchListProps = {
  patches: PatchNote[];
  loading: boolean;
};

export function RecentPatchList({ patches, loading }: RecentPatchListProps): React.JSX.Element {
  if (loading) return <PatchListSkeleton />;
  if (patches.length === 0) return <PatchListEmpty />;
  return (
    <div className="space-y-2">
      {patches.map((patch) => (
        <PatchListItem key={patch.id} patch={patch} />
      ))}
    </div>
  );
}
