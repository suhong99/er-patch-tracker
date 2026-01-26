import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/admin-utils';
import type { FeedbackStatus } from '@/types/feedback';

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdateFeedbackRequest = {
  status: FeedbackStatus;
};

// PATCH: 피드백 상태 업데이트
export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const authHeader = request.headers.get('Authorization');
  const isAdmin = await verifyAdmin(authHeader);

  if (!isAdmin) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as UpdateFeedbackRequest;
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: 'status 필드가 필요합니다' }, { status: 400 });
    }

    const validStatuses: FeedbackStatus[] = ['unread', 'read', 'resolved', 'rejected'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: '유효하지 않은 상태값입니다' }, { status: 400 });
    }

    const feedbackRef = db.collection('feedback').doc(id);
    const feedbackDoc = await feedbackRef.get();

    if (!feedbackDoc.exists) {
      return NextResponse.json({ error: '피드백을 찾을 수 없습니다' }, { status: 404 });
    }

    await feedbackRef.update({
      status,
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true, id, status });
  } catch (error) {
    console.error('피드백 상태 업데이트 실패:', error);
    return NextResponse.json({ error: '피드백 상태 업데이트 실패' }, { status: 500 });
  }
}

// DELETE: 피드백 삭제
export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const authHeader = request.headers.get('Authorization');
  const isAdmin = await verifyAdmin(authHeader);

  if (!isAdmin) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const feedbackRef = db.collection('feedback').doc(id);
    const feedbackDoc = await feedbackRef.get();

    if (!feedbackDoc.exists) {
      return NextResponse.json({ error: '피드백을 찾을 수 없습니다' }, { status: 404 });
    }

    await feedbackRef.delete();

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('피드백 삭제 실패:', error);
    return NextResponse.json({ error: '피드백 삭제 실패' }, { status: 500 });
  }
}
