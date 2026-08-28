// Google Gemini REST API 호출 함수
async function fetchGeminiDirect(apiKey, payload) {
  // 🌸 Gemini 3.5 Flash-Lite 정식 모델 ID 적용
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
      throw new Error(`API_RESPONSE_NOT_JSON: ${resText.slice(0, 100)}`);
    }
  }

  // Google API 통신 에러 발생 시 500 내뱉지 않도록 에러 포맷팅
  throw new Error(`GEMINI_API_ERROR_${response.status}: ${resText}`);
}

// AI 응답 텍스트에서 마크다운 제거 후 순수 JSON 추출
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

  const firebaseApiKey = env.VITE_FIREBASE_API_KEY || env.FIREBASE_API_KEY;
  const apiKey = env.GEMINI_API_KEY || '';

  // 1. Auth 토큰 검증
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const idToken = authHeader.split('Bearer ')[1];

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
  } catch (err) {
    return new Response(JSON.stringify({ error: 'AUTH_VERIFY_FAILED', message: err.message }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. 본문 분석 실행
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
          text: `Task: Analyze Japanese text for learners. FAST RESPONSE REQUIRED. Output JSON ONLY.
Target Language for ALL Meanings & Explanations: "${langGuide}" (${targetLang})

STRICT OUTPUT RULES:
1. Output MUST be valid JSON only without markdown formatting.
2. "meaning" and "explanation" MUST BE A SINGLE STRING in "${langGuide}" ONLY.
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
        maxOutputTokens: 2048
      }
    };

    const apiResult = await fetchGeminiDirect(apiKey, payload);
    const rawText = apiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    const jsonString = extractCleanJson(rawText);
    
    let parsedData = {};
    try {
      parsedData = JSON.parse(jsonString);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'PARSE_ERROR', message: 'AI 응답 결과 JSON 파싱에 실패했습니다.', rawText }), {
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