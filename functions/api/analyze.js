import { GoogleGenerativeAI } from '@google/generative-ai';

// 구글 API 호출 실패 시 백엔드 내부 자동 재시도 함수
async function generateWithRetry(model, contents, retries = 2, delay = 1000) {
  try {
    return await model.generateContent({ contents });
  } catch (err) {
    const errStr = String(err?.message || err || '');
    if ((errStr.includes("503") || errStr.includes("Service Unavailable") || errStr.includes("high demand")) && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateWithRetry(model, contents, retries - 1, delay * 1.5);
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

    const genAI = new GoogleGenerativeAI(apiKey);
    
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash-lite',
      generationConfig: { 
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 2500
      }
    });

    let langGuide = "English";
    if (targetLang === "zh-CN") langGuide = "Simplified Chinese (简体中文)";
    else if (targetLang === "zh-TW") langGuide = "Traditional Chinese (繁體中文)";
    else if (targetLang === "ko") langGuide = "Korean (한국어)";
    else if (targetLang === "ja") langGuide = "Japanese (日本語)";

    // 🌸 최적화된 프롬프트 (불필요 토큰 제거 및 해석 속도 대폭 향상)
    let promptText = `Analyze input Japanese for language learner. Respond ONLY in valid JSON.
Target Translation Language: "${targetLang}" (${langGuide})

RULES:
1. "translatedText": plain single string translation in target language.
2. "partOfSpeech" in wordList: ONLY one of ["noun", "verb", "adjective", "adverb", "particle", "conjunction", "auxiliary verb", "expression", "prefix", "suffix"].
3. "meaning" & "explanation": multi-lang object with keys: ["ko", "en", "zh-CN", "zh-TW", "ja"].

JSON SCHEMA:
{
  "isJapanese": true,
  "translatedText": "string",
  "rubySentences": ["<ruby>私<rt>わたし</rt></ruby>は..."],
  "kanjiList": [{"kanji": "私", "readings": "わたし", "meaning": {"ko": "나", "en": "I"}}],
  "wordList": [{"word": "学生", "reading": "がくせい", "partOfSpeech": "noun", "meaning": {"ko": "학생", "en": "student"}, "jlpt": "N5"}],
  "grammarList": [{"grammar": "입니다", "explanation": {"ko": "~입니다", "en": "is/am/are"}}]
}

`;

    if (text) promptText += `[Input Text]: "${text}"\n`;
    if (imageBase64) promptText += `[Instruction]: Extract and analyze Japanese text from the attached image.\n`;

    const parts = [{ text: promptText }];
    if (imageBase64) {
      parts.push({ inlineData: { mimeType: imageBase64.mimeType, data: imageBase64.data } });
    }

    const result = await generateWithRetry(model, [{ role: 'user', parts: parts }]);
    let rawText = result.response.text() || '{}';
    let cleanedJsonText = rawText.split('```json').join('').split('```').join('').trim();
    const parsedData = JSON.parse(cleanedJsonText);

    await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=dailyAnalyzeCount&updateMask.fieldPaths=lastAnalyzeDate`, {
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

    if (
      errString.includes("503") || 
      errString.includes("Service Unavailable") || 
      errString.includes("high demand")
    ) {
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