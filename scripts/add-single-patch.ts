/**
 * 단일 패치노트를 Firestore에 수동으로 추가하고 밸런스 데이터까지 파싱하는 스크립트
 * 게임사가 patchnote 카테고리로 분류하지 않아 자동 크롤링에서 누락된 패치를 추가할 때 사용
 *
 * GitHub Actions 파이프라인과 동일한 방식:
 *   1. 뉴스 목록 API에서 게시글 정보 가져오기 (crawl-patch-notes.ts 역할)
 *   2. patchNotes 컬렉션에 저장 (hasCharacterData=true, status=success)
 *   3. parse-balance-changes.ts 로직으로 실험체 데이터 파싱 및 저장
 *      - Firebase characters 컬렉션에 등록된 실험체 이름만 사용
 *
 * 사용법:
 *   npx tsx scripts/add-single-patch.ts --id=3376
 *   npx tsx scripts/add-single-patch.ts --id=3376 --dry-run   # 미리보기만
 */

import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import { initFirebaseAdmin } from './lib/firebase-admin';

type ApiArticle = {
  id: number;
  thumbnail_url: string;
  view_count: number;
  created_at: string;
  updated_at: string;
  i18ns: {
    ko_KR?: {
      title: string;
      content_link: string;
    };
  };
  url: string;
};

async function fetchArticleFromApi(articleId: number): Promise<ApiArticle | null> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  await page.setCookie({
    name: 'locale',
    value: 'ko_KR',
    domain: 'playeternalreturn.com',
  });

  // 세션 초기화
  await page.goto('https://playeternalreturn.com/posts/news', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  // 뉴스 목록 API에서 ID로 검색 (카테고리 필터 없음 → 누락 패치 포함)
  const listResult = await page.evaluate(async (id: number) => {
    for (let p = 1; p <= 20; p++) {
      const res = await fetch(`https://playeternalreturn.com/api/v1/posts/news?page=${p}`);
      if (!res.ok) break;
      const data = await res.json();
      const articles = data.articles || [];
      if (articles.length === 0) break;
      const found = articles.find((a: { id: number }) => a.id === id);
      if (found) return found;
    }
    return null;
  }, articleId);

  await browser.close();

  if (listResult && listResult.id) {
    return listResult as ApiArticle;
  }
  return null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const idArg = args.find((a) => a.startsWith('--id='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');

  if (!idArg) {
    console.error('사용법: npx tsx scripts/add-single-patch.ts --id=<ARTICLE_ID>');
    process.exit(1);
  }

  const articleId = parseInt(idArg, 10);
  if (isNaN(articleId)) {
    console.error(`유효하지 않은 ID: ${idArg}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('*** DRY RUN 모드 - patchNotes 저장 없음, 파싱 결과만 미리보기 ***\n');
  }

  const db = initFirebaseAdmin();

  // 이미 존재하는지 확인
  const existing = await db.collection('patchNotes').doc(articleId.toString()).get();
  if (existing.exists) {
    const data = existing.data();
    console.log(`이미 Firestore에 존재합니다: patchNotes/${articleId}`);
    console.log(`  제목: ${data?.title}`);
    console.log(`  isParsed: ${data?.isParsed ?? false}`);

    if (data?.isParsed) {
      console.log('\n이미 파싱 완료된 패치입니다. 종료합니다.');
      return;
    }

    console.log('\n아직 파싱되지 않았습니다. parse-balance-changes.ts를 실행합니다...');
  } else {
    // === Step 1: 게시글 정보 가져오기 ===
    console.log(`[1/2] 패치노트 ${articleId} 정보 가져오는 중...`);
    const article = await fetchArticleFromApi(articleId);

    let patchNote: {
      id: number;
      title: string;
      link: string;
      createdAt: string;
      updatedAt: string;
      thumbnailUrl: string;
      viewCount: number;
      status: string;
      hasCharacterData: boolean;
      validatedAt: string;
    };

    if (article && article.id) {
      patchNote = {
        id: article.id,
        title: article.i18ns?.ko_KR?.title || '',
        link:
          article.url ||
          article.i18ns?.ko_KR?.content_link ||
          `https://playeternalreturn.com/posts/news/${articleId}`,
        createdAt: article.created_at,
        updatedAt: article.updated_at,
        thumbnailUrl: article.thumbnail_url || '',
        viewCount: article.view_count || 0,
        status: 'success',
        hasCharacterData: true,
        validatedAt: new Date().toISOString(),
      };
    } else {
      // API 실패 시 URL 기반 최소 정보
      console.warn('  ⚠️  뉴스 목록 API에서 게시글을 찾지 못했습니다. 최소 정보로 저장합니다.');
      console.warn('  ⚠️  제목과 날짜를 수동으로 확인하세요.');
      patchNote = {
        id: articleId,
        title: `패치노트 (ID: ${articleId})`,
        link: `https://playeternalreturn.com/posts/news/${articleId}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        thumbnailUrl: '',
        viewCount: 0,
        status: 'success',
        hasCharacterData: true,
        validatedAt: new Date().toISOString(),
      };
    }

    console.log(`  제목: ${patchNote.title}`);
    console.log(`  날짜: ${patchNote.createdAt}`);
    console.log(`  링크: ${patchNote.link}`);

    // === Step 2: patchNotes 컬렉션에 저장 ===
    if (!dryRun) {
      await db.collection('patchNotes').doc(articleId.toString()).set(patchNote);
      console.log(`  Firestore patchNotes/${articleId} 저장 완료\n`);
    } else {
      console.log('  (DRY RUN: 저장 건너뜀)\n');
    }
  }

  // === Step 3: parse-balance-changes.ts 실행 ===
  // Firebase characters 컬렉션 등록 실험체만 파싱 (loadValidCharacters 로직 사용)
  if (dryRun) {
    console.log('[2/2] DRY RUN: parse-balance-changes.ts --test 모드로 파싱 미리보기...');
    console.log(`  npx tsx scripts/parse-balance-changes.ts --test --patch=${articleId}\n`);
    execSync(`npx tsx scripts/parse-balance-changes.ts --test --patch=${articleId}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } else {
    console.log('[2/2] parse-balance-changes.ts 실행 중...');
    execSync('npx tsx scripts/parse-balance-changes.ts', {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    });
  }
}

main().catch(console.error);
