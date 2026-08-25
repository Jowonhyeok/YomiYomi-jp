import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

if (!admin.apps.length) {
  let certConfig = null;

  // 1. 로컬 serviceAccountKey.json 탐색
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

  // 2. Vercel 환경 변수 파싱 및 줄바꿈 복원
  if (!certConfig && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      certConfig = typeof rawEnv === 'string' ? JSON.parse(rawEnv) : rawEnv;
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT env:', e);
    }
  }

  if (!certConfig) {
    throw new Error('Firebase Admin 인증 설정을 찾을 수 없습니다.');
  }

  // 💥 줄바꿈(\n) 완전 정제 로직 💥
  if (certConfig.private_key) {
    certConfig.private_key = certConfig.private_key
      .replace(/\\n/g, '\n')
      .replace(/"/g, ''); // 혹시 들어간 불필요 따옴표 제거
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