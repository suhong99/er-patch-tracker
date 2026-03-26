import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/admin-utils';
import { revalidateTag } from 'next/cache';

type BugFix = {
  character: string | null;
  description: string;
};

/**
 * POST /api/admin/bugs/characters/[name]/recalculate-bugs
 * 특정 캐릭터의 bugPatchIds / totalBugCount를 전체 patchNotes 기준으로 재계산
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
): Promise<NextResponse> {
  const authHeader = request.headers.get('Authorization');
  if (!(await verifyAdmin(authHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await params;
  const charName = decodeURIComponent(name);

  const charDoc = await db.collection('characters').doc(charName).get();
  if (!charDoc.exists) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 });
  }

  // 전체 patchNotes 순회하며 이 캐릭터의 버그 집계
  const allPatchesSnap = await db.collection('patchNotes').get();
  const patchIds: number[] = [];
  let totalBugCount = 0;

  allPatchesSnap.forEach((doc) => {
    const data = doc.data();
    const fixes = (data.bugFixes as BugFix[] | undefined) ?? [];
    const charBugs = fixes.filter((b) => b.character === charName);
    if (charBugs.length > 0) {
      patchIds.push(data.id as number);
      totalBugCount += charBugs.length;
    }
  });

  const sortedPatchIds = patchIds.sort((a, b) => b - a);

  await db.collection('characters').doc(charName).update({
    bugPatchIds: sortedPatchIds,
    totalBugCount,
  });

  revalidateTag('bug-ranking-data', 'max');

  return NextResponse.json({ success: true, charName, bugPatchIds: sortedPatchIds, totalBugCount });
}
