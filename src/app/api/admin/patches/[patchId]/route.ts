import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/admin-utils';
import type { PatchEntry, PatchNote, ChangeType } from '@/types/patch';

type CharacterData = {
  name: string;
  nameEn?: string;
  stats: {
    totalPatches: number;
    buffCount: number;
    nerfCount: number;
    mixedCount: number;
    currentStreak: {
      type: ChangeType | null;
      count: number;
    };
    maxBuffStreak: number;
    maxNerfStreak: number;
  };
  patchHistory: PatchEntry[];
};

type PatchCharacterEntry = {
  characterName: string;
  patchEntry: PatchEntry;
};

type GetPatchResponse = {
  patchNote: PatchNote;
  characters: PatchCharacterEntry[];
};

/**
 * GET /api/admin/patches/[patchId]
 * 특정 patchId에 영향받은 모든 캐릭터의 패치 내역을 조회합니다.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ patchId: string }> }
): Promise<NextResponse> {
  try {
    // 관리자 권한 확인
    const authHeader = request.headers.get('Authorization');
    const isAdmin = await verifyAdmin(authHeader);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { patchId } = await params;
    const patchIdNum = parseInt(patchId, 10);

    if (isNaN(patchIdNum)) {
      return NextResponse.json({ error: 'Invalid patchId' }, { status: 400 });
    }

    // 1. patchNotes에서 패치 정보 조회
    const patchNoteDoc = await db.collection('patchNotes').doc(patchId).get();

    if (!patchNoteDoc.exists) {
      return NextResponse.json({ error: 'Patch not found' }, { status: 404 });
    }

    const patchNote = patchNoteDoc.data() as PatchNote;

    // 2. characterNames가 있으면 해당 캐릭터들의 데이터만 조회
    //    없으면 전체 characters 컬렉션을 조회하여 patchId가 포함된 캐릭터 찾기
    const characters: PatchCharacterEntry[] = [];

    if (patchNote.characterNames && patchNote.characterNames.length > 0) {
      // characterNames가 있는 경우 (최적화된 쿼리)
      const characterDocs = await Promise.all(
        patchNote.characterNames.map((name) => db.collection('characters').doc(name).get())
      );

      for (const doc of characterDocs) {
        if (doc.exists) {
          const charData = doc.data() as CharacterData;
          const patchEntry = charData.patchHistory.find((p) => p.patchId === patchIdNum);
          if (patchEntry) {
            characters.push({
              characterName: charData.name,
              patchEntry,
            });
          }
        }
      }
    } else {
      // characterNames가 없는 경우 (레거시 데이터: 전체 스캔)
      const charactersSnapshot = await db.collection('characters').get();

      charactersSnapshot.forEach((doc) => {
        const charData = doc.data() as CharacterData;
        const patchEntry = charData.patchHistory.find((p) => p.patchId === patchIdNum);
        if (patchEntry) {
          characters.push({
            characterName: charData.name,
            patchEntry,
          });
        }
      });
    }

    // 캐릭터 이름순 정렬
    characters.sort((a, b) => a.characterName.localeCompare(b.characterName, 'ko'));

    const response: GetPatchResponse = {
      patchNote,
      characters,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Patch GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
