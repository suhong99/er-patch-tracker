/**
 * 버그 수정 데이터 Firebase 업로드 스크립트
 *
 * fixtures/{patchId}/bugs.json 을 읽어서:
 *   1. patchNotes/{patchId} - bugFixes 필드 추가
 *   2. characters/{name}    - bugPatchIds, totalBugCount 필드 추가
 *
 * 사용법:
 *   npx tsx scripts/upload-bug-fixes.ts --patches=3444,3423,3327,1843,1812,1802,1286
 *   npx tsx scripts/upload-bug-fixes.ts  (fixtures/ 내 bugs.json 있는 패치 전부)
 */

import * as fs from 'fs';
import * as path from 'path';
import { initFirebaseAdmin } from './lib/firebase-admin';

type BugFix = {
  character: string | null;
  description: string;
};

const FIXTURES_DIR = path.join(__dirname, 'tests', 'fixtures');

function loadBugFixtures(patchIds: string[]): Map<number, BugFix[]> {
  const result = new Map<number, BugFix[]>();

  for (const id of patchIds) {
    const bugsPath = path.join(FIXTURES_DIR, id, 'bugs.json');
    if (!fs.existsSync(bugsPath)) {
      console.warn(`  ⚠️ [${id}] bugs.json 없음 - 스킵`);
      continue;
    }
    const bugs: BugFix[] = JSON.parse(fs.readFileSync(bugsPath, 'utf-8'));
    result.set(Number(id), bugs);
  }

  return result;
}

function resolvePatchIds(argPatches: string | undefined): string[] {
  if (argPatches) {
    return argPatches
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  // 인수 없으면 fixtures/ 내 bugs.json 있는 패치 전부
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter(
      (f) =>
        fs.statSync(path.join(FIXTURES_DIR, f)).isDirectory() &&
        fs.existsSync(path.join(FIXTURES_DIR, f, 'bugs.json'))
    )
    .sort();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const patchesArg = args.find((a) => a.startsWith('--patches='))?.split('=')[1];

  const patchIds = resolvePatchIds(patchesArg);
  console.log(`업로드 대상: ${patchIds.join(', ')}\n`);

  const fixtures = loadBugFixtures(patchIds);
  if (fixtures.size === 0) {
    console.error('업로드할 데이터가 없습니다.');
    process.exit(1);
  }

  const db = initFirebaseAdmin();

  // ────────────────────────────────────────────────
  // 1. patchNotes 업데이트 (bugFixes 필드)
  // ────────────────────────────────────────────────
  console.log('1. patchNotes 업데이트 중...');
  const patchBatch = db.batch();

  for (const [patchId, bugFixes] of fixtures) {
    const docRef = db.collection('patchNotes').doc(String(patchId));
    patchBatch.update(docRef, { bugFixes });
    console.log(
      `  [${patchId}] bugFixes ${bugFixes.length}개 (실험체 ${bugFixes.filter((b) => b.character).length}개)`
    );
  }

  await patchBatch.commit();
  console.log('  ✅ patchNotes 업데이트 완료\n');

  // ────────────────────────────────────────────────
  // 2. characters 업데이트 (bugPatchIds, totalBugCount)
  // ────────────────────────────────────────────────
  console.log('2. characters 버그 통계 집계 중...');

  // 캐릭터별 버그 패치 목록 집계
  const charBugMap = new Map<string, number[]>(); // character → patchIds[]

  for (const [patchId, bugFixes] of fixtures) {
    for (const bug of bugFixes) {
      if (!bug.character) continue;
      if (!charBugMap.has(bug.character)) {
        charBugMap.set(bug.character, []);
      }
      charBugMap.get(bug.character)!.push(patchId);
    }
  }

  // 캐릭터별 중복 제거 (같은 패치에서 여러 버그여도 patchId는 1회)
  const charPatchMap = new Map<string, number[]>();
  for (const [char, patchIds2] of charBugMap) {
    charPatchMap.set(
      char,
      [...new Set(patchIds2)].sort((a, b) => b - a)
    );
  }

  // Firestore의 기존 bugPatchIds와 병합 후 업데이트
  console.log(`  집계된 캐릭터: ${charPatchMap.size}명`);

  for (const [char, newPatchIds] of charPatchMap) {
    const docRef = db.collection('characters').doc(char);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.warn(`  ⚠️ [${char}] characters 문서 없음 - 스킵`);
      continue;
    }

    const existing = doc.data() ?? {};
    const existingIds: number[] = existing.bugPatchIds ?? [];

    // 기존 + 신규 병합 후 중복 제거, 내림차순 정렬
    const merged = [...new Set([...existingIds, ...newPatchIds])].sort((a, b) => b - a);
    const totalBugCount = merged.reduce((acc, pid) => {
      const bugs = fixtures.get(pid);
      const count = bugs ? bugs.filter((b) => b.character === char).length : 0;
      return acc + count;
    }, 0);

    await docRef.update({
      bugPatchIds: merged,
      totalBugCount,
    });

    console.log(
      `  [${char}] bugPatchIds: [${merged.join(', ')}] / totalBugCount: ${totalBugCount}`
    );
  }

  console.log('\n✅ 업로드 완료');
}

main().catch(console.error);
