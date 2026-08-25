import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ----------------------------------------------------------------
// [Firebase Admin SDK 안전 초기화]
// ----------------------------------------------------------------
if (!getApps().length) {
  let serviceAccount = null;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      let rawKey = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      
      // 양끝 따옴표가 포함되어 들어온 경우 제거
      if ((rawKey.startsWith('"') && rawKey.endsWith('"')) || (rawKey.startsWith("'") && rawKey.endsWith("'"))) {
        rawKey = rawKey.slice(1, -1);
      }
      
      // Vercel 환경변수의 이스케이프 개행문자(\n) 복원 후 JSON 파싱
      serviceAccount = JSON.parse(rawKey.replace(/\\n/g, '\n'));
    } catch (e) {
      console.error('[Firebase Key Parse Error]:', e.message);
    }
  }

  if (serviceAccount && serviceAccount.project_id) {
    initializeApp({ credential: cert(serviceAccount) });
  } else {
    // 환경변수 파싱 실패 시 기본 Project ID로 연결
    initializeApp({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'yomiyomi-jp'
    });
  }
}

const db = getFirestore();
const auth = getAuth();

// ----------------------------------------------------------------
// [Vercel Serverless Handler]
// ----------------------------------------------------------------
export default async function handler(req, res) {
  // HTTP Method 검증
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'POST 요청만 허용됩니다.' });
  }

  // Authorization 토큰 검증
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });
  }

  let uid;
  try {
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (err) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: '유효하지 않은 인증 토큰입니다.' });
  }

  try {
    const userDocRef = db.collection('users').doc(uid);
    const userDoc = await userDocRef.get();
    const userData = userDoc.data() || {};

    let isSubscribed = userData.isSubscribed || false;
    if (userData.subscriptionEndDate && new Date(userData.subscriptionEndDate) < new Date()) {
      isSubscribed = false;
    }

    const { text, targetLang = 'en', imageBase64 } = req.body || {};
    const MAX_INPUT_TEXT = 2500;

    if (text && text.length > MAX_INPUT_TEXT) {
      return res.status(400).json({ error: 'TEXT_TOO_LONG', message: '텍스트 길이가 제한을 초과했습니다.' });
    }

    const today = new Date().toISOString().split('T')[0];
    let dailyCount = userData.lastAnalyzeDate === today ? (userData.dailyAnalyzeCount || 0) : 0;

    // 일일 한도 검증 (무료 3회 / 프리미엄 FUP 300회)
    if (!isSubscribed && dailyCount >= 3) {
      return res.status(429).json({ error: 'DAILY_LIMIT_EXCEEDED', message: '오늘의 무료 분석 횟수(3회)를 모두 사용하셨습니다.' });
    } else if (isSubscribed && dailyCount >= 300) {
      return res.status(429).json({ error: 'FUP_LIMIT_EXCEEDED', message: '일일 최대 분석 제공량을 초과했습니다. 내일 다시 이용해 주세요.' });
    }

    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    });

    let langGuide = "English";
    if (targetLang === "zh-CN") langGuide = "Simplified Chinese (简体中文)";
    else if (targetLang === "zh-TW") langGuide = "Traditional Chinese (繁體中文)";
    else if (targetLang === "ko") langGuide = "Korean (한국어)";
    else if (targetLang === "ja") langGuide = "Japanese (日本語)";

    let promptText = 'You are a professional Japanese language tutor. Analyze the following Japanese input and respond strictly in valid JSON format.\n';
    promptText += 'CRITICAL LANGUAGE REQUIREMENT: All "meaning" and "explanation" values inside the JSON MUST contain translations for the target language: "' + targetLang + '" (' + langGuide + '). Ensure "zh-CN" and "zh-TW" are both accurately populated with Simplified and Traditional Chinese respectively.\n\n';

    if (text) promptText += '[Input Text]: "' + text + '"\n';
    if (imageBase64) promptText += '[Instruction]: Extract and analyze the Japanese text from the attached image.\n';

    promptText += '\n[Required JSON Schema Example]:\n{\n' +
      '  "isJapanese": true,\n' +
      '  "rubySentences": ["<ruby>私<rt>わたし</rt></ruby>は<ruby>学生<rt>がくせい</rt></ruby>です。"],\n' +
      '  "kanjiList": [{"kanji": "私", "readings": "わたし", "meaning": {"ko": "나", "en": "I, me", "zh-CN": "我", "zh-TW": "我", "ja": "わたし"}}],\n' +
      '  "wordList": [{"word": "学生", "reading": "がくせい", "partOfSpeech": "명사", "meaning": {"ko": "학생", "en": "student", "zh-CN": "학생", "zh-TW": "學生", "ja": "がくせい"}, "jlpt": "N5"}],\n' +
      '  "grammarList": [{"grammar": "です", "explanation": {"ko": "~입니다", "en": "is/am/are", "zh-CN": "是", "zh-TW": "是", "ja": "〜です"}}]\n' +
      '}';

    const parts = [{ text: promptText }];
    if (imageBase64) {
      parts.push({ inlineData: { mimeType: imageBase64.mimeType, data: imageBase64.data } });
    }

    const result = await model.generateContent({ contents: [{ role: 'user', parts: parts }] });
    let rawText = result.response.text() || '{}';
    let cleanedJsonText = rawText.split('```json').join('').split('```').join('').trim();
    const parsedData = JSON.parse(cleanedJsonText);

    // 사용량 기록
    await userDocRef.set({ dailyAnalyzeCount: dailyCount + 1, lastAnalyzeDate: today }, { merge: true });

    return res.status(200).json(parsedData);

  } catch (err) {
    console.error('[Analyze Error Detail]:', err.message || err);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message || '서버 오류가 발생했습니다.' });
  }
}