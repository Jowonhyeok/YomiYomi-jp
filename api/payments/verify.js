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

  // 1. Firebase Auth 토큰 검증
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

    let addDays = 90; // 3개월 (기본)
    const pName = String(planName || '3개월');
    if (pName.includes('1년') || pName.includes('1 Year') || pName.includes('1y')) addDays = 365;
    else if (pName.includes('평생') || pName.includes('Lifetime')) addDays = 36500; // 평생 이용권 (100년)

    const now = new Date();
    const nowTimestamp = now.getTime();
    let baseDate = now;

    const documentName = `projects/${projectId}/databases/(default)/documents/users/${userId}`;

    // 🌸 3. Google OAuth 2.0 서비스 계정 토큰 발급 함수 (Firebase Admin 권한 획득) 🌸
    async function getFirestoreAccessToken() {
      const saKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (!saKeyEnv) return null;

      try {
        const sa = JSON.parse(saKeyEnv);
        const header = { alg: 'RS256', typ: 'JWT' };
        const nowSec = Math.floor(Date.now() / 1000);
        const claim = {
          iss: sa.client_email,
          scope: 'https://www.googleapis.com/auth/datastore',
          aud: 'https://oauth2.googleapis.com/token',
          exp: nowSec + 3600,
          iat: nowSec
        };

        // Node.js crypto 모듈 사용
        const crypto = await import('crypto');
        
        function base64UrlEncode(str) {
          return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        }

        const encodedHeader = base64UrlEncode(JSON.stringify(header));
        const encodedClaim = base64UrlEncode(JSON.stringify(claim));
        const signInput = `${encodedHeader}.${encodedClaim}`;

        const signer = crypto.createSign('RSA-SHA256');
        signer.update(signInput);
        const signature = signer.sign(sa.private_key, 'base64')
          .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

        const jwt = `${signInput}.${signature}`;

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
          })
        });

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          return tokenData.access_token;
        }
      } catch (err) {
        console.error('Service Account Token Error:', err.message);
      }
      return null;
    }

    // Admin 서비스 계정 토큰 획득 (실패 시 기존 idToken 사용)
    const adminToken = await getFirestoreAccessToken();
    const effectiveToken = adminToken || idToken;

    // 4. 기존 사용자 구독 기한 읽기
    try {
      const userDocRes = await fetch(`https://firestore.googleapis.com/v1/${documentName}`, {
        headers: { 'Authorization': `Bearer ${effectiveToken}` }
      });
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

    // 5. Firestore DB 업데이트 (Admin 권한으로 패치)
    const patchUrl = `https://firestore.googleapis.com/v1/${documentName}?` +
      `updateMask.fieldPaths=isSubscribed&` +
      `updateMask.fieldPaths=subscriptionPlan&` +
      `updateMask.fieldPaths=subscriptionEndDate&` +
      `updateMask.fieldPaths=lastPaymentId&` +
      `updateMask.fieldPaths=lastPaymentDate&` +
      `updateMask.fieldPaths=lastPaymentAt&` +
      `updateMask.fieldPaths=cancelAtPeriodEnd`;

    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveToken}` 
      },
      body: JSON.stringify({
        name: documentName,
        fields: {
          isSubscribed: { booleanValue: true },
          subscriptionPlan: { stringValue: pName },
          subscriptionEndDate: { stringValue: formattedEndDate },
          lastPaymentId: { stringValue: String(paymentId) },
          lastPaymentDate: { stringValue: now.toISOString() },
          lastPaymentAt: { integerValue: String(nowTimestamp) },
          cancelAtPeriodEnd: { booleanValue: false }
        }
      })
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      console.error('[Firestore Update Failed Detail]:', errText);
      throw new Error(errText);
    }

    return res.status(200).json({ success: true, message: '결제 검증 및 프리미엄 승인이 완료되었습니다.' });

  } catch (err) {
    console.error('[Verify Payment Error]:', err.message || err);
    return res.status(500).json({ success: false, message: 'DB 업데이트 실패: ' + (err.message || '알 수 없는 오류') });
  }
}