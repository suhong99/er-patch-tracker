/**
 * 기존 캐릭터 이미지를 Cloudinary에 업로드하고
 * Firestore metadata/characterImages에 URL을 등록하는 스크립트
 *
 * 사용법:
 *   npx tsx scripts/upload-character-images.ts
 *
 * 옵션:
 *   --dry-run   실제 업로드 없이 대상 파일만 확인
 *   --force     이미 등록된 이미지도 재업로드
 */

import { initFirebaseAdmin } from './lib/firebase-admin';
import { v2 as cloudinary } from 'cloudinary';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

// .env.local 로드
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const IMAGES_DIR = path.join(process.cwd(), 'public/images/characters');
const FIRESTORE_DOC = 'metadata/characterImages';

type ImageMap = Record<string, string>;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  if (dryRun) console.log('[DRY RUN] 실제 업로드 없이 확인만 합니다.\n');

  const db = initFirebaseAdmin();

  // 기존 이미지 맵 조회
  const doc = await db.doc(FIRESTORE_DOC).get();
  const existingMap: ImageMap = doc.exists ? (doc.data() as ImageMap) : {};
  console.log(`기존 등록된 이미지: ${Object.keys(existingMap).length}개\n`);

  // public/images/characters/*.png 파일 목록
  const files = readdirSync(IMAGES_DIR).filter((f) => f.endsWith('.png'));
  console.log(`발견된 이미지 파일: ${files.length}개\n`);

  const newMap: ImageMap = {};
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const englishName = path.basename(file, '.png');
    const filePath = path.join(IMAGES_DIR, file);

    if (!existsSync(filePath)) {
      console.log(`  [SKIP] ${file} - 파일 없음`);
      skipped++;
      continue;
    }

    if (!force && existingMap[englishName]) {
      console.log(`  [SKIP] ${englishName} - 이미 등록됨`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY] ${englishName} - 업로드 대상`);
      uploaded++;
      continue;
    }

    try {
      // Cloudinary 업로드 (원본 비율 유지, WebP 자동 변환)
      const result = await cloudinary.uploader.upload(filePath, {
        public_id: englishName,
        folder: 'characters',
        overwrite: true,
        format: 'webp',
        quality: 'auto',
      });

      newMap[englishName] = result.secure_url;
      uploaded++;
      const sizeKB = (result.bytes / 1024).toFixed(1);
      console.log(`  [OK] ${englishName} (${sizeKB}KB, ${result.width}x${result.height})`);
    } catch (err) {
      failed++;
      console.error(`  [FAIL] ${englishName}:`, err instanceof Error ? err.message : err);
    }
  }

  // Firestore 업데이트 (업로드된 것만)
  if (!dryRun && Object.keys(newMap).length > 0) {
    await db.doc(FIRESTORE_DOC).set(newMap, { merge: true });
    console.log(`\nFirestore 업데이트 완료`);
  }

  console.log(`\n===== 결과 =====`);
  console.log(`업로드: ${uploaded}개`);
  console.log(`스킵: ${skipped}개`);
  console.log(`실패: ${failed}개`);
  console.log(`총 등록 이미지: ${Object.keys(existingMap).length + Object.keys(newMap).length}개`);
}

main().catch((err) => {
  console.error('스크립트 실행 실패:', err);
  process.exit(1);
});
