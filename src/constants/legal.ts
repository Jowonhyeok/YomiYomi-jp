export type LegalDocType = 'terms' | 'privacy' | 'refund';

export interface LegalSection {
  title: string;
  content: string;
}

export interface LegalDocument {
  title: string;
  lastUpdated: string;
  sections: LegalSection[];
}

export const LEGAL_DOCUMENTS: Record<string, Record<LegalDocType, LegalDocument>> = {
  ko: {
    terms: {
      title: '서비스 이용약관',
      lastUpdated: '2026-08-27',
      sections: [
        {
          title: '1. 목적 및 서비스 정의',
          content: '본 약관은 YomiYomi(이하 "회사")가 제공하는 AI 기반 일본어 분석, 단어장, 퀴즈 및 학습 서비스(이하 "서비스")의 이용조건 및 절차를 규정합니다.'
        },
        {
          title: '2. 이용권 및 결제',
          content: '회원은 프리미엄 이용권을 구매하여 무제한 분석 및 추가 기능을 이용할 수 있습니다. 본 서비스의 모든 결제는 단발성 일회성 결제로 진행되며, 별도의 동의 없이 정기 자동 결제되지 않습니다.'
        },
        {
          title: '3. 회원가입 및 계정 관리',
          content: '회원은 정확한 정보를 입력해야 하며, 계정 정보의 관리 책임은 회원 본인에게 있습니다.'
        }
      ]
    },
    privacy: {
      title: '개인정보처리방침',
      lastUpdated: '2026-08-27',
      sections: [
        {
          title: '1. 수집하는 개인정보 항목',
          content: '회사는 회원가입 및 서비스 제공을 위해 이메일 주소, 닉네임, 서비스 이용 기록을 수집합니다.'
        },
        {
          title: '2. 개인정보의 수집 및 이용목적',
          content: '수집된 정보는 회원 식별, 서비스 제공, 고객 문의 응대 및 품질 개선을 위해 활용됩니다.'
        },
        {
          title: '3. 개인정보의 파기',
          content: '회원이 탈퇴를 요청하거나 목적이 달성된 경우, 해당 정보를 지체 없이 파기합니다.'
        }
      ]
    },
    refund: {
      title: '환불 및 이용 정책',
      lastUpdated: '2026-08-27',
      sections: [
        {
          title: '1. 미사용 전액 환불 조건',
          content: '결제 완료 후 7일 이내에 AI 분석, PDF 내보내기 등 프리미엄 기능을 일체 사용하지 않은 경우(이용 횟수 0회) 전액 환불 처리가 가능합니다.'
        },
        {
          title: '2. 서비스 이용 후 환불 제한 및 만료 안내',
          content: '결제 후 7일이 경과했거나, 결제 건으로 1회 이상 프리미엄 기능을 사용한 경우 디지털 콘텐츠 특성상 환불이 불가합니다. 구매하신 이용권은 정해진 기간(3개월, 1년, 평생) 동안 유효하며 자동 연장 결제되지 않습니다.'
        },
        {
          title: '3. 환불 신청 방법 (Lemon Squeezy)',
          content: '본 서비스의 결제 대행 및 정산은 공식 판매대행사인 Lemon Squeezy를 통해 이루어집니다. 환불 신청은 결제 시 수신하신 Lemon Squeezy 영수증 이메일 하단의 [View Order] 메누를 통해 직접 접수하시거나, 고객지원 이메일(support@yomiyomi-jp.com)로 문의해 주시면 확인 후 처리를 도와드립니다.'
        },
        {
          title: '4. 해외 결제 환불 안내',
          content: '해외 카드로 결제된 건의 환불은 환율 변동 및 카드사 정산 정책에 따라 실 입금액과 차이가 발생할 수 있으며, 취소 승인 후 영업일 기준 5~14일 소요될 수 있습니다.'
        }
      ]
    }
  },
  en: {
    terms: {
      title: 'Terms of Service',
      lastUpdated: '2026-08-27',
      sections: [
        {
          title: '1. Purpose & Service Definition',
          content: 'These terms govern the use of AI-powered Japanese analyzer services provided by YomiYomi.'
        },
        {
          title: '2. Passes & Payments',
          content: 'Users can purchase Premium Passes for unlimited access. All payments are one-time single purchases and will not automatically renew.'
        }
      ]
    },
    privacy: {
      title: 'Privacy Policy',
      lastUpdated: '2026-08-27',
      sections: [
        {
          title: '1. Information We Collect',
          content: 'We collect email addresses, nicknames, and usage logs to provide our services.'
        }
      ]
    },
    refund: {
      title: 'Refund Policy',
      lastUpdated: '2026-08-27',
      sections: [
        {
          title: '1. Full Refund Eligibility',
          content: 'A full refund is available within 7 days of purchase if no premium features (AI analysis, PDF export, etc.) have been used (0 usage count).'
        },
        {
          title: '2. Non-Refundable Policy & Expiration',
          content: 'Refunds are not available if more than 7 days have passed or if premium features have been used at least once. Passes remain active for their purchased duration and do not auto-renew.'
        },
        {
          title: '3. How to Request a Refund (Lemon Squeezy)',
          content: 'Our order process is conducted by our Merchant of Record, Lemon Squeezy. You can request a refund directly via the [View Order] link in your Lemon Squeezy receipt email or contact our support team at support@yomiyomi-jp.com.'
        }
      ]
    }
  },
  'zh-CN': {
    terms: { title: '服务条款', lastUpdated: '2026-08-27', sections: [] },
    privacy: { title: '隐私政策', lastUpdated: '2026-08-27', sections: [] },
    refund: {
      title: '退款政策',
      lastUpdated: '2026-08-27',
      sections: [
        {
          title: '1. 全额退款条件',
          content: '购买后7天内且未使用任何高级功能（使用次数为0），可申请全额退款。'
        },
        {
          title: '2. 退款限制',
          content: '超过7天或已使用高级功能，不支持退款。通行证不会自动续费。'
        },
        {
          title: '3. 退款申请方式 (Lemon Squeezy)',
          content: '可以通过 Lemon Squeezy 收据邮件中的 [View Order] 链接直接申请退款，或联系 support@yomiyomi-jp.com。'
        }
      ]
    }
  },
  'zh-TW': {
    terms: { title: '服務條款', lastUpdated: '2026-08-27', sections: [] },
    privacy: { title: '隱私政策', lastUpdated: '2026-08-27', sections: [] },
    refund: {
      title: '退款政策',
      lastUpdated: '2026-08-27',
      sections: [
        {
          title: '1. 全額退款條件',
          content: '購買後7天內且未使用任何高級功能（使用次數為0），可申請全額退款。'
        },
        {
          title: '2. 退款限制',
          content: '超過7天或已使用高級功能，不支援退款。通行證不會自動續費。'
        },
        {
          title: '3. 退款申請方式 (Lemon Squeezy)',
          content: '可以透過 Lemon Squeezy 收據郵件中的 [View Order] 連結直接申請退款，或聯繫 support@yomiyomi-jp.com。'
        }
      ]
    }
  },
  ja: {
    terms: { title: '利用規約', lastUpdated: '2026-08-27', sections: [] },
    privacy: { title: 'プライバシーポリシー', lastUpdated: '2026-08-27', sections: [] },
    refund: {
      title: '返金ポリシー',
      lastUpdated: '2026-08-27',
      sections: [
        {
          title: '1. 全額返金条件',
          content: '購入後7日以内かつプレミアム機能を一度も利用していない場合（利用回数0回）、全額返金が可能です。'
        },
        {
          title: '2. 返金制限',
          content: '購入後7日を経過した場合、または1回以上機能を利用した場合は返金できません。自動更新はありません。'
        },
        {
          title: '3. 返金申請方法 (Lemon Squeezy)',
          content: 'Lemon Squeezyの領収書メール内にある[View Order]リンクから申請いただくか、support@yomiyomi-jp.comまでお問い合わせください。'
        }
      ]
    }
  }
};

export function getLegalDocument(type: LegalDocType, lang: string): LegalDocument {
  const langDocs = LEGAL_DOCUMENTS[lang] || LEGAL_DOCUMENTS['en'] || LEGAL_DOCUMENTS['ko'];
  return langDocs[type] || LEGAL_DOCUMENTS['ko'][type];
}