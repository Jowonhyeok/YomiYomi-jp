export type Lang = 'en' | 'ko' | 'zh-CN' | 'zh-TW' | 'ja';

// 💥 helpers.ts에서 사용하는 다국어 텍스트 타입
export type MultilingualText = Record<string, string> | string;

// 💥 helpers.ts에서 사용하는 요미가나 파싱 토큰 타입
export interface RubyToken {
  text: string;
  reading?: string;
}

export interface KanjiInfo {
  kanji: string;
  readings: string;
  meaning: MultilingualText;
}

export interface WordInfo {
  id?: string;
  word: string;
  reading: string;
  partOfSpeech: string;
  meaning: MultilingualText;
  jlpt?: string;
}

export interface GrammarInfo {
  grammar: string;
  explanation: MultilingualText;
}

// 🌸 resultLang 필드를 추가하여 분석 당시 언어를 고정 저장하도록 보완
export interface AnalysisResult {
  isJapanese: boolean;
  translatedText?: string; 
  rubySentences?: string[];
  kanjiList?: KanjiInfo[];
  wordList?: WordInfo[];
  grammarList?: GrammarInfo[];
  resultLang?: Lang; // 🌸 추가: 앱 언어를 변경해도 분석 카드의 언어가 변하지 않도록 기록
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