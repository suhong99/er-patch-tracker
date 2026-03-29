---
description: ESLint 자동 수정 + Prettier 포맷. "린트 고쳐줘", "포맷 맞춰줘", "ESLint 에러 수정", 코드 수정 후 lint 검사가 필요할 때 활성화.
---

ESLint 자동 수정 후 Prettier 포맷을 적용합니다.

## 단계

```bash
npx eslint . --fix
npm run format
```

이후 남은 lint 에러가 있으면 수동으로 확인하고 수정하세요:

```bash
npm run lint
```

> Tailwind v4 문법 주의: `bg-gradient-to-*` → `bg-linear-to-*`
