/**
 * 누락된 7개 패치 데이터 수정 스크립트
 *
 * 검증 결과 실제 변경사항이 있는 7개 패치를 파싱하여
 * Firebase에 추가합니다.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { initFirebaseAdmin } from './lib/firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';

// 수정 대상 패치 목록
const TARGET_PATCHES = [
  { patchId: 2331, character: '라우라', patchTitle: '1.35 패치노트', patchDate: '2024-11-20' },
  { patchId: 1954, character: '수아', patchTitle: '1.23 패치노트', patchDate: '2024-06-04' },
  { patchId: 2038, character: '아비게일', patchTitle: '1.26 패치노트', patchDate: '2024-07-17' },
  { patchId: 2102, character: '츠바메', patchTitle: '1.28 패치노트', patchDate: '2024-08-13' },
  { patchId: 2331, character: '아드리아나', patchTitle: '1.35 패치노트', patchDate: '2024-11-20' },
  { patchId: 2645, character: '캐시', patchTitle: '1.45 패치노트', patchDate: '2025-04-16' },
  { patchId: 2201, character: '알론소', patchTitle: '1.31 패치노트', patchDate: '2024-09-25' },
];

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

// 쿨다운 등 감소가 버프인 스탯
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
  '딜레이',
  'delay',
  '충전',
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

// 특정 캐릭터의 변경사항 파싱
async function parseCharacterChanges(
  page: Page,
  url: string,
  characterName: string
): Promise<{ devComment: string | null; changes: Change[] } | null> {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const result = await page.evaluate((charName: string) => {
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
          if (i + 1 < h5Elements.length) {
            characterSectionEnd = h5Elements[i + 1];
          }
          break;
        }
      }

      if (!characterSectionStart) return null;

      // 캐릭터 요소 찾기
      const allElements = Array.from(content.children);
      let inSection = false;
      let foundCharacter = false;
      let characterElement: Element | null = null;
      let characterIndex = -1;

      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];

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
            characterIndex = i;
            break;
          }
        }
        if (foundCharacter) break;
      }

      if (!foundCharacter || !characterElement) return null;

      // 개발자 코멘트와 변경사항 추출
      let devComment: string | null = null;
      const changes: Array<{
        _type: string;
        target: string;
        stat?: string;
        before?: string;
        after?: string;
        description?: string;
        isNew?: boolean;
        isRemoved?: boolean;
      }> = [];
      let currentTarget = '기본 스탯';

      // 다음 요소들 순회
      for (let i = characterIndex + 1; i < allElements.length; i++) {
        const el = allElements[i];

        // 다음 캐릭터 시작 확인
        const nextStrong = el.querySelector('span > strong');
        if (nextStrong && el.tagName === 'P') {
          const nextName = nextStrong.textContent?.trim() || '';
          const span = el.querySelector('span');
          const spanText = span?.textContent?.trim() || '';
          if (spanText === nextName && /^[가-힣&\s]+$/.test(nextName) && nextName.length <= 15) {
            break; // 다음 캐릭터
          }
        }

        // 섹션 종료 확인
        if (characterSectionEnd && el === characterSectionEnd) break;

        // P 태그: 개발자 코멘트
        if (el.tagName === 'P' && !devComment) {
          const text = el.textContent?.trim() || '';
          if (text.length > 20 && !text.includes('→')) {
            devComment = text;
          }
        }

        // UL 태그: 변경사항
        if (el.tagName === 'UL') {
          const topLevelLis = el.querySelectorAll(':scope > li');
          const numericPattern = /^(.+?)\s+([^\s→]+(?:\([^)]*\))?(?:[^→]*?))\s*→\s*(.+)$/;

          for (const li of topLevelLis) {
            const firstP = li.querySelector(':scope > p');
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
            } else if (headerText && headerText.includes('→')) {
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
            }

            // 하위 li 확인
            const nestedLis = li.querySelectorAll('li');
            for (const nestedLi of nestedLis) {
              const nestedP = nestedLi.querySelector(':scope > p');
              const nestedSpan =
                nestedP?.querySelector('span') || nestedLi.querySelector(':scope > span');

              if (nestedSpan) {
                const nestedText = nestedSpan.textContent?.replace(/\s+/g, ' ').trim() || '';
                if (!nestedText || nestedText.length < 5) continue;

                // 스킬 헤더
                const subSkillMatch = nestedText.match(
                  /^([^→]+\((?:[가-힣A-Za-z\s-]*)?[QWERP패시브]\d?\))/
                );
                if (
                  subSkillMatch &&
                  !nestedText.includes('→') &&
                  nestedText === subSkillMatch[0].trim()
                ) {
                  currentTarget = subSkillMatch[0].trim();
                  continue;
                }

                if (nestedText.includes('→')) {
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
                } else if (nestedText.length > 15) {
                  changes.push({
                    _type: 'description',
                    target: currentTarget,
                    description: nestedText,
                    isNew: nestedText.includes('신규'),
                    isRemoved: nestedText.includes('삭제'),
                  });
                }
              }
            }
          }
        }
      }

      return { devComment, changes };
    }, characterName);

    if (!result || result.changes.length === 0) return null;

    // 변경사항 변환
    const processedChanges: Change[] = result.changes.map((change) => {
      if (change._type === 'description') {
        let category: ChangeCategory = 'mechanic';
        if (change.isNew) category = 'added';
        if (change.isRemoved) category = 'removed';

        return {
          target: change.target,
          description: change.description || '',
          changeType: 'mixed' as ChangeType,
          changeCategory: category,
        } as DescriptionChange;
      } else {
        return {
          target: change.target,
          stat: change.stat || '',
          before: change.before || '',
          after: change.after || '',
          changeType: determineChangeType(
            change.stat || '',
            change.before || '',
            change.after || ''
          ),
          changeCategory: 'numeric',
        } as NumericChange;
      }
    });

    return {
      devComment: result.devComment,
      changes: processedChanges,
    };
  } catch (error) {
    console.error(`파싱 오류:`, error);
    return null;
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('누락된 7개 패치 데이터 수정 시작...\n');

  const db = initFirebaseAdmin();

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

  let successCount = 0;
  let failCount = 0;

  for (const target of TARGET_PATCHES) {
    const url = `https://playeternalreturn.com/posts/news/${target.patchId}`;
    console.log(`[${target.character}] ${target.patchTitle} 파싱 중...`);

    const result = await parseCharacterChanges(page, url, target.character);

    if (!result || result.changes.length === 0) {
      console.log(`  ✗ 변경사항을 찾을 수 없음`);
      failCount++;
      continue;
    }

    console.log(`  ✓ ${result.changes.length}개 변경사항 발견`);

    // 버전 추출
    const versionMatch = target.patchTitle.match(/(\d{1,2}\.\d{1,2}[a-z]?)/);
    const patchVersion = versionMatch ? versionMatch[1] : target.patchTitle;

    // PatchEntry 생성
    const patchEntry: PatchEntry = {
      patchId: target.patchId,
      patchVersion,
      patchDate: target.patchDate,
      overallChange: determineOverallChange(result.changes),
      streak: 0,
      devComment: result.devComment,
      changes: result.changes,
    };

    // Firebase에서 캐릭터 데이터 가져오기
    const charDoc = await db.collection('characters').doc(target.character).get();

    if (!charDoc.exists) {
      console.log(`  ✗ Firebase에 캐릭터 없음: ${target.character}`);
      failCount++;
      continue;
    }

    const charData = charDoc.data();
    const patchHistory: PatchEntry[] = charData?.patchHistory || [];

    // 중복 확인
    const exists = patchHistory.some((p) => p.patchId === target.patchId);
    if (exists) {
      console.log(`  ⚠ 이미 존재함 (건너뜀)`);
      continue;
    }

    // 패치 추가 및 정렬
    patchHistory.push(patchEntry);
    patchHistory.sort((a, b) => new Date(b.patchDate).getTime() - new Date(a.patchDate).getTime());

    // streak 재계산
    const chronological = [...patchHistory].reverse();
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
        patch.streak = currentStreakCount;
      } else {
        patch.streak = 1;
      }
    }

    // 통계 재계산
    const stats = {
      totalPatches: patchHistory.length,
      buffCount: patchHistory.filter((p) => p.overallChange === 'buff').length,
      nerfCount: patchHistory.filter((p) => p.overallChange === 'nerf').length,
      mixedCount: patchHistory.filter((p) => p.overallChange === 'mixed').length,
      currentStreak: {
        type: currentStreakType,
        count: currentStreakCount,
      },
      maxBuffStreak: 0,
      maxNerfStreak: 0,
    };

    // Firebase 업데이트
    await db.collection('characters').doc(target.character).update({
      patchHistory,
      stats,
    });

    console.log(`  ✓ Firebase 업데이트 완료 (총 ${patchHistory.length}개 패치)`);
    successCount++;

    await delay(500);
  }

  await browser.close();

  // 결과 요약
  console.log('\n' + '='.repeat(60));
  console.log('수정 완료 요약');
  console.log('='.repeat(60));
  console.log(`성공: ${successCount}개`);
  console.log(`실패: ${failCount}개`);
}

main().catch(console.error);
