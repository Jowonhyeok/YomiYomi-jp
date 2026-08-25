import admin from 'firebase-admin';

// 1. Firebase Admin 초기화 (verify.js에 있는 것과 동일한 방식 적용)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel 환경변수에서 줄바꿈 문자를 정상적으로 파싱하기 위한 처리
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req, res) {
  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    // 2. 프론트엔드에서 보낸 Authorization 헤더(토큰) 검증
    const authHeader = req.headers.authorization || '';
    const token = authHeader.split('Bearer ')[1];
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    // 3. Firestore에서 해당 유저 데이터 조회
    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userData = userSnap.data();

    // ===================================================================
    // [환불 조건 검사 로직] 
    // 실제 운영 시에는 결제일로부터 7일 경과 여부, 서비스 사용량 등을 체크해야 합니다.
    // ===================================================================
    const today = new Date().toISOString().split('T')[0];
    const isUsed = userData.dailyAnalyzeCount > 0 && userData.lastAnalyzeDate === today;

    if (isUsed) {
      // 🚨 이미 혜택을 사용한 경우: 전액 환불 거부 및 '구독 해지 예약'만 처리
      await userRef.update({ cancelAtPeriodEnd: true });
      return res.status(200).json({ 
        success: false, 
        code: 'USAGE_EXISTS', 
        message: '이미 프리미엄 혜택을 사용하여 전액 환불이 불가능합니다. 다음 결제일에 구독이 해지되도록 예약되었습니다.' 
      });
    }

    // ===================================================================
    // [PortOne(포트원) 실제 결제 취소 API 호출 위치]
    // 여기서 PortOne REST API를 호출하여 실제 신용카드 승인 취소를 진행해야 합니다.
    // 임시로 DB 상태만 Free로 바꾸어 UI를 테스트할 수 있게 구성했습니다.
    // ===================================================================

    // 4. 환불 승인 시: DB의 구독 상태를 Free로 롤백
    await userRef.update({
      isSubscribed: false,
      subscriptionPlan: 'Free',
      cancelAtPeriodEnd: false,
      // subscriptionEndDate 필드는 삭제하거나 빈 값으로 처리
      subscriptionEndDate: admin.firestore.FieldValue.delete() 
    });

    // 5. 프론트엔드에 성공 응답 전달
    return res.status(200).json({ success: true, message: 'Refund processed successfully.' });

  } catch (error) {
    console.error('Refund API Error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error: ' + error.message });
  }
}