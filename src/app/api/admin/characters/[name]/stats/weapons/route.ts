import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { verifyAdmin, invalidateStatsCache } from '@/lib/admin-utils';
import type { WeaponStat, BaseStats } from '@/types/patch';

export async function POST(
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
    const body = (await request.json()) as WeaponStat;

    if (!body.weaponType?.trim()) {
      return NextResponse.json({ error: '무기 타입을 입력하세요.' }, { status: 400 });
    }

    const docRef = db.collection('characters').doc(characterName);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const data = doc.data();
    const currentStats: BaseStats = data?.baseStats ?? {};
    const weaponStats: WeaponStat[] = currentStats.weaponStats ?? [];

    const alreadyExists = weaponStats.some((w) => w.weaponType === body.weaponType);
    if (alreadyExists) {
      return NextResponse.json({ error: '이미 존재하는 무기 타입입니다.' }, { status: 409 });
    }

    const newWeaponStat: WeaponStat = {
      weaponType: body.weaponType.trim(),
      attackSpeedGrowth: body.attackSpeedGrowth ?? null,
      basicAttackAmpGrowth: body.basicAttackAmpGrowth ?? null,
      skillAmpGrowth: body.skillAmpGrowth ?? null,
    };

    weaponStats.push(newWeaponStat);

    await docRef.update({ 'baseStats.weaponStats': weaponStats });

    invalidateStatsCache();

    return NextResponse.json({ success: true, message: '무기 스탯이 추가되었습니다.' });
  } catch (error) {
    console.error('Weapon stat POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
