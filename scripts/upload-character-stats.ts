/**
 * 크롤링된 실험체 기본 스텟을 Firebase characters/{name} 문서에 baseStats 필드로 저장
 *
 * 사용법:
 *   npx tsx scripts/upload-character-stats.ts              # 전체 업로드
 *   npx tsx scripts/upload-character-stats.ts --dry-run    # 실제 저장 없이 미리보기
 */

import * as fs from 'fs';
import * as path from 'path';
import { initFirebaseAdmin } from './lib/firebase-admin';
import type { CharacterStatsCrawlResult, CharacterBaseStats } from './crawl-character-stats';

const RESULT_PATH = path.join(__dirname, 'character-stats-result.json');

type BaseStatsFirestore = Omit<CharacterBaseStats, 'name' | 'namuWikiUrl' | 'parseError'>;

async function uploadCharacterStats(dryRun: boolean): Promise<void> {
  if (!fs.existsSync(RESULT_PATH)) {
    console.error(`결과 파일 없음: ${RESULT_PATH}`);
    console.error('먼저 npx tsx scripts/crawl-character-stats.ts 를 실행하세요.');
    process.exit(1);
  }

  const raw = fs.readFileSync(RESULT_PATH, 'utf-8');
  const crawlResult: CharacterStatsCrawlResult = JSON.parse(raw);

  const characters = Object.entries(crawlResult.characters);
  const valid = characters.filter(([, c]) => !c.parseError);
  const failed = characters.filter(([, c]) => c.parseError);

  console.log(`크롤링 결과: ${valid.length}명 성공 / ${failed.length}명 실패`);
  if (failed.length > 0) {
    console.log('실패 목록 (건너뜀):');
    failed.forEach(([name, c]) => console.log(`  - ${name}: ${c.parseError}`));
  }

  if (dryRun) {
    console.log('\n[DRY RUN] 저장 없이 미리보기:');
    valid.slice(0, 3).forEach(([name, c]) => {
      console.log(
        `  ${name}: HP ${c.hpBase}+${c.hpGrowth}, DEF ${c.defenseBase}, ATK ${c.attackBase}, 무기 ${c.weaponStats.map((w) => w.weaponType).join('/')}`
      );
    });
    console.log(`  ... 외 ${valid.length - 3}명`);
    return;
  }

  const db = initFirebaseAdmin();

  console.log(`\n${valid.length}명 Firebase 업로드 시작...\n`);

  // 배치 처리 (500개 단위)
  const batchSize = 500;
  let uploaded = 0;

  for (let i = 0; i < valid.length; i += batchSize) {
    const batch = db.batch();
    const chunk = valid.slice(i, i + batchSize);

    for (const [name, charData] of chunk) {
      const baseStats: BaseStatsFirestore = {
        hpBase: charData.hpBase,
        hpGrowth: charData.hpGrowth,
        defenseBase: charData.defenseBase,
        defenseGrowth: charData.defenseGrowth,
        attackBase: charData.attackBase,
        attackGrowth: charData.attackGrowth,
        attackSpeedBase: charData.attackSpeedBase,
        moveSpeed: charData.moveSpeed,
        weaponStats: charData.weaponStats,
        crawledAt: charData.crawledAt,
      };

      const docRef = db.collection('characters').doc(name);
      batch.update(docRef, { baseStats });
    }

    await batch.commit();
    uploaded += chunk.length;
    console.log(`  ${uploaded}/${valid.length} 완료`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Firebase 업로드 완료');
  console.log('='.repeat(50));
  console.log(`저장: ${uploaded}명`);
  console.log(`건너뜀 (파싱 실패): ${failed.length}명`);
  console.log(`크롤링 시각: ${crawlResult.crawledAt}`);
}

const dryRun = process.argv.includes('--dry-run');
uploadCharacterStats(dryRun).catch((err) => {
  console.error('오류:', err);
  process.exit(1);
});
