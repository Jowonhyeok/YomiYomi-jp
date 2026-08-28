import React, { useState } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

// 기기 고유 ID 생성 유틸 함수 (API 요청 시 활용)
export async function getDeviceId() {
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    return result.visitorId;
  } catch (e) {
    console.error('Failed to get device ID:', e);
    return null;
  }
}

export default function AnalyzeResult({ resultData, inputText, userData }) {
  // 1. 요미가나 및 번역 표시 상태 관리
  const [showYomigana, setShowYomigana] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);

  // 2. 프리미엄 여부에 따른 남은 분석 횟수 계산
  const isPremium = userData?.isSubscribed || false;
  const maxCount = isPremium ? 300 : 3;
  const dailyCount = userData?.dailyAnalyzeCount || 0;
  const remainingCount = Math.max(0, maxCount - dailyCount);

  if (!resultData) return null;

  return (
    <div className="analyze-result-container">
      {/* 토글 컨트롤 버튼 영역 */}
      <div className="control-buttons" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button 
          onClick={() => setShowYomigana(!showYomigana)}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            backgroundColor: showYomigana ? '#4A90E2' : '#f0f0f0',
            color: showYomigana ? '#fff' : '#333',
            cursor: 'pointer'
          }}
        >
          요미가나 {showYomigana ? 'Off' : 'On'}
        </button>

        <button 
          onClick={() => setShowTranslation(!showTranslation)}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            backgroundColor: showTranslation ? '#4A90E2' : '#f0f0f0',
            color: showTranslation ? '#fff' : '#333',
            cursor: 'pointer'
          }}
        >
          번역 {showTranslation ? 'Off' : 'On'}
        </button>
      </div>

      {/* 분석 본문 영역 */}
      <div className="main-sentence-box" style={{ fontSize: '18px', lineHeight: '1.8', marginBottom: '16px' }}>
        {showYomigana ? (
          <div 
            className="ruby-sentence"
            dangerouslySetInnerHTML={{ 
              __html: resultData.rubySentences?.join('<br/>') || inputText 
            }} 
          />
        ) : (
          <div className="plain-sentence">{inputText}</div>
        )}

        {/* 전체 문장 번역 표시 영역 */}
        {showTranslation && resultData.translatedText && (
          <div 
            className="translated-text" 
            style={{ marginTop: '12px', color: '#555', fontSize: '16px', fontWeight: '500' }}
          >
            {resultData.translatedText}
          </div>
        )}
      </div>

      {/* 남은 일일 분석 횟수 안내 영역 */}
      <div 
        className="usage-counter-info" 
        style={{ marginTop: '20px', fontSize: '14px', color: '#666', borderTop: '1px solid #eee', paddingTop: '12px' }}
      >
        {isPremium ? (
          <span>✨ 프리미엄 회원 (오늘 남은 분석 횟수: <strong>{remainingCount} / 300회</strong>)</span>
        ) : (
          <span>무료 회원 (오늘 남은 분석 횟수: <strong>{remainingCount} / 3회</strong>)</span>
        )}
      </div>
    </div>
  );
}