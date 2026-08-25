import React, { useState, useEffect } from 'react';
import type { LegalDocument, LegalDocType } from '../constants/legal';
import { getLegalDocument } from '../constants/legal';
import type { Lang } from '../types';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: LegalDocument | null;
  docType?: LegalDocType | null;
  currentLang?: Lang;
}

export const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose, document, docType, currentLang = 'en' }) => {
  const [modalLang, setModalLang] = useState<Lang>(currentLang === 'ko' ? 'ko' : 'en');

  useEffect(() => {
    setModalLang(currentLang === 'ko' ? 'ko' : 'en');
  }, [currentLang, isOpen]);

  if (!isOpen || !document) return null;

  // 선택된 언어에 맞춰 약관 데이터 동적 조회
  const activeDoc = docType ? getLegalDocument(docType, modalLang) : document;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex justify-center items-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-rose-100 relative space-y-4 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer transition"
        >
          ✕
        </button>

        {/* 헤더 & 언어 선택 탭 */}
        <div className="border-b border-slate-100 pb-3 pr-6 flex flex-wrap justify-between items-end gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900">{activeDoc.title}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Last Updated: {activeDoc.updatedAt}</p>
          </div>

          {/* 한/영 언어 선택 토글 탭 */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setModalLang('ko')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                modalLang === 'ko' ? 'bg-white text-rose-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              한국어
            </button>
            <button
              type="button"
              onClick={() => setModalLang('en')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                modalLang === 'en' ? 'bg-white text-rose-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              English
            </button>
          </div>
        </div>

        {/* 약관 본문 영역 */}
        <div className="overflow-y-auto pr-2 space-y-4 text-xs text-slate-600 leading-relaxed custom-scrollbar flex-1">
          {activeDoc.sections.map((section, idx) => (
            <div key={idx} className="space-y-1 bg-slate-50/50 p-3.5 rounded-xl border border-slate-100">
              <h3 className="font-bold text-slate-800 text-xs sm:text-sm">{section.title}</h3>
              <p className="whitespace-pre-wrap text-slate-600 font-normal">{section.content}</p>
            </div>
          ))}
        </div>

        {/* 푸터 확인 버튼 */}
        <div className="pt-2 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer"
          >
            {modalLang === 'ko' ? '확인 및 닫기' : 'Confirm & Close'}
          </button>
        </div>
      </div>
    </div>
  );
};