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

// JSON 안심 파싱 유틸리티
function extractCleanJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return '{}';
  
  let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  } else {
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket >= firstBracket) {
      cleaned = cleaned.substring(firstBracket, lastBracket + 1);
    } else {
      return '{}';
    }
  }
  
  return cleaned;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Firebase API Key 환경변수 체크
  const firebaseApiKey = env.VITE_FIREBASE_API_KEY || env.FIREBASE_API_KEY;
  if (!firebaseApiKey) {
    return new Response(JSON.stringify({ error: 'CONFIG_ERROR', message: 'VITE_FIREBASE_API_KEY 환경변수가 미설정되었습니다.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. Firebase 인증 토큰 헤더 검증
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Authorization 헤더가 없거나 유효하지 않습니다.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const idToken = authHeader.split('Bearer ')[1];
  let uid = null;

  // 3. Firebase ID 토큰 유효성 검사
  try {
    const verifyRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });

    if (!verifyRes.ok) {
      const errResText = await verifyRes.text();
      return new Response(JSON.stringify({ 
        error: 'INVALID_TOKEN', 
        message: `Firebase 인증 실패: ${errResText}` 
      }), {
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
    const MAX_INPUT_TEXT = 2500;

    if (text && text.length > MAX_INPUT_TEXT) {
      return new Response(JSON.stringify({ error: 'TEXT_TOO_LONG', message: '텍스트 길이가 제한을 초과했습니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = env.GEMINI_API_KEY || '';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'CONFIG_ERROR', message: 'GEMINI_API_KEY 환경변수가 미설정되었습니다.' }), {
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
          text: `Task: Analyze Japanese text for language learners. Output JSON ONLY.
Target Language for All Meanings & Explanations: "${langGuide}" (${targetLang})

STRICT OUTPUT RULES:
1. Output MUST be valid JSON only. Do not wrap in markdown or add explanations.
2. "rubySentences" MUST NOT be empty. Convert every Japanese sentence using <ruby>漢字<rt>かんじ</rt></ruby> tags.
3. "wordList", "kanjiList", and "grammarList" MUST contain analyzed components.
4. DO NOT output multilingual maps. Provide all "meaning" and "explanation" fields ONLY as a SINGLE STRING in ${langGuide}.
5. "partOfSpeech" MUST be strictly one from: ["noun","verb","adjective","adverb","particle","conjunction","auxiliary verb","expression","prefix","suffix"].

JSON Schema:
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
        maxOutputTokens: 2000
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
        message: `JSON 파싱 실패 원본: ${rawText.slice(0, 300)}` 
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

    // 🌸 서버 에러 발생 시 브라우저 응답에 상세 원인 메시지 노출 🌸
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