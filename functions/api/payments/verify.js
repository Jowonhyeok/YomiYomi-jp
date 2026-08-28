// Cloudflare Pages Functions 규격 (functions/api/payments/verify.js)
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { orderData, planName, userId } = body || {};

    // 1. 프론트엔드에서 보낸 Firebase ID Token 읽기 (보안 권한 승인용)
    const authHeader = request.headers.get('Authorization');

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, message: '유저 ID가 누락되었습니다.' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. 레몬스퀴지 API 키 및 결제 상태 확인
    const lsApiKey = env.LEMONSQUEEZY_API_KEY || env.LEMON_SQUEEZY_API_KEY;
    const orderId = orderData?.id || body?.paymentId;

    if (lsApiKey && orderId) {
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
        
        if (paymentStatus !== 'paid') {
          return new Response(
            JSON.stringify({ success: false, message: `결제 미완료 (상태: ${paymentStatus})` }), 
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // 3. 구독 기간 정밀 계산
    let addDays = 90; // 기본 3개월
    const pName = String(planName || '3개월');

    if (pName.includes('1년') || pName.includes('1 Year') || pName.includes('1-Year')) {
      addDays = 365;
    } else if (pName.includes('평생') || pName.includes('Lifetime')) {
      addDays = 36500; // 영구
    }

    const endDate = new Date(Date.now() + addDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 4. Firestore REST API 인증 헤더 구성 (유저 ID Token 포함)
    const projectId = env.VITE_FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID;
    const apiKey = env.VITE_FIREBASE_API_KEY || env.FIREBASE_WEB_API_KEY;

    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}?key=${apiKey}&updateMask.fieldPaths=isSubscribed&updateMask.fieldPaths=subscriptionPlan&updateMask.fieldPaths=subscriptionEndDate`;

    const headers = { 'Content-Type': 'application/json' };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const firestoreRes = await fetch(firestoreUrl, {
      method: 'PATCH',
      headers: headers,
      body: JSON.stringify({
        fields: {
          isSubscribed: { booleanValue: true },
          subscriptionPlan: { stringValue: pName },
          subscriptionEndDate: { stringValue: endDate }
        }
      })
    });

    if (firestoreRes.ok) {
      return new Response(
        JSON.stringify({ success: true, message: '결제 검증 및 프리미엄 승인이 완료되었습니다.' }), 
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      const errText = await firestoreRes.text();
      return new Response(
        JSON.stringify({ success: false, message: 'Firestore 업데이트 실패: ' + errText }), 
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, message: '서버 오류: ' + err.message }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}