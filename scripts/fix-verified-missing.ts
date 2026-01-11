/**
 * 전체 검증 후 발견된 누락 패치 수정 스크립트
 * - verify-all-characters.ts 결과 기반
 * - 이전에 가격 조정/버그 수정으로 확인된 항목 제외
 *
 * 사용법:
 *   npx tsx scripts/fix-verified-missing.ts --dry-run     # 미리보기
 *   npx tsx scripts/fix-verified-missing.ts               # 실제 실행
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin.js';

// ============================================
// 타입 정의
// ============================================

type ChangeType = 'buff' | 'nerf' | 'mixed';
type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';

type NumericChange = {
  target: string;
  stat: string;
  before: string;
  after: string;
  changeType: ChangeType;
  changeCategory: 'numeric';
};

type DescriptionChange = {
  target: string;
  description: string;
  changeType: ChangeType;
  changeCategory: 'mechanic' | 'added' | 'removed' | 'unknown';
};

type Change = NumericChange | DescriptionChange;

type PatchEntry = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  overallChange: ChangeType;
  streak: number;
  devComment: string | null;
  changes: Change[];
};

type CharacterStats = {
  totalPatches: number;
  buffCount: number;
  nerfCount: number;
  mixedCount: number;
  currentStreak: {
    type: ChangeType | null;
    count: number;
  };
  maxBuffStreak: number;
  maxNerfStreak: number;
};

type CharacterData = {
  name: string;
  nameEn?: string;
  stats: CharacterStats;
  patchHistory: PatchEntry[];
};

// ============================================
// 누락 목록 (검증 결과 기반, 가격조정/버그수정 제외)
// ============================================

// 제외된 항목 (이전 작업에서 가격 조정/버그 수정으로 확인됨):
// - 3242 (미르카, 히스이) - 가격 조정만
// - 3149 (테오도르) - 버그 수정만
// - 3098 (리 다이린) - 쿨다운 계산 로직 설명만
// - 2765 (다르코) - 가격 조정 + 버그 수정만
// - 2592 (버니스, 에키온) - 버그 수정만
// - 2364, 2237 (알론소) - 가격 조정만
// - 2331 (레니) - 가격 조정만
// - 2188 (클로에) - 버그 수정만
// - 2102 (아르다 첫번째) - 가격 조정만
// - 1900 (이안) - 변경 없음 (오탐지)
// - 1812 (바냐, 테오도르) - 가격 조정만

const MISSING_PATCHES: Array<{ patchId: number; characters: string[] }> = [
  // 패치 3055 - 8.7 밸런스 (26개 캐릭터)
  {
    patchId: 3055,
    characters: [
      '나딘',
      '니아',
      '니키',
      '다니엘',
      '르노어',
      '리 다이린',
      '리오',
      '버니스',
      '쇼이치',
      '시셀라',
      '아디나',
      '아이솔',
      '알론소',
      '얀',
      '에스텔',
      '에키온',
      '엘레나',
      '요한',
      '윌리엄',
      '유민',
      '유키',
      '재키',
      '캐시',
      '케네스',
      '헤이즈',
      '헨리',
    ],
  },
  // 패치 1931 - 1.22b 핫픽스 (9개 캐릭터)
  {
    patchId: 1931,
    characters: [
      '매그너스',
      '아르다',
      '얀',
      '에이든',
      '엘레나',
      '이바',
      '츠바메',
      '카티야',
      '캐시',
    ],
  },
  // 패치 3098 - 새로 발견 (요한, 피오라)
  { patchId: 3098, characters: ['요한', '피오라'] },
  // 패치 3085 - 새로 발견
  { patchId: 3085, characters: ['에이든'] },
  // 패치 2524 - 새로 발견
  { patchId: 2524, characters: ['유스티나', '히스이'] },
  // 패치 2220 - 새로 발견
  { patchId: 2220, characters: ['아드리아나'] },
  // 패치 2114 - 새로 발견
  { patchId: 2114, characters: ['샬럿'] },
  // 패치 1973 - 새로 발견 (다르코)
  { patchId: 1973, characters: ['다르코'] },
  // 패치 1727 - 시셀라, 아이작 (테오도르는 버그 수정으로 제외)
  { patchId: 1727, characters: ['시셀라', '아이작'] },
  // 패치 1654 - 새로 발견
  { patchId: 1654, characters: ['아이작', '타지아'] },
  // 패치 1586 - 새로 발견
  { patchId: 1586, characters: ['타지아'] },
  // 패치 1582 - 새로 발견
  { patchId: 1582, characters: ['아이작'] },
  // 패치 1480 - 새로 발견
  { patchId: 1480, characters: ['헤이즈'] },
  // 패치 1468 - 새로 발견
  { patchId: 1468, characters: ['재키'] },
  // 패치 1447 - 새로 발견
  { patchId: 1447, characters: ['얀'] },
  // 패치 1376 - 새로 발견
  { patchId: 1376, characters: ['버니스'] },
];

// ============================================
// 유틸리티 함수
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
  '선 딜레이',
  '후 딜레이',
  '스태미나',
];

function cleanHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function findFirstNumberIndexOutsideParens(str: string): number {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && /\d/.test(char)) return i;
  }
  return -1;
}

function startsWithNumber(str: string): boolean {
  return /^\d/.test(str.trim());
}

function splitAtFirstNumber(str: string): { prefix: string; value: string } {
  const cleaned = cleanHtmlEntities(str);
  const numIndex = findFirstNumberIndexOutsideParens(cleaned);
  if (numIndex <= 0) return { prefix: '', value: cleaned };
  return {
    prefix: cleaned.slice(0, numIndex).trim(),
    value: cleaned.slice(numIndex).trim(),
  };
}

function determineChangeCategory(before: string, after: string): ChangeCategory {
  const beforeClean = cleanHtmlEntities(before).toLowerCase();
  const afterClean = cleanHtmlEntities(after).toLowerCase();

  if (!beforeClean || beforeClean === '없음' || beforeClean === '-' || beforeClean === 'x') {
    return 'added';
  }
  if (!afterClean || afterClean === '삭제' || afterClean === '없음' || afterClean === '-') {
    return 'removed';
  }

  const beforeStartsNum = startsWithNumber(before);
  const afterStartsNum = startsWithNumber(after);

  if (beforeStartsNum && afterStartsNum) return 'numeric';
  if (!beforeStartsNum && !afterStartsNum) return 'mechanic';
  return 'unknown';
}

function processChange(
  stat: string,
  before: string,
  after: string
): { stat: string; before: string; after: string; changeCategory: ChangeCategory } {
  stat = cleanHtmlEntities(stat);
  before = cleanHtmlEntities(before);
  after = cleanHtmlEntities(after);

  const beforeSplit = splitAtFirstNumber(before);
  const afterSplit = splitAtFirstNumber(after);

  let newStat = stat;
  let newBefore = before;
  let newAfter = after;

  if (beforeSplit.prefix) {
    newStat = (stat + ' ' + beforeSplit.prefix).trim();
    newBefore = beforeSplit.value;
  }

  if (afterSplit.prefix && afterSplit.value) {
    newAfter = afterSplit.value;
  }

  const changeCategory = determineChangeCategory(newBefore, newAfter);

  return { stat: newStat, before: newBefore, after: newAfter, changeCategory };
}

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

function calculateStats(patchHistory: PatchEntry[]): CharacterStats {
  const stats: CharacterStats = {
    totalPatches: patchHistory.length,
    buffCount: 0,
    nerfCount: 0,
    mixedCount: 0,
    currentStreak: { type: null, count: 0 },
    maxBuffStreak: 0,
    maxNerfStreak: 0,
  };

  if (patchHistory.length === 0) return stats;

  const chronological = [...patchHistory].reverse();
  let currentStreakType: ChangeType | null = null;
  let currentStreakCount = 0;

  for (const patch of chronological) {
    if (patch.overallChange === 'buff') stats.buffCount++;
    else if (patch.overallChange === 'nerf') stats.nerfCount++;
    else stats.mixedCount++;

    if (patch.overallChange === 'buff' || patch.overallChange === 'nerf') {
      if (currentStreakType === patch.overallChange) {
        currentStreakCount++;
      } else {
        if (currentStreakType === 'buff') {
          stats.maxBuffStreak = Math.max(stats.maxBuffStreak, currentStreakCount);
        } else if (currentStreakType === 'nerf') {
          stats.maxNerfStreak = Math.max(stats.maxNerfStreak, currentStreakCount);
        }
        currentStreakType = patch.overallChange;
        currentStreakCount = 1;
      }
    }
  }

  if (currentStreakType === 'buff') {
    stats.maxBuffStreak = Math.max(stats.maxBuffStreak, currentStreakCount);
  } else if (currentStreakType === 'nerf') {
    stats.maxNerfStreak = Math.max(stats.maxNerfStreak, currentStreakCount);
  }

  stats.currentStreak.type = currentStreakType;
  stats.currentStreak.count = currentStreakCount;

  return stats;
}

function calculateStreaks(patchHistory: PatchEntry[]): PatchEntry[] {
  const chronological = [...patchHistory].reverse();
  const result: PatchEntry[] = [];

  let currentStreakType: ChangeType | null = null;
  let currentStreakCount = 0;

  for (const patch of chronological) {
    if (patch.overallChange === 'buff' || patch.overallChange === 'nerf') {
      if (currentStreakType === patch.overallChange) {
        currentStreakCount++;
      } else {
        currentStreakType = patch.overallChange;
        currentStreakCount = 1;
      }
      result.push({ ...patch, streak: currentStreakCount });
    } else {
      result.push({ ...patch, streak: 1 });
    }
  }

  return result.reverse();
}

function extractPatchVersion(title: string): string {
  const versionMatch = title.match(/(?:^|\s|-)(\d{1,2}\.\d{1,2}[a-z]?)(?:\s|$|-|패치)/i);
  if (versionMatch) return versionMatch[1];
  const hotfixMatch = title.match(/(\d+\.\d+[a-z]?)\s*핫픽스/i);
  if (hotfixMatch) return hotfixMatch[1];
  return title;
}

// ============================================
// 개선된 파싱 로직
// ============================================

type ParsedCharacter = {
  name: string;
  devComment: string | null;
  changes: Change[];
};

async function parseCharacterImproved(
  page: Page,
  patchId: number,
  targetCharacter: string
): Promise<ParsedCharacter | null> {
  const url = `https://playeternalreturn.com/posts/news/${patchId}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const result = await page.evaluate((targetChar: string) => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) return null;

      // 실험체 섹션 찾기
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

      if (!characterSectionStart) return null;

      const allElements = Array.from(content.children).filter(
        (el) => el.tagName === 'P' || el.tagName === 'UL' || el.tagName === 'H5'
      );

      let inCharacterSection = false;
      let foundTarget = false;
      let currentTarget = '기본 스탯';
      const devCommentLines: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const changes: any[] = [];

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

        // P 태그에서 캐릭터명 찾기 - 개선된 로직
        if (el.tagName === 'P') {
          const strong = el.querySelector('span > strong');
          if (strong) {
            const strongText = strong.textContent?.trim() || '';

            // 개선: spanText === strongText 조건 제거, strong 텍스트만 확인
            if (/^[가-힣&\s]+$/.test(strongText) && strongText.length <= 10) {
              const excluded = [
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
                '파괴',
                '저항',
                '지원',
                '영웅',
                '기존',
                '변경',
                '기타',
              ];

              if (!excluded.includes(strongText)) {
                if (strongText === targetChar) {
                  foundTarget = true;
                  currentTarget = '기본 스탯';

                  // 같은 P 태그 내에 설명이 있으면 개발자 코멘트로 수집
                  const pText = el.textContent?.trim() || '';
                  if (pText.length > strongText.length + 5) {
                    const commentPart = pText.replace(strongText, '').trim();
                    if (commentPart && !commentPart.includes('→') && commentPart.length > 10) {
                      devCommentLines.push(commentPart);
                    }
                  }
                  continue;
                } else if (foundTarget) {
                  // 다음 캐릭터 시작 -> 종료
                  break;
                }
              }
            }
          }

          // 개발자 코멘트 수집 (별도 P 태그)
          if (foundTarget) {
            const text = el.textContent?.trim() || '';
            if (
              text &&
              !text.includes('→') &&
              text.length > 15 &&
              !/^[^(]+\([QWERP]\)/.test(text) &&
              !/^[^(]+\(패시브\)/.test(text) &&
              !/^\d/.test(text)
            ) {
              devCommentLines.push(text);
            }
          }
        }

        // UL 요소 처리
        if (el.tagName === 'UL' && foundTarget) {
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
                /^[^(→]+\(패시브\)$/.test(headerText);

              if (!isSkillHeader) {
                if (headerText.includes('→')) {
                  const numMatch = headerText.match(numericPattern);
                  if (numMatch) {
                    changes.push({
                      _type: 'numeric',
                      target: currentTarget,
                      stat: numMatch[1].trim(),
                      before: numMatch[2].trim(),
                      after: numMatch[3].trim(),
                    });
                  }
                } else if (headerText.length > 10) {
                  changes.push({
                    _type: 'description',
                    target: currentTarget,
                    description: headerText,
                    isNew: headerText.includes('(신규)') || /신규[^가-힣]/.test(headerText),
                    isRemoved: headerText.includes('(삭제)') || headerText.includes('삭제됩니다'),
                  });
                }
              }
            }

            // 자손 li에서 변경사항 추출
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
                  /^[^(→]+\(패시브\)$/.test(descText);

                if (!isDescSkillHeader) {
                  if (descText.includes('→')) {
                    const descNumMatch = descText.match(numericPattern);
                    if (descNumMatch) {
                      changes.push({
                        _type: 'numeric',
                        target: currentTarget,
                        stat: descNumMatch[1].trim(),
                        before: descNumMatch[2].trim(),
                        after: descNumMatch[3].trim(),
                      });
                    }
                  } else if (descText.length > 10) {
                    changes.push({
                      _type: 'description',
                      target: currentTarget,
                      description: descText,
                      isNew: descText.includes('(신규)') || /신규[^가-힣]/.test(descText),
                      isRemoved: descText.includes('(삭제)') || descText.includes('삭제됩니다'),
                    });
                  }
                }
              }
            }
          }
        }

        // UL > LI > P 구조 (핫픽스)
        if (el.tagName === 'UL' && !foundTarget) {
          const topLevelLis = el.querySelectorAll(':scope > li');
          for (const li of Array.from(topLevelLis)) {
            const firstP = li.querySelector(':scope > p');
            if (firstP) {
              const strong = firstP.querySelector('span > strong');
              if (strong) {
                const strongText = strong.textContent?.trim() || '';

                if (strongText === targetChar) {
                  foundTarget = true;
                  currentTarget = '기본 스탯';

                  // 같은 P 태그 내에 설명이 있으면
                  const pText = firstP.textContent?.trim() || '';
                  if (pText.length > strongText.length + 5) {
                    const commentPart = pText.replace(strongText, '').trim();
                    if (commentPart && !commentPart.includes('→') && commentPart.length > 10) {
                      devCommentLines.push(commentPart);
                    }
                  }

                  // 이 LI의 하위 UL에서 변경사항 파싱
                  const nestedUl = li.querySelector(':scope > ul');
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
                              changes.push({
                                _type: 'numeric',
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
                  break;
                }
              }
            }
          }
        }
      }

      if (!foundTarget) return null;

      return {
        name: targetChar,
        devComment: devCommentLines.length > 0 ? devCommentLines.join(' ') : null,
        changes,
      };
    }, targetCharacter);

    if (!result) return null;

    // 변경사항 처리
    const processedChanges: Change[] = result.changes.map((change): Change => {
      if (change._type === 'description') {
        let category: ChangeCategory = 'mechanic';
        if (change.isNew) category = 'added';
        else if (change.isRemoved) category = 'removed';
        return {
          target: change.target,
          description: change.description,
          changeType: 'mixed',
          changeCategory: category,
        } as DescriptionChange;
      } else {
        const processed = processChange(change.stat, change.before, change.after);
        return {
          target: change.target,
          stat: processed.stat,
          before: processed.before,
          after: processed.after,
          changeType: determineChangeType(processed.stat, processed.before, processed.after),
          changeCategory: 'numeric',
        } as NumericChange;
      }
    });

    return {
      name: result.name,
      devComment: result.devComment,
      changes: processedChanges,
    };
  } catch (error) {
    console.error(`  파싱 오류 (패치 ${patchId}, ${targetCharacter}):`, error);
    return null;
  }
}

// ============================================
// Firebase 로드/저장
// ============================================

async function loadExistingCharacters(): Promise<Record<string, CharacterData>> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('characters').get();
  const characters: Record<string, CharacterData> = {};

  snapshot.forEach((doc) => {
    const data = doc.data() as CharacterData;
    characters[data.name] = data;
  });

  return characters;
}

async function loadPatchNotes(): Promise<Map<number, { title: string; date: string }>> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('patchNotes').get();
  const patchNotes = new Map<number, { title: string; date: string }>();

  snapshot.forEach((doc) => {
    const data = doc.data();
    patchNotes.set(data.id, {
      title: data.title,
      date: data.createdAt?.split('T')[0] || '',
    });
  });

  return patchNotes;
}

async function saveCharacter(name: string, data: CharacterData): Promise<void> {
  const db = initFirebaseAdmin();
  await db.collection('characters').doc(name).set(data);
}

// ============================================
// 메인 함수
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('누락 패치 데이터 수정 시작...\n');
  if (dryRun) {
    console.log('*** DRY RUN 모드 - 실제 저장하지 않음 ***\n');
  }

  // 총 항목 수 계산
  const totalItems = MISSING_PATCHES.reduce((acc, p) => acc + p.characters.length, 0);
  console.log(`수정 대상: ${totalItems}개 항목 (${MISSING_PATCHES.length}개 패치)\n`);

  // Firebase 데이터 로드
  console.log('Firebase에서 데이터 로드 중...');
  const characterMap = await loadExistingCharacters();
  const patchNotes = await loadPatchNotes();
  console.log(`  - ${Object.keys(characterMap).length}명의 캐릭터 로드됨`);
  console.log(`  - ${patchNotes.size}개의 패치노트 로드됨\n`);

  // 브라우저 시작
  console.log('브라우저 시작...');
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

  const fixedItems: Array<{
    patchId: number;
    character: string;
    changes: number;
    overallChange: ChangeType;
  }> = [];
  const failedItems: Array<{ patchId: number; character: string; reason: string }> = [];
  const skippedItems: Array<{ patchId: number; character: string; reason: string }> = [];
  const modifiedCharacters = new Set<string>();

  // 패치별로 처리
  let patchIndex = 0;
  for (const { patchId, characters } of MISSING_PATCHES) {
    patchIndex++;
    const patchInfo = patchNotes.get(patchId);
    const title = patchInfo?.title || `패치 ${patchId}`;
    const date = patchInfo?.date || '';

    const progress = `[${patchIndex}/${MISSING_PATCHES.length}]`;
    console.log(`\n${progress} 패치 ${patchId} (${title}) 처리 중...`);

    for (const charName of characters) {
      console.log(`  - ${charName} 파싱 중...`);

      // 이미 해당 패치가 있는지 확인
      if (characterMap[charName]?.patchHistory?.some((p) => p.patchId === patchId)) {
        console.log(`    스킵: 이미 존재함`);
        skippedItems.push({ patchId, character: charName, reason: '이미 존재' });
        continue;
      }

      const parsed = await parseCharacterImproved(page, patchId, charName);

      if (!parsed) {
        console.log(`    실패: 캐릭터를 찾을 수 없음`);
        failedItems.push({ patchId, character: charName, reason: '캐릭터를 찾을 수 없음' });
        continue;
      }

      if (parsed.changes.length === 0) {
        console.log(`    실패: 변경사항 없음`);
        failedItems.push({ patchId, character: charName, reason: '변경사항 없음' });
        continue;
      }

      // 캐릭터 데이터 확인/생성
      if (!characterMap[charName]) {
        characterMap[charName] = {
          name: charName,
          stats: {
            totalPatches: 0,
            buffCount: 0,
            nerfCount: 0,
            mixedCount: 0,
            currentStreak: { type: null, count: 0 },
            maxBuffStreak: 0,
            maxNerfStreak: 0,
          },
          patchHistory: [],
        };
      }

      const patchVersion = extractPatchVersion(title);
      const overallChange = determineOverallChange(parsed.changes);

      const newPatchEntry: PatchEntry = {
        patchId,
        patchVersion,
        patchDate: date,
        overallChange,
        streak: 0,
        devComment: parsed.devComment,
        changes: parsed.changes,
      };

      characterMap[charName].patchHistory.push(newPatchEntry);
      modifiedCharacters.add(charName);

      console.log(`    성공: ${parsed.changes.length}개 변경사항 (${overallChange})`);
      fixedItems.push({
        patchId,
        character: charName,
        changes: parsed.changes.length,
        overallChange,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await browser.close();

  // 수정된 캐릭터 통계 재계산 및 저장
  if (!dryRun && modifiedCharacters.size > 0) {
    console.log(`\n${modifiedCharacters.size}명의 캐릭터 통계 재계산 및 저장 중...`);

    for (const charName of modifiedCharacters) {
      const char = characterMap[charName];

      // 날짜순 정렬
      char.patchHistory.sort(
        (a, b) => new Date(b.patchDate).getTime() - new Date(a.patchDate).getTime()
      );

      // streak 재계산
      char.patchHistory = calculateStreaks(char.patchHistory);

      // stats 재계산
      char.stats = calculateStats(char.patchHistory);

      // Firebase에 저장
      await saveCharacter(charName, char);
      console.log(`  - ${charName} 저장 완료 (총 ${char.patchHistory.length}개 패치)`);
    }
  }

  // 결과 출력
  console.log('\n' + '='.repeat(60));
  console.log('수정 완료');
  console.log('='.repeat(60));
  console.log(`성공: ${fixedItems.length}개`);
  console.log(`스킵 (이미 존재): ${skippedItems.length}개`);
  console.log(`실패: ${failedItems.length}개`);

  if (fixedItems.length > 0) {
    console.log('\n=== 추가된 항목 ===');
    for (const item of fixedItems) {
      console.log(
        `  패치 ${item.patchId} - ${item.character}: ${item.changes}개 변경사항 (${item.overallChange})`
      );
    }
  }

  if (failedItems.length > 0) {
    console.log('\n=== 실패한 항목 (수동 확인 필요) ===');
    for (const item of failedItems) {
      console.log(`  패치 ${item.patchId} - ${item.character}: ${item.reason}`);
    }
  }

  if (dryRun) {
    console.log('\n*** DRY RUN 완료 - 실제 저장되지 않음 ***');
  }
}

main().catch(console.error);
