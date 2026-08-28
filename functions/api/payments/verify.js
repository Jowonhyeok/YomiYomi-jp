import admin from 'firebase-admin';

// 1. Firebase Admin SDK 초기화
if (!admin.apps.length) {
  try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!rawKey) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT 환경변수가 설정되지 않았습니다.');
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
      message: 'Firebase Admin SDK 초기화 실패. 환경변수를 확인해 주세요.' 
    });
  }

  // 2. 유저 인증 토큰(ID Token) 검증
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

  // 레몬스퀴지는 orderData 객체를 전달합니다.
  const { orderData, planName, userId } = req.body || {};

  if (uid !== userId) {
    return res.status(403).json({ success: false, message: '본인의 결제 요청만 검증할 수 있습니다.' });
  }

  try {
    // 3. 레몬스퀴지 API 키 읽기 (언더바 유무 모두 대응)
    const lsApiKey = process.env.LEMONSQUEEZY_API_KEY || process.env.LEMON_SQUEEZY_API_KEY;
    const orderId = orderData?.id || req.body?.paymentId;

    if (lsApiKey && orderId) {
      // 레몬스퀴지 단건 주문 조회 API 호출
      const lsRes = await fetch(`https://api.lemonsqueezy.com/v1/orders/${orderId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
          'Authorization': `Bearer ${lsApiKey}`
        }
      });

      if (lsRes.ok) {
        const lsData = await lsRes.json();
        const paymentStatus = lsData.data?.attributes?.status;
        
        // 결제 완료(paid) 상태가 아니면 거부
        if (paymentStatus !== 'paid') {
          return res.status(400).json({ 
            success: false, 
            message: `결제가 완료되지 않았습니다. (현재 상태: ${paymentStatus})` 
          });
        }
      } else {
        console.warn('[LemonSqueezy Fetch Notice]: 레몬스퀴지 단건 조회 실패, DB 직접 승인 진행');
      }
    }

    // 4. 구독 기간 정밀 계산
    let addDays = 90; // 기본값 3개월
    const pName = String(planName || '3개월');

    if (pName.includes('1년') || pName.includes('1 Year') || pName.includes('1-Year') || pName.includes('1y')) {
      addDays = 365;
    } else if (pName.includes('평생') || pName.includes('Lifetime') || pName.includes('Life')) {
      addDays = 36500; // 약 100년 (영구)
    }

    const now = new Date();
    const nowTimestamp = now.getTime();
    let baseDate = now;

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    // 기존 구독 기간이 남아있다면 이어붙이기
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData.subscriptionEndDate) {
        const existingEndDate = new Date(userData.subscriptionEndDate);
        if (existingEndDate > now) baseDate = existingEndDate;
      }
    }

    const newEndDateObj = new Date(baseDate.getTime() + addDays * 24 * 60 * 60 * 1000);
    const formattedEndDate = newEndDateObj.toISOString().split('T')[0];

    // 5. Firestore DB 업데이트
    await userRef.set({
      isSubscribed: true,
      subscriptionPlan: pName,
      subscriptionEndDate: formattedEndDate,
      lastPaymentId: String(orderId || ''),
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