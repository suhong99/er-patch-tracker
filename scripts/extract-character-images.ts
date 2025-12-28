/**
 * Google Drive에서 다운로드한 CharactER ZIP 파일에서
 * 각 실험체의 Mini 이미지만 추출하는 스크립트
 *
 * 사용법: npx tsx scripts/extract-character-images.ts <ZIP폴더경로>
 * 예시: npx tsx scripts/extract-character-images.ts "C:/Users/Downloads/er-patch"
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'images', 'characters');

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error('사용법: npx tsx scripts/extract-character-images.ts <ZIP폴더경로>');
    console.error(
      '예시: npx tsx scripts/extract-character-images.ts "C:/Users/Downloads/er-patch"'
    );
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`경로를 찾을 수 없습니다: ${inputPath}`);
    process.exit(1);
  }

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`출력 디렉토리 생성: ${OUTPUT_DIR}`);
  }

  // 임시 디렉토리에 압축 해제
  const tempDir = path.join(process.cwd(), 'temp_character_extract');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  // ZIP 파일 목록 가져오기
  const stats = fs.statSync(inputPath);
  let zipFiles: string[] = [];

  if (stats.isDirectory()) {
    // 폴더인 경우 내부의 모든 ZIP 파일 찾기
    const files = fs.readdirSync(inputPath);
    zipFiles = files
      .filter((f) => f.endsWith('.zip'))
      .sort()
      .map((f) => path.join(inputPath, f));
    console.log(`${zipFiles.length}개의 ZIP 파일 발견`);
  } else if (inputPath.endsWith('.zip')) {
    // 단일 ZIP 파일
    zipFiles = [inputPath];
  } else {
    console.error('ZIP 파일 또는 ZIP 파일이 있는 폴더를 지정해주세요.');
    process.exit(1);
  }

  // 각 ZIP 파일 순차 처리
  for (let i = 0; i < zipFiles.length; i++) {
    const zipPath = zipFiles[i];
    const zipName = path.basename(zipPath);
    console.log(`\n[${i + 1}/${zipFiles.length}] ${zipName} 압축 해제 중...`);

    try {
      // PowerShell을 사용하여 압축 해제 (Windows)
      execSync(
        `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force"`,
        { stdio: 'inherit' }
      );
    } catch {
      console.error(`압축 해제 실패: ${zipName}`);
      continue;
    }
  }

  console.log('\nMini 이미지 추출 중...');

  // 추출된 폴더에서 Mini 이미지 찾기
  let extractedCount = 0;
  const errors: string[] = [];

  function findAndCopyMiniImages(dir: string): void {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        // "02. Default" 또는 "02. Default - 기본" 형태의 폴더 찾기
        if (item.name.startsWith('02. Default')) {
          const defaultItems = fs.readdirSync(fullPath);
          for (const file of defaultItems) {
            if (file.endsWith('_Mini_00.png')) {
              const characterName = file.replace('_Mini_00.png', '');
              const destPath = path.join(OUTPUT_DIR, `${characterName}.png`);

              // 이미 추출된 경우 스킵
              if (fs.existsSync(destPath)) {
                continue;
              }

              try {
                fs.copyFileSync(path.join(fullPath, file), destPath);
                console.log(`✓ ${characterName}`);
                extractedCount++;
              } catch (err) {
                errors.push(`${characterName}: ${err}`);
              }
            }
          }
        } else {
          // 하위 디렉토리 재귀 탐색
          findAndCopyMiniImages(fullPath);
        }
      }
    }
  }

  findAndCopyMiniImages(tempDir);

  // 임시 디렉토리 정리
  console.log('\n임시 파일 정리 중...');
  fs.rmSync(tempDir, { recursive: true });

  console.log(`\n완료! ${extractedCount}개 이미지 추출됨`);
  console.log(`저장 위치: ${OUTPUT_DIR}`);

  if (errors.length > 0) {
    console.log('\n오류 발생:');
    errors.forEach((err) => console.log(`  - ${err}`));
  }
}

main().catch(console.error);
