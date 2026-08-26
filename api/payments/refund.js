import admin from 'firebase-admin';

// 🌸 파이어베이스 Admin SDK 안전한 초기화 (환경변수 키 두 가지 지원) 🌸
if (!admin.apps.length) {
  try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!rawKey) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY 또는 FIREBASE_SERVICE_ACCOUNT 환경변수가 설정되지 않았습니다.');
    }

    const serviceAccount = typeof rawKey === 'string' ? JSON.parse(rawKey) : rawKey;
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (initErr) {
    console.error('[Firebase Admin Init Error in Refund]:', initErr.message);
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

  // 1. Firebase Auth 토큰 검증
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (err) {
    return res.status(401).json({ success: false, message: '인증 검증 실패: ' + err.message });
  }

  try {
    const portoneApiSecret = process.env.PORTONE_API_SECRET;
    if (!portoneApiSecret) {
      return res.status(500).json({ success: false, message: 'PORTONE_API_SECRET 환경변수가 설정되지 않았습니다.' });
    }

    // 2. DB에서 유저 결제 내역 조회
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: '사용자 정보를 찾을 수 없습니다.' });
    }

    const userData = userDoc.data();
    const lastPaymentId = userData.lastPaymentId;
    const lastPaymentAt = userData.lastPaymentAt; // 밀리초 단위 timestamp
    const dailyAnalyzeCount = userData.dailyAnalyzeCount || 0;

    if (!lastPaymentId) {
      return res.status(400).json({ success: false, message: '취소할 결제 내역이 존재하지 않습니다.' });
    }

    const nowTimestamp = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    
    // 7일 이내 판정
    const isWithin7Days = lastPaymentAt ? (nowTimestamp - Number(lastPaymentAt) <= SEVEN_DAYS_MS) : false;
    // 미사용 판정 (분석 이용 횟수가 0회인 경우)
    const isUnused = dailyAnalyzeCount === 0;

    // ⚠️ 7일이 지났거나 이미 사용한 경우: '전액 환불' 대신 '다음 주기 해지 예약' 처리
    if (!isWithin7Days || !isUnused) {
      await userRef.set({ cancelAtPeriodEnd: true }, { merge: true });

      let reasonMsg = '';
      if (!isWithin7Days && !isUnused) {
        reasonMsg = '결제 후 7일이 지났고 이미 서비스를 이용하셨으므로 전액 환불은 불가합니다.';
      } else if (!isWithin7Days) {
        reasonMsg = '결제 후 7일이 지났으므로 전액 환불은 불가합니다.';
      } else {
        reasonMsg = '이미 서비스(문장/이미지 분석)를 이용하셨으므로 전액 환불은 불가합니다.';
      }

      return res.status(200).json({
        success: false,
        code: !isWithin7Days ? 'EXCEEDED_7_DAYS' : 'USAGE_EXISTS',
        message: `${reasonMsg}\n구독 만료일까지 계속 이용하실 수 있도록 [다음 결제 해지 예약] 처리되었습니다.`
      });
    }

    // 3. 조건 만족 시: PortOne V2 API 호출하여 승인 취소(전액 환불) 진행
    const cancelRes = await fetch(`https://api.portone.io/payments/${lastPaymentId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `PortOne ${portoneApiSecret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reason: '고객 요청에 의한 7일 이내 미사용 건 자동 환불'
      })
    });

    if (!cancelRes.ok) {
      const cancelErrText = await cancelRes.text();
      
      // 🌸 [핵심 수정] 이미 포트원/카드사 콘솔 등에서 취소된 결제건인 경우 🌸
      if (cancelErrText.includes('PAYMENT_ALREADY_CANCELLED') || cancelErrText.includes('payment already cancelled')) {
        await userRef.set({
          isSubscribed: false,
          subscriptionPlan: 'Free',
          cancelAtPeriodEnd: false
        }, { merge: true });

        return res.status(200).json({
          success: true,
          message: '🎉 이미 취소(환불) 완료된 결제건입니다. 회원 상태가 무료 플랜으로 정상 정리되었습니다.'
        });
      }

      console.error('[PortOne Cancel API Error]:', cancelErrText);
      return res.status(400).json({ success: false, message: '포트원 결제 취소 요청 실패: ' + cancelErrText });
    }

    // 4. 환불 정상 성공 시 Firestore DB 구독 상태 즉시 해제
    await userRef.set({
      isSubscribed: false,
      subscriptionPlan: 'Free',
      cancelAtPeriodEnd: false
    }, { merge: true });

    return res.status(200).json({
      success: true,
      message: '🎉 결제 취소 및 전액 환불 처리가 성공적으로 완료되었습니다.'
    });

  } catch (err) {
    console.error('[Refund Process Exception]:', err.message || err);
    return res.status(500).json({ success: false, message: '환불 처리 중 서버 오류: ' + (err.message || '알 수 없는 오류') });
  }
}