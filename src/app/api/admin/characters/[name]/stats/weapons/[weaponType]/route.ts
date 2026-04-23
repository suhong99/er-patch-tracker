import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { verifyAdmin, invalidateStatsCache } from '@/lib/admin-utils';
import type { WeaponStat, BaseStats } from '@/types/patch';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string; weaponType: string }> }
): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('Authorization');
    const isAdmin = await verifyAdmin(authHeader);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, weaponType } = await params;
    const characterName = decodeURIComponent(name);
    const decodedWeaponType = decodeURIComponent(weaponType);
    const body = (await request.json()) as Partial<Omit<WeaponStat, 'weaponType'>>;

    const docRef = db.collection('characters').doc(characterName);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const data = doc.data();
    const currentStats: BaseStats = data?.baseStats ?? {};
    const weaponStats: WeaponStat[] = currentStats.weaponStats ?? [];

    const idx = weaponStats.findIndex((w) => w.weaponType === decodedWeaponType);
    if (idx === -1) {
      return NextResponse.json({ error: 'Weapon stat not found' }, { status: 404 });
    }

    weaponStats[idx] = {
      ...weaponStats[idx],
      attackSpeedGrowth:
        body.attackSpeedGrowth !== undefined
          ? body.attackSpeedGrowth
          : weaponStats[idx].attackSpeedGrowth,
      basicAttackAmpGrowth:
        body.basicAttackAmpGrowth !== undefined
          ? body.basicAttackAmpGrowth
          : weaponStats[idx].basicAttackAmpGrowth,
      skillAmpGrowth:
        body.skillAmpGrowth !== undefined ? body.skillAmpGrowth : weaponStats[idx].skillAmpGrowth,
    };

    await docRef.update({ 'baseStats.weaponStats': weaponStats });

    invalidateStatsCache();

    return NextResponse.json({ success: true, message: '무기 스탯이 수정되었습니다.' });
  } catch (error) {
    console.error('Weapon stat PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string; weaponType: string }> }
): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('Authorization');
    const isAdmin = await verifyAdmin(authHeader);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, weaponType } = await params;
    const characterName = decodeURIComponent(name);
    const decodedWeaponType = decodeURIComponent(weaponType);

    const docRef = db.collection('characters').doc(characterName);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const data = doc.data();
    const currentStats: BaseStats = data?.baseStats ?? {};
    const weaponStats: WeaponStat[] = currentStats.weaponStats ?? [];

    const filtered = weaponStats.filter((w) => w.weaponType !== decodedWeaponType);
    if (filtered.length === weaponStats.length) {
      return NextResponse.json({ error: 'Weapon stat not found' }, { status: 404 });
    }

    await docRef.update({ 'baseStats.weaponStats': filtered });

    invalidateStatsCache();

    return NextResponse.json({ success: true, message: '무기 스탯이 삭제되었습니다.' });
  } catch (error) {
    console.error('Weapon stat DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
