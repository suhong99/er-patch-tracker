/**
 * 버그 수정 전체 크롤링 스크립트
 *
 * Firestore의 모든 patchNotes를 순회하며 버그 수정 데이터를 파싱,
 * patchNotes/{id}.bugFixes 와 characters/{name}.bugPatchIds/totalBugCount 를 저장한다.
 *
 * 사용법:
 *   npx tsx scripts/crawl-bug-fixes.ts               # 전체 (미처리 패치)
 *   npx tsx scripts/crawl-bug-fixes.ts --patches=3444,3423  # 특정 패치
 *   npx tsx scripts/crawl-bug-fixes.ts --dry-run      # 파싱만 (저장 안함)
 *   npx tsx scripts/crawl-bug-fixes.ts --force        # 이미 처리된 패치도 재처리
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin';
import { parseBugFixes, setBugValidCharacters } from './parse-bug-fixes';

type BugFix = {
  character: string | null;
  description: string;
};

type PatchNote = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
  bugFixes?: BugFix[];
};

// ────────────────────────────────────────────────────────────
// Firestore 조회
// ────────────────────────────────────────────────────────────

async function loadValidCharacters(): Promise<Set<string>> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('characters').get();
  const chars = new Set<string>();

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.name) chars.add(data.name as string);
  });

  console.log(`캐릭터 목록 ${chars.size}개 로드`);
  return chars;
}

async function getPatchNotesToProcess(
  targetIds: number[] | null,
  force: boolean
): Promise<PatchNote[]> {
  const db = initFirebaseAdmin();
  const query = db.collection('patchNotes').orderBy('id', 'desc');

  const snapshot = await query.get();
  const patches: PatchNote[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data() as PatchNote;

    // 특정 패치 지정된 경우
    if (targetIds && !targetIds.includes(data.id)) return;

    // --force 없으면 이미 처리된 패치 스킵
    if (!force && data.bugFixes !== undefined) return;

    patches.push(data);
  });

  return patches;
}

// ────────────────────────────────────────────────────────────
// 패치 페이지 파싱
// ────────────────────────────────────────────────────────────

async function parsePatchBugFixes(page: Page, url: string): Promise<BugFix[]> {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 800));
    return await parseBugFixes(page);
  } catch (error) {
    console.error(`  파싱 오류 (${url}):`, error);
    return [];
  }
}

// ────────────────────────────────────────────────────────────
// Firebase 저장
// ────────────────────────────────────────────────────────────

async function savePatchBugFixes(patchId: number, bugFixes: BugFix[]): Promise<void> {
  const db = initFirebaseAdmin();
  await db.collection('patchNotes').doc(String(patchId)).update({ bugFixes });
}

async function updateCharacterBugStats(bugsByPatch: Map<number, BugFix[]>): Promise<void> {
  const db = initFirebaseAdmin();

  // 캐릭터별 새 patchId 집계
  const charNewPatchIds = new Map<string, Set<number>>();

  for (const [patchId, bugFixes] of bugsByPatch) {
    for (const bug of bugFixes) {
      if (!bug.character) continue;
      if (!charNewPatchIds.has(bug.character)) {
        charNewPatchIds.set(bug.character, new Set());
      }
      charNewPatchIds.get(bug.character)!.add(patchId);
    }
  }

  if (charNewPatchIds.size === 0) {
    console.log('  캐릭터 버그 통계 업데이트 없음');
    return;
  }

  console.log(`  ${charNewPatchIds.size}명 캐릭터 통계 업데이트 중...`);

  for (const [charName, newIds] of charNewPatchIds) {
    const docRef = db.collection('characters').doc(charName);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.warn(`  ⚠️ [${charName}] characters 문서 없음 - 스킵`);
      continue;
    }

    const existing = doc.data() ?? {};
    const existingIds: number[] = existing.bugPatchIds ?? [];

    // 기존 + 신규 병합, 중복 제거, 내림차순
    const mergedIds = [...new Set([...existingIds, ...newIds])].sort((a, b) => b - a);

    // totalBugCount: 각 패치에서 해당 캐릭터 버그 수 합산
    const totalBugCount = mergedIds.reduce((acc, pid) => {
      const bugs = bugsByPatch.get(pid);
      if (bugs) {
        return acc + bugs.filter((b) => b.character === charName).length;
      }
      // bugsByPatch에 없는 패치(기존 데이터)는 기존 count 기여분을 재계산 불가
      // → 기존 totalBugCount에서 새 패치분만 추가하는 방식으로 처리
      return acc;
    }, 0);

    // 기존 패치에 대한 count는 유지 (기존 totalBugCount - 이번에 재계산한 패치의 count + 새 계산)
    const existingBugCount: number = existing.totalBugCount ?? 0;
    const existingIdsSet = new Set(existingIds);
    const addedPatchIds = [...newIds].filter((id) => !existingIdsSet.has(id));

    const addedCount = addedPatchIds.reduce((acc, pid) => {
      const bugs = bugsByPatch.get(pid);
      return acc + (bugs ? bugs.filter((b) => b.character === charName).length : 0);
    }, 0);

    const finalBugCount = existingBugCount + addedCount;

    await docRef.update({
      bugPatchIds: mergedIds,
      totalBugCount: finalBugCount,
    });

    console.log(
      `  [${charName}] bugPatchIds: ${mergedIds.length}개 / totalBugCount: ${finalBugCount}`
    );
  }
}

// ────────────────────────────────────────────────────────────
// 메인
// ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const patchesArg = args.find((a) => a.startsWith('--patches='))?.split('=')[1];

  const targetIds = patchesArg
    ? patchesArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
    : null;

  console.log('=== 버그 수정 크롤링 시작 ===');
  if (dryRun) console.log('[DRY RUN - Firebase 저장 안 함]');
  if (force) console.log('[FORCE - 이미 처리된 패치도 재처리]');
  if (targetIds) console.log(`대상 패치: ${targetIds.join(', ')}`);

  // 1. 유효 캐릭터 목록 로드
  const validChars = await loadValidCharacters();
  setBugValidCharacters(validChars);

  // 2. 처리할 패치 목록 조회
  const patches = await getPatchNotesToProcess(targetIds, force);
  console.log(`\n처리 대상 패치: ${patches.length}개\n`);

  if (patches.length === 0) {
    console.log('처리할 패치가 없습니다.');
    return;
  }

  // 3. Puppeteer 브라우저 실행
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

  // 초기 페이지 로드 (세션 설정)
  await page.goto('https://playeternalreturn.com/posts/news?categoryPath=patchnote', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 4. 각 패치 처리
  const bugsByPatch = new Map<number, BugFix[]>();
  let processed = 0;
  let skipped = 0;
  let totalBugs = 0;

  for (const patch of patches) {
    const url = patch.link;
    if (!url) {
      console.log(`  [${patch.id}] 링크 없음 - 스킵`);
      skipped++;
      continue;
    }

    process.stdout.write(`  [${patch.id}] ${patch.title.slice(0, 40)}... `);

    const bugFixes = await parsePatchBugFixes(page, url);
    const charBugs = bugFixes.filter((b) => b.character);

    console.log(`→ 버그 ${bugFixes.length}개 (실험체 ${charBugs.length}개)`);

    bugsByPatch.set(patch.id, bugFixes);

    if (!dryRun) {
      await savePatchBugFixes(patch.id, bugFixes);
    }

    totalBugs += bugFixes.length;
    processed++;

    // 요청 간 딜레이
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await browser.close();

  // 5. 캐릭터 통계 업데이트
  if (!dryRun && bugsByPatch.size > 0) {
    console.log('\n캐릭터 통계 업데이트 중...');
    await updateCharacterBugStats(bugsByPatch);
  }

  // 6. 결과 출력
  console.log('\n=== 완료 ===');
  console.log(`처리: ${processed}개 / 스킵: ${skipped}개 / 총 버그: ${totalBugs}개`);
  if (dryRun) console.log('[DRY RUN - 실제 저장 없음]');
}

main().catch((err) => {
  console.error('오류:', err);
  process.exit(1);
});
