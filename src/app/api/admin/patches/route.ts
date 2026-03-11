import { NextResponse } from 'next/server';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/admin-utils';
import type { PatchNote } from '@/types/patch';

const toPatchNote = (doc: QueryDocumentSnapshot): PatchNote => doc.data() as PatchNote;

const fetchRecentPatches = (): Promise<PatchNote[]> =>
  db
    .collection('patchNotes')
    .orderBy('id', 'desc')
    .limit(10)
    .get()
    .then((snapshot) => snapshot.docs.map(toPatchNote));

/**
 * GET /api/admin/patches
 * 가장 최근 패치 10개를 반환합니다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get('Authorization');
  const isAdmin = await verifyAdmin(authHeader);

  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const patches = await fetchRecentPatches();
    return NextResponse.json({ patches });
  } catch (error) {
    console.error('Patches GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
