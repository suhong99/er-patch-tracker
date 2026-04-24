/**
 * 실험체 출시일을 Firestore characters 컬렉션에 업데이트하는 스크립트
 * - scripts/data/release-dates.json 에서 데이터 읽기
 * - "YYYY년 MM월 DD일" → "YYYY-MM-DD" 변환 후 저장
 *
 * Usage: npx tsx scripts/update-release-dates.ts
 */

import { initFirebaseAdmin } from './lib/firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';

type ReleaseDate = {
  characterName: string;
  namuWikiName: string;
  namuWikiUrl: string;
  releaseDate: string | null;
};

/** "2024년 9월 12일" → "2024-09-12" */
function parseKoreanDate(dateStr: string): string | null {
  const match = dateStr.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (!match) return null;
  const year = match[1];
  const month = match[2].padStart(2, '0');
  const day = match[3].padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function main(): Promise<void> {
  const dataPath = path.join(process.cwd(), 'scripts', 'data', 'release-dates.json');
  const releaseDates: ReleaseDate[] = JSON.parse(readFileSync(dataPath, 'utf-8'));

  const db = initFirebaseAdmin();
  const batch = db.batch();

  let updated = 0;
  let skipped = 0;

  for (const entry of releaseDates) {
    if (!entry.releaseDate) {
      console.log(`[스킵] ${entry.characterName}: 출시일 없음`);
      skipped++;
      continue;
    }

    const isoDate = parseKoreanDate(entry.releaseDate);
    if (!isoDate) {
      console.log(`[스킵] ${entry.characterName}: 날짜 파싱 실패 (${entry.releaseDate})`);
      skipped++;
      continue;
    }

    const ref = db.collection('characters').doc(entry.characterName);
    batch.update(ref, {
      releaseDate: isoDate,
      namuWikiUrl: entry.namuWikiUrl,
    });
    console.log(`[업데이트] ${entry.characterName}: ${isoDate} | ${entry.namuWikiUrl}`);
    updated++;
  }

  await batch.commit();
  console.log(`\n완료: ${updated}개 업데이트, ${skipped}개 스킵`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('오류:', err);
    process.exit(1);
  });
