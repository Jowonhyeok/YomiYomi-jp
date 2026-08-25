export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'POST 요청만 허용됩니다.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  const firebaseApiKey = process.env.VITE_FIREBASE_API_KEY;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'yomiyomi-jp';

  let uid = null;

  try {
    const verifyRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });

    if (!verifyRes.ok) {
      return res.status(401).json({ success: false, message: '유효하지 않은 인증 토큰입니다.' });
    }

    const verifyData = await verifyRes.json();
    uid = verifyData.users?.[0]?.localId;
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
      return res.status(500).json({ success: false, message: 'PORTONE_API_SECRET 환경변수가 설정되지 않았증습니다.' });
    }

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

    let addDays = 30;
    if (planName.includes('6') || planName.includes('6m')) addDays = 180;
    else if (planName.includes('1년') || planName.includes('Year') || planName.includes('1y')) addDays = 365;

    const now = new Date();
    let baseDate = now;

    try {
      const userDocRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}`);
      if (userDocRes.ok) {
        const userDocJson = await userDocRes.json();
        const existingEndDateStr = userDocJson.fields?.subscriptionEndDate?.stringValue;
        if (existingEndDateStr) {
          const existingEndDate = new Date(existingEndDateStr);
          if (existingEndDate > now) baseDate = existingEndDate;
        }
      }
    } catch (e) {
      console.error('Firestore Read User Exception:', e.message);
    }

    const newEndDateObj = new Date(baseDate.getTime() + addDays * 24 * 60 * 60 * 1000);
    const formattedEndDate = newEndDateObj.toISOString().split('T')[0];

    // Firestore users 문서에 프리미엄 권한 즉시 부여
    await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}?updateMask.fieldPaths=isSubscribed&updateMask.fieldPaths=subscriptionPlan&updateMask.fieldPaths=subscriptionEndDate&updateMask.fieldPaths=lastPaymentId&updateMask.fieldPaths=lastPaymentDate&updateMask.fieldPaths=cancelAtPeriodEnd`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          isSubscribed: { booleanValue: true },
          subscriptionPlan: { stringValue: planName },
          subscriptionEndDate: { stringValue: formattedEndDate },
          lastPaymentId: { stringValue: paymentId },
          lastPaymentDate: { stringValue: now.toISOString() },
          cancelAtPeriodEnd: { booleanValue: false }
        }
      })
    });

    return res.status(200).json({ success: true, message: '결제 검증 및 프리미엄 승인이 완료되었습니다.' });

  } catch (err) {
    console.error('[Verify Payment Error]:', err.message || err);
    return res.status(500).json({ success: false, message: err.message || '검증 중 오류가 발생했습니다.' });
  }
}