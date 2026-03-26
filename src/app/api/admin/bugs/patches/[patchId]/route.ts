import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/admin-utils';
import { revalidateTag } from 'next/cache';

type BugFix = {
  character: string | null;
  description: string;
};

/**
 * GET /api/admin/bugs/patches/[patchId]
 * 특정 패치의 bugFixes 조회
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ patchId: string }> }
): Promise<NextResponse> {
  const authHeader = request.headers.get('Authorization');
  if (!(await verifyAdmin(authHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { patchId } = await params;
  const doc = await db.collection('patchNotes').doc(patchId).get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Patch not found' }, { status: 404 });
  }

  const data = doc.data()!;
  return NextResponse.json({
    patchId: data.id,
    title: data.title,
    createdAt: data.createdAt,
    link: data.link ?? '',
    bugFixes: (data.bugFixes as BugFix[] | undefined) ?? [],
  });
}

/**
 * PUT /api/admin/bugs/patches/[patchId]
 * bugFixes 수정 후 캐릭터 통계 재계산
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ patchId: string }> }
): Promise<NextResponse> {
  const authHeader = request.headers.get('Authorization');
  if (!(await verifyAdmin(authHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { patchId } = await params;
  const patchIdNum = parseInt(patchId, 10);
  const { bugFixes } = (await request.json()) as { bugFixes: BugFix[] };

  // 1. patchNotes 업데이트
  await db.collection('patchNotes').doc(patchId).update({ bugFixes });

  // 2. 이전 bugFixes 조회 (영향받은 캐릭터 범위 파악)
  const patchDoc = await db.collection('patchNotes').doc(patchId).get();
  const allRelatedChars = new Set<string>();

  // 이전 데이터에서 캐릭터 수집 (이미 업데이트됐으므로 새 데이터 기준)
  for (const bug of bugFixes) {
    if (bug.character) allRelatedChars.add(bug.character);
  }

  // 3. 영향받은 캐릭터의 bugPatchIds & totalBugCount 재계산
  // 전체 patchNotes에서 해당 캐릭터의 bug를 집계
  if (allRelatedChars.size > 0) {
    const allPatchesSnap = await db.collection('patchNotes').get();

    // 캐릭터별 집계 초기화
    const charPatchMap = new Map<string, number[]>();
    const charBugCountMap = new Map<string, number>();

    for (const char of allRelatedChars) {
      charPatchMap.set(char, []);
      charBugCountMap.set(char, 0);
    }

    allPatchesSnap.forEach((doc) => {
      const data = doc.data();
      const fixes = (data.bugFixes as BugFix[] | undefined) ?? [];
      for (const fix of fixes) {
        if (!fix.character || !allRelatedChars.has(fix.character)) continue;
        if (!charPatchMap.has(fix.character)) {
          charPatchMap.set(fix.character, []);
          charBugCountMap.set(fix.character, 0);
        }
        const pid = data.id as number;
        const pids = charPatchMap.get(fix.character)!;
        if (!pids.includes(pid)) pids.push(pid);
        charBugCountMap.set(fix.character, (charBugCountMap.get(fix.character) ?? 0) + 1);
      }
    });

    // 캐릭터 문서 업데이트
    for (const [char, pids] of charPatchMap) {
      const docRef = db.collection('characters').doc(char);
      const charDoc = await docRef.get();
      if (!charDoc.exists) continue;

      await docRef.update({
        bugPatchIds: pids.sort((a, b) => b - a),
        totalBugCount: charBugCountMap.get(char) ?? 0,
      });
    }
  }

  revalidateTag('bug-ranking-data', 'max');

  return NextResponse.json({ success: true, patchId: patchIdNum });
}
