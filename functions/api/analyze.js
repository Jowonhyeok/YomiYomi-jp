// 구글 Gemini REST API 다이렉트 호출 함수 (503 대응 재시도 및 Fallback 적용)
async function fetchGeminiDirect(apiKey, payload, retries = 3, initialDelay = 1000) {
  // 메인 모델: gemini-3.5-flash-lite
  // 대체(Fallback) 모델: gemini-3.1-flash-lite
  const primaryModel = 'gemini-3.5-flash-lite';
  const fallbackModel = 'gemini-3.1-flash-lite';
  let delay = initialDelay;

  for (let attempt = 0; attempt < retries; attempt++) {
    // 마지막 시도 시 안정적인 fallback 모델(gemini-3.1-flash-lite)로 전환
    const model = (attempt === retries - 1) ? fallbackModel : primaryModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        return await response.json();
      }

      // 503 (Service Unavailable) 또는 429 (Rate Limit) 발생 시 대기 후 재시도
      if (response.status === 503 || response.status === 429) {
        console.warn(`[Gemini API Warning] Status ${response.status} (${model}). ${delay}ms 후 재시도... (${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // 지수 백오프 (1s -> 2s)
        continue;
      }

      const errorText = await response.text();
      throw new Error(`GEMINI_API_ERROR_${response.status}: ${errorText}`);

    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const idToken = authHeader.split('Bearer ')[1];
  const firebaseApiKey = env.VITE_FIREBASE_API_KEY;
  const projectId = env.VITE_FIREBASE_PROJECT_ID || 'yomiyomi-jp';

  let uid = null;

  try {
    const verifyRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });

    if (!verifyRes.ok) {
      return new Response(JSON.stringify({ error: 'INVALID_TOKEN', message: '유효하지 않은 인증 토큰입니다.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const verifyData = await verifyRes.json();
    uid = verifyData.users?.[0]?.localId;
    if (!uid) throw new Error('UID를 찾을 수 없습니다.');
  } catch (err) {
    return new Response(JSON.stringify({ error: 'INVALID_TOKEN', message: '인증 검증 실패: ' + err.message }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let userData = {};
  try {
    const userDocRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    if (userDocRes.ok) {
      const docJson = await userDocRes.json();
      const fields = docJson.fields || {};
      userData = {
        isSubscribed: fields.isSubscribed?.booleanValue || false,
        dailyAnalyzeCount: parseInt(fields.dailyAnalyzeCount?.integerValue || '0', 10),
        lastAnalyzeDate: fields.lastAnalyzeDate?.stringValue || '',
        subscriptionEndDate: fields.subscriptionEndDate?.stringValue || ''
      };
    }
  } catch (e) {
    console.error('Firestore User Read Warning:', e.message);
  }

  try {
    let isSubscribed = userData.isSubscribed || false;
    if (userData.subscriptionEndDate && new Date(userData.subscriptionEndDate) < new Date()) {
      isSubscribed = false;
    }

    const body = await request.json().catch(() => ({}));
    const { text = '', targetLang = 'en', imageBase64 = null, deviceId = null } = body;
    const MAX_INPUT_TEXT = 2500;

    if (text && text.length > MAX_INPUT_TEXT) {
      return new Response(JSON.stringify({ error: 'TEXT_TOO_LONG', message: '텍스트 길이가 제한을 초과했습니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const today = new Date().toISOString().split('T')[0];
    let dailyCount = userData.lastAnalyzeDate === today ? (userData.dailyAnalyzeCount || 0) : 0;

    // 🛡️ 1. 유저 계정 기준 제한 검증
    if (!isSubscribed && dailyCount >= 3) {
      return new Response(JSON.stringify({ error: 'DAILY_LIMIT_EXCEEDED', message: '오늘의 무료 분석 횟수(3회)를 모두 사용하셨습니다.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (isSubscribed && dailyCount >= 300) {
      return new Response(JSON.stringify({ error: 'FUP_LIMIT_EXCEEDED', message: '일일 최대 분석 제공량을 초과했습니다. 내일 다시 이용해 주세요.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 🛡️ 2. 기기 핑거프린트 검증 (deviceId가 유효할 때만 안전하게 실행)
    let deviceUsageCount = 0;
    const isValidDeviceId = typeof deviceId === 'string' && deviceId.trim().length > 0;

    if (isValidDeviceId && !isSubscribed) {
      try {
        const deviceDocRes = await fetch(
          `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/devices/${deviceId}_${today}`,
          { headers: { 'Authorization': `Bearer ${idToken}` } }
        );

        if (deviceDocRes.ok) {
          const deviceData = await deviceDocRes.json();
          deviceUsageCount = parseInt(deviceData.fields?.count?.integerValue || '0', 10);
        }

        if (deviceUsageCount >= 3) {
          return new Response(JSON.stringify({ 
            error: 'DEVICE_LIMIT_EXCEEDED', 
            message: '해당 기기에서 오늘의 무료 분석 횟수(3회)를 모두 사용하셨습니다.' 
          }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (devErr) {
        console.error('Device Check Warning:', devErr);
      }
    }

    const apiKey = env.GEMINI_API_KEY || '';
    if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');

    let langGuide = "English";
    if (targetLang === "zh-CN") langGuide = "Simplified Chinese";
    else if (targetLang === "zh-TW") langGuide = "Traditional Chinese";
    else if (targetLang === "ko") langGuide = "Korean";
    else if (targetLang === "ja") langGuide = "Japanese";

    const parts = [];
    if (text && typeof text === 'string' && text.trim().length > 0) {
      parts.push({ text: `Input: "${text}"` });
    }
    
    // 이미지 첨부 유무 검증
    if (imageBase64 && typeof imageBase64 === 'object' && imageBase64.mimeType && imageBase64.data) {
      parts.push({ inlineData: { mimeType: imageBase64.mimeType, data: imageBase64.data } });
      parts.push({ text: "Instruction: OCR and analyze Japanese text in image." });
    }

    const payload = {
      systemInstruction: {
        parts: [{
          text: `Task: Analyze Japanese text for language learners. Output JSON ONLY.
Target Translation Language: "${targetLang}" (${langGuide})

Schema Rules:
- "translatedText": Full translation string in target language.
- "partOfSpeech": Exactly one strictly from ["noun","verb","adjective","adverb","particle","conjunction","auxiliary verb","expression","prefix","suffix"].
- "meaning" & "explanation": Multilingual map with keys ["ko","en","zh-CN","zh-TW","ja"].`
        }]
      },
      contents: [{ role: 'user', parts: parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    };

    // 재시도 및 Fallback 로직이 적용된 호출 실행
    const apiResult = await fetchGeminiDirect(apiKey, payload);
    const rawText = apiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    let parsedData = {};
    try {
      const cleanedJsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleanedJsonText);
    } catch (pErr) {
      console.error('JSON Parse Error Raw Content:', rawText);
      throw new Error('FAILED_TO_PARSE_GEMINI_RESPONSE');
    }

    // 🌸 DB 카운트 증가 처리를 백그라운드로 처리 (응답 속도 향상)
    if (context.waitUntil) {
      const asyncTasks = [
        fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=dailyAnalyzeCount&updateMask.fieldPaths=lastAnalyzeDate`, {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}` 
          },
          body: JSON.stringify({
            fields: {
              dailyAnalyzeCount: { integerValue: String(dailyCount + 1) },
              lastAnalyzeDate: { stringValue: today }
            }
          })
        })
      ];

      if (isValidDeviceId) {
        asyncTasks.push(
          fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/devices/${deviceId}_${today}`, {
            method: 'PATCH',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}` 
            },
            body: JSON.stringify({
              fields: {
                count: { integerValue: String(deviceUsageCount + 1) }
              }
            })
          })
        );
      }

      context.waitUntil(
        Promise.all(asyncTasks).catch(err => console.error('Firestore Async Update Warning:', err))
      );
    }

    return new Response(JSON.stringify(parsedData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err) {
    const errString = String(err?.message || err || '');
    console.error('[Analyze Error Detail]:', errString);

    if (errString.includes("503") || errString.includes("Service Unavailable") || errString.includes("high demand")) {
      return new Response(JSON.stringify({ 
        error: 'SERVICE_UNAVAILABLE', 
        message: '503 Service Unavailable: Google Gemini API에 일시적인 트래픽 폭증이 발생했습니다. 잠시 후 다시 시도해 주세요.' 
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'INTERNAL_SERVER_ERROR', message: errString || '서버 오류가 발생했습니다.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}