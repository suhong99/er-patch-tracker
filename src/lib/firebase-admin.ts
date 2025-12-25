import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import path from 'path';
import { readFileSync } from 'fs';

// 서버 전용 - Firebase Admin 초기화
const initializeFirebaseAdmin = (): void => {
  if (getApps().length === 0) {
    // 서비스 계정 키 파일 경로
    const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
    const serviceAccount = JSON.parse(
      readFileSync(serviceAccountPath, 'utf-8')
    ) as ServiceAccount;

    initializeApp({
      credential: cert(serviceAccount),
    });
  }
};

// 초기화 실행
initializeFirebaseAdmin();

// Firestore 인스턴스 export
export const db = getFirestore();

// Auth 인스턴스 export (토큰 검증용)
export const adminAuth = getAuth();
