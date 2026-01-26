'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type {
  FeedbackType,
  FeedbackCategory,
  CharacterFeedbackCategory,
  GeneralFeedbackCategory,
} from '@/types/feedback';
import { CATEGORY_LABELS, CATEGORY_DESCRIPTIONS } from '@/types/feedback';

const CHARACTER_CATEGORIES: CharacterFeedbackCategory[] = ['error', 'improvement', 'suggestion'];
const GENERAL_CATEGORIES: GeneralFeedbackCategory[] = ['ui', 'feature', 'other'];

function FeedbackForm(): React.ReactElement {
  const searchParams = useSearchParams();

  // URL 파라미터에서 초기값 가져오기
  const initialCharacter = searchParams.get('character') ?? '';
  const initialPatchId = searchParams.get('patchId') ?? '';
  const initialType =
    (searchParams.get('type') as FeedbackType) ?? (initialCharacter ? 'character' : 'general');

  const [type, setType] = useState<FeedbackType>(initialType);
  const [category, setCategory] = useState<FeedbackCategory>(type === 'character' ? 'error' : 'ui');
  const [characterName, setCharacterName] = useState(initialCharacter);
  const [patchId, setPatchId] = useState(initialPatchId);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 타입 변경 시 카테고리 초기화
  useEffect(() => {
    if (type === 'character') {
      setCategory('error');
    } else {
      setCategory('ui');
      setCharacterName('');
      setPatchId('');
    }
  }, [type]);

  const categories = type === 'character' ? CHARACTER_CATEGORIES : GENERAL_CATEGORIES;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const feedbackData = {
        type,
        category,
        title,
        content,
        ...(type === 'character' && characterName && { characterName }),
        ...(patchId && { patchId }),
      };

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(feedbackData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? '피드백 제출에 실패했습니다');
      }

      setIsSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '피드백 제출 중 오류가 발생했습니다. 다시 시도해주세요.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = (): void => {
    setTitle('');
    setContent('');
    setPatchId('');
    setIsSubmitted(false);
    setError(null);
  };

  if (isSubmitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0f] p-4">
        <div className="w-full max-w-md rounded-xl border border-[#2a2d35] bg-[#13151a] p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <svg
              className="h-8 w-8 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-zinc-100">피드백 제출 완료</h2>
          <p className="mb-6 text-zinc-400">소중한 의견 감사합니다. 검토 후 반영하겠습니다.</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleReset}
              className="rounded-lg bg-violet-600 px-6 py-2 font-medium text-white transition-colors hover:bg-violet-500"
            >
              추가 피드백하기
            </button>
            <button
              onClick={() => window.close()}
              className="rounded-lg border border-[#2a2d35] px-6 py-2 font-medium text-zinc-400 transition-colors hover:bg-white/5"
            >
              창 닫기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0b0f]">
      {/* 배경 효과 */}
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.1),transparent_50%)]"
        aria-hidden="true"
      />

      <main className="relative mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <header className="mb-8">
          <h1 className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-3xl font-black tracking-tight text-transparent">
            피드백 보내기
          </h1>
          <p className="mt-2 text-zinc-500">패치 정보 오류나 개선 사항을 알려주세요</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 피드백 유형 선택 */}
          <div>
            <label className="mb-3 block text-sm font-medium text-zinc-300">피드백 유형</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setType('character')}
                className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                  type === 'character'
                    ? 'border-violet-500 bg-violet-500/10 text-violet-400'
                    : 'border-[#2a2d35] bg-[#13151a] text-zinc-400 hover:border-zinc-600'
                }`}
              >
                실험체 관련
              </button>
              <button
                type="button"
                onClick={() => setType('general')}
                className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                  type === 'general'
                    ? 'border-violet-500 bg-violet-500/10 text-violet-400'
                    : 'border-[#2a2d35] bg-[#13151a] text-zinc-400 hover:border-zinc-600'
                }`}
              >
                일반 문의
              </button>
            </div>
          </div>

          {/* 카테고리 선택 */}
          <div>
            <label className="mb-3 block text-sm font-medium text-zinc-300">카테고리</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    category === cat
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-[#2a2d35] bg-[#13151a] hover:border-zinc-600'
                  }`}
                >
                  <span
                    className={`block text-sm font-medium ${
                      category === cat ? 'text-violet-400' : 'text-zinc-300'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {CATEGORY_DESCRIPTIONS[cat]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 실험체 이름 (실험체 관련일 때만) */}
          {type === 'character' && (
            <div>
              <label
                htmlFor="characterName"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                실험체 이름
              </label>
              <input
                type="text"
                id="characterName"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                placeholder="예: 재키"
                className="w-full rounded-lg border border-[#2a2d35] bg-[#13151a] px-4 py-3 text-zinc-100 placeholder-zinc-600 transition-colors focus:border-violet-500 focus:outline-none"
              />
            </div>
          )}

          {/* 패치 ID (선택) */}
          {type === 'character' && (
            <div>
              <label htmlFor="patchId" className="mb-2 block text-sm font-medium text-zinc-300">
                패치 ID <span className="text-zinc-500">(선택)</span>
              </label>
              <input
                type="text"
                id="patchId"
                value={patchId}
                onChange={(e) => setPatchId(e.target.value)}
                placeholder="패치 버전 클릭 시 복사됩니다"
                className="w-full rounded-lg border border-[#2a2d35] bg-[#13151a] px-4 py-3 text-zinc-100 placeholder-zinc-600 transition-colors focus:border-violet-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-zinc-500">
                실험체 상세 페이지에서 패치 버전(v1.24.0)을 클릭하면 ID가 복사됩니다
              </p>
            </div>
          )}

          {/* 제목 */}
          <div>
            <label htmlFor="title" className="mb-2 block text-sm font-medium text-zinc-300">
              제목
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="피드백 제목을 입력하세요"
              className="w-full rounded-lg border border-[#2a2d35] bg-[#13151a] px-4 py-3 text-zinc-100 placeholder-zinc-600 transition-colors focus:border-violet-500 focus:outline-none"
            />
          </div>

          {/* 내용 */}
          <div>
            <label htmlFor="content" className="mb-2 block text-sm font-medium text-zinc-300">
              내용
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={6}
              placeholder="자세한 내용을 입력하세요"
              className="w-full resize-none rounded-lg border border-[#2a2d35] bg-[#13151a] px-4 py-3 text-zinc-100 placeholder-zinc-600 transition-colors focus:border-violet-500 focus:outline-none"
            />
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-400">
              {error}
            </div>
          )}

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-violet-600 px-6 py-3 font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? '제출 중...' : '피드백 보내기'}
          </button>
        </form>
      </main>
    </div>
  );
}

export default function FeedbackPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0a0b0f]">
          <div className="text-zinc-500">로딩 중...</div>
        </div>
      }
    >
      <FeedbackForm />
    </Suspense>
  );
}
