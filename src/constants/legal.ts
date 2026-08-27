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
          content: '본 서비스의 결제 대행 및 정산은 공식 판매대행사인 Lemon Squeezy를 통해 이루어집니다. 환불 신청은 결제 시 수신하신 Lemon Squeezy 영수증 이메일 하단의 [View Order] 메뉴를 통해 직접 접수하시거나, 고객지원 이메일(support@yomiyomi-jp.com)로 문의해 주시면 확인 후 처리를 도와드립니다.'
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
        },
        {
          title: '3. Account Management',
          content: 'Users are responsible for providing accurate information and maintaining the security of their accounts.'
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
        },
        {
          title: '2. Purpose of Collection',
          content: 'Collected data is used for authentication, service delivery, customer support, and feature improvements.'
        },
        {
          title: '3. Data Retention & Deletion',
          content: 'Account data will be permanently deleted upon request or account cancellation.'
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
        },
        {
          title: '4. International Currency & Processing Notice',
          content: 'Refunds for international transactions may differ slightly from the original purchase amount due to currency exchange rate fluctuations and credit card issuer policies. Processing may take 5 to 14 business days.'
        }
      ]
    }
  },
  'zh-CN': {
    terms: {
      title: '服务条款',
      lastUpdated: '2026-08-27',
      sections: [
        { title: '1. 目的与服务定义', content: '本条款规定了由 YomiYomi 提供的 AI 日本语分析及学习服务的使用条件。' },
        { title: '2. 通行证与支付', content: '用户可购买高级通行证使用无限制功能。所有支付均为单次购买，不会自动续费。' },
        { title: '3. 账户管理', content: '用户有责任提供准确信息并维护其账户安全。' }
      ]
    },
    privacy: {
      title: '隐私政策',
      lastUpdated: '2026-08-27',
      sections: [
        { title: '1. 收集的个人信息', content: '我们收集电子邮件地址、昵称和使用日志以提供服务。' },
        { title: '2. 收集目的', content: '收集的数据用于身份验证、服务提供和客户支持。' },
        { title: '3. 数据删除', content: '应用户要求或注销账户时，数据将被永久删除。' }
      ]
    },
    refund: {
      title: '退款政策',
      lastUpdated: '2026-08-27',
      sections: [
        {
          title: '1. 全额退款条件',
          content: '购买后7天内且未使用任何高级功能（使用次数为0），可申请全额退款。'
        },
        {
          title: '2. 退款限制及到期说明',
          content: '超过7天或已使用高级功能，不支持退款。通行证在指定期限内有效，不会自动续费。'
        },
        {
          title: '3. 退款申请方式 (Lemon Squeezy)',
          content: '本服务的结算由官方销售商 Lemon Squeezy 处理。可以通过 Lemon Squeezy 收据邮件中的 [View Order] 链接直接申请退款，或联系 support@yomiyomi-jp.com。'
        },
        {
          title: '4. 跨境支付与汇率说明',
          content: '因汇率波动及信用卡发卡行结算政策，跨境支付退款金额可能与实际入账金额略有差异，退款处理通常需要5至14个工作日。'
        }
      ]
    }
  },
  'zh-TW': {
    terms: {
      title: '服務條款',
      lastUpdated: '2026-08-27',
      sections: [
        { title: '1. 目的與服務定義', content: '本條款規定了由 YomiYomi 提供的 AI 日本語分析及學習服務的使用條件。' },
        { title: '2. 通行證與支付', content: '用戶可購買高級通行證使用無限制功能。所有支付均為單次購買，不會自動續費。' },
        { title: '3. 帳戶管理', content: '用戶有責任提供準確資訊並維護其帳戶安全。' }
      ]
    },
    privacy: {
      title: '隱私政策',
      lastUpdated: '2026-08-27',
      sections: [
        { title: '1. 收集的個人資訊', content: '我們收集電子郵件地址、暱稱和使用日誌以提供服務。' },
        { title: '2. 收集目的', content: '收集的資料用於身分驗證、服務提供和客戶支援。' },
        { title: '3. 資料刪除', content: '應用戶要求或註銷帳戶時，資料將被永久刪除。' }
      ]
    },
    refund: {
      title: '退款政策',
      lastUpdated: '2026-08-27',
      sections: [
        {
          title: '1. 全額退款條件',
          content: '購買後7天內且未使用任何高級功能（使用次數為0），可申請全額退款。'
        },
        {
          title: '2. 退款限制及到期說明',
          content: '超過7天或已使用高級功能，不支援退款。通行證在指定期限內有效，不會自動續費。'
        },
        {
          title: '3. 退款申請方式 (Lemon Squeezy)',
          content: '本服務的結算由官方銷售商 Lemon Squeezy 處理。可以透過 Lemon Squeezy 收據郵件中的 [View Order] 連結直接申請退款，或聯繫 support@yomiyomi-jp.com。'
        },
        {
          title: '4. 跨境支付與匯率說明',
          content: '因匯率波動及信用卡發行機構結算政策，跨境支付退款金額可能與實際入帳金額略有差異，退款處理通常需要5至14個工作天。'
        }
      ]
    }
  },
  ja: {
    terms: {
      title: '利用規約',
      lastUpdated: '2026-08-27',
      sections: [
        { title: '1. 目的およびサービスの定義', content: '本規約は、YomiYomiが提供するAI日本語解析および学習サービスの使用条件を定めるものです。' },
        { title: '2. パスおよび決済', content: '無制限機能を利用するためのプレミアムパスを購入できます。すべての決済は1回限りの単品購入であり、自動更新はありません。' },
        { title: '3. アカウント管理', content: 'ユーザーは正確な情報を提供し、アカウントのセキュリティを維持する責任を負います。' }
      ]
    },
    privacy: {
      title: 'プライバシーポリシー',
      lastUpdated: '2026-08-27',
      sections: [
        { title: '1. 収集する個人情報', content: 'サービス提供のため、メールアドレス、ニックネーム、利用ログを収集します。' },
        { title: '2. 収集目的', content: '収集されたデータは、本人確認、サービス提供、カスタマーサポートに利用されます。' },
        { title: '3. データの削除', content: 'ユーザーの要請または退会時にデータは永久に削除されます。' }
      ]
    },
    refund: {
      title: '返金ポリシー',
      lastUpdated: '2026-08-27',
      sections: [
        {
          title: '1. 全額返金条件',
          content: '購入後7日以内かつプレミアム機能を一度も利用していない場合（利用回数0回）、全額返金が可能です。'
        },
        {
          title: '2. 返金制限および有効期限',
          content: '購入後7日を経過した場合、または1回以上機能を利用した場合は返金できません。パスは指定期間のみ有効で、自動更新されません。'
        },
        {
          title: '3. 返金申請方法 (Lemon Squeezy)',
          content: '本サービスの決済は公式販売会社Lemon Squeezyを通じて行われます。Lemon Squeezyの領収書メール内にある[View Order]リンクから直接申請いただくか、support@yomiyomi-jp.comまでお問い合わせください。'
        },
        {
          title: '4. 海外決済および為替に関するご案内',
          content: '為替レートの変動やクレジットカード会社の精算方針により、実際の入金額と多少異なる場合があります。返金処理には営業日基準で5〜14日かかる場合があります。'
        }
      ]
    }
  }
};

export function getLegalDocument(type: LegalDocType, lang: string): LegalDocument {
  const langDocs = LEGAL_DOCUMENTS[lang] || LEGAL_DOCUMENTS['en'] || LEGAL_DOCUMENTS['ko'];
  return langDocs[type] || LEGAL_DOCUMENTS['ko'][type];
}