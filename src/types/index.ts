//데이터 타입 및 인터페이스
export type Lang = 'ko' | 'en' | 'zh-CN' | 'zh-TW' | 'ja';
export type MultilingualText = string | Record<Lang, string>;

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
  jlpt: string;
}

export interface GrammarInfo {
  grammar: string;
  explanation: MultilingualText;
}

export interface RubyToken {
  text: string;
  reading?: string;
}

export interface AnalysisResult {
  isJapanese: boolean;
  rubySentences: string[];
  kanjiList: KanjiInfo[];
  wordList: WordInfo[];
  grammarList: GrammarInfo[];
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
  name: string;
  isSubscribed?: boolean;
  subscriptionPlan?: string;
  subscriptionEndDate?: string;
  cancelAtPeriodEnd?: boolean;
  lastStudyDate?: string;
  streakDays?: number;
  lastAnalyzeDate?: string;
  dailyAnalyzeCount?: number;
  lang?: Lang;
}