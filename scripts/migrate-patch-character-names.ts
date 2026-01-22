/**
 * 마이그레이션 스크립트: patchNotes에 characterNames 필드 추가
 *
 * 기존 characters 컬렉션에서 patchId별 캐릭터 이름을 수집하여
 * patchNotes 컬렉션의 해당 문서에 characterNames 필드를 업데이트합니다.
 *
 * 실행: npx tsx scripts/migrate-patch-character-names.ts
 */

import { initFirebaseAdmin } from './lib/firebase-admin';

type PatchEntry = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
};

type CharacterData = {
  name: string;
  patchHistory: PatchEntry[];
};

async function main(): Promise<void> {
  console.log('=== patchNotes characterNames 마이그레이션 시작 ===\n');

  const db = initFirebaseAdmin();

  // 1. characters 컬렉션에서 모든 캐릭터 데이터 로드
  console.log('1. characters 컬렉션 로드 중...');
  const charactersSnapshot = await db.collection('characters').get();

  if (charactersSnapshot.empty) {
    console.log('characters 컬렉션이 비어있습니다.');
    return;
  }

  console.log(`   ${charactersSnapshot.size}개 캐릭터 로드됨\n`);

  // 2. patchId별 캐릭터 이름 수집
  console.log('2. patchId별 캐릭터 이름 수집 중...');
  const patchCharacterMap = new Map<number, Set<string>>();

  charactersSnapshot.forEach((doc) => {
    const data = doc.data() as CharacterData;
    const characterName = data.name;

    for (const patch of data.patchHistory) {
      if (!patchCharacterMap.has(patch.patchId)) {
        patchCharacterMap.set(patch.patchId, new Set());
      }
      patchCharacterMap.get(patch.patchId)!.add(characterName);
    }
  });

  console.log(`   ${patchCharacterMap.size}개 패치에 캐릭터 매핑됨\n`);

  // 3. patchNotes 컬렉션 업데이트
  console.log('3. patchNotes 컬렉션 업데이트 중...');

  const batchSize = 500;
  const patchIds = Array.from(patchCharacterMap.keys());
  let updatedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < patchIds.length; i += batchSize) {
    const batch = db.batch();
    const chunk = patchIds.slice(i, i + batchSize);
    let batchHasUpdates = false;

    for (const patchId of chunk) {
      const characterNames = Array.from(patchCharacterMap.get(patchId)!).sort();
      const docRef = db.collection('patchNotes').doc(patchId.toString());

      // 문서 존재 여부 확인
      const docSnapshot = await docRef.get();
      if (!docSnapshot.exists) {
        skippedCount++;
        continue;
      }

      batch.update(docRef, {
        characterNames,
      });
      batchHasUpdates = true;
      updatedCount++;
    }

    if (batchHasUpdates) {
      await batch.commit();
    }

    console.log(`   진행: ${Math.min(i + batchSize, patchIds.length)}/${patchIds.length}`);
  }

  // 4. 결과 출력
  console.log('\n=== 마이그레이션 완료 ===');
  console.log(`업데이트된 패치노트: ${updatedCount}개`);
  console.log(`스킵된 패치 (문서 없음): ${skippedCount}개`);

  // 샘플 출력
  console.log('\n=== 샘플 데이터 ===');
  const samplePatchIds = patchIds.slice(0, 5);
  for (const patchId of samplePatchIds) {
    const names = Array.from(patchCharacterMap.get(patchId)!).sort();
    console.log(`패치 ${patchId}: ${names.join(', ')}`);
  }
}

main().catch(console.error);
