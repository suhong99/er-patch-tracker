import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

type PatchNoteData = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
};

type ValidationResult = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
  status: 'success' | 'no_content' | 'error' | 'redirect';
  httpStatus?: number;
  errorMessage?: string;
  hasCharacterData: boolean;
};

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function validateLinks(): Promise<void> {
  // 저장된 패치노트 데이터 로드
  const dataPath = path.join(__dirname, '..', 'data', 'patch-notes.json');
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const { patchNotes } = JSON.parse(rawData) as { patchNotes: PatchNoteData[] };

  console.log(`총 ${patchNotes.length}개의 패치노트 링크 검사 시작...\n`);

  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page: Page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  const results: ValidationResult[] = [];
  const failedLinks: ValidationResult[] = [];

  for (let i = 0; i < patchNotes.length; i++) {
    const note = patchNotes[i];
    const progress = `[${i + 1}/${patchNotes.length}]`;

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
        results.push(result);
        failedLinks.push(result);
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
        results.push(result);
        failedLinks.push(result);
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
        results.push(result);
        failedLinks.push(result);
      } else {
        console.log(
          `${progress} ✅ ${pageCheck.hasCharacterData ? '실험체 데이터 있음' : '일반 패치'}: ${note.title}`
        );
        results.push({
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
      results.push(result);
      failedLinks.push(result);
    }

    // 서버 부하 방지를 위한 딜레이
    await delay(300);
  }

  await browser.close();

  // 결과 저장
  const outputDir = path.join(__dirname, '..', 'data');

  // 전체 검증 결과 저장
  const validationResultPath = path.join(outputDir, 'validation-results.json');
  fs.writeFileSync(
    validationResultPath,
    JSON.stringify(
      {
        validatedAt: new Date().toISOString(),
        totalCount: results.length,
        successCount: results.filter((r) => r.status === 'success').length,
        failedCount: failedLinks.length,
        withCharacterData: results.filter((r) => r.hasCharacterData).length,
        results,
      },
      null,
      2
    ),
    'utf-8'
  );

  // 실패한 링크만 별도 저장
  const failedLinksPath = path.join(outputDir, 'failed-links.json');
  fs.writeFileSync(
    failedLinksPath,
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        totalFailed: failedLinks.length,
        byStatus: {
          no_content: failedLinks.filter((r) => r.status === 'no_content').length,
          error: failedLinks.filter((r) => r.status === 'error').length,
          redirect: failedLinks.filter((r) => r.status === 'redirect').length,
        },
        failedLinks,
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
  console.log(`총 검사: ${results.length}개`);
  console.log(`✅ 성공: ${results.filter((r) => r.status === 'success').length}개`);
  console.log(`  - 실험체 데이터 포함: ${results.filter((r) => r.hasCharacterData).length}개`);
  console.log(`❌ 실패: ${failedLinks.length}개`);
  console.log(`  - 콘텐츠 없음: ${failedLinks.filter((r) => r.status === 'no_content').length}개`);
  console.log(`  - 오류: ${failedLinks.filter((r) => r.status === 'error').length}개`);
  console.log(`  - 리다이렉트: ${failedLinks.filter((r) => r.status === 'redirect').length}개`);
  console.log(`\n결과 저장 위치:`);
  console.log(`  - 전체 결과: ${validationResultPath}`);
  console.log(`  - 실패 링크: ${failedLinksPath}`);
}

validateLinks().catch(console.error);
