// 구글 Gemini REST API 다이렉트 호출 함수 (gemini-3.5-flash-lite 정식 적용)
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

// JSON 안심 파싱 유틸리티 (500 파싱 에러 방지용 정규식 강화)
function extractCleanJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return '{}';
  
  // 마크다운 백틱 및 앞뒤 공백 완전 제거
  let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  // JSON 시작({)과 끝(})을 찾아 불필요한 인간 친화적 텍스트(Here is the result 등) 도려내기
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  } else {
    // 배열 형태([])로 응답이 올 경우에 대비
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket >= firstBracket) {
      cleaned = cleaned.substring(firstBracket, lastBracket + 1);
    } else {
       return '{}'; // 파싱 불가능한 텍스트일 경우 빈 객체 반환
    }
  }
  
  return cleaned;
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
        responseMimeType: 'application/json', // 강제 JSON 규격 요구
        temperature: 0.1,
        maxOutputTokens: 2000
      }
    };

    // Gemini API 호출
    const apiResult = await fetchGeminiDirect(apiKey, payload);
    const rawText = apiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    // 🌸 안전한 JSON 추출 (여기서 에러가 나지 않도록 try-catch 보강)
    const jsonString = extractCleanJson(rawText);
    let parsedData = {};
    try {
      parsedData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('[Gemini Final JSON Parse Failed]:', jsonString);
      throw new Error("FAILED_TO_PARSE_CLEANED_JSON");
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