import { create } from 'zustand';
import type { UserProfile, Lang } from '../types';

interface UserState {
  currentUser: UserProfile | null;
  streakDays: number;
  lang: Lang;
  setCurrentUser: (user: UserProfile | null | ((prev: UserProfile | null) => UserProfile | null)) => void;
  setStreakDays: (days: number) => void;
  setLang: (lang: Lang) => void;
}

export const useUserStore = create<UserState>((set) => ({
  currentUser: null,
  streakDays: 1,
  lang: 'en',
  setCurrentUser: (user) =>
    set((state) => ({
      currentUser: typeof user === 'function' ? user(state.currentUser) : user,
    })),
  setStreakDays: (days) => set({ streakDays: days }),
  setLang: (lang) => set({ lang }),
}));