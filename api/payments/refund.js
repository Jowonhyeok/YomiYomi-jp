import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

// Firebase Admin 초기화
if (!admin.apps.length) {
  let certConfig = null;

  // 1순위: api/ 폴더 또는 프로젝트 내 serviceAccountKey.json 파일이 존재하는지 확인
  const possiblePaths = [
    path.join(process.cwd(), 'api', 'serviceAccountKey.json'),
    path.join(process.cwd(), 'serviceAccountKey.json'),
    path.join(process.cwd(), 'src', 'serviceAccountKey.json')
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      try {
        certConfig = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        break;
      } catch (e) {
        console.error('Failed to read local serviceAccountKey.json:', e);
      }
    }
  }

  // 2순위: 로컬 파일이 없으면 Vercel에 설정된 FIREBASE_SERVICE_ACCOUNT 환경 변수 사용
  if (!certConfig && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      certConfig = typeof process.env.FIREBASE_SERVICE_ACCOUNT === 'string'
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : process.env.FIREBASE_SERVICE_ACCOUNT;
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT env:', e);
    }
  }

  // 3순위: 개별 환경 변수가 있을 때
  if (!certConfig && process.env.FIREBASE_PROJECT_ID) {
    certConfig = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
  }

  if (!certConfig) {
    throw new Error('Firebase Admin 인증 설정을 찾을 수 없습니다. (json 파일 또는 환경 변수 확인 필요)');
  }

  admin.initializeApp({
    credential: admin.credential.cert(certConfig),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.split('Bearer ')[1];
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userData = userSnap.data();

    // 결제 시간과 사용 시간 비교
    const lastPaymentAt = userData.lastPaymentAt || 0;
    const lastUsedAt = userData.lastUsedAt || 0;

    const isUsedAfterPayment = lastUsedAt > lastPaymentAt;

    if (isUsedAfterPayment) {
      await userRef.update({ cancelAtPeriodEnd: true });
      return res.status(200).json({ 
        success: false, 
        code: 'USAGE_EXISTS', 
        message: '결제 이후 서비스를 사용한 기록이 있어 전액 환불이 불가능합니다. 다음 결제일에 구독이 해지되도록 예약되었습니다.' 
      });
    }

    // 환불 승인 시 DB 롤백
    await userRef.update({
      isSubscribed: false,
      subscriptionPlan: 'Free',
      cancelAtPeriodEnd: false,
      subscriptionEndDate: admin.firestore.FieldValue.delete() 
    });

    return res.status(200).json({ success: true, message: 'Refund processed successfully.' });

  } catch (error) {
    console.error('Refund API Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: `Backend Error: ${error.message || JSON.stringify(error)}` 
    });
  }
}