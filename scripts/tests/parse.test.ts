/**
 * 패치노트 파싱 회귀 테스트
 *
 * fixtures/{patchId}/ 에 저장된 HTML을 Puppeteer에 로드한 뒤
 * 파싱 결과가 expected.json과 일치하는지 검증.
 *
 * 픽스처 생성:
 *   npx tsx scripts/tests/generate-fixtures.ts --patches=1234,5678
 *
 * 테스트 실행:
 *   npm test
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { parsePageContent, setValidCharacters } from '../parse-balance-changes';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

const fixtureIds: string[] = fs.existsSync(FIXTURES_DIR)
  ? fs
      .readdirSync(FIXTURES_DIR)
      .filter((f) => fs.statSync(path.join(FIXTURES_DIR, f)).isDirectory())
  : [];

describe('패치노트 파싱 회귀 테스트', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
  });

  afterAll(async () => {
    await browser.close();
  });

  if (fixtureIds.length === 0) {
    test('픽스처 없음', () => {
      console.warn(
        '픽스처가 없습니다. 먼저 실행하세요:\n' +
          '  npx tsx scripts/tests/generate-fixtures.ts --patches=<패치ID>'
      );
      expect(true).toBe(true);
    });
  }

  for (const patchId of fixtureIds) {
    test(`patch ${patchId} 파싱 결과 일치`, async () => {
      const fixtureDir = path.join(FIXTURES_DIR, patchId);

      const contentHtml = fs.readFileSync(path.join(fixtureDir, 'content.html'), 'utf-8');
      const expected = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'expected.json'), 'utf-8'));
      const chars: string[] = JSON.parse(
        fs.readFileSync(path.join(FIXTURES_DIR, 'characters.json'), 'utf-8')
      );

      setValidCharacters(new Set(chars));

      await page.setContent(`<html><body>${contentHtml}</body></html>`, {
        waitUntil: 'domcontentloaded',
      });

      const result = await parsePageContent(page);

      // changeType(buff/nerf/mixed)은 버프/너프 판정 로직에 의존하므로 비교 제외
      const strip = (chars: typeof result) =>
        chars.map((char) => ({
          ...char,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          changes: char.changes.map(({ changeType: _changeType, ...rest }) => rest),
        }));

      expect(strip(result)).toEqual(strip(expected));
    });
  }
});
