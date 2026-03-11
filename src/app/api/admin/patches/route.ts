import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/admin-utils';
import type { PatchNote } from '@/types/patch';

/**
 * GET /api/admin/patches
 * 가장 최근 패치 10개를 반환합니다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('Authorization');
    const isAdmin = await verifyAdmin(authHeader);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await db.collection('patchNotes').orderBy('id', 'desc').limit(10).get();

    const patches: PatchNote[] = [];
    snapshot.forEach((doc) => {
      patches.push(doc.data() as PatchNote);
    });

    return NextResponse.json({ patches });
  } catch (error) {
    console.error('Patches GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
