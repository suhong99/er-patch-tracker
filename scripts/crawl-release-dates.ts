/**
 * 실험체별 출시일 크롤링 스크립트
 * - Firestore characters 컬렉션에서 실험체 이름 목록 조회
 * - 나무위키 실험체 분류 페이지에서 캐릭터 링크 추출
 * - 매칭된 캐릭터 페이지에서 출시일 크롤링
 * - 결과를 scripts/data/release-dates.json 에 저장
 *
 * Usage: npx tsx scripts/crawl-release-dates.ts
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const CATEGORY_URL =
  'https://namu.wiki/w/%EB%B6%84%EB%A5%98:%EC%9D%B4%ED%84%B0%EB%84%90%20%EB%A6%AC%ED%84%B4/%EC%8B%A4%ED%97%98%EC%B2%B4';
const NAMU_BASE = 'https://namu.wiki';

type ReleaseDate = {
  characterName: string;
  namuWikiName: string;
  namuWikiUrl: string;
  releaseDate: string | null;
};

type NamuCharacter = {
  name: string;
  url: string;
};

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Firestore에서 캐릭터 이름 목록 조회 */
async function getCharacterNames(): Promise<string[]> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('characters').select().get();
  const names = snapshot.docs.map((doc) => doc.id);
  console.log(`Firestore 캐릭터 ${names.length}개 조회 완료`);
  return names;
}

/** 나무위키 실험체 분류 페이지에서 캐릭터 링크 목록 추출 */
async function fetchCategoryLinks(page: Page): Promise<NamuCharacter[]> {
  console.log('나무위키 분류 페이지 로드 중...');
  await page.goto(CATEGORY_URL, { waitUntil: 'networkidle2', timeout: 30000 });

  const characters = await page.evaluate((base: string) => {
    const results: { name: string; url: string }[] = [];

    // 나무위키 분류 페이지의 링크들
    const links = document.querySelectorAll('a');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const text = link.textContent?.trim() || '';

      // /w/ 로 시작하고 분류: 가 아닌 링크, 게임명 괄호가 있는 링크
      if (
        href.startsWith('/w/') &&
        !href.includes('%EB%B6%84%EB%A5%98') && // 분류: 제외
        !href.includes(':') && // 특수 네임스페이스 제외
        text.length > 0
      ) {
        results.push({
          name: text,
          url: base + href,
        });
      }
    }

    return results;
  }, NAMU_BASE);

  // 중복 제거
  const unique = new Map<string, NamuCharacter>();
  for (const c of characters) {
    if (!unique.has(c.name)) {
      unique.set(c.name, c);
    }
  }

  const result = Array.from(unique.values());
  console.log(`나무위키 분류에서 캐릭터 ${result.length}개 발견`);
  return result;
}

/** 캐릭터 페이지에서 출시일 추출 */
async function fetchReleaseDate(page: Page, url: string): Promise<string | null> {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  const releaseDate = await page.evaluate(() => {
    // 나무위키 인포박스(테이블) 에서 출시일 찾기
    const tables = document.querySelectorAll('table');

    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td, th');
        for (let i = 0; i < cells.length; i++) {
          const cellText = cells[i].textContent?.trim() || '';
          if (cellText.includes('출시') || cellText.includes('출시일')) {
            // 다음 셀에 날짜가 있을 가능성
            const nextCell = cells[i + 1];
            if (nextCell) {
              const dateText = nextCell.textContent?.trim() || '';
              if (dateText) return dateText;
            }
            // 같은 셀에 날짜가 포함된 경우
            const fullText = row.textContent?.trim() || '';
            if (fullText !== cellText) return fullText;
          }
        }
      }
    }

    // 테이블이 없으면 본문에서 출시일 패턴 검색
    const bodyText = document.body.innerText;
    const patterns = [
      /출시일[^\n]*?(\d{4}[.년]\s*\d{1,2}[.월]\s*\d{1,2})/,
      /출시[^\n]*?(\d{4}[.년]\s*\d{1,2}[.월]\s*\d{1,2})/,
    ];
    for (const pattern of patterns) {
      const match = bodyText.match(pattern);
      if (match) return match[1];
    }

    return null;
  });

  return releaseDate;
}

/** DB 이름과 나무위키 이름 매칭 */
function matchCharacters(
  dbNames: string[],
  namuChars: NamuCharacter[]
): Map<string, NamuCharacter> {
  const matched = new Map<string, NamuCharacter>();

  for (const dbName of dbNames) {
    // 정확 매칭 우선
    const exact = namuChars.find((c) => c.name === dbName);
    if (exact) {
      matched.set(dbName, exact);
      continue;
    }

    // 나무위키 이름이 "(이터널 리턴)" 포함한 경우
    const withGame = namuChars.find((c) => c.name === `${dbName}(이터널 리턴)`);
    if (withGame) {
      matched.set(dbName, withGame);
      continue;
    }

    // URL 디코딩 후 매칭
    const urlMatch = namuChars.find((c) => {
      const decoded = decodeURIComponent(c.url.replace(NAMU_BASE + '/w/', ''));
      return decoded === dbName || decoded === `${dbName}(이터널 리턴)`;
    });
    if (urlMatch) {
      matched.set(dbName, urlMatch);
    }
  }

  return matched;
}

async function main(): Promise<void> {
  // Firestore 캐릭터 목록
  const dbNames = await getCharacterNames();

  const browser: Browser = await puppeteer.launch({ headless: true });

  try {
    const page: Page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    );

    // 분류 페이지에서 캐릭터 링크 수집
    const namuChars = await fetchCategoryLinks(page);

    // 매칭
    const matched = matchCharacters(dbNames, namuChars);
    console.log(`\n매칭된 캐릭터: ${matched.size}/${dbNames.length}개`);

    const unmatched = dbNames.filter((n) => !matched.has(n));
    if (unmatched.length > 0) {
      console.log(`매칭 실패: ${unmatched.join(', ')}`);
    }

    // 각 캐릭터 페이지에서 출시일 크롤링
    const results: ReleaseDate[] = [];
    let i = 0;

    for (const [dbName, namuChar] of matched) {
      i++;
      console.log(`[${i}/${matched.size}] ${dbName} (${namuChar.url}) 크롤링 중...`);

      try {
        const releaseDate = await fetchReleaseDate(page, namuChar.url);
        console.log(`  → 출시일: ${releaseDate ?? '찾지 못함'}`);

        results.push({
          characterName: dbName,
          namuWikiName: namuChar.name,
          namuWikiUrl: namuChar.url,
          releaseDate,
        });
      } catch (err) {
        console.error(`  → 오류: ${err}`);
        results.push({
          characterName: dbName,
          namuWikiName: namuChar.name,
          namuWikiUrl: namuChar.url,
          releaseDate: null,
        });
      }

      // 요청 간 딜레이 (서버 부하 방지)
      await delay(1000);
    }

    // 매칭 실패한 캐릭터도 결과에 포함
    for (const name of unmatched) {
      results.push({
        characterName: name,
        namuWikiName: '',
        namuWikiUrl: '',
        releaseDate: null,
      });
    }

    // 이름순 정렬
    results.sort((a, b) => a.characterName.localeCompare(b.characterName, 'ko'));

    // JSON 저장
    const dataDir = path.join(process.cwd(), 'scripts', 'data');
    mkdirSync(dataDir, { recursive: true });
    const outputPath = path.join(dataDir, 'release-dates.json');
    writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');

    console.log(`\n결과 저장: ${outputPath}`);
    console.log(
      `총 ${results.length}개 캐릭터, 출시일 확인: ${results.filter((r) => r.releaseDate).length}개`
    );
  } finally {
    await browser.close();
  }
}

main()
  .then(() => {
    console.log('\n완료');
    process.exit(0);
  })
  .catch((err) => {
    console.error('오류:', err);
    process.exit(1);
  });
