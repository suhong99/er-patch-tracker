/**
 * 전체 실험체 패치 데이터 검증 스크립트
 *
 * 사용법:
 *   npx tsx scripts/verify-all-patches.ts                       # 전체 실험체
 *   npx tsx scripts/verify-all-patches.ts --character=혜진      # 특정 실험체
 *   npx tsx scripts/verify-all-patches.ts --limit=10            # 처음 10개 캐릭터
 *   npx tsx scripts/verify-all-patches.ts --offset=10 --limit=5 # 11~15번째 캐릭터
 *
 * 검증 방식:
 * - stat + before + after를 이어붙여 정규화 비교
 * - 파싱 차이는 무시하고 진짜 데이터 불일치만 감지
 * - 웹에서 캐릭터를 못 찾은 경우 별도 기록 (수동 확인 필요)
 * - 캐릭터는 이름순(가나다)으로 정렬됨
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

interface VerificationResult {
  character: string;
  patchId: number;
  patchVersion: string;
  dbCount: number;
  webCount: number;
  missing: ParsedChange[];
  extra: Change[];
  status: 'match' | 'mismatch' | 'not_found';
}

// ============================================
// 비교 함수
// ============================================

function normalizeChange(c: {
  target?: string;
  stat?: string;
  before?: string;
  after?: string;
  description?: string;
}): string {
  if (c.stat) {
    const combined = `${c.target || ''}${c.stat || ''}${c.before || ''}${c.after || ''}`;
    return combined
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[():,]/g, '');
  }
  if (c.description) {
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
): { missing: ParsedChange[]; extra: Change[]; matched: number } {
  const dbNormalized = dbChanges.map((c) => normalizeChange(c));
  const webNormalized = webChanges.map((c) => normalizeChange(c));

  const missing = webChanges.filter((_, i) => !dbNormalized.includes(webNormalized[i]));
  const extra = dbChanges.filter((_, i) => !webNormalized.includes(dbNormalized[i]));
  const matched = webChanges.length - missing.length;

  return { missing, extra, matched };
}

// ============================================
// 웹 파싱 함수
// ============================================

async function parseCharacterFromPatch(
  page: Page,
  patchId: number,
  characterName: string
): Promise<{ changes: ParsedChange[]; found: boolean; sectionFound: boolean }> {
  const url = `https://playeternalreturn.com/posts/news/${patchId}?hl=ko-KR`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1000));

    const result = await page.evaluate((charName: string) => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) {
        return {
          changes: [] as Array<{
            target: string;
            stat?: string;
            before?: string;
            after?: string;
            description?: string;
          }>,
          found: false,
          sectionFound: false,
        };
      }

      // h5 요소들 수집
      const h5Elements = content.querySelectorAll('h5');

      // "실험체" 포함된 모든 h5 섹션 찾기
      const characterSections: Array<{ start: Element; end: Element | null }> = [];
      for (let i = 0; i < h5Elements.length; i++) {
        const text = h5Elements[i].textContent?.trim() || '';
        if (text.includes('실험체') || text.includes('Character')) {
          characterSections.push({
            start: h5Elements[i],
            end: i + 1 < h5Elements.length ? h5Elements[i + 1] : null,
          });
        }
      }

      if (characterSections.length === 0) {
        return {
          changes: [] as Array<{
            target: string;
            stat?: string;
            before?: string;
            after?: string;
            description?: string;
          }>,
          found: false,
          sectionFound: false,
        };
      }

      const allElements = Array.from(content.children);
      const numericPattern = /^(.+?)\s+([^\s→]+(?:\([^)]*\))?(?:[^→]*?))\s*→\s*(.+)$/;

      // 각 실험체 섹션을 순회하며 캐릭터 찾기
      for (const section of characterSections) {
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

        // 이 섹션에서 캐릭터 이름 존재 여부 확인
        let hasCharacter = false;
        for (const el of sectionElements) {
          if (el.tagName === 'P') {
            const strong = el.querySelector('span > strong');
            if (strong) {
              const strongText = strong.textContent?.trim() || '';
              const span = el.querySelector('span');
              const spanText = span?.textContent?.trim() || '';

              // 조건1: span 전체가 strong과 같음
              // 조건2: strong 뒤가 <br> 또는 끝
              const nextSibling = strong.nextSibling;
              const isFollowedByBrOrEnd =
                !nextSibling ||
                (nextSibling.nodeType === 1 && (nextSibling as Element).tagName === 'BR') ||
                (nextSibling.nodeType === 3 && nextSibling.textContent?.trim() === '');

              const isCharacterName =
                /^[가-힣&\s]+$/.test(strongText) &&
                (spanText === strongText || isFollowedByBrOrEnd);

              if (isCharacterName && strongText === charName) {
                hasCharacter = true;
                break;
              }
            }
          }
        }

        if (!hasCharacter) {
          continue; // 다음 섹션 검사
        }

        // 캐릭터 변경사항 파싱
        type RawChange = {
          target: string;
          stat?: string;
          before?: string;
          after?: string;
          description?: string;
        };
        const charChanges: RawChange[] = [];
        let currentTarget = '기본 스탯';
        let isCollecting = false;

        for (const el of sectionElements) {
          // P 태그에서 캐릭터 이름 찾기
          if (el.tagName === 'P') {
            const strong = el.querySelector('span > strong');
            if (strong) {
              const strongText = strong.textContent?.trim() || '';
              const span = el.querySelector('span');
              const spanText = span?.textContent?.trim() || '';

              // 조건1: span 전체가 strong과 같음
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
                if (isCollecting) break;
                if (strongText === charName) {
                  isCollecting = true;
                  currentTarget = '기본 스탯';
                }
              }
            }
          }

          // UL 태그 처리
          if (el.tagName === 'UL' && isCollecting) {
            const topLevelLis = el.querySelectorAll(':scope > li');

            for (const topLi of Array.from(topLevelLis)) {
              const firstP = topLi.querySelector(':scope > p');

              // 핫픽스 구조 체크
              if (firstP) {
                const strong = firstP.querySelector('span > strong');
                if (strong) {
                  const strongText = strong.textContent?.trim() || '';
                  const span = firstP.querySelector('span');
                  const spanText = span?.textContent?.trim() || '';

                  if (spanText === strongText && /^[가-힣&\s]+$/.test(strongText)) {
                    if (strongText !== charName) {
                      if (isCollecting && charChanges.length > 0) break;
                      continue;
                    }
                    if (!isCollecting) {
                      isCollecting = true;
                      currentTarget = '기본 스탯';
                    }

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

              const skillMatch = headerText.match(
                /^([^→]+\((?:[가-힣A-Za-z\s-]*)?[QWERP패시브]\d?\)(?:\s*-\s*[^→]+\([QWERP]\d?\))?)/
              );

              if (skillMatch && !headerText.includes('→')) {
                currentTarget = skillMatch[0].trim();
              } else if (headerText) {
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

                  const isDescSkillHeader =
                    /^[^(→]+\([QWERP]\)$/.test(descText) ||
                    /^[^(→]+\([가-힣A-Za-z\s-]+[QWERP]\d?\)$/.test(descText) ||
                    /^[^(→]+\(패시브\)$/.test(descText);

                  if (!isDescSkillHeader) {
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
                    } else if (
                      descText.length > 10 &&
                      !descText.match(/^[^(→]+\([QWERP패시브]\)/)
                    ) {
                      charChanges.push({
                        target: currentTarget,
                        description: descText,
                      });
                    }
                  }
                }
              }
            }
          }

          // 다음 캐릭터 나오면 중단
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

        // 캐릭터를 찾았으면 반환
        return { changes: charChanges, found: true, sectionFound: true };
      }

      // 모든 섹션 검사 후에도 못 찾음
      return {
        changes: [] as Array<{
          target: string;
          stat?: string;
          before?: string;
          after?: string;
          description?: string;
        }>,
        found: false,
        sectionFound: true,
      };
    }, characterName);

    return result;
  } catch (error) {
    console.error(`  파싱 오류 (패치 ${patchId}):`, error);
    return { changes: [], found: false, sectionFound: false };
  }
}

// ============================================
// 메인 함수
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const characterArg = args.find((a) => a.startsWith('--character='))?.split('=')[1];
  const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const offsetArg = args.find((a) => a.startsWith('--offset='))?.split('=')[1];
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;
  const offset = offsetArg ? parseInt(offsetArg, 10) : 0;

  console.log('='.repeat(70));
  console.log('전체 실험체 패치 데이터 검증');
  console.log('='.repeat(70));
  console.log();

  const db = initFirebaseAdmin();

  // Firebase에서 캐릭터 데이터 로드
  console.log('Firebase에서 캐릭터 데이터 로드 중...');
  const characterSnapshot = await db.collection('characters').get();
  let characters: CharacterData[] = [];

  characterSnapshot.forEach((doc) => {
    characters.push(doc.data() as CharacterData);
  });

  // 이름순 정렬 (일관된 순서 보장)
  characters.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  // 필터링
  if (characterArg) {
    characters = characters.filter((c) => c.name === characterArg);
    if (characters.length === 0) {
      console.error(`캐릭터 "${characterArg}"를 찾을 수 없습니다.`);
      return;
    }
  } else {
    // offset과 limit 적용
    if (offset > 0) {
      characters = characters.slice(offset);
    }
    if (limit) {
      characters = characters.slice(0, limit);
    }
  }

  console.log(`검증 대상: ${characters.length}개 캐릭터\n`);

  // 브라우저 시작
  const browser: Browser = await puppeteer.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setCookie({ name: 'locale', value: 'ko_KR', domain: 'playeternalreturn.com' });

  // 결과 저장
  const results: VerificationResult[] = [];
  const notFoundCases: Array<{
    character: string;
    patchId: number;
    patchVersion: string;
    dbCount: number;
  }> = [];

  let totalPatches = 0;
  let matchCount = 0;
  let mismatchCount = 0;
  let notFoundCount = 0;

  // 패치별로 그룹화하여 크롤링 최소화
  const patchCharacterMap = new Map<number, Array<{ char: CharacterData; patch: PatchEntry }>>();

  for (const char of characters) {
    for (const patch of char.patchHistory) {
      if (!patchCharacterMap.has(patch.patchId)) {
        patchCharacterMap.set(patch.patchId, []);
      }
      patchCharacterMap.get(patch.patchId)!.push({ char, patch });
      totalPatches++;
    }
  }

  const sortedPatchIds = Array.from(patchCharacterMap.keys()).sort((a, b) => b - a);
  console.log(`총 ${sortedPatchIds.length}개 패치, ${totalPatches}개 캐릭터-패치 쌍 검증\n`);

  let patchIdx = 0;
  for (const patchId of sortedPatchIds) {
    patchIdx++;
    const entries = patchCharacterMap.get(patchId)!;
    process.stdout.write(
      `\r[${patchIdx}/${sortedPatchIds.length}] 패치 ${patchId} 검증 중...          `
    );

    for (const { char, patch } of entries) {
      const {
        changes: webChanges,
        found,
        sectionFound,
      } = await parseCharacterFromPatch(page, patchId, char.name);

      if (!found && patch.changes.length > 0) {
        // 웹에서 캐릭터를 못 찾음 (수동 확인 필요)
        notFoundCount++;
        notFoundCases.push({
          character: char.name,
          patchId: patch.patchId,
          patchVersion: patch.patchVersion,
          dbCount: patch.changes.length,
        });
        results.push({
          character: char.name,
          patchId: patch.patchId,
          patchVersion: patch.patchVersion,
          dbCount: patch.changes.length,
          webCount: 0,
          missing: [],
          extra: patch.changes,
          status: 'not_found',
        });
        continue;
      }

      const { missing, extra } = compareChanges(patch.changes, webChanges);

      if (missing.length === 0 && extra.length === 0) {
        matchCount++;
        results.push({
          character: char.name,
          patchId: patch.patchId,
          patchVersion: patch.patchVersion,
          dbCount: patch.changes.length,
          webCount: webChanges.length,
          missing: [],
          extra: [],
          status: 'match',
        });
      } else {
        mismatchCount++;
        results.push({
          character: char.name,
          patchId: patch.patchId,
          patchVersion: patch.patchVersion,
          dbCount: patch.changes.length,
          webCount: webChanges.length,
          missing,
          extra,
          status: 'mismatch',
        });
      }
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  await browser.close();

  // 결과 출력
  console.log('\n\n' + '='.repeat(70));
  console.log('검증 결과 요약');
  console.log('='.repeat(70));

  console.log(`\n총 검증: ${totalPatches}개 (캐릭터-패치 쌍)`);
  console.log(`  ✅ 일치: ${matchCount}개`);
  console.log(`  ⚠️ 불일치: ${mismatchCount}개`);
  console.log(`  ❓ 미발견 (수동확인): ${notFoundCount}개`);

  // 불일치 상세
  const mismatches = results.filter((r) => r.status === 'mismatch');
  if (mismatches.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('불일치 상세 (진짜 데이터 차이)');
    console.log('-'.repeat(70));

    for (const m of mismatches.slice(0, 20)) {
      console.log(
        `\n[${m.character}] 패치 ${m.patchId} (${m.patchVersion}): DB ${m.dbCount}개 vs 웹 ${m.webCount}개`
      );
      if (m.missing.length > 0) {
        console.log(`  누락 (웹O, DB X): ${m.missing.length}개`);
        for (const item of m.missing.slice(0, 2)) {
          if (item.stat) {
            console.log(`    - [${item.target}] ${item.stat}: ${item.before} → ${item.after}`);
          } else {
            console.log(`    - [${item.target}] ${item.description?.slice(0, 40)}...`);
          }
        }
      }
      if (m.extra.length > 0) {
        console.log(`  초과 (DB O, 웹X): ${m.extra.length}개`);
        for (const item of m.extra.slice(0, 2)) {
          if (item.stat) {
            console.log(`    - [${item.target}] ${item.stat}: ${item.before} → ${item.after}`);
          } else if (item.description) {
            console.log(`    - [${item.target}] ${item.description?.slice(0, 40)}...`);
          }
        }
      }
    }
    if (mismatches.length > 20) {
      console.log(`\n... 외 ${mismatches.length - 20}개`);
    }
  }

  // 미발견 케이스
  if (notFoundCases.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('미발견 케이스 (수동 확인 필요)');
    console.log('-'.repeat(70));

    for (const nf of notFoundCases.slice(0, 10)) {
      console.log(
        `  [${nf.character}] 패치 ${nf.patchId} (${nf.patchVersion}) - DB ${nf.dbCount}개`
      );
    }
    if (notFoundCases.length > 10) {
      console.log(`  ... 외 ${notFoundCases.length - 10}개`);
    }
  }

  // 실험체별 이상 패치 ID 정리
  const issuesByCharacter = new Map<string, { mismatch: number[]; notFound: number[] }>();

  for (const r of results) {
    if (r.status === 'mismatch' || r.status === 'not_found') {
      if (!issuesByCharacter.has(r.character)) {
        issuesByCharacter.set(r.character, { mismatch: [], notFound: [] });
      }
      const entry = issuesByCharacter.get(r.character)!;
      if (r.status === 'mismatch') {
        entry.mismatch.push(r.patchId);
      } else {
        entry.notFound.push(r.patchId);
      }
    }
  }

  if (issuesByCharacter.size > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('실험체별 이상 패치 ID 목록');
    console.log('-'.repeat(70));

    for (const [char, issues] of issuesByCharacter) {
      const parts: string[] = [];
      if (issues.mismatch.length > 0) {
        parts.push(`불일치: ${issues.mismatch.join(', ')}`);
      }
      if (issues.notFound.length > 0) {
        parts.push(`미발견: ${issues.notFound.join(', ')}`);
      }
      console.log(`  [${char}] ${parts.join(' / ')}`);
    }
  }

  // 실험체별 이상 패치 요약 객체 생성
  const issuesSummary: Record<string, { mismatch: number[]; notFound: number[] }> = {};
  for (const [char, issues] of issuesByCharacter) {
    issuesSummary[char] = issues;
  }

  // 결과 저장
  const output = {
    timestamp: new Date().toISOString(),
    summary: {
      totalPatches,
      matchCount,
      mismatchCount,
      notFoundCount,
      charactersChecked: characters.length,
      offset,
      limit: limit || 'all',
    },
    issuesByCharacter: issuesSummary,
    mismatches,
    notFoundCases,
    allResults: results,
  };

  // 파일명 결정: offset/limit 있으면 범위 표시, 없으면 all
  let outputPath: string;
  if (characterArg) {
    outputPath = `data/verification-results-${characterArg}.json`;
  } else if (limit) {
    const end = offset + characters.length;
    outputPath = `data/verification-results-${offset}-${end}.json`;
  } else {
    outputPath = 'data/verification-results-all.json';
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n결과가 ${outputPath}에 저장되었습니다.`);
}

main().catch(console.error);
