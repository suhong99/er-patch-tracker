/**
 * 버그 수정 파싱 전용 픽스처 생성 스크립트
 *
 * 특정 패치 ID를 크롤링해서 bugs.json 픽스처를 저장.
 * content.html이 이미 있는 경우 크롤링을 스킵한다.
 *
 * 사용법:
 *   npx tsx scripts/tests/generate-bug-fixtures.ts --patches=1234,5678
 *   npx tsx scripts/tests/generate-bug-fixtures.ts --patches=1234,5678 --force  (HTML 재크롤링)
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { initFirebaseAdmin } from '../lib/firebase-admin';
import { parseBugFixes, setBugValidCharacters } from '../parse-bug-fixes';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

async function loadValidCharactersFromFirestore(): Promise<Set<string>> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('characters').get();
  const chars = new Set<string>();
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.name) chars.add(data.name as string);
  });
  console.log(`DB에서 ${chars.size}개 캐릭터 로드됨`);
  return chars;
}

async function generateBugFixture(
  page: Page,
  patchId: string,
  chars: Set<string>,
  force: boolean
): Promise<void> {
  console.log(`\n[${patchId}] 버그 픽스처 생성 중...`);

  setBugValidCharacters(chars);

  const fixtureDir = path.join(FIXTURES_DIR, patchId);
  const contentPath = path.join(fixtureDir, 'content.html');

  // content.html이 없거나 --force인 경우 크롤링
  if (!fs.existsSync(contentPath) || force) {
    const url = `https://playeternalreturn.com/posts/news/${patchId}`;
    console.log(`  URL: ${url}`);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));

    const contentHtml = await page.evaluate(() => {
      const content = document.querySelector('.er-article-detail__content');
      return content?.outerHTML ?? '';
    });

    if (!contentHtml) {
      console.log(`  ⚠️ .er-article-detail__content 없음 - 스킵`);
      return;
    }

    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(contentPath, contentHtml, 'utf-8');
    console.log(`  HTML 저장됨`);
  } else {
    // 기존 content.html 로드
    const contentHtml = fs.readFileSync(contentPath, 'utf-8');
    await page.setContent(`<html><body>${contentHtml}</body></html>`, {
      waitUntil: 'domcontentloaded',
    });
    console.log(`  기존 HTML 재사용`);
  }

  // 버그 파싱 실행
  const result = await parseBugFixes(page);
  const charCount = result.filter((b) => b.character !== null).length;
  console.log(`  파싱됨: 총 ${result.length}개 항목 (실험체 관련 ${charCount}개)`);
  result
    .filter((b) => b.character !== null)
    .forEach((b) => console.log(`    - ${b.character}: ${b.description.slice(0, 50)}...`));

  // bugs.json 저장
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, 'bugs.json'), JSON.stringify(result, null, 2), 'utf-8');

  console.log(`  ✅ 저장 완료: ${fixtureDir}/bugs.json`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const patchesArg = args.find((a) => a.startsWith('--patches='))?.split('=')[1];
  const force = args.includes('--force');

  if (!patchesArg) {
    console.error(
      '사용법: npx tsx scripts/tests/generate-bug-fixtures.ts --patches=1234,5678 [--force]'
    );
    process.exit(1);
  }

  const patchIds = patchesArg
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  console.log(`버그 픽스처 생성 대상: ${patchIds.join(', ')}`);

  // Firebase에서 유효 캐릭터 목록 로드
  const chars = await loadValidCharactersFromFirestore();

  // characters.json 갱신
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(FIXTURES_DIR, 'characters.json'),
    JSON.stringify([...chars].sort(), null, 2),
    'utf-8'
  );

  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page: Page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setCookie({
    name: 'locale',
    value: 'ko_KR',
    domain: 'playeternalreturn.com',
  });

  for (const patchId of patchIds) {
    await generateBugFixture(page, patchId, chars, force);
  }

  await browser.close();
  console.log('\n모든 버그 픽스처 생성 완료!');
}

main().catch(console.error);
