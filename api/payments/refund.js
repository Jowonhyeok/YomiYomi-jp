import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Firebase Admin 안전 초기화 함수
function initFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  let certConfig = null;

  // 1. require를 통한 serviceAccountKey.json 파일 로드 시도
  try {
    certConfig = require('../serviceAccountKey.json');
  } catch (e) {
    // 로컬 파일이 없는 경우 패스
  }

  // 2. Vercel 환경 변수(FIREBASE_SERVICE_ACCOUNT) 로드 시도
  if (!certConfig && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      const decodedEnv = rawEnv.startsWith('{') 
        ? rawEnv 
        : Buffer.from(rawEnv, 'base64').toString('utf8');
      
      certConfig = JSON.parse(decodedEnv);
    } catch (e) {
      console.error('FIREBASE_SERVICE_ACCOUNT Env Parsing Error:', e);
    }
  }

  if (!certConfig) {
    throw new Error('Firebase 서비스 계정 키(serviceAccountKey.json 또는 FIREBASE_SERVICE_ACCOUNT 환경 변수)를 읽을 수 없습니다.');
  }

  // private_key 줄바꿈(\\n) 복원
  if (certConfig.private_key) {
    certConfig.private_key = certConfig.private_key.replace(/\\n/g, '\n');
  }

  return admin.initializeApp({
    credential: admin.credential.cert(certConfig),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    // 핸들러 실행 시점에 안전하게 초기화 확인
    initFirebaseAdmin();

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