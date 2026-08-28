import { auth } from '../firebase';
import type { Lang, Deck, AnalysisResult } from '../types';

export async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  return fetch(url, options);
}

export async function analyzeJapanese(
  text: string, 
  lang: Lang, 
  image?: { mimeType: string; data: string } | null, 
  deviceId?: string | null
): Promise<AnalysisResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("UNAUTHORIZED");
  }

  const idToken = await currentUser.getIdToken();

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      text,
      targetLang: lang,
      imageBase64: image || null,
      deviceId: deviceId || null
    })
  });

  const resText = await response.text();
  let resData: any = {};

  try {
    resData = JSON.parse(resText);
  } catch (e) {
    console.error("Non-JSON Response Received:", resText);
    throw new Error(`SERVER_RESPONSE_ERROR (${response.status}): ${resText.slice(0, 100)}`);
  }

  if (!response.ok || resData.error) {
    throw new Error(resData.message || resData.error || "ANALYSIS_FAILED");
  }

  return {
    ...resData,
    resultLang: lang
  } as AnalysisResult;
}

export function getLocalizedPOS(pos: string, lang: Lang): string {
  if (!pos) return pos;
  const p = pos.toLowerCase();

  const posMap: Record<string, Record<Lang, string>> = {
    noun: { ko: '명사', en: 'Noun', 'zh-CN': '名词', 'zh-TW': '名詞', ja: '名詞' },
    verb: { ko: '동사', en: 'Verb', 'zh-CN': '动词', 'zh-TW': '動詞', ja: '動詞' },
    adjective: { ko: '형용사', en: 'Adjective', 'zh-CN': '形容词', 'zh-TW': '形容詞', ja: '形容詞' },
    adverb: { ko: '부사', en: 'Adverb', 'zh-CN': '副词', 'zh-TW': '副詞', ja: '副詞' },
    particle: { ko: '조사', en: 'Particle', 'zh-CN': '助词', 'zh-TW': '助詞', ja: '助詞' },
    conjunction: { ko: '접속사', en: 'Conjunction', 'zh-CN': '连词', 'zh-TW': '連接詞', ja: '接続詞' },
    'auxiliary verb': { ko: '조동사', en: 'Auxiliary Verb', 'zh-CN': '助动词', 'zh-TW': '助動詞', ja: '助動詞' },
    expression: { ko: '표현/관용구', en: 'Expression', 'zh-CN': '表达/短语', 'zh-TW': '表達/短語', ja: '表現' },
    prefix: { ko: '접두사', en: 'Prefix', 'zh-CN': '前缀', 'zh-TW': '前綴', ja: '接頭辞' },
    suffix: { ko: '접미사', en: 'Suffix', 'zh-CN': '后缀', 'zh-TW': '後綴', ja: '接尾辞' },
    '한자': { ko: '한자', en: 'Kanji', 'zh-CN': '汉字', 'zh-TW': '漢字', ja: '漢字' },
    '문법': { ko: '문법', en: 'Grammar', 'zh-CN': '语法', 'zh-TW': '文法', ja: '文法' }
  };

  return posMap[p]?.[lang] || pos;
}

export function getLocalizedText(val: any, lang: Lang): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val[lang] || val['en'] || val['ko'] || Object.values(val)[0] || '';
  }
  return String(val);
}

export function calculateDaysLeft(endDateStr?: string): number {
  if (!endDateStr) return 0;
  const end = new Date(endDateStr).getTime();
  const now = new Date().getTime();
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

export function sanitizeDecks(decks: any[]): Deck[] {
  if (!Array.isArray(decks)) return [];
  return decks.map(d => ({
    id: String(d.id || Date.now()),
    name: String(d.name || 'Untitled Deck'),
    cards: Array.isArray(d.cards) ? d.cards : [],
    createdAt: d.createdAt || new Date().toISOString()
  }));
}

export function parseRubySentence(htmlStr: string): Array<{ text: string; reading?: string }> {
  if (!htmlStr) return [];
  
  const results: Array<{ text: string; reading?: string }> = [];
  const regex = /<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>|([^<]+)/g;
  let match;

  while ((match = regex.exec(htmlStr)) !== null) {
    if (match[1] && match[2]) {
      results.push({ text: match[1], reading: match[2] });
    } else if (match[3]) {
      results.push({ text: match[3] });
    }
  }

  return results;
}