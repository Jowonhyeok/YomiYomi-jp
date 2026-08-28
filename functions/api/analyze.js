// 구글 Gemini REST API 다이렉트 호출 함수 (gemini-3.5-flash-lite)
async function fetchGeminiDirect(apiKey, payload, retries = 3, initialDelay = 1000) {
  const targetModel = 'gemini-3.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
  let currentDelay = initialDelay;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resText = await response.text();

      if (response.ok) {
        try {
          return JSON.parse(resText);
        } catch (e) {
          throw new Error(`API_RESPONSE_NOT_JSON: ${resText}`);
        }
      }

      if ((response.status === 503 || response.status === 429) && attempt < retries - 1) {
        const jitter = Math.random() * 500;
        const waitTime = currentDelay + jitter;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        currentDelay *= 2;
        continue;
      }

      throw new Error(`GEMINI_API_ERROR_${response.status}: ${resText}`);

    } catch (err) {
      if (attempt === retries - 1) throw err;
      const jitter = Math.random() * 500;
      const waitTime = currentDelay + jitter;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      currentDelay *= 2;
    }
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Firebase 인증 토큰 검증
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

  // 2. 유저 데이터 조회
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

    // 일일 한도 검증
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
      parts.push({ text: `Input Text: "${text}"` });
    }
    
    if (imageBase64 && typeof imageBase64 === 'object' && imageBase64.mimeType && imageBase64.data) {
      parts.push({ inlineData: { mimeType: imageBase64.mimeType, data: imageBase64.data } });
      parts.push({ text: "Instruction: Perform OCR and analyze Japanese text in image." });
    }

    const payload = {
      systemInstruction: {
        parts: [{
          text: `Task: Analyze Japanese text for language learners. Output JSON ONLY.
Target Language for All Meanings & Explanations: "${langGuide}" (${targetLang})

STRICT OUTPUT RULES:
1. "rubySentences" MUST NOT be empty. Convert every Japanese sentence using <ruby>漢字<rt>かんじ</rt></ruby> tags.
2. "wordList", "kanjiList", and "grammarList" MUST contain analyzed components.
3. DO NOT output multilingual maps. Provide all "meaning" and "explanation" fields ONLY as a SINGLE STRING in ${langGuide}.
4. "partOfSpeech" MUST be strictly one from: ["noun","verb","adjective","adverb","particle","conjunction","auxiliary verb","expression","prefix","suffix"].

JSON Schema Example:
{
  "isJapanese": true,
  "translatedText": "Full text translation in ${langGuide}",
  "rubySentences": [
    "山中<ruby>市長<rt>しちょう</rt></ruby>は<ruby>記者会見<rt>きしゃかいけん</rt></ruby>で..."
  ],
  "wordList": [
    {
      "word": "市長",
      "reading": "しちょう",
      "partOfSpeech": "noun",
      "meaning": "Meaning string in ${langGuide}",
      "jlpt": "N3"
    }
  ],
  "kanjiList": [
    {
      "kanji": "市",
      "readings": "シ",
      "meaning": "Meaning string in ${langGuide}"
    }
  ],
  "grammarList": [
    {
      "grammar": "〜において",
      "explanation": "Explanation string in ${langGuide}"
    }
  ]
}`
        }]
      },
      contents: [{ role: 'user', parts: parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 3000
      }
    };

    // 🌸 3. Gemini API 직접 호출
    const apiResult = await fetchGeminiDirect(apiKey, payload);
    const rawText = apiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    let parsedData = {};
    try {
      let cleanedJsonText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      
      const firstObj = cleanedJsonText.indexOf('{');
      const firstArr = cleanedJsonText.indexOf('[');
      
      let startPos = -1;
      if (firstObj !== -1 && firstArr !== -1) startPos = Math.min(firstObj, firstArr);
      else if (firstObj !== -1) startPos = firstObj;
      else if (firstArr !== -1) startPos = firstArr;

      const lastObj = cleanedJsonText.lastIndexOf('}');
      const lastArr = cleanedJsonText.lastIndexOf(']');
      const endPos = Math.max(lastObj, lastArr);

      if (startPos !== -1 && endPos !== -1 && endPos > startPos) {
        cleanedJsonText = cleanedJsonText.substring(startPos, endPos + 1);
      }

      parsedData = JSON.parse(cleanedJsonText);
    } catch (pErr) {
      console.error('[Gemini Raw Content Parse Failed]:', rawText);
      throw new Error(`FAILED_TO_PARSE_GEMINI_RESPONSE: ${rawText.slice(0, 100)}`);
    }

    // 🌸 4. 안전한 백그라운드 DB 카운트 업데이트 (DB 오류가 나더라도 유저 응답 500 차단)
    if (context.waitUntil) {
      context.waitUntil((async () => {
        try {
          // 유저 일일 분석 횟수 카운트 증가
          await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`, {
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
          });

          // 디바이스 일일 분석 횟수 카운트 증가
          if (isValidDeviceId) {
            await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/devices/${deviceId}_${today}`, {
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
            });
          }
        } catch (dbUpdateErr) {
          console.warn('[Background DB Counter Update Suppressed Error]:', dbUpdateErr);
        }
      })());
    }

    // 🌸 5. Gemini 분석 완료 결과 즉시 반환 (HTTP 200)
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
        message: '503 Service Unavailable: 구글 Gemini API에 일시적인 트래픽 폭증이 발생했습니다. 잠시 후 다시 시도해 주세요.' 
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