'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { FeedbackStatus, FeedbackType, FeedbackCategory } from '@/types/feedback';
import { CATEGORY_LABELS, STATUS_LABELS, STATUS_COLORS } from '@/types/feedback';

type FeedbackItem = {
  id: string;
  type: FeedbackType;
  category: FeedbackCategory;
  characterName?: string;
  patchId?: string;
  title: string;
  content: string;
  createdAt: { _seconds: number };
  status: FeedbackStatus;
};

type FeedbackResponse = {
  feedbacks: FeedbackItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const STATUS_OPTIONS: FeedbackStatus[] = ['unread', 'read', 'resolved', 'rejected'];
const TYPE_OPTIONS: { value: FeedbackType | ''; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'character', label: '실험체 관련' },
  { value: 'general', label: '일반 문의' },
];

export default function AdminFeedbackPage(): React.ReactElement {
  const { user } = useAuth();
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 필터 상태
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<FeedbackType | ''>('');

  // 페이지네이션 상태
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // 선택된 피드백 (상세 보기)
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);

  const fetchFeedbacks = useCallback(async (): Promise<void> => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);

      const response = await fetch(`/api/admin/feedback?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('피드백 목록을 불러오는데 실패했습니다');
      }

      const data = (await response.json()) as FeedbackResponse;
      setFeedbacks(data.feedbacks);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }, [user, page, statusFilter, typeFilter]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  // 필터 변경 시 페이지 초기화
  useEffect(() => {
    setPage(1);
  }, [statusFilter, typeFilter]);

  const updateStatus = async (id: string, newStatus: FeedbackStatus): Promise<void> => {
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('상태 업데이트 실패');
      }

      // 로컬 상태 업데이트
      setFeedbacks((prev) => prev.map((f) => (f.id === id ? { ...f, status: newStatus } : f)));

      if (selectedFeedback?.id === id) {
        setSelectedFeedback({ ...selectedFeedback, status: newStatus });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류가 발생했습니다');
    }
  };

  const deleteFeedback = async (id: string): Promise<void> => {
    if (!user) return;
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/feedback/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('삭제 실패');
      }

      setFeedbacks((prev) => prev.filter((f) => f.id !== id));
      setSelectedFeedback(null);
      setTotal((prev) => prev - 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류가 발생했습니다');
    }
  };

  const formatDate = (timestamp: { _seconds: number }): string => {
    return new Date(timestamp._seconds * 1000).toLocaleString('ko-KR');
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="mb-2 text-2xl font-bold text-white">피드백 관리</h1>
        <p className="text-gray-400">총 {total}개의 피드백이 있습니다</p>
      </div>

      {/* 필터 */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-[#2a2d35] bg-[#13151a] p-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">상태:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FeedbackStatus | '')}
            className="rounded border border-[#2a2d35] bg-[#0a0b0f] px-3 py-1.5 text-sm text-white"
          >
            <option value="">전체</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">유형:</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as FeedbackType | '')}
            className="rounded border border-[#2a2d35] bg-[#0a0b0f] px-3 py-1.5 text-sm text-white"
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => {
            setStatusFilter('');
            setTypeFilter('');
          }}
          className="text-sm text-gray-400 hover:text-white"
        >
          필터 초기화
        </button>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="mb-6 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-rose-400">
          {error}
        </div>
      )}

      {/* 로딩 */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">로딩 중...</div>
      ) : feedbacks.length === 0 ? (
        <div className="py-12 text-center text-gray-400">피드백이 없습니다</div>
      ) : (
        <>
          {/* 피드백 목록 */}
          <div className="mb-6 overflow-hidden rounded-lg border border-[#2a2d35]">
            <table className="w-full">
              <thead className="bg-[#13151a]">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">상태</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">유형</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">
                    카테고리
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">제목</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">실험체</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">등록일</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2d35]">
                {feedbacks.map((feedback) => (
                  <tr
                    key={feedback.id}
                    className={`cursor-pointer transition-colors hover:bg-white/5 ${
                      selectedFeedback?.id === feedback.id ? 'bg-violet-500/10' : ''
                    }`}
                    onClick={() => setSelectedFeedback(feedback)}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[feedback.status].bg} ${STATUS_COLORS[feedback.status].text} ${STATUS_COLORS[feedback.status].border}`}
                      >
                        {STATUS_LABELS[feedback.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {feedback.type === 'character' ? '실험체' : '일반'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {CATEGORY_LABELS[feedback.category]}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-sm text-white">
                      {feedback.title}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {feedback.characterName ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {formatDate(feedback.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFeedback(feedback.id);
                        }}
                        className="text-xs text-rose-400 hover:text-rose-300"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded border border-[#2a2d35] px-3 py-1.5 text-sm text-gray-400 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                이전
              </button>
              <span className="px-4 text-sm text-gray-400">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded border border-[#2a2d35] px-3 py-1.5 text-sm text-gray-400 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                다음
              </button>
            </div>
          )}
        </>
      )}

      {/* 상세 보기 모달 */}
      {selectedFeedback && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedFeedback(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#2a2d35] bg-[#13151a] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedFeedback.title}</h2>
                <p className="mt-1 text-sm text-gray-400">
                  {formatDate(selectedFeedback.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setSelectedFeedback(null)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* 메타 정보 */}
            <div className="mb-6 flex flex-wrap gap-3">
              <span
                className={`rounded border px-2 py-1 text-xs font-medium ${STATUS_COLORS[selectedFeedback.status].bg} ${STATUS_COLORS[selectedFeedback.status].text} ${STATUS_COLORS[selectedFeedback.status].border}`}
              >
                {STATUS_LABELS[selectedFeedback.status]}
              </span>
              <span className="rounded border border-[#2a2d35] bg-[#0a0b0f] px-2 py-1 text-xs text-gray-300">
                {selectedFeedback.type === 'character' ? '실험체 관련' : '일반 문의'}
              </span>
              <span className="rounded border border-[#2a2d35] bg-[#0a0b0f] px-2 py-1 text-xs text-gray-300">
                {CATEGORY_LABELS[selectedFeedback.category]}
              </span>
            </div>

            {/* 실험체 / 패치 ID */}
            {(selectedFeedback.characterName || selectedFeedback.patchId) && (
              <div className="mb-6 rounded-lg border border-[#2a2d35] bg-[#0a0b0f] p-4">
                {selectedFeedback.characterName && (
                  <p className="text-sm">
                    <span className="text-gray-400">실험체: </span>
                    <span className="text-white">{selectedFeedback.characterName}</span>
                  </p>
                )}
                {selectedFeedback.patchId && (
                  <p className="mt-1 text-sm">
                    <span className="text-gray-400">패치 ID: </span>
                    <span className="font-mono text-cyan-400">{selectedFeedback.patchId}</span>
                  </p>
                )}
              </div>
            )}

            {/* 내용 */}
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-gray-400">내용</h3>
              <div className="whitespace-pre-wrap rounded-lg border border-[#2a2d35] bg-[#0a0b0f] p-4 text-sm text-gray-200">
                {selectedFeedback.content}
              </div>
            </div>

            {/* 상태 변경 */}
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-400">상태 변경</h3>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((status) => (
                  <button
                    key={status}
                    onClick={() => updateStatus(selectedFeedback.id, status)}
                    disabled={selectedFeedback.status === status}
                    className={`rounded border px-3 py-1.5 text-sm transition-colors ${
                      selectedFeedback.status === status
                        ? `${STATUS_COLORS[status].bg} ${STATUS_COLORS[status].text} ${STATUS_COLORS[status].border}`
                        : 'border-[#2a2d35] text-gray-400 hover:bg-white/5'
                    } disabled:cursor-not-allowed`}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
