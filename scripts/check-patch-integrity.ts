/**
 * 패치 데이터 무결성 검증 스크립트
 * - 간단한 로직: h5 "실험체" ~ 다음 h5 사이의 텍스트에서 캐릭터 이름 검색
 * - HTML 구조에 상관없이 캐릭터 이름만 있으면 감지
 *
 * 사용법:
 *   npx tsx scripts/check-patch-integrity.ts                    # 전체 검사
 *   npx tsx scripts/check-patch-integrity.ts --limit=50         # 최근 50개만
 *   npx tsx scripts/check-patch-integrity.ts --patch=1954       # 특정 패치만
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin.js';
import * as fs from 'fs';

// 유효한 캐릭터 목록
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

interface PatchIntegrityResult {
  patchId: number;
  title: string;
  webCharacters: string[]; // 웹에서 감지된 캐릭터
  firebaseCharacters: string[]; // Firebase에 있는 캐릭터
  missing: string[]; // 웹에 있지만 Firebase에 없음
  excess: string[]; // Firebase에 있지만 웹에 없음
}

/**
 * 간단한 로직으로 실험체 섹션에서 캐릭터 이름 추출
 * - h5 "실험체" ~ 다음 h5 사이의 모든 텍스트에서 캐릭터 이름 검색
 */
async function extractCharactersSimple(page: Page, patchId: number): Promise<string[]> {
  const url = `https://playeternalreturn.com/posts/news/${patchId}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1000));

    const sectionText = await page.evaluate(() => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) return '';

      const h5Elements = Array.from(content.querySelectorAll('h5'));

      // "실험체" h5 찾기
      let startH5: Element | null = null;
      let endH5: Element | null = null;

      for (let i = 0; i < h5Elements.length; i++) {
        const text = h5Elements[i].textContent?.trim();
        if (text === '실험체') {
          startH5 = h5Elements[i];
          // 다음 h5 찾기
          if (i + 1 < h5Elements.length) {
            endH5 = h5Elements[i + 1];
          }
          break;
        }
      }

      if (!startH5) return '';

      // startH5와 endH5 사이의 모든 요소의 텍스트 수집
      let collecting = false;
      let collectedText = '';

      const walker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT, null);

      let node: Node | null = walker.currentNode;
      while (node) {
        if (node === startH5) {
          collecting = true;
        } else if (node === endH5) {
          break;
        } else if (collecting && node instanceof Element) {
          // 텍스트 콘텐츠 수집
          const text = (node as Element).textContent || '';
          collectedText += ' ' + text;
        }
        node = walker.nextNode();
      }

      // endH5가 없으면 startH5 이후 전체 수집
      if (!endH5 && startH5) {
        let sibling = startH5.nextElementSibling;
        while (sibling) {
          collectedText += ' ' + (sibling.textContent || '');
          sibling = sibling.nextElementSibling;
        }
      }

      return collectedText;
    });

    // 캐릭터 이름 검색
    const foundCharacters: string[] = [];
    for (const charName of VALID_CHARACTERS) {
      if (sectionText.includes(charName)) {
        foundCharacters.push(charName);
      }
    }

    return [...new Set(foundCharacters)];
  } catch (error) {
    console.error(`  오류 (패치 ${patchId}):`, error);
    return [];
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const patchArg = args.find((a) => a.startsWith('--patch='))?.split('=')[1];

  console.log('패치 데이터 무결성 검증 시작...\n');

  const db = initFirebaseAdmin();

  // Firebase에서 캐릭터별 patchId 맵 로드
  console.log('Firebase에서 캐릭터 데이터 로드 중...');
  const charSnapshot = await db.collection('characters').get();
  const characterPatchMap = new Map<string, Set<number>>();

  charSnapshot.forEach((doc) => {
    const data = doc.data();
    const patchIds = new Set<number>();
    if (data.patchHistory && Array.isArray(data.patchHistory)) {
      for (const patch of data.patchHistory) {
        if (patch.patchId) patchIds.add(patch.patchId);
      }
    }
    characterPatchMap.set(data.name, patchIds);
  });
  console.log(`  ${characterPatchMap.size}개 캐릭터 로드됨\n`);

  // 패치노트 로드
  console.log('패치노트 목록 로드 중...');
  let patchQuery = db.collection('patchNotes').orderBy('id', 'desc');

  if (patchArg) {
    // 특정 패치만
    const patchSnapshot = await db
      .collection('patchNotes')
      .where('id', '==', parseInt(patchArg))
      .get();
    const patchNotes: { id: number; title: string }[] = [];
    patchSnapshot.forEach((doc) => {
      const data = doc.data();
      patchNotes.push({ id: data.id, title: data.title });
    });

    if (patchNotes.length === 0) {
      console.log(`패치 ${patchArg}를 찾을 수 없습니다.`);
      return;
    }

    console.log(`패치 ${patchArg} 검사...\n`);

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setCookie({ name: 'locale', value: 'ko_KR', domain: 'playeternalreturn.com' });

    const patch = patchNotes[0];
    const webChars = await extractCharactersSimple(page, patch.id);

    // Firebase에서 해당 패치를 가진 캐릭터 찾기
    const firebaseChars: string[] = [];
    for (const [charName, patchIds] of characterPatchMap) {
      if (patchIds.has(patch.id)) {
        firebaseChars.push(charName);
      }
    }

    console.log(`패치 ${patch.id} (${patch.title}):`);
    console.log(`  웹에서 감지: ${webChars.length}개 - ${webChars.join(', ')}`);
    console.log(`  Firebase: ${firebaseChars.length}개 - ${firebaseChars.join(', ')}`);

    const missing = webChars.filter((c) => !firebaseChars.includes(c));
    const excess = firebaseChars.filter((c) => !webChars.includes(c));

    if (missing.length > 0) {
      console.log(`  🔴 누락: ${missing.join(', ')}`);
    }
    if (excess.length > 0) {
      console.log(`  🟡 초과: ${excess.join(', ')}`);
    }
    if (missing.length === 0 && excess.length === 0) {
      console.log(`  ✅ 일치`);
    }

    await browser.close();
    return;
  }

  // 전체 또는 limit 개수만큼
  if (limitArg) {
    patchQuery = patchQuery.limit(parseInt(limitArg));
  }

  const patchSnapshot = await patchQuery.get();
  const patchNotes: { id: number; title: string }[] = [];
  patchSnapshot.forEach((doc) => {
    const data = doc.data();
    patchNotes.push({ id: data.id, title: data.title });
  });
  console.log(`  ${patchNotes.length}개 패치노트 로드됨\n`);

  // 브라우저 시작
  const browser: Browser = await puppeteer.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setCookie({ name: 'locale', value: 'ko_KR', domain: 'playeternalreturn.com' });

  const results: PatchIntegrityResult[] = [];
  let matchCount = 0;
  let mismatchCount = 0;

  for (let i = 0; i < patchNotes.length; i++) {
    const patch = patchNotes[i];
    const progress = `[${i + 1}/${patchNotes.length}]`;
    process.stdout.write(`\r${progress} 패치 ${patch.id} 검사 중...`);

    const webChars = await extractCharactersSimple(page, patch.id);

    // Firebase에서 해당 패치를 가진 캐릭터 찾기
    const firebaseChars: string[] = [];
    for (const [charName, patchIds] of characterPatchMap) {
      if (patchIds.has(patch.id)) {
        firebaseChars.push(charName);
      }
    }

    const missing = webChars.filter((c) => !firebaseChars.includes(c));
    const excess = firebaseChars.filter((c) => !webChars.includes(c));

    if (missing.length > 0 || excess.length > 0) {
      mismatchCount++;
      results.push({
        patchId: patch.id,
        title: patch.title,
        webCharacters: webChars,
        firebaseCharacters: firebaseChars,
        missing,
        excess,
      });
    } else {
      matchCount++;
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  await browser.close();

  // 결과 출력
  console.log('\n\n' + '='.repeat(70));
  console.log('무결성 검증 완료');
  console.log('='.repeat(70));
  console.log(`✅ 일치: ${matchCount}개 패치`);
  console.log(`❌ 불일치: ${mismatchCount}개 패치\n`);

  if (results.length > 0) {
    console.log('-'.repeat(70));
    console.log('불일치 패치 상세');
    console.log('-'.repeat(70) + '\n');

    // 누락이 있는 패치
    const withMissing = results.filter((r) => r.missing.length > 0);
    if (withMissing.length > 0) {
      console.log(`\n### 누락 (웹에 있지만 Firebase에 없음) - ${withMissing.length}개 패치 ###\n`);
      for (const result of withMissing) {
        console.log(`패치 ${result.patchId} (${result.title}):`);
        console.log(`  누락: ${result.missing.join(', ')}`);
      }
    }

    // 초과가 있는 패치
    const withExcess = results.filter((r) => r.excess.length > 0);
    if (withExcess.length > 0) {
      console.log(`\n### 초과 (Firebase에 있지만 웹에 없음) - ${withExcess.length}개 패치 ###\n`);
      for (const result of withExcess) {
        console.log(`패치 ${result.patchId} (${result.title}):`);
        console.log(`  초과: ${result.excess.join(', ')}`);
      }
    }
  }

  // JSON 파일로 저장
  const outputPath = 'scripts/integrity-results.json';
  const output = {
    timestamp: new Date().toISOString(),
    summary: {
      totalPatches: patchNotes.length,
      matchCount,
      mismatchCount,
      totalMissing: results.reduce((acc, r) => acc + r.missing.length, 0),
      totalExcess: results.reduce((acc, r) => acc + r.excess.length, 0),
    },
    mismatches: results,
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n결과가 ${outputPath}에 저장되었습니다.`);

  // 통계
  const totalMissing = results.reduce((acc, r) => acc + r.missing.length, 0);
  const totalExcess = results.reduce((acc, r) => acc + r.excess.length, 0);
  console.log('\n' + '='.repeat(70));
  console.log('통계 요약');
  console.log('='.repeat(70));
  console.log(`검사 패치: ${patchNotes.length}개`);
  console.log(`일치: ${matchCount}개`);
  console.log(`불일치: ${mismatchCount}개`);
  console.log(`총 누락 항목: ${totalMissing}개`);
  console.log(`총 초과 항목: ${totalExcess}개`);
}

main().catch(console.error);
