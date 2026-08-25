import { useState, useEffect } from 'react';
import type { WordInfo, Lang } from '../types';
import { getLocalizedText } from '../utils/helpers';

interface SidebarCarouselProps {
  cards: WordInfo[];
  speakingText: string | null;
  toggleSpeech: (text: string) => void;
  handleDeleteCard: (deckId: string, cardId: string, cardWord?: string) => void;
  selectedDeckId: string;
  lang: Lang;
  t: (key: string) => string;
}

export function SidebarWordCarousel({ 
  cards = [], 
  speakingText, 
  toggleSpeech, 
  handleDeleteCard, 
  selectedDeckId,
  lang,
  t
}: SidebarCarouselProps) {
  const safeCards = cards || [];
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (safeCards.length === 0) {
      setCurrentIndex(0);
    } else if (currentIndex >= safeCards.length) {
      setCurrentIndex(safeCards.length - 1);
    }
  }, [safeCards.length, currentIndex]);

  if (safeCards.length === 0) {
    return (
      <div className="py-8 text-center text-[11px] text-slate-400">
        {t('noSavedWords')}
      </div>
    );
  }

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : safeCards.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < safeCards.length - 1 ? prev + 1 : 0));
  };

  const getDotIndices = () => {
    const total = safeCards.length;
    if (total <= 5) return Array.from({ length: total }, (_, i) => i);
    
    let start = Math.max(0, currentIndex - 2);
    let end = start + 5;
    if (end > total) {
      end = total;
      start = Math.max(0, end - 5);
    }
    return Array.from({ length: end - start }, (_, i) => start + i);
  };

  const validIndex = Math.min(Math.max(0, currentIndex), safeCards.length - 1);
  const currentCard = safeCards[validIndex] || safeCards[0];

  return (
    <div className="flex flex-col space-y-2 py-1">
      <div className="relative bg-[#FAF8F5] border border-amber-200 rounded-xl p-2.5 shadow-2xs flex items-center justify-between min-h-[100px]">
        <button
          onClick={handlePrev}
          className="z-10 p-1 rounded-full bg-white border border-slate-200 text-slate-600 hover:text-rose-600 transition text-xs cursor-pointer"
        >
          ◀
        </button>

        <div className="w-full mx-2 text-center flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-center space-x-1 mb-1">
              <span className="font-bold text-xs text-slate-900 truncate max-w-[90px]">
                {currentCard.word}
              </span>
              <span className="text-[10px] text-rose-600 font-semibold truncate max-w-[70px]">
                [{currentCard.reading}]
              </span>
            </div>
            <p className="text-[10px] text-slate-600 font-medium line-clamp-2">
              {getLocalizedText(currentCard.meaning, lang)}
            </p>
          </div>

          <div className="flex items-center justify-center space-x-2 mt-2 pt-1 border-t border-amber-100">
            <button
              onClick={() => toggleSpeech(currentCard.word)}
              className={`text-[11px] p-1 rounded transition flex items-center justify-center cursor-pointer ${
                speakingText === currentCard.word
                  ? 'text-rose-600 font-bold border border-rose-500 bg-rose-50'
                  : 'text-slate-500 hover:text-amber-600 bg-white border border-slate-200'
              }`}
            >
              <span>{speakingText === currentCard.word ? '⏹️' : '🔊'}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleDeleteCard(selectedDeckId, currentCard.id || '', currentCard.word);
              }}
              className="text-[10px] px-1.5 py-0.5 text-rose-500 hover:bg-rose-50 bg-white border border-rose-200 rounded font-semibold transition cursor-pointer"
            >
              ✕ {t('delete')}
            </button>
          </div>
        </div>

        <button
          onClick={handleNext}
          className="z-10 p-1 rounded-full bg-white border border-slate-200 text-slate-600 hover:text-rose-600 transition text-xs cursor-pointer"
        >
          ▶
        </button>
      </div>

      <div className="flex justify-center items-center space-x-1 pt-1">
        {getDotIndices().map((idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`transition-all duration-200 rounded-full cursor-pointer ${
              idx === validIndex
                ? 'w-4 h-1.5 bg-rose-500'
                : 'w-1.5 h-1.5 bg-slate-300 hover:bg-slate-400'
            }`}
          />
        ))}
      </div>
      <div className="text-center text-[10px] text-slate-400">
        {validIndex + 1} / {safeCards.length}
      </div>
    </div>
  );
}