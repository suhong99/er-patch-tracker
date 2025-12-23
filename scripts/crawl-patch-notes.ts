import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

type PatchNote = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string;
  viewCount: number;
};

type PatchNotesData = {
  crawledAt: string;
  totalCount: number;
  patchNotes: PatchNote[];
};

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

type ApiResponse = {
  per_page: number;
  current_page: number;
  total_page: number;
  article_count: number;
  articles: ApiArticle[];
};

const DATA_PATH = path.join(__dirname, '..', 'data', 'patch-notes.json');

// 기존 데이터 로드
function loadExistingData(): PatchNotesData | null {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const content = fs.readFileSync(DATA_PATH, 'utf-8');
      return JSON.parse(content) as PatchNotesData;
    }
  } catch {
    console.log('기존 데이터 로드 실패, 전체 크롤링 진행');
  }
  return null;
}

// 기존 패치 ID Set 생성
function getExistingIds(data: PatchNotesData | null): Set<number> {
  if (!data) return new Set();
  return new Set(data.patchNotes.map((p) => p.id));
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// API에서 직접 패치노트 목록 가져오기
async function fetchPatchNotesPage(page: Page, pageNum: number): Promise<ApiArticle[]> {
  const result = await page.evaluate(async (num: number) => {
    const response = await fetch(
      `https://playeternalreturn.com/api/v1/posts/news?category=patchnote&page=${num}&search_type=title&search_text=`
    );
    const data = await response.json();
    return data as ApiResponse;
  }, pageNum);

  return result.articles;
}

// 증분 크롤링: 신규 패치노트만 수집
async function crawlNewPatchNotes(existingIds: Set<number>): Promise<{
  newPatchNotes: PatchNote[];
  isFullCrawl: boolean;
}> {
  console.log('브라우저 시작...');

  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page: Page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // 첫 페이지 로드 (쿠키/세션 설정용)
  console.log('패치노트 목록 페이지 접속...');
  await page.goto('https://playeternalreturn.com/posts/news?categoryPath=patchnote', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await delay(1000);

  const newArticles: ApiArticle[] = [];
  let currentPage = 1;
  let foundExisting = false;
  const isFullCrawl = existingIds.size === 0;

  if (isFullCrawl) {
    console.log('기존 데이터 없음 - 전체 크롤링 진행');
  } else {
    console.log(`기존 패치노트 ${existingIds.size}개 확인됨 - 증분 크롤링 진행`);
  }

  // 페이지 순회하며 신규 패치 찾기
  while (!foundExisting) {
    console.log(`페이지 ${currentPage} 확인 중...`);

    const articles = await fetchPatchNotesPage(page, currentPage);

    if (articles.length === 0) {
      console.log('더 이상 패치노트 없음');
      break;
    }

    for (const article of articles) {
      if (existingIds.has(article.id)) {
        // 이미 있는 패치 발견 - 여기서 중단
        foundExisting = true;
        console.log(`기존 패치 발견 (ID: ${article.id}) - 크롤링 중단`);
        break;
      }
      newArticles.push(article);
    }

    if (!foundExisting) {
      currentPage++;
      await delay(300);
    }
  }

  console.log(`\n신규 패치노트 ${newArticles.length}개 발견`);

  await browser.close();

  // 데이터 변환
  const newPatchNotes: PatchNote[] = newArticles.map((article) => ({
    id: article.id,
    title: article.i18ns.ko_KR?.title || '',
    link: article.url || article.i18ns.ko_KR?.content_link || '',
    createdAt: article.created_at,
    updatedAt: article.updated_at,
    thumbnailUrl: article.thumbnail_url,
    viewCount: article.view_count,
  }));

  return { newPatchNotes, isFullCrawl };
}

// 패치노트 병합 (신규 + 기존, 최신순 정렬)
function mergePatchNotes(
  newPatchNotes: PatchNote[],
  existingData: PatchNotesData | null
): PatchNote[] {
  const existing = existingData?.patchNotes ?? [];
  const merged = [...newPatchNotes, ...existing];

  // 중복 제거 (혹시 모를 경우 대비)
  const uniqueMap = new Map<number, PatchNote>();
  for (const patch of merged) {
    if (!uniqueMap.has(patch.id)) {
      uniqueMap.set(patch.id, patch);
    }
  }

  // 최신순 정렬
  return Array.from(uniqueMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

async function main(): Promise<void> {
  try {
    // 기존 데이터 로드
    const existingData = loadExistingData();
    const existingIds = getExistingIds(existingData);

    // 증분 크롤링
    const { newPatchNotes, isFullCrawl } = await crawlNewPatchNotes(existingIds);

    // 신규 패치가 없으면 종료
    if (newPatchNotes.length === 0 && !isFullCrawl) {
      console.log('\n신규 패치노트 없음 - 업데이트 불필요');
      return;
    }

    // 병합
    const mergedPatchNotes = mergePatchNotes(newPatchNotes, existingData);

    // 데이터 저장
    const outputData: PatchNotesData = {
      crawledAt: new Date().toISOString(),
      totalCount: mergedPatchNotes.length,
      patchNotes: mergedPatchNotes,
    };

    fs.writeFileSync(DATA_PATH, JSON.stringify(outputData, null, 2), 'utf-8');
    console.log(`\n데이터 저장 완료: ${DATA_PATH}`);

    // 결과 출력
    if (newPatchNotes.length > 0) {
      console.log('\n=== 신규 패치노트 ===');
      newPatchNotes.forEach((note, i) => {
        const date = new Date(note.createdAt);
        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        console.log(`${i + 1}. ${note.title}`);
        console.log(`   날짜: ${formattedDate}`);
        console.log(`   링크: ${note.link}`);
      });
    }

    console.log(`\n총 패치노트: ${mergedPatchNotes.length}개`);
  } catch (error) {
    console.error('크롤링 중 오류 발생:', error);
    process.exit(1);
  }
}

main();
