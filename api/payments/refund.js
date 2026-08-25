import admin from 'firebase-admin';

// 1. Firebase Admin 초기화
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
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

    // ===================================================================
    // 💥 결제 시간(lastPaymentAt)과 마지막 사용 시간(lastUsedAt) 비교
    // ===================================================================
    const lastPaymentAt = userData.lastPaymentAt || 0;
    const lastUsedAt = userData.lastUsedAt || 0;

    // 결제한 시각보다 서비스를 실제로 이용한 시각이 더 뒤(미래)라면
    const isUsedAfterPayment = lastUsedAt > lastPaymentAt;

    if (isUsedAfterPayment) {
      // 🚨 결제 이후 사용함: 전액 환불 거부 및 해지 예약만 처리
      await userRef.update({ cancelAtPeriodEnd: true });
      return res.status(200).json({ 
        success: false, 
        code: 'USAGE_EXISTS', 
        message: '결제 이후 서비스를 사용한 기록이 있어 전액 환불이 불가능합니다. 다음 결제일에 구독이 해지되도록 예약되었습니다.' 
      });
    }

    // 4. 결제 후 사용 안 함: 환불 승인 (DB 롤백)
    await userRef.update({
      isSubscribed: false,
      subscriptionPlan: 'Free',
      cancelAtPeriodEnd: false,
      subscriptionEndDate: admin.firestore.FieldValue.delete() 
    });

    return res.status(200).json({ success: true, message: 'Refund processed successfully.' });

  } catch (error) {
    console.error('Refund API Error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error: ' + error.message });
  }
}