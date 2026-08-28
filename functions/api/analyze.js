// SDK 없이 구글 Gemini REST API를 직접 타격하는 재시도 함수
async function fetchGeminiDirect(apiKey, payload, retries = 2, delay = 800) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      if ((response.status === 503 || errorText.includes("high demand")) && retries > 0) {
        await new Promise(res => setTimeout(res, delay));
        return fetchGeminiDirect(apiKey, payload, retries - 1, delay * 1.5);
      }
      throw new Error(`GEMINI_API_ERROR_${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (err) {
    if (retries > 0 && String(err).includes("503")) {
      await new Promise(res => setTimeout(res, delay));
      return fetchGeminiDirect(apiKey, payload, retries - 1, delay * 1.5);
    }
    throw err;
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
    const { text, targetLang = 'en', imageBase64 } = body;
    const MAX_INPUT_TEXT = 2500;

    if (text && text.length > MAX_INPUT_TEXT) {
      return new Response(JSON.stringify({ error: 'TEXT_TOO_LONG', message: '텍스트 길이가 제한을 초과했습니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const today = new Date().toISOString().split('T')[0];
    let dailyCount = userData.lastAnalyzeDate === today ? (userData.dailyAnalyzeCount || 0) : 0;

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

    const apiKey = env.GEMINI_API_KEY || '';
    if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');

    let langGuide = "English";
    if (targetLang === "zh-CN") langGuide = "Simplified Chinese";
    else if (targetLang === "zh-TW") langGuide = "Traditional Chinese";
    else if (targetLang === "ko") langGuide = "Korean";
    else if (targetLang === "ja") langGuide = "Japanese";

    const parts = [];
    if (text) parts.push({ text: `Input: "${text}"` });
    if (imageBase64) {
      parts.push({ inlineData: { mimeType: imageBase64.mimeType, data: imageBase64.data } });
      parts.push({ text: "Instruction: OCR and analyze Japanese text in image." });
    }

    // 🌸 System Instruction & Response Schema 적용 페이로드
    const payload = {
      systemInstruction: {
        parts: [{
          text: `Task: Analyze Japanese input for language learners.
Target Language: "${targetLang}" (${langGuide})

Rules:
1. "translatedText": Full text translation in target language (string).
2. "partOfSpeech": Standard code strictly from ["noun","verb","adjective","adverb","particle","conjunction","auxiliary verb","expression","prefix","suffix"].
3. "meaning" & "explanation": Multilingual map with keys ["ko","en","zh-CN","zh-TW","ja"].`
        }]
      },
      contents: [{ role: 'user', parts: parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: "OBJECT",
          properties: {
            isJapanese: { type: "BOOLEAN" },
            translatedText: { type: "STRING" },
            rubySentences: { type: "ARRAY", items: { type: "STRING" } },
            kanjiList: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  kanji: { type: "STRING" },
                  readings: { type: "STRING" },
                  meaning: {
                    type: "OBJECT",
                    properties: {
                      ko: { type: "STRING" },
                      en: { type: "STRING" },
                      "zh-CN": { type: "STRING" },
                      "zh-TW": { type: "STRING" },
                      ja: { type: "STRING" }
                    }
                  }
                },
                required: ["kanji", "readings", "meaning"]
              }
            },
            wordList: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  word: { type: "STRING" },
                  reading: { type: "STRING" },
                  partOfSpeech: { type: "STRING" },
                  meaning: {
                    type: "OBJECT",
                    properties: {
                      ko: { type: "STRING" },
                      en: { type: "STRING" },
                      "zh-CN": { type: "STRING" },
                      "zh-TW": { type: "STRING" },
                      ja: { type: "STRING" }
                    }
                  },
                  jlpt: { type: "STRING" }
                },
                required: ["word", "reading", "partOfSpeech", "meaning"]
              }
            },
            grammarList: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  grammar: { type: "STRING" },
                  explanation: {
                    type: "OBJECT",
                    properties: {
                      ko: { type: "STRING" },
                      en: { type: "STRING" },
                      "zh-CN": { type: "STRING" },
                      "zh-TW": { type: "STRING" },
                      ja: { type: "STRING" }
                    }
                  }
                },
                required: ["grammar", "explanation"]
              }
            }
          },
          required: ["isJapanese", "translatedText", "rubySentences", "wordList"]
        },
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    };

    const apiResult = await fetchGeminiDirect(apiKey, payload);
    const rawText = apiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsedData = JSON.parse(rawText);

    // Firestore 비동기 처리
    context.waitUntil(
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
      }).catch(err => console.error('Firestore Update Warning:', err))
    );

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
        message: '503 Service Unavailable: High demand on Google Gemini API.' 
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