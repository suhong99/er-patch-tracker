// 피드백 타입
export type FeedbackType = 'character' | 'general';

// 실험체 관련 피드백 카테고리
export type CharacterFeedbackCategory = 'error' | 'improvement' | 'suggestion';

// 일반 피드백 카테고리
export type GeneralFeedbackCategory = 'ui' | 'feature' | 'other';

// 전체 피드백 카테고리
export type FeedbackCategory = CharacterFeedbackCategory | GeneralFeedbackCategory;

// 피드백 상태
export type FeedbackStatus = 'unread' | 'read' | 'resolved' | 'rejected';

// 상태 라벨
export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  unread: '읽지 않음',
  read: '읽음',
  resolved: '처리 완료',
  rejected: '기각',
};

// 상태별 색상 (UI용)
export const STATUS_COLORS: Record<FeedbackStatus, { bg: string; text: string; border: string }> = {
  unread: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/40' },
  read: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/40' },
  resolved: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/40' },
  rejected: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/40' },
};

// 피드백 데이터 (Firestore 저장용)
export type Feedback = {
  id?: string;
  type: FeedbackType;
  category: FeedbackCategory;
  characterName?: string; // 실험체 피드백인 경우
  patchId?: string; // 관련 패치 ID (선택)
  title: string;
  content: string;
  createdAt: Date;
  status: FeedbackStatus;
};

// 피드백 생성 요청 타입
export type CreateFeedbackRequest = Omit<Feedback, 'id' | 'createdAt' | 'status'>;

// 카테고리 라벨
export const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  error: '오류 정정',
  improvement: '개선 요청',
  suggestion: '건의 사항',
  ui: 'UI/UX 피드백',
  feature: '기능 요청',
  other: '기타 문의',
};

// 카테고리별 설명
export const CATEGORY_DESCRIPTIONS: Record<FeedbackCategory, string> = {
  error: '잘못된 패치 정보, 누락된 데이터 등을 제보해주세요',
  improvement: '기존 정보의 개선이 필요한 부분을 알려주세요',
  suggestion: '새로운 아이디어나 제안사항을 남겨주세요',
  ui: '사용자 경험 개선에 대한 의견을 남겨주세요',
  feature: '추가되었으면 하는 기능을 요청해주세요',
  other: '그 외 문의사항을 남겨주세요',
};
