/**
 * dak.gg 크롤링 결과와 Firestore baseStats 비교
 *
 * 사용법:
 *   npx tsx scripts/compare-dakgg-stats.ts            # 전체 비교
 *   npx tsx scripts/compare-dakgg-stats.ts 나딘 가넷  # 특정 캐릭터만
 *
 * 출력:
 *   - 콘솔: 차이 요약
 *   - scripts/dakgg-compare-result.json: 상세 비교 결과
 */

import * as fs from 'fs';
import * as path from 'path';
import { initFirebaseAdmin } from './lib/firebase-admin';
import type { DakggCrawlResult, DakggWeaponStat } from './crawl-dakgg-stats';

const DAKGG_PATH = path.join(__dirname, 'dakgg-stats-result.json');
const OUTPUT_PATH = path.join(__dirname, 'dakgg-compare-result.json');

// ─── 타입 ────────────────────────────────────────────────────

type FirestoreWeaponStat = {
  weaponType: string;
  attackSpeedGrowth: number | null;
  basicAttackAmpGrowth: number | null;
  skillAmpGrowth: number | null;
};

type FirestoreBaseStats = {
  hpBase: number | null;
  hpGrowth: number | null;
  hpRegenBase: number | null;
  hpRegenGrowth: number | null;
  defenseBase: number | null;
  defenseGrowth: number | null;
  attackBase: number | null;
  attackGrowth: number | null;
  attackSpeedBase: number | null;
  moveSpeed: number | null;
  weaponStats: FirestoreWeaponStat[];
};

type FieldDiff = {
  field: string;
  firestore: number | null;
  dakgg: number | null;
  status: 'missing_in_firestore' | 'different' | 'ok';
};

type WeaponDiff = {
  weaponType: string; // 비교 기준 키
  dakggKo: string;
  firestoreMatch: boolean;
  diffs: FieldDiff[];
};

type CharacterDiff = {
  name: string;
  dakggSlug: string;
  baseStatDiffs: FieldDiff[];
  weaponDiffs: WeaponDiff[];
  hasNewFields: boolean; // hpRegen 등 Firestore에 없는 필드
  hasValueDiffs: boolean; // 기존 필드 값 차이
};

type CompareResult = {
  comparedAt: string;
  dakggCrawledAt: string;
  totalCompared: number;
  withNewFields: number; // hpRegen 추가 필요한 캐릭터 수
  withValueDiffs: number; // 값 차이 있는 캐릭터 수
  skipped: string[]; // dak.gg 파싱 실패
  characters: Record<string, CharacterDiff>;
};

// ─── 비교 로직 ────────────────────────────────────────────────

function compareNum(
  field: string,
  fsVal: number | null | undefined,
  dgVal: number | null
): FieldDiff {
  // Firestore에 필드 자체가 없는 경우 (undefined)
  if (fsVal === undefined || fsVal === null) {
    if (dgVal === null) return { field, firestore: null, dakgg: null, status: 'ok' };
    return { field, firestore: null, dakgg: dgVal, status: 'missing_in_firestore' };
  }
  if (dgVal === null) return { field, firestore: fsVal, dakgg: null, status: 'ok' };

  // 소수점 오차 허용 (0.001 이하)
  const diff = Math.abs(fsVal - dgVal);
  const status = diff > 0.001 ? 'different' : 'ok';
  return { field, firestore: fsVal, dakgg: dgVal, status };
}

function compareWeaponStats(
  fsWeapons: FirestoreWeaponStat[],
  dgWeapons: DakggWeaponStat[]
): WeaponDiff[] {
  const result: WeaponDiff[] = [];

  for (const dg of dgWeapons) {
    // Firestore 무기 매핑: 한글명 기준 (dak.gg는 한글명만 사용)
    const fs = fsWeapons.find((w) => w.weaponType === dg.weaponType);

    const diffs: FieldDiff[] = [
      compareNum('attackSpeedGrowth', fs?.attackSpeedGrowth, dg.attackSpeedGrowth),
      compareNum('basicAttackAmpGrowth', fs?.basicAttackAmpGrowth, dg.basicAttackAmpGrowth),
      compareNum('skillAmpGrowth', fs?.skillAmpGrowth, dg.skillAmpGrowth),
    ].filter((d) => d.status !== 'ok');

    result.push({
      weaponType: dg.weaponType,
      dakggKo: dg.weaponType,
      firestoreMatch: !!fs,
      diffs,
    });
  }

  return result;
}

// ─── 메인 ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (!fs.existsSync(DAKGG_PATH)) {
    console.error(`dak.gg 결과 없음: ${DAKGG_PATH}`);
    console.error('먼저 npx tsx scripts/crawl-dakgg-stats.ts 를 실행하세요.');
    process.exit(1);
  }

  const raw = fs.readFileSync(DAKGG_PATH, 'utf-8');
  const dakggResult: DakggCrawlResult = JSON.parse(raw);

  // Firestore 로드
  console.log('Firestore 데이터 로드 중...');
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('characters').get();
  const firestoreMap = new Map<string, FirestoreBaseStats | null>();
  snapshot.forEach((doc) => {
    const data = doc.data() as { baseStats?: FirestoreBaseStats };
    firestoreMap.set(doc.id, data.baseStats ?? null);
  });
  console.log(`Firestore: ${firestoreMap.size}개 캐릭터 로드`);

  const targets = args.length > 0 ? args : Object.keys(dakggResult.characters);

  const compareResult: CompareResult = {
    comparedAt: new Date().toISOString(),
    dakggCrawledAt: dakggResult.crawledAt,
    totalCompared: 0,
    withNewFields: 0,
    withValueDiffs: 0,
    skipped: [],
    characters: {},
  };

  for (const name of targets) {
    const dg = dakggResult.characters[name];

    if (!dg || dg.parseError) {
      compareResult.skipped.push(`${name} (${dg?.parseError ?? '크롤링 안 됨'})`);
      continue;
    }

    const fs = firestoreMap.get(name);

    // 기본 스탯 비교
    const baseStatDiffs: FieldDiff[] = [
      compareNum('hpBase', fs?.hpBase, dg.hpBase),
      compareNum('hpGrowth', fs?.hpGrowth, dg.hpGrowth),
      compareNum('hpRegenBase (체력 재생)', fs?.hpRegenBase, dg.hpRegenBase),
      compareNum('hpRegenGrowth', fs?.hpRegenGrowth, dg.hpRegenGrowth),
      compareNum('defenseBase', fs?.defenseBase, dg.defenseBase),
      compareNum('defenseGrowth', fs?.defenseGrowth, dg.defenseGrowth),
      compareNum('attackBase', fs?.attackBase, dg.attackBase),
      compareNum('attackGrowth', fs?.attackGrowth, dg.attackGrowth),
      compareNum('attackSpeedBase', fs?.attackSpeedBase, dg.attackSpeedBase),
      compareNum('moveSpeed', fs?.moveSpeed, dg.moveSpeed),
    ].filter((d) => d.status !== 'ok');

    // 무기 숙련도 비교
    const weaponDiffs = compareWeaponStats(fs?.weaponStats ?? [], dg.weaponStats).filter(
      (w) => !w.firestoreMatch || w.diffs.length > 0
    );

    const hasNewFields = baseStatDiffs.some((d) => d.status === 'missing_in_firestore');
    const hasValueDiffs =
      baseStatDiffs.some((d) => d.status === 'different') ||
      weaponDiffs.some((w) => w.diffs.length > 0);

    const charDiff: CharacterDiff = {
      name,
      dakggSlug: dg.dakggSlug,
      baseStatDiffs,
      weaponDiffs,
      hasNewFields,
      hasValueDiffs,
    };

    compareResult.characters[name] = charDiff;
    compareResult.totalCompared++;
    if (hasNewFields) compareResult.withNewFields++;
    if (hasValueDiffs) compareResult.withValueDiffs++;
  }

  // ─── 콘솔 출력 ───────────────────────────────────────────────

  console.log('\n' + '='.repeat(60));
  console.log('dak.gg vs Firestore 비교 결과');
  console.log('='.repeat(60));

  let okCount = 0;

  for (const [name, diff] of Object.entries(compareResult.characters)) {
    if (!diff.hasNewFields && !diff.hasValueDiffs) {
      okCount++;
      continue;
    }

    console.log(`\n[ ${name} ] (${diff.dakggSlug})`);

    // 새 필드 (체력 재생 등)
    const missing = diff.baseStatDiffs.filter((d) => d.status === 'missing_in_firestore');
    if (missing.length > 0) {
      console.log('  📋 Firestore에 없는 필드:');
      missing.forEach((d) => {
        console.log(`     ${d.field}: ${d.dakgg} (dak.gg)`);
      });
    }

    // 값 차이
    const different = diff.baseStatDiffs.filter((d) => d.status === 'different');
    if (different.length > 0) {
      console.log('  ⚠️  기본 스탯 차이:');
      different.forEach((d) => {
        console.log(`     ${d.field}: FS=${d.firestore} / dak.gg=${d.dakgg}`);
      });
    }

    // 무기 숙련도 차이
    const weaponProblems = diff.weaponDiffs.filter((w) => !w.firestoreMatch || w.diffs.length > 0);
    if (weaponProblems.length > 0) {
      console.log('  🗡️  무기 숙련도 차이:');
      weaponProblems.forEach((w) => {
        if (!w.firestoreMatch) {
          console.log(`     ${w.weaponType}: Firestore에 없는 무기 타입`);
        } else {
          w.diffs.forEach((d) => {
            console.log(`     ${w.weaponType} / ${d.field}: FS=${d.firestore} / dak.gg=${d.dakgg}`);
          });
        }
      });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`비교 완료: ${compareResult.totalCompared}개`);
  console.log(`  ✅ 일치: ${okCount}개`);
  console.log(`  📋 새 필드 필요: ${compareResult.withNewFields}개`);
  console.log(`  ⚠️  값 차이: ${compareResult.withValueDiffs}개`);
  if (compareResult.skipped.length > 0) {
    console.log(`  ❌ 스킵: ${compareResult.skipped.length}개`);
    compareResult.skipped.forEach((s) => console.log(`     ${s}`));
  }
  console.log('='.repeat(60));

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(compareResult, null, 2), 'utf-8');
  console.log(`\n상세 결과 저장: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('오류:', err);
  process.exit(1);
});
