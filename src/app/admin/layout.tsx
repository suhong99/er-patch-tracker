'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AdminHeader } from '@/components/admin/AdminHeader';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // 로딩 중이면 대기
    if (loading) return;

    // 로그인 페이지는 인증 체크 스킵
    if (pathname === '/admin/login') return;

    // 로그인되지 않은 경우 로그인 페이지로 리다이렉트
    if (!user) {
      router.push('/admin/login');
      return;
    }

    // 관리자가 아닌 경우
    if (!isAdmin) {
      router.push('/admin/login');
    }
  }, [user, loading, isAdmin, pathname, router]);

  // 로딩 중 표시
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    );
  }

  // 로그인 페이지는 헤더 없이 렌더링
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // 인증되지 않았거나 관리자가 아닌 경우
  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-center">
          <div className="text-gray-400 mb-4">접근 권한이 없습니다.</div>
          <a href="/admin/login" className="text-violet-400 hover:text-violet-300">
            로그인 페이지로 이동
          </a>
        </div>
      </div>
    );
  }

  // 인증된 관리자
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <AdminHeader />
      <main>{children}</main>
    </div>
  );
}
