#!/bin/bash
# Forced Skill Evaluation Hook
# 매 프롬프트마다 스킬 활성화 여부를 강제 평가

cat << 'EOF'
[SKILL EVALUATION REQUIRED]
응답하기 전에 아래 스킬을 반드시 평가하세요.

Step 1 - EVALUATE: 각 스킬에 YES/NO와 이유를 명시하세요.
- /work-log: 새 개발 작업(기능/버그/리팩토링)을 시작하는가?
- /crawl-fix: 기존 크롤링/파싱 스크립트의 결과가 잘못됐거나 로직을 개선하는가?
- /crawl-new: 완전히 새로운 크롤링 스크립트를 추가하는가?
- /lint-fix: 린트 수정 또는 포맷팅이 필요한가?
- /ui: Next.js 컴포넌트/페이지/레이아웃/UI 작업인가? (Tailwind 클래스, Server Component 등 포함)

Step 2 - ACTIVATE: YES인 스킬은 Skill() 도구로 즉시 활성화하세요.
Step 3 - IMPLEMENT: 스킬 활성화 후 작업을 진행하세요.
EOF
