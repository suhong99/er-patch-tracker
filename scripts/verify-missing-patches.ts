/**
 * 누락된 패치 데이터 검증 스크립트
 *
 * 누락된 패치들이 실제 밸런스 변경인지,
 * 가격 하락 같은 다른 정보인지 확인합니다.
 *
 * 실제 패치 내역 구조:
 * 1. strong 태그에 실험체 이름
 * 2. 옵셔널한 p 태그에 개발자 멘트
 * 3. ul > li 형식으로 실제 변경사항 (→ 포함)
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

type MissingPatch = {
  patchId: number;
  patchTitle: string;
  patchDate: string;
  patchLink: string;
  character: string;
};

type VerificationResult = {
  patchId: number;
  patchTitle: string;
  patchLink: string;
  character: string;
  hasRealChanges: boolean;
  reason: string;
  details: string[];
};

// 패치노트에서 특정 캐릭터의 변경사항 확인
async function verifyCharacterChanges(
  page: Page,
  url: string,
  characterName: string
): Promise<{ hasRealChanges: boolean; reason: string; details: string[] }> {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const result = await page.evaluate((charName: string) => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) return { hasRealChanges: false, reason: '콘텐츠 없음', details: [] };

      // 실험체 섹션 찾기
      const h5Elements = content.querySelectorAll('h5');
      let characterSectionStart: Element | null = null;
      let characterSectionEnd: Element | null = null;

      for (let i = 0; i < h5Elements.length; i++) {
        const text = h5Elements[i].textContent?.trim();
        if (text === '실험체') {
          characterSectionStart = h5Elements[i];
          if (i + 1 < h5Elements.length) {
            characterSectionEnd = h5Elements[i + 1];
          }
          break;
        }
      }

      if (!characterSectionStart) {
        return { hasRealChanges: false, reason: '실험체 섹션 없음', details: [] };
      }

      // 해당 캐릭터 찾기
      const allElements = Array.from(content.children);
      let inSection = false;
      let foundCharacter = false;
      let characterElement: Element | null = null;

      for (const el of allElements) {
        if (el === characterSectionStart) {
          inSection = true;
          continue;
        }
        if (characterSectionEnd && el === characterSectionEnd) {
          break;
        }
        if (!inSection) continue;

        // strong 태그에서 캐릭터 이름 찾기
        const strongElements = el.querySelectorAll('strong');
        for (const strong of strongElements) {
          const name = strong.textContent
            ?.trim()
            .replace(/&amp;/g, '&')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (name === charName) {
            foundCharacter = true;
            characterElement = el;
            break;
          }
        }
        if (foundCharacter) break;
      }

      if (!foundCharacter || !characterElement) {
        return { hasRealChanges: false, reason: '캐릭터 미발견', details: [] };
      }

      // 캐릭터 요소 다음의 내용 분석
      const details: string[] = [];
      const currentEl: Element | null = characterElement;
      let hasUlWithChanges = false;
      let hasArrowChanges = false;
      let onlyPriceInfo = true;

      // 캐릭터 요소 자체의 텍스트 확인
      const elementText = characterElement.textContent || '';
      details.push(`[요소 텍스트] ${elementText.slice(0, 100)}...`);

      // 가격 관련 키워드
      const priceKeywords = ['가격', '판매', 'BP', 'NP', '하락', '인하'];
      const hasPriceKeyword = priceKeywords.some((k) => elementText.includes(k));

      if (hasPriceKeyword) {
        details.push('[가격 관련 텍스트 발견]');
      }

      // 다음 형제 요소들 확인
      let sibling = characterElement.nextElementSibling;
      let checkedSiblings = 0;

      while (sibling && checkedSiblings < 5) {
        // 다음 캐릭터(strong 태그가 캐릭터명인 경우) 발견하면 중단
        const siblingStrong = sibling.querySelector('span > strong');
        if (siblingStrong) {
          const sibText = siblingStrong.textContent?.trim() || '';
          if (/^[가-힣&\s]+$/.test(sibText) && sibText.length <= 15) {
            // 새 캐릭터 시작
            break;
          }
        }

        // UL 요소 확인
        if (sibling.tagName === 'UL') {
          const lis = sibling.querySelectorAll('li');
          for (const li of lis) {
            const liText = li.textContent || '';
            details.push(`[LI] ${liText.slice(0, 80)}`);

            // 화살표(→)가 있으면 실제 수치 변경
            if (liText.includes('→')) {
              hasArrowChanges = true;
              onlyPriceInfo = false;
            }

            // 스킬 패턴 확인 (Q, W, E, R, 패시브)
            if (/\([QWERP패시브]\)/.test(liText)) {
              onlyPriceInfo = false;
            }
          }
          hasUlWithChanges = lis.length > 0;
        }

        // P 요소 확인 (개발자 코멘트)
        if (sibling.tagName === 'P') {
          const pText = sibling.textContent || '';
          if (pText.length > 20) {
            details.push(`[P] ${pText.slice(0, 80)}...`);
          }
        }

        sibling = sibling.nextElementSibling;
        checkedSiblings++;
      }

      // 판정
      if (hasArrowChanges) {
        return {
          hasRealChanges: true,
          reason: '수치 변경 발견 (→)',
          details,
        };
      }

      if (hasUlWithChanges && !onlyPriceInfo) {
        return {
          hasRealChanges: true,
          reason: 'UL 변경사항 발견',
          details,
        };
      }

      if (hasPriceKeyword && !hasUlWithChanges) {
        return {
          hasRealChanges: false,
          reason: '가격 정보만 있음 (변경사항 없음)',
          details,
        };
      }

      if (!hasUlWithChanges) {
        return {
          hasRealChanges: false,
          reason: 'UL 변경사항 없음',
          details,
        };
      }

      return {
        hasRealChanges: false,
        reason: '변경사항 불명확',
        details,
      };
    }, characterName);

    return result;
  } catch (error) {
    return {
      hasRealChanges: false,
      reason: `오류: ${error}`,
      details: [],
    };
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('누락된 패치 데이터 검증 시작...\n');

  // 비교 결과에서 누락 목록 로드
  const resultPath = path.join(process.cwd(), 'scripts', 'patch-comparison-result.json');
  const resultData = JSON.parse(readFileSync(resultPath, 'utf-8'));
  const missingPatches: MissingPatch[] = resultData.missingPatches;

  console.log(`검증할 누락 패치: ${missingPatches.length}개\n`);

  // 브라우저 시작
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page: Page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  await page.setCookie({
    name: 'locale',
    value: 'ko_KR',
    domain: 'playeternalreturn.com',
  });

  const results: VerificationResult[] = [];
  const realChanges: VerificationResult[] = [];
  const notRealChanges: VerificationResult[] = [];

  for (let i = 0; i < missingPatches.length; i++) {
    const patch = missingPatches[i];
    const progress = `[${i + 1}/${missingPatches.length}]`;

    process.stdout.write(`${progress} ${patch.character} - ${patch.patchTitle.slice(0, 30)}... `);

    const verification = await verifyCharacterChanges(page, patch.patchLink, patch.character);

    const result: VerificationResult = {
      patchId: patch.patchId,
      patchTitle: patch.patchTitle,
      patchLink: patch.patchLink,
      character: patch.character,
      hasRealChanges: verification.hasRealChanges,
      reason: verification.reason,
      details: verification.details,
    };

    results.push(result);

    if (verification.hasRealChanges) {
      realChanges.push(result);
      console.log(`✓ 실제 변경`);
    } else {
      notRealChanges.push(result);
      console.log(`✗ ${verification.reason}`);
    }

    await delay(500);
  }

  await browser.close();

  // 결과 요약
  console.log('\n' + '='.repeat(60));
  console.log('검증 결과 요약');
  console.log('='.repeat(60));
  console.log(`\n총 검증: ${results.length}개`);
  console.log(`실제 변경사항: ${realChanges.length}개 (수정 필요)`);
  console.log(`가격/기타 정보: ${notRealChanges.length}개 (수정 불필요)`);

  if (realChanges.length > 0) {
    console.log('\n=== 실제 변경사항 (수정 필요) ===');
    for (const r of realChanges) {
      console.log(`  [${r.patchId}] ${r.character} - ${r.patchTitle}`);
      console.log(`    사유: ${r.reason}`);
    }
  }

  if (notRealChanges.length > 0) {
    console.log('\n=== 가격/기타 정보 (수정 불필요) ===');
    for (const r of notRealChanges) {
      console.log(`  [${r.patchId}] ${r.character} - ${r.reason}`);
    }
  }

  // 결과 저장
  const output = {
    summary: {
      total: results.length,
      realChanges: realChanges.length,
      notRealChanges: notRealChanges.length,
    },
    realChanges,
    notRealChanges,
    allResults: results,
  };

  const outputPath = path.join(process.cwd(), 'scripts', 'missing-patch-verification.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n결과 저장: ${outputPath}`);
}

main().catch(console.error);
