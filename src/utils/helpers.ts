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
  const rawPos = pos.trim().toLowerCase();

  // 품사 표준 매핑 사전
  const posDict: Record<string, Record<Lang, string>> = {
    noun: { ko: '명사', en: 'Noun', 'zh-CN': '名词', 'zh-TW': '名詞', ja: '名詞' },
    pronoun: { ko: '대명사', en: 'Pronoun', 'zh-CN': '代词', 'zh-TW': '代詞', ja: '代名詞' },
    verb: { ko: '동사', en: 'Verb', 'zh-CN': '动词', 'zh-TW': '動詞', ja: '動詞' },
    adjective: { ko: '형용사', en: 'Adjective', 'zh-CN': '形容词', 'zh-TW': '形容詞', ja: '形容詞' },
    adverb: { ko: '부사', en: 'Adverb', 'zh-CN': '副词', 'zh-TW': '副詞', ja: '副詞' },
    particle: { ko: '조사', en: 'Particle', 'zh-CN': '助词', 'zh-TW': '助詞', ja: '助詞' },
    conjunction: { ko: '접속사', en: 'Conjunction', 'zh-CN': '连词', 'zh-TW': '連詞', ja: '接続詞' },
    auxiliary: { ko: '조동사', en: 'Auxiliary Verb', 'zh-CN': '助动词', 'zh-TW': '助動詞', ja: '助動詞' },
    interjection: { ko: '감탄사', en: 'Interjection', 'zh-CN': '感叹词', 'zh-TW': '感嘆詞', ja: '感動詞' },
    adnominal: { ko: '연체사', en: 'Adnominal', 'zh-CN': '连体词', 'zh-TW': '連體詞', ja: '連体詞' },
    expression: { ko: '표현/구문', en: 'Expression', 'zh-CN': '短语/表达', 'zh-TW': '短語/表達', ja: '表現/句' },
    prefix: { ko: '접두사', en: 'Prefix', 'zh-CN': '前缀', 'zh-TW': '前綴', ja: '接頭辞' },
    suffix: { ko: '접미사', en: 'Suffix', 'zh-CN': '后缀', 'zh-TW': '後綴', ja: '接尾辞' },
    kanji: { ko: '한자', en: 'Kanji', 'zh-CN': '汉字', 'zh-TW': '漢字', ja: '漢字' },
    grammar: { ko: '문법', en: 'Grammar', 'zh-CN': '语法', 'zh-TW': '文法', ja: '文法' },
    other: { ko: '기타', en: 'Other', 'zh-CN': 'Other', 'zh-TW': '其他', ja: 'その他' }
  };

  let matchedKey = 'other';

  if (rawPos.includes('noun') || rawPos.includes('명사') || rawPos.includes('名詞') || rawPos.includes('名词')) {
    matchedKey = 'noun';
  } else if (rawPos.includes('pronoun') || rawPos.includes('대명사') || rawPos.includes('代词') || rawPos.includes('代詞') || rawPos.includes('代名詞')) {
    matchedKey = 'pronoun';
  } else if (rawPos.includes('verb') || rawPos.includes('동사') || rawPos.includes('動詞') || rawPos.includes('动词')) {
    matchedKey = 'verb';
  } else if (rawPos.includes('adj') || rawPos.includes('형용사') || rawPos.includes('形容')) {
    matchedKey = 'adjective';
  } else if (rawPos.includes('adv') || rawPos.includes('부사') || rawPos.includes('副')) {
    matchedKey = 'adverb';
  } else if (rawPos.includes('particle') || rawPos.includes('조사') || rawPos.includes('助詞') || rawPos.includes('助词')) {
    matchedKey = 'particle';
  } else if (rawPos.includes('conj') || rawPos.includes('접속사') || rawPos.includes('接続') || rawPos.includes('连词') || rawPos.includes('連詞')) {
    matchedKey = 'conjunction';
  } else if (rawPos.includes('auxiliary') || rawPos.includes('조동사') || rawPos.includes('助動') || rawPos.includes('助动')) {
    matchedKey = 'auxiliary';
  } else if (rawPos.includes('interjection') || rawPos.includes('감탄사') || rawPos.includes('pov') || rawPos.includes('感叹') || rawPos.includes('感嘆') || rawPos.includes('感動')) {
    matchedKey = 'interjection';
  } else if (rawPos.includes('adnominal') || rawPos.includes('연체사') || rawPos.includes('連体') || rawPos.includes('连体') || rawPos.includes('連體')) {
    matchedKey = 'adnominal';
  } else if (rawPos.includes('expression') || rawPos.includes('구문') || rawPos.includes('표현') || rawPos.includes('句') || rawPos.includes('表达') || rawPos.includes('表達') || rawPos.includes('短语') || rawPos.includes('短語')) {
    matchedKey = 'expression';
  } else if (rawPos.includes('prefix') || rawPos.includes('접두사') || rawPos.includes('接頭') || rawPos.includes('前缀') || rawPos.includes('前綴')) {
    matchedKey = 'prefix';
  } else if (rawPos.includes('suffix') || rawPos.includes('접미사') || rawPos.includes('接尾') || rawPos.includes('后缀') || rawPos.includes('後綴')) {
    matchedKey = 'suffix';
  } else if (rawPos.includes('kanji') || rawPos.includes('한자') || rawPos.includes('漢字') || rawPos.includes('汉字')) {
    matchedKey = 'kanji';
  } else if (rawPos.includes('grammar') || rawPos.includes('문법') || rawPos.includes('文法') || rawPos.includes('语法')) {
    matchedKey = 'grammar';
  }

  return posDict[matchedKey]?.[lang] || posDict[matchedKey]?.['en'] || pos;
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

export async function analyzeJapanese(
  text: string, 
  targetLang: Lang, 
  imageBase64?: { mimeType: string; data: string },
  deviceId?: string | null
): Promise<AnalysisResult> {
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
      imageBase64,
      deviceId
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (response.status === 429) {
      if (errData.error === 'DAILY_LIMIT_EXCEEDED') throw new Error("DAILY_LIMIT_EXCEEDED");
      if (errData.error === 'DEVICE_LIMIT_EXCEEDED') throw new Error("DEVICE_LIMIT_EXCEEDED");
      throw new Error(errData.message || "RATE_LIMIT_EXCEEDED");
    }
    if (response.status === 401) throw new Error("UNAUTHORIZED");
    
    if (response.status === 503) {
      throw new Error(errData.message || "503 Service Unavailable");
    }

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