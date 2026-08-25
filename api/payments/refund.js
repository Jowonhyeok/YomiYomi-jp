import admin from 'firebase-admin';

if (!admin.apps.length) {
  let certConfig = null;

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      
      // 1. JSON 형태 문자열인지 Base64 문자열인지 자동 구분
      if (rawEnv.startsWith('{')) {
        certConfig = JSON.parse(rawEnv);
      } else {
        // Base64 디코딩
        const decodedEnv = Buffer.from(rawEnv, 'base64').toString('utf8');
        certConfig = JSON.parse(decodedEnv);
      }

      // 2. private_key의 개행문자(\\n) 완벽 복원
      if (certConfig && certConfig.private_key) {
        certConfig.private_key = certConfig.private_key.replace(/\\n/g, '\n');
      }
    }
  } catch (e) {
    console.error('Firebase Service Account Parsing Error:', e);
  }

  if (!certConfig) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT 파싱 실패. Vercel 환경 변수를 확인해주세요.');
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

    // 토큰 검증
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userData = userSnap.data();

    // 시각 비교 (결제 시각 vs 사용 시각)
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

    // 미사용 건 전액 환불 및 DB 초기화
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