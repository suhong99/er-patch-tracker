/**
 * dak.gg에서 실험체 기본 스텟 크롤링 (체력 재생 포함)
 * 나무위키 크롤링 데이터와 크로스체크 용도
 *
 * dak.gg 테이블 구조 (단일 테이블):
 *   항목         | 레벨 스탯(LV.1) | 성장치
 *   공격력       | 35              | 4.1
 *   체력 재생    | 2               | 0.136
 *   이동 속도    | 3.55            |
 *   방망이                          ← 무기명 (단독 행)
 *   공격 속도    | 3%              | 3%
 *   스킬 증폭    | 4.4%            | 4.4%
 *
 * 사용법:
 *   npx tsx scripts/crawl-dakgg-stats.ts              # 전체 크롤링
 *   npx tsx scripts/crawl-dakgg-stats.ts 나딘 가넷    # 특정 캐릭터만
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://dak.gg/er';

// ─── 타입 정의 ───────────────────────────────────────────────

export type DakggWeaponStat = {
  weaponType: string; // 한글 무기 타입 (e.g. "활", "방망이")
  attackSpeedGrowth: number | null;
  basicAttackAmpGrowth: number | null;
  skillAmpGrowth: number | null;
};

export type DakggCharacterStats = {
  nameKo: string; // dak.gg에서 읽은 한글명
  firestoreName: string | null; // Firestore 문서 ID
  dakggSlug: string; // URL 슬러그
  hpBase: number | null;
  hpGrowth: number | null;
  hpRegenBase: number | null; // 체력 재생 (나무위키 크롤링 누락 필드)
  hpRegenGrowth: number | null;
  defenseBase: number | null;
  defenseGrowth: number | null;
  attackBase: number | null;
  attackGrowth: number | null;
  attackSpeedBase: number | null;
  moveSpeed: number | null;
  weaponStats: DakggWeaponStat[];
  crawledAt: string;
  parseError?: string;
};

export type DakggCrawlResult = {
  crawledAt: string;
  totalCount: number;
  successCount: number;
  failCount: number;
  slugMapping: Record<string, string>; // 한글명 → 슬러그
  characters: Record<string, DakggCharacterStats>; // Firestore 한글명 기준
};

// ─── Firestore 캐릭터 목록 ────────────────────────────────────

async function loadFirestoreNames(): Promise<string[]> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('characters').select().get();
  return snapshot.docs.map((doc) => doc.id).sort((a, b) => a.localeCompare(b));
}

// ─── 슬러그 매핑 ─────────────────────────────────────────────

async function buildSlugMapping(page: Page): Promise<Record<string, string>> {
  console.log('dak.gg 캐릭터 목록 로드 중...');
  await page.goto(`${BASE_URL}/characters`, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('img[alt]', { timeout: 15000 }).catch(() => null);

  const mapping = await page.evaluate((): Record<string, string> => {
    const result: Record<string, string> = {};
    const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/er/characters/"]');
    links.forEach((link) => {
      const href = link.getAttribute('href') ?? '';
      const match = href.match(/^\/er\/characters\/([^/]+)$/);
      if (!match) return;
      const slug = match[1];
      const img = link.querySelector('img[alt]');
      const nameKo = img?.getAttribute('alt')?.trim() ?? '';
      if (slug && nameKo) result[nameKo] = slug;
    });
    return result;
  });

  console.log(`슬러그 매핑 완료: ${Object.keys(mapping).length}개`);
  return mapping;
}

// ─── 소개 페이지 파싱 ─────────────────────────────────────────

async function parseIntroductionPage(
  page: Page,
  slug: string,
  firestoreName: string
): Promise<DakggCharacterStats> {
  const result: DakggCharacterStats = {
    nameKo: '',
    firestoreName,
    dakggSlug: slug,
    hpBase: null,
    hpGrowth: null,
    hpRegenBase: null,
    hpRegenGrowth: null,
    defenseBase: null,
    defenseGrowth: null,
    attackBase: null,
    attackGrowth: null,
    attackSpeedBase: null,
    moveSpeed: null,
    weaponStats: [],
    crawledAt: new Date().toISOString(),
  };

  try {
    const url = `${BASE_URL}/characters/${slug}/introduction`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // 리다이렉트 감지 (잘못된 슬러그 → 다른 캐릭터로 이동)
    const currentUrl = page.url();
    const currentSlug = currentUrl.match(/\/characters\/([^/?#]+)/)?.[1] ?? '';
    if (currentSlug.toLowerCase() !== slug.toLowerCase()) {
      result.parseError = `리다이렉트: ${slug} → ${currentSlug}`;
      return result;
    }

    // 스탯 테이블 로드 대기
    const loaded = await page
      .waitForFunction(
        (): boolean =>
          document.body.innerText.includes('체력 재생') &&
          document.body.innerText.includes('이동 속도'),
        { timeout: 15000 }
      )
      .then(() => true)
      .catch(() => false);

    if (!loaded) {
      result.parseError = '스탯 테이블 로드 타임아웃';
      return result;
    }

    // 테이블 전체 행 추출
    const tableRows = await page.evaluate((): string[][] => {
      const tables = [...document.querySelectorAll('table')];
      for (const table of tables) {
        const rows = [...table.querySelectorAll('tr')].map((tr) =>
          [...tr.querySelectorAll('td, th')].map((c) => (c as HTMLElement).innerText.trim())
        );
        const flat = rows.flat().join(' ');
        // 기본 스탯 + 무기 숙련도가 모두 있는 테이블
        if (flat.includes('체력 재생') && flat.includes('이동 속도')) {
          return rows;
        }
      }
      return [];
    });

    if (tableRows.length === 0) {
      result.parseError = '스탯 테이블 없음';
      return result;
    }

    // 순차 파싱: 기본 스탯 → 무기 숙련도
    let currentWeapon: DakggWeaponStat | null = null;

    for (const row of tableRows) {
      const label = row[0]?.trim() ?? '';
      if (!label || label === '항목') continue;

      const vals = row.slice(1).filter((v) => v.length > 0);

      // 무기명 행: 셀이 하나이고 한글/영문 이름 (숫자/% 없음)
      if (row.length === 1 && !/[\d%]/.test(label)) {
        if (currentWeapon) result.weaponStats.push(currentWeapon);
        currentWeapon = {
          weaponType: label,
          attackSpeedGrowth: null,
          basicAttackAmpGrowth: null,
          skillAmpGrowth: null,
        };
        continue;
      }

      // 무기 숙련도 행: 현재 무기가 있고 % 값 포함
      if (currentWeapon && vals.some((v) => v.includes('%'))) {
        if (label.includes('공격 속도') || label.includes('공격속도')) {
          const m = vals[0]?.match(/(\d+(?:\.\d+)?)/);
          if (m) currentWeapon.attackSpeedGrowth = parseFloat(m[1]);
        } else if (label.includes('기본 공격 증폭') || label.includes('기본공격증폭')) {
          const m = vals[0]?.match(/(\d+(?:\.\d+)?)/);
          if (m) currentWeapon.basicAttackAmpGrowth = parseFloat(m[1]);
        } else if (label.includes('스킬 증폭') || label.includes('스킬증폭')) {
          const m = vals[0]?.match(/(\d+(?:\.\d+)?)/);
          if (m) currentWeapon.skillAmpGrowth = parseFloat(m[1]);
        }
        continue;
      }

      // 기본 스탯 행
      if ((label === '체력' || label === '최대 체력') && result.hpBase === null) {
        result.hpBase = parseNum(vals[0]);
        result.hpGrowth = parseNum(vals[1]);
      } else if (label === '체력 재생' && result.hpRegenBase === null) {
        result.hpRegenBase = parseNum(vals[0]);
        result.hpRegenGrowth = parseNum(vals[1]);
      } else if (label === '방어력' && result.defenseBase === null) {
        result.defenseBase = parseNum(vals[0]);
        result.defenseGrowth = parseNum(vals[1]);
      } else if (label === '공격력' && result.attackBase === null) {
        result.attackBase = parseNum(vals[0]);
        result.attackGrowth = parseNum(vals[1]);
      } else if (
        (label === '공격 속도' || label === '공격속도') &&
        result.attackSpeedBase === null
      ) {
        result.attackSpeedBase = parseNum(vals[0]);
      } else if ((label === '이동 속도' || label === '이동속도') && result.moveSpeed === null) {
        result.moveSpeed = parseNum(vals[0]);
      }
    }

    if (currentWeapon) result.weaponStats.push(currentWeapon);

    if (result.hpBase === null && result.defenseBase === null && result.attackBase === null) {
      result.parseError = '기본 스탯 파싱 실패 (값 없음)';
    }
  } catch (err) {
    result.parseError = err instanceof Error ? err.message : String(err);
  }

  return result;
}

// ─── 헬퍼 ────────────────────────────────────────────────────

function parseNum(text: string | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[+%,]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── 메인 ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page: Page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });

    // tsx/esbuild가 page.evaluate 내부 함수에 추가하는 __name 헬퍼 폴리필
    await page.evaluateOnNewDocument(() => {
      // @ts-expect-error esbuild polyfill
      if (typeof globalThis.__name === 'undefined') globalThis.__name = (fn: unknown) => fn;
    });

    // 슬러그 매핑 구축
    const slugMapping = await buildSlugMapping(page);

    // Firestore 캐릭터 목록
    console.log('Firestore 캐릭터 목록 로드 중...');
    const firestoreNames = await loadFirestoreNames();
    console.log(`Firestore: ${firestoreNames.length}개`);

    const targets = args.length > 0 ? args : firestoreNames;
    console.log(`\n크롤링 대상: ${targets.length}개\n`);

    const crawlResult: DakggCrawlResult = {
      crawledAt: new Date().toISOString(),
      totalCount: targets.length,
      successCount: 0,
      failCount: 0,
      slugMapping,
      characters: {},
    };

    for (let i = 0; i < targets.length; i++) {
      const name = targets[i];
      const slug = slugMapping[name];

      process.stdout.write(`[${i + 1}/${targets.length}] ${name}`);

      if (!slug) {
        console.log(' → 슬러그 없음');
        crawlResult.characters[name] = {
          nameKo: name,
          firestoreName: name,
          dakggSlug: '',
          hpBase: null,
          hpGrowth: null,
          hpRegenBase: null,
          hpRegenGrowth: null,
          defenseBase: null,
          defenseGrowth: null,
          attackBase: null,
          attackGrowth: null,
          attackSpeedBase: null,
          moveSpeed: null,
          weaponStats: [],
          crawledAt: new Date().toISOString(),
          parseError: 'dak.gg 목록에 없음',
        };
        crawlResult.failCount++;
        continue;
      }

      process.stdout.write(` (${slug})...`);
      const stats = await parseIntroductionPage(page, slug, name);
      crawlResult.characters[name] = stats;

      if (stats.parseError) {
        crawlResult.failCount++;
        console.log(` 실패: ${stats.parseError}`);
      } else {
        crawlResult.successCount++;
        const weapons = stats.weaponStats.map((w) => w.weaponType).join('/');
        console.log(
          ` 완료 (HP:${stats.hpBase} 재생:${stats.hpRegenBase} DEF:${stats.defenseBase} ATK:${stats.attackBase} 무기:${weapons || '-'})`
        );
      }

      if (i < targets.length - 1) await delay(1000);
    }

    const outputPath = path.join(process.cwd(), 'scripts', 'dakgg-stats-result.json');
    fs.writeFileSync(outputPath, JSON.stringify(crawlResult, null, 2), 'utf-8');

    console.log(
      `\n결과: 성공 ${crawlResult.successCount} / 실패 ${crawlResult.failCount} / 총 ${crawlResult.totalCount}`
    );
    console.log(`저장: ${outputPath}`);
  } finally {
    await browser.close();
  }
}

const scriptName = process.argv[1] ?? '';
if (scriptName.endsWith('crawl-dakgg-stats.ts') || scriptName.endsWith('crawl-dakgg-stats.js')) {
  main().catch((err) => {
    console.error('치명적 오류:', err);
    process.exit(1);
  });
}
