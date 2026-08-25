import { create } from 'zustand';

interface CustomModal {
  isOpen: boolean;
  message: string;
  type: 'alert' | 'confirm';
  onConfirm?: () => void;
}

interface UIState {
  activeTab: 'analyze' | 'decks' | 'quiz';
  readingDisplayMode: 'furigana' | 'yomigana' | 'off';
  hideMeanings: boolean;
  kanaTab: 'hiragana' | 'katakana';
  fontSize: number;
  fontFamily: 'sans' | 'serif';
  speakingText: string | null;
  isPricingModalOpen: boolean;
  selectedPlanForPay: { planName: string; priceAmount: number } | null;
  customModal: CustomModal;
  
  setActiveTab: (tab: 'analyze' | 'decks' | 'quiz') => void;
  setReadingDisplayMode: (mode: 'furigana' | 'yomigana' | 'off') => void;
  setHideMeanings: (hide: boolean) => void;
  setKanaTab: (tab: 'hiragana' | 'katakana') => void;
  setFontSize: (size: number | ((prev: number) => number)) => void;
  setFontFamily: (font: 'sans' | 'serif') => void;
  setSpeakingText: (text: string | null) => void;
  setIsPricingModalOpen: (open: boolean) => void;
  setSelectedPlanForPay: (plan: { planName: string; priceAmount: number } | null) => void;
  showAlert: (message: string) => void;
  showConfirm: (message: string, onConfirm: () => void) => void;
  closeCustomModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'analyze',
  readingDisplayMode: 'furigana',
  hideMeanings: false,
  kanaTab: 'hiragana',
  fontSize: 18,
  fontFamily: 'serif',
  speakingText: null,
  isPricingModalOpen: false,
  selectedPlanForPay: null,
  customModal: { isOpen: false, message: '', type: 'alert' },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setReadingDisplayMode: (mode) => set({ readingDisplayMode: mode }),
  setHideMeanings: (hide) => set({ hideMeanings: hide }),
  setKanaTab: (tab) => set({ kanaTab: tab }),
  setFontSize: (size) =>
    set((state) => ({
      fontSize: typeof size === 'function' ? size(state.fontSize) : size,
    })),
  setFontFamily: (font) => set({ fontFamily: font }),
  setSpeakingText: (text) => set({ speakingText: text }),
  setIsPricingModalOpen: (open) => set({ isPricingModalOpen: open }),
  setSelectedPlanForPay: (plan) => set({ selectedPlanForPay: plan }),
  showAlert: (message) =>
    set({ customModal: { isOpen: true, message, type: 'alert' } }),
  showConfirm: (message, onConfirm) =>
    set({ customModal: { isOpen: true, message, type: 'confirm', onConfirm } }),
  closeCustomModal: () =>
    set((state) => ({ customModal: { ...state.customModal, isOpen: false } })),
}));