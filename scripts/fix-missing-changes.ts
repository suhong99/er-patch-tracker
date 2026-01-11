/**
 * 누락된 changes 수정 스크립트
 * - integrity-results.json에서 누락 케이스 추출
 * - 해당 패치 재크롤링 후 누락된 changes 추가
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin.js';
import * as fs from 'fs';

// ============================================
// 타입 정의
// ============================================

type ChangeType = 'buff' | 'nerf' | 'mixed';
type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';

interface NumericChange {
  target: string;
  stat: string;
  before: string;
  after: string;
  changeType: ChangeType;
  changeCategory: 'numeric';
}

interface DescriptionChange {
  target: string;
  description: string;
  changeType: ChangeType;
  changeCategory: 'mechanic' | 'added' | 'removed' | 'unknown';
}

type Change = NumericChange | DescriptionChange;

interface PatchEntry {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  overallChange: ChangeType;
  streak: number;
  devComment: string | null;
  changes: Change[];
}

interface CharacterData {
  name: string;
  nameEn: string;
  stats: {
    totalPatches: number;
    buffCount: number;
    nerfCount: number;
    mixedCount: number;
    currentStreak: { type: ChangeType | null; count: number };
    maxBuffStreak: number;
    maxNerfStreak: number;
  };
  patchHistory: PatchEntry[];
}

interface ParsedChange {
  target: string;
  stat?: string;
  before?: string;
  after?: string;
  description?: string;
}

interface MissingCase {
  character: string;
  patchId: number;
  patchVersion: string;
  dbChangesCount: number;
  webChangesCount: number;
}

// ============================================
// 버프/너프 판별
// ============================================

const DECREASE_IS_BUFF = [
  '쿨다운',
  'cooldown',
  'cd',
  '마나',
  'mana',
  'sp',
  'mp',
  '소모',
  '시전',
  'cast',
  'casting',
  '딜레이',
  'delay',
  '대기',
  'wait',
  '충전',
  'charge time',
  '선딜',
  '후딜',
];

function extractNumbers(value: string): number[] {
  const matches = value.match(/[\d.]+/g);
  return matches ? matches.map(Number) : [];
}

function determineChangeType(stat: string, before: string, after: string): ChangeType {
  const statLower = stat.toLowerCase();
  const beforeNums = extractNumbers(before);
  const afterNums = extractNumbers(after);

  if (beforeNums.length === 0 || afterNums.length === 0) return 'mixed';

  const beforeAvg = beforeNums.reduce((a, b) => a + b, 0) / beforeNums.length;
  const afterAvg = afterNums.reduce((a, b) => a + b, 0) / afterNums.length;

  if (beforeAvg === afterAvg) return 'mixed';

  const isIncrease = afterAvg > beforeAvg;
  const isDecreaseBuffStat = DECREASE_IS_BUFF.some((k) => statLower.includes(k.toLowerCase()));

  if (isDecreaseBuffStat) return isIncrease ? 'nerf' : 'buff';
  return isIncrease ? 'buff' : 'nerf';
}

function determineOverallChange(changes: Change[]): ChangeType {
  const buffCount = changes.filter((c) => c.changeType === 'buff').length;
  const nerfCount = changes.filter((c) => c.changeType === 'nerf').length;

  if (buffCount > 0 && nerfCount === 0) return 'buff';
  if (nerfCount > 0 && buffCount === 0) return 'nerf';
  return 'mixed';
}

// ============================================
// 웹 파싱 함수
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

interface ParsedCharacter {
  name: string;
  devComment: string | null;
  changes: ParsedChange[];
}

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
      const results: Array<{ name: string; devComment: string | null; changes: RawChange[] }> = [];
      const allElements = Array.from(content.children).filter(
        (el) => el.tagName === 'P' || el.tagName === 'UL' || el.tagName === 'H5'
      );

      let inCharacterSection = false;
      let currentCharName = '';
      let currentDevComment: string[] = [];
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
                  results.push({
                    name: currentCharName,
                    devComment: currentDevComment.length > 0 ? currentDevComment.join(' ') : null,
                    changes: currentChanges,
                  });
                }
                currentCharName = name;
                currentDevComment = [];
                currentChanges = [];
                currentTarget = '기본 스탯';
                continue;
              }
            }
          }

          // 개발자 코멘트
          if (currentCharName) {
            const text = el.textContent?.trim() || '';
            if (
              text &&
              !text.includes('→') &&
              text.length > 10 &&
              !/^[^(]+\([QWERP]\)/.test(text) &&
              !/^[^(]+\(패시브\)/.test(text) &&
              !/^\d/.test(text)
            ) {
              currentDevComment.push(text);
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

            // 핫픽스 구조
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
                    results.push({
                      name: currentCharName,
                      devComment: currentDevComment.length > 0 ? currentDevComment.join(' ') : null,
                      changes: currentChanges,
                    });
                  }
                  currentCharName = strongText;
                  currentDevComment = [];
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

            // 스킬 헤더
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
                  currentChanges.push({ target: currentTarget, description: headerText });
                }
              }
            }

            // 하위 li
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
                    currentChanges.push({ target: currentTarget, description: descText });
                  }
                }
              }
            }
          }
        }
      }

      if (currentCharName && currentChanges.length > 0) {
        results.push({
          name: currentCharName,
          devComment: currentDevComment.length > 0 ? currentDevComment.join(' ') : null,
          changes: currentChanges,
        });
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
// 메인 함수
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('누락 데이터 수정 시작...\n');
  if (dryRun) console.log('(DRY RUN 모드 - DB 수정 없음)\n');

  // integrity-results.json 로드
  const resultsPath = 'scripts/integrity-results.json';
  if (!fs.existsSync(resultsPath)) {
    console.error(
      'integrity-results.json 파일이 없습니다. verify-patch-integrity.ts를 먼저 실행하세요.'
    );
    return;
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

  // 누락 케이스만 필터링 (webChangesCount > dbChangesCount)
  const missingCases: MissingCase[] = results.discrepancies.filter(
    (d: { webChangesCount: number; dbChangesCount: number }) => d.webChangesCount > d.dbChangesCount
  );

  console.log(`누락 케이스: ${missingCases.length}건\n`);

  if (missingCases.length === 0) {
    console.log('수정할 누락 데이터가 없습니다.');
    return;
  }

  const db = initFirebaseAdmin();

  // 브라우저 시작
  const browser: Browser = await puppeteer.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setCookie({ name: 'locale', value: 'ko_KR', domain: 'playeternalreturn.com' });

  // 패치별로 그룹화 (같은 패치 한 번만 크롤링)
  const byPatch = new Map<number, MissingCase[]>();
  for (const m of missingCases) {
    if (!byPatch.has(m.patchId)) byPatch.set(m.patchId, []);
    byPatch.get(m.patchId)!.push(m);
  }

  const patchIds = Array.from(byPatch.keys()).sort((a, b) => b - a);
  let totalFixed = 0;
  let totalAdded = 0;

  for (let i = 0; i < patchIds.length; i++) {
    const patchId = patchIds[i];
    const cases = byPatch.get(patchId)!;
    const progress = `[${i + 1}/${patchIds.length}]`;

    console.log(`${progress} 패치 ${patchId} 처리 중 (${cases.length}개 캐릭터)...`);

    // 웹에서 파싱
    const webCharacters = await parsePatchNote(page, patchId);
    const webCharMap = new Map(webCharacters.map((c) => [c.name, c]));

    for (const caseItem of cases) {
      const webChar = webCharMap.get(caseItem.character);
      if (!webChar) {
        console.log(`  - ${caseItem.character}: 웹에서 찾지 못함 (스킵)`);
        continue;
      }

      // DB에서 캐릭터 데이터 로드
      const charDoc = await db.collection('characters').doc(caseItem.character).get();
      if (!charDoc.exists) {
        console.log(`  - ${caseItem.character}: DB에서 찾지 못함 (스킵)`);
        continue;
      }

      const charData = charDoc.data() as CharacterData;
      const patchIdx = charData.patchHistory.findIndex((p) => p.patchId === patchId);

      if (patchIdx === -1) {
        console.log(`  - ${caseItem.character}: 패치 ${patchId} 기록 없음 (스킵)`);
        continue;
      }

      const dbPatch = charData.patchHistory[patchIdx];
      const dbChangesCount = dbPatch.changes.length;
      const webChangesCount = webChar.changes.length;

      if (webChangesCount <= dbChangesCount) {
        console.log(`  - ${caseItem.character}: 이미 일치 또는 웹이 더 적음 (스킵)`);
        continue;
      }

      // 웹 changes를 Change 타입으로 변환
      const newChanges: Change[] = webChar.changes.map((c) => {
        if (c.stat) {
          return {
            target: c.target,
            stat: c.stat,
            before: c.before || '',
            after: c.after || '',
            changeType: determineChangeType(c.stat, c.before || '', c.after || ''),
            changeCategory: 'numeric' as const,
          };
        } else {
          return {
            target: c.target,
            description: c.description || '',
            changeType: 'mixed' as ChangeType,
            changeCategory: 'mechanic' as const,
          };
        }
      });

      // 전체 교체 (웹 데이터로)
      charData.patchHistory[patchIdx].changes = newChanges;
      charData.patchHistory[patchIdx].overallChange = determineOverallChange(newChanges);

      if (webChar.devComment && !dbPatch.devComment) {
        charData.patchHistory[patchIdx].devComment = webChar.devComment;
      }

      const addedCount = webChangesCount - dbChangesCount;
      console.log(
        `  - ${caseItem.character}: ${dbChangesCount}개 → ${webChangesCount}개 (+${addedCount})`
      );

      if (!dryRun) {
        await db.collection('characters').doc(caseItem.character).update({
          patchHistory: charData.patchHistory,
        });
      }

      totalFixed++;
      totalAdded += addedCount;
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  await browser.close();

  console.log('\n' + '='.repeat(50));
  console.log('수정 완료');
  console.log('='.repeat(50));
  console.log(`수정된 캐릭터-패치: ${totalFixed}건`);
  console.log(`추가된 changes: ${totalAdded}개`);
  if (dryRun) console.log('\n(DRY RUN 모드였습니다. 실제 DB는 변경되지 않았습니다.)');
}

main().catch(console.error);
