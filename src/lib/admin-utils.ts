import { revalidatePath, revalidateTag } from 'next/cache';
import { adminAuth, db } from '@/lib/firebase-admin';

type AdminsDoc = {
  emails: string[];
};

/**
 * Authorization 헤더에서 토큰을 추출하고 관리자 권한을 검증합니다.
 * @param authHeader - Authorization 헤더 값 (Bearer {token})
 * @returns 관리자 여부
 */
export async function verifyAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const email = decodedToken.email;

    if (!email) return false;

    const adminDoc = await db.collection('metadata').doc('admins').get();
    if (!adminDoc.exists) return false;

    const adminData = adminDoc.data() as AdminsDoc;
    return adminData.emails?.includes(email) ?? false;
  } catch {
    return false;
  }
}

type InvalidateCacheOptions = {
  /** 무효화할 태그 목록 (기본: ['balance-data', 'patch-notes-data']) */
  tags?: string[];
  /** 무효화할 경로 목록 (기본: ['/', '/admin']) */
  paths?: string[];
  /** 동적 캐릭터 페이지도 무효화할지 여부 (기본: true) */
  includeCharacterPages?: boolean;
};

/**
 * 밸런스 데이터 관련 캐시를 무효화합니다.
 * - unstable_cache로 캐싱된 데이터 (태그 기반)
 * - 정적/동적 페이지 캐시 (경로 기반)
 */
export function invalidateBalanceCache(options: InvalidateCacheOptions = {}): void {
  const {
    tags = ['balance-data', 'patch-notes-data'],
    paths = ['/', '/admin'],
    includeCharacterPages = true,
  } = options;

  // 태그 기반 캐시 무효화 (unstable_cache 캐시)
  for (const tag of tags) {
    revalidateTag(tag, 'max');
  }

  // 경로 기반 캐시 무효화
  for (const path of paths) {
    revalidatePath(path);
  }

  // 동적 캐릭터 페이지 무효화
  if (includeCharacterPages) {
    revalidatePath('/character/[name]', 'page');
    revalidatePath('/admin/character/[name]', 'page');
  }
}

/**
 * 특정 캐릭터의 페이지 캐시만 무효화합니다.
 * @param characterName - 캐릭터 이름
 */
export function invalidateCharacterCache(characterName: string): void {
  const encodedName = encodeURIComponent(characterName);
  revalidatePath(`/character/${encodedName}`, 'page');
  revalidatePath(`/admin/character/${encodedName}`, 'page');
}
