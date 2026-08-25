import React, { useState } from 'react';

interface CardCarouselProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  title: string;
  icon: string;
}

export function CardCarousel<T>({ items, renderItem, title, icon }: CardCarouselProps<T>) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!items || items.length === 0) return null;

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  };

  const getDotIndices = () => {
    const total = items.length;
    if (total <= 5) return Array.from({ length: total }, (_, i) => i);
    
    let start = Math.max(0, currentIndex - 2);
    let end = start + 5;
    if (end > total) {
      end = total;
      start = Math.max(0, end - 5);
    }
    return Array.from({ length: end - start }, (_, i) => start + i);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-xs font-bold text-slate-500 flex items-center gap-1">
          <span>{icon}</span> {title} ({currentIndex + 1}/{items.length})
        </h3>
      </div>

      <div className="relative bg-slate-50 border border-slate-200 rounded-2xl p-4 min-h-[140px] flex items-center justify-between shadow-xs">
        <button
          onClick={handlePrev}
          className="z-10 p-2 rounded-full bg-white border border-slate-200 text-slate-600 hover:text-rose-600 hover:border-rose-300 transition shadow-xs text-sm cursor-pointer"
        >
          ◀
        </button>

        <div className="w-full mx-3 flex justify-center">
          {renderItem(items[currentIndex], currentIndex)}
        </div>

        <button
          onClick={handleNext}
          className="z-10 p-2 rounded-full bg-white border border-slate-200 text-slate-600 hover:text-rose-600 hover:border-rose-300 transition shadow-xs text-sm cursor-pointer"
        >
          ▶
        </button>
      </div>

      <div className="flex justify-center items-center space-x-1.5 pt-1">
        {getDotIndices().map((idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`transition-all duration-200 rounded-full cursor-pointer ${
              idx === currentIndex
                ? 'w-6 h-2 bg-rose-500'
                : 'w-2 h-2 bg-slate-300 hover:bg-slate-400'
            }`}
          />
        ))}
      </div>
    </div>
  );
}