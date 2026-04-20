'use client';

import Link from 'next/link';

export default function StatsDetailNotFound(): React.ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0b0f]">
      <div className="px-4 text-center">
        <h1 className="mb-4 text-8xl font-bold text-indigo-500">404</h1>
        <h2 className="mb-2 text-2xl font-semibold text-zinc-200">실험체를 찾을 수 없습니다</h2>
        <p className="mb-8 text-zinc-400">스텟 데이터가 없거나 존재하지 않는 실험체입니다.</p>
        <Link
          href="/stats"
          className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white transition-colors hover:bg-indigo-500"
        >
          스텟 랭킹으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
