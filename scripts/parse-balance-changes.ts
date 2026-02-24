import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin';
import { triggerRevalidation } from './lib/revalidate';

// ============================================
// 타입 정의
// ============================================

type ChangeType = 'buff' | 'nerf' | 'mixed';
type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';

// 수치 변경 (before → after)
type NumericChange = {
  target: string;
  stat: string;
  before: string;
  after: string;
  changeType: ChangeType;
  changeCategory: 'numeric';
};

// 설명형 변경 (기능 변경, 추가, 제거 등)
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
  nameEn: string;
  stats: CharacterStats;
  patchHistory: PatchEntry[];
};

type PatchNote = {
  id: number;
  title: string;
  link: string;
  createdAt: string;
  status?: string;
  hasCharacterData?: boolean;
  isParsed?: boolean;
};

// ============================================
// 캐릭터 이름 관련 (DB 기반)
// ============================================

// 섹션 제목 블랙리스트 (캐릭터가 아닌 것들)
const SECTION_TITLES = new Set([
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
  '신규 스킨 및 이모티콘',
  '버그 수정',
]);

// 유효한 캐릭터 목록 (DB에서 로드됨)
let validCharacters: Set<string> = new Set();

function normalizeCharacterName(name: string): string {
  return name
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidCharacter(name: string): boolean {
  const normalized = normalizeCharacterName(name);
  // 섹션 제목은 제외
  if (SECTION_TITLES.has(normalized)) return false;
  // DB에 등록된 캐릭터인지 확인
  return validCharacters.has(normalized);
}

// DB에서 캐릭터 목록 로드
async function loadValidCharacters(): Promise<Set<string>> {
  const db = initFirebaseAdmin();
  const snapshot = await db.collection('characters').get();
  const characters = new Set<string>();

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.name) {
      characters.add(data.name);
    }
  });

  console.log(`DB에서 ${characters.size}개 캐릭터 목록 로드됨`);
  return characters;
}

// 신규 실험체 패턴에서 캐릭터 이름 추출
function extractNewCharacterFromH5(text: string): string | null {
  // "신규 실험체 - 펜리르" 패턴
  const match = text.match(/^신규\s*실험체\s*[-–—]\s*(.+)$/);
  if (match) {
    return normalizeCharacterName(match[1]);
  }
  return null;
}

// 신규 캐릭터 DB 등록
async function registerNewCharacter(name: string): Promise<void> {
  const db = initFirebaseAdmin();
  const docRef = db.collection('characters').doc(name);
  const doc = await docRef.get();

  if (!doc.exists) {
    const newCharacter: CharacterData = {
      name,
      nameEn: name, // 영문명은 일단 한글명과 동일하게
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

    await docRef.set(newCharacter);
    validCharacters.add(name);
    console.log(`  ✨ 신규 실험체 "${name}" DB 등록 완료`);
  }
}

// ============================================
// stat/before/after 분리 및 changeCategory 결정
// ============================================

// 괄호를 제외하고 첫 번째 숫자가 나오는 위치 찾기
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

// 문자열이 숫자로 시작하는지 확인
function startsWithNumber(str: string): boolean {
  return /^\d/.test(str.trim());
}

// HTML 엔티티 정리
function cleanHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// 문자열에서 숫자 앞 텍스트 분리
function splitAtFirstNumber(str: string): { prefix: string; value: string } {
  const cleaned = cleanHtmlEntities(str);
  const numIndex = findFirstNumberIndexOutsideParens(cleaned);
  if (numIndex <= 0) return { prefix: '', value: cleaned };
  return {
    prefix: cleaned.slice(0, numIndex).trim(),
    value: cleaned.slice(numIndex).trim(),
  };
}

// changeCategory 결정
function determineChangeCategory(before: string, after: string): ChangeCategory {
  const beforeClean = cleanHtmlEntities(before).toLowerCase();
  const afterClean = cleanHtmlEntities(after).toLowerCase();

  // 효과 추가
  if (!beforeClean || beforeClean === '없음' || beforeClean === '-' || beforeClean === 'x') {
    return 'added';
  }
  // 효과 제거
  if (!afterClean || afterClean === '삭제' || afterClean === '없음' || afterClean === '-') {
    return 'removed';
  }

  const beforeStartsNum = startsWithNumber(before);
  const afterStartsNum = startsWithNumber(after);

  if (beforeStartsNum && afterStartsNum) return 'numeric';
  if (!beforeStartsNum && !afterStartsNum) return 'mechanic';
  return 'unknown';
}

// stat/before/after 정리 및 changeCategory 결정
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

  // before 처리
  if (beforeSplit.prefix) {
    newStat = (stat + ' ' + beforeSplit.prefix).trim();
    newBefore = beforeSplit.value;
  }

  // after 처리
  if (afterSplit.prefix && afterSplit.value) {
    newAfter = afterSplit.value;
  }

  const changeCategory = determineChangeCategory(newBefore, newAfter);

  return { stat: newStat, before: newBefore, after: newAfter, changeCategory };
}

// ============================================
// 버프/너프 판별 로직
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

const NERF_KEYWORDS = [
  'reducing',
  'reduce',
  'decreased',
  'decrease',
  'lowering',
  'lower',
  'nerfing',
  'nerf',
  'weaken',
  'weakening',
  'toning down',
  'tune down',
  'too strong',
  'very strong',
  'overperforming',
  'high win rate',
  'high pick rate',
  'dominant',
  'oppressive',
  'keep in check',
  '너프',
  '하향',
  '감소',
  '약화',
  '줄이',
  '낮추',
  '너무 강',
  '강력해서',
  '승률이 높',
  '픽률이 높',
  '지배적',
];

const BUFF_KEYWORDS = [
  'buffing',
  'buff',
  'increasing',
  'increase',
  'improving',
  'improve',
  'enhancing',
  'enhance',
  'strengthening',
  'strengthen',
  'boosting',
  'boost',
  'underperforming',
  'low win rate',
  'low pick rate',
  'weak',
  'struggling',
  'needs help',
  'giving more',
  '버프',
  '상향',
  '증가',
  '강화',
  '올리',
  '높이',
  '약해서',
  '승률이 낮',
  '픽률이 낮',
  '부족',
  '개선',
];

function extractIntentFromComment(comment: string | null): ChangeType | null {
  if (!comment) return null;
  const commentLower = comment.toLowerCase();

  const hasNerfIntent = NERF_KEYWORDS.some((k) => commentLower.includes(k.toLowerCase()));
  const hasBuffIntent = BUFF_KEYWORDS.some((k) => commentLower.includes(k.toLowerCase()));

  if (hasNerfIntent && !hasBuffIntent) return 'nerf';
  if (hasBuffIntent && !hasNerfIntent) return 'buff';
  return null;
}

function determineOverallChangeWithComment(changes: Change[], comment: string | null): ChangeType {
  const result = determineOverallChange(changes);
  if (result === 'mixed' && comment) {
    const intent = extractIntentFromComment(comment);
    if (intent) return intent;
  }
  return result;
}

// ============================================
// 패치노트 파싱
// ============================================

type ParsedCharacter = {
  name: string;
  nameEn: string;
  devComment: string | null;
  changes: Change[];
};

// 패치노트에서 신규 실험체 감지 및 등록
async function detectAndRegisterNewCharacters(page: Page, url: string): Promise<string[]> {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 500));

    // h5 태그에서 "신규 실험체 - XXX" 패턴 찾기
    const h5Texts = await page.evaluate(() => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) return [];

      const h5Elements = content.querySelectorAll('h5');
      return Array.from(h5Elements).map((h5) => h5.textContent?.trim() || '');
    });

    const newCharacters: string[] = [];

    for (const text of h5Texts) {
      const charName = extractNewCharacterFromH5(text);
      if (charName && !validCharacters.has(charName)) {
        await registerNewCharacter(charName);
        newCharacters.push(charName);
      }
    }

    return newCharacters;
  } catch (error) {
    console.error(`신규 실험체 감지 오류 (${url}):`, error);
    return [];
  }
}

async function parsePatchNote(page: Page, url: string): Promise<ParsedCharacter[]> {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const characters = await page.evaluate(() => {
      const content = document.querySelector('.er-article-detail__content');
      if (!content) return [];

      // 실험체 섹션 찾기
      const h5Elements = content.querySelectorAll('h5');
      let characterSectionStart: Element | null = null;
      let characterSectionEnd: Element | null = null;

      for (let i = 0; i < h5Elements.length; i++) {
        const text = h5Elements[i].textContent?.trim();
        if (text === '실험체') {
          characterSectionStart = h5Elements[i];
          // 다음 h5를 끝으로 설정
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

      // 실험체 섹션 내의 모든 요소를 순회하며 캐릭터 블록 추출
      const results: Array<{
        name: string;
        nameEn: string;
        devComment: string | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        changes: Array<any>;
      }> = [];

      // 캐릭터 이름 패턴: <p><span><strong>캐릭터명</strong></span></p>
      // 중요: 최상위 요소만 선택 (중첩된 ul 제외)
      const allElements = Array.from(content.children).filter(
        (el) => el.tagName === 'P' || el.tagName === 'UL' || el.tagName === 'H5'
      );
      let inCharacterSection = false;
      let currentCharName = '';
      let currentDevComment: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let currentChanges: Array<any> = [];
      let currentTarget = '기본 스탯';

      // 스택 기반으로 li 요소들을 처리하는 헬퍼 (함수 선언 대신 인라인)
      // 모든 li 요소를 BFS로 처리

      for (let idx = 0; idx < allElements.length; idx++) {
        const el = allElements[idx];

        // 캐릭터 섹션 시작 확인
        if (
          el === characterSectionStart ||
          (characterSectionStart &&
            el.compareDocumentPosition(characterSectionStart) & Node.DOCUMENT_POSITION_PRECEDING)
        ) {
          inCharacterSection = true;
        }

        // 캐릭터 섹션 종료 확인
        if (
          characterSectionEnd &&
          (el === characterSectionEnd ||
            (el.compareDocumentPosition(characterSectionEnd) & Node.DOCUMENT_POSITION_FOLLOWING) ===
              0)
        ) {
          break;
        }

        if (!inCharacterSection) continue;

        // 새 캐릭터 시작 확인 (p > span > strong 구조)
        if (el.tagName === 'P') {
          const strong = el.querySelector('span > strong');
          if (strong) {
            const name = strong.textContent?.trim() || '';
            // 섹션 제목 제외
            if (
              name &&
              !['실험체', '무기', '아이템', '시스템', '특성', '코발트 프로토콜', '론울프'].includes(
                name
              )
            ) {
              // 캐릭터명인지 확인: span 텍스트와 strong 텍스트가 같아야 함
              const span = el.querySelector('span');
              const spanText = span?.textContent?.trim() || '';
              const strongText = strong.textContent?.trim() || '';

              if (spanText === strongText && /^[가-힣&\s]+$/.test(strongText)) {
                // 이전 캐릭터 저장
                if (currentCharName && currentChanges.length > 0) {
                  results.push({
                    name: currentCharName,
                    nameEn: currentCharName,
                    devComment: currentDevComment.length > 0 ? currentDevComment.join(' ') : null,
                    changes: currentChanges,
                  });
                }
                // 새 캐릭터 시작
                currentCharName = name;
                currentDevComment = [];
                currentChanges = [];
                currentTarget = '기본 스탯';
                continue;
              }
            }
          }

          // 개발자 코멘트 수집 (캐릭터명 바로 다음 p 태그들)
          if (currentCharName) {
            const text = el.textContent?.trim() || '';
            // 코멘트 조건:
            // - 화살표가 없어야 함 (수치 변경이 아님)
            // - 길이가 10자 이상이어야 함
            // - 스킬 헤더 형식이 아니어야 함
            // - 숫자로만 시작하지 않아야 함 (수치 정보가 아님)
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

        // ul 요소 처리 - 최상위 ul만 처리 (content.children으로 필터링됨)
        if (el.tagName === 'UL') {
          const topLevelLis = el.querySelectorAll(':scope > li');

          // 수치 변경 패턴: stat before → after
          const numericPattern = /^(.+?)\s+([^\s→]+(?:\([^)]*\))?(?:[^→]*?))\s*→\s*(.+)$/;

          for (let i = 0; i < topLevelLis.length; i++) {
            const topLi = topLevelLis[i];

            // topLi의 첫 p > span 텍스트 (P가 없으면 직접 span 찾기)
            const firstP = topLi.querySelector(':scope > p');
            let headerText = '';
            if (firstP) {
              const span = firstP.querySelector('span');
              if (span) {
                headerText = span.textContent?.replace(/\s+/g, ' ').trim() || '';
              }
            } else {
              // P 태그 없이 span이 직접 있는 경우 (일부 핫픽스 구조)
              const directSpan = topLi.querySelector(':scope > span');
              if (directSpan) {
                headerText = directSpan.textContent?.replace(/\s+/g, ' ').trim() || '';
              }
            }

            // 핫픽스 구조: UL > LI > P 안에 캐릭터명이 있을 수 있음
            // 캐릭터명 확인 (p > span > strong 구조이고, 한글 이름인 경우)
            if (firstP) {
              const strong = firstP.querySelector('span > strong');
              if (strong) {
                const strongText = strong.textContent?.trim() || '';
                const span = firstP.querySelector('span');
                const spanText = span?.textContent?.trim() || '';

                // 캐릭터명 조건: span과 strong 텍스트가 같고, 한글이고, 섹션 제목이 아님
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
                  // 이전 캐릭터 저장
                  if (currentCharName && currentChanges.length > 0) {
                    results.push({
                      name: currentCharName,
                      nameEn: currentCharName,
                      devComment: currentDevComment.length > 0 ? currentDevComment.join(' ') : null,
                      changes: currentChanges,
                    });
                  }
                  // 새 캐릭터 시작
                  currentCharName = strongText;
                  currentDevComment = [];
                  currentChanges = [];
                  currentTarget = '기본 스탯';

                  // 이 LI의 하위 UL에서 변경사항 파싱
                  const nestedUl = topLi.querySelector(':scope > ul');
                  if (nestedUl) {
                    const nestedLis = nestedUl.querySelectorAll(':scope > li');
                    for (let k = 0; k < nestedLis.length; k++) {
                      const nestedLi = nestedLis[k];
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
                  continue; // 다음 LI로
                }
              }
            }

            // 기존 로직: currentCharName이 있을 때만 변경사항 처리
            if (!currentCharName) continue;

            // 스킬 헤더 확인 (예: "제압부(Q)", "절단 베기(쌍검 E)", "모노호시자오(R) - 츠바메가에시(R2)")
            // 무기 스킬 패턴 포함: "스킬명(무기명 Q)" 형태
            const skillMatch = headerText.match(
              /^([^→]+\((?:[가-힣A-Za-z\s-]*)?[QWERP패시브]\d?\)(?:\s*-\s*[^→]+\([QWERP]\d?\))?)/
            );
            if (skillMatch && !headerText.includes('→')) {
              currentTarget = skillMatch[0].trim();
            } else if (headerText && headerText.length >= 5) {
              // 스킬 헤더만 있는 경우 제외 (무기 스킬 패턴 포함)
              const isSkillHeader =
                /^[^(→]+\([QWERP]\)$/.test(headerText) ||
                /^[^(→]+\([가-힣A-Za-z\s-]+[QWERP]\d?\)$/.test(headerText) ||
                /^[^(→]+\(패시브\)$/.test(headerText) ||
                /^[^(→]+\([QWERP]\)\s*-\s*[^(→]+\([QWERP]\d?\)$/.test(headerText);

              if (!isSkillHeader) {
                if (headerText.includes('→')) {
                  // 화살표가 있는 경우: 수치 변경
                  const numMatch = headerText.match(numericPattern);
                  if (numMatch) {
                    currentChanges.push({
                      _type: 'numeric',
                      target: currentTarget,
                      stat: numMatch[1].trim(),
                      before: numMatch[2].trim(),
                      after: numMatch[3].trim(),
                    });
                  }
                } else if (headerText.length > 10) {
                  // 설명형 변경사항
                  currentChanges.push({
                    _type: 'description',
                    target: currentTarget,
                    description: headerText,
                    isNew: headerText.includes('(신규)') || /신규[^가-힣]/.test(headerText),
                    isRemoved: headerText.includes('(삭제)') || headerText.includes('삭제됩니다'),
                  });
                }
              }
            }

            // topLi 내의 모든 자손 li에서 변경사항 추출
            const allDescendantLis = topLi.querySelectorAll('li');
            for (let j = 0; j < allDescendantLis.length; j++) {
              const descLi = allDescendantLis[j];
              const descP = descLi.querySelector(':scope > p');
              let descSpan: Element | null = null;

              if (descP) {
                descSpan = descP.querySelector('span');
              } else {
                // P 태그 없이 span이 직접 있는 경우
                descSpan = descLi.querySelector(':scope > span');
              }

              if (descSpan) {
                let descText = descSpan.textContent?.replace(/\s+/g, ' ').trim() || '';
                // after 값이 <strong><span> 등 별도 태그에 있는 경우 p 전체 텍스트로 fallback
                if (descP && descText.includes('→') && !descText.match(numericPattern)) {
                  descText = descP.textContent?.replace(/\s+/g, ' ').trim() || descText;
                }
                if (!descText || descText.length < 5) continue;

                // 스킬 헤더 확인 (서브 li에서도 스킬 헤더가 나올 수 있음, 무기 스킬 포함)
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

                // 스킬 헤더만 있는 경우 제외 (무기 스킬 패턴 포함)
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
                        _type: 'numeric',
                        target: currentTarget,
                        stat: descNumMatch[1].trim(),
                        before: descNumMatch[2].trim(),
                        after: descNumMatch[3].trim(),
                      });
                    }
                  } else if (descText.length > 10) {
                    currentChanges.push({
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

            // topLi에 자손 li가 없는 경우, topLi의 ul 내부 텍스트도 확인
            if (allDescendantLis.length === 0) {
              const nestedUl = topLi.querySelector(':scope > ul');
              if (nestedUl) {
                const nestedLis = nestedUl.querySelectorAll(':scope > li');
                for (let k = 0; k < nestedLis.length; k++) {
                  const nestedLi = nestedLis[k];
                  const nestedP = nestedLi.querySelector(':scope > p');
                  if (nestedP) {
                    const nestedSpan = nestedP.querySelector('span');
                    if (nestedSpan) {
                      const nestedText = nestedSpan.textContent?.replace(/\s+/g, ' ').trim() || '';
                      if (!nestedText || nestedText.length < 5) continue;

                      const isNestedSkillHeader =
                        /^[^(→]+\([QWERP]\)$/.test(nestedText) ||
                        /^[^(→]+\([가-힣A-Za-z\s-]+[QWERP]\d?\)$/.test(nestedText) ||
                        /^[^(→]+\(패시브\)$/.test(nestedText) ||
                        /^[^(→]+\([QWERP]\)\s*-\s*[^(→]+\([QWERP]\d?\)$/.test(nestedText);

                      if (!isNestedSkillHeader) {
                        if (nestedText.includes('→')) {
                          const nestedNumMatch = nestedText.match(numericPattern);
                          if (nestedNumMatch) {
                            currentChanges.push({
                              _type: 'numeric',
                              target: currentTarget,
                              stat: nestedNumMatch[1].trim(),
                              before: nestedNumMatch[2].trim(),
                              after: nestedNumMatch[3].trim(),
                            });
                          }
                        } else if (nestedText.length > 10) {
                          currentChanges.push({
                            _type: 'description',
                            target: currentTarget,
                            description: nestedText,
                            isNew: nestedText.includes('(신규)') || /신규[^가-힣]/.test(nestedText),
                            isRemoved:
                              nestedText.includes('(삭제)') || nestedText.includes('삭제됩니다'),
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // 마지막 캐릭터 저장
      if (currentCharName && currentChanges.length > 0) {
        results.push({
          name: currentCharName,
          nameEn: currentCharName,
          devComment: currentDevComment.length > 0 ? currentDevComment.join(' ') : null,
          changes: currentChanges,
        });
      }

      return results;
    });

    return characters
      .filter((char) => isValidCharacter(char.name))
      .map((char) => ({
        ...char,
        name: normalizeCharacterName(char.name),
        nameEn: normalizeCharacterName(char.nameEn),
        changes: char.changes.map((change): Change => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawChange = change as any;

          if (rawChange._type === 'description') {
            // 설명형 변경사항
            let category: ChangeCategory = 'mechanic';
            if (rawChange.isNew) {
              category = 'added';
            } else if (rawChange.isRemoved) {
              category = 'removed';
            }
            return {
              target: rawChange.target,
              description: rawChange.description,
              changeType: 'mixed', // 설명형은 기본적으로 mixed
              changeCategory: category,
            } as DescriptionChange;
          } else {
            // 수치 변경사항
            const processed = processChange(rawChange.stat, rawChange.before, rawChange.after);
            return {
              target: rawChange.target,
              stat: processed.stat,
              before: processed.before,
              after: processed.after,
              changeType: determineChangeType(processed.stat, processed.before, processed.after),
              changeCategory: 'numeric',
            } as NumericChange;
          }
        }),
      }));
  } catch (error) {
    console.error(`파싱 오류 (${url}):`, error);
    return [];
  }
}

function extractPatchVersion(title: string): string {
  const versionMatch = title.match(/(?:^|\s|-)(\d{1,2}\.\d{1,2}[a-z]?)(?:\s|$|-|패치)/i);
  if (versionMatch) return versionMatch[1];
  const hotfixMatch = title.match(/(\d+\.\d+[a-z]?)\s*핫픽스/i);
  if (hotfixMatch) return hotfixMatch[1];
  return title;
}

// ============================================
// 통계 계산
// ============================================

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

// ============================================
// Firestore 데이터 로드/저장
// ============================================

// 파싱 대상 패치노트 조회 (hasCharacterData: true, isParsed: false 또는 undefined)
async function getUnparsedPatchNotes(): Promise<PatchNote[]> {
  const db = initFirebaseAdmin();
  const snapshot = await db
    .collection('patchNotes')
    .where('hasCharacterData', '==', true)
    .where('status', '==', 'success')
    .orderBy('id', 'desc')
    .get();

  const unparsed: PatchNote[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data() as PatchNote;
    if (!data.isParsed) {
      unparsed.push(data);
    }
  });

  return unparsed;
}

// 기존 캐릭터 데이터 로드
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

// 캐릭터 데이터 저장
async function saveCharacters(characters: Record<string, CharacterData>): Promise<void> {
  const db = initFirebaseAdmin();
  const batchSize = 500;
  const entries = Object.entries(characters);

  console.log(`\nFirestore에 ${entries.length}개 캐릭터 저장 중...`);

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = db.batch();
    const chunk = entries.slice(i, i + batchSize);

    for (const [name, data] of chunk) {
      const docRef = db.collection('characters').doc(name);
      batch.set(docRef, data);
    }

    await batch.commit();
    console.log(`  - ${Math.min(i + batchSize, entries.length)}/${entries.length} 저장 완료`);
  }
}

// 패치노트 isParsed 업데이트 + characterNames 저장
async function markPatchAsParsed(patchId: number, characterNames: string[]): Promise<void> {
  const db = initFirebaseAdmin();
  await db.collection('patchNotes').doc(patchId.toString()).update({
    isParsed: true,
    parsedAt: new Date().toISOString(),
    characterNames: characterNames.sort(),
  });
}

// 메타데이터 업데이트
async function updateMetadata(characterCount: number): Promise<void> {
  const db = initFirebaseAdmin();
  await db.collection('metadata').doc('balanceChanges').set(
    {
      updatedAt: new Date().toISOString(),
      characterCount,
    },
    { merge: true }
  );
}

// ============================================
// 메인 함수
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const testPatchId = args.find((a) => a.startsWith('--patch='))?.split('=')[1];
  const testCharacter = args.find((a) => a.startsWith('--character='))?.split('=')[1];

  // 테스트 모드: 특정 패치만 파싱하고 결과 출력 (저장 안함)
  if (testMode && testPatchId) {
    console.log('=== 테스트 모드 ===\n');

    // DB에서 유효 캐릭터 목록 로드
    validCharacters = await loadValidCharacters();

    const browser: Browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page: Page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    // 한국어 페이지 렌더링을 위한 쿠키 설정
    await page.setCookie({
      name: 'locale',
      value: 'ko_KR',
      domain: 'playeternalreturn.com',
    });

    const url = `https://playeternalreturn.com/posts/news/${testPatchId}`;
    console.log(`패치 ID: ${testPatchId}`);
    console.log(`URL: ${url}\n`);

    // 신규 실험체 감지 (테스트 모드에서는 등록하지 않고 출력만)
    const newChars = await detectAndRegisterNewCharacters(page, url);
    if (newChars.length > 0) {
      console.log(`신규 실험체 감지: ${newChars.join(', ')}\n`);
    }

    const characters = await parsePatchNote(page, url);
    await browser.close();

    if (characters.length === 0) {
      console.log('파싱된 캐릭터가 없습니다.');
      return;
    }

    const targets = testCharacter ? characters.filter((c) => c.name === testCharacter) : characters;

    if (targets.length === 0 && testCharacter) {
      console.log(`캐릭터 "${testCharacter}"를 찾을 수 없습니다.`);
      console.log(`파싱된 캐릭터: ${characters.map((c) => c.name).join(', ')}`);
      return;
    }

    for (const char of targets) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`캐릭터: ${char.name}`);
      console.log(`${'='.repeat(50)}`);

      console.log(`\n[코멘트] (${char.devComment?.length || 0}자)`);
      console.log(char.devComment || '(없음)');

      console.log(`\n[변경사항] (${char.changes.length}개)`);
      char.changes.forEach((change, i) => {
        if ('stat' in change && change.stat) {
          console.log(
            `  ${i + 1}. [${change.target}] ${change.stat}: ${change.before} → ${change.after} (${change.changeType})`
          );
        } else if ('description' in change) {
          console.log(
            `  ${i + 1}. [${change.target}] ${change.description} (${change.changeCategory})`
          );
        }
      });
    }

    console.log(`\n\n총 ${characters.length}명 캐릭터 파싱됨`);
    return;
  }

  console.log('밸런스 변경사항 파싱 시작...\n');

  // 기존 캐릭터 데이터 로드
  const characterMap = await loadExistingCharacters();
  console.log(`기존 캐릭터: ${Object.keys(characterMap).length}명`);

  // DB에서 유효 캐릭터 목록 로드
  validCharacters = await loadValidCharacters();

  // 파싱 대상 패치노트 조회
  const unparsedPatches = await getUnparsedPatchNotes();

  if (unparsedPatches.length === 0) {
    console.log('파싱이 필요한 신규 패치 없음');
    return;
  }

  console.log(`파싱 대상: ${unparsedPatches.length}개 패치\n`);

  // 브라우저 시작
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page: Page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  // 한국어 페이지 렌더링을 위한 쿠키 설정
  await page.setCookie({
    name: 'locale',
    value: 'ko_KR',
    domain: 'playeternalreturn.com',
  });

  const affectedCharacters = new Set<string>();

  for (let i = 0; i < unparsedPatches.length; i++) {
    const patch = unparsedPatches[i];
    const progress = `[${i + 1}/${unparsedPatches.length}]`;
    console.log(`${progress} ${patch.title} 파싱 중...`);

    // 신규 실험체 감지 및 등록
    await detectAndRegisterNewCharacters(page, patch.link);

    const characters = await parsePatchNote(page, patch.link);
    const patchVersion = extractPatchVersion(patch.title);
    const patchDate = patch.createdAt.split('T')[0];

    for (const char of characters) {
      const key = char.name;
      affectedCharacters.add(key);

      if (!characterMap[key]) {
        characterMap[key] = {
          name: char.name,
          nameEn: char.nameEn,
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

      const overallChange = determineOverallChangeWithComment(char.changes, char.devComment);

      characterMap[key].patchHistory.push({
        patchId: patch.id,
        patchVersion,
        patchDate,
        overallChange,
        streak: 0,
        devComment: char.devComment,
        changes: char.changes,
      });

      const commentInfo = char.devComment ? ` (코멘트: "${char.devComment.slice(0, 30)}...")` : '';
      console.log(
        `  - ${char.name}: ${char.changes.length}개 변경 (${overallChange})${commentInfo}`
      );
    }

    // 패치를 파싱 완료로 표시 (해당 패치의 캐릭터 이름들도 함께 저장)
    const patchCharacterNames = characters.map((c) => c.name);
    await markPatchAsParsed(patch.id, patchCharacterNames);

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await browser.close();

  // 변경된 캐릭터만 통계 재계산
  console.log(`\n${affectedCharacters.size}명의 캐릭터 통계 재계산 중...`);

  for (const key of affectedCharacters) {
    characterMap[key].patchHistory.sort(
      (a, b) => new Date(b.patchDate).getTime() - new Date(a.patchDate).getTime()
    );
    characterMap[key].patchHistory = calculateStreaks(characterMap[key].patchHistory);
    characterMap[key].stats = calculateStats(characterMap[key].patchHistory);
  }

  // Firestore에 저장
  await saveCharacters(characterMap);
  await updateMetadata(Object.keys(characterMap).length);

  // 요약 출력
  const characterCount = Object.keys(characterMap).length;
  const totalChanges = Object.values(characterMap).reduce(
    (sum, char) => sum + char.patchHistory.length,
    0
  );

  console.log('\n' + '='.repeat(60));
  console.log('파싱 완료 요약');
  console.log('='.repeat(60));
  console.log(`신규 파싱: ${unparsedPatches.length}개 패치`);
  console.log(`영향받은 캐릭터: ${affectedCharacters.size}명`);
  console.log(`총 캐릭터: ${characterCount}명`);
  console.log(`총 패치 기록: ${totalChanges}개`);
  console.log('Firestore 저장 완료!');

  // 연속 기록 Top 5 출력
  const streakRanking = Object.values(characterMap)
    .filter((c) => c.stats.currentStreak.count >= 2)
    .sort((a, b) => b.stats.currentStreak.count - a.stats.currentStreak.count)
    .slice(0, 5);

  if (streakRanking.length > 0) {
    console.log('\n=== 현재 연속 기록 Top 5 ===');
    streakRanking.forEach((char, i) => {
      const streak = char.stats.currentStreak;
      const emoji = streak.type === 'buff' ? '📈' : '📉';
      console.log(`${i + 1}. ${char.name}: ${emoji} ${streak.count}연속 ${streak.type}`);
    });
  }

  // 배포된 사이트 캐시 무효화
  await triggerRevalidation();
}

main().catch(console.error);
