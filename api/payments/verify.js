import admin from 'firebase-admin';

// 🌸 Firebase Admin SDK 안전한 싱글톤 초기화 🌸
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'POST 요청만 허용됩니다.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  let uid = null;

  // 1. Firebase Admin SDK로 idToken 검증 (가장 안전함)
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

    // 2. 포트원 결제내역 단건 조회 (위변조 검증)
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

    // 3. 플랜별 기간 계산
    let addDays = 90; // 3개월
    const pName = String(planName || '3개월');
    if (pName.includes('1년') || pName.includes('1 Year') || pName.includes('1y')) addDays = 365;
    else if (pName.includes('평생') || pName.includes('Lifetime')) addDays = 36500; // 평생 이용권

    const now = new Date();
    const nowTimestamp = now.getTime();
    let baseDate = now;

    // 4. Firestore DB 읽기 (Admin 최고 권한으로 접근)
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

    // 5. Firestore DB 업데이트 (Admin 권한이므로 보안 규칙 우회하여 100% 성공)
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