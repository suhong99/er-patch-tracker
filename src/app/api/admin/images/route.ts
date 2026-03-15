import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { v2 as cloudinary } from 'cloudinary';
import { db } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/admin-utils';

type ImageMap = Record<string, string>;
type NameMap = Record<string, string>;

const IMAGES_DOC = 'metadata/characterImages';
const CUSTOM_CHARACTERS_DOC = 'metadata/customCharacters';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// GET: 이미지 맵 + 커스텀 캐릭터 맵 반환
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('Authorization');
  const isAdmin = await verifyAdmin(authHeader);

  if (!isAdmin) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  try {
    const [imagesDoc, customDoc] = await Promise.all([
      db.doc(IMAGES_DOC).get(),
      db.doc(CUSTOM_CHARACTERS_DOC).get(),
    ]);

    const imageMap: ImageMap = imagesDoc.exists ? (imagesDoc.data() as ImageMap) : {};
    const customCharacters: NameMap = customDoc.exists ? (customDoc.data() as NameMap) : {};

    return NextResponse.json({ imageMap, customCharacters });
  } catch (error) {
    console.error('이미지 데이터 조회 실패:', error);
    return NextResponse.json({ error: '이미지 데이터 조회 실패' }, { status: 500 });
  }
}

// POST: 이미지 업로드 (Cloudinary) + Firestore URL 등록
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('Authorization');
  const isAdmin = await verifyAdmin(authHeader);

  if (!isAdmin) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const englishName = formData.get('englishName') as string | null;
    const file = formData.get('file') as File | null;

    if (!englishName || !file) {
      return NextResponse.json({ error: 'englishName과 file은 필수입니다' }, { status: 400 });
    }

    // File → base64 data URI
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUri = `data:${file.type};base64,${base64}`;

    // Cloudinary 업로드
    const result = await cloudinary.uploader.upload(dataUri, {
      public_id: englishName,
      folder: 'characters',
      overwrite: true,
      format: 'webp',
      quality: 'auto',
    });

    const imageUrl = result.secure_url;

    // Firestore에 URL 등록
    await db.doc(IMAGES_DOC).set({ [englishName]: imageUrl }, { merge: true });

    // 이미지 맵 캐시 무효화
    revalidateTag('character-images', 'max');

    return NextResponse.json({ success: true, englishName, imageUrl });
  } catch (error) {
    console.error('이미지 업로드 실패:', error);
    return NextResponse.json({ error: '이미지 업로드 실패' }, { status: 500 });
  }
}

// PUT: 새 캐릭터 추가 (영어 이름 + 한글 이름)
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('Authorization');
  const isAdmin = await verifyAdmin(authHeader);

  if (!isAdmin) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { englishName: string; koreanName: string };
    const { englishName, koreanName } = body;

    if (!englishName || !koreanName) {
      return NextResponse.json({ error: '영어 이름과 한글 이름은 필수입니다' }, { status: 400 });
    }

    await db.doc(CUSTOM_CHARACTERS_DOC).set({ [englishName]: koreanName }, { merge: true });

    // 이미지 맵 캐시 무효화 (커스텀 캐릭터 추가 시 매핑 변경)
    revalidateTag('character-images', 'max');

    return NextResponse.json({ success: true, englishName, koreanName });
  } catch (error) {
    console.error('캐릭터 추가 실패:', error);
    return NextResponse.json({ error: '캐릭터 추가 실패' }, { status: 500 });
  }
}
