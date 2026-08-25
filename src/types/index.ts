export type Lang = 'en' | 'ko' | 'zh-CN' | 'zh-TW' | 'ja';

export interface KanjiInfo {
  kanji: string;
  readings: string;
  meaning: string;
}

export interface WordInfo {
  id?: string;
  word: string;
  reading: string;
  partOfSpeech: string;
  meaning: string;
  jlpt?: string;
}

export interface GrammarInfo {
  grammar: string;
  explanation: string;
}

// 💥 에러의 원인이었던 translatedText가 추가되었습니다!
export interface AnalysisResult {
  isJapanese: boolean;
  translatedText?: string; 
  rubySentences?: string[];
  kanjiList?: KanjiInfo[];
  wordList?: WordInfo[];
  grammarList?: GrammarInfo[];
}

export interface Deck {
  id: string;
  name: string;
  cards: WordInfo[];
  createdAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  isSubscribed: boolean;
  subscriptionPlan?: string;
  subscriptionEndDate?: string;
  cancelAtPeriodEnd?: boolean;
  lastPaymentId?: string;
  lastPaymentDate?: string;
  dailyAnalyzeCount: number;
  lastAnalyzeDate: string;
  lang: Lang;
  decks?: Deck[];
}