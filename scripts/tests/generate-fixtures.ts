/**
 * 픽스처 생성 스크립트
 *
 * 특정 패치 ID를 크롤링해서 HTML + 파싱 결과를 픽스처로 저장.
 * 테스트 코드의 기준 데이터(스냅샷)로 사용됨.
 *
 * 사용법:
 *   npx tsx scripts/tests/generate-fixtures.ts --patches=1234,5678
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { initFirebaseAdmin } from '../lib/firebase-admin';
import { parsePageContent, setValidCharacters } from '../parse-balance-changes';

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

async function generateFixture(page: Page, patchId: string, chars: Set<string>): Promise<void> {
  console.log(`\n[${patchId}] 픽스처 생성 중...`);

  setValidCharacters(chars);

  const url = `https://playeternalreturn.com/posts/news/${patchId}`;
  console.log(`  URL: ${url}`);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise<void>((resolve) => setTimeout(resolve, 1000));

  // .er-article-detail__content의 outerHTML 저장
  const contentHtml = await page.evaluate(() => {
    const content = document.querySelector('.er-article-detail__content');
    return content?.outerHTML ?? '';
  });

  if (!contentHtml) {
    console.log(`  ⚠️ .er-article-detail__content 없음 - 스킵`);
    return;
  }

  // 파싱 실행
  const result = await parsePageContent(page);
  console.log(`  파싱됨: ${result.length}명 캐릭터`);
  result.forEach((char) => {
    console.log(`    - ${char.name}: ${char.changes.length}개 변경`);
  });

  // 픽스처 저장
  const fixtureDir = path.join(FIXTURES_DIR, patchId);
  fs.mkdirSync(fixtureDir, { recursive: true });

  fs.writeFileSync(path.join(fixtureDir, 'content.html'), contentHtml, 'utf-8');
  fs.writeFileSync(
    path.join(fixtureDir, 'expected.json'),
    JSON.stringify(result, null, 2),
    'utf-8'
  );

  console.log(`  ✅ 저장 완료: ${fixtureDir}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const patchesArg = args.find((a) => a.startsWith('--patches='))?.split('=')[1];

  if (!patchesArg) {
    console.error('사용법: npx tsx scripts/tests/generate-fixtures.ts --patches=1234,5678');
    process.exit(1);
  }

  const patchIds = patchesArg
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  console.log(`픽스처 생성 대상: ${patchIds.join(', ')}`);

  // Firebase에서 유효 캐릭터 목록 로드
  const chars = await loadValidCharactersFromFirestore();

  // 캐릭터 목록은 공통 파일로 한 번만 저장
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
    await generateFixture(page, patchId, chars);
  }

  await browser.close();
  console.log('\n모든 픽스처 생성 완료!');
}

main().catch(console.error);
