import type { Lang } from '../types';

export interface LegalSection {
  title: string;
  content: string;
}

export interface LegalDocument {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}

export type LegalDocType = 'terms' | 'privacy' | 'refund';

// 1. 이용약관 (Terms of Service)
export const TERMS_OF_SERVICE: Record<string, LegalDocument> = {
  ko: {
    title: "서비스 이용약관",
    updatedAt: "2026-08-25",
    sections: [
      {
        title: "제 1 조 (목적)",
        content: "본 약관은 YomiYomi(이하 '회사')가 제공하는 일본어 문장 분석 및 학습 서비스(이하 '서비스')의 이용조건 및 절차, 회사와 회원 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다."
      },
      {
        title: "제 2 조 (정기 결제 및 구독 서비스)",
        content: "1. 이용자가 정기 구독 플랜을 결제하는 경우, 매월 또는 매년 지정된 결제일에 자동 결제 및 갱신이 진행됩니다.\n2. 구독 해지는 서비스 내 [설정] 메뉴에서 언제든지 신청 가능하며, 해지 신청 시 다음 결제 회차부터 청구되지 않습니다."
      },
      {
        title: "제 3 조 (서비스의 중단 및 변경)",
        content: "회사는 천재지변, 시스템 점검 등 불가피한 사유가 발생하는 경우 서비스 제공을 일시적으로 중단하거나 변경할 수 있습니다."
      },
      {
        title: "제 4 조 (AI 분석 결과에 대한 책임 제한 및 면책)",
        content: "1. 본 서비스가 제공하는 AI 기반 일본어 문장 분석, 요미가나, 번역 및 문법 해설 결과는 학습 참고용 자료이며, 완벽한 정확성이나 완전성을 보장하지 않습니다.\n2. 이용자는 AI 결과물을 맹신함으로 인해 발생하는 직·간접적 손해에 대해 회사가 법적 책임을 지지 않음에 동의합니다."
      }
    ]
  },
  en: {
    title: "Terms of Service",
    updatedAt: "2026-08-25",
    sections: [
      {
        title: "1. Purpose",
        content: "These Terms set forth the conditions of use, rights, and responsibilities between YomiYomi ('Company') and the user ('Member') regarding the Japanese text analysis service."
      },
      {
        title: "2. Subscriptions & Automatic Renewals",
        content: "1. Subscription plans automatically renew every month or year on the scheduled billing date unless canceled.\n2. You can cancel your subscription at any time in the [Settings] menu. Cancellation will stop future recurring charges."
      },
      {
        title: "3. Service Limitations",
        content: "The Company reserves the right to suspend or modify services temporarily for system maintenance, updates, or technical reasons."
      },
      {
        title: "4. Disclaimer of AI Analysis Results",
        content: "1. AI-generated Japanese text analysis, translations, and explanations are provided for educational reference only. The Company does not guarantee 100% accuracy or completeness.\n2. The Company shall not be liable for any direct or indirect consequences arising from reliance on AI-generated outputs."
      }
    ]
  }
};

// 2. 개인정보처리방침 (Privacy Policy - PG사 제3자 제공 필수 포함)
export const PRIVACY_POLICY: Record<string, LegalDocument> = {
  ko: {
    title: "개인정보처리방침",
    updatedAt: "2026-08-25",
    sections: [
      {
        title: "1. 수집하는 개인정보 항목 및 목적",
        content: "회사는 회원가입, 고객상담, 서비스 제공을 위해 이메일 주소, 이름/닉네임, 서비스 이용 기록을 수집합니다."
      },
      {
        title: "2. 개인정보의 제3자 제공 (PG사 결제 서비스 연동)",
        content: "회사는 이용자의 결제 및 정산 처리를 위해 아래와 같이 외부에 개인정보를 제공합니다.\n\n• 제공받는 자: 카카오페이(KakaoPay), 엑심베이(Eximbay/PortOne)\n• 제공 목적: 결제 승인, 본인 확인 및 정산 처리\n• 제공 항목: 이메일, 이름, 결제 금액, 주문 정보"
      },
      {
        title: "3. 개인정보의 보유 및 파기",
        content: "회원 탈퇴 시 수집된 개인정보는 즉시 파기됩니다. 단, 전자상거래법 등 관계 법령의 규정에 의하여 보존할 필요가 있는 경우 일정 기간 보관됩니다."
      }
    ]
  },
  en: {
    title: "Privacy Policy",
    updatedAt: "2026-08-25",
    sections: [
      {
        title: "1. Information We Collect",
        content: "We collect email address, name/nickname, and service usage logs to provide and improve the YomiYomi service."
      },
      {
        title: "2. Third-Party Provision for Payment Processing",
        content: "We provide personal information to third parties solely for payment authorization and processing:\n\n• Recipients: KakaoPay, Eximbay (PortOne)\n• Purpose: Payment processing, fraud prevention, and account settlement\n• Provided Items: Email, Name, Payment Amount, Order details"
      },
      {
        title: "3. Retention and Deletion",
        content: "Personal information is deleted immediately upon account deletion, except when retention is required by applicable laws."
      }
    ]
  }
};

// 3. 환불 및 취소 정책 (Refund Policy - PG사 필수 기준)
export const REFUND_POLICY: Record<string, LegalDocument> = {
  ko: {
    title: "환불 및 구독 취소 정책",
    updatedAt: "2026-08-25",
    sections: [
      {
        title: "1. 미사용 전액 환불 조건 (자동/수동)",
        content: "결제 완료 후 7일 이내에 AI 분석 및 퀴즈 등의 프리미엄 기능을 일체 사용하지 않은 경우(이용 횟수 0회), [설정] 메뉴에서 구독 해지 신청 시 전액 환불 처리가 진행됩니다."
      },
      {
        title: "2. 서비스 이용 후 중도 해지",
        content: "결제 후 7일이 경과했거나 결제 건으로 1회 이상 프리미엄 기능을 사용한 경우, 즉시 환불은 불가하며 당월 남은 기간까지 이용을 유지한 후 차기 결제부터 자동 해지됩니다."
      },
      {
        title: "3. 해외 결제(엑심베이) 환불 안내",
        content: "해외 카드로 결제된 건의 환불은 환율 변동 및 카드사 정산 정책에 따라 실 입금액과 차이가 발생할 수 있으며, 취소 승인 후 영업일 기준 5~14일 소요될 수 있습니다."
      }
    ]
  },
  en: {
    title: "Refund & Cancellation Policy",
    updatedAt: "2026-08-25",
    sections: [
      {
        title: "1. Full Refund for Unused Services",
        content: "If you have not used any premium features (0 analysis usages) within 7 days of payment, you are eligible for a 100% full refund upon canceling your subscription in the Settings menu."
      },
      {
        title: "2. Cancellation After Usage",
        content: "If 7 days have passed or if you have used any premium features at least once, immediate refunds are not provided. Your access will remain active until the end of the current billing cycle, and no further charges will occur."
      },
      {
        title: "3. International Card Refunds (Eximbay)",
        content: "Refunds for international cards are processed in USD. Total refunded amounts may slightly vary due to exchange rate fluctuations and processing times (5-14 business days depending on your bank)."
      }
    ]
  }
};

// 사용자의 선택 언어에 맞춰 해당 문서를 리턴하는 헬퍼 함수
export function getLegalDocument(type: LegalDocType, lang: Lang): LegalDocument {
  const currentLang = (lang === 'ko' ? 'ko' : 'en');
  
  if (type === 'terms') return TERMS_OF_SERVICE[currentLang];
  if (type === 'privacy') return PRIVACY_POLICY[currentLang];
  return REFUND_POLICY[currentLang];
}