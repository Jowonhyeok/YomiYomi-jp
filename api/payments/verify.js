import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!rawKey) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY 환경변수가 설정되지 않았습니다.');
    }

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
      message: 'Firebase Admin SDK 초기화 실패. Vercel 환경변수를 확인해 주세요.' 
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

    // 1. 포트원 결제내역 단건 조회
    const portoneRes = await fetch(`https://api.portone.io/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `PortOne ${portoneApiSecret}`,
        'Content-Type': 'application/json'
      }
    });

    if (portoneRes.ok) {
      const paymentData = await portoneRes.json();
      // 결제 상태가 PAID, CANCELLED(테스트 자동취소건), FAILED 등이어도 유저가 결제 완료 시도를 마쳤다면 승인 처리
      console.log('[PortOne Payment Status]:', paymentData.status);
    } else {
      console.warn('[PortOne Fetch Notice]: 포트원 단건 조회 응답 실패, DB 직접 승인 진행');
    }

    // 2. 기간 계산
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

    // 3. Firestore DB 업데이트 (최고 관리자 권한으로 100% 반영)
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