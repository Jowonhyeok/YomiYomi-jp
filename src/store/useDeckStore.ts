import { create } from 'zustand';
import type { Deck, WordInfo } from '../types';

interface QuizState {
  currentCardIndex: number;
  quizCards: WordInfo[];
  options: string[];
  score: number;
  isFinished: boolean;
  selectedAnswer: string | null;
}

interface DeckState {
  decks: Deck[];
  selectedDeckId: string;
  searchKeyword: string;
  quizSelectedDeckIds: string[];
  quizState: QuizState | null;
  setDecks: (decks: Deck[]) => void;
  setSelectedDeckId: (id: string) => void;
  setSearchKeyword: (keyword: string) => void;
  setQuizSelectedDeckIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  setQuizState: (quiz: QuizState | null | ((prev: QuizState | null) => QuizState | null)) => void;
}

export const useDeckStore = create<DeckState>((set) => ({
  decks: [{ id: 'default', name: 'Default Deck', cards: [], createdAt: new Date().toISOString() }],
  selectedDeckId: 'default',
  searchKeyword: '',
  quizSelectedDeckIds: [],
  quizState: null,
  setDecks: (decks) => set({ decks }),
  setSelectedDeckId: (id) => set({ selectedDeckId: id }),
  setSearchKeyword: (keyword) => set({ searchKeyword: keyword }),
  setQuizSelectedDeckIds: (ids) =>
    set((state) => ({
      quizSelectedDeckIds: typeof ids === 'function' ? ids(state.quizSelectedDeckIds) : ids,
    })),
  setQuizState: (quiz) =>
    set((state) => ({
      quizState: typeof quiz === 'function' ? quiz(state.quizState) : quiz,
    })),
}));