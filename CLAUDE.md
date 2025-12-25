# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**이터널 리턴 패치 트래커** - 게임 캐릭터(실험체)별 밸런스 패치 히스토리를 추적하고 시각화하는 웹 애플리케이션

## 기술 스택

- **Next.js**: 16.1.0 (App Router)
- **React**: 19.2.3
- **TypeScript**: 5.x (strict mode)
- **Tailwind CSS**: 4.x
- **Firebase**: Firestore (데이터베이스) + Auth (관리자 인증)
- **Node.js**: 18+ 권장

## Build & Development Commands

- `npm run dev` - 개발 서버 (http://localhost:3000)
- `npm run build` - 프로덕션 빌드
- `npm run start` - 프로덕션 서버
- `npm run lint` - ESLint 실행

## 프로젝트 구조

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # 루트 레이아웃 (Providers 포함)
│   ├── page.tsx                  # 홈페이지 (캐릭터 목록 + 통계)
│   ├── globals.css               # 전역 스타일 + Tailwind 설정
│   ├── character/[name]/         # 캐릭터 상세 페이지 (SSG)
│   ├── admin/                    # 관리자 페이지
│   │   ├── layout.tsx            # 관리자 레이아웃 (인증 가드)
│   │   ├── page.tsx              # 관리자 대시보드
│   │   ├── login/page.tsx        # 로그인 페이지
│   │   └── character/[name]/     # 캐릭터 패치 수정 페이지
│   └── api/                      # API Routes
│       ├── auth/verify/          # 토큰 검증 API
│       └── admin/characters/     # 패치 수정 API
│
├── components/
│   ├── CharacterList.tsx         # 캐릭터 목록 (필터/정렬)
│   ├── CharacterCard.tsx         # 캐릭터 카드
│   ├── PatchCard.tsx             # 패치 상세 카드
│   ├── FilterSort.tsx            # 필터/정렬 UI
│   ├── Providers.tsx             # 클라이언트 프로바이더 (AuthProvider)
│   └── admin/                    # 관리자 전용 컴포넌트
│       ├── LoginForm.tsx
│       ├── AdminHeader.tsx
│       ├── AdminCharacterList.tsx
│       ├── AdminPatchList.tsx
│       ├── PatchEditForm.tsx     # 패치 수정 모달
│       └── ChangeEditRow.tsx     # 변경사항 수정 행
│
├── lib/
│   ├── firebase-admin.ts         # Firebase Admin SDK (서버 전용)
│   ├── firebase-client.ts        # Firebase Client SDK (클라이언트)
│   ├── patch-data.ts             # Firestore 데이터 로드 함수
│   └── patch-utils.ts            # 유틸리티 (필터, 정렬, 포맷)
│
├── contexts/
│   └── AuthContext.tsx           # 인증 상태 전역 관리
│
├── types/
│   └── patch.ts                  # 타입 정의 (Character, PatchEntry, Change 등)
│
scripts/                          # 데이터 크롤링/관리 스크립트
├── lib/firebase-admin.ts         # 스크립트용 Firebase Admin
├── crawl-patch-notes.ts          # 패치노트 크롤링 → Firestore
├── validate-links.ts             # 링크 검증 → hasCharacterData 표시
├── parse-balance-changes.ts      # 밸런스 변경 파싱 → characters 컬렉션
├── fix-change-data.ts            # 데이터 일괄 정리
├── fix-unknown-changes.ts        # unknown 카테고리 수동 수정
├── upload-fixed-data.ts          # JSON → Firestore 업로드
└── add-admin.ts                  # 관리자 등록
```

## Firebase 구조

```
Firestore Database:
├── characters/                   # 캐릭터별 패치 데이터
│   └── {캐릭터이름}/
│       ├── name: string
│       ├── stats: CharacterStats
│       └── patchHistory: PatchEntry[]
│
├── patchNotes/                   # 크롤링된 패치노트
│   └── {patchId}/
│       ├── id, title, link, createdAt
│       ├── status: 'success' | 'error' | ...
│       ├── hasCharacterData: boolean
│       └── isParsed: boolean
│
└── metadata/
    ├── balanceChanges            # 마지막 업데이트 시간
    ├── patchNotes                # 크롤링 메타데이터
    └── admins                    # 관리자 이메일 목록
        └── emails: string[]
```

## 주요 타입 (src/types/patch.ts)

```typescript
type ChangeType = 'buff' | 'nerf' | 'mixed';
type ChangeCategory = 'numeric' | 'mechanic' | 'added' | 'removed' | 'unknown';

type Change = {
  target: string;      // 스킬명 (예: "크래시 해머(Q)")
  stat: string;        // 변경 스탯 (예: "피해량")
  before: string;      // 변경 전 값
  after: string;       // 변경 후 값
  changeType: ChangeType;
  changeCategory?: ChangeCategory;
};

type PatchEntry = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  overallChange: ChangeType;
  streak: number;
  devComment: string | null;
  changes: Change[];
};

type Character = {
  name: string;
  stats: CharacterStats;
  patchHistory: PatchEntry[];
};
```

## 데이터 흐름

### 크롤링 파이프라인 (GitHub Actions - 매일 실행)
```
1. crawl-patch-notes.ts    → patchNotes 컬렉션에 새 패치노트 저장
2. validate-links.ts       → 각 패치노트 검증, hasCharacterData 표시
3. parse-balance-changes.ts → hasCharacterData인 패치 파싱 → characters 컬렉션
```

### 웹 앱 데이터 로드
```
loadBalanceData() → Firestore characters 컬렉션 조회
                  → extractCharacters()로 배열 변환
                  → 페이지에서 렌더링
```

### 관리자 수정 흐름
```
로그인 → Firebase Auth → ID Token 발급
      → API 요청 시 Authorization 헤더에 Token
      → 서버에서 Token 검증 + 관리자 확인
      → Firestore 데이터 수정
```

## 환경 변수

```env
# .env.local (gitignore됨)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# GitHub Actions Secret
FIREBASE_SERVICE_ACCOUNT=<JSON 문자열>
```

## 주요 파일 설명

| 파일 | 역할 |
|------|------|
| `src/lib/patch-data.ts` | Firestore에서 데이터 로드 (loadBalanceData, extractCharacters, findCharacterByName) |
| `src/lib/patch-utils.ts` | 필터/정렬 함수, 날짜 포맷, 변경 타입 라벨/색상 |
| `src/contexts/AuthContext.tsx` | Firebase Auth 상태 관리, signIn/signOut, isAdmin 체크 |
| `scripts/parse-balance-changes.ts` | 패치노트 HTML 파싱, 변경사항 추출, changeCategory 분류 |

**스타일링:**

- Tailwind CSS 4 사용 (`@import "tailwindcss"` 방식)
- `@theme inline` 디렉티브로 커스텀 색상/폰트 정의
- CSS 변수 기반 테마: `--background`, `--foreground`
- 다크모드: `prefers-color-scheme` 미디어 쿼리 자동 적용

**경로 별칭:**

- `@/*` → `./src/*`

## 개발 규칙

**TypeScript:**

- `any` 타입 사용 금지 → `unknown` 또는 구체적 타입 사용
- 모든 함수에 명시적 반환 타입 선언
- interface보다 type 선호 (일관성 유지)

**명명 규칙:**

- 컴포넌트: PascalCase (`UserProfile.tsx`)
- 함수/변수: camelCase (`getUserData`)
- 상수: UPPER_SNAKE_CASE (`API_BASE_URL`)
- 파일명: kebab-case (컴포넌트 제외)

**컴포넌트 작성:**

- Server Component 기본, 필요시에만 `'use client'` 사용
- Props는 별도 type으로 정의 (`type Props = { ... }`)
- 한 파일에 하나의 컴포넌트만 export

**스타일링:**

- 인라인 스타일 금지, Tailwind 클래스 사용
- 반복되는 스타일은 `@apply`로 추출하지 말고 컴포넌트화

**Git 워크플로우:**

- 브랜치 전략: Feature Branch 방식
  - `main`: 프로덕션 브랜치
  - `develop`: 개발 브랜치 (배포 후 사용 예정)
  - `feature/<이슈번호>`: 새 기능 개발 (예: `feature/12` - GitHub Issue #12)
  - `refactor/<이슈번호>`: 리팩토링 작업 (예: `refactor/15`)
  - `hotfix/<이슈번호>`: 긴급 버그 수정 (예: `hotfix/20`)
  - 작업 완료 후 PR을 통해 main(또는 develop)에 병합
- GitHub Issue로 작업 단위 관리
- 한글 커밋 메시지 사용
- 커밋 형식: `[타입] 설명` (예: `[기능] 로그인 페이지 추가`)
