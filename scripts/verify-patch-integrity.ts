/**
 * 패치 데이터 정합성 검증 스크립트
 * - DB에 저장된 changes 내용과 웹페이지 실제 내용 비교
 * - 누락된 항목, 불일치 발견
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

interface ParsedCharacter {
  name: string;
  changes: Array<{
    target: string;
    stat?: string;
    before?: string;
    after?: string;
    description?: string;
  }>;
}

interface DiscrepancyItem {
  character: string;
  patchId: number;
  patchVersion: string;
  dbChangesCount: number;
  webChangesCount: number;
  missingChanges: Array<{
    target: string;
    stat?: string;
    before?: string;
    after?: string;
    description?: string;
  }>;
  extraChanges: Change[];
}

// ============================================
// 웹 파싱 함수 (parse-balance-changes.ts 기반)
// ============================================

const VALID_CHARACTERS = new Set([
  '가넷',
  '나딘',
  '나타폰',
  '니아',
  '니키',
  '다니엘',
  '다르코',
  '데비&마를렌',
  '띠아',
  '라우라',
  '레녹스',
  '레니',
  '레온',
  '로지',
  '루크',
  '르노어',
  '리 다이린',
  '리오',
  '마르티나',
  '마이',
  '마커스',
  '매그너스',
  '미르카',
  '바냐',
  '바바라',
  '버니스',
  '블레어',
  '비앙카',
  '샬럿',
  '셀린',
  '쇼우',
  '쇼이치',
  '수아',
  '슈린',
  '시셀라',
  '실비아',
  '아델라',
  '아드리아나',
  '아디나',
  '아르다',
  '아비게일',
  '아야',
  '아이솔',
  '아이작',
  '알렉스',
  '알론소',
  '얀',
  '에스텔',
  '에이든',
  '에키온',
  '엘레나',
  '엠마',
  '요한',
  '윌리엄',
  '유민',
  '유스티나',
  '유키',
  '이렘',
  '이바',
  '이슈트반',
  '이안',
  '일레븐',
  '자히르',
  '재키',
  '제니',
  '츠바메',
  '카밀로',
  '카티야',
  '칼라',
  '캐시',
  '케네스',
  '클로에',
  '키아라',
  '타지아',
  '테오도르',
  '펠릭스',
  '프리야',
  '피오라',
  '피올로',
  '하트',
  '헤이즈',
  '헨리',
  '현우',
  '혜진',
  '히스이',
]);

async function parsePatchNote(page: Page, patchId: number): Promise<ParsedCharacter[]> {
  const url = `https://playeternalreturn.com/posts/news/${patchId}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1000));

    const characters = await page.evaluate(() => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) return [];

      const h5Elements = content.querySelectorAll('h5');
      let characterSectionStart: Element | null = null;
      let characterSectionEnd: Element | null = null;

      for (let i = 0; i < h5Elements.length; i++) {
        const text = h5Elements[i].textContent?.trim();
        if (text === '실험체') {
          characterSectionStart = h5Elements[i];
          for (let j = i + 1; j < h5Elements.length; j++) {
            const nextText = h5Elements[j].textContent?.trim();
            if (
              nextText &&
              ['무기', '아이템', '코발트 프로토콜', '론울프', '특성', '시스템'].includes(nextText)
            ) {
              characterSectionEnd = h5Elements[j];
              break;
            }
          }
          break;
        }
      }

      if (!characterSectionStart) return [];

      type RawChange = {
        target: string;
        stat?: string;
        before?: string;
        after?: string;
        description?: string;
      };

      const results: Array<{ name: string; changes: RawChange[] }> = [];
      const allElements = Array.from(content.children).filter(
        (el) => el.tagName === 'P' || el.tagName === 'UL' || el.tagName === 'H5'
      );

      let inCharacterSection = false;
      let currentCharName = '';
      let currentChanges: RawChange[] = [];
      let currentTarget = '기본 스탯';
      const numericPattern = /^(.+?)\s+([^\s→]+(?:\([^)]*\))?(?:[^→]*?))\s*→\s*(.+)$/;

      for (const el of allElements) {
        if (
          el === characterSectionStart ||
          (characterSectionStart &&
            el.compareDocumentPosition(characterSectionStart) & Node.DOCUMENT_POSITION_PRECEDING)
        ) {
          inCharacterSection = true;
        }

        if (
          characterSectionEnd &&
          (el === characterSectionEnd ||
            (el.compareDocumentPosition(characterSectionEnd) & Node.DOCUMENT_POSITION_FOLLOWING) ===
              0)
        ) {
          break;
        }

        if (!inCharacterSection) continue;

        if (el.tagName === 'P') {
          const strong = el.querySelector('span > strong');
          if (strong) {
            const name = strong.textContent?.trim() || '';
            if (
              name &&
              !['실험체', '무기', '아이템', '시스템', '특성', '코발트 프로토콜', '론울프'].includes(
                name
              )
            ) {
              const span = el.querySelector('span');
              const spanText = span?.textContent?.trim() || '';
              const strongText = strong.textContent?.trim() || '';

              if (spanText === strongText && /^[가-힣&\s]+$/.test(strongText)) {
                if (currentCharName && currentChanges.length > 0) {
                  results.push({ name: currentCharName, changes: currentChanges });
                }
                currentCharName = name;
                currentChanges = [];
                currentTarget = '기본 스탯';
                continue;
              }
            }
          }
        }

        if (el.tagName === 'UL' && currentCharName) {
          const topLevelLis = el.querySelectorAll(':scope > li');

          for (const topLi of Array.from(topLevelLis)) {
            const firstP = topLi.querySelector(':scope > p');
            let headerText = '';
            if (firstP) {
              const span = firstP.querySelector('span');
              if (span) {
                headerText = span.textContent?.replace(/\s+/g, ' ').trim() || '';
              }
            } else {
              const directSpan = topLi.querySelector(':scope > span');
              if (directSpan) {
                headerText = directSpan.textContent?.replace(/\s+/g, ' ').trim() || '';
              }
            }

            // 핫픽스 구조 체크
            if (firstP) {
              const strong = firstP.querySelector('span > strong');
              if (strong) {
                const strongText = strong.textContent?.trim() || '';
                const span = firstP.querySelector('span');
                const spanText = span?.textContent?.trim() || '';

                if (
                  spanText === strongText &&
                  /^[가-힣&\s]+$/.test(strongText) &&
                  ![
                    '실험체',
                    '무기',
                    '아이템',
                    '시스템',
                    '특성',
                    '코발트 프로토콜',
                    '론울프',
                    '옷',
                    '팔/장식',
                    '머리',
                    '다리',
                    '악세서리',
                  ].includes(strongText)
                ) {
                  if (currentCharName && currentChanges.length > 0) {
                    results.push({ name: currentCharName, changes: currentChanges });
                  }
                  currentCharName = strongText;
                  currentChanges = [];
                  currentTarget = '기본 스탯';

                  const nestedUl = topLi.querySelector(':scope > ul');
                  if (nestedUl) {
                    const nestedLis = nestedUl.querySelectorAll(':scope > li');
                    for (const nestedLi of Array.from(nestedLis)) {
                      const nestedP = nestedLi.querySelector(':scope > p');
                      if (nestedP) {
                        const nestedSpan = nestedP.querySelector('span');
                        if (nestedSpan) {
                          const nestedText =
                            nestedSpan.textContent?.replace(/\s+/g, ' ').trim() || '';
                          if (nestedText && nestedText.includes('→')) {
                            const numMatch = nestedText.match(numericPattern);
                            if (numMatch) {
                              currentChanges.push({
                                target: currentTarget,
                                stat: numMatch[1].trim(),
                                before: numMatch[2].trim(),
                                after: numMatch[3].trim(),
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
            const skillMatch = headerText.match(
              /^([^→]+\((?:[가-힣A-Za-z\s-]*)?[QWERP패시브]\d?\)(?:\s*-\s*[^→]+\([QWERP]\d?\))?)/
            );
            if (skillMatch && !headerText.includes('→')) {
              currentTarget = skillMatch[0].trim();
            } else if (headerText && headerText.length >= 5) {
              const isSkillHeader =
                /^[^(→]+\([QWERP]\)$/.test(headerText) ||
                /^[^(→]+\([가-힣A-Za-z\s-]+[QWERP]\d?\)$/.test(headerText) ||
                /^[^(→]+\(패시브\)$/.test(headerText) ||
                /^[^(→]+\([QWERP]\)\s*-\s*[^(→]+\([QWERP]\d?\)$/.test(headerText);

              if (!isSkillHeader) {
                if (headerText.includes('→')) {
                  const numMatch = headerText.match(numericPattern);
                  if (numMatch) {
                    currentChanges.push({
                      target: currentTarget,
                      stat: numMatch[1].trim(),
                      before: numMatch[2].trim(),
                      after: numMatch[3].trim(),
                    });
                  }
                } else if (headerText.length > 10) {
                  currentChanges.push({
                    target: currentTarget,
                    description: headerText,
                  });
                }
              }
            }

            // 하위 li 처리
            const allDescendantLis = topLi.querySelectorAll('li');
            for (const descLi of Array.from(allDescendantLis)) {
              const descP = descLi.querySelector(':scope > p');
              let descSpan: Element | null = null;

              if (descP) {
                descSpan = descP.querySelector('span');
              } else {
                descSpan = descLi.querySelector(':scope > span');
              }

              if (descSpan) {
                const descText = descSpan.textContent?.replace(/\s+/g, ' ').trim() || '';
                if (!descText || descText.length < 5) continue;

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
                  /^[^(→]+\(패시브\)$/.test(descText) ||
                  /^[^(→]+\([QWERP]\)\s*-\s*[^(→]+\([QWERP]\d?\)$/.test(descText);

                if (!isDescSkillHeader) {
                  if (descText.includes('→')) {
                    const descNumMatch = descText.match(numericPattern);
                    if (descNumMatch) {
                      currentChanges.push({
                        target: currentTarget,
                        stat: descNumMatch[1].trim(),
                        before: descNumMatch[2].trim(),
                        after: descNumMatch[3].trim(),
                      });
                    }
                  } else if (descText.length > 10) {
                    currentChanges.push({
                      target: currentTarget,
                      description: descText,
                    });
                  }
                }
              }
            }
          }
        }
      }

      if (currentCharName && currentChanges.length > 0) {
        results.push({ name: currentCharName, changes: currentChanges });
      }

      return results;
    });

    return characters.filter((c) => VALID_CHARACTERS.has(c.name.replace(/\s+/g, ' ').trim()));
  } catch (error) {
    console.error(`  파싱 오류 (패치 ${patchId}):`, error);
    return [];
  }
}

// ============================================
// 비교 함수
// ============================================

function normalizeString(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '').replace(/[()]/g, '');
}

function normalizeChange(change: {
  target?: string;
  stat?: string;
  before?: string;
  after?: string;
  description?: string;
}): string {
  if (change.stat) {
    return `${normalizeString(change.target || '')}|${normalizeString(change.stat)}|${normalizeString(change.before || '')}|${normalizeString(change.after || '')}`;
  }
  if (change.description) {
    return `${normalizeString(change.target || '')}|${normalizeString(change.description).slice(0, 50)}`;
  }
  return '';
}

function compareChanges(
  dbChanges: Change[],
  webChanges: Array<{
    target: string;
    stat?: string;
    before?: string;
    after?: string;
    description?: string;
  }>
): { missing: typeof webChanges; extra: Change[] } {
  const dbNormalized = dbChanges.map((c) => normalizeChange(c));
  const webNormalized = webChanges.map((c) => normalizeChange(c));

  const missing = webChanges.filter((_, i) => !dbNormalized.includes(webNormalized[i]));
  const extra = dbChanges.filter((_, i) => !webNormalized.includes(dbNormalized[i]));

  return { missing, extra };
}

// ============================================
// 메인 함수
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sampleMode = args.includes('--sample');
  const characterArg = args.find((a) => a.startsWith('--character='))?.split('=')[1];
  const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;

  console.log('패치 데이터 정합성 검증 시작...\n');

  const db = initFirebaseAdmin();

  console.log('Firebase에서 캐릭터 데이터 로드 중...');
  const characterSnapshot = await db.collection('characters').get();
  const characters: CharacterData[] = [];

  characterSnapshot.forEach((doc) => {
    const data = doc.data() as CharacterData;
    characters.push(data);
  });

  console.log(`${characters.length}개 캐릭터 로드 완료\n`);

  // 브라우저 시작
  const browser: Browser = await puppeteer.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setCookie({ name: 'locale', value: 'ko_KR', domain: 'playeternalreturn.com' });

  // 샘플 모드
  if (sampleMode || characterArg) {
    const targetChar = characterArg || '나딘';
    const char = characters.find((c) => c.name === targetChar);

    if (!char) {
      console.log(`캐릭터 "${targetChar}"를 찾을 수 없습니다.`);
      await browser.close();
      return;
    }

    console.log(`=== 샘플 검증: ${char.name} ===\n`);

    const patchesToCheck = char.patchHistory.slice(0, 5);

    for (const patch of patchesToCheck) {
      console.log(`\n패치 ${patch.patchId} (${patch.patchVersion}) 검증 중...`);
      console.log(`  DB changes: ${patch.changes.length}개`);

      const webCharacters = await parsePatchNote(page, patch.patchId);
      const webChar = webCharacters.find((c) => c.name === char.name);
      const webChanges = webChar?.changes || [];

      console.log(`  웹 changes: ${webChanges.length}개`);

      if (webChanges.length === 0 && patch.changes.length > 0) {
        console.log(`  ⚠️ 웹에서 캐릭터를 찾지 못함 (파싱 오류 가능)`);
        continue;
      }

      const { missing, extra } = compareChanges(patch.changes, webChanges);

      if (missing.length === 0 && extra.length === 0) {
        console.log(`  ✅ 일치`);
      } else {
        console.log(`  ❌ 불일치`);
        if (missing.length > 0) {
          console.log(`    누락 (웹에 있지만 DB에 없음): ${missing.length}개`);
          missing.forEach((m) => {
            if (m.stat) {
              console.log(`      - [${m.target}] ${m.stat}: ${m.before} → ${m.after}`);
            } else {
              console.log(`      - [${m.target}] ${m.description?.slice(0, 50)}...`);
            }
          });
        }
        if (extra.length > 0) {
          console.log(`    초과 (DB에 있지만 웹에 없음): ${extra.length}개`);
          extra.forEach((e) => {
            if (e.stat) {
              console.log(`      - [${e.target}] ${e.stat}: ${e.before} → ${e.after}`);
            } else if (e.description) {
              console.log(`      - [${e.target}] ${e.description?.slice(0, 50)}...`);
            }
          });
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    await browser.close();
    return;
  }

  // 전체 검증 모드
  console.log('전체 검증 모드 시작...\n');

  const discrepancies: DiscrepancyItem[] = [];
  let totalChecked = 0;
  let totalMatch = 0;
  let totalDiscrepancy = 0;
  let totalParseError = 0;

  // 모든 패치 ID 수집
  const allPatchIds = new Set<number>();
  for (const char of characters) {
    for (const patch of char.patchHistory) {
      allPatchIds.add(patch.patchId);
    }
  }

  // 패치별 캐릭터 맵
  const patchCharacterMap = new Map<number, { char: CharacterData; patch: PatchEntry }[]>();
  for (const char of characters) {
    for (const patch of char.patchHistory) {
      if (!patchCharacterMap.has(patch.patchId)) {
        patchCharacterMap.set(patch.patchId, []);
      }
      patchCharacterMap.get(patch.patchId)!.push({ char, patch });
    }
  }

  let sortedPatchIds = Array.from(allPatchIds).sort((a, b) => b - a);
  if (limit) {
    sortedPatchIds = sortedPatchIds.slice(0, limit);
  }

  console.log(`검증 대상: ${sortedPatchIds.length}개 패치\n`);

  let patchIdx = 0;
  for (const patchId of sortedPatchIds) {
    patchIdx++;
    const entries = patchCharacterMap.get(patchId)!;
    const progress = `[${patchIdx}/${sortedPatchIds.length}]`;
    process.stdout.write(
      `\r${progress} 패치 ${patchId} 검증 중 (${entries.length}개 캐릭터)...          `
    );

    // 해당 패치 한 번만 크롤링
    const webCharacters = await parsePatchNote(page, patchId);
    const webCharMap = new Map(webCharacters.map((c) => [c.name, c.changes]));

    for (const { char, patch } of entries) {
      totalChecked++;

      const webChanges = webCharMap.get(char.name) || [];

      if (webChanges.length === 0 && patch.changes.length > 0) {
        totalParseError++;
        continue;
      }

      const { missing, extra } = compareChanges(patch.changes, webChanges);

      if (missing.length === 0 && extra.length === 0) {
        totalMatch++;
      } else {
        totalDiscrepancy++;
        discrepancies.push({
          character: char.name,
          patchId: patch.patchId,
          patchVersion: patch.patchVersion,
          dbChangesCount: patch.changes.length,
          webChangesCount: webChanges.length,
          missingChanges: missing,
          extraChanges: extra,
        });
      }
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  await browser.close();

  // 결과 출력
  console.log('\n\n' + '='.repeat(70));
  console.log('검증 결과');
  console.log('='.repeat(70) + '\n');

  console.log(`총 검증: ${totalChecked}개 (캐릭터-패치 쌍)`);
  console.log(`일치: ${totalMatch}개`);
  console.log(`불일치: ${totalDiscrepancy}개`);
  console.log(`파싱 오류: ${totalParseError}개 (웹에서 캐릭터 미발견)\n`);

  if (discrepancies.length > 0) {
    console.log('-'.repeat(70));
    console.log('불일치 상세 (캐릭터별)');
    console.log('-'.repeat(70) + '\n');

    const byCharacter = new Map<string, DiscrepancyItem[]>();
    for (const d of discrepancies) {
      if (!byCharacter.has(d.character)) {
        byCharacter.set(d.character, []);
      }
      byCharacter.get(d.character)!.push(d);
    }

    for (const [char, items] of byCharacter) {
      const totalMissing = items.reduce((sum, i) => sum + i.missingChanges.length, 0);
      const totalExtra = items.reduce((sum, i) => sum + i.extraChanges.length, 0);
      console.log(
        `\n【${char}】 ${items.length}개 패치 불일치 (누락: ${totalMissing}, 초과: ${totalExtra})`
      );
      for (const item of items.slice(0, 5)) {
        console.log(
          `  - 패치 ${item.patchId}: DB ${item.dbChangesCount}개 vs 웹 ${item.webChangesCount}개`
        );
      }
      if (items.length > 5) {
        console.log(`  ... 외 ${items.length - 5}개`);
      }
    }
  }

  // JSON 저장
  const outputPath = 'scripts/integrity-results.json';
  const output = {
    timestamp: new Date().toISOString(),
    summary: {
      totalChecked,
      totalMatch,
      totalDiscrepancy,
      totalParseError,
      charactersWithDiscrepancy: new Set(discrepancies.map((d) => d.character)).size,
    },
    discrepancies,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n결과가 ${outputPath}에 저장되었습니다.`);
}

main().catch(console.error);
