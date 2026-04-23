import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { verifyAdmin, invalidateStatsCache } from '@/lib/admin-utils';
import type { BaseStats } from '@/types/patch';

type BaseStatsScalar = Omit<BaseStats, 'weaponStats' | 'crawledAt'>;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('Authorization');
    const isAdmin = await verifyAdmin(authHeader);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name } = await params;
    const characterName = decodeURIComponent(name);

    const docRef = db.collection('characters').doc(characterName);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const data = doc.data();
    return NextResponse.json({ baseStats: data?.baseStats ?? null });
  } catch (error) {
    console.error('Stats GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('Authorization');
    const isAdmin = await verifyAdmin(authHeader);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name } = await params;
    const characterName = decodeURIComponent(name);

    const body = (await request.json()) as BaseStatsScalar;

    const docRef = db.collection('characters').doc(characterName);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const data = doc.data();
    const currentStats: BaseStats = data?.baseStats ?? {};

    await docRef.update({
      'baseStats.hpBase': body.hpBase ?? currentStats.hpBase,
      'baseStats.hpGrowth': body.hpGrowth ?? currentStats.hpGrowth,
      'baseStats.hpRegenBase': body.hpRegenBase ?? currentStats.hpRegenBase,
      'baseStats.hpRegenGrowth': body.hpRegenGrowth ?? currentStats.hpRegenGrowth,
      'baseStats.defenseBase': body.defenseBase ?? currentStats.defenseBase,
      'baseStats.defenseGrowth': body.defenseGrowth ?? currentStats.defenseGrowth,
      'baseStats.attackBase': body.attackBase ?? currentStats.attackBase,
      'baseStats.attackGrowth': body.attackGrowth ?? currentStats.attackGrowth,
      'baseStats.attackSpeedBase': body.attackSpeedBase ?? currentStats.attackSpeedBase,
      'baseStats.moveSpeed': body.moveSpeed ?? currentStats.moveSpeed,
    });

    invalidateStatsCache();

    return NextResponse.json({ success: true, message: '스탯이 수정되었습니다.' });
  } catch (error) {
    console.error('Stats PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
