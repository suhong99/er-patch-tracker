import { initFirebaseAdmin } from './lib/firebase-admin';

async function addAdmin(): Promise<void> {
  const db = initFirebaseAdmin();

  await db.collection('metadata').doc('admins').set({
    emails: ['bt01063767006@gmail.com'],
    updatedAt: new Date().toISOString(),
  });

  console.log('관리자 등록 완료: bt01063767006@gmail.com');
}

addAdmin().catch(console.error);
