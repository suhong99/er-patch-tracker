---
description: Next.js 컴포넌트, UI, 페이지, 레이아웃 작업 시 context7로 최신 문서 조회. "컴포넌트 만들어줘", "페이지 추가해줘", "UI 수정", "레이아웃 변경", Tailwind 클래스 작업 시 활성화.
---

UI/컴포넌트 작업 전 context7에서 이 프로젝트 버전에 맞는 문서를 조회하세요.

## 이 프로젝트 버전

- **Next.js 16.1.0** (App Router)
- **Tailwind CSS v4** (`bg-linear-to-*` 문법, `bg-gradient-to-*` 사용 금지)
- **React 19**

## context7 문서 조회

작업 내용에 따라 관련 문서만 조회하세요 (전부 다 조회할 필요 없음):

**Next.js 관련 작업 시** (라우팅, Server Component, API Route, 캐싱 등):

```
library-id: /vercel/next.js
version: v16.1.0
```

**Tailwind 관련 작업 시** (클래스, 레이아웃, 반응형 등):

```
library-id: /tailwindlabs/tailwindcss.com
```

## 핵심 규칙 (문서 조회 없이도 항상 적용)

- Server Component 기본, 필요시만 `'use client'`
- Tailwind 클래스만 사용 (인라인 스타일 금지)
- `bg-gradient-to-*` → `bg-linear-to-*` (Tailwind v4)
- 컴포넌트 파일명: PascalCase
