/**
 * 혜진 실험체 패치 데이터 개별 검증 스크립트
 *
 * 목적:
 * 1. Firebase에서 혜진의 패치 데이터 가져오기
 * 2. 각 패치 웹페이지에서 혜진 섹션만 정확히 파싱 (h5 범위 엄격히 준수)
 * 3. 정규 패치/핫픽스 구조 분석 및 기록
 * 4. 데이터 비교 및 불일치 기록
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin.js';
import * as fs from 'fs';

// ============================================
// 타입 정의
// ============================================

interface Change {
  target: string;
  stat?: string;
  before?: string;
  after?: string;
  description?: string;
  changeType: string;
  changeCategory: string;
}

interface PatchEntry {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  changes: Change[];
}

interface CharacterData {
  name: string;
  patchHistory: PatchEntry[];
}

interface ParsedChange {
  target: string;
  stat?: string;
  before?: string;
  after?: string;
  description?: string;
}

interface PatchStructure {
  patchId: number;
  patchVersion: string;
  url: string;
  isHotfix: boolean;
  structure: string;
  h5Found: boolean;
  characterFound: boolean;
  characterSectionBoundary: {
    start: string;
    end: string | null;
  };
  rawHtml?: string;
}

// ============================================
// 웹 파싱 함수 - 엄격한 h5 범위 준수
// ============================================

async function parseCharacterSection(
  page: Page,
  patchId: number,
  characterName: string
): Promise<{
  changes: ParsedChange[];
  structure: PatchStructure;
  rawSection: string;
}> {
  const url = `https://playeternalreturn.com/posts/news/${patchId}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));

    const result = await page.evaluate((charName: string) => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) {
        return {
          changes: [],
          rawSection: '',
          structureInfo: {
            h5Found: false,
            characterFound: false,
            startMarker: '',
            endMarker: null as string | null,
            isHotfix: false,
            structureType: 'unknown',
          },
        };
      }

      // 핫픽스 여부 확인 (제목에 "핫픽스" 또는 "hotfix" 포함)
      const title = document.querySelector('h2.er-article-detail__title')?.textContent || '';
      const isHotfix = /핫픽스|hotfix/i.test(title);

      // h5 요소들 수집
      const h5Elements = content.querySelectorAll('h5');
      let characterSectionStart: Element | null = null;
      let characterSectionEnd: Element | null = null;
      let h5Found = false;
      let startMarker = '';
      let endMarker: string | null = null;

      // "실험체" 포함된 h5 찾기 (예: "실험체", "실험체 및 아이템 주요 패치의도" 등)
      for (let i = 0; i < h5Elements.length; i++) {
        const text = h5Elements[i].textContent?.trim() || '';
        if (text.includes('실험체') || text.includes('Character')) {
          h5Found = true;
          characterSectionStart = h5Elements[i];
          startMarker = text;

          // 다음 h5가 나오면 실험체 섹션 끝 (명칭 상관없이)
          if (i + 1 < h5Elements.length) {
            characterSectionEnd = h5Elements[i + 1];
            endMarker = h5Elements[i + 1].textContent?.trim() || null;
          }
          break;
        }
      }

      if (!characterSectionStart) {
        return {
          changes: [],
          rawSection: '',
          structureInfo: {
            h5Found: false,
            characterFound: false,
            startMarker: '',
            endMarker: null,
            isHotfix,
            structureType: 'no_h5_section',
          },
        };
      }

      // 실험체 섹션 내의 요소만 수집
      const allElements = Array.from(content.children);
      const sectionElements: Element[] = [];
      let inSection = false;

      for (const el of allElements) {
        if (el === characterSectionStart) {
          inSection = true;
          continue;
        }
        if (characterSectionEnd && el === characterSectionEnd) {
          break;
        }
        if (inSection) {
          sectionElements.push(el);
        }
      }

      // 해당 캐릭터 섹션 찾기
      type RawChange = {
        target: string;
        stat?: string;
        before?: string;
        after?: string;
        description?: string;
      };

      let characterFound = false;
      const charChanges: RawChange[] = [];
      let rawSection = '';
      let currentTarget = '기본 스탯';
      let isCollecting = false;
      let structureType = isHotfix ? 'hotfix' : 'regular';

      const numericPattern = /^(.+?)\s+([^\s→]+(?:\([^)]*\))?(?:[^→]*?))\s*→\s*(.+)$/;

      for (const el of sectionElements) {
        // P 태그에서 캐릭터 이름 찾기 (정규 패치 구조)
        if (el.tagName === 'P') {
          const strong = el.querySelector('span > strong');
          if (strong) {
            const strongText = strong.textContent?.trim() || '';
            const span = el.querySelector('span');
            const spanText = span?.textContent?.trim() || '';

            // 캐릭터 이름 확인 (span 전체가 strong만 포함하는 경우)
            if (spanText === strongText && /^[가-힣&\s]+$/.test(strongText)) {
              // 이전 캐릭터 수집 중이었다면 중단
              if (isCollecting) {
                break;
              }

              // 현재 캐릭터가 찾는 캐릭터인지 확인
              if (strongText === charName) {
                characterFound = true;
                isCollecting = true;
                currentTarget = '기본 스탯';
                rawSection += `[캐릭터 시작: ${strongText}]\n`;
              }
            }
          }
        }

        // UL 태그 처리
        if (el.tagName === 'UL' && isCollecting) {
          rawSection += el.outerHTML + '\n';

          const topLevelLis = el.querySelectorAll(':scope > li');

          for (const topLi of Array.from(topLevelLis)) {
            // 핫픽스 구조: li > p > span > strong 에서 캐릭터 이름
            const firstP = topLi.querySelector(':scope > p');
            if (firstP) {
              const strong = firstP.querySelector('span > strong');
              if (strong) {
                const strongText = strong.textContent?.trim() || '';
                const span = firstP.querySelector('span');
                const spanText = span?.textContent?.trim() || '';

                if (spanText === strongText && /^[가-힣&\s]+$/.test(strongText)) {
                  // 다른 캐릭터면 중단
                  if (strongText !== charName) {
                    if (isCollecting && charChanges.length > 0) {
                      // 이미 혜진 수집 완료, 다른 캐릭터 나왔으니 종료
                      break;
                    }
                    continue;
                  }

                  // 혜진 발견 (핫픽스 구조)
                  if (!isCollecting) {
                    characterFound = true;
                    isCollecting = true;
                    currentTarget = '기본 스탯';
                    structureType = 'hotfix_nested';
                  }

                  // 하위 ul 처리
                  const nestedUl = topLi.querySelector(':scope > ul');
                  if (nestedUl) {
                    const nestedLis = nestedUl.querySelectorAll(':scope > li');
                    for (const nestedLi of Array.from(nestedLis)) {
                      const nestedP = nestedLi.querySelector(':scope > p');
                      if (nestedP) {
                        const nestedSpan = nestedP.querySelector('span');
                        if (nestedSpan) {
                          const text = nestedSpan.textContent?.replace(/\s+/g, ' ').trim() || '';
                          if (text && text.includes('→')) {
                            const match = text.match(numericPattern);
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
                  continue;
                }
              }
            }

            // 스킬 헤더 확인
            let headerText = '';
            if (firstP) {
              const span = firstP.querySelector('span');
              if (span) {
                headerText = span.textContent?.replace(/\s+/g, ' ').trim() || '';
              }
            }

            // 스킬 헤더 패턴
            const skillMatch = headerText.match(
              /^([^→]+\((?:[가-힣A-Za-z\s-]*)?[QWERP패시브]\d?\)(?:\s*-\s*[^→]+\([QWERP]\d?\))?)/
            );

            if (skillMatch && !headerText.includes('→')) {
              currentTarget = skillMatch[0].trim();
            } else if (headerText) {
              // 스킬 헤더가 아닌 경우 변경사항으로 처리
              const isSkillHeader =
                /^[^(→]+\([QWERP]\)$/.test(headerText) ||
                /^[^(→]+\([가-힣A-Za-z\s-]+[QWERP]\d?\)$/.test(headerText) ||
                /^[^(→]+\(패시브\)$/.test(headerText);

              if (!isSkillHeader && headerText.includes('→')) {
                const match = headerText.match(numericPattern);
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

            // 하위 li 처리
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

                // 스킬 헤더 체크
                const subSkillMatch = descText.match(
                  /^([^→]+\((?:[가-힣A-Za-z\s-]*)?[QWERP패시브]\d?\)(?:\s*-\s*[^→]+\([QWERP]\d?\))?)/
                );
                if (
                  subSkillMatch &&
                  !descText.includes('→') &&
                  descText === subSkillMatch[0].trim()
                ) {
                  currentTarget = subSkillMatch[0].trim();
                  continue;
                }

                // 변경사항 파싱
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
                } else if (descText.length > 10 && !descText.match(/^[^(→]+\([QWERP패시브]\)/)) {
                  // 설명형 변경사항
                  charChanges.push({
                    target: currentTarget,
                    description: descText,
                  });
                }
              }
            }
          }
        }

        // 다음 캐릭터 P 태그가 나오면 수집 중단
        if (el.tagName === 'P' && isCollecting && charChanges.length > 0) {
          const strong = el.querySelector('span > strong');
          if (strong) {
            const strongText = strong.textContent?.trim() || '';
            const span = el.querySelector('span');
            const spanText = span?.textContent?.trim() || '';
            if (
              spanText === strongText &&
              /^[가-힣&\s]+$/.test(strongText) &&
              strongText !== charName
            ) {
              break;
            }
          }
        }
      }

      return {
        changes: charChanges,
        rawSection,
        structureInfo: {
          h5Found,
          characterFound,
          startMarker,
          endMarker,
          isHotfix,
          structureType,
        },
      };
    }, characterName);

    const structure: PatchStructure = {
      patchId,
      patchVersion: '',
      url,
      isHotfix: result.structureInfo.isHotfix,
      structure: result.structureInfo.structureType,
      h5Found: result.structureInfo.h5Found,
      characterFound: result.structureInfo.characterFound,
      characterSectionBoundary: {
        start: result.structureInfo.startMarker,
        end: result.structureInfo.endMarker,
      },
    };

    return {
      changes: result.changes,
      structure,
      rawSection: result.rawSection,
    };
  } catch (error) {
    console.error(`  파싱 오류 (패치 ${patchId}):`, error);
    return {
      changes: [],
      structure: {
        patchId,
        patchVersion: '',
        url,
        isHotfix: false,
        structure: 'error',
        h5Found: false,
        characterFound: false,
        characterSectionBoundary: { start: '', end: null },
      },
      rawSection: '',
    };
  }
}

// ============================================
// 비교 함수
// ============================================

/**
 * stat + before + after를 이어붙여서 정규화
 * 공백, 특수문자 제거하여 파싱 차이 무시
 */
function normalizeChange(c: {
  target?: string;
  stat?: string;
  before?: string;
  after?: string;
  description?: string;
}): string {
  if (c.stat) {
    // stat + before + after 이어붙여서 비교
    const combined = `${c.target || ''}${c.stat || ''}${c.before || ''}${c.after || ''}`;
    return combined
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[():,]/g, '');
  }
  if (c.description) {
    // 설명형은 target + description 앞부분으로 비교
    const combined = `${c.target || ''}${c.description || ''}`;
    return combined
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[():,]/g, '')
      .slice(0, 80);
  }
  return '';
}

function compareChanges(
  dbChanges: Change[],
  webChanges: ParsedChange[]
): {
  missing: ParsedChange[];
  extra: Change[];
  matched: number;
} {
  const dbNormalized = dbChanges.map((c) => normalizeChange(c));
  const webNormalized = webChanges.map((c) => normalizeChange(c));

  const missing = webChanges.filter((_, i) => !dbNormalized.includes(webNormalized[i]));
  const extra = dbChanges.filter((_, i) => !webNormalized.includes(dbNormalized[i]));
  const matched = webChanges.length - missing.length;

  return { missing, extra, matched };
}

// ============================================
// 메인 함수
// ============================================

async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('혜진 실험체 패치 데이터 검증');
  console.log('='.repeat(70));
  console.log();

  const db = initFirebaseAdmin();

  // 1. Firebase에서 혜진 데이터 가져오기
  console.log('1. Firebase에서 혜진 데이터 로드 중...');
  const hyejinDoc = await db.collection('characters').doc('혜진').get();

  if (!hyejinDoc.exists) {
    console.error('혜진 캐릭터를 찾을 수 없습니다.');
    return;
  }

  const hyejinData = hyejinDoc.data() as CharacterData;
  console.log(`   - 이름: ${hyejinData.name}`);
  console.log(`   - 패치 수: ${hyejinData.patchHistory.length}개`);
  console.log();

  // 패치 목록 출력
  console.log('2. 혜진 패치 목록:');
  console.log('-'.repeat(70));
  for (const patch of hyejinData.patchHistory.slice(0, 10)) {
    console.log(
      `   패치 ${patch.patchId} (${patch.patchVersion}) - ${patch.patchDate} - ${patch.changes.length}개 변경`
    );
  }
  if (hyejinData.patchHistory.length > 10) {
    console.log(`   ... 외 ${hyejinData.patchHistory.length - 10}개`);
  }
  console.log();

  // 브라우저 시작
  console.log('3. 브라우저 시작...');
  const browser: Browser = await puppeteer.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setCookie({ name: 'locale', value: 'ko_KR', domain: 'playeternalreturn.com' });
  console.log();

  // 4. 패치별 검증
  console.log('4. 패치별 상세 검증:');
  console.log('='.repeat(70));

  const results: Array<{
    patchId: number;
    patchVersion: string;
    dbChangesCount: number;
    webChangesCount: number;
    matched: number;
    missing: ParsedChange[];
    extra: Change[];
    structure: PatchStructure;
  }> = [];

  const structures: PatchStructure[] = [];
  let regularCount = 0;
  let hotfixCount = 0;

  for (const patch of hyejinData.patchHistory) {
    console.log(`\n패치 ${patch.patchId} (${patch.patchVersion}) 검증 중...`);
    console.log(`   DB 변경사항: ${patch.changes.length}개`);

    const { changes, structure, rawSection } = await parseCharacterSection(
      page,
      patch.patchId,
      '혜진'
    );
    structure.patchVersion = patch.patchVersion;
    structures.push(structure);

    if (structure.isHotfix) hotfixCount++;
    else regularCount++;

    console.log(
      `   구조: ${structure.structure} (h5: ${structure.h5Found}, 캐릭터: ${structure.characterFound})`
    );
    console.log(`   웹 변경사항: ${changes.length}개`);

    const { missing, extra, matched } = compareChanges(patch.changes, changes);

    results.push({
      patchId: patch.patchId,
      patchVersion: patch.patchVersion,
      dbChangesCount: patch.changes.length,
      webChangesCount: changes.length,
      matched,
      missing,
      extra,
      structure,
    });

    if (missing.length === 0 && extra.length === 0 && patch.changes.length === changes.length) {
      console.log(`   ✅ 완전 일치`);
    } else {
      console.log(`   ⚠️ 불일치 발견`);
      if (missing.length > 0) {
        console.log(`      누락 (웹에 있지만 DB에 없음): ${missing.length}개`);
        for (const m of missing.slice(0, 3)) {
          if (m.stat) {
            console.log(`        - [${m.target}] ${m.stat}: ${m.before} → ${m.after}`);
          } else {
            console.log(`        - [${m.target}] ${m.description?.slice(0, 40)}...`);
          }
        }
        if (missing.length > 3) {
          console.log(`        ... 외 ${missing.length - 3}개`);
        }
      }
      if (extra.length > 0) {
        console.log(`      초과 (DB에 있지만 웹에 없음): ${extra.length}개`);
        for (const e of extra.slice(0, 3)) {
          if (e.stat) {
            console.log(`        - [${e.target}] ${e.stat}: ${e.before} → ${e.after}`);
          } else if (e.description) {
            console.log(`        - [${e.target}] ${e.description?.slice(0, 40)}...`);
          }
        }
        if (extra.length > 3) {
          console.log(`        ... 외 ${extra.length - 3}개`);
        }
      }
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  await browser.close();

  // 5. 결과 요약
  console.log('\n\n' + '='.repeat(70));
  console.log('검증 결과 요약');
  console.log('='.repeat(70));

  const totalPatches = results.length;
  const matchedPatches = results.filter(
    (r) => r.missing.length === 0 && r.extra.length === 0
  ).length;
  const discrepancyPatches = results.filter((r) => r.missing.length > 0 || r.extra.length > 0);

  console.log(`\n총 패치: ${totalPatches}개`);
  console.log(`  - 정규 패치: ${regularCount}개`);
  console.log(`  - 핫픽스: ${hotfixCount}개`);
  console.log(`완전 일치: ${matchedPatches}개`);
  console.log(`불일치: ${discrepancyPatches.length}개`);

  if (discrepancyPatches.length > 0) {
    console.log('\n불일치 패치 상세:');
    console.log('-'.repeat(70));
    for (const d of discrepancyPatches) {
      console.log(
        `  패치 ${d.patchId} (${d.patchVersion}): DB ${d.dbChangesCount}개 vs 웹 ${d.webChangesCount}개`
      );
      console.log(
        `    구조: ${d.structure.structure}, 누락: ${d.missing.length}개, 초과: ${d.extra.length}개`
      );
    }
  }

  // 6. 구조 분석 결과
  console.log('\n\n' + '='.repeat(70));
  console.log('패치 구조 분석');
  console.log('='.repeat(70));

  const structureTypes = new Map<string, number>();
  for (const s of structures) {
    const type = s.structure;
    structureTypes.set(type, (structureTypes.get(type) || 0) + 1);
  }

  console.log('\n구조 유형별 분포:');
  for (const [type, count] of structureTypes) {
    console.log(`  - ${type}: ${count}개`);
  }

  // 7. 결과 저장
  const output = {
    timestamp: new Date().toISOString(),
    character: '혜진',
    summary: {
      totalPatches,
      matchedPatches,
      discrepancyPatches: discrepancyPatches.length,
      regularPatches: regularCount,
      hotfixPatches: hotfixCount,
      structureTypes: Object.fromEntries(structureTypes),
    },
    details: results,
    structures,
  };

  const outputPath = 'scripts/hyejin-verification-result.json';
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n결과가 ${outputPath}에 저장되었습니다.`);
}

main().catch(console.error);
