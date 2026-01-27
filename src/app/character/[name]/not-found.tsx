'use client';

import Link from 'next/link';

export default function CharacterNotFound(): React.ReactElement {
  const handleRefresh = (): void => {
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0b0f]">
      <div className="px-4 text-center">
        <h1 className="mb-4 text-8xl font-bold text-violet-500">404</h1>
        <h2 className="mb-2 text-2xl font-semibold text-gray-200">실험체를 찾을 수 없습니다</h2>
        <p className="mb-1 text-gray-400">
          존재하지 않는 실험체이거나, 업데이트로 인해 페이지가 재생성 중입니다.
        </p>
        <p className="mb-8 text-sm text-gray-500">
          10분 이내에 완료되니 잠시 후 다시 시도해 주세요.
        </p>

        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <button
            onClick={handleRefresh}
            className="rounded-lg bg-violet-600 px-6 py-3 font-medium text-white transition-colors hover:bg-violet-500"
          >
            새로고침
          </button>
          <Link
            href="/"
            className="rounded-lg bg-gray-700 px-6 py-3 font-medium text-white transition-colors hover:bg-gray-600"
          >
            실험체 목록으로
          </Link>
        </div>
      </div>
    </div>
  );
}
