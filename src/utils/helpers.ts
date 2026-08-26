import type { Lang, MultilingualText, Deck, RubyToken, AnalysisResult } from '../types';
import { auth } from '../firebase';

// 실시간 환율 캐시 (1시간 단위 갱신)
let cachedRate: number | null = null;
let lastFetchTime = 0;

export async function getUsdToKrwRate(): Promise<number> {
  const now = Date.now();
  if (cachedRate !== null && now - lastFetchTime < 3600000) {
    return cachedRate;
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    if (data && data.rates && typeof data.rates.KRW === 'number') {
      const rate = data.rates.KRW as number;
      cachedRate = rate;
      lastFetchTime = now;
      return rate;
    }
    return 1350; // API 실패 시 기본 환율
  } catch (err) {
    return 1350;
  }
}

export async function convertUsdToKrw(usdAmount: number): Promise<number> {
  const rate = await getUsdToKrwRate();
  const rawKrw = usdAmount * rate;
  return Math.ceil(rawKrw / 100) * 100; // 100원 단위 올림 정돈
}

export function getLocalizedPOS(pos: string, lang: Lang): string {
  if (!pos || typeof pos !== 'string') return '';
  const rawPos = pos.trim();

  const posDict: Record<string, Record<Lang, string>> = {
    '명사': { ko: '명사', en: 'Noun', 'zh-CN': '名词', 'zh-TW': '名詞', ja: '名詞' },
    '대명사': { ko: '대명사', en: 'Pronoun', 'zh-CN': '代词', 'zh-TW': '代詞', ja: '代名詞' },
    '동사': { ko: '동사', en: 'Verb', 'zh-CN': '动词', 'zh-TW': '動詞', ja: '動詞' },
    '형용사': { ko: '형용사', en: 'Adjective', 'zh-CN': '形容词', 'zh-TW': '形容詞', ja: '形容詞' },
    '부사': { ko: '부사', en: 'Adverb', 'zh-CN': '副词', 'zh-TW': '副詞', ja: '副詞' },
    '한자': { ko: '한자', en: 'Kanji', 'zh-CN': '汉字', 'zh-TW': '漢字', ja: '漢字' },
    '문법': { ko: '문법', en: 'Grammar', 'zh-CN': '语法', 'zh-TW': '文法', ja: '文法' },
    '감탄사': { ko: '감탄사', en: 'Interjection', 'zh-CN': '感叹词', 'zh-TW': '感嘆詞', ja: '感動詞' },
    'POV': { ko: '감탄사', en: 'Interjection', 'zh-CN': '感叹词', 'zh-TW': '感嘆詞', ja: '感動詞' },
    '조사': { ko: '조사', en: 'Particle', 'zh-CN': '助词', 'zh-TW': '助詞', ja: '助詞' },
    '접속사': { ko: '접속사', en: 'Conjunction', 'zh-CN': '连词', 'zh-TW': '連接詞', ja: '接続詞' },
    '연체사': { ko: '연체사', en: 'Adnominal', 'zh-CN': '连体词', 'zh-TW': '連體詞', ja: '連体詞' },
    '기타': { ko: '기타', en: 'Other', 'zh-CN': '其他', 'zh-TW': 'other', ja: 'その他' }
  };

  const tokens = rawPos.split(/([\/,\s]+)/);
  const localizedTokens = tokens.map(token => {
    const trimmed = token.trim();
    if (!trimmed) return token;
    
    for (const key in posDict) {
      const item = posDict[key];
      if (
        key === trimmed || 
        item.ko === trimmed || 
        item.en.toLowerCase() === trimmed.toLowerCase() || 
        item['zh-CN'] === trimmed || 
        item['zh-TW'] === trimmed || 
        item.ja === trimmed
      ) {
        return item[lang] || item['en'];
      }
    }
    return trimmed;
  });

  return localizedTokens.join('');
}

export function getLocalizedText(val: MultilingualText | undefined, lang: Lang): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  return val[lang] || val['en'] || val['zh-CN'] || val['zh-TW'] || val['ko'] || Object.values(val)[0] || '';
}

export function calculateDaysLeft(endDateStr?: string): number {
  if (!endDateStr) return 0;
  const endDate = new Date(endDateStr);
  const now = new Date();
  const diffTime = endDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

export const sanitizeDecks = (deckList: any[]): Deck[] => {
  return (deckList || []).map((d: any, dIdx: number) => ({
    id: String(d.id || `deck_${Date.now()}_${dIdx}`),
    name: String(d.name || '암기장'),
    createdAt: d.createdAt || new Date().toISOString(),
    cards: (d.cards || []).map((c: any, cIdx: number) => ({
      id: String(c.id || `card_${Date.now()}_${cIdx}_${Math.random().toString(36).substr(2, 4)}`),
      word: String(c.word || '').trim(),
      reading: String(c.reading || '').trim(),
      partOfSpeech: String(c.partOfSpeech || '단어').trim(),
      meaning: c.meaning || '',
      jlpt: String(c.jlpt || '').trim()
    }))
  }));
};

export function parseRubySentence(sentenceStr: string): RubyToken[] {
  if (!sentenceStr || typeof sentenceStr !== 'string') {
    return [{ text: String(sentenceStr || '') }];
  }

  const cleanStr = sentenceStr.replace(/<rp>.*?<\/rp>/gi, '');
  const tokens: RubyToken[] = [];
  const rubyRegex = /<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/gi;
  
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = rubyRegex.exec(cleanStr)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: cleanStr.slice(lastIndex, match.index) });
    }
    tokens.push({
      text: match[1].replace(/<[^>]+>/g, ''),
      reading: match[2].replace(/<[^>]+>/g, '')
    });
    lastIndex = rubyRegex.lastIndex;
  }

  if (lastIndex < cleanStr.length) {
    tokens.push({ text: cleanStr.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ text: sentenceStr }];
}

export async function fetchWithRetry(url: string, options: RequestInit, retries = 2, backoff = 3000): Promise<Response> {
  try {
    const response = await fetch(url, options);

    if (response.status === 401 || response.status === 429 || response.status === 400) {
      return response;
    }

    if ((response.status === 503 || response.status === 500) && retries > 0) {
      const jitter = Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, backoff + jitter));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    return response;
  } catch (err) {
    if (retries > 0) {
      const jitter = Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, backoff + jitter));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw err;
  }
}

export async function analyzeJapanese(text: string, targetLang: Lang, imageBase64?: { mimeType: string; data: string }): Promise<AnalysisResult> {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    throw new Error("LOGIN_REQUIRED");
  }

  const idToken = await firebaseUser.getIdToken();

  if (!imageBase64) {
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
    if (!hasJapanese) {
      throw new Error("JAPANESE_ONLY");
    }
  }

  const response = await fetchWithRetry('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      text,
      targetLang,
      imageBase64
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (response.status === 429) {
      if (errData.error === 'DAILY_LIMIT_EXCEEDED') throw new Error("DAILY_LIMIT_EXCEEDED");
      throw new Error(errData.message || "RATE_LIMIT_EXCEEDED");
    }
    if (response.status === 401) throw new Error("UNAUTHORIZED");
    throw new Error(errData.message || `API_HTTP_ERROR_${response.status}`);
  }

  const data = await response.json();
  
  return {
    isJapanese: Boolean(data.isJapanese),
    translatedText: data.translatedText || '',
    rubySentences: Array.isArray(data.rubySentences) ? data.rubySentences : [],
    kanjiList: Array.isArray(data.kanjiList) ? data.kanjiList : [],
    wordList: Array.isArray(data.wordList) ? data.wordList : [],
    grammarList: Array.isArray(data.grammarList) ? data.grammarList : []
  };
}