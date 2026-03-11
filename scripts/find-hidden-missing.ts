/**
 * HTML 구조 차이로 인해 기존 스크립트에서 놓친 캐릭터들을 찾는 스크립트
 * - 기존 로직: spanText === strongText 조건으로만 캐릭터 감지
 * - 개선 로직: strong 태그의 첫 번째 텍스트가 유효한 캐릭터명이면 감지
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin.js';

const VALID_CHARACTERS = new Set([
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
]);

async function extractAllCharacters(
  page: Page,
  patchId: number
): Promise<{
  oldMethod: string[];
  newMethod: string[];
  onlyInNew: string[];
}> {
  const url = `https://playeternalreturn.com/posts/news/${patchId}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1000));

    const result = await page.evaluate(() => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) return { oldMethod: [], newMethod: [] };

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

      if (!characterSectionStart) return { oldMethod: [], newMethod: [] };

      const oldMethod: string[] = [];
      const newMethod: string[] = [];

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

        const span = p.querySelector('span');
        const spanText = span?.textContent?.trim() || '';
        const strongText = strong.textContent?.trim() || '';

        // 기존 방식: spanText === strongText
        const excluded = [
          '실험체',
          '무기',
          '아이템',
          '시스템',
          '특성',
          '코발트 프로토콜',
          '론울프',
        ];
        if (
          spanText === strongText &&
          /^[가-힣&\s]+$/.test(strongText) &&
          !excluded.includes(strongText)
        ) {
          oldMethod.push(strongText);
        }

        // 새로운 방식: strong 텍스트만 확인 (한글 캐릭터명)
        if (/^[가-힣&\s]+$/.test(strongText) && !excluded.includes(strongText)) {
          newMethod.push(strongText);
        }
      }

      return { oldMethod, newMethod };
    });

    const oldValid = result.oldMethod.filter((n) =>
      VALID_CHARACTERS.has(n.replace(/\s+/g, ' ').trim())
    );
    const newValid = result.newMethod.filter((n) =>
      VALID_CHARACTERS.has(n.replace(/\s+/g, ' ').trim())
    );
    const onlyInNew = newValid.filter((n) => !oldValid.includes(n));

    return {
      oldMethod: [...new Set(oldValid)],
      newMethod: [...new Set(newValid)],
      onlyInNew: [...new Set(onlyInNew)],
    };
  } catch (error) {
    console.error(`  오류 (패치 ${patchId}):`, error);
    return { oldMethod: [], newMethod: [], onlyInNew: [] };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const limit = limitArg ? parseInt(limitArg, 10) : 20; // 기본값 20개 패치만 검사

  console.log('HTML 구조 차이로 누락된 캐릭터 검색...\n');

  // Firebase에서 캐릭터별 patchId 맵 로드
  const db = initFirebaseAdmin();

  // characters 컬렉션에서 사용된 patchId 수집
  const snapshot = await db.collection('characters').get();
  const characterPatchMap = new Map<string, Set<number>>();

  snapshot.forEach((doc) => {
    const data = doc.data();
    const patchIds = new Set<number>();
    if (data.patchHistory && Array.isArray(data.patchHistory)) {
      for (const patch of data.patchHistory) {
        if (patch.patchId) patchIds.add(patch.patchId);
      }
    }
    characterPatchMap.set(data.name, patchIds);
  });

  // 패치노트 로드
  const patchSnapshot = await db.collection('patchNotes').orderBy('id', 'desc').limit(limit).get();
  const patchNotes: { id: number; title: string }[] = [];
  patchSnapshot.forEach((doc) => {
    const data = doc.data();
    patchNotes.push({ id: data.id, title: data.title });
  });

  console.log(`최근 ${patchNotes.length}개 패치 검사...\n`);

  const browser: Browser = await puppeteer.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setCookie({ name: 'locale', value: 'ko_KR', domain: 'playeternalreturn.com' });

  const hiddenMissing: { patchId: number; title: string; characters: string[] }[] = [];

  for (let i = 0; i < patchNotes.length; i++) {
    const patch = patchNotes[i];
    const progress = `[${i + 1}/${patchNotes.length}]`;
    process.stdout.write(`${progress} 패치 ${patch.id} 검사 중...`);

    const { onlyInNew } = await extractAllCharacters(page, patch.id);

    // onlyInNew 중에서 Firebase에도 없는 캐릭터 찾기
    const trulyMissing: string[] = [];
    for (const charName of onlyInNew) {
      const charPatches = characterPatchMap.get(charName);
      if (!charPatches || !charPatches.has(patch.id)) {
        trulyMissing.push(charName);
      }
    }

    if (trulyMissing.length > 0) {
      console.log(` 🔴 숨겨진 누락 발견: ${trulyMissing.join(', ')}`);
      hiddenMissing.push({ patchId: patch.id, title: patch.title, characters: trulyMissing });
    } else if (onlyInNew.length > 0) {
      console.log(` (새 방식으로만 감지: ${onlyInNew.join(', ')} - 이미 Firebase에 있음)`);
    } else {
      console.log(' OK');
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  await browser.close();

  console.log('\n' + '='.repeat(60));
  console.log('검사 완료');
  console.log('='.repeat(60));

  if (hiddenMissing.length > 0) {
    console.log(
      `\n🔴 숨겨진 누락 ${hiddenMissing.reduce((acc, p) => acc + p.characters.length, 0)}개 발견:\n`
    );
    for (const item of hiddenMissing) {
      console.log(`패치 ${item.patchId} (${item.title}):`);
      console.log(`  누락: ${item.characters.join(', ')}`);
    }
  } else {
    console.log('\n✅ 숨겨진 누락 없음');
  }
}

main().catch(console.error);
