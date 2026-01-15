/**
 * 패치 데이터 비교 스크립트
 *
 * patch-characters.json (패치노트에서 직접 추출한 실험체 목록)과
 * Firebase characters 컬렉션의 patchHistory를 비교하여
 * 누락된 패치 데이터를 찾습니다.
 */

import { initFirebaseAdmin } from './lib/firebase-admin';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

type PatchCharacters = {
  patchId: number;
  patchTitle: string;
  patchDate: string;
  patchLink: string;
  characters: string[];
};

type PatchEntry = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
};

type CharacterData = {
  name: string;
  patchHistory: PatchEntry[];
};

type MissingPatch = {
  patchId: number;
  patchTitle: string;
  patchDate: string;
  patchLink: string;
  character: string;
};

type ExtraPatch = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  character: string;
};

// Firebase에서 모든 캐릭터 데이터 조회
async function getAllCharacters(): Promise<Record<string, Set<number>>> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('characters').get();
  const characterPatches: Record<string, Set<number>> = {};

  snapshot.forEach((doc) => {
    const data = doc.data() as CharacterData;
    const patchIds = new Set<number>();

    if (data.patchHistory) {
      for (const patch of data.patchHistory) {
        patchIds.add(patch.patchId);
      }
    }

    characterPatches[data.name] = patchIds;
  });

  console.log(`Firebase에서 ${Object.keys(characterPatches).length}명의 캐릭터 데이터 조회됨`);
  return characterPatches;
}

// 패치노트에서 추출한 데이터 로드
function loadPatchCharacters(): PatchCharacters[] {
  const filePath = path.join(process.cwd(), 'scripts', 'patch-characters.json');
  const data = readFileSync(filePath, 'utf-8');
  const patchCharacters = JSON.parse(data) as PatchCharacters[];
  console.log(`패치노트에서 추출한 데이터: ${patchCharacters.length}개 패치`);
  return patchCharacters;
}

async function main(): Promise<void> {
  console.log('패치 데이터 비교 시작...\n');

  // 데이터 로드
  const patchCharacters = loadPatchCharacters();
  const firebaseCharacters = await getAllCharacters();

  // 누락된 패치 데이터 찾기
  const missingPatches: MissingPatch[] = [];
  const extraPatches: ExtraPatch[] = [];

  // 패치노트 기준으로 캐릭터별 patchId 집합 생성
  const patchNoteCharacterPatches: Record<string, Set<number>> = {};
  const patchInfoMap: Record<number, PatchCharacters> = {};

  for (const patch of patchCharacters) {
    patchInfoMap[patch.patchId] = patch;

    for (const char of patch.characters) {
      if (!patchNoteCharacterPatches[char]) {
        patchNoteCharacterPatches[char] = new Set();
      }
      patchNoteCharacterPatches[char].add(patch.patchId);
    }
  }

  // 1. 패치노트에는 있지만 Firebase에는 없는 패치 (누락)
  console.log('\n=== 누락된 패치 데이터 검색 중... ===\n');

  for (const [charName, patchIds] of Object.entries(patchNoteCharacterPatches)) {
    const firebasePatchIds = firebaseCharacters[charName] || new Set();

    for (const patchId of patchIds) {
      if (!firebasePatchIds.has(patchId)) {
        const patchInfo = patchInfoMap[patchId];
        missingPatches.push({
          patchId,
          patchTitle: patchInfo.patchTitle,
          patchDate: patchInfo.patchDate,
          patchLink: patchInfo.patchLink,
          character: charName,
        });
      }
    }
  }

  // 2. Firebase에는 있지만 패치노트에는 없는 패치 (잘못된 데이터 또는 수동 추가)
  console.log('=== Firebase에만 있는 패치 데이터 검색 중... ===\n');

  for (const [charName, patchIds] of Object.entries(firebaseCharacters)) {
    const patchNotePatchIds = patchNoteCharacterPatches[charName] || new Set();

    for (const patchId of patchIds) {
      if (!patchNotePatchIds.has(patchId)) {
        // 이 캐릭터의 이 패치는 패치노트에서 발견되지 않음
        // (패치노트에 실험체 섹션이 없거나, 파싱에서 누락되었을 수 있음)
        extraPatches.push({
          patchId,
          patchVersion: '',
          patchDate: '',
          character: charName,
        });
      }
    }
  }

  // 결과 정리
  console.log('='.repeat(60));
  console.log('비교 결과 요약');
  console.log('='.repeat(60));

  // 캐릭터별 누락 통계
  const missingByCharacter: Record<string, MissingPatch[]> = {};
  for (const missing of missingPatches) {
    if (!missingByCharacter[missing.character]) {
      missingByCharacter[missing.character] = [];
    }
    missingByCharacter[missing.character].push(missing);
  }

  // 패치별 누락 통계
  const missingByPatch: Record<number, string[]> = {};
  for (const missing of missingPatches) {
    if (!missingByPatch[missing.patchId]) {
      missingByPatch[missing.patchId] = [];
    }
    missingByPatch[missing.patchId].push(missing.character);
  }

  console.log(`\n누락된 패치 엔트리: ${missingPatches.length}개`);
  console.log(`영향받은 캐릭터: ${Object.keys(missingByCharacter).length}명`);
  console.log(`영향받은 패치: ${Object.keys(missingByPatch).length}개`);
  console.log(`\nFirebase에만 있는 패치 엔트리: ${extraPatches.length}개`);

  // 가장 많이 누락된 캐릭터 Top 10
  if (Object.keys(missingByCharacter).length > 0) {
    const sortedChars = Object.entries(missingByCharacter)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10);

    console.log('\n=== 가장 많이 누락된 캐릭터 Top 10 ===');
    for (const [char, patches] of sortedChars) {
      console.log(`  ${char}: ${patches.length}개 패치 누락`);
    }
  }

  // 가장 많이 누락된 패치 Top 10
  if (Object.keys(missingByPatch).length > 0) {
    const sortedPatches = Object.entries(missingByPatch)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10);

    console.log('\n=== 가장 많이 누락된 패치 Top 10 ===');
    for (const [patchId, chars] of sortedPatches) {
      const patchInfo = patchInfoMap[parseInt(patchId)];
      console.log(
        `  [${patchId}] ${patchInfo?.patchTitle || '(제목 없음)'}: ${chars.length}명 누락`
      );
    }
  }

  // 상세 결과 저장
  const result = {
    summary: {
      totalMissing: missingPatches.length,
      affectedCharacters: Object.keys(missingByCharacter).length,
      affectedPatches: Object.keys(missingByPatch).length,
      extraInFirebase: extraPatches.length,
    },
    missingByCharacter,
    missingByPatch: Object.fromEntries(
      Object.entries(missingByPatch).map(([patchId, chars]) => {
        const patchInfo = patchInfoMap[parseInt(patchId)];
        return [
          patchId,
          {
            patchTitle: patchInfo?.patchTitle || '',
            patchDate: patchInfo?.patchDate || '',
            patchLink: patchInfo?.patchLink || '',
            characters: chars,
          },
        ];
      })
    ),
    missingPatches,
    extraPatches,
  };

  const outputPath = path.join(process.cwd(), 'scripts', 'patch-comparison-result.json');
  writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n상세 결과 저장: ${outputPath}`);

  // 캐릭터별 상세 누락 목록 출력
  if (missingPatches.length > 0 && missingPatches.length <= 100) {
    console.log('\n=== 누락된 패치 상세 목록 ===');
    for (const [char, patches] of Object.entries(missingByCharacter).sort()) {
      console.log(`\n[${char}] (${patches.length}개 누락)`);
      for (const patch of patches.sort((a, b) => b.patchId - a.patchId).slice(0, 5)) {
        console.log(`  - [${patch.patchId}] ${patch.patchTitle} (${patch.patchDate})`);
      }
      if (patches.length > 5) {
        console.log(`  ... 외 ${patches.length - 5}개`);
      }
    }
  }
}

main().catch(console.error);
