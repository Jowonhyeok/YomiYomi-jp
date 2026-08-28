// 구글 Gemini REST API 다이렉트 호출 함수 (gemini-3.5-flash-lite)
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
      throw new Error(`API_RESPONSE_NOT_JSON: ${resText}`);
    }
  }

  throw new Error(`GEMINI_API_ERROR_${response.status}: ${resText}`);
}

// 안전한 JSON 추출 유틸리티
function extractCleanJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return '{}';
  
  let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    return cleaned.substring(firstBrace, lastBrace + 1);
  }
  
  return cleaned;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Firebase API Key 환경변수 체크
  const firebaseApiKey = env.VITE_FIREBASE_API_KEY || env.FIREBASE_API_KEY;
  if (!firebaseApiKey) {
    return new Response(JSON.stringify({ error: 'CONFIG_ERROR', message: 'VITE_FIREBASE_API_KEY 환경변수가 설정되지 않았증니다.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. Firebase 인증 토큰 헤더 검증
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const idToken = authHeader.split('Bearer ')[1];
  let uid = null;

  try {
    const verifyRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });

    if (!verifyRes.ok) {
      const errResText = await verifyRes.text();
      return new Response(JSON.stringify({ error: 'INVALID_TOKEN', message: `Firebase 인증 실패: ${errResText}` }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const verifyData = await verifyRes.json();
    uid = verifyData.users?.[0]?.localId;
    if (!uid) {
      return new Response(JSON.stringify({ error: 'INVALID_TOKEN', message: '사용자 UID를 찾을 수 없습니다.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: 'AUTH_VERIFY_FAILED', message: '인증 검증 통신 오류: ' + err.message }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { text = '', targetLang = 'en', imageBase64 = null } = body;
    
    // 🌸 입력 제한을 1,500자로 변경
    const MAX_INPUT_TEXT = 1500;

    if (text && text.length > MAX_INPUT_TEXT) {
      return new Response(JSON.stringify({ error: 'TEXT_TOO_LONG', message: '텍스트 길이가 제한(1,500자)을 초과했습니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = env.GEMINI_API_KEY || '';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'CONFIG_ERROR', message: 'GEMINI_API_KEY가 백엔드에 설정되지 않았습니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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
          text: `Task: Analyze Japanese text for language learners up to 1500 characters. Output JSON ONLY.
Target Language for All Meanings & Explanations: "${langGuide}" (${targetLang})

STRICT OUTPUT RULES:
1. Output MUST be valid JSON only without markdown formatting.
2. "rubySentences": Split text into sentences and convert all Japanese kanji using <ruby>漢字<rt>かんじ</rt></ruby> tags.
3. "wordList": Extract key vocabulary (max 20 items).
4. "kanjiList": Extract unique key kanji (max 15 items).
5. "grammarList": Extract key grammar structures (max 8 items).
6. "partOfSpeech": MUST be strictly one from: ["noun","verb","adjective","adverb","particle","conjunction","auxiliary verb","expression","prefix","suffix"].

JSON Schema:
{
  "isJapanese": true,
  "translatedText": "Full text translation in ${langGuide}",
  "rubySentences": [
    "山中<ruby>市長<rt>しちょう</rt></ruby>は..."
  ],
  "wordList": [
    {
      "word": "市長",
      "reading": "しちょう",
      "partOfSpeech": "noun",
      "meaning": "Meaning in ${langGuide}",
      "jlpt": "N3"
    }
  ],
  "kanjiList": [
    {
      "kanji": "市",
      "readings": "シ",
      "meaning": "Meaning in ${langGuide}"
    }
  ],
  "grammarList": [
    {
      "grammar": "〜において",
      "explanation": "Explanation in ${langGuide}"
    }
  ]
}`
        }]
      },
      contents: [{ role: 'user', parts: parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 4096 // 🌸 1,500자용 최적 토큰 상한
      }
    };

    // Gemini API 호출
    const apiResult = await fetchGeminiDirect(apiKey, payload);
    const rawText = apiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    // 안전한 JSON 파싱
    const jsonString = extractCleanJson(rawText);
    let parsedData = {};
    try {
      parsedData = JSON.parse(jsonString);
    } catch (parseError) {
      return new Response(JSON.stringify({ 
        error: 'PARSE_ERROR', 
        message: `JSON 파싱 실패: ${rawText.slice(0, 300)}` 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
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

    return new Response(JSON.stringify({ 
      error: 'SERVER_EXECUTION_ERROR', 
      message: `[Server Detail Error]: ${errString}` 
    }), {
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