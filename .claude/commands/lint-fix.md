---
description: ESLint 자동 수정 + Prettier 포맷. "린트 고쳐줘", "포맷 맞춰줘", "ESLint 에러 수정", 코드 수정 후 lint 검사가 필요할 때 활성화.
---

ESLint + Prettier 수정 워크플로우를 따라 진행하세요.

## 워크플로우

### 1단계: 현재 에러 파악

```bash
npm run lint
```

어떤 에러가 있는지 먼저 파악. auto-fix 가능한 것과 수동 수정이 필요한 것을 구분.

### 2단계: 자동 수정

```bash
npm run lint -- --fix
npm run format
```

### 3단계: 남은 에러 재확인

```bash
npm run lint
```

auto-fix로 해결 안 된 에러가 있으면 직접 수정하세요:

- **`@typescript-eslint/*` 에러** → 타입 선언, `any` 제거, 반환 타입 추가 등 직접 수정
- **`react-hooks/*` 에러** → 의존성 배열 직접 수정
- **`import/*` 에러** → import 순서/경로 직접 수정

### 4단계: TypeScript 타입 에러가 의심되면

```bash
npx tsc --noEmit
```

ESLint는 TypeScript 타입 에러를 완전히 잡지 못함. 빌드 에러가 있으면 타입 체크도 확인.

### 5단계: 최종 확인

```bash
npm run lint
npm run format:check
```

두 명령 모두 에러 없이 통과해야 완료.

## 이 프로젝트 주의사항

- `any` 금지, 명시적 반환 타입 선언 필수 (CLAUDE.md 규칙)
- Tailwind 클래스 → ESLint가 잡지 못하므로 `bg-gradient-to-*` 사용 여부는 직접 확인
- `scripts/` 디렉토리는 lint 대상에 포함됨
