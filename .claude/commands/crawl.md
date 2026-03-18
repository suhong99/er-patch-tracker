---
description: 크롤링/파싱 로직 개선 작업. "파서 고쳐줘", "파싱이 이상해", "데이터가 틀렸어", "크롤링 스크립트 수정" 등 파싱 결과가 잘못됐을 때 활성화. 비교 → 로직 수정 → 테스트 순서로 진행.
---

파싱 로직 개선 워크플로우를 따라 진행하세요.

## 핵심 파일 먼저 읽기

```
scripts/parse-balance-changes.ts   ← 핵심 파싱 로직 (수정 대상)
scripts/CLAUDE.md                  ← changeCategory 분류 기준 등 컨텍스트
scripts/tests/parse.test.ts        ← 기존 테스트 케이스
```

## 워크플로우

### 1단계: 문제가 있는 패치 픽스처 생성

실제 사이트에서 HTML을 크롤링하고, 현재 파싱 로직으로 파싱한 결과를 저장:

```bash
npx tsx scripts/tests/generate-fixtures.ts --patches=<patchId>
# 결과: scripts/tests/fixtures/<patchId>/content.html (원본 HTML)
#       scripts/tests/fixtures/<patchId>/expected.json (파싱 결과)
```

### 2단계: 파싱 결과 vs Firestore(관리자 수정본) 비교

현재 파싱 결과와 관리자가 직접 수정한 Firestore 데이터를 비교해서 차이 확인:

```bash
npx tsx scripts/tests/compare-with-firestore.ts --patches=<patchId>
# ✅ 일치 / ⚠️ 불일치 / ❌ 누락 출력
```

불일치 항목이 파싱 로직 개선 목표.

### 3단계: parse-balance-changes.ts 수정

`content.html`을 직접 읽어 HTML 구조를 파악한 후 로직 개선:

```
scripts/tests/fixtures/<patchId>/content.html  ← 실제 문제가 된 HTML
```

### 4단계: 테스트로 검증

```bash
npm test
```

픽스처 기반 회귀 테스트 통과 확인. 기존 픽스처들이 깨지지 않는지 반드시 확인.

## changeCategory 분류 기준 (참고)

```
'numeric'  → before/after 모두 숫자로 시작
'mechanic' → 둘 다 텍스트로 시작
'added'    → before가 없음/X
'removed'  → after가 삭제/없음
'unknown'  → 위 조건에 안 맞음 (수동 검토 필요)
```

괄호 내 숫자 무시: `findFirstNumberIndexOutsideParens()` 함수 참고.
