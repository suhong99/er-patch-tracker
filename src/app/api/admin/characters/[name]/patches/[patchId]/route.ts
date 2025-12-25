import { NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebase-admin';
import type { PatchEntry, Change, ChangeType } from '@/types/patch';

type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';

type ExtendedChange = Change & {
  changeCategory?: ChangeCategory;
};

type ExtendedPatchEntry = Omit<PatchEntry, 'changes'> & {
  changes: ExtendedChange[];
};

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
  patchHistory: ExtendedPatchEntry[];
};

type AdminsDoc = {
  emails: string[];
};

async function verifyAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const email = decodedToken.email;

    if (!email) return false;

    const adminDoc = await db.collection('metadata').doc('admins').get();
    if (!adminDoc.exists) return false;

    const adminData = adminDoc.data() as AdminsDoc;
    return adminData.emails?.includes(email) ?? false;
  } catch {
    return false;
  }
}

// 통계 재계산
function recalculateStats(
  patchHistory: ExtendedPatchEntry[]
): CharacterData['stats'] {
  const stats: CharacterData['stats'] = {
    totalPatches: patchHistory.length,
    buffCount: 0,
    nerfCount: 0,
    mixedCount: 0,
    currentStreak: { type: null, count: 0 },
    maxBuffStreak: 0,
    maxNerfStreak: 0,
  };

  if (patchHistory.length === 0) return stats;

  // 날짜순 정렬 (오래된 것 먼저)
  const chronological = [...patchHistory].sort(
    (a, b) => new Date(a.patchDate).getTime() - new Date(b.patchDate).getTime()
  );

  let currentStreakType: ChangeType | null = null;
  let currentStreakCount = 0;

  for (const patch of chronological) {
    if (patch.overallChange === 'buff') stats.buffCount++;
    else if (patch.overallChange === 'nerf') stats.nerfCount++;
    else stats.mixedCount++;

    if (patch.overallChange === 'buff' || patch.overallChange === 'nerf') {
      if (currentStreakType === patch.overallChange) {
        currentStreakCount++;
      } else {
        if (currentStreakType === 'buff') {
          stats.maxBuffStreak = Math.max(stats.maxBuffStreak, currentStreakCount);
        } else if (currentStreakType === 'nerf') {
          stats.maxNerfStreak = Math.max(stats.maxNerfStreak, currentStreakCount);
        }
        currentStreakType = patch.overallChange;
        currentStreakCount = 1;
      }
    }
  }

  if (currentStreakType === 'buff') {
    stats.maxBuffStreak = Math.max(stats.maxBuffStreak, currentStreakCount);
  } else if (currentStreakType === 'nerf') {
    stats.maxNerfStreak = Math.max(stats.maxNerfStreak, currentStreakCount);
  }

  stats.currentStreak.type = currentStreakType;
  stats.currentStreak.count = currentStreakCount;

  return stats;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string; patchId: string }> }
): Promise<NextResponse> {
  try {
    // 관리자 권한 확인
    const authHeader = request.headers.get('Authorization');
    const isAdmin = await verifyAdmin(authHeader);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, patchId } = await params;
    const characterName = decodeURIComponent(name);
    const patchIdNum = parseInt(patchId);

    // 요청 body 파싱
    const updatedPatch = (await request.json()) as ExtendedPatchEntry;

    // Firestore에서 캐릭터 데이터 조회
    const docRef = db.collection('characters').doc(characterName);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const charData = doc.data() as CharacterData;

    // 해당 패치 찾기
    const patchIndex = charData.patchHistory.findIndex((p) => p.patchId === patchIdNum);
    if (patchIndex === -1) {
      return NextResponse.json({ error: 'Patch not found' }, { status: 404 });
    }

    // 패치 업데이트
    charData.patchHistory[patchIndex] = {
      ...charData.patchHistory[patchIndex],
      ...updatedPatch,
      patchId: patchIdNum, // patchId는 변경 불가
    };

    // 통계 재계산
    charData.stats = recalculateStats(charData.patchHistory);

    // Firestore 저장
    await docRef.update({
      patchHistory: charData.patchHistory,
      stats: charData.stats,
    });

    return NextResponse.json({
      success: true,
      message: 'Patch updated successfully',
    });
  } catch (error) {
    console.error('Patch update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
