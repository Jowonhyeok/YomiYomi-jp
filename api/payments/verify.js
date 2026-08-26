import admin from 'firebase-admin';

// 🌸 파이어베이스 Admin SDK 안전한 초기화 🌸
if (!admin.apps.length) {
  try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!rawKey) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY 환경변수가 설정되지 않았습니다.');
    }

    // 줄바꿈이나 이스케이프 문자가 포함된 키 값 안전하게 처리
    const serviceAccount = typeof rawKey === 'string' ? JSON.parse(rawKey) : rawKey;
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (initErr) {
    console.error('[Firebase Admin Init Error]:', initErr.message);
  }
}

const db = admin.apps.length ? admin.firestore() : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'POST 요청만 허용됩니다.' });
  }

  if (!db) {
    return res.status(500).json({ 
      success: false, 
      message: 'Firebase Admin SDK 초기화 실패. Vercel 환경변수(FIREBASE_SERVICE_ACCOUNT_KEY)를 확인해 주세요.' 
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  let uid = null;

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (err) {
    return res.status(401).json({ success: false, message: '인증 검증 실패: ' + err.message });
  }

  const { paymentId, planName, userId } = req.body || {};

  if (uid !== userId) {
    return res.status(403).json({ success: false, message: '본인의 결제 요청만 검증할 수 있습니다.' });
  }

  try {
    const portoneApiSecret = process.env.PORTONE_API_SECRET;
    if (!portoneApiSecret) {
      return res.status(500).json({ success: false, message: 'PORTONE_API_SECRET 환경변수가 설정되지 않았습니다.' });
    }

    // 포트원 결제내역 단건 조회 (위변조 검증)
    const portoneRes = await fetch(`https://api.portone.io/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `PortOne ${portoneApiSecret}`,
        'Content-Type': 'application/json'
      }
    });

    if (!portoneRes.ok) {
      return res.status(400).json({ success: false, message: '포트원 결제내역 조회 실패' });
    }

    const paymentData = await portoneRes.json();
    if (paymentData.status !== 'PAID') {
      return res.status(400).json({ success: false, message: '결제가 완료 상태(PAID)가 아닙니다.' });
    }

    let addDays = 90;
    const pName = String(planName || '3개월');
    if (pName.includes('1년') || pName.includes('1 Year') || pName.includes('1y')) addDays = 365;
    else if (pName.includes('평생') || pName.includes('Lifetime')) addDays = 36500;

    const now = new Date();
    const nowTimestamp = now.getTime();
    let baseDate = now;

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData.subscriptionEndDate) {
        const existingEndDate = new Date(userData.subscriptionEndDate);
        if (existingEndDate > now) baseDate = existingEndDate;
      }
    }

    const newEndDateObj = new Date(baseDate.getTime() + addDays * 24 * 60 * 60 * 1000);
    const formattedEndDate = newEndDateObj.toISOString().split('T')[0];

    // Admin 권한으로 Firestore DB 업데이트
    await userRef.set({
      isSubscribed: true,
      subscriptionPlan: pName,
      subscriptionEndDate: formattedEndDate,
      lastPaymentId: String(paymentId),
      lastPaymentDate: now.toISOString(),
      lastPaymentAt: nowTimestamp,
      cancelAtPeriodEnd: false
    }, { merge: true });

    return res.status(200).json({ success: true, message: '결제 검증 및 프리미엄 승인이 완료되었습니다.' });

  } catch (err) {
    console.error('[Verify Payment Error]:', err.message || err);
    return res.status(500).json({ success: false, message: 'DB 업데이트 실패: ' + (err.message || '알 수 없는 오류') });
  }
}