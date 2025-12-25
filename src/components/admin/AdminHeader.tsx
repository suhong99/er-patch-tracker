'use client';

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

export function AdminHeader(): React.JSX.Element {
  const { user, signOut } = useAuth();

  const handleSignOut = async (): Promise<void> => {
    await signOut();
  };

  return (
    <header className="bg-[var(--er-surface)] border-b border-[var(--er-border)]">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-xl font-bold text-white hover:text-violet-400 transition-colors">
            관리자 페이지
          </Link>
          <span className="px-2 py-1 bg-violet-600/20 border border-violet-500/30 rounded text-xs text-violet-400">
            ADMIN
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{user?.email}</span>
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            홈으로
          </Link>
          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 bg-rose-600/20 border border-rose-500/30 rounded text-sm text-rose-400 hover:bg-rose-600/30 transition-colors"
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
