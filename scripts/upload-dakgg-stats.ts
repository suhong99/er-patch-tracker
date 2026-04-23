/**
 * dak.gg 크롤링 결과를 Firestore characters/{name}.baseStats에 반영
 * - 체력 재생(hpRegenBase, hpRegenGrowth) 신규 필드 추가
 * - dak.gg 기준으로 기존 스탯 값 정정
 * - 무기 숙련도 차이도 반영
 *
 * 사용법:
 *   npx tsx scripts/upload-dakgg-stats.ts              # 전체 업로드
 *   npx tsx scripts/upload-dakgg-stats.ts --dry-run    # 미리보기 (저장 안 함)
 *   npx tsx scripts/upload-dakgg-stats.ts 나딘 가넷    # 특정 캐릭터만
 */

import * as fs from 'fs';
import * as path from 'path';
import { initFirebaseAdmin } from './lib/firebase-admin';
import type { DakggCrawlResult, DakggCharacterStats } from './crawl-dakgg-stats';

const DAKGG_PATH = path.join(__dirname, 'dakgg-stats-result.json');

type BaseStatsFirestore = {
  hpBase: number | null;
  hpGrowth: number | null;
  hpRegenBase: number | null;
  hpRegenGrowth: number | null;
  defenseBase: number | null;
  defenseGrowth: number | null;
  attackBase: number | null;
  attackGrowth: number | null;
  attackSpeedBase: number | null;
  moveSpeed: number | null;
  weaponStats: Array<{
    weaponType: string;
    attackSpeedGrowth: number | null;
    basicAttackAmpGrowth: number | null;
    skillAmpGrowth: number | null;
  }>;
  crawledAt: string;
};

function toFirestoreStats(dg: DakggCharacterStats): BaseStatsFirestore {
  return {
    hpBase: dg.hpBase,
    hpGrowth: dg.hpGrowth,
    hpRegenBase: dg.hpRegenBase,
    hpRegenGrowth: dg.hpRegenGrowth,
    defenseBase: dg.defenseBase,
    defenseGrowth: dg.defenseGrowth,
    attackBase: dg.attackBase,
    attackGrowth: dg.attackGrowth,
    attackSpeedBase: dg.attackSpeedBase,
    moveSpeed: dg.moveSpeed,
    weaponStats: dg.weaponStats.map((w) => ({
      weaponType: w.weaponType,
      attackSpeedGrowth: w.attackSpeedGrowth,
      basicAttackAmpGrowth: w.basicAttackAmpGrowth,
      skillAmpGrowth: w.skillAmpGrowth,
    })),
    crawledAt: dg.crawledAt,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const dryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(DAKGG_PATH)) {
    console.error(`dak.gg 크롤링 결과 없음: ${DAKGG_PATH}`);
    console.error('먼저 npx tsx scripts/crawl-dakgg-stats.ts 를 실행하세요.');
    process.exit(1);
  }

  const raw = fs.readFileSync(DAKGG_PATH, 'utf-8');
  const dakggResult: DakggCrawlResult = JSON.parse(raw);

  const allEntries = Object.entries(dakggResult.characters);
  const valid = allEntries.filter(([, c]) => !c.parseError);
  const failed = allEntries.filter(([, c]) => c.parseError);

  const targets = args.length > 0 ? valid.filter(([name]) => args.includes(name)) : valid;

  console.log(`dak.gg 크롤링 결과: ${valid.length}명 성공 / ${failed.length}명 실패`);
  if (failed.length > 0) {
    console.log('실패 (건너뜀):');
    failed.forEach(([name, c]) => console.log(`  - ${name}: ${c.parseError}`));
  }
  console.log(`업로드 대상: ${targets.length}명\n`);

  if (dryRun) {
    console.log('[DRY RUN] 미리보기 (실제 저장 안 함):');
    targets.slice(0, 5).forEach(([name, c]) => {
      const s = toFirestoreStats(c);
      const weapons = s.weaponStats.map((w) => w.weaponType).join('/');
      console.log(
        `  ${name}: HP ${s.hpBase}+${s.hpGrowth}, 재생 ${s.hpRegenBase}+${s.hpRegenGrowth}, DEF ${s.defenseBase}, ATK ${s.attackBase}, 무기 ${weapons}`
      );
    });
    if (targets.length > 5) console.log(`  ... 외 ${targets.length - 5}명`);
    return;
  }

  const db = initFirebaseAdmin();
  console.log('Firebase 업로드 시작...\n');

  const batchSize = 500;
  let uploaded = 0;

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = db.batch();
    const chunk = targets.slice(i, i + batchSize);

    for (const [name, charData] of chunk) {
      const docRef = db.collection('characters').doc(name);
      batch.update(docRef, { baseStats: toFirestoreStats(charData) });
    }

    await batch.commit();
    uploaded += chunk.length;
    console.log(`  ${uploaded}/${targets.length} 완료`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('업로드 완료');
  console.log('='.repeat(50));
  console.log(`저장: ${uploaded}명`);
  console.log(`건너뜀 (파싱 실패): ${failed.length}명`);
  console.log(`크롤링 시각: ${dakggResult.crawledAt}`);
}

main().catch((err) => {
  console.error('오류:', err);
  process.exit(1);
});
