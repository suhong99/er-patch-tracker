---
description: 새로운 크롤링 스크립트 추가. "OOO 데이터 크롤링 만들어줘", "새 크롤러 추가", "OOO 사이트에서 데이터 수집" 등 완전히 새로운 크롤링 파이프라인을 만들 때 활성화. 스크립트 작성 → Firebase 연동 → GitHub Actions 추가 순서로 진행.
---

새 크롤링 스크립트 추가 워크플로우를 따라 진행하세요.

## 기존 패턴 먼저 파악

새 스크립트 작성 전 기존 크롤러를 참고하세요:

```
scripts/crawl-patch-notes.ts   ← API 기반 크롤링 패턴
scripts/crawl-bug-fixes.ts     ← Puppeteer + 파서 분리 패턴
scripts/crawl-release-dates.ts ← 단순 크롤링 패턴
scripts/lib/firebase-admin.ts  ← Firebase 초기화
scripts/lib/revalidate.ts      ← Next.js 캐시 무효화
```

## 워크플로우

### 1단계: 대상 데이터 파악

- 어떤 사이트/API에서 수집하나요?
- Firestore 어느 컬렉션에 저장하나요?
- 기존 스키마(`patchNotes`, `characters`)와 연관이 있나요?
- 캐시 무효화(`triggerRevalidation`)가 필요한가요?

### 2단계: 스크립트 작성

파일명 규칙: `scripts/crawl-<데이터명>.ts`

기본 구조:

```typescript
/**
 * <데이터명> 크롤링 스크립트
 *
 * 사용법:
 *   npx tsx scripts/crawl-<데이터명>.ts            # 전체
 *   npx tsx scripts/crawl-<데이터명>.ts --dry-run   # 저장 안함
 *   npx tsx scripts/crawl-<데이터명>.ts --force     # 강제 재처리
 */

import { initFirebaseAdmin } from './lib/firebase-admin';
import { triggerRevalidation } from './lib/revalidate'; // 필요시

// 파싱 로직이 복잡하면 parse-<데이터명>.ts로 분리
```

CLI 옵션 패턴 (`crawl-bug-fixes.ts` 참고):

```typescript
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const patchesArg = args.find((a) => a.startsWith('--patches='));
const targetIds = patchesArg ? patchesArg.replace('--patches=', '').split(',').map(Number) : null;
```

### 3단계: 로컬 테스트

```bash
# 환경변수: 프로젝트 루트에 firebase-service-account.json 필요
npx tsx scripts/crawl-<데이터명>.ts --dry-run
npx tsx scripts/crawl-<데이터명>.ts --patches=<id>  # 특정 대상만
```

### 4단계: GitHub Actions 연동

`.github/workflows/update-balance-data.yml`에 step 추가:

```yaml
- name: <데이터명> 크롤링
  env:
    FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
    SITE_URL: ${{ secrets.SITE_URL }} # 필요시
    REVALIDATE_SECRET: ${{ secrets.REVALIDATE_SECRET }} # 필요시
  run: npx tsx scripts/crawl-<데이터명>.ts
```

**기존 파이프라인 순서 확인** (의존 관계가 있으면 순서 지켜야 함):

```
1. crawl-patch-notes.ts   → patchNotes 컬렉션
2. validate-links.ts      → hasCharacterData 표시
3. parse-balance-changes.ts → characters 컬렉션
```

새 스크립트가 `patchNotes`에 의존한다면 `crawl-patch-notes.ts` 이후에 추가.

### 5단계: 파서가 복잡한 경우 - 픽스처 테스트 추가

파싱 로직이 복잡하다면 테스트 픽스처 추가:

```
scripts/tests/fixtures/<patchId>/content.html   ← 원본 HTML
scripts/tests/fixtures/<patchId>/<type>.json    ← 파싱 결과
scripts/tests/generate-<type>-fixtures.ts       ← 픽스처 생성기
```

`scripts/tests/parse.test.ts`에 테스트 케이스 추가 후:

```bash
npm test
```

## 환경 변수 확인

| 변수                       | 용도                   | 필요한 경우              |
| -------------------------- | ---------------------- | ------------------------ |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase 연결          | 항상                     |
| `SITE_URL`                 | 크롤링 대상 사이트 URL | 공식 사이트 크롤링 시    |
| `REVALIDATE_SECRET`        | Next.js 캐시 무효화    | 화면에 바로 반영 필요 시 |
