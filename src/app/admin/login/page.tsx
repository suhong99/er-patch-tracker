'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/admin/LoginForm';

export default function AdminLoginPage(): React.JSX.Element {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && isAdmin) {
      router.push('/admin');
    }
  }, [user, loading, isAdmin, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">관리자 로그인</h1>
          <p className="text-gray-400">ER 패치 트래커 관리자 페이지</p>
        </div>

        <div className="bg-[var(--er-surface)] border border-[var(--er-border)] rounded-xl p-6">
          <LoginForm />
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-400 transition-colors">
            ← 홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
