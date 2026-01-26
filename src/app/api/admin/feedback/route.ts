import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/admin-utils';
import type { FeedbackStatus, FeedbackType, FeedbackCategory } from '@/types/feedback';

type FeedbackDoc = {
  id: string;
  type: FeedbackType;
  category: FeedbackCategory;
  characterName?: string;
  patchId?: string;
  title: string;
  content: string;
  createdAt: FirebaseFirestore.Timestamp;
  status: FeedbackStatus;
};

type FeedbackListResponse = {
  feedbacks: FeedbackDoc[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// GET: 피드백 목록 조회 (필터, 페이지네이션)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('Authorization');
  const isAdmin = await verifyAdmin(authHeader);

  if (!isAdmin) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);
  const status = searchParams.get('status') as FeedbackStatus | null;
  const type = searchParams.get('type') as FeedbackType | null;
  const category = searchParams.get('category') as FeedbackCategory | null;

  try {
    let query: FirebaseFirestore.Query = db.collection('feedback');

    // 필터 적용
    if (status) {
      query = query.where('status', '==', status);
    }
    if (type) {
      query = query.where('type', '==', type);
    }
    if (category) {
      query = query.where('category', '==', category);
    }

    // 전체 개수 조회 (필터 적용된 상태)
    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    // 정렬 및 페이지네이션
    query = query.orderBy('createdAt', 'desc');
    query = query.offset((page - 1) * pageSize).limit(pageSize);

    const snapshot = await query.get();

    const feedbacks: FeedbackDoc[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<FeedbackDoc, 'id'>),
    }));

    const response: FeedbackListResponse = {
      feedbacks,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('피드백 목록 조회 실패:', error);
    return NextResponse.json({ error: '피드백 목록 조회 실패' }, { status: 500 });
  }
}
