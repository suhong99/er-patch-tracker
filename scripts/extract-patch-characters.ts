/**
 * 패치노트별 실험체 목록 추출 스크립트
 *
 * Firebase에서 모든 패치노트를 가져와서
 * 각 패치노트 HTML에서 실험체 섹션의 캐릭터 이름만 추출합니다.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin';
import { writeFileSync } from 'fs';
import path from 'path';

type PatchNote = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
  hasCharacterData?: boolean;
};

type PatchCharacters = {
  patchId: number;
  patchTitle: string;
  patchDate: string;
  patchLink: string;
  characters: string[];
};

// 유효한 캐릭터 목록 (공식 실험체)
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

function normalizeCharacterName(name: string): string {
  return name
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidCharacter(name: string): boolean {
  return VALID_CHARACTERS.has(normalizeCharacterName(name));
}

// Firestore에서 모든 패치노트 조회
async function getAllPatchNotes(): Promise<PatchNote[]> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('patchNotes').orderBy('id', 'desc').get();

  const patchNotes: PatchNote[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data() as PatchNote;
    patchNotes.push(data);
  });

  console.log(`Firestore에서 총 ${patchNotes.length}개 패치노트 조회됨`);
  return patchNotes;
}

// 패치노트에서 실험체 이름 추출
async function extractCharacterNames(page: Page, url: string): Promise<string[]> {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const characters = await page.evaluate(() => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) return [];

      // 모든 h5 요소 찾기
      const h5Elements = content.querySelectorAll('h5');
      let characterSectionStart: Element | null = null;
      let characterSectionEnd: Element | null = null;

      // "실험체" h5 찾기
      for (let i = 0; i < h5Elements.length; i++) {
        const text = h5Elements[i].textContent?.trim();
        if (text === '실험체') {
          characterSectionStart = h5Elements[i];
          // 다음 h5를 끝으로 설정
          if (i + 1 < h5Elements.length) {
            characterSectionEnd = h5Elements[i + 1];
          }
          break;
        }
      }

      if (!characterSectionStart) return [];

      // 실험체 섹션 내에서 strong 태그 찾기
      const characterNames: string[] = [];

      // content의 모든 자식 요소를 순회
      const allElements = Array.from(content.children);
      let inSection = false;

      for (const el of allElements) {
        // 섹션 시작 확인
        if (el === characterSectionStart) {
          inSection = true;
          continue;
        }

        // 섹션 종료 확인
        if (characterSectionEnd && el === characterSectionEnd) {
          break;
        }

        // 실험체 섹션이 아니면 스킵
        if (!inSection) continue;

        // strong 태그에서 실험체 이름 찾기
        // 패턴: p > span > strong 구조에서 한글 이름만
        const strongElements = el.querySelectorAll('strong');

        for (const strong of strongElements) {
          const name = strong.textContent?.trim();
          if (!name) continue;

          // 정리: HTML 엔티티 처리
          const cleanName = name
            .replace(/&amp;/g, '&')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          // 실험체 이름 조건:
          // 1. 한글로만 구성 (& 포함 가능: 데비&마를렌)
          // 2. 섹션 제목 제외
          // 3. 너무 긴 텍스트 제외 (실험체 이름은 보통 10자 이내)
          const excludeNames = [
            '실험체',
            '무기',
            '아이템',
            '시스템',
            '특성',
            '코발트 프로토콜',
            '론울프',
            '옷',
            '팔/장식',
            '머리',
            '다리',
            '악세서리',
          ];

          if (
            /^[가-힣&\s]+$/.test(cleanName) &&
            cleanName.length <= 15 &&
            !excludeNames.includes(cleanName) &&
            !characterNames.includes(cleanName)
          ) {
            // 부모 요소 확인: span > strong 또는 p > span > strong 구조여야 함
            const parent = strong.parentElement;
            if (parent) {
              const parentText = parent.textContent?.trim();
              // 부모의 텍스트가 strong 텍스트와 같거나, strong만 포함하면 캐릭터명
              if (parentText === cleanName || parent.tagName === 'SPAN') {
                characterNames.push(cleanName);
              }
            }
          }
        }
      }

      return characterNames;
    });

    // VALID_CHARACTERS로 필터링
    return characters.filter((name) => isValidCharacter(name));
  } catch (error) {
    console.error(`파싱 오류 (${url}):`, error);
    return [];
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('패치노트별 실험체 목록 추출 시작...\n');

  // 모든 패치노트 조회
  const patchNotes = await getAllPatchNotes();

  // 브라우저 시작
  console.log('\n브라우저 시작...');
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page: Page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // 한국어 페이지 렌더링을 위한 쿠키 설정
  await page.setCookie({
    name: 'locale',
    value: 'ko_KR',
    domain: 'playeternalreturn.com',
  });

  const results: PatchCharacters[] = [];
  let totalCharacterEntries = 0;

  console.log(`\n총 ${patchNotes.length}개 패치노트 처리 시작...\n`);

  for (let i = 0; i < patchNotes.length; i++) {
    const patch = patchNotes[i];
    const progress = `[${i + 1}/${patchNotes.length}]`;

    process.stdout.write(`${progress} ${patch.title.slice(0, 50)}... `);

    const characters = await extractCharacterNames(page, patch.link);

    if (characters.length > 0) {
      results.push({
        patchId: patch.id,
        patchTitle: patch.title,
        patchDate: patch.createdAt.split('T')[0],
        patchLink: patch.link,
        characters,
      });
      totalCharacterEntries += characters.length;
      console.log(`${characters.length}명 발견`);
    } else {
      console.log('실험체 없음');
    }

    // 요청 간 딜레이
    await delay(300);
  }

  await browser.close();

  // 결과 저장
  const outputPath = path.join(process.cwd(), 'scripts', 'patch-characters.json');
  writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');

  // 요약 출력
  console.log('\n' + '='.repeat(60));
  console.log('추출 완료 요약');
  console.log('='.repeat(60));
  console.log(`총 패치노트: ${patchNotes.length}개`);
  console.log(`실험체 포함 패치: ${results.length}개`);
  console.log(`총 실험체 엔트리: ${totalCharacterEntries}개`);
  console.log(`결과 저장: ${outputPath}`);

  // 실험체별 패치 횟수 집계
  const characterCounts: Record<string, number> = {};
  for (const result of results) {
    for (const char of result.characters) {
      characterCounts[char] = (characterCounts[char] || 0) + 1;
    }
  }

  // 가장 많이 패치된 실험체 Top 10
  const sortedCharacters = Object.entries(characterCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log('\n=== 가장 많이 패치된 실험체 Top 10 ===');
  sortedCharacters.forEach(([name, count], i) => {
    console.log(`${i + 1}. ${name}: ${count}회`);
  });

  // 고유 실험체 목록
  const uniqueCharacters = Object.keys(characterCounts).sort();
  console.log(`\n=== 고유 실험체 (${uniqueCharacters.length}명) ===`);
  console.log(uniqueCharacters.join(', '));
}

main().catch(console.error);
