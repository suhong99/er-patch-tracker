/**
 * 디버깅용 패치 파싱 테스트 스크립트
 * DB 없이 특정 캐릭터/패치ID로 파싱 결과 확인
 *
 * 사용법: npx tsx scripts/debug-parse-patch.ts
 */

import puppeteer, { Browser, Page } from 'puppeteer';

// 테스트 대상
const TEST_CHARACTER = '다니엘';
const TEST_PATCH_IDS = [1727];

interface ParsedChange {
  target: string;
  stat?: string;
  before?: string;
  after?: string;
  description?: string;
}

async function parseCharacterFromPatch(
  page: Page,
  patchId: number,
  characterName: string
): Promise<{ changes: ParsedChange[]; found: boolean; sectionFound: boolean; debug: string[] }> {
  const url = `https://playeternalreturn.com/posts/news/${patchId}?hl=ko-KR`;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`패치 ${patchId} - ${characterName} 파싱 시작`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(60));

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1000));

    const result = await page.evaluate((charName: string) => {
      const debug: string[] = [];
      const content = document.querySelector('.er-article-detail__content');

      if (!content) {
        debug.push('❌ .er-article-detail__content 요소를 찾을 수 없음');
        return { changes: [] as ParsedChange[], found: false, sectionFound: false, debug };
      }
      debug.push('✅ .er-article-detail__content 찾음');

      // h5 요소들 수집
      const h5Elements = content.querySelectorAll('h5');
      debug.push(`📋 h5 요소 개수: ${h5Elements.length}`);

      h5Elements.forEach((h5, i) => {
        debug.push(`   h5[${i}]: "${h5.textContent?.trim()}"`);
      });

      // "실험체" 포함된 모든 h5 섹션 찾기
      const characterSections: Array<{ start: Element; end: Element | null; title: string }> = [];
      for (let i = 0; i < h5Elements.length; i++) {
        const text = h5Elements[i].textContent?.trim() || '';
        if (text.includes('실험체') || text.includes('Character')) {
          characterSections.push({
            start: h5Elements[i],
            end: i + 1 < h5Elements.length ? h5Elements[i + 1] : null,
            title: text,
          });
        }
      }

      if (characterSections.length === 0) {
        debug.push('❌ 실험체/Character 섹션을 찾을 수 없음');
        return { changes: [] as ParsedChange[], found: false, sectionFound: false, debug };
      }

      debug.push(`\n📌 총 ${characterSections.length}개의 실험체 섹션 발견:`);
      characterSections.forEach((s, i) => {
        debug.push(`   [${i}] "${s.title}"`);
      });

      const allElements = Array.from(content.children);
      const numericPattern = /^(.+?)\s+([^\s→]+(?:\([^)]*\))?(?:[^→]*?))\s*→\s*(.+)$/;

      // 각 실험체 섹션을 순회하며 캐릭터 찾기
      for (let secIdx = 0; secIdx < characterSections.length; secIdx++) {
        const section = characterSections[secIdx];
        debug.push(`\n${'─'.repeat(50)}`);
        debug.push(`🔍 섹션 [${secIdx}] 검사: "${section.title}"`);

        // 이 섹션의 요소만 수집
        const sectionElements: Element[] = [];
        let inSection = false;

        for (const el of allElements) {
          if (el === section.start) {
            inSection = true;
            continue;
          }
          if (section.end && el === section.end) {
            break;
          }
          if (inSection) {
            sectionElements.push(el);
          }
        }

        debug.push(`   섹션 내 요소 개수: ${sectionElements.length}`);

        // 이 섹션에서 발견된 캐릭터 이름들
        const foundCharactersInSection: string[] = [];
        for (const el of sectionElements) {
          if (el.tagName === 'P') {
            const strong = el.querySelector('span > strong');
            if (strong) {
              const strongText = strong.textContent?.trim() || '';
              const span = el.querySelector('span');
              const spanText = span?.textContent?.trim() || '';

              // 조건1: span 전체가 strong과 같음 (기존)
              // 조건2: strong 뒤가 <br> 또는 끝
              const nextSibling = strong.nextSibling;
              const isFollowedByBrOrEnd =
                !nextSibling ||
                (nextSibling.nodeType === 1 && (nextSibling as Element).tagName === 'BR') ||
                (nextSibling.nodeType === 3 && nextSibling.textContent?.trim() === '');

              const isCharacterName =
                /^[가-힣&\s]+$/.test(strongText) &&
                (spanText === strongText || isFollowedByBrOrEnd);

              if (isCharacterName) {
                foundCharactersInSection.push(strongText);
                debug.push(
                  `      캐릭터 발견: "${strongText}" (span===strong: ${spanText === strongText}, br뒤: ${isFollowedByBrOrEnd})`
                );
              }
            }
          }
        }

        debug.push(`   발견된 캐릭터: [${foundCharactersInSection.join(', ')}]`);

        // 찾는 캐릭터가 이 섹션에 있는지 확인
        if (!foundCharactersInSection.includes(charName)) {
          debug.push(`   → "${charName}" 없음, 다음 섹션으로...`);
          continue;
        }

        debug.push(`   ✅ "${charName}" 발견! 변경사항 파싱 시작`);

        // 캐릭터 변경사항 파싱
        const charChanges: ParsedChange[] = [];
        let currentTarget = '기본 스탯';
        let isCollecting = false;

        for (const el of sectionElements) {
          if (el.tagName === 'P') {
            const strong = el.querySelector('span > strong');
            if (strong) {
              const strongText = strong.textContent?.trim() || '';
              const span = el.querySelector('span');
              const spanText = span?.textContent?.trim() || '';

              // 조건1: span 전체가 strong과 같음 (기존)
              // 조건2: strong 뒤가 <br> 또는 끝
              const nextSibling = strong.nextSibling;
              const isFollowedByBrOrEnd =
                !nextSibling ||
                (nextSibling.nodeType === 1 && (nextSibling as Element).tagName === 'BR') ||
                (nextSibling.nodeType === 3 && nextSibling.textContent?.trim() === '');

              const isCharacterName =
                /^[가-힣&\s]+$/.test(strongText) &&
                (spanText === strongText || isFollowedByBrOrEnd);

              if (isCharacterName) {
                if (isCollecting) {
                  // 다른 캐릭터 시작 → 수집 종료
                  debug.push(`   수집 종료 (다음 캐릭터: ${strongText})`);
                  break;
                }
                if (strongText === charName) {
                  isCollecting = true;
                  currentTarget = '기본 스탯';
                  debug.push(`   수집 시작: ${charName}`);
                }
              }
            }
          }

          if (el.tagName === 'UL' && isCollecting) {
            const topLevelLis = el.querySelectorAll(':scope > li');

            for (const topLi of Array.from(topLevelLis)) {
              const firstP = topLi.querySelector(':scope > p');
              let headerText = '';
              if (firstP) {
                const span = firstP.querySelector('span');
                if (span) {
                  headerText = span.textContent?.replace(/\s+/g, ' ').trim() || '';
                }
              }

              const skillMatch = headerText.match(
                /^([^→]+\((?:[가-힣A-Za-z\s-]*)?[QWERP패시브]\d?\)(?:\s*-\s*[^→]+\([QWERP]\d?\))?)/
              );

              if (skillMatch && !headerText.includes('→')) {
                currentTarget = skillMatch[0].trim();
              }

              const descendantLis = topLi.querySelectorAll('li');
              for (const descLi of Array.from(descendantLis)) {
                const descP = descLi.querySelector(':scope > p');
                let descSpan: Element | null = null;

                if (descP) {
                  descSpan = descP.querySelector('span');
                } else {
                  descSpan = descLi.querySelector(':scope > span');
                }

                if (descSpan) {
                  const descText = descSpan.textContent?.replace(/\s+/g, ' ').trim() || '';
                  if (!descText || descText.length < 3) continue;

                  if (descText.includes('→')) {
                    const match = descText.match(numericPattern);
                    if (match) {
                      charChanges.push({
                        target: currentTarget,
                        stat: match[1].trim(),
                        before: match[2].trim(),
                        after: match[3].trim(),
                      });
                    }
                  }
                }
              }
            }
          }
        }

        debug.push(`   📊 파싱된 변경사항: ${charChanges.length}개`);
        if (charChanges.length > 0) {
          debug.push(`   샘플:`);
          charChanges.slice(0, 3).forEach((c) => {
            debug.push(`     [${c.target}] ${c.stat}: ${c.before} → ${c.after}`);
          });
        }

        // 캐릭터를 찾았으면 반환
        return { changes: charChanges, found: true, sectionFound: true, debug };
      }

      // 모든 섹션 검사 후에도 못 찾음
      debug.push(`\n❌ 모든 섹션을 검사했지만 "${charName}"을 찾지 못함`);
      return { changes: [] as ParsedChange[], found: false, sectionFound: true, debug };
    }, characterName);

    return result;
  } catch (error) {
    console.error(`  파싱 오류:`, error);
    return { changes: [], found: false, sectionFound: false, debug: [`오류: ${error}`] };
  }
}

async function main(): Promise<void> {
  console.log('디버깅 패치 파싱 테스트');
  console.log(`캐릭터: ${TEST_CHARACTER}`);
  console.log(`패치 ID: ${TEST_PATCH_IDS.join(', ')}`);

  const browser: Browser = await puppeteer.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setCookie({ name: 'locale', value: 'ko_KR', domain: 'playeternalreturn.com' });

  for (const patchId of TEST_PATCH_IDS) {
    const result = await parseCharacterFromPatch(page, patchId, TEST_CHARACTER);

    console.log('\n--- 디버그 로그 ---');
    for (const line of result.debug) {
      console.log(line);
    }

    console.log('\n--- 최종 결과 ---');
    console.log(`sectionFound: ${result.sectionFound}`);
    console.log(`found: ${result.found}`);
    console.log(`changes: ${result.changes.length}개`);

    await new Promise((r) => setTimeout(r, 500));
  }

  await browser.close();
  console.log('\n\n테스트 완료');
}

main().catch(console.error);
