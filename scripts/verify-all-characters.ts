/**
 * 전체 실험체 패치 데이터 검증 스크립트
 * - Firebase의 각 캐릭터 patchHistory와 실제 웹 패치노트 비교
 * - 누락(웹에 있지만 Firebase에 없음) 및 초과(Firebase에 있지만 웹에 없음) 발견
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin.js';
import * as fs from 'fs';

const VALID_CHARACTERS = [
  '가넷',
  '나딘',
  '나타폰',
  '니아',
  '니키',
  '다니엘',
  '다르코',
  '데비&마를렌',
  '띠아',
  '라우라',
  '레녹스',
  '레니',
  '레온',
  '로지',
  '루크',
  '르노어',
  '리 다이린',
  '리오',
  '마르티나',
  '마이',
  '마커스',
  '매그너스',
  '미르카',
  '바냐',
  '바바라',
  '버니스',
  '블레어',
  '비앙카',
  '샬럿',
  '셀린',
  '쇼우',
  '쇼이치',
  '수아',
  '슈린',
  '시셀라',
  '실비아',
  '아델라',
  '아드리아나',
  '아디나',
  '아르다',
  '아비게일',
  '아야',
  '아이솔',
  '아이작',
  '알렉스',
  '알론소',
  '얀',
  '에스텔',
  '에이든',
  '에키온',
  '엘레나',
  '엠마',
  '요한',
  '윌리엄',
  '유민',
  '유스티나',
  '유키',
  '이렘',
  '이바',
  '이슈트반',
  '이안',
  '일레븐',
  '자히르',
  '재키',
  '제니',
  '츠바메',
  '카밀로',
  '카티야',
  '칼라',
  '캐시',
  '케네스',
  '클로에',
  '키아라',
  '타지아',
  '테오도르',
  '펠릭스',
  '프리야',
  '피오라',
  '피올로',
  '하트',
  '헤이즈',
  '헨리',
  '현우',
  '혜진',
  '히스이',
];

const VALID_CHARACTERS_SET = new Set(VALID_CHARACTERS);

interface PatchNote {
  id: number;
  title: string;
}

interface VerificationResult {
  character: string;
  firebaseCount: number;
  webCount: number;
  missing: number[]; // 웹에 있지만 Firebase에 없음
  excess: number[]; // Firebase에 있지만 웹에 없음
}

// 개선된 파싱 로직 - strong 태그 텍스트만 확인
async function extractCharactersFromPatch(page: Page, patchId: number): Promise<string[]> {
  const url = `https://playeternalreturn.com/posts/news/${patchId}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1000));

    const characters = await page.evaluate(() => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) return [];

      // 실험체 섹션 찾기
      const h5Elements = content.querySelectorAll('h5');
      let characterSectionStart: Element | null = null;
      let characterSectionEnd: Element | null = null;

      for (let i = 0; i < h5Elements.length; i++) {
        const text = h5Elements[i].textContent?.trim();
        if (text === '실험체') {
          characterSectionStart = h5Elements[i];
          for (let j = i + 1; j < h5Elements.length; j++) {
            const nextText = h5Elements[j].textContent?.trim();
            if (
              nextText &&
              ['무기', '아이템', '코발트 프로토콜', '론울프', '특성', '시스템'].includes(nextText)
            ) {
              characterSectionEnd = h5Elements[j];
              break;
            }
          }
          break;
        }
      }

      if (!characterSectionStart) return [];

      const found: string[] = [];
      const excluded = ['실험체', '무기', '아이템', '시스템', '특성', '코발트 프로토콜', '론울프'];

      const allP = content.querySelectorAll('p');
      for (const p of Array.from(allP)) {
        // 실험체 섹션 이전이면 스킵
        if (p.compareDocumentPosition(characterSectionStart) & Node.DOCUMENT_POSITION_FOLLOWING) {
          continue;
        }
        // 무기/아이템 섹션 이후면 스킵
        if (
          characterSectionEnd &&
          !(p.compareDocumentPosition(characterSectionEnd) & Node.DOCUMENT_POSITION_FOLLOWING)
        ) {
          continue;
        }

        const strong = p.querySelector('span > strong');
        if (!strong) continue;

        const strongText = strong.textContent?.trim() || '';

        // 개선된 방식: strong 텍스트만 확인 (한글 캐릭터명)
        if (/^[가-힣&\s]+$/.test(strongText) && !excluded.includes(strongText)) {
          found.push(strongText);
        }
      }

      return found;
    });

    // 유효한 캐릭터명만 필터링
    const validChars = characters.filter((n) =>
      VALID_CHARACTERS_SET.has(n.replace(/\s+/g, ' ').trim())
    );

    return [...new Set(validChars)];
  } catch (error) {
    console.error(`  오류 (패치 ${patchId}):`, error);
    return [];
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const startArg = args.find((a) => a.startsWith('--start='))?.split('=')[1];
  const endArg = args.find((a) => a.startsWith('--end='))?.split('=')[1];
  const startIdx = startArg ? parseInt(startArg, 10) : 0;
  const endIdx = endArg ? parseInt(endArg, 10) : VALID_CHARACTERS.length;

  const charactersToCheck = VALID_CHARACTERS.slice(startIdx, endIdx);

  console.log(`전체 실험체 패치 데이터 검증 시작...\n`);
  console.log(
    `검증 대상: ${charactersToCheck.length}개 실험체 (인덱스 ${startIdx}-${endIdx - 1})\n`
  );

  const db = initFirebaseAdmin();

  // 1. Firebase에서 모든 캐릭터의 patchHistory 로드
  console.log('Firebase에서 캐릭터 데이터 로드 중...');
  const characterSnapshot = await db.collection('characters').get();
  const characterPatchMap = new Map<string, Set<number>>();

  characterSnapshot.forEach((doc) => {
    const data = doc.data();
    const patchIds = new Set<number>();
    if (data.patchHistory && Array.isArray(data.patchHistory)) {
      for (const patch of data.patchHistory) {
        if (patch.patchId) patchIds.add(patch.patchId);
      }
    }
    characterPatchMap.set(data.name, patchIds);
  });

  console.log(`${characterPatchMap.size}개 캐릭터 데이터 로드 완료\n`);

  // 2. 모든 패치노트 로드
  console.log('패치노트 목록 로드 중...');
  const patchSnapshot = await db.collection('patchNotes').orderBy('id', 'desc').get();
  const patchNotes: PatchNote[] = [];
  patchSnapshot.forEach((doc) => {
    const data = doc.data();
    patchNotes.push({ id: data.id, title: data.title });
  });
  console.log(`${patchNotes.length}개 패치노트 로드 완료\n`);

  // 3. 각 패치에서 캐릭터 목록 크롤링
  console.log('웹에서 패치 데이터 크롤링 중...');
  const browser: Browser = await puppeteer.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setCookie({ name: 'locale', value: 'ko_KR', domain: 'playeternalreturn.com' });

  // 패치별 캐릭터 맵 생성
  const patchCharacterMap = new Map<number, Set<string>>();

  for (let i = 0; i < patchNotes.length; i++) {
    const patch = patchNotes[i];
    const progress = `[${i + 1}/${patchNotes.length}]`;
    process.stdout.write(`\r${progress} 패치 ${patch.id} 크롤링 중...`);

    const characters = await extractCharactersFromPatch(page, patch.id);
    patchCharacterMap.set(patch.id, new Set(characters));

    await new Promise((r) => setTimeout(r, 300));
  }

  await browser.close();
  console.log('\n크롤링 완료\n');

  // 4. 각 캐릭터별로 비교
  console.log('캐릭터별 검증 중...\n');
  const results: VerificationResult[] = [];

  for (const character of charactersToCheck) {
    const firebasePatchIds = characterPatchMap.get(character) || new Set<number>();

    // 웹에서 해당 캐릭터가 등장하는 패치 찾기
    const webPatchIds = new Set<number>();
    for (const [patchId, chars] of patchCharacterMap) {
      if (chars.has(character)) {
        webPatchIds.add(patchId);
      }
    }

    // 누락: 웹에 있지만 Firebase에 없음
    const missing = [...webPatchIds]
      .filter((id) => !firebasePatchIds.has(id))
      .sort((a, b) => b - a);

    // 초과: Firebase에 있지만 웹에 없음
    const excess = [...firebasePatchIds].filter((id) => !webPatchIds.has(id)).sort((a, b) => b - a);

    results.push({
      character,
      firebaseCount: firebasePatchIds.size,
      webCount: webPatchIds.size,
      missing,
      excess,
    });
  }

  // 5. 결과 출력
  console.log('='.repeat(70));
  console.log('검증 결과');
  console.log('='.repeat(70) + '\n');

  const withDiscrepancy = results.filter((r) => r.missing.length > 0 || r.excess.length > 0);
  const perfectMatch = results.filter((r) => r.missing.length === 0 && r.excess.length === 0);

  console.log(`✅ 일치: ${perfectMatch.length}개 캐릭터`);
  console.log(`❌ 불일치: ${withDiscrepancy.length}개 캐릭터\n`);

  if (withDiscrepancy.length > 0) {
    console.log('-'.repeat(70));
    console.log('불일치 캐릭터 상세');
    console.log('-'.repeat(70) + '\n');

    for (const result of withDiscrepancy) {
      console.log(
        `【${result.character}】 Firebase: ${result.firebaseCount}개, 웹: ${result.webCount}개`
      );
      if (result.missing.length > 0) {
        console.log(`  🔴 누락 (웹에 있지만 Firebase에 없음): ${result.missing.join(', ')}`);
      }
      if (result.excess.length > 0) {
        console.log(`  🟡 초과 (Firebase에 있지만 웹에 없음): ${result.excess.join(', ')}`);
      }
      console.log();
    }
  }

  // 6. JSON 파일로 저장
  const outputPath = 'scripts/verification-results.json';
  const output = {
    timestamp: new Date().toISOString(),
    summary: {
      totalCharacters: results.length,
      perfectMatch: perfectMatch.length,
      withDiscrepancy: withDiscrepancy.length,
    },
    discrepancies: withDiscrepancy.map((r) => ({
      character: r.character,
      firebaseCount: r.firebaseCount,
      webCount: r.webCount,
      missing: r.missing,
      excess: r.excess,
    })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n결과가 ${outputPath}에 저장되었습니다.`);

  // 7. 통계
  const totalMissing = withDiscrepancy.reduce((acc, r) => acc + r.missing.length, 0);
  const totalExcess = withDiscrepancy.reduce((acc, r) => acc + r.excess.length, 0);

  console.log('\n' + '='.repeat(70));
  console.log('통계 요약');
  console.log('='.repeat(70));
  console.log(`검증 캐릭터: ${results.length}개`);
  console.log(`일치: ${perfectMatch.length}개`);
  console.log(`불일치: ${withDiscrepancy.length}개`);
  console.log(`총 누락 패치: ${totalMissing}개`);
  console.log(`총 초과 패치: ${totalExcess}개`);
}

main().catch(console.error);
