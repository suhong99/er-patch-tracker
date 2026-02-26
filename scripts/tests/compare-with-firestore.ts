/**
 * 픽스처 파싱 결과와 Firestore 저장 데이터 비교
 *
 * 사용법:
 *   npx tsx scripts/tests/compare-with-firestore.ts --patches=1673,1749
 */

import * as fs from 'fs';
import * as path from 'path';
import { initFirebaseAdmin } from '../lib/firebase-admin';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

type Change =
  | {
      target: string;
      stat: string;
      before: string;
      after: string;
      changeType: string;
      changeCategory: 'numeric';
    }
  | { target: string; description: string; changeType: string; changeCategory: string };

type ParsedCharacter = {
  name: string;
  nameEn: string;
  devComment: string | null;
  changes: Change[];
};

type PatchEntry = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  overallChange: string;
  streak: number;
  devComment: string | null;
  changes: Change[];
};

type CharacterData = {
  name: string;
  patchHistory: PatchEntry[];
};

// 키 순서 무관하게 객체 정규화
function sortedJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(sortedJson).join(',') + ']';
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = (obj as Record<string, unknown>)[k];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return sortedJson(a) === sortedJson(b);
}

// changeType 제외한 비교용 객체 생성
function withoutChangeType(change: Change): Omit<Change, 'changeType'> {
  const { changeType: _, ...rest } = change as Change & { changeType: string };
  return rest;
}

function diffChanges(fixtureChanges: Change[], firestoreChanges: Change[]): string[] {
  const diffs: string[] = [];

  if (fixtureChanges.length !== firestoreChanges.length) {
    diffs.push(
      `  변경사항 수: 픽스처 ${fixtureChanges.length}개 vs Firestore ${firestoreChanges.length}개`
    );
  }

  const len = Math.max(fixtureChanges.length, firestoreChanges.length);
  for (let i = 0; i < len; i++) {
    const fc = fixtureChanges[i];
    const sc = firestoreChanges[i];
    if (!fc) {
      diffs.push(`  [${i}] 픽스처에 없음: ${JSON.stringify(sc)}`);
      continue;
    }
    if (!sc) {
      diffs.push(`  [${i}] Firestore에 없음: ${JSON.stringify(fc)}`);
      continue;
    }

    // changeType(buff/nerf/mixed)은 비교에서 제외
    if (!deepEqual(withoutChangeType(fc), withoutChangeType(sc))) {
      diffs.push(`  [${i}] 불일치:`);
      diffs.push(`    픽스처  : ${JSON.stringify(fc)}`);
      diffs.push(`    Firestore: ${JSON.stringify(sc)}`);
    }
  }

  return diffs;
}

async function compareWithFirestore(patchId: string): Promise<void> {
  const fixtureDir = path.join(FIXTURES_DIR, patchId);

  if (!fs.existsSync(path.join(fixtureDir, 'expected.json'))) {
    console.log(`[${patchId}] 픽스처 없음 - generate-fixtures.ts 먼저 실행 필요`);
    return;
  }

  const fixtureChars: ParsedCharacter[] = JSON.parse(
    fs.readFileSync(path.join(fixtureDir, 'expected.json'), 'utf-8')
  );

  const db = initFirebaseAdmin();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`패치 ${patchId} 비교 (픽스처 캐릭터: ${fixtureChars.length}명)`);
  console.log('='.repeat(60));

  let matchCount = 0;
  let diffCount = 0;
  let missingCount = 0;

  for (const fixtureChar of fixtureChars) {
    const docSnap = await db.collection('characters').doc(fixtureChar.name).get();

    if (!docSnap.exists) {
      console.log(`\n❌ [${fixtureChar.name}] Firestore에 캐릭터 없음`);
      missingCount++;
      continue;
    }

    const charData = docSnap.data() as CharacterData;
    const patchEntry = charData.patchHistory?.find((p) => p.patchId === parseInt(patchId, 10));

    if (!patchEntry) {
      console.log(`\n❌ [${fixtureChar.name}] Firestore에 patch ${patchId} 기록 없음`);
      missingCount++;
      continue;
    }

    // devComment 비교
    const commentMatch = fixtureChar.devComment === patchEntry.devComment;

    // changes 비교
    const changeDiffs = diffChanges(fixtureChar.changes, patchEntry.changes);

    if (commentMatch && changeDiffs.length === 0) {
      console.log(`✅ [${fixtureChar.name}] 일치 (${fixtureChar.changes.length}개 변경)`);
      matchCount++;
    } else {
      console.log(`\n⚠️  [${fixtureChar.name}] 불일치:`);
      if (!commentMatch) {
        console.log(`  devComment:`);
        console.log(`    픽스처  : ${fixtureChar.devComment}`);
        console.log(`    Firestore: ${patchEntry.devComment}`);
      }
      changeDiffs.forEach((d) => console.log(d));
      diffCount++;
    }
  }

  console.log(`\n--- 요약 ---`);
  console.log(`일치: ${matchCount}명 / 불일치: ${diffCount}명 / 누락: ${missingCount}명`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const patchesArg = args.find((a) => a.startsWith('--patches='))?.split('=')[1];

  if (!patchesArg) {
    // 인자 없으면 fixtures 폴더의 모든 패치 비교
    const patchIds = fs.existsSync(FIXTURES_DIR)
      ? fs
          .readdirSync(FIXTURES_DIR)
          .filter((f) => fs.statSync(path.join(FIXTURES_DIR, f)).isDirectory())
      : [];

    if (patchIds.length === 0) {
      console.error('픽스처가 없습니다. generate-fixtures.ts를 먼저 실행하세요.');
      process.exit(1);
    }

    for (const patchId of patchIds) {
      await compareWithFirestore(patchId);
    }
  } else {
    const patchIds = patchesArg
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    for (const patchId of patchIds) {
      await compareWithFirestore(patchId);
    }
  }
}

main().catch(console.error);
