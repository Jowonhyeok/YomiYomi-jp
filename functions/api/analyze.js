// Google Gemini REST API 호출 함수
async function fetchGeminiDirect(apiKey, payload) {
  const targetModel = 'gemini-3.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

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
      throw new Error(`GEMINI_RESPONSE_PARSE_FAILED: ${resText.slice(0, 100)}`);
    }
  }

  throw new Error(`GEMINI_API_ERROR_${response.status}: ${resText}`);
}

// AI 응답 텍스트 정제 및 손상된 JSON 자동 복구 함수
function extractCleanJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return '{}';
  
  let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  const firstBrace = cleaned.indexOf('{');
  let lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1) {
    if (lastBrace === -1 || lastBrace < firstBrace) {
      cleaned = cleaned.substring(firstBrace) + '}';
    } else {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }
  
  return cleaned;
}

// 🌸 Firestore 유저 카운트 증가 처리 함수 (REST API)
async function updateUserUsageCount(firebaseApiKey, uid) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const userDocUrl = `https://firestore.googleapis.com/v1/projects/yomiyomi-jp/databases/(default)/documents/users/${uid}?key=${firebaseApiKey}`;

    // 1. 기존 유저 정보 조회
    const getRes = await fetch(userDocUrl);
    if (!getRes.ok) return;

    const userData = await getRes.json();
    const fields = userData.fields || {};

    const lastAnalyzeDate = fields.lastAnalyzeDate?.stringValue || '';
    const currentCount = fields.dailyAnalyzeCount?.integerValue ? parseInt(fields.dailyAnalyzeCount.integerValue) : 0;

    // 날짜가 바뀌었으면 1로 초기화, 같은 날이면 +1 증가
    const newCount = (lastAnalyzeDate === today) ? currentCount + 1 : 1;

    // 2. Firestore 문서 업데이트 (PATCH)
    const updateUrl = `${userDocUrl}&updateMask.fieldPaths=dailyAnalyzeCount&updateMask.fieldPaths=lastAnalyzeDate`;
    await fetch(updateUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          dailyAnalyzeCount: { integerValue: newCount },
          lastAnalyzeDate: { stringValue: today }
        }
      })
    });
  } catch (e) {
    console.error("Failed to update usage count in Firestore:", e);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const firebaseApiKey = env.VITE_FIREBASE_API_KEY || env.FIREBASE_API_KEY;
  const apiKey = env.GEMINI_API_KEY || '';

  // 1. Authorization 헤더 검증
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const idToken = authHeader.split('Bearer ')[1];
  let uid = '';

  // 2. Firebase ID Token 검증 및 uid 추출
  try {
    const verifyRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });

    if (!verifyRes.ok) {
      return new Response(JSON.stringify({ error: 'INVALID_TOKEN', message: '인증 세션이 만료되었습니다.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const verifyData = await verifyRes.json();
    uid = verifyData.users?.[0]?.localId || '';
  } catch (err) {
    return new Response(JSON.stringify({ error: 'AUTH_VERIFY_FAILED', message: err.message }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 3. AI 본문 분석 실행
  try {
    const body = await request.json().catch(() => ({}));
    const { text = '', targetLang = 'en', imageBase64 = null } = body;

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
          text: `Task: Analyze Japanese text for learners. Output JSON ONLY.
Target Language for ALL Meanings & Explanations: "${langGuide}" (${targetLang})

STRICT OUTPUT RULES:
1. Output MUST be valid JSON only without markdown.
2. "meaning" and "explanation" MUST BE A SINGLE STRING in "${langGuide}".
3. "rubySentences": Convert Japanese kanji using <ruby>漢字<rt>かんじ</rt></ruby> tags.
4. "wordList": Extract MAX 10 key words.
5. "kanjiList": Extract MAX 8 key kanji.
6. "grammarList": Extract MAX 5 key grammar structures.

JSON Schema:
{
  "isJapanese": true,
  "translatedText": "Full text translation in ${langGuide}",
  "rubySentences": ["山中<ruby>市長<rt>しちょう</rt></ruby>は..."],
  "wordList": [{"word":"市長","reading":"しちょう","partOfSpeech":"noun","meaning":"Meaning in ${langGuide}","jlpt":"N3"}],
  "kanjiList": [{"kanji":"市","readings":"シ","meaning":"Meaning in ${langGuide}"}],
  "grammarList": [{"grammar":"〜において","explanation":"Explanation in ${langGuide}"}]
}`
        }]
      },
      contents: [{ role: 'user', parts: parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 8192
      }
    };

    const apiResult = await fetchGeminiDirect(apiKey, payload);
    const rawText = apiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    const jsonString = extractCleanJson(rawText);
    
    let parsedData = {};
    try {
      parsedData = JSON.parse(jsonString);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'PARSE_ERROR', message: 'AI 분석 응답의 형식이 올바르지 않습니다.', rawText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 🌸 4. 분석 성공 시 Firestore의 사용 횟수 업데이트
    if (uid && firebaseApiKey) {
      context.waitUntil(updateUserUsageCount(firebaseApiKey, uid));
    }

    return new Response(JSON.stringify(parsedData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'ANALYSIS_FAILED', message: err.message }), {
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}