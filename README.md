# 이터널리턴 패치 트래커

> 이터널리턴 실험체(캐릭터)의 패치 히스토리를 추적하고, 스탯 랭킹 및 버그 현황을 시각화하는 웹 애플리케이션

<div>
  <img src="https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" />
</div>

<br />

<!-- 🖼️ 메인 스크린샷 -->

![메인 화면](https://github.com/user-attachments/assets/4e2b3c94-afa2-4496-a923-471560f2cc40)

---

## 주요 기능

### 패치 히스토리 추적

캐릭터별 모든 패치 내역을 타임라인으로 조회합니다. 버프/너프/변경 유형을 색상으로 구분하고, 연속 버프·너프 스트릭을 표시합니다.

<!-- 🖼️ 패치 히스토리 스크린샷 -->

![패치 히스토리](https://github.com/user-attachments/assets/4e2b3c94-afa2-4496-a923-471560f2cc40)

### 스탯 랭킹

체력·공격력·이동속도 등 15개 이상의 스탯 카테고리별 전체 실험체 순위를 제공합니다. 동일 수치는 동등 순위(1, 1, 3, ...)로 처리합니다.

<!-- 🖼️ 스탯 랭킹 스크린샷 -->

![스탯 랭킹](https://github.com/user-attachments/assets/ee72b0eb-edad-431d-b015-f12b1a999665)

### 버그 트래커

공식 패치노트에서 버그 수정 내역을 자동 분류하여 캐릭터별 버그 이력을 관리합니다.

<!-- 🖼️ 버그 트래커 스크린샷 -->

![버그 트래커](https://github.com/user-attachments/assets/5dad38b0-16d3-48d6-871f-0c5dd19fda00)

### 관리자 페이지

Firebase Auth 기반 인증으로 패치 데이터를 직접 추가·수정·삭제합니다. On-demand 캐시 무효화로 배포 없이 즉시 반영됩니다.

<!-- 🖼️ 관리자 페이지 스크린샷 -->

![관리자 페이지](https://github.com/user-attachments/assets/7de7e0b0-92d3-43fd-8755-54d18a9670de)

---

## 기술 스택

| 분류       | 기술                              |
| ---------- | --------------------------------- |
| 프레임워크 | Next.js 16 (App Router), React 19 |
| 언어       | TypeScript                        |
| 스타일     | Tailwind CSS 4                    |
| 백엔드     | Firebase Firestore, Firebase Auth |
| 크롤링     | Puppeteer, Cheerio                |
| 배포       | Vercel                            |

---

## 아키텍처

```
사용자 요청
  └─ Next.js App Router (Server Components 기본)
       ├─ Firestore 데이터 로드 (unstable_cache, 1h TTL)
       ├─ 관리자 API → 데이터 수정 + On-demand 캐시 무효화
       └─ 크롤링 스크립트 (Puppeteer + dak.gg) → Firestore 저장
```

---

## 페이지 구조

| 경로                | 설명                              |
| ------------------- | --------------------------------- |
| `/`                 | 전체 실험체 목록 + 최근 패치 현황 |
| `/character/[name]` | 캐릭터별 패치 히스토리 상세       |
| `/stats`            | 스탯 카테고리별 전체 랭킹         |
| `/stats/[name]`     | 캐릭터 스탯 상세                  |
| `/bugs`             | 전체 버그 트래커                  |
| `/bugs/[name]`      | 캐릭터별 버그 이력                |
| `/admin`            | 관리자 대시보드 (인증 필요)       |

---

## 커밋 컨벤션

```
[타입] 설명
```

| 타입     | 설명            |
| -------- | --------------- |
| feat     | 기능 추가       |
| fix      | 버그 수정       |
| refactor | 리팩토링        |
| docs     | 문서 추가/수정  |
| chore    | 설정, 빌드 관련 |
| test     | 테스트 코드     |

---

## 데이터 출처

- 패치노트: [이터널리턴 공식 사이트](https://playeternalreturn.com) 크롤링
- 수집 시작일: 2023-05-16
