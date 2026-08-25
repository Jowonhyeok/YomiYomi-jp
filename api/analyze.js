import express from 'express';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const serviceAccountPath = path.resolve(__dirname, 'serviceAccountKey.json');

// ----------------------------------------------------------------
// [Vercel & 로컬 겸용] Firebase Admin SDK 안전한 초기화
// ----------------------------------------------------------------
if (!getApps().length) {
  let serviceAccount = null;

  // 1. Vercel 환경변수(FIREBASE_SERVICE_ACCOUNT)에 전체 JSON 문자열이 있는 경우
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      // Vercel 개행문자(\n) 처리 포함 안전한 파싱
      const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      serviceAccount = JSON.parse(rawEnv.replace(/\\n/g, '\n'));
    } catch (e) {
      console.error('FIREBASE_SERVICE_ACCOUNT JSON 파싱 에러:', e.message);
    }
  } 
  // 2. 로컬 개발 환경에 serviceAccountKey.json 파일이 존재하는 경우
  else if (fs.existsSync(serviceAccountPath)) {
    try {
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    } catch (e) {
      console.error('로컬 serviceAccountKey.json 읽기 에러:', e.message);
    }
  }

  if (serviceAccount) {
    initializeApp({
      credential: cert(serviceAccount)
    });
  } else {
    // GCP/Firebase 클라우드 기본 인증 활용 (Fallback)
    initializeApp({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID
    });
  }
}

const db = getFirestore();
const auth = getAuth();

let redis = null;
try {
  if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: function () { return null; }
    });
    redis.on('error', function () {});
  }
} catch (e) {
  redis = null;
}

const app = express();
app.use(express.json({ limit: '10mb' }));

const MAX_INPUT_TEXT = 2500;
const MAX_IMAGE_BYTES = 4194304;

const memoryStore = new Map();
const memoryLocks = new Map();

async function checkLimits(userId, isPremium) {
  if (!redis || redis.status !== 'ready') {
    const now = Date.now();
    const userLog = memoryStore.get(userId) || [];
    const validLog = userLog.filter(function (ts) { return now - ts < 10000; });
    if (validLog.length >= (isPremium ? 10 : 3)) return false;
    validLog.push(now);
    memoryStore.set(userId, validLog);
    return true;
  }

  const RATE_LIMIT_LUA = 
    "local key = KEYS[1]\n" +
    "local capacity = tonumber(ARGV[1])\n" +
    "local refill_rate = tonumber(ARGV[2])\n" +
    "local requested = tonumber(ARGV[3])\n" +
    "local now = tonumber(ARGV[4])\n" +
    "local data = redis.call('HMGET', key, 'tokens', 'last_updated')\n" +
    "local tokens = tonumber(data[1])\n" +
    "local last_updated = tonumber(data[2])\n" +
    "if not tokens then\n" +
    "  tokens = capacity\n" +
    "  last_updated = now\n" +
    "else\n" +
    "  local delta = math.max(0, now - last_updated)\n" +
    "  tokens = math.min(capacity, tokens + delta * refill_rate)\n" +
    "end\n" +
    "if tokens < requested then\n" +
    "  return {0, tokens}\n" +
    "else\n" +
    "  tokens = tokens - requested\n" +
    "  redis.call('HMSET', key, 'tokens', tokens, 'last_updated', now)\n" +
    "  redis.call('EXPIRE', key, 86400)\n" +
    "  return {1, tokens}\n" +
    "end\n";

  const nowSec = Math.floor(Date.now() / 1000);
  const userCap = isPremium ? 10 : 3;
  const userRate = isPremium ? 1.0 : 0.2;
  const res = await redis.eval(RATE_LIMIT_LUA, 1, 'ratelimit:user:' + userId, userCap, userRate, 1, nowSec);
  return res[0] === 1;
}

async function acquireLock(userId, maxConcurrent) {
  if (!maxConcurrent) maxConcurrent = 1;
  if (!redis || redis.status !== 'ready') {
    const count = (memoryLocks.get(userId) || 0) + 1;
    if (count > maxConcurrent) return false;
    memoryLocks.set(userId, count);
    return true;
  }
  const key = 'concurrent:' + userId;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 30);
  if (count > maxConcurrent) {
    await redis.decr(key);
    return false;
  }
  return true;
}

async function releaseLock(userId) {
  if (!redis || redis.status !== 'ready') {
    const count = Math.max(0, (memoryLocks.get(userId) || 1) - 1);
    memoryLocks.set(userId, count);
    return;
  }
  const key = 'concurrent:' + userId;
  const count = await redis.decr(key);
  if (count <= 0) await redis.del(key);
}

// ----------------------------------------------------------------
// AI 일본어 분석 API (Vercel Serverless 엔드포인트)
// ----------------------------------------------------------------
app.post('*', async function (req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });
  }

  let uid;
  try {
    const idToken = authHeader.split('Bearer ')[1];
    uid = (await auth.verifyIdToken(idToken)).uid;
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

    const text = req.body.text;
    const targetLang = req.body.targetLang || 'en';
    const imageBase64 = req.body.imageBase64;

    if (text && text.length > MAX_INPUT_TEXT) {
      return res.status(400).json({ error: 'TEXT_TOO_LONG', message: '텍스트 길이가 제한을 초과했습니다.' });
    }
    if (imageBase64 && Buffer.from(imageBase64.data, 'base64').length > MAX_IMAGE_BYTES) {
      return res.status(400).json({ error: 'IMAGE_TOO_LARGE', message: '이미지 용량이 초과되었습니다.' });
    }

    const today = new Date().toISOString().split('T')[0];
    let dailyCount = userData.lastAnalyzeDate === today ? (userData.dailyAnalyzeCount || 0) : 0;

    // 일일 한도 검증 로직 (무료 회원 3회 / 프리미엄 회원 FUP 300회 제한)
    if (!isSubscribed) {
      if (dailyCount >= 3) {
        return res.status(429).json({ error: 'DAILY_LIMIT_EXCEEDED', message: '오늘의 무료 분석 횟수(3회)를 모두 사용하셨습니다.' });
      }
    } else {
      if (dailyCount >= 300) {
        return res.status(429).json({ error: 'FUP_LIMIT_EXCEEDED', message: '일일 최대 분석 제공량을 초과했습니다. 내일 다시 이용해 주세요.' });
      }
    }

    const isRateAllowed = await checkLimits(uid, isSubscribed);
    if (!isRateAllowed) {
      return res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED', message: '요청이 너무 빈번합니다. 잠시 후 다시 시도해 주세요.' });
    }

    const lockAcquired = await acquireLock(uid, isSubscribed ? 2 : 1);
    if (!lockAcquired) {
      return res.status(429).json({ error: 'CONCURRENT_LIMIT_EXCEEDED', message: '이전 요청이 처리 중입니다.' });
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY || '';
      if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');

      const genAI = new GoogleGenerativeAI(apiKey);
      // 올바른 Gemini 모델명 적용
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

      (async function () {
        try {
          const usage = result.response.usageMetadata || {};
          const promptTokens = usage.promptTokenCount || 0;
          const candidatesTokens = usage.candidatesTokenCount || 0;
          const totalTokens = usage.totalTokenCount || (promptTokens + candidatesTokens);

          await userDocRef.set({ dailyAnalyzeCount: dailyCount + 1, lastAnalyzeDate: today }, { merge: true });

          const usageRef = db.collection('usage_logs').doc(uid + '_' + today);
          await usageRef.set({
            uid: uid,
            date: today,
            calls: FieldValue.increment(1),
            promptTokens: FieldValue.increment(promptTokens),
            candidatesTokens: FieldValue.increment(candidatesTokens),
            totalTokens: FieldValue.increment(totalTokens)
          }, { merge: true });
        } catch (logErr) {
          console.error('[Logging Fail]', logErr.message);
        }
      })();

      return res.json(parsedData);

    } finally {
      await releaseLock(uid);
    }

  } catch (err) {
    console.error('[Server Internal Error Detail]:', err.message || err);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message || '서버 오류가 발생했습니다.' });
  }
});

// Vercel 서버리스 모듈 내보내기 (app.listen 삭제)
export default app;