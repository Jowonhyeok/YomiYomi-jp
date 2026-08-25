import admin from 'firebase-admin';

function getAdminApp() {
  if (admin.apps.length > 0) {
    return admin.apps[0];
  }

  let certConfig = null;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      certConfig = typeof rawEnv === 'string' ? JSON.parse(rawEnv) : rawEnv;
    } catch (e) {
      console.error('FIREBASE_SERVICE_ACCOUNT Env Parsing Error:', e);
    }
  }

  if (!certConfig) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT 환경 변수를 찾을 수 없습니다.');
  }

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
    const app = getAdminApp();
    const auth = admin.auth(app);
    const db = admin.firestore(app);

    const authHeader = req.headers.authorization || '';
    const token = authHeader.split('Bearer ')[1];
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userData = userSnap.data() || {};

    // 💥 REST API 및 Admin SDK 데이터 포맷 완벽 대처 💥
    const lastPaymentId = userData.lastPaymentId?.stringValue || userData.lastPaymentId || null;
    
    let lastPaymentAt = 0;
    if (userData.lastPaymentAt?.integerValue) {
      lastPaymentAt = Number(userData.lastPaymentAt.integerValue);
    } else if (typeof userData.lastPaymentAt === 'number') {
      lastPaymentAt = userData.lastPaymentAt;
    } else if (userData.lastPaymentDate) {
      const dateStr = userData.lastPaymentDate?.stringValue || userData.lastPaymentDate;
      lastPaymentAt = new Date(dateStr).getTime();
    }

    let lastUsedAt = 0;
    if (userData.lastUsedAt?.integerValue) {
      lastUsedAt = Number(userData.lastUsedAt.integerValue);
    } else if (typeof userData.lastUsedAt === 'number') {
      lastUsedAt = userData.lastUsedAt;
    }

    // 결제 후 사용 기록 체크
    const isUsedAfterPayment = lastUsedAt > lastPaymentAt;

    if (isUsedAfterPayment) {
      await userRef.update({ cancelAtPeriodEnd: true });
      return res.status(200).json({ 
        success: false, 
        code: 'USAGE_EXISTS', 
        message: '결제 이후 서비스를 사용한 기록이 있어 전액 환불이 불가능합니다. 다음 결제일에 구독이 해지되도록 예약되었습니다.' 
      });
    }

    // 💥 포트원 API Secret Key 확인 💥
    const portoneApiSecret = process.env.PORTONE_API_SECRET;

    if (!lastPaymentId) {
      return res.status(400).json({
        success: false,
        message: '취소할 결제 건의 ID(lastPaymentId)를 찾을 수 없습니다. 다시 결제 후 시도해주세요.'
      });
    }

    if (!portoneApiSecret) {
      return res.status(500).json({
        success: false,
        message: 'PORTONE_API_SECRET 환경변수가 Vercel에 설정되어 있지 않습니다.'
      });
    }

    // 💥 포트원(PortOne V2) 실질 승인 취소 요청 💥
    const cancelResponse = await fetch(`https://api.portone.io/payments/${encodeURIComponent(lastPaymentId)}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `PortOne ${portoneApiSecret}`
      },
      body: JSON.stringify({
        reason: '고객 요청에 의한 미사용 건 전액 환불'
      })
    });

    if (!cancelResponse.ok) {
      const cancelError = await cancelResponse.json().catch(() => ({}));
      console.error('PortOne Cancel API Failed:', cancelError);
      return res.status(500).json({
        success: false,
        message: `결제 대행사 취소 실패: ${cancelError.message || '포트원 취소 요청 실패'}`
      });
    }

    // 포트원 실제 환불 성공 후 Firestore 구독 롤백
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