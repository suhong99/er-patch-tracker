/**
 * 나무위키에서 실험체 기본 스텟 크롤링
 *
 * 저장 스텟:
 * - 체력(HP): 기본(레벨1)/성장치
 * - 방어력: 기본(레벨1)/성장치
 * - 공격력: 기본(레벨1)/성장치
 * - 공격속도: 기본값
 * - 이동속도: 기본값
 * - 무기군별: 공격속도 성장%, 기본공격증폭 성장%, 스킬증폭 성장%
 *
 * 사용법:
 *   npx tsx scripts/crawl-character-stats.ts              # 전체 크롤링 (Firestore 캐릭터 목록 사용)
 *   npx tsx scripts/crawl-character-stats.ts 윌리엄       # 특정 캐릭터만
 *   npx tsx scripts/crawl-character-stats.ts 윌리엄 얀    # 여러 캐릭터
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// ─── 타입 정의 ───────────────────────────────────────────────

export type WeaponStat = {
  weaponType: string; // 무기군 이름 (예: "투척", "글러브", "톤파")
  attackSpeedGrowth: number | null; // 공격속도 성장 (% per level)
  basicAttackAmpGrowth: number | null; // 기본 공격 증폭 성장 (% per level)
  skillAmpGrowth: number | null; // 스킬 증폭 성장 (% per level)
};

export type CharacterBaseStats = {
  name: string;
  namuWikiUrl: string;
  // 체력
  hpBase: number | null;
  hpGrowth: number | null;
  // 방어력
  defenseBase: number | null;
  defenseGrowth: number | null;
  // 공격력
  attackBase: number | null;
  attackGrowth: number | null;
  // 공격속도 (기본)
  attackSpeedBase: number | null;
  // 이동속도
  moveSpeed: number | null;
  // 무기군별 성장치
  weaponStats: WeaponStat[];
  // 크롤링 메타
  crawledAt: string;
  parseError?: string;
};

export type CharacterStatsCrawlResult = {
  crawledAt: string;
  totalCount: number;
  successCount: number;
  failCount: number;
  characters: Record<string, CharacterBaseStats>;
};

// ─── Firestore에서 캐릭터 목록 + URL 로드 ────────────────────

/**
 * Firestore에서 캐릭터 목록과 namuWikiUrl 로드
 * namuWikiUrl이 없으면 이름 기반으로 기본 URL 생성
 */
async function loadCharacters(): Promise<Array<{ name: string; url: string }>> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('characters').select('namuWikiUrl').get();
  const characters: Array<{ name: string; url: string }> = [];

  snapshot.forEach((doc) => {
    const data = doc.data() as { namuWikiUrl?: string };
    const name = doc.id;
    const url =
      data.namuWikiUrl ??
      `https://namu.wiki/w/${encodeURIComponent(name)}(${encodeURIComponent('이터널 리턴')})`;
    characters.push({ name, url });
  });

  return characters.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── 파싱 ────────────────────────────────────────────────────

async function parseCharacterStats(
  page: Page,
  characterName: string,
  url: string
): Promise<CharacterBaseStats> {
  const result: CharacterBaseStats = {
    name: characterName,
    namuWikiUrl: url,
    hpBase: null,
    hpGrowth: null,
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
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // 모든 <details> 섹션 열기 (무기 숙련도 등 접힌 섹션 포함)
    await page.evaluate(() => {
      document.querySelectorAll('details').forEach((d) => {
        d.setAttribute('open', '');
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    // "레벨 1 / 레벨 20 / 성장치" 또는 "Lv. 1 / Lv. 20 / 성장치" 구조의 스텟 테이블 파싱
    const parsed = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      const statTable = tables.find((t) => {
        const text = t.innerText;
        return (text.includes('레벨 1') || text.includes('Lv. 1')) && text.includes('성장치');
      });
      if (!statTable) return null;

      const rows = Array.from(statTable.querySelectorAll('tr'));
      return rows.map((row) => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        return cells.map((cell) => (cell as HTMLElement).innerText.trim());
      });
    });

    if (!parsed) {
      result.parseError = '스텟 테이블(레벨1/레벨20/성장치) 없음';
      return result;
    }

    // 기본 스텟 추출
    for (const row of parsed) {
      const label = row[0]?.trim() ?? '';
      if (!label || label === '구분' || label.startsWith('레벨')) continue;

      // 빈 셀 제외
      const valueCells = row.slice(1).filter((cell) => cell.length > 0 && cell !== '-');

      if (label === '공격력' && result.attackBase === null) {
        result.attackBase = parseNum(valueCells[0]);
        // 성장치는 3번째 컬럼 (레벨1, 레벨20, 성장치)
        result.attackGrowth = parseNum(valueCells[2] ?? valueCells[1]);
      } else if (label === '방어력' && result.defenseBase === null) {
        result.defenseBase = parseNum(valueCells[0]);
        result.defenseGrowth = parseNum(valueCells[2] ?? valueCells[1]);
      } else if ((label === '체력' || label === '최대 체력') && result.hpBase === null) {
        result.hpBase = parseNum(valueCells[0]);
        result.hpGrowth = parseNum(valueCells[2] ?? valueCells[1]);
      } else if (label.includes('공격 속도') && result.attackSpeedBase === null) {
        result.attackSpeedBase = parseNum(valueCells[0]);
      } else if (label.includes('이동 속도') && result.moveSpeed === null) {
        result.moveSpeed = parseNum(valueCells[0]);
      }
    }

    // 무기군별 성장치 파싱 (메인 테이블 + 별도 테이블)
    result.weaponStats = parseWeaponStats(parsed);

    // 메인 테이블에서 못 찾은 경우 별도 테이블 탐색
    if (result.weaponStats.length === 0) {
      const weaponTableRows = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('table'));
        // 무기군명 + 공격속도/증폭 성장치를 포함하는 별도 테이블 찾기
        const wt = tables.find((t) => {
          const text = t.innerText;
          return (
            (text.includes('공격 속도') ||
              text.includes('기본 공격 증폭') ||
              text.includes('스킬 증폭')) &&
            !text.includes('레벨 1') &&
            !text.includes('Lv. 1') &&
            !text.includes('성장치')
          );
        });
        if (!wt) return null;

        const rows = Array.from(wt.querySelectorAll('tr'));
        return rows.map((row) => {
          const cells = Array.from(row.querySelectorAll('th, td'));
          return cells.map((cell) => (cell as HTMLElement).innerText.trim());
        });
      });

      if (weaponTableRows) {
        result.weaponStats = parseWeaponStatsFromSeparateTable(weaponTableRows);
      }
    }

    if (result.hpBase === null && result.defenseBase === null && result.attackBase === null) {
      result.parseError = '스텟 파싱 실패 (값 없음)';
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`  [${characterName}] 오류: ${errorMsg}`);
    result.parseError = errorMsg;
  }

  return result;
}

/**
 * 무기군별 성장치 파싱
 * rows 순회: "무기 숙련도" 헤더 → 무기군명 → 공격속도/증폭 성장치
 */
function parseWeaponStats(rows: string[][]): WeaponStat[] {
  const weaponStats: WeaponStat[] = [];
  let inWeaponSection = false;
  let currentWeapon: WeaponStat | null = null;

  for (const row of rows) {
    const label = row[0]?.trim() ?? '';
    const joined = row.join(' ');

    // 무기 숙련도 섹션 시작
    if (
      joined.includes('무기 숙련도') ||
      joined.includes('무기 숙련') ||
      joined.includes('무기숙련')
    ) {
      inWeaponSection = true;
      continue;
    }

    // 다른 섹션 시작 시 종료
    if (inWeaponSection && (joined.includes('플레이 모드') || joined.includes('보정 수치'))) {
      break;
    }

    if (!inWeaponSection) continue;

    // 무기군 이름 행
    if (isWeaponTypeName(label, row)) {
      if (currentWeapon) weaponStats.push(currentWeapon);
      currentWeapon = {
        weaponType: label,
        attackSpeedGrowth: null,
        basicAttackAmpGrowth: null,
        skillAmpGrowth: null,
      };
      continue;
    }

    if (!currentWeapon) continue;

    // 성장치 추출 (레벨1 기준 퍼센트)
    const numCells = row.filter((c) => c.length > 0 && c !== '-');

    if (label.includes('공격 속도') || label.includes('공격속도')) {
      // 레벨1 성장치 (두 번째 값): "공격 속도 | 3.5% | 70%"
      currentWeapon.attackSpeedGrowth = parseGrowthPercent(numCells.slice(1));
    } else if (label.includes('기본 공격 증폭') || label.includes('기본공격증폭')) {
      currentWeapon.basicAttackAmpGrowth = parseGrowthPercent(numCells.slice(1));
    } else if (label.includes('스킬 증폭') || label.includes('스킬증폭')) {
      currentWeapon.skillAmpGrowth = parseGrowthPercent(numCells.slice(1));
    }
  }

  if (currentWeapon) weaponStats.push(currentWeapon);
  return weaponStats;
}

/**
 * 별도 테이블 형식의 무기 숙련 파싱
 * 예: 구분 | Lv.1 | Lv.20 // 글러브 // 공격 속도 | 3.9% | 78%
 * 무기군 이름이 단독 행으로 등장
 */
function parseWeaponStatsFromSeparateTable(rows: string[][]): WeaponStat[] {
  const weaponStats: WeaponStat[] = [];
  let currentWeapon: WeaponStat | null = null;

  for (const row of rows) {
    const label = row[0]?.trim() ?? '';
    if (!label) continue;

    // 헤더 행 스킵
    if (label === '구분' || label.startsWith('Lv') || label.startsWith('레벨')) continue;

    // 무기군 이름
    if (isWeaponTypeName(label, row)) {
      if (currentWeapon) weaponStats.push(currentWeapon);
      currentWeapon = {
        weaponType: label,
        attackSpeedGrowth: null,
        basicAttackAmpGrowth: null,
        skillAmpGrowth: null,
      };
      continue;
    }

    if (!currentWeapon) continue;

    const numCells = row.filter((c) => c.length > 0 && c !== '-');
    if (label.includes('공격 속도') || label.includes('공격속도')) {
      currentWeapon.attackSpeedGrowth = parseGrowthPercent(numCells.slice(1));
    } else if (label.includes('기본 공격 증폭') || label.includes('기본공격증폭')) {
      currentWeapon.basicAttackAmpGrowth = parseGrowthPercent(numCells.slice(1));
    } else if (label.includes('스킬 증폭') || label.includes('스킬증폭')) {
      currentWeapon.skillAmpGrowth = parseGrowthPercent(numCells.slice(1));
    }
  }

  if (currentWeapon) weaponStats.push(currentWeapon);
  return weaponStats;
}

// ─── 헬퍼 ────────────────────────────────────────────────────

// 무기 섹션 내에서 스텟 라벨로 사용되는 키워드 (이것이 아니면 무기군명으로 처리)
const STAT_LABELS = new Set([
  '구분',
  '공격 속도',
  '공격속도',
  '기본 공격 증폭',
  '기본공격증폭',
  '스킬 증폭',
  '스킬증폭',
  '레벨 1',
  '레벨 20',
  '성장치',
  'Lv. 1',
  'Lv. 20',
  'Lv.1',
  'Lv.20',
]);

/**
 * 무기 섹션 내에서 무기군 이름인지 판단
 * - 빈 값이 아님
 * - 알려진 스텟 라벨이 아님
 * - 숫자/% 포함 없음 (순수 텍스트)
 * - 단독 행 (다른 셀이 모두 비어있음)
 */
function isWeaponTypeName(label: string, row: string[]): boolean {
  if (!label) return false;
  if (STAT_LABELS.has(label)) return false;
  // 숫자나 %가 포함된 경우 스텟 값이므로 제외
  if (/\d/.test(label) || label.includes('%')) return false;
  // 행의 다른 셀이 모두 비어있어야 함 (무기군 이름은 단독 행)
  const otherCells = row.slice(1).filter((c) => c.trim().length > 0);
  return otherCells.length === 0;
}

function parseGrowthPercent(cells: string[]): number | null {
  for (const cell of cells) {
    const match = cell.match(/\+?(\d+(?:\.\d+)?)\s*%/);
    if (match) return parseFloat(match[1]);
  }
  return null;
}

function parseNum(text: string | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[+%,]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// ─── 메인 ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // 대상 캐릭터 결정
  let targets: Array<{ name: string; url: string }>;

  if (args.length > 0) {
    // 인수로 캐릭터명 지정 → Firestore에서 해당 캐릭터 URL 로드
    console.log('Firestore에서 캐릭터 URL 로드 중...');
    const allChars = await loadCharacters();
    const charMap = new Map(allChars.map((c) => [c.name, c.url]));
    targets = args.map((name) => ({
      name,
      url:
        charMap.get(name) ??
        `https://namu.wiki/w/${encodeURIComponent(name)}(${encodeURIComponent('이터널 리턴')})`,
    }));
  } else {
    // Firestore에서 전체 목록 로드
    console.log('Firestore에서 캐릭터 목록 로드 중...');
    targets = await loadCharacters();
    console.log(`${targets.length}개 캐릭터 발견`);
  }

  console.log(`\n크롤링 대상: ${targets.map((t) => t.name).join(', ')}\n`);

  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const crawlResult: CharacterStatsCrawlResult = {
    crawledAt: new Date().toISOString(),
    totalCount: targets.length,
    successCount: 0,
    failCount: 0,
    characters: {},
  };

  try {
    const page: Page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      process.stdout.write(`[${i + 1}/${targets.length}] ${target.name} 크롤링 중...`);

      const stats = await parseCharacterStats(page, target.name, target.url);
      crawlResult.characters[target.name] = stats;

      if (stats.parseError) {
        crawlResult.failCount++;
        console.log(` 실패: ${stats.parseError}`);
      } else {
        crawlResult.successCount++;
        const weaponSummary = stats.weaponStats.map((w) => w.weaponType).join('/');
        console.log(
          ` 완료 (HP:${stats.hpBase}, DEF:${stats.defenseBase}, ATK:${stats.attackBase}, 무기:${weaponSummary || '-'})`
        );
      }

      // 요청 간 딜레이 (나무위키 봇 차단 방지)
      if (i < targets.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  } finally {
    await browser.close();
  }

  const outputPath = path.join(process.cwd(), 'scripts', 'character-stats-result.json');
  fs.writeFileSync(outputPath, JSON.stringify(crawlResult, null, 2), 'utf-8');

  console.log(`\n─── 결과 ───────────────────────────────`);
  console.log(`성공: ${crawlResult.successCount} / ${crawlResult.totalCount}`);
  console.log(`실패: ${crawlResult.failCount} / ${crawlResult.totalCount}`);

  if (crawlResult.failCount > 0) {
    const failed = Object.values(crawlResult.characters)
      .filter((c) => c.parseError)
      .map((c) => `  - ${c.name}: ${c.parseError}`);
    console.log(`\n실패 목록:`);
    failed.forEach((f) => console.log(f));
  }

  console.log(`\n결과 저장: ${outputPath}`);
}

main().catch((err) => {
  console.error('치명적 오류:', err);
  process.exit(1);
});
