import { NextResponse } from 'next/server';
import { adminAuth, db } from '@/lib/firebase-admin';

type VerifyRequest = {
  idToken: string;
};

type AdminsDoc = {
  emails: string[];
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { idToken } = (await request.json()) as VerifyRequest;

    if (!idToken) {
      return NextResponse.json({ error: 'ID Token is required' }, { status: 400 });
    }

    // Firebase Admin SDK로 토큰 검증
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const email = decodedToken.email;

    if (!email) {
      return NextResponse.json({ error: 'Email not found in token' }, { status: 400 });
    }

    // Firestore에서 관리자 목록 확인
    const adminDoc = await db.collection('metadata').doc('admins').get();

    if (!adminDoc.exists) {
      // 관리자 문서가 없으면 관리자 아님
      return NextResponse.json({ isAdmin: false, email });
    }

    const adminData = adminDoc.data() as AdminsDoc;
    const isAdmin = adminData.emails?.includes(email) ?? false;

    return NextResponse.json({ isAdmin, email });
  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}
