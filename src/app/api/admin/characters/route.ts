import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { verifyAdmin, invalidateBalanceCache, invalidateStatsCache } from '@/lib/admin-utils';
import type { BaseStats } from '@/types/patch';

type CreateCharacterBody = {
  name: string;
  nameEn?: string;
  baseStats: BaseStats;
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('Authorization');
    const isAdmin = await verifyAdmin(authHeader);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as CreateCharacterBody;
    const { name, nameEn, baseStats } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: '이름을 입력하세요.' }, { status: 400 });
    }

    if (!baseStats.weaponStats || baseStats.weaponStats.length === 0) {
      return NextResponse.json(
        { error: '무기 역할군을 최소 1개 이상 입력하세요.' },
        { status: 400 }
      );
    }

    const docRef = db.collection('characters').doc(name.trim());
    const existing = await docRef.get();

    if (existing.exists) {
      return NextResponse.json({ error: '이미 존재하는 실험체입니다.' }, { status: 409 });
    }

    await docRef.set({
      name: name.trim(),
      ...(nameEn ? { nameEn } : {}),
      baseStats: {
        ...baseStats,
        crawledAt: new Date().toISOString(),
      },
      stats: {
        totalPatches: 0,
        buffCount: 0,
        nerfCount: 0,
        mixedCount: 0,
        currentStreak: { type: null, count: 0 },
        maxBuffStreak: 0,
        maxNerfStreak: 0,
      },
      patchHistory: [],
    });

    invalidateBalanceCache();
    invalidateStatsCache();

    return NextResponse.json({ success: true, message: '실험체가 추가되었습니다.' });
  } catch (error) {
    console.error('Character create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
