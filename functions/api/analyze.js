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

// JSON 안심 파싱 유틸리티 (중첩 정교화)
function extractCleanJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return '{}';
  
  let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.substring(firstBrace, lastBrace + 1);
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

CRITICAL RULES:
1. Response must be pure JSON with NO markdown formatting (no \`\`\`json).
2. "rubySentences" MUST contain sentences with <ruby>漢字<rt>かんじ</rt></ruby> tags.
3. Provide "meaning" and "explanation" strictly as a single string in ${langGuide}.
4. "partOfSpeech" MUST be strictly one of: ["noun","verb","adjective","adverb","particle","conjunction","auxiliary verb","expression","prefix","suffix"].

JSON Structure:
{
  "isJapanese": true,
  "translatedText": "Full translation in ${langGuide}",
  "rubySentences": [
    "山中<ruby>市長<rt>しちょう</rt></ruby>は<ruby>記者会見<rt>きしゃかいけん</rt></ruby>で..."
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
        maxOutputTokens: 3500 // 🌸 토큰 부족으로 인한 JSON 절단 방지
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
      // 2차 파싱 방어 (따옴표나 개행 문제 보정)
      try {
        const sanitizedStr = jsonString.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");
        parsedData = JSON.parse(sanitizedStr);
      } catch (secondaryError) {
        console.error('[Raw Gemini Response Parsing Error]:', rawText);
        throw new Error("FAILED_TO_PARSE_CLEANED_JSON");
      }
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