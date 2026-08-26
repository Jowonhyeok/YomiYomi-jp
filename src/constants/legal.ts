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

// 1. 서비스 이용약관 (Terms of Service)
export const TERMS_OF_SERVICE: Record<string, LegalDocument> = {
  ko: {
    title: "서비스 이용약관",
    updatedAt: "2026-08-26",
    sections: [
      {
        title: "제 1 조 (목적)",
        content: "본 약관은 YomiYomi(이하 '회사')가 제공하는 일본어 문장 분석 및 학습 서비스(이하 '서비스')의 이용조건 및 절차, 회사와 회원 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다."
      },
      {
        title: "제 2 조 (정기 결제 및 구독 서비스)",
        content: "1. 이용자가 정기 구독 플랜을 결제하는 경우, 매월 또는 매년 지정된 결제일에 자동 결제 및 갱신이 진행됩니다.\n2. 구독 해지는 서비스 내 [설정] 메뉴에서 언제든지 신청 가능하며, 해지 신청 시 다음 결제 회차부터 청구되지 않습니다.\n\n구체적인 환불 및 취소 정책은 [환불 및 구독 취소 정책]을 따릅니다."
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
    updatedAt: "2026-08-26",
    sections: [
      {
        title: "1. Purpose",
        content: "These Terms set forth the conditions of use, rights, and responsibilities between YomiYomi ('Company') and the user ('Member') regarding the Japanese text analysis service."
      },
      {
        title: "2. Subscriptions & Automatic Renewals",
        content: "1. Subscription plans automatically renew every month or year on the scheduled billing date unless canceled.\n2. You can cancel your subscription at any time in the [Settings] menu. Cancellation will stop future recurring charges.\n\nSpecific refund and cancellation policies follow the [Refund & Cancellation Policy]."
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
  },
  'zh-CN': {
    title: "服务条款",
    updatedAt: "2026-08-26",
    sections: [
      {
        title: "1. 目的",
        content: "本条款旨在规定YomiYomi（以下简称“公司”）提供的日语句子分析及学习服务（以下简称“服务”）的使用条件、程序以及公司与会员之间的权利、义务和责任事项。"
      },
      {
        title: "2. 定期支付与订阅服务",
        content: "1. 用户购买定期订阅计划时，将在每月或每年的指定支付日自动扣款并续订。\n2. 您可以随时在服务内的[设置]菜单中申请取消订阅，取消后下一计费周期起将不再扣费。\n\n具体退款及取消政策请参照[退款及取消订阅政策]。"
      },
      {
        title: "3. 服务的中断与变更",
        content: "如遇自然灾害、系统维护等不可抗力因素，公司可临时中断或变更服务的提供。"
      },
      {
        title: "4. AI分析结果的责任限制与免责",
        content: "1. 本服务提供的基于AI的日语句子分析、假名标注、翻译及语法解析结果仅供学习参考，不保证绝对准确或完整。\n2. 用户同意对于因过度依赖AI生成结果而导致的直接或间接损失，公司不承担法律责任。"
      }
    ]
  },
  'zh-TW': {
    title: "服務條款",
    updatedAt: "2026-08-26",
    sections: [
      {
        title: "1. 目的",
        content: "本條款旨在規定YomiYomi（以下簡稱「公司」）提供的日語文句分析及學習服務（以下簡稱「服務」）的使用條件、程序以及公司與會員之間的權利、義務和責任事項。"
      },
      {
        title: "2. 定期付款與訂閱服務",
        content: "1. 用戶購買定期訂閱方案時，將在每月或每年的指定付款日自動扣款並續訂。\n2. 您可以隨時在服務內的[設定]選單中申請取消訂閱，取消後下一計費週期起將不再扣款。\n\n具體退款及取消政策請參照[退款及取消訂閱政策]。"
      },
      {
        title: "3. 服務的中斷與變更",
        content: "如遇自然災害、系統維護等不可抗力因素，公司可臨時中斷或變更服務的提供。"
      },
      {
        title: "4. AI分析結果的責任限制與免責",
        content: "1. 本服務提供的基於AI的日語文句分析、假名標註、翻譯及語法解析結果僅供學習參考，不保證絕對準確或完整。\n2. 用戶同意對於因過度依賴AI生成結果而導致的直接或間接損失，公司不承擔法律責任。"
      }
    ]
  }
};

// 2. 개인정보처리방침 (Privacy Policy)
export const PRIVACY_POLICY: Record<string, LegalDocument> = {
  ko: {
    title: "개인정보처리방침",
    updatedAt: "2026-08-26",
    sections: [
      {
        title: "1. 수집하는 개인정보 항목 및 목적",
        content: "회사는 회원가입, 고객상담, 서비스 제공을 위해 이메일 주소, 이름/닉네임, 서비스 이용 기록을 수집합니다."
      },
      {
        title: "2. 개인정보 처리위탁 (PG사 결제 서비스 연동)",
        content: "회사는 이용자의 결제 및 정산 처리를 위해 아래와 같이 외부 전문업체에 개인정보 처리를 위탁하고 있습니다.\n\n• 수탁자: 카카오페이(KakaoPay), 엑심베이(Eximbay/PortOne)\n• 위탁 목적: 결제 승인, 본인 확인 및 정산 처리\n• 위탁 항목: 이메일, 이름, 결제 금액, 주문 정보"
      },
      {
        title: "3. 개인정보의 보유 및 파기",
        content: "회원 탈퇴 시 수집된 개인정보는 즉시 파기됩니다. 단, 전자상거래법 등 관계 법령의 규정에 의하여 보존할 필요가 있는 경우 일정 기간 보관됩니다."
      },
      {
        title: "4. 개인정보 보호책임자",
        content: "성명: 조원혁\n직책: 대표\n문의 이메일: contact.yomiyomi@gmail.com"
      }
    ]
  },
  en: {
    title: "Privacy Policy",
    updatedAt: "2026-08-26",
    sections: [
      {
        title: "1. Information We Collect",
        content: "We collect email address, name/nickname, and service usage logs to provide and improve the YomiYomi service."
      },
      {
        title: "2. Consignment of Personal Information Processing (PG Payment Service Integration)",
        content: "We consign the processing of personal information to external specialized companies solely for payment authorization and processing:\n\n• Trustees: KakaoPay, Eximbay (PortOne)\n• Purpose: Payment processing, fraud prevention, and account settlement\n• Consigned Items: Email, Name, Payment Amount, Order details"
      },
      {
        title: "3. Retention and Deletion",
        content: "Personal information is deleted immediately upon account deletion, except when retention is required by applicable laws."
      },
      {
        title: "4. Chief Privacy Officer",
        content: "Name: Won-hyeok Cho\nPosition: CEO\nContact Email: contact.yomiyomi@gmail.com"
      }
    ]
  },
  'zh-CN': {
    title: "隐私政策",
    updatedAt: "2026-08-26",
    sections: [
      {
        title: "1. 收集的个人信息项目及目的",
        content: "公司为提供会员注册、客户咨询及服务，收集电子邮箱地址、姓名/昵称、服务使用记录。"
      },
      {
        title: "2. 个人信息处理委托（对接PG支付服务）",
        content: "公司为处理用户的支付与结算，将个人信息处理委托给外部专业机构如下：\n\n• 受托方: KakaoPay、Eximbay (PortOne)\n• 委托目的: 支付批准、身份验证及结算处理\n• 委托项目: 电子邮箱、姓名、支付金额、订单信息"
      },
      {
        title: "3. 个人信息的保留与销毁",
        content: "会员注销时收集的个人信息将立即销毁。但根据相关法律法规有保存必要时，将在规定期间内保留。"
      },
      {
        title: "4. 个人信息保护负责人",
        content: "姓名: 曹源赫 (Won-hyeok Cho)\n职务: 代表 (CEO)\n联系邮箱: contact.yomiyomi@gmail.com"
      }
    ]
  },
  'zh-TW': {
    title: "隱私權政策",
    updatedAt: "2026-08-26",
    sections: [
      {
        title: "1. 收集的個人資料項目及目的",
        content: "公司為提供會員註冊、客戶諮詢及服務，收集電子郵件地址、姓名/暱稱、服務使用記錄。"
      },
      {
        title: "2. 個人資料處理委託（對接PG支付服務）",
        content: "公司為處理用戶的付款與結算，將個人資料處理委託給外部專業機構如下：\n\n• 受託方: KakaoPay、Eximbay (PortOne)\n• 委託目的: 付款批准、身分驗證及結算處理\n• 委託項目: 電子郵件、姓名、付款金額、訂單資訊"
      },
      {
        title: "3. 個人資料的保留與銷毀",
        content: "會員註銷時收集的個人資料將立即銷毀。但根據相關法律法規有保存必要時，將在規定期間內保留。"
      },
      {
        title: "4. 個人資料保護負責人",
        content: "姓名: 曹源赫 (Won-hyeok Cho)\n職務: 代表 (CEO)\n聯絡電子郵件: contact.yomiyomi@gmail.com"
      }
    ]
  }
};

// 3. 환불 및 취소 정책 (Refund Policy)
export const REFUND_POLICY: Record<string, LegalDocument> = {
  ko: {
    title: "환불 및 구독 취소 정책",
    updatedAt: "2026-08-26",
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
    updatedAt: "2026-08-26",
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
  },
  'zh-CN': {
    title: "退款及取消订阅政策",
    updatedAt: "2026-08-26",
    sections: [
      {
        title: "1. 未使用全额退款条件",
        content: "付款完成后7天内，若完全未使用AI分析、测试等高级功能（使用次数为0），在[设置]菜单申请取消订阅时将获得全额退款。"
      },
      {
        title: "2. 使用后中途取消",
        content: "若已超过7天或已使用过一次以上高级功能，则无法立即退款。您可以继续使用当月剩余天数，服务将在下一计费周期起自动终止。"
      },
      {
        title: "3. 海外支付（Eximbay）退款说明",
        content: "海外信用卡退款可能因汇率波动及银行结算政策与实际入账金额有所差异，退款处理通常需要5至14个工作日。"
      }
    ]
  },
  'zh-TW': {
    title: "退款及取消訂閱政策",
    updatedAt: "2026-08-26",
    sections: [
      {
        title: "1. 未使用全額退款條件",
        content: "付款完成後7天內，若完全未使用AI分析、測驗等高級功能（使用次數為0），在[設定]選單申請取消訂閱時將獲得全額退款。"
      },
      {
        title: "2. 使用後中途取消",
        content: "若已超過7天或已使用過一次以上高級功能，則無法立即退款。您可以繼續使用當月剩餘天數，服務將在下一計費週期起自動終止。"
      },
      {
        title: "3. 海外支付（Eximbay）退款說明",
        content: "海外信用卡退款可能因匯率波動及銀行結算政策與實際入帳金額有所差異，退款處理通常需要5至14個工作天。"
      }
    ]
  }
};

// 사용자의 선택 언어에 맞춰 해당 문서를 리턴하는 헬퍼 함수
export function getLegalDocument(type: LegalDocType, lang: Lang): LegalDocument {
  const docKey = ['ko', 'en', 'zh-CN', 'zh-TW'].includes(lang) ? lang : 'en';
  
  if (type === 'terms') return TERMS_OF_SERVICE[docKey] || TERMS_OF_SERVICE['en'];
  if (type === 'privacy') return PRIVACY_POLICY[docKey] || PRIVACY_POLICY['en'];
  return REFUND_POLICY[docKey] || REFUND_POLICY['en'];
}