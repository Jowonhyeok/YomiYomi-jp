import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

// 헬퍼: private_key의 이스케이프된 \n 문자열을 실제 개행문자로 복원하는 함수
function sanitizePrivateKey(key) {
  if (!key) return key;
  // 문자열 양끝의 따옴표 제거 및 \n 개행 변환
  let sanitized = key.trim().replace(/^"(.*)"$/, '$1');
  return sanitized.replace(/\\n/g, '\n');
}

if (!admin.apps.length) {
  let certConfig = null;

  // 1순위: 로컬(내 컴퓨터)에 serviceAccountKey.json 파일이 있으면 우선 사용
  const localJsonPath = path.join(process.cwd(), 'api', 'serviceAccountKey.json');
  if (fs.existsSync(localJsonPath)) {
    try {
      certConfig = JSON.parse(fs.readFileSync(localJsonPath, 'utf8'));
    } catch (e) {
      console.error('Failed to read local serviceAccountKey.json:', e);
    }
  }

  // 2순위: Vercel 배포 서버 환경변수(FIREBASE_SERVICE_ACCOUNT) 사용
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

  // 💥 핵심: private_key 개행 문자열 PEM 포맷 정제 💥
  if (certConfig.private_key) {
    certConfig.private_key = sanitizePrivateKey(certConfig.private_key);
  } else if (certConfig.privateKey) {
    certConfig.privateKey = sanitizePrivateKey(certConfig.privateKey);
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

    // 1. 유저 ID Token 검증
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    // 2. Firestore 유저 데이터 조회
    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userData = userSnap.data();

    // 3. 결제 시각 vs 서비스 사용 시각 비교
    const lastPaymentAt = userData.lastPaymentAt || 0;
    const lastUsedAt = userData.lastUsedAt || 0;

    // 결제 시각 이후에 서비스를 이용했는지 검사
    const isUsedAfterPayment = lastUsedAt > lastPaymentAt;

    if (isUsedAfterPayment) {
      // 결제 후 사용함 -> 환불 거부 및 구독 해지 예약 처리
      await userRef.update({ cancelAtPeriodEnd: true });
      return res.status(200).json({ 
        success: false, 
        code: 'USAGE_EXISTS', 
        message: '결제 이후 서비스를 사용한 기록이 있어 전액 환불이 불가능합니다. 다음 결제일에 구독이 해지되도록 예약되었습니다.' 
      });
    }

    // 결제 후 미사용 -> 전액 환불 승인 (DB 롤백)
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