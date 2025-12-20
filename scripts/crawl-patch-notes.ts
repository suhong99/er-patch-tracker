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

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function crawlPatchNotes(): Promise<PatchNote[]> {
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

  // API 응답을 저장할 변수
  const allArticles: ApiArticle[] = [];
  let totalPages = 1;
  let currentPage = 1;

  // 네트워크 요청 인터셉트 설정
  await page.setRequestInterception(true);

  page.on('request', (request) => {
    request.continue();
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/v1/posts/news') && url.includes('category=patchnote')) {
      try {
        const data: ApiResponse = await response.json();
        totalPages = data.total_page;
        console.log(
          `API 응답 수신 (페이지 ${data.current_page}/${data.total_page}): ${data.articles.length}개 기사`
        );

        data.articles.forEach((article) => {
          if (!allArticles.some((a) => a.id === article.id)) {
            allArticles.push(article);
          }
        });
      } catch {
        // JSON 파싱 실패 무시
      }
    }
  });

  console.log('패치노트 목록 페이지 접속...');

  // 첫 페이지 로드
  await page.goto('https://playeternalreturn.com/posts/news?categoryPath=patchnote', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await delay(2000);

  // 모든 페이지 크롤링
  while (currentPage < totalPages) {
    currentPage++;
    console.log(`페이지 ${currentPage}/${totalPages} 요청 중...`);

    // API 직접 호출 (페이지 컨텍스트에서)
    await page.evaluate(async (pageNum: number) => {
      await fetch(
        `https://playeternalreturn.com/api/v1/posts/news?category=patchnote&page=${pageNum}&search_type=title&search_text=`
      );
    }, currentPage);

    await delay(500);
  }

  console.log(`\n총 ${allArticles.length}개의 패치노트 수집 완료`);

  await browser.close();

  // 데이터 변환
  const patchNotes: PatchNote[] = allArticles.map((article) => ({
    id: article.id,
    title: article.i18ns.ko_KR?.title || '',
    link: article.url || article.i18ns.ko_KR?.content_link || '',
    createdAt: article.created_at,
    updatedAt: article.updated_at,
    thumbnailUrl: article.thumbnail_url,
    viewCount: article.view_count,
  }));

  // 날짜순 정렬 (최신순)
  patchNotes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return patchNotes;
}

async function main(): Promise<void> {
  try {
    const patchNotes = await crawlPatchNotes();

    // 데이터 저장
    const outputPath = path.join(__dirname, '..', 'data', 'patch-notes.json');
    const outputData = {
      crawledAt: new Date().toISOString(),
      totalCount: patchNotes.length,
      patchNotes,
    };

    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
    console.log(`\n데이터 저장 완료: ${outputPath}`);

    // 콘솔에 결과 일부 출력
    console.log('\n=== 수집된 패치노트 목록 (최근 10개) ===');
    patchNotes.slice(0, 10).forEach((note, i) => {
      const date = new Date(note.createdAt);
      const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      console.log(`${i + 1}. ${note.title}`);
      console.log(`   날짜: ${formattedDate}`);
      console.log(`   링크: ${note.link}`);
    });

    // 가장 오래된 패치노트도 확인
    console.log('\n=== 가장 오래된 패치노트 3개 ===');
    patchNotes.slice(-3).forEach((note, i) => {
      const date = new Date(note.createdAt);
      const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      console.log(`${patchNotes.length - 2 + i}. ${note.title}`);
      console.log(`   날짜: ${formattedDate}`);
      console.log(`   링크: ${note.link}`);
    });
  } catch (error) {
    console.error('크롤링 중 오류 발생:', error);
    process.exit(1);
  }
}

main();
