---
description: 기존 크롤링/파싱 로직 개선. "파싱이 이상해", "데이터가 틀렸어", "크롤링 결과가 잘못됨", "파서 수정" 등 기존 스크립트의 결과가 잘못됐을 때 활성화. 픽스처 생성 → Firestore 비교 → 로직 수정 → 테스트 순서로 진행.
---

기존 크롤링/파싱 로직 개선 워크플로우를 따라 진행하세요.

## 어떤 파서를 수정하나요?

먼저 어떤 파서가 문제인지 파악하세요:

| 파서            | 파일                                                       | 픽스처 생성                                                     |
| --------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| 밸런스 변경사항 | `scripts/parse-balance-changes.ts`                         | `npx tsx scripts/tests/generate-fixtures.ts --patches=<id>`     |
| 버그 수정       | `scripts/parse-bug-fixes.ts` (crawl-bug-fixes.ts에서 사용) | `npx tsx scripts/tests/generate-bug-fixtures.ts --patches=<id>` |

## 핵심 파일 먼저 읽기

```
scripts/parse-balance-changes.ts   ← 밸런스 파싱 로직
scripts/parse-bug-fixes.ts         ← 버그 수정 파싱 로직
scripts/CLAUDE.md                  ← changeCategory 분류 기준 등 컨텍스트
scripts/tests/parse.test.ts        ← 기존 테스트 케이스
```

## 워크플로우

### 1단계: 문제가 있는 패치 픽스처 생성

실제 HTML을 크롤링하고 현재 파싱 결과를 저장:

```bash
# 밸런스 파서
npx tsx scripts/tests/generate-fixtures.ts --patches=<patchId>

# 버그 파서
npx tsx scripts/tests/generate-bug-fixtures.ts --patches=<patchId>

# 결과:
# scripts/tests/fixtures/<patchId>/content.html  (원본 HTML)
# scripts/tests/fixtures/<patchId>/expected.json (현재 파싱 결과)
# scripts/tests/fixtures/<patchId>/bugs.json     (버그 파서의 경우)
```

### 2단계: Firestore(관리자 수정본)와 비교

```bash
npx tsx scripts/tests/compare-with-firestore.ts --patches=<patchId>
# ✅ 일치 / ⚠️ 불일치 / ❌ 누락 출력
```

불일치 항목이 파싱 로직 개선 목표.

### 3단계: 파서 수정

`content.html`을 직접 읽어 HTML 구조를 파악한 후 로직 개선:

```
scripts/tests/fixtures/<patchId>/content.html  ← 실제 문제 HTML
```

### 4단계: 테스트로 검증

```bash
npm test
```

기존 픽스처들이 깨지지 않는지 반드시 확인.

## changeCategory 분류 기준 (밸런스 파서)

```
'numeric'  → before/after 모두 숫자로 시작
'mechanic' → 둘 다 텍스트로 시작
'added'    → before가 없음/X
'removed'  → after가 삭제/없음
'unknown'  → 위 조건에 안 맞음 (수동 검토 필요)
```

괄호 내 숫자 무시: `findFirstNumberIndexOutsideParens()` 함수 참고.
