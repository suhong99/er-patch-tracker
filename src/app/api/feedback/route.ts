import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import type { FeedbackType, FeedbackCategory } from '@/types/feedback';

type CreateFeedbackBody = {
  type: FeedbackType;
  category: FeedbackCategory;
  characterName?: string;
  patchId?: string;
  title: string;
  content: string;
};

// POST: 피드백 생성 (인증 불필요)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as CreateFeedbackBody;
    const { type, category, characterName, patchId, title, content } = body;

    // 유효성 검사
    if (!type || !category || !title || !content) {
      return NextResponse.json({ error: '필수 필드가 누락되었습니다' }, { status: 400 });
    }

    if (title.length > 200) {
      return NextResponse.json({ error: '제목은 200자 이내여야 합니다' }, { status: 400 });
    }

    if (content.length > 5000) {
      return NextResponse.json({ error: '내용은 5000자 이내여야 합니다' }, { status: 400 });
    }

    // 피드백 저장
    const feedbackData = {
      type,
      category,
      title: title.trim(),
      content: content.trim(),
      createdAt: new Date(),
      status: 'unread',
      ...(characterName && { characterName: characterName.trim() }),
      ...(patchId && { patchId: patchId.trim() }),
    };

    const docRef = await db.collection('feedback').add(feedbackData);

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error) {
    console.error('피드백 저장 실패:', error);
    return NextResponse.json({ error: '피드백 저장 중 오류가 발생했습니다' }, { status: 500 });
  }
}
