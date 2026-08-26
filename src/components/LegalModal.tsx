import { useState, useEffect } from 'react';
import type { Lang } from '../types';
import type { LegalDocument, LegalDocType } from '../constants/legal';
import { getLegalDocument } from '../constants/legal';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: LegalDocument | null;
  docType: LegalDocType | null;
  currentLang: Lang;
}

const LEGAL_LANG_OPTIONS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
];

export function LegalModal({ isOpen, onClose, docType }: LegalModalProps) {
  // 모달이 열릴 때 기본 언어를 'en' (영어)로 고정
  const [modalLang, setModalLang] = useState<Lang>('en');

  useEffect(() => {
    if (isOpen) {
      setModalLang('en');
    }
  }, [isOpen]);

  if (!isOpen || !docType) return null;

  // 현재 선택된 모달 언어에 맞춰 약관 데이터 동적 로드
  const currentDoc: any = getLegalDocument(docType, modalLang);

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-xs flex justify-center items-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] p-6 shadow-2xl border border-rose-100 relative flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer transition z-10"
        >
          ✕
        </button>

        {/* 모달 헤더 & 언어 선택 탭 */}
        <div className="border-b border-slate-100 pb-4 mb-4 pr-8 shrink-0">
          <h2 className="text-base sm:text-lg font-black text-slate-900 mb-3">
            {currentDoc?.title || ''}
          </h2>

          {/* 🌐 약관 언어 즉시 전환 스위치 (영어 기본) 🌐 */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
            <span className="text-[10px] font-bold text-slate-400 px-2">Language:</span>
            {LEGAL_LANG_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                onClick={() => setModalLang(opt.code)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  modalLang === opt.code
                    ? 'bg-white text-rose-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 약관 본문 스크롤 영역 */}
        <div className="overflow-y-auto custom-scrollbar pr-2 space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
          {(currentDoc?.lastUpdated || currentDoc?.date || currentDoc?.updatedAt) && (
            <div className="text-[11px] text-slate-400 font-semibold mb-2">
              Last Updated: {currentDoc.lastUpdated || currentDoc.date || currentDoc.updatedAt}
            </div>
          )}

          {(currentDoc?.sections || []).map((section: any, idx: number) => (
            <div key={idx} className="space-y-1 bg-slate-50/60 p-3 rounded-2xl border border-slate-100">
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                {section.heading || section.title || section.subTitle || ''}
              </h3>
              <p className="whitespace-pre-wrap text-slate-600 text-[11px] sm:text-xs">
                {section.content || section.text || ''}
              </p>
            </div>
          ))}
        </div>

        {/* 하단 확인 버튼 */}
        <div className="pt-4 border-t border-slate-100 mt-4 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-2xs transition cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}