/**
 * 패치노트 버그 수정 섹션 파서
 *
 * "버그 수정" 또는 "버그 수정 및 개선 사항" H5 섹션에서
 * 실험체별 버그 항목을 추출한다.
 *
 * 지원 패턴:
 *   A. 핫픽스: <h5>버그 수정</h5> → <ul> 직접 나열
 *   B. 일반 패치: <h5>버그 수정 및 개선 사항</h5> → <h3> 서브섹션 → <ul>
 *   C. 구버전 일반 패치 (3327~): <strong> 없이 텍스트 앞에 캐릭터명
 */

import { Page } from 'puppeteer';

// ============================================
// 타입 정의
// ============================================

export type BugFix = {
  character: string | null;
  description: string;
};

// ============================================
// 캐릭터 이름 관리 (parse-balance-changes와 동일 방식)
// ============================================

let validCharacters: Set<string> = new Set();

export function setBugValidCharacters(chars: Set<string>): void {
  validCharacters = chars;
}

// ============================================
// 파싱 로직
// ============================================

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ') // &nbsp;
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * <li> 텍스트에서 캐릭터명 추출
 *
 * 우선순위:
 *   1. <strong> 태그 텍스트 중 validCharacters에 있는 것
 *   2. 전체 텍스트가 known 캐릭터명으로 시작하는 경우
 */
function extractCharacter(
  strongTexts: string[],
  fullText: string,
  sortedChars: string[]
): string | null {
  // 1. <strong> 태그에서 캐릭터명 추출
  for (const text of strongTexts) {
    if (validCharacters.has(text)) {
      return text;
    }
  }

  // 2. 텍스트 앞부분에서 캐릭터명 매칭 (구버전 패치 대응)
  for (const char of sortedChars) {
    if (fullText.startsWith(char + ' ') || fullText.startsWith(char + '(')) {
      return char;
    }
  }

  return null;
}

/**
 * 페이지에서 버그 수정 항목 추출
 */
export async function parseBugFixes(page: Page): Promise<BugFix[]> {
  // DOM에서 raw 데이터 추출 (브라우저 컨텍스트)
  const rawItems = await page.evaluate((): { strongTexts: string[]; fullText: string }[] => {
    // 버그 수정 H5 찾기
    const h5List = Array.from(document.querySelectorAll('h5.er-point-title'));
    const bugH5 = h5List.find((el) => el.textContent?.includes('버그 수정')) ?? null;
    if (!bugH5) return [];

    // 다음 H5 (섹션 경계)
    const bugH5Idx = h5List.indexOf(bugH5 as HTMLElement);
    const nextH5 = h5List[bugH5Idx + 1] ?? null;

    // H5 이후 형제 요소 순회, UL에서 LI 수집
    const items: { strongTexts: string[]; fullText: string }[] = [];
    let cur = bugH5.nextElementSibling;

    while (cur && cur !== nextH5) {
      if (cur.tagName === 'UL') {
        for (const li of cur.querySelectorAll('li')) {
          const strongTexts = Array.from(li.querySelectorAll('strong'))
            .map((s) =>
              (s.textContent ?? '')
                .replace(/\u00a0/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
            )
            .filter(Boolean);
          const fullText = (li.textContent ?? '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (fullText) {
            items.push({ strongTexts, fullText });
          }
        }
      }
      cur = cur.nextElementSibling;
    }

    return items;
  });

  // 캐릭터명 길이 내림차순 정렬 (긴 이름 우선 매칭)
  const sortedChars = [...validCharacters].sort((a, b) => b.length - a.length);

  return rawItems.map(({ strongTexts, fullText }) => ({
    character: extractCharacter(strongTexts, normalizeText(fullText), sortedChars),
    description: normalizeText(fullText),
  }));
}
