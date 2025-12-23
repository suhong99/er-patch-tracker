import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

type PatchNoteData = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string;
  viewCount: number;
};

type ValidationResult = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  status: 'success' | 'no_content' | 'error' | 'redirect';
  httpStatus?: number;
  errorMessage?: string;
  hasCharacterData: boolean;
};

type ValidationData = {
  validatedAt: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  withCharacterData: number;
  results: ValidationResult[];
};

const DATA_DIR = path.join(__dirname, '..', 'data');
const PATCH_NOTES_PATH = path.join(DATA_DIR, 'patch-notes.json');
const VALIDATION_PATH = path.join(DATA_DIR, 'validation-results.json');
const FAILED_LINKS_PATH = path.join(DATA_DIR, 'failed-links.json');

// 기존 검증 결과 로드
function loadExistingValidation(): ValidationData | null {
  try {
    if (fs.existsSync(VALIDATION_PATH)) {
      const content = fs.readFileSync(VALIDATION_PATH, 'utf-8');
      return JSON.parse(content) as ValidationData;
    }
  } catch {
    console.log('기존 검증 결과 로드 실패, 전체 검증 진행');
  }
  return null;
}

// 이미 검증된 패치 ID Set
function getValidatedIds(data: ValidationData | null): Set<number> {
  if (!data) return new Set();
  return new Set(data.results.map((r) => r.id));
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function validateLinks(): Promise<void> {
  // 저장된 패치노트 데이터 로드
  const rawData = fs.readFileSync(PATCH_NOTES_PATH, 'utf-8');
  const { patchNotes } = JSON.parse(rawData) as { patchNotes: PatchNoteData[] };

  // 기존 검증 결과 로드
  const existingValidation = loadExistingValidation();
  const validatedIds = getValidatedIds(existingValidation);

  // 신규 패치만 필터링
  const newPatches = patchNotes.filter((p) => !validatedIds.has(p.id));

  if (newPatches.length === 0) {
    console.log('신규 패치노트 없음 - 검증 불필요');
    return;
  }

  console.log(`기존 검증: ${validatedIds.size}개, 신규: ${newPatches.length}개`);
  console.log(`${newPatches.length}개의 신규 패치노트 링크 검사 시작...\n`);

  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page: Page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  const newResults: ValidationResult[] = [];
  const newFailedLinks: ValidationResult[] = [];

  for (let i = 0; i < newPatches.length; i++) {
    const note = newPatches[i];
    const progress = `[${i + 1}/${newPatches.length}]`;

    try {
      const response = await page.goto(note.link, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      const httpStatus = response?.status() || 0;
      const finalUrl = page.url();

      // 리다이렉트 확인
      if (!finalUrl.includes(`/posts/news/${note.id}`)) {
        console.log(`${progress} ⚠️ 리다이렉트: ${note.title}`);
        const result: ValidationResult = {
          ...note,
          status: 'redirect',
          httpStatus,
          errorMessage: `Redirected to: ${finalUrl}`,
          hasCharacterData: false,
        };
        newResults.push(result);
        newFailedLinks.push(result);
        continue;
      }

      if (httpStatus !== 200) {
        console.log(`${progress} ❌ HTTP ${httpStatus}: ${note.title}`);
        const result: ValidationResult = {
          ...note,
          status: 'error',
          httpStatus,
          errorMessage: `HTTP ${httpStatus}`,
          hasCharacterData: false,
        };
        newResults.push(result);
        newFailedLinks.push(result);
        continue;
      }

      await delay(500);

      // 콘텐츠 확인
      const pageCheck = await page.evaluate(() => {
        const contentEl = document.querySelector('.er-article-detail__content');
        const content = contentEl?.textContent?.trim() || '';

        // 실험체 관련 키워드 확인
        const hasCharacterData =
          content.includes('실험체') ||
          content.includes('스킬') ||
          content.includes('패시브') ||
          content.includes('쿨다운') ||
          content.includes('피해량') ||
          content.includes('체력') ||
          content.includes('공격력');

        return {
          hasContent: content.length > 100,
          contentLength: content.length,
          hasCharacterData,
        };
      });

      if (!pageCheck.hasContent) {
        console.log(`${progress} ⚠️ 콘텐츠 없음: ${note.title}`);
        const result: ValidationResult = {
          ...note,
          status: 'no_content',
          httpStatus,
          errorMessage: `Content length: ${pageCheck.contentLength}`,
          hasCharacterData: false,
        };
        newResults.push(result);
        newFailedLinks.push(result);
      } else {
        console.log(
          `${progress} ✅ ${pageCheck.hasCharacterData ? '실험체 데이터 있음' : '일반 패치'}: ${note.title}`
        );
        newResults.push({
          ...note,
          status: 'success',
          httpStatus,
          hasCharacterData: pageCheck.hasCharacterData,
        });
      }
    } catch (error) {
      console.log(`${progress} ❌ 오류: ${note.title} - ${error}`);
      const result: ValidationResult = {
        ...note,
        status: 'error',
        errorMessage: String(error),
        hasCharacterData: false,
      };
      newResults.push(result);
      newFailedLinks.push(result);
    }

    // 서버 부하 방지를 위한 딜레이
    await delay(300);
  }

  await browser.close();

  // 기존 결과와 병합 (신규 + 기존, 날짜순 정렬)
  const existingResults = existingValidation?.results ?? [];
  const mergedResults = [...newResults, ...existingResults].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // 전체 실패 링크 계산
  const allFailedLinks = mergedResults.filter((r) => r.status !== 'success');

  // 전체 검증 결과 저장
  fs.writeFileSync(
    VALIDATION_PATH,
    JSON.stringify(
      {
        validatedAt: new Date().toISOString(),
        totalCount: mergedResults.length,
        successCount: mergedResults.filter((r) => r.status === 'success').length,
        failedCount: allFailedLinks.length,
        withCharacterData: mergedResults.filter((r) => r.hasCharacterData).length,
        results: mergedResults,
      },
      null,
      2
    ),
    'utf-8'
  );

  // 실패한 링크만 별도 저장
  fs.writeFileSync(
    FAILED_LINKS_PATH,
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        totalFailed: allFailedLinks.length,
        byStatus: {
          no_content: allFailedLinks.filter((r) => r.status === 'no_content').length,
          error: allFailedLinks.filter((r) => r.status === 'error').length,
          redirect: allFailedLinks.filter((r) => r.status === 'redirect').length,
        },
        failedLinks: allFailedLinks,
      },
      null,
      2
    ),
    'utf-8'
  );

  // 요약 출력
  console.log('\n' + '='.repeat(60));
  console.log('검증 완료 요약');
  console.log('='.repeat(60));
  console.log(`신규 검사: ${newResults.length}개`);
  console.log(`  - 성공: ${newResults.filter((r) => r.status === 'success').length}개`);
  console.log(`  - 실패: ${newFailedLinks.length}개`);
  console.log('');
  console.log(`전체 누적: ${mergedResults.length}개`);
  console.log(`  - 성공: ${mergedResults.filter((r) => r.status === 'success').length}개`);
  console.log(
    `  - 실험체 데이터 포함: ${mergedResults.filter((r) => r.hasCharacterData).length}개`
  );
  console.log(`\n결과 저장 위치:`);
  console.log(`  - 전체 결과: ${VALIDATION_PATH}`);
  console.log(`  - 실패 링크: ${FAILED_LINKS_PATH}`);
}

validateLinks().catch(console.error);
