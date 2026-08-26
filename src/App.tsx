import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
  deleteUser
} from 'firebase/auth';
import { doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase';

import type { Lang, KanjiInfo, WordInfo, GrammarInfo, AnalysisResult, Deck, UserProfile } from './types';
import { 
  PORTONE_STORE_ID, 
  CHANNEL_KEY_KAKAOPAY, 
  CHANNEL_KEY_EXIMBAY, 
  MAX_TEXT_LENGTH, 
  HIRAGANA_GRID, 
  KATAKANA_GRID, 
  DICT, 
  RECOMMENDED_SITES 
} from './constants';
import { 
  getLocalizedPOS, 
  getLocalizedText, 
  calculateDaysLeft, 
  sanitizeDecks, 
  parseRubySentence, 
  analyzeJapanese,
  convertUsdToKrw
} from './utils/helpers';
import { CardCarousel } from './components/CardCarousel';
import { SidebarWordCarousel } from './components/SidebarCarousel';
import { LegalModal } from './components/LegalModal';
import { getLegalDocument } from './constants/legal';
import type { LegalDocType, LegalDocument } from './constants/legal';

import { useUserStore } from './store/useUserStore';
import { useDeckStore } from './store/useDeckStore';
import { useUIStore } from './store/useUIStore';

declare global {
  interface Window {
    PortOne?: any;
  }
}

const DEFAULT_DECK_DATA: Deck = {
  id: 'default',
  name: 'Default Deck',
  cards: [], 
  createdAt: new Date().toISOString()
};

// 🌸 헤더 상단 언어 선택 옵션 (순서: 영어 -> 중국어(간체) -> 대만어(번체) -> 한국어 -> 일본어) 🌸
const LANG_OPTIONS: { code: Lang; flagUrl: string; label: string }[] = [
  { code: 'en', flagUrl: 'https://flagcdn.com/us.svg', label: 'English' },
  { code: 'zh-CN', flagUrl: 'https://flagcdn.com/cn.svg', label: '简体中文' },
  { code: 'zh-TW', flagUrl: 'https://flagcdn.com/tw.svg', label: '繁體中文' },
  { code: 'ko', flagUrl: 'https://flagcdn.com/kr.svg', label: '한국어' },
  { code: 'ja', flagUrl: 'https://flagcdn.com/jp.svg', label: '日本語' },
];

export default function App() {
  const { currentUser, lang, setCurrentUser, setLang } = useUserStore();
  const { 
    decks, selectedDeckId, searchKeyword, quizSelectedDeckIds, quizState, 
    setDecks, setSelectedDeckId, setSearchKeyword, setQuizSelectedDeckIds, setQuizState 
  } = useDeckStore();
  const { 
    activeTab, readingDisplayMode, hideMeanings, kanaTab, fontSize, fontFamily, speakingText,
    isPricingModalOpen, selectedPlanForPay, customModal,
    setActiveTab, setReadingDisplayMode, setHideMeanings, setKanaTab, setFontSize, setFontFamily,
    setSpeakingText, setIsPricingModalOpen, setSelectedPlanForPay, showAlert, showConfirm, closeCustomModal
  } = useUIStore();

  const t = (key: string) => DICT[lang]?.[key] || DICT['en']?.[key] || DICT['ko']?.[key] || key;

  // 🌸 언어별 회원가입 이메일 발송 안내 메시지 매핑 🌸
  const getSignupEmailNotice = (userLang: Lang) => {
    switch (userLang) {
      case 'ko':
        return '🌸 회원가입이 완료되었습니다!\n입력하신 이메일로 인증 링크를 발송했습니다. 이메일함(스팸함 포함)을 확인하여 인증 완료 후 로그인해 주세요.';
      case 'ja':
        return '🌸 会員登録が完了しました！\nご入力いただいたメールアドレスに確認リンクを送信しました。メールボックス（迷惑メールフォルダ含む）をご確認のうえ、認証を完了してからログインしてください。';
      case 'zh-CN':
        return '🌸 注册成功！\n验证链接已发送至您的邮箱。请检查您的收件箱（包括垃圾邮件箱），完成验证后再进行登录。';
      case 'zh-TW':
        return '🌸 註冊成功！\n驗證連結已發送至您的信箱。請檢查您的收件箱（包含垃圾郵件箱），完成驗證後再進行登入。';
      case 'en':
      default:
        return '🌸 Sign-up completed successfully!\nA verification link has been sent to your email. Please check your inbox (including spam folder) and verify your account before logging in.';
    }
  };

  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ file: File; preview: string; mimeType: string; data: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const [showTranslation, setShowTranslation] = useState(true);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLeftSidebarOpenMobile, setIsLeftSidebarOpenMobile] = useState(false);

  // 🌸 브라우저 탭 파비콘(Favicon)을 벚꽃 이모지로 강제 적용 🌸
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const existingFavicons = document.querySelectorAll("link[rel*='icon']");
      existingFavicons.forEach(el => el.parentNode?.removeChild(el));

      const link = document.createElement('link');
      link.type = 'image/svg+xml';
      link.rel = 'icon';
      link.href = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌸</text></svg>';
      document.getElementsByTagName('head')[0].appendChild(link);
    }
  }, []);

  // 헤더 언어 드롭다운
  const [isHeaderLangOpen, setIsHeaderLangOpen] = useState(false);
  const headerLangRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerLangRef.current && !headerLangRef.current.contains(e.target as Node)) {
        setIsHeaderLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreePayPolicy, setAgreePayPolicy] = useState(false);
  const [legalModalState, setLegalModalState] = useState<{
    isOpen: boolean;
    doc: LegalDocument | null;
    docType: LegalDocType | null;
  }>({ isOpen: false, doc: null, docType: null });

  const openLegalDoc = (type: LegalDocType) => {
    const docData = getLegalDocument(type, lang);
    setLegalModalState({ isOpen: true, doc: docData, docType: type });
  };

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editName, setAuthEditName] = useState('');

  const [isNewDeckModalOpen, setIsNewDeckModalOpen] = useState(false);
  const [newDeckInputName, setNewDeckInputName] = useState('');

  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    deckId: string;
    deckName: string;
    inputName: string;
  }>({ isOpen: false, deckId: '', deckName: '', inputName: '' });

  const isPasswordLengthValid = authPassword.length >= 8;
  const isPasswordSpecialValid = /^(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(authPassword);
  const isPasswordMatchValid = authPassword.length > 0 && authPassword === authConfirmPassword;
  
  const isSignupFormValid = isPasswordLengthValid && isPasswordSpecialValid && isPasswordMatchValid && authName.trim().length > 0 && authEmail.trim().length > 0 && agreeTerms && agreePrivacy;

  const recordFeatureUsage = async () => {
    if (currentUser && db && db.app) {
      try {
        const userDocRef = doc(db, 'users', currentUser.id);
        await setDoc(userDocRef, { lastUsedAt: Date.now() }, { merge: true });
      } catch (e) {
        console.error("Failed to record usage", e);
      }
    }
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  useEffect(() => {
    if (decks && decks.length > 0) {
      const exists = decks.some(d => String(d.id) === String(selectedDeckId));
      if (!exists) {
        setSelectedDeckId(decks[0].id);
      }
    }
  }, [decks, selectedDeckId, setSelectedDeckId]);

  const handleLanguageChange = (newLang: Lang) => {
    setLang(newLang);
    if (currentUser && db && db.app) {
      const userDocRef = doc(db, 'users', currentUser.id);
      setDoc(userDocRef, { lang: newLang }, { merge: true });
    }
  };

  useEffect(() => {
    if (!auth || !auth.onAuthStateChanged) return;
    
    const checkPendingMobilePayment = async (user: any) => {
      const urlParams = new URLSearchParams(window.location.search);
      const paymentId = urlParams.get('paymentId');
      if (paymentId) {
        const planName = sessionStorage.getItem('pendingPlanName') || 'Premium';
        try {
          const idToken = await user.getIdToken(true);
          const verifyRes = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ paymentId, planName, userId: user.uid })
          });
          
          if (!verifyRes.ok) return;

          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            showAlert(`🎉 ${planName} 결제 및 승인이 완료되었습니다!`);
            sessionStorage.removeItem('pendingPlanName');
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (e) {
          console.error("Mobile payment verification failed:", e);
        }
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        checkPendingMobilePayment(user);

        if (!db || !db.app) {
          setCurrentUser({
            id: user.uid,
            email: user.email || '',
            name: user.displayName || user.email?.split('@')[0] || 'User',
            isSubscribed: false,
            dailyAnalyzeCount: 0,
            lastAnalyzeDate: new Date().toISOString().split('T')[0],
            lang: lang 
          });
          return;
        }

        const userDocRef = doc(db, 'users', user.uid);
        const unsubscribeSnapshot = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const today = new Date().toISOString().split('T')[0];
            const isToday = data.lastAnalyzeDate === today;

            let isSubscribedActive = data.isSubscribed || false;
            let cancelAtPeriodEnd = data.cancelAtPeriodEnd || false;

            if (data.subscriptionEndDate) {
              const endDate = new Date(data.subscriptionEndDate);
              const now = new Date();
              if (now > endDate) {
                isSubscribedActive = false;
                cancelAtPeriodEnd = false;
                setDoc(userDocRef, { 
                  isSubscribed: false, 
                  cancelAtPeriodEnd: false, 
                  subscriptionPlan: 'Free' 
                }, { merge: true });
              }
            }

            if (data.lang && ['ko', 'en', 'zh-CN', 'zh-TW', 'ja'].includes(data.lang)) {
              setLang(data.lang);
            }

            setCurrentUser({
              id: user.uid,
              email: user.email || '',
              name: data.name || user.displayName || user.email?.split('@')[0] || 'User',
              isSubscribed: isSubscribedActive,
              subscriptionPlan: isSubscribedActive ? (data.subscriptionPlan || 'Premium') : 'Free',
              subscriptionEndDate: data.subscriptionEndDate || '',
              cancelAtPeriodEnd: cancelAtPeriodEnd,
              lastAnalyzeDate: data.lastAnalyzeDate || today,
              dailyAnalyzeCount: isToday ? (data.dailyAnalyzeCount || 0) : 0,
              lang: data.lang || 'en'
            });

            if (data.decks && data.decks.length > 0) {
              setDecks(sanitizeDecks(data.decks));
            }
          } else {
            const today = new Date().toISOString().split('T')[0];
            const newUser: UserProfile = {
              id: user.uid,
              email: user.email || '',
              name: user.displayName || user.email?.split('@')[0] || 'User',
              isSubscribed: false,
              subscriptionPlan: 'Free',
              lastAnalyzeDate: today,
              dailyAnalyzeCount: 0,
              lang: 'en'
            };
            const initialDeck: Deck[] = [DEFAULT_DECK_DATA];
            setCurrentUser(newUser);
            setDoc(userDocRef, { ...newUser, decks: initialDeck });
          }
        }, (err) => console.error(err));

        return () => unsubscribeSnapshot();
      } else {
        setCurrentUser(null);
        setLang('en');
        try {
          const saved = localStorage.getItem('koto_decks');
          if (saved) {
            setDecks(sanitizeDecks(JSON.parse(saved)));
          } else {
            setDecks([DEFAULT_DECK_DATA]);
          }
        } catch {
          setDecks([DEFAULT_DECK_DATA]);
        }
      }
    });

    return () => unsubscribeAuth();
  }, [setCurrentUser, setDecks, setLang]);

  const saveDecks = async (newDecks: Deck[]) => {
    const sanitized = sanitizeDecks(newDecks);
    setDecks(sanitized);
    if (currentUser && db && db.app) {
      const userDocRef = doc(db, 'users', currentUser.id);
      await setDoc(userDocRef, { decks: sanitized }, { merge: true });
    } else {
      localStorage.setItem('koto_decks', JSON.stringify(sanitized));
    }
  };

  useEffect(() => {
    if (decks.length > 0 && quizSelectedDeckIds.length === 0) {
      setQuizSelectedDeckIds([decks[0].id]);
    }
  }, [decks, quizSelectedDeckIds, setQuizSelectedDeckIds]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) {
      showAlert('Please enter your email and password.');
      return;
    }

    try {
      if (authMode === 'signup') {
        if (!authName.trim()) {
          showAlert('Please enter your name/nickname.');
          return;
        }

        if (!isSignupFormValid) {
          showAlert('Please check and agree to all required terms.');
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        await updateProfile(userCredential.user, { displayName: authName.trim() });
        
        if (db && db.app) {
          const userDocRef = doc(db, 'users', userCredential.user.uid);
          await setDoc(userDocRef, { name: authName.trim(), lang: lang }, { merge: true });
        }

        await sendEmailVerification(userCredential.user);
        await signOut(auth);

        // 🌸 다국어 적용된 이메일 발송 안내 알림창 🌸
        showAlert(getSignupEmailNotice(lang));
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, authEmail, authPassword);
        if (!userCredential.user.emailVerified) {
          await signOut(auth);
          showAlert(t('emailVerificationAlert'));
          return;
        }
      }

      setIsAuthModalOpen(false);
      setAuthPassword('');
      setAuthConfirmPassword('');
      setAgreeTerms(false);
      setAgreePrivacy(false);
    } catch (err: any) {
      let userFriendlyMsg = 'An authentication error occurred.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        userFriendlyMsg = 'Invalid email address or password. Please try again.';
      } else if (err.code === 'auth/email-already-in-use') {
        userFriendlyMsg = t('emailAlreadyInUse');
      } else if (err.code === 'auth/invalid-email') {
        userFriendlyMsg = 'Invalid email address format.';
      }
      showAlert(userFriendlyMsg);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setIsAuthModalOpen(false);
    } catch (err: any) {
      showAlert('Google Login failed: ' + err.message);
    }
  };

  const handleLogout = () => {
    showConfirm(t('logoutConfirm'), async () => {
      try {
        await signOut(auth);
      } catch (e) {
        console.error("SignOut error:", e);
      } finally {
        setCurrentUser(null);
        setDecks([DEFAULT_DECK_DATA]);
        setLang('en');
        setIsSettingsModalOpen(false);
      }
    });
  };

  const handleSaveSettings = async () => {
    if (!currentUser) return;
    try {
      if (db && db.app) {
        const userDocRef = doc(db, 'users', currentUser.id);
        await setDoc(userDocRef, { name: editName }, { merge: true });
      }

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: editName });
      }

      setCurrentUser(prev => prev ? { ...prev, name: editName } : null);
      setIsSettingsModalOpen(false);
      showAlert(t('profileUpdateSuccess'));
    } catch (err: any) {
      showAlert('Failed to update profile: ' + err.message);
    }
  };

  const handleCancelSubscription = () => {
    const confirmMsg = lang === 'ko' 
      ? "구독 해지 및 환불을 신청하시겠습니까?" 
      : "Are you sure you want to request subscription cancellation and refund?";

    showConfirm(confirmMsg, async () => {
      if (!currentUser || !auth.currentUser) return;
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/payments/refund', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          }
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const detailMsg = data?.message || `API 통신 에러 (${res.status})`;
          showAlert(`환불 처리 실패: ${detailMsg}`);
          return;
        }

        if (data && data.success) {
          const successMsg = lang === 'ko'
            ? "🎉 결제 후 7일 이내 및 미사용 건이 확인되어 결제 전액 환불(취소) 처리되었습니다."
            : "🎉 Full refund processed successfully (Unused & within 7 days).";
          showAlert(successMsg);
          setCurrentUser(prev => prev ? { ...prev, isSubscribed: false, subscriptionPlan: 'Free' } : null);
        } else if (data && (data.code === 'USAGE_EXISTS' || data.code === 'EXCEEDED_7_DAYS')) {
          setCurrentUser(prev => prev ? { ...prev, cancelAtPeriodEnd: true } : null);
          showAlert(data.message);
        } else {
          showAlert(`Error: ${data?.message || '환불 처리에 실패했습니다.'}`);
        }

        setIsSettingsModalOpen(false);
      } catch (err: any) {
        showAlert('환불 처리 중 문제 발생: ' + err.message);
      }
    });
  };

  const handleResumeSubscription = async () => {
    if (!currentUser) return;
    try {
      if (db && db.app) {
        const userDocRef = doc(db, 'users', currentUser.id);
        await setDoc(userDocRef, { cancelAtPeriodEnd: false }, { merge: true });
      }
      setCurrentUser(prev => prev ? { ...prev, cancelAtPeriodEnd: false } : null);
      showAlert(lang === 'ko' ? "구독 해지 예약이 철회되었습니다. 정기 구독이 유지됩니다." : "Subscription renewal resumed successfully.");
    } catch (err: any) {
      showAlert("Error: " + err.message);
    }
  };

  const handleDeleteAccount = () => {
    showConfirm(t('deleteAccountConfirm'), async () => {
      if (!currentUser || !auth.currentUser) return;
      
      const userUid = currentUser.id;
      const firebaseUser = auth.currentUser;

      try {
        if (db && db.app) {
          try {
            const userDocRef = doc(db, 'users', userUid);
            await deleteDoc(userDocRef);
          } catch (dbErr) {
            console.warn("Firestore delete non-critical error:", dbErr);
          }
        }

        await deleteUser(firebaseUser);

        setCurrentUser(null);
        setIsSettingsModalOpen(false);
        setDecks([DEFAULT_DECK_DATA]);
        localStorage.removeItem('koto_decks');
        setLang('en');
        showAlert(t('deleteAccountSuccess'));

      } catch (err: any) {
        console.error("Delete Account Error:", err);
        
        if (err.code === 'auth/requires-recent-login') {
          try { await signOut(auth); } catch {}
          setCurrentUser(null);
          setIsSettingsModalOpen(false);
          showAlert('보안을 위해 재로그인이 필요합니다. 로그아웃 처리되었으니 다시 로그인하여 탈퇴를 시도해 주세요.');
        } else {
          showAlert('계정 삭제 실패: ' + (err.message || '알 수 없는 오류'));
        }
      }
    });
  };

  const handlePortOnePayment = async (planName: string, priceAmount: number, channelKey: string, providerType: 'eximbay_card' | 'eximbay_alipay' | 'kakaopay') => {
    if (!agreePayPolicy) {
      showAlert(lang === 'ko' ? "결제 및 정기 자동 결제 약관에 동의해 주세요." : "Please agree to the payment policy terms.");
      return;
    }

    if (!currentUser) {
      showAlert(t('loginRequired'));
      setIsAuthModalOpen(true);
      return;
    }

    if (typeof window === 'undefined' || !window.PortOne) {
      showAlert("PortOne module failed to load.");
      return;
    }

    try {
      const paymentId = `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      const paymentRequest: any = {
        storeId: PORTONE_STORE_ID,
        channelKey: channelKey,
        paymentId: paymentId,
        orderName: `YomiYomi ${planName} Premium`,
        redirectUrl: window.location.origin, 
        customer: {
          fullName: currentUser.name || "User",
          email: currentUser.email || "user@example.com",
        },
      };

      if (providerType === 'kakaopay') {
        paymentRequest.currency = "CURRENCY_KRW";
        paymentRequest.totalAmount = await convertUsdToKrw(priceAmount);
        paymentRequest.payMethod = "EASY_PAY";
      } else {
        const usdCents = Math.round(priceAmount * 100);
        paymentRequest.currency = "CURRENCY_USD";
        paymentRequest.totalAmount = usdCents;

        if (providerType === 'eximbay_card') {
          paymentRequest.payMethod = "CARD";
        } else if (providerType === 'eximbay_alipay') {
          paymentRequest.payMethod = "EASY_PAY";
          paymentRequest.easyPay = { easyPayProvider: "ALIPAY" };
        }

        paymentRequest.products = [
          {
            id: `plan-${planName.replace(/\s+/g, '-').toLowerCase()}`,
            name: `YomiYomi ${planName} Premium`,
            amount: usdCents,
            quantity: 1,
          }
        ];

        const bypassProduct = [
          {
            name: `YomiYomi ${planName} Premium`,
            quantity: "1",
            amount: String(usdCents),
            unitPrice: String(usdCents),
            link: window.location.origin
          }
        ];

        paymentRequest.bypass = {
          eximbay_v2: {
            product: bypassProduct
          },
          eximbay: {
            product: bypassProduct
          }
        };
      }

      sessionStorage.setItem('pendingPlanName', planName);

      const response = await window.PortOne.requestPayment(paymentRequest);

      if (response && response.code != null) {
        showAlert(`Payment failed: ${response.message || 'Cancelled or failed authorization.'}`);
        return;
      }

      const firebaseUser = auth.currentUser;
      const idToken = await firebaseUser?.getIdToken();

      const verifyRes = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          paymentId: paymentId,
          planName: planName,
          userId: currentUser.id
        })
      });
      
      if (!verifyRes.ok) {
        throw new Error(`API 검증 서버 연동 에러 (${verifyRes.status})`);
      }

      const verifyData = await verifyRes.json();

      if (!verifyData.success) {
        showAlert(`결제 검증 실패: ${verifyData.message || '검증에 실패했습니다.'}`);
        return;
      }

      setCurrentUser((prev) => prev ? {
        ...prev,
        isSubscribed: true,
        subscriptionPlan: planName
      } : null);

      setIsPricingModalOpen(false);
      setSelectedPlanForPay(null);
      setAgreePayPolicy(false);
      showAlert(`🎉 ${planName}${t('subscribeSuccessPost')}`);

    } catch (error: any) {
      console.error("PortOne Payment Error:", error);
      showAlert("Payment process error: " + (error.message || JSON.stringify(error)));
    }
  };

  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showAlert(t('imageOnlyAlert'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_SIZE = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          
          const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const dataUrl = canvas.toDataURL(mimeType, 0.85);
          const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');

          setSelectedImage({
            file,
            preview: dataUrl,
            mimeType: mimeType,
            data: base64Data
          });
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) processImageFile(file);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  const toggleSpeech = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      showAlert('TTS Speech synthesis is not supported in this browser.');
      return;
    }

    if (speakingText === text) {
      window.speechSynthesis.cancel();
      setSpeakingText(null);
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.9;

    utterance.onend = () => setSpeakingText(null);
    utterance.onerror = () => setSpeakingText(null);

    setSpeakingText(text);
    window.speechSynthesis.speak(utterance);
  };

  const handleAnalyze = async () => {
    if (!currentUser) {
      showAlert(t('loginGateMsg'));
      setIsAuthModalOpen(true);
      return;
    }

    if (!inputText.trim() && !selectedImage) return;
    if (isAnalyzing || isCoolingDown) return;

    setIsAnalyzing(true);
    setIsCoolingDown(true);
    setErrorMessage('');
    setAnalysisResult(null);

    try {
      const imagePayload = selectedImage ? { mimeType: selectedImage.mimeType, data: selectedImage.data } : undefined;
      const result = await analyzeJapanese(inputText, lang, imagePayload);
      setAnalysisResult(result);
      
      recordFeatureUsage();

    } catch (error: any) {
      if (error.message === "DAILY_LIMIT_EXCEEDED") {
        showAlert(t('dailyLimitReached'));
        setIsPricingModalOpen(true);
      } else if (error.message === "FUP_LIMIT_EXCEEDED") {
        setErrorMessage("⚠️ " + (lang === 'ko' ? "일일 최대 분석 제공량을 초과했습니다. 내일 다시 이용해 주세요." : "Daily usage limit exceeded. Please try again tomorrow."));
      } else if (error.message === "RATE_LIMIT_EXCEEDED") {
        setErrorMessage("⚠️ Too many requests. Please wait a moment.");
      } else if (error.message === "JAPANESE_ONLY") {
        setErrorMessage("⚠️ Only Japanese sentences or images with Japanese text can be analyzed.");
      } else if (error.message === "UNAUTHORIZED") {
        setErrorMessage("⚠️ Session expired. Please log in again.");
      } else {
        setErrorMessage(`⚠️ ${error.message || 'An error occurred during analysis.'}`);
      }
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => {
        setIsCoolingDown(false);
      }, 3000);
    }
  };

  const handleAddCardToDeck = (word: WordInfo) => {
    if (!word) return;

    const currentDeckExists = (decks || []).some(d => String(d.id) === String(selectedDeckId));
    const targetDeckId = currentDeckExists ? selectedDeckId : (decks[0]?.id || 'default');

    const cardWithId: WordInfo = {
      id: String(Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
      word: String(word.word || '').trim(),
      reading: String(word.reading || '').trim(),
      partOfSpeech: String(word.partOfSpeech || '단어').trim(),
      meaning: word.meaning || '',
      jlpt: String(word.jlpt || '').trim()
    };

    if (!cardWithId.word) return;

    let added = false;
    const newDecks = (decks || []).map(deck => {
      if (String(deck.id) === String(targetDeckId)) {
        const currentCards = deck.cards || [];
        const isDuplicate = currentCards.some(c => c && c.word === cardWithId.word && c.reading === cardWithId.reading);
        if (isDuplicate) {
          showAlert(t('duplicateWordMsg'));
          return deck;
        }
        added = true;
        return { ...deck, cards: [...currentCards, cardWithId] };
      }
      return deck;
    });

    if (added) {
      saveDecks(newDecks);
    }
  };

  const handleAddKanjiToDeck = (k: KanjiInfo) => {
    handleAddCardToDeck({
      word: k.kanji,
      reading: k.readings,
      partOfSpeech: '한자',
      meaning: k.meaning,
      jlpt: '한자'
    });
  };

  const handleAddGrammarToDeck = (g: GrammarInfo) => {
    handleAddCardToDeck({
      word: g.grammar,
      reading: '문법',
      partOfSpeech: '문법',
      meaning: g.explanation,
      jlpt: '문법'
    });
  };

  const handleCreateDeck = () => {
    setNewDeckInputName('');
    setIsNewDeckModalOpen(true);
  };

  const confirmCreateDeck = () => {
    if (!newDeckInputName.trim()) return;
    const newDeck: Deck = {
      id: String(Date.now()),
      name: newDeckInputName.trim(),
      cards: [],
      createdAt: new Date().toISOString()
    };
    const updated = [...decks, newDeck];
    saveDecks(updated);
    setSelectedDeckId(newDeck.id);
    setIsNewDeckModalOpen(false);
  };

  const handleDeleteCard = (deckId: string, cardId: string, cardWord?: string) => {
    const targetDeck = decks.find(d => String(d.id) === String(deckId)) || decks.find(d => String(d.id) === String(selectedDeckId)) || decks[0];
    if (!targetDeck) return;

    const updated = (decks || []).map(d => {
      if (String(d.id) === String(targetDeck.id)) {
        const currentCards = d.cards || [];
        const filtered = currentCards.filter(c => {
          if (cardId && c.id && String(c.id) === String(cardId)) return false;
          if (cardWord && c.word === cardWord) return false;
          return true;
        });
        return { ...d, cards: filtered };
      }
      return d;
    });
    saveDecks(updated);
  };

  const openDeleteModal = (deckId: string, deckName: string) => {
    if (decks.length <= 1) {
      showAlert(t('alertNoDeck'));
      return;
    }
    setDeleteModalState({
      isOpen: true,
      deckId: String(deckId),
      deckName,
      inputName: ''
    });
  };

  const confirmDeleteDeck = () => {
    if (deleteModalState.inputName.trim() !== deleteModalState.deckName.trim()) {
      showAlert(t('deckNameMismatch'));
      return;
    }

    const updated = decks.filter(d => String(d.id) !== String(deleteModalState.deckId));
    saveDecks(updated);
    if (String(selectedDeckId) === String(deleteModalState.deckId)) {
      setSelectedDeckId(updated[0] ? updated[0].id : 'default');
    }

    setDeleteModalState({ isOpen: false, deckId: '', deckName: '', inputName: '' });
  };

  const handleExportAnki = () => {
    const currentDeck = decks.find(d => String(d.id) === String(selectedDeckId));
    if (!currentDeck || !currentDeck.cards || currentDeck.cards.length === 0) {
      showAlert(t('noSavedWords'));
      return;
    }

    recordFeatureUsage();

    let ankiContent = '#separator:tab\n#html:true\n#tags:YomiYomi Anki\n';
    currentDeck.cards.forEach(c => {
      const front = `${c.word} <br><small style="color:#e11d48;">[${c.reading}]</small>`;
      const posText = getLocalizedPOS(c.partOfSpeech, lang);
      const meaningText = getLocalizedText(c.meaning, lang);
      const back = `${meaningText} <br><small style="color:#64748b;">(${posText} ${c.jlpt ? '• ' + c.jlpt : ''})</small>`;
      ankiContent += `${front}\t${back}\n`;
    });

    const blob = new Blob([ankiContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${currentDeck.name}_Anki.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintTestSheet = () => {
    if (!currentUser?.isSubscribed) {
      showAlert(t('pdfLockedMsg'));
      setIsPricingModalOpen(true);
      return;
    }

    const currentDeck = decks.find(d => String(d.id) === String(selectedDeckId));
    if (!currentDeck || !currentDeck.cards || currentDeck.cards.length === 0) {
      showAlert(t('noSavedWords'));
      return;
    }

    recordFeatureUsage();

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const escapeHTML = (str: string) => {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const safeDeckName = escapeHTML(currentDeck.name);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${safeDeckName} - Vocabulary Test</title>
        <style>
          body { font-family: 'Noto Sans KR', sans-serif; padding: 30px; color: #333; }
          h1 { text-align: center; border-bottom: 2px solid #e11d48; padding-bottom: 10px; font-size: 20px; }
          .meta { text-align: right; font-size: 12px; margin-bottom: 20px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ccc; padding: 10px; text-align: left; font-size: 13px; }
          th { background-color: #f8fafc; font-weight: bold; }
          .no { width: 30px; text-align: center; }
          .word { font-size: 16px; font-weight: bold; width: 30%; }
          .reading { color: #e11d48; font-size: 12px; width: 25%; }
          .answer { width: 35%; background-color: #ffffff; }
        </style>
      </head>
      <body>
        <h1>🌸 ${safeDeckName} - Vocabulary Test Sheet</h1>
        <div class="meta">Date: _______________ | Name: _______________ | Score: _______ / ${currentDeck.cards.length}</div>
        <table>
          <thead>
            <tr>
              <th class="no">#</th>
              <th>Word</th>
              <th>Reading (Yomigana)</th>
              <th>Answer (Meaning)</th>
            </tr>
          </thead>
          <tbody>
            ${currentDeck.cards.map((c, i) => `
              <tr>
                <td class="no">${i + 1}</td>
                <td class="word">${escapeHTML(c.word || '')}</td>
                <td class="reading">[${escapeHTML(c.reading || '')}]</td>
                <td class="answer"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const startQuiz = () => {
    const selectedDecks = decks.filter(d => quizSelectedDeckIds.includes(d.id));
    const allCards = selectedDecks.flatMap(d => d.cards || []);

    if (allCards.length < 3) {
      showAlert(t('quizMinCardsAlert'));
      return;
    }

    recordFeatureUsage();

    const shuffledCards = [...allCards].sort(() => Math.random() - 0.5);
    setupQuizQuestion(shuffledCards, 0, 0);
  };

  const setupQuizQuestion = (cards: WordInfo[], index: number, score: number) => {
    const currentCard = cards[index];
    const currentCardMeaning = getLocalizedText(currentCard.meaning, lang);
    const otherMeanings = Array.from(new Set(
      decks.flatMap(d => d.cards || [])
        .map(c => getLocalizedText(c.meaning, lang))
        .filter(m => m !== currentCardMeaning)
    ));

    while (otherMeanings.length < 2) {
      otherMeanings.push('Option ' + (otherMeanings.length + 1));
    }

    const shuffledOther = otherMeanings.sort(() => Math.random() - 0.5).slice(0, 2);
    const options = [currentCardMeaning, ...shuffledOther].sort(() => Math.random() - 0.5);

    setQuizState({
      currentCardIndex: index,
      quizCards: cards,
      options,
      score,
      isFinished: false,
      selectedAnswer: null
    });
  };

  const handleAnswerQuiz = (selectedOption: string) => {
    if (!quizState || quizState.selectedAnswer !== null) return;

    const currentCard = quizState.quizCards[quizState.currentCardIndex];
    const currentMeaning = getLocalizedText(currentCard.meaning, lang);
    const isCorrect = selectedOption === currentMeaning;
    const newScore = isCorrect ? quizState.score + 1 : quizState.score;

    setQuizState(prev => prev ? { ...prev, selectedAnswer: selectedOption, score: newScore } : null);

    setTimeout(() => {
      if (quizState.currentCardIndex + 1 < quizState.quizCards.length) {
        setupQuizQuestion(quizState.quizCards, quizState.currentCardIndex + 1, newScore);
      } else {
        setQuizState(prev => prev ? { ...prev, isFinished: true } : null);
      }
    }, 1200);
  };

  const currentActiveDeck = decks.find(d => String(d.id) === String(selectedDeckId)) || decks[0] || DEFAULT_DECK_DATA;

  const filteredCards = (currentActiveDeck.cards || []).filter(c => 
    (c.word || '').toLowerCase().includes(searchKeyword.toLowerCase()) ||
    (c.reading || '').toLowerCase().includes(searchKeyword.toLowerCase()) ||
    getLocalizedText(c.meaning, lang).toLowerCase().includes(searchKeyword.toLowerCase())
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const isTodayAnalyze = currentUser?.lastAnalyzeDate === todayStr;
  
  const isPremiumUser = currentUser?.isSubscribed || false;
  const limitCount = isPremiumUser ? 300 : 3;
  const currentUsage = isTodayAnalyze ? (currentUser?.dailyAnalyzeCount || 0) : 0;
  const remainingCount = Math.max(0, limitCount - currentUsage);

  const daysLeft = calculateDaysLeft(currentUser?.subscriptionEndDate);

  const currentLangObj = LANG_OPTIONS.find(l => l.code === lang) || LANG_OPTIONS[0];

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-slate-800 font-sans border-t-4 border-rose-600 relative pb-20 flex flex-col justify-between">
      <div>
        <header className="bg-white border-b border-rose-100 shadow-2xs sticky top-0 z-40 h-14">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 h-full flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="hidden lg:flex space-x-1 bg-slate-100 p-0.5 rounded-lg">
                <button
                  onClick={() => setActiveTab('analyze')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${activeTab === 'analyze' ? 'bg-white text-rose-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t('analyzeTab')}
                </button>
                <button
                  onClick={() => setActiveTab('decks')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${activeTab === 'decks' ? 'bg-white text-rose-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t('decksTab')}
                </button>
                <button
                  onClick={() => setActiveTab('quiz')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${activeTab === 'quiz' ? 'bg-white text-rose-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t('quizTab')}
                </button>
              </div>
            </div>

            {/* 🌸 로고 🌸 */}
            <div className="flex items-center justify-center">
              <button 
                onClick={() => setActiveTab('analyze')}
                className="flex items-center space-x-1.5 sm:space-x-2 focus:outline-none group cursor-pointer"
              >
                <span className="text-xl sm:text-2xl group-hover:scale-110 transition select-none">🌸</span>
                <h1 className="text-lg sm:text-2xl font-black tracking-tight text-slate-900 group-hover:text-rose-600 transition flex items-center gap-1.5 app-logo-text">
                  <span>YomiYomi</span>
                  {currentUser?.isSubscribed && (
                    <span className="font-black text-rose-600 text-lg sm:text-2xl ml-0.5">
                      Premium
                    </span>
                  )}
                </h1>
                <span className="text-xl sm:text-2xl group-hover:scale-110 transition select-none">🌸</span>
              </button>
            </div>

            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <button
                onClick={() => setIsPricingModalOpen(true)}
                className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white font-bold text-[11px] sm:text-xs rounded-xl shadow-2xs transition flex items-center gap-1 active:scale-95 cursor-pointer shrink-0"
              >
                <span>👑</span>
                <span className="hidden sm:inline">{t('membership')}</span>
              </button>

              {/* 🌐 상단 통합 언어 선택 드롭다운 (얇은 글씨체 적용) 🌐 */}
              <div className="relative inline-block text-left" ref={headerLangRef}>
                <button
                  type="button"
                  onClick={() => setIsHeaderLangOpen(!isHeaderLangOpen)}
                  className="px-2 py-1 sm:px-2.5 sm:py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl flex items-center gap-1.5 text-xs font-normal text-slate-700 transition cursor-pointer shrink-0"
                >
                  <img src={currentLangObj.flagUrl} alt={currentLangObj.label} className="w-4 h-3 object-cover rounded-2xs" />
                  <span className="hidden sm:inline text-[11px] font-normal">{currentLangObj.label}</span>
                  <span className="text-[9px] text-slate-400">▾</span>
                </button>

                {isHeaderLangOpen && (
                  <div className="absolute right-0 mt-1.5 w-32 bg-white border border-rose-100 rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 z-50 py-1">
                    {LANG_OPTIONS.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => {
                          handleLanguageChange(item.code);
                          setIsHeaderLangOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-rose-50 transition ${
                          lang === item.code ? 'text-rose-600 font-medium bg-rose-50/50' : 'text-slate-700 font-normal'
                        }`}
                      >
                        <img src={item.flagUrl} alt={item.label} className="w-4 h-3 object-cover rounded-2xs" />
                        <span className={lang === item.code ? 'font-medium' : 'font-normal'}>{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {currentUser ? (
                <div className="flex items-center pl-1 border-l border-slate-200">
                  <button
                    onClick={() => {
                      setAuthEditName(currentUser.name || '');
                      setIsSettingsModalOpen(true);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-slate-600 hover:text-rose-600 text-xs font-normal rounded-lg hover:bg-rose-50 transition cursor-pointer"
                    title={t('settingsTitle')}
                  >
                    <span>⚙️</span>
                    <span className="hidden sm:inline font-normal">{t('settingsTitle')}</span>
                  </button>

                  <button
                    onClick={handleLogout}
                    className="hidden md:inline ml-1 px-2 py-1 text-[11px] font-normal text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                  >
                    {t('logout')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); }}
                  className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] sm:text-xs rounded-xl shadow-2xs transition cursor-pointer shrink-0"
                >
                  {t('login')}
                </button>
              )}

              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-1 text-slate-600 hover:text-slate-900 text-lg focus:outline-none cursor-pointer shrink-0"
              >
                {isMobileMenuOpen ? '✕' : '☰'}
              </button>
            </div>
          </div>

          {isMobileMenuOpen && (
            <div className="lg:hidden bg-white border-b border-rose-100 px-4 py-3 space-y-2 shadow-md">
              <button
                onClick={() => { setActiveTab('analyze'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer ${activeTab === 'analyze' ? 'bg-rose-50 text-rose-600' : 'text-slate-700'}`}
              >
                📖 {t('analyzeTab')}
              </button>
              <button
                onClick={() => { setActiveTab('decks'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer ${activeTab === 'decks' ? 'bg-rose-50 text-rose-600' : 'text-slate-700'}`}
              >
                🗂️ {t('decksTab')}
              </button>
              <button
                onClick={() => { setActiveTab('quiz'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer ${activeTab === 'quiz' ? 'bg-rose-50 text-rose-600' : 'text-slate-700'}`}
              >
                🎯 {t('quizTab')}
              </button>
              
              <div className="pt-2 border-t border-slate-100">
                {currentUser ? (
                  <div className="flex justify-between items-center px-3 py-2 bg-slate-50 rounded-lg">
                    <span className="text-xs font-bold text-slate-700">{currentUser.name}</span>
                    <button onClick={handleLogout} className="text-xs text-rose-600 font-bold cursor-pointer">{t('logout')}</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setIsAuthModalOpen(true); setIsMobileMenuOpen(false); }}
                    className="w-full py-2 bg-rose-600 text-white font-bold rounded-lg text-xs cursor-pointer"
                  >
                    {t('loginSignup')}
                  </button>
                )}
              </div>
            </div>
          )}
        </header>

        <button
          onClick={() => setIsLeftSidebarOpenMobile(!isLeftSidebarOpenMobile)}
          className="lg:hidden fixed bottom-5 left-5 z-50 bg-rose-600 hover:bg-rose-700 text-white p-3 rounded-full shadow-lg border-2 border-white flex items-center space-x-1.5 cursor-pointer"
        >
          <span className="text-sm">🗂️</span>
          <span className="text-xs font-bold pr-1">{t('deckSidebarTitle')} ({decks.reduce((acc, d) => acc + (d.cards ? d.cards.length : 0), 0)})</span>
        </button>

        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          <aside 
            className={`
              lg:col-span-3
              bg-white border border-rose-100 shadow-xs rounded-2xl p-3
              ${isLeftSidebarOpenMobile ? 'fixed inset-x-4 top-16 z-50 max-h-[80vh] shadow-2xl' : 'hidden lg:flex'}
              flex flex-col h-fit self-start sticky top-16
            `}
          >
            <div className="flex justify-between items-center pb-2 mb-2 border-b border-rose-50 shrink-0">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1">
                <span>🗂️</span> {t('deckSidebarTitle')}
              </h3>
            </div>

            <div className="space-y-1.5 mb-2 shrink-0">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-500 font-medium">{t('deckLabel')}</span>
                <button
                  onClick={handleCreateDeck}
                  className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                >
                  {t('newDeck')}
                </button>
              </div>
              <select
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg p-1.5 bg-slate-50 font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-rose-400 cursor-pointer"
              >
                {decks.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({(d.cards || []).length})</option>
                ))}
              </select>

              <div className="pt-1">
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:border-rose-300"
                />
              </div>
            </div>

            <SidebarWordCarousel 
              cards={filteredCards} 
              speakingText={speakingText} 
              toggleSpeech={toggleSpeech} 
              handleDeleteCard={handleDeleteCard} 
              selectedDeckId={selectedDeckId}
              lang={lang}
              t={t}
            />
          </aside>

          <main className="lg:col-span-6 w-full">
            {activeTab === 'analyze' && (
              <div className="space-y-4">
                <div className="bg-[#FAF8F5] p-4 sm:p-5 rounded-2xl shadow-xs border border-rose-100">
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span>📝</span> {t('inputTitle')}
                    </span>
                    
                    <div className="flex items-center space-x-2">
                      {!isPremiumUser && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-bold border bg-sky-50 text-sky-700 border-sky-200">
                          {lang === 'ko' ? `무료 분석 ${remainingCount}/3회` : `Free: ${remainingCount}/3`}
                        </span>
                      )}
                      
                      <span className={`text-[11px] font-semibold ${inputText.length >= MAX_TEXT_LENGTH ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                        {inputText.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()}{t('charCount')}
                      </span>
                    </div>
                  </label>

                  <div 
                    onPaste={handlePaste}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-xl transition ${isDragging ? 'border-rose-500 bg-rose-50' : 'border-slate-200 bg-[#FAF8F5]'}`}
                  >
                    <textarea
                      value={inputText}
                      onChange={(e) => {
                        if (e.target.value.length <= MAX_TEXT_LENGTH) {
                          setInputText(e.target.value);
                        }
                      }}
                      maxLength={MAX_TEXT_LENGTH}
                      placeholder={t('inputPlaceholder')}
                      className="w-full h-32 p-3 bg-transparent outline-none resize-none text-sm sm:text-base text-slate-800"
                    />

                    <div className="p-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-white bg-opacity-60 rounded-b-xl">
                      <div className="flex items-center space-x-2">
                        <label className="cursor-pointer px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1">
                          <span>{t('selectImage')}</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                processImageFile(e.target.files[0]);
                              }
                            }}
                          />
                        </label>
                        <span className="text-[10px] sm:text-[11px] text-slate-400">{t('dragNotice')}</span>
                      </div>

                      {selectedImage && (
                        <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                          <img src={selectedImage.preview} alt="Preview" className="w-5 h-5 object-cover rounded" />
                          <span className="text-xs text-rose-700 font-medium truncate max-w-[100px]">{selectedImage.file.name}</span>
                          <button 
                            onClick={() => setSelectedImage(null)}
                            className="text-xs text-rose-500 hover:text-rose-800 font-bold ml-1 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end items-center">
                    <button
                      onClick={handleAnalyze}
                      disabled={isAnalyzing || isCoolingDown || (!inputText.trim() && !selectedImage)}
                      className="px-6 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-2xs transition text-xs flex items-center space-x-1.5 cursor-pointer"
                    >
                      {isAnalyzing ? (
                        <>
                          <span className="animate-spin">🌸</span>
                          <span>{t('analyzing')}</span>
                        </>
                      ) : isCoolingDown ? (
                        <span>{t('cooldown')}</span>
                      ) : (
                        <span>{t('analyzeBtn')}</span>
                      )}
                    </button>
                  </div>
                </div>

                {isAnalyzing && (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 animate-pulse space-y-2">
                    <div className="flex items-center space-x-2 text-amber-900 font-semibold text-xs">
                      <span className="animate-spin">🌸</span>
                      <span>{t('analyzing')}</span>
                    </div>
                  </div>
                )}

                {errorMessage && (
                  <div className="p-3 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200 flex items-center justify-between text-xs font-medium">
                    <span>{errorMessage}</span>
                    <button onClick={() => setErrorMessage('')} className="font-bold hover:text-rose-900 cursor-pointer">Close</button>
                  </div>
                )}

                {analysisResult && (
                  <div className="space-y-4">
                    <div className="bg-white p-5 rounded-2xl shadow-xs border border-rose-100">
                      <div className="flex flex-wrap justify-between items-center mb-3 pb-2 border-b border-slate-100 gap-2">
                        <div className="flex items-center space-x-2">
                          <h3 className="text-xs font-bold text-slate-500 flex items-center gap-1">
                            <span>🎏</span> {t('noteTitle')}
                          </h3>
                          <button
                            onClick={() => toggleSpeech(inputText)}
                            className={`p-1.5 text-xs font-bold rounded-md transition flex items-center justify-center cursor-pointer ${
                              speakingText === inputText
                                ? 'bg-rose-600 text-white hover:bg-rose-700 border border-rose-700'
                                : 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                            }`}
                          >
                            <span>{speakingText === inputText ? '⏹️' : '🔊'}</span>
                          </button>
                        </div>
                        
                        <div className="flex flex-wrap items-center space-x-1.5 text-xs bg-slate-50 p-1 rounded-lg border border-slate-200 gap-y-1">
                          <button
                            onClick={() => setFontFamily(fontFamily === 'serif' ? 'sans' : 'serif')}
                            className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            {fontFamily === 'serif' ? t('fontSerif') : t('fontSans')}
                          </button>

                          <div className="flex items-center space-x-1 border-l border-slate-200 pl-1.5">
                            <button
                              onClick={() => setFontSize(prev => Math.max(14, prev - 2))}
                              className="px-1.5 py-0.5 bg-white border rounded text-slate-700 font-bold hover:bg-slate-100 text-[10px] cursor-pointer"
                            >
                              A-
                            </button>
                            <span className="text-[10px] font-semibold text-slate-500 w-6 text-center">{fontSize}px</span>
                            <button
                              onClick={() => setFontSize(prev => Math.min(28, prev + 2))}
                              className="px-1.5 py-0.5 bg-white border rounded text-slate-700 font-bold hover:bg-slate-100 text-[10px] cursor-pointer"
                            >
                              A+
                            </button>
                          </div>

                          <div className="flex items-center space-x-1 border-l border-slate-200 pl-1.5">
                            <button
                              onClick={() => setReadingDisplayMode(readingDisplayMode === 'off' ? 'furigana' : 'off')}
                              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition shadow-2xs cursor-pointer ${
                                readingDisplayMode !== 'off'
                                  ? 'bg-rose-600 text-white hover:bg-rose-700' 
                                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                              }`}
                            >
                              요미가나 {readingDisplayMode !== 'off' ? 'On' : 'Off'}
                            </button>
                            <button
                              onClick={() => setShowTranslation(!showTranslation)}
                              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition shadow-2xs cursor-pointer ${
                                showTranslation
                                  ? 'bg-sky-600 text-white hover:bg-sky-700' 
                                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                              }`}
                            >
                              번역 {showTranslation ? 'On' : 'Off'}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div 
                        style={{
                          fontSize: `${fontSize}px`,
                          fontFamily: fontFamily === 'serif' ? '"Shippori Mincho", "Noto Serif JP", serif' : 'sans-serif'
                        }}
                        className="note-content-area p-4 bg-[#FAF8F5] rounded-xl border border-amber-100 space-y-2.5"
                      >
                        {analysisResult.rubySentences && analysisResult.rubySentences.length > 0 ? (
                          analysisResult.rubySentences.map((rawSentence, sIdx) => {
                            const sentenceStr = typeof rawSentence === 'string' ? rawSentence : JSON.stringify(rawSentence);
                            const tokens = parseRubySentence(sentenceStr);

                            return (
                              <p key={sIdx} className="leading-relaxed">
                                {tokens.map((token, tIdx) => {
                                  if (!token.reading) {
                                    return <span key={tIdx}>{token.text}</span>;
                                  }

                                  if (readingDisplayMode === 'furigana' || readingDisplayMode === 'yomigana') {
                                    return (
                                      <ruby key={tIdx} className="inline-ruby mx-[1px]">
                                        {token.text}
                                        <rt className="text-rose-600 font-bold text-[0.65em]">{token.reading}</rt>
                                      </ruby>
                                    );
                                  } else {
                                    return <span key={tIdx}>{token.text}</span>;
                                  }
                                })}
                              </p>
                            );
                          })
                        ) : (
                          <p className="text-slate-400 text-xs">No analyzed sentences found.</p>
                        )}
                        
                        {showTranslation && analysisResult.translatedText && (
                          <div className="mt-4 pt-3 border-t border-amber-200/50 text-sm font-bold text-slate-700">
                            {analysisResult.translatedText}
                          </div>
                        )}
                      </div>
                    </div>

                    {analysisResult.wordList && analysisResult.wordList.length > 0 && (
                      <div className="bg-white p-5 rounded-2xl shadow-xs border border-rose-100 space-y-3">
                        <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-100">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-slate-500 font-medium">{t('targetDeck')}</span>
                            <select
                              value={selectedDeckId}
                              onChange={(e) => setSelectedDeckId(e.target.value)}
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-rose-400 cursor-pointer"
                            >
                              {decks.map(d => (
                                <option key={d.id} value={d.id}>{d.name} ({(d.cards || []).length})</option>
                              ))}
                            </select>
                          </div>

                          <button
                            onClick={() => setHideMeanings(!hideMeanings)}
                            className={`text-[10px] px-2 py-1 rounded-md font-bold transition cursor-pointer ${hideMeanings ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          >
                            {hideMeanings ? t('showMeaning') : t('hideMeaning')}
                          </button>
                        </div>

                        <CardCarousel
                          items={analysisResult.wordList}
                          title={t('wordCardTitle')}
                          icon="📌"
                          renderItem={(word) => (
                            <div className="text-center w-full max-w-sm px-2">
                              <div className="flex items-center justify-center space-x-2">
                                <span className="font-bold text-lg text-slate-900">{word.word}</span>
                                <span className="text-xs text-rose-600 font-semibold">[{word.reading}]</span>
                                <button
                                  onClick={() => toggleSpeech(word.word)}
                                  className={`text-xs p-1 rounded transition cursor-pointer ${
                                    speakingText === word.word
                                      ? 'bg-rose-600 text-white font-bold border border-rose-700'
                                      : 'text-slate-400 hover:text-amber-600'
                                  }`}
                                >
                                  {speakingText === word.word ? '⏹️' : '🔊'}
                                </button>
                                {word.jlpt && <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">{word.jlpt}</span>}
                              </div>
                              <p className="text-xs text-slate-600 mt-1.5">
                                {t('partOfSpeech')}: <span className="font-semibold text-slate-700">{getLocalizedPOS(word.partOfSpeech, lang)}</span>
                              </p>
                              <p className="text-xs mt-1">
                                {t('meaning')}: {' '}
                                <span className={hideMeanings ? 'bg-slate-800 text-slate-800 select-none rounded px-2' : 'font-bold text-slate-800'}>
                                  {getLocalizedText(word.meaning, lang)}
                                </span>
                              </p>
                              <button
                                onClick={() => handleAddCardToDeck(word)}
                                className="mt-2.5 px-3 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold rounded-lg transition shadow-2xs active:scale-95 cursor-pointer"
                              >
                                {t('addWordBtn')}
                              </button>
                            </div>
                          )}
                        />
                      </div>
                    )}

                    {analysisResult.kanjiList && analysisResult.kanjiList.length > 0 && (
                      <div className="bg-white p-5 rounded-2xl shadow-xs border border-rose-100 space-y-3">
                        <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-100">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-slate-500 font-medium">{t('targetDeck')}</span>
                            <select
                              value={selectedDeckId}
                              onChange={(e) => setSelectedDeckId(e.target.value)}
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-rose-400 cursor-pointer"
                            >
                              {decks.map(d => (
                                <option key={d.id} value={d.id}>{d.name} ({(d.cards || []).length})</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <CardCarousel
                          items={analysisResult.kanjiList}
                          title={t('kanjiCardTitle')}
                          icon="🏮"
                          renderItem={(k) => (
                            <div className="text-center w-full max-w-sm px-2">
                              <div className="flex justify-center items-center gap-1.5 mb-1">
                                <span className="text-2xl font-bold text-slate-800">{k.kanji}</span>
                                <button
                                  onClick={() => toggleSpeech(k.kanji)}
                                  className={`text-xs p-1 rounded transition cursor-pointer ${
                                    speakingText === k.kanji
                                      ? 'bg-rose-600 text-white font-bold border border-rose-700'
                                      : 'text-slate-400 hover:text-amber-600'
                                  }`}
                                >
                                  {speakingText === k.kanji ? '⏹️' : '🔊'}
                                </button>
                              </div>
                              <span className="text-xs text-rose-600 font-bold block">{k.readings}</span>
                              <span className="text-xs block mt-1">
                                {t('meaning')}: {' '}
                                <span className={hideMeanings ? 'bg-slate-800 text-slate-800 select-none rounded px-2' : 'font-semibold text-slate-700'}>
                                  {getLocalizedText(k.meaning, lang)}
                                </span>
                              </span>
                              <button
                                onClick={() => handleAddKanjiToDeck(k)}
                                className="mt-2.5 px-3 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold rounded-lg transition shadow-2xs active:scale-95 cursor-pointer"
                              >
                                {t('addWordBtn')}
                              </button>
                            </div>
                          )}
                        />
                      </div>
                    )}

                    {analysisResult.grammarList && analysisResult.grammarList.length > 0 && (
                      <div className="bg-white p-5 rounded-2xl shadow-xs border border-rose-100 space-y-3">
                        <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-100">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-slate-500 font-medium">{t('targetDeck')}</span>
                            <select
                              value={selectedDeckId}
                              onChange={(e) => setSelectedDeckId(e.target.value)}
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-rose-400 cursor-pointer"
                            >
                              {decks.map(d => (
                                <option key={d.id} value={d.id}>{d.name} ({(d.cards || []).length})</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <CardCarousel
                          items={analysisResult.grammarList}
                          title={t('grammarCardTitle')}
                          icon="⛩️"
                          renderItem={(g) => (
                            <div className="text-center w-full max-w-md px-2">
                              <span className="inline-block px-2.5 py-1 bg-rose-100 text-rose-800 font-bold text-xs rounded-md mb-1.5">
                                {g.grammar}
                              </span>
                              <p className="text-xs leading-relaxed font-medium mb-2">
                                <span className={hideMeanings ? 'bg-slate-800 text-slate-800 select-none rounded px-2' : 'text-slate-700'}>
                                  {getLocalizedText(g.explanation, lang)}
                                </span>
                              </p>
                              <button
                                onClick={() => handleAddGrammarToDeck(g)}
                                className="px-3 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold rounded-lg transition shadow-2xs active:scale-95 cursor-pointer"
                              >
                                {t('addWordBtn')}
                              </button>
                            </div>
                          )}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'decks' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                    <span>🗂️</span> {t('allDeckTitle')}
                  </h2>
                  <button
                    onClick={handleCreateDeck}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer"
                  >
                    {t('newDeck')}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {decks.map(deck => (
                    <div
                      key={deck.id}
                      onClick={() => setSelectedDeckId(deck.id)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition ${selectedDeckId === deck.id ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-100' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <h3 className="font-bold text-slate-800 text-xs sm:text-sm">{deck.name}</h3>
                        {decks.length > 1 && (
                          <button
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              e.preventDefault();
                              openDeleteModal(deck.id, deck.name); 
                            }}
                            className="text-[11px] text-rose-500 hover:text-rose-700 font-bold p-1 bg-rose-50 hover:bg-rose-100 rounded transition cursor-pointer"
                          >
                            {t('delete')}
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">{t('savedWordsLabel')}{(deck.cards || []).length}{t('unitCount')}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-[#FFFFFF] p-4 rounded-2xl shadow-xs border border-rose-100">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-700 font-bold text-xs rounded-md">
                        {currentActiveDeck.name}
                      </span>
                      <span className="text-xs font-bold text-slate-800">{t('wordCardListTitle')}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleExportAnki}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white font-bold text-[11px] rounded-lg transition flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <span>{t('exportAnki')}</span>
                      </button>
                      <button
                        onClick={handlePrintTestSheet}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] rounded-lg transition flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <span>{t('makePdf')}</span>
                      </button>
                    </div>
                  </div>

                  <div className="mb-3">
                    <input
                      type="text"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      placeholder={t('searchPlaceholder')}
                      className="w-full text-xs p-2 border border-slate-200 rounded-xl outline-none bg-slate-50 focus:bg-white focus:border-rose-400"
                    />
                  </div>

                  {filteredCards.length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center">
                      {searchKeyword ? t('noSearchWords') : t('noSavedWords')}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {filteredCards.map(card => (
                        <div key={card.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center">
                          <div>
                            <div className="flex items-baseline space-x-1.5">
                              <span className="font-bold text-xs sm:text-sm text-slate-900">{card.word}</span>
                              <span className="text-[11px] text-rose-600 font-semibold">[{card.reading}]</span>
                              <button
                                onClick={() => toggleSpeech(card.word)}
                                className={`text-[11px] p-0.5 rounded transition cursor-pointer ${
                                  speakingText === card.word
                                    ? 'bg-rose-600 text-white font-bold border border-rose-700'
                                    : 'text-slate-400 hover:text-amber-600'
                                }`}
                              >
                                {speakingText === card.word ? '⏹️' : '🔊'}
                              </button>
                              {card.jlpt && <span className="text-[9px] bg-rose-100 text-rose-700 px-1 py-0.5 rounded font-bold">{card.jlpt}</span>}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">{getLocalizedPOS(card.partOfSpeech, lang)} • {getLocalizedText(card.meaning, lang)}</p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleDeleteCard(selectedDeckId, card.id || '', card.word);
                            }}
                            className="text-[10px] text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 font-bold border border-rose-200 bg-white rounded-md transition cursor-pointer"
                          >
                            {t('delete')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'quiz' && (
              <div className="relative max-w-xl mx-auto bg-white rounded-2xl shadow-xs border border-rose-100 overflow-hidden min-h-[360px]">
                {!currentUser?.isSubscribed ? (
                  <div className="p-6 text-center flex flex-col justify-center items-center space-y-4 bg-gradient-to-b from-slate-900 to-slate-800 text-white min-h-[360px]">
                    <span className="text-5xl animate-bounce">🔒</span>
                    <h3 className="text-lg font-black">{t('quizLockedTitle')}</h3>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-sm">{t('quizLockedDesc')}</p>
                    <button
                      onClick={() => setIsPricingModalOpen(true)}
                      className="mt-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white font-extrabold text-xs rounded-xl shadow-lg transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <span>👑</span>
                      <span>{t('subscribePlan')}</span>
                    </button>
                  </div>
                ) : !quizState ? (
                  <div className="p-5 space-y-4">
                    <div className="text-center space-y-1">
                      <span className="text-3xl block">🎯</span>
                      <h2 className="text-base font-bold text-slate-800">{t('quizTitle')}</h2>
                      <p className="text-xs text-slate-500">{t('quizSelectDesc')}</p>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 max-h-40 overflow-y-auto">
                      {decks.map(deck => {
                        const isChecked = quizSelectedDeckIds.includes(deck.id);
                        return (
                          <label key={deck.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:border-rose-300">
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    if (quizSelectedDeckIds.length > 1) {
                                      setQuizSelectedDeckIds(prev => prev.filter(id => id !== deck.id));
                                    } else {
                                      showAlert(t('alertNoDeck'));
                                    }
                                  } else {
                                    setQuizSelectedDeckIds(prev => [...prev, deck.id]);
                                  }
                                }}
                                className="rounded text-rose-600 focus:ring-rose-400"
                              />
                              <span className="text-xs font-bold text-slate-800">{deck.name}</span>
                            </div>
                            <span className="text-[10px] text-slate-400">{(deck.cards || []).length}{t('unitCount')}</span>
                          </label>
                        );
                      })}
                    </div>

                    <button
                      onClick={startQuiz}
                      className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow transition text-xs cursor-pointer"
                    >
                      {t('quizStartBtn')}
                    </button>
                  </div>
                ) : quizState.isFinished ? (
                  <div className="p-6 text-center space-y-3">
                    <span className="text-4xl block">🎉</span>
                    <h2 className="text-base font-bold text-slate-800">{t('quizCompleteTitle')}</h2>
                    <p className="text-xs text-slate-600">
                      {quizState.quizCards.length} {t('unitCount')} 중 <span className="text-rose-600 font-bold">{quizState.score}</span> {t('quizScoreText')}
                    </p>
                    <button
                      onClick={() => setQuizState(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
                    >
                      {t('quizBackBtn')}
                    </button>
                  </div>
                ) : (
                  <div className="p-5 space-y-5">
                    <div className="flex justify-between items-center text-xs text-slate-400 border-b pb-2">
                      <span>{quizState.currentCardIndex + 1} / {quizState.quizCards.length}</span>
                      <button
                        onClick={() => {
                          showConfirm(t('quizSurrenderConfirm'), () => setQuizState(null));
                        }}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded text-[10px] cursor-pointer"
                      >
                        {t('quizSurrenderBtn')}
                      </button>
                    </div>

                    <div className="text-center py-4 bg-[#FAF8F5] rounded-xl border border-amber-100">
                      <div className="flex justify-center items-center gap-1.5 mb-1">
                        <span className="text-xl font-bold text-slate-900">
                          {quizState.quizCards[quizState.currentCardIndex].word}
                        </span>
                        <button
                          onClick={() => toggleSpeech(quizState.quizCards[quizState.currentCardIndex].word)}
                          className={`text-xs p-1 rounded transition cursor-pointer ${
                            speakingText === quizState.quizCards[quizState.currentCardIndex].word
                              ? 'bg-rose-600 text-white font-bold border border-rose-700'
                              : 'text-slate-400 hover:text-amber-600'
                          }`}
                        >
                          {speakingText === quizState.quizCards[quizState.currentCardIndex].word ? '⏹️' : '🔊'}
                        </button>
                      </div>
                      <span className="text-xs text-rose-600 font-semibold">
                        [{quizState.quizCards[quizState.currentCardIndex].reading}]
                      </span>
                    </div>

                    <div className="space-y-2">
                      {quizState.options.map((option, idx) => {
                        const currentCard = quizState.quizCards[quizState.currentCardIndex];
                        let btnStyle = 'bg-white border-slate-200 hover:border-rose-300 text-slate-700';

                        if (quizState.selectedAnswer !== null) {
                          const currentMeaning = getLocalizedText(currentCard.meaning, lang);
                          if (option === currentMeaning) {
                            btnStyle = 'bg-emerald-500 border-emerald-500 text-white font-bold';
                          } else if (option === quizState.selectedAnswer) {
                            btnStyle = 'bg-rose-500 border-rose-500 text-white font-bold';
                          }
                        }

                        return (
                          <button
                            key={idx}
                            onClick={() => handleAnswerQuiz(option)}
                            disabled={quizState.selectedAnswer !== null}
                            className={`w-full p-3 border rounded-xl text-left text-xs font-medium transition cursor-pointer ${btnStyle}`}
                          >
                            {idx + 1}. {option}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>

          <aside className="hidden lg:flex lg:col-span-3 bg-white border border-rose-100 shadow-xs rounded-2xl p-3 flex-col h-fit sticky top-16 space-y-3">
            <div className="bg-[#FAF8F5] p-2.5 rounded-xl border border-amber-100">
              <div className="flex justify-between items-center mb-2 pb-1 border-b border-amber-200/60">
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <span>🈩</span> {t('gojuonChart')}
                </h3>
                <div className="flex bg-slate-200 p-0.5 rounded text-[9px] font-bold">
                  <button
                    onClick={() => setKanaTab('hiragana')}
                    className={`px-1.5 py-0.5 rounded transition cursor-pointer ${kanaTab === 'hiragana' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600'}`}
                  >
                    {t('hiragana')}
                  </button>
                  <button
                    onClick={() => setKanaTab('katakana')}
                    className={`px-1.5 py-0.5 rounded transition cursor-pointer ${kanaTab === 'katakana' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600'}`}
                  >
                    {t('katakana')}
                  </button>
                </div>
              </div>

              <div className="max-h-32 overflow-y-auto custom-scrollbar pr-0.5 space-y-1 text-center">
                {(kanaTab === 'hiragana' ? HIRAGANA_GRID : KATAKANA_GRID).map((row: string[], rIdx: number) => (
                  <div key={rIdx} className="grid grid-cols-5 gap-0.5">
                    {row.map((char: string, cIdx: number) => (
                      <span 
                        key={cIdx} 
                        onClick={() => toggleSpeech(char)}
                        className="text-[10px] font-semibold bg-white border border-slate-200 rounded py-0.5 cursor-pointer hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 transition"
                      >
                        {char}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col min-h-0">
              <div className="flex justify-between items-center pb-1.5 mb-1.5 border-b border-rose-50 shrink-0">
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <span>🌐</span> {t('recSitesTitle')}
                </h3>
              </div>

              <div className="space-y-1.5 pr-0.5">
                {(RECOMMENDED_SITES[lang] || RECOMMENDED_SITES['ko']).map((site, idx) => (
                  <a
                    key={idx}
                    href={site.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-2 bg-[#FAF8F5] rounded-lg border border-amber-100 hover:border-rose-300 hover:bg-rose-50/50 transition group"
                  >
                    <div className="flex items-center space-x-1 mb-0.5">
                      <span className="text-xs">{site.icon}</span>
                      <span className="text-[11px] font-bold text-slate-800 group-hover:text-rose-600 transition truncate">
                        {site.name}
                      </span>
                      <span className="text-[9px] text-slate-400 ml-auto">↗</span>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-snug line-clamp-2">
                      {site.desc}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <footer className="w-full py-6 flex flex-col items-center justify-center border-t border-slate-200 bg-white mt-12 space-y-2 px-4 text-center">
        <div className="flex flex-wrap justify-center items-center gap-3 sm:gap-6 text-xs font-bold text-slate-600">
          <button onClick={() => openLegalDoc('terms')} className="hover:text-rose-600 hover:underline cursor-pointer">
            {lang === 'ko' ? '서비스 이용약관' : 'Terms of Service'}
          </button>
          <span className="text-slate-300">|</span>
          <button onClick={() => openLegalDoc('privacy')} className="hover:text-rose-600 hover:underline font-extrabold cursor-pointer">
            {lang === 'ko' ? '개인정보처리방침' : 'Privacy Policy'}
          </button>
          <span className="text-slate-300">|</span>
          <button onClick={() => openLegalDoc('refund')} className="hover:text-rose-600 hover:underline cursor-pointer">
            {lang === 'ko' ? '환불 및 취소 정책' : 'Refund Policy'}
          </button>
        </div>

        <div className="text-[11px] text-slate-500 space-y-1 max-w-2xl leading-relaxed">
          <p>
            {lang === 'ko'
              ? '상호명: YomiYomi | 대표자: 조원혁 | 사업자등록번호: 588-26-01979 | 통신판매업신고: 신고 예정 (발급 후 업데이트)'
              : 'Company: YomiYomi | CEO: Won-hyeok Cho | Business ID: 588-26-01979 | E-Commerce Permit: Pending'}
          </p>
          <p>
            {lang === 'ko'
              ? '주소: 순천시 둑실5길 25 | 고객센터: contact.yomiyomi@gmail.com'
              : 'Address: 25 Duksil 5-gil, Suncheon-si, Republic of Korea | Support: contact.yomiyomi@gmail.com'}
          </p>
        </div>

        <p className="text-[10px] text-slate-400 font-normal select-none tracking-wider pt-1">
          Copyright © 2026 YomiYomi. All rights reserved.
        </p>
      </footer>

      {/* 💳 결제 요금제 모달 (다국어 constants 연동 완료) 💳 */}
      {isPricingModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-rose-100 relative space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => {
                setIsPricingModalOpen(false);
                setSelectedPlanForPay(null);
                setAgreePayPolicy(false);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              ✕
            </button>

            {currentUser?.isSubscribed && !currentUser?.cancelAtPeriodEnd ? (
              <div className="text-center py-6 space-y-3">
                <span className="text-4xl block">👑</span>
                <h2 className="text-lg font-black text-slate-900">
                  {lang === 'ko' ? '현재 프리미엄 이용 중입니다' : 'Premium Plan Active'}
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                  {lang === 'ko' ? '이미 무제한 서비스 혜택을 이용하고 계십니다.' : 'You are currently enjoying unlimited premium benefits.'}<br />
                  <strong className="text-slate-700 font-bold block mt-1">
                    {lang === 'ko' ? '해지 및 환불 신청은 설정(⚙️) 메뉴에서 진행 가능합니다.' : 'Subscription cancellation and refunds can be managed in Account & Settings (⚙️).'}
                  </strong>
                </p>
                <button
                  onClick={() => {
                    setIsPricingModalOpen(false);
                    setIsSettingsModalOpen(true);
                  }}
                  className="mt-2 px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer"
                >
                  ⚙️ {lang === 'ko' ? '계정 및 구독 설정으로 이동' : 'Go to Account & Settings'}
                </button>
              </div>
            ) : (
              <>
                {currentUser?.isSubscribed && currentUser?.cancelAtPeriodEnd && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-center space-y-2">
                    <div className="text-xs font-bold text-amber-900">
                      ⚠️ {lang === 'ko' ? `현재 구독 해지 예약 상태입니다 (${currentUser.subscriptionEndDate} 만료)` : `Cancellation scheduled (Expires on ${currentUser.subscriptionEndDate})`}
                    </div>
                    <p className="text-[11px] text-amber-700">
                      {lang === 'ko' ? '해지 예약을 철회하고 이용을 계속하시거나, 새 플랜으로 연장이 가능합니다.' : 'You can resume your subscription or switch plans anytime.'}
                    </p>
                    <button
                      onClick={handleResumeSubscription}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                    >
                      ↺ {lang === 'ko' ? '구독 해지 철회 (정기 구독 유지)' : 'Resume Subscription'}
                    </button>
                  </div>
                )}

                {!selectedPlanForPay ? (
                  <>
                    <div className="text-center space-y-1">
                      <span className="text-3xl block">👑</span>
                      <h2 className="text-lg font-black text-slate-900">{t('premiumTitle')}</h2>
                      <p className="text-xs text-slate-500">{t('premiumDesc')}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* 1. 3개월 플랜 ($12.00) */}
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between text-center hover:border-rose-300 transition">
                        <div>
                          <span className="text-xs font-bold text-slate-500 block mb-1">
                            {t('plan3m')}
                          </span>
                          <div className="text-base font-black text-slate-900 mb-1">{t('price3m')} USD</div>
                          <span className="text-[10px] text-slate-400">
                            {t('perMonth3')}
                          </span>
                        </div>
                        <button
                          onClick={() => setSelectedPlanForPay({ planName: t('plan3m'), priceAmount: 12.00 })}
                          className="mt-4 w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer"
                        >
                          {t('subscribePlan')}
                        </button>
                      </div>

                      {/* 2. 1년 플랜 ($38.40) */}
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between text-center hover:border-rose-300 transition relative">
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                          {t('off20')}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-slate-500 block mb-1">
                            {t('plan1y')}
                          </span>
                          <div className="text-base font-black text-slate-900 mb-1">{t('price1y')} USD</div>
                          <span className="text-[10px] text-amber-700 font-semibold">
                            {t('perMonth12')}
                          </span>
                        </div>
                        <button
                          onClick={() => setSelectedPlanForPay({ planName: t('plan1y'), priceAmount: 38.40 })}
                          className="mt-4 w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer"
                        >
                          {t('subscribePlan')}
                        </button>
                      </div>

                      {/* 3. 평생 이용권 ($45.00) */}
                      <div className="p-4 bg-rose-50/80 border border-rose-300 rounded-2xl flex flex-col justify-between text-center relative shadow-xs">
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                          {t('bestTag')}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-rose-700 block mb-1">
                            {t('planLifetime')}
                          </span>
                          <div className="text-base font-black text-rose-900 mb-1">{t('priceLifetime')} USD</div>
                          <span className="text-[10px] text-rose-600 font-bold">
                            {t('unlimitedText')}
                          </span>
                        </div>
                        <button
                          onClick={() => setSelectedPlanForPay({ planName: t('planLifetime'), priceAmount: 45.00 })}
                          className="mt-4 w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer"
                        >
                          {t('subscribePlan')}
                        </button>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 text-center">
                      {t('pricingSubNotice')}
                    </p>
                  </>
                ) : (
                  <div className="space-y-4 py-2 text-center">
                    <button
                      onClick={() => { setSelectedPlanForPay(null); setAgreePayPolicy(false); }}
                      className="text-xs text-slate-400 hover:text-slate-600 font-bold flex items-center gap-1 mx-auto cursor-pointer"
                    >
                      ◀ {t('reselectPlan')}
                    </button>

                    <div className="space-y-1">
                      <span className="text-3xl block">💳</span>
                      <h3 className="text-base font-black text-slate-900">
                        {t('payTitlePre')}{selectedPlanForPay.planName}{t('payTitlePost')}
                      </h3>
                      <p className="text-xs text-rose-600 font-bold">
                        {t('payAmountLabel')}${selectedPlanForPay.priceAmount} USD
                      </p>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left my-2 space-y-1">
                      <label className="flex items-start space-x-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={agreePayPolicy}
                          onChange={(e) => setAgreePayPolicy(e.target.checked)}
                          className="mt-0.5 rounded text-rose-600 focus:ring-rose-400 shrink-0"
                        />
                        <span className="leading-tight text-[11px]">
                          {lang === 'ko' && (
                            <>[필수] 결제 약관 및 <button type="button" onClick={() => openLegalDoc('refund')} className="text-rose-600 underline font-bold">환불·구독해지 정책</button>에 동의합니다.</>
                          )}
                          {lang === 'en' && (
                            <>[Required] I agree to the payment terms and the <button type="button" onClick={() => openLegalDoc('refund')} className="text-rose-600 underline font-bold">Refund & Cancellation Policy</button>.</>
                          )}
                          {lang === 'zh-CN' && (
                            <>[必填] 我同意支付条款及<button type="button" onClick={() => openLegalDoc('refund')} className="text-rose-600 underline font-bold">退款和取消订阅政策</button>。</>
                          )}
                          {lang === 'zh-TW' && (
                            <>[必填] 我同意支付條款及<button type="button" onClick={() => openLegalDoc('refund')} className="text-rose-600 underline font-bold">退款和取消訂閱政策</button>。</>
                          )}
                          {lang === 'ja' && (
                            <>[必須] 決済利用規約および<button type="button" onClick={() => openLegalDoc('refund')} className="text-rose-600 underline font-bold">返金・解約ポリシー</button>에 동의합니다.</>
                          )}
                        </span>
                      </label>
                    </div>

                    <div className="space-y-2 max-w-xs mx-auto pt-1">
                      <button
                        disabled={!agreePayPolicy}
                        onClick={() => handlePortOnePayment(selectedPlanForPay.planName, selectedPlanForPay.priceAmount, CHANNEL_KEY_EXIMBAY, 'eximbay_card')}
                        className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                      >
                        <span className="text-base">💳</span> {lang === 'ko' ? '해외 신용카드 (Visa / Master)' : 'Credit Card (Visa / Master)'}
                      </button>

                      <button
                        disabled={!agreePayPolicy}
                        onClick={() => handlePortOnePayment(selectedPlanForPay.planName, selectedPlanForPay.priceAmount, CHANNEL_KEY_EXIMBAY, 'eximbay_alipay')}
                        className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                      >
                        <span className="text-base">🔵</span> Alipay
                      </button>

                      <button
                        disabled={!agreePayPolicy}
                        onClick={() => handlePortOnePayment(selectedPlanForPay.planName, selectedPlanForPay.priceAmount, CHANNEL_KEY_KAKAOPAY, 'kakaopay')}
                        className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-slate-900 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                      >
                        <span className="text-base">🟡</span> Kakao Pay
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {isNewDeckModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-90 bg-slate-900/50 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-rose-100 relative">
            <button
              onClick={() => setIsNewDeckModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              ✕
            </button>

            <div className="text-center mb-4">
              <span className="text-3xl block mb-1">📂</span>
              <h2 className="text-base font-bold text-slate-900">{t('newDeckModalTitle')}</h2>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={newDeckInputName}
                onChange={(e) => setNewDeckInputName(e.target.value)}
                placeholder={t('newDeckModalPlaceholder')}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-400 bg-slate-50 font-medium text-center"
              />

              <div className="flex space-x-2 pt-1">
                <button
                  onClick={() => setIsNewDeckModalOpen(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  {t('cancelBtn')}
                </button>
                <button
                  onClick={confirmCreateDeck}
                  disabled={!newDeckInputName.trim()}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer"
                >
                  {t('createBtn')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {customModal.isOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-rose-100 relative text-center space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="text-3xl">🔔</div>
            <p className="text-xs font-bold text-slate-800 leading-relaxed whitespace-pre-wrap">
              {customModal.message}
            </p>
            <div className="flex justify-center space-x-2 pt-2">
              {customModal.type === 'confirm' && (
                <button
                  onClick={closeCustomModal}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  {t('cancelBtn')}
                </button>
              )}
              <button
                onClick={() => {
                  if (customModal.onConfirm) customModal.onConfirm();
                  closeCustomModal();
                }}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer"
              >
                {t('confirmBtn')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deleteModalState.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-2xs flex justify-center items-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl border border-rose-100 relative">
            <button
              onClick={() => setDeleteModalState({ isOpen: false, deckId: '', deckName: '', inputName: '' })}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              ✕
            </button>

            <div className="text-center mb-4">
              <span className="text-3xl block mb-1">🗑️</span>
              <h2 className="text-base font-bold text-slate-900">{t('deckDeleteModalTitle')}</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed whitespace-pre-wrap">
                {t('deckDeleteModalDesc')}
              </p>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={deleteModalState.inputName}
                onChange={(e) => setDeleteModalState(prev => ({ ...prev, inputName: e.target.value }))}
                placeholder={deleteModalState.deckName}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-400 bg-slate-50 font-medium text-center"
              />

              <div className="flex space-x-2 pt-1">
                <button
                  onClick={() => setDeleteModalState({ isOpen: false, deckId: '', deckName: '', inputName: '' })}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  {t('cancelBtn')}
                </button>
                <button
                  onClick={confirmDeleteDeck}
                  disabled={deleteModalState.inputName.trim() !== deleteModalState.deckName.trim()}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer"
                >
                  {t('delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-2xs flex justify-center items-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl border border-rose-100 relative">
            <button
              onClick={() => setIsAuthModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              ✕
            </button>

            <div className="text-center mb-5">
              <span className="text-2xl block mb-1">🌸</span>
              <h2 className="text-2xl font-black text-slate-900 app-logo-text">YomiYomi</h2>
              <p className="text-xs text-slate-500 mt-1">
                {authMode === 'login' ? t('loginSub') : t('signupSub')}
              </p>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl mb-4 text-xs font-bold">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${authMode === 'login' ? 'bg-white text-rose-600 shadow-2xs' : 'text-slate-500'}`}
              >
                {t('login')}
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('signup')}
                className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${authMode === 'signup' ? 'bg-white text-rose-600 shadow-2xs' : 'text-slate-500'}`}
              >
                {t('signup')}
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-3">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">{t('nicknameLabel')}</label>
                  <input
                    type="text"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-400 bg-slate-50"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">{t('emailLabel')}</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="example@yomiyomi.com"
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-400 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">{t('passwordLabel')}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder={authMode === 'signup' ? "8+ chars with special symbol" : "••••••••"}
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-400 bg-slate-50 pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-xs text-slate-400 cursor-pointer"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>

                {authMode === 'signup' && authPassword.length > 0 && (
                  <div className="mt-1.5 space-y-0.5 text-[10px] font-medium">
                    <p className={isPasswordLengthValid ? 'text-emerald-600 font-bold' : 'text-rose-500'}>
                      {isPasswordLengthValid ? '✓ At least 8 characters' : '✕ Must be at least 8 characters'}
                    </p>
                    <p className={isPasswordSpecialValid ? 'text-emerald-600 font-bold' : 'text-rose-500'}>
                      {isPasswordSpecialValid ? '✓ Contains special character' : '✕ Must include a special character (!@#$%^&* etc.)'}
                    </p>
                  </div>
                )}
              </div>

              {authMode === 'signup' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">{t('confirmPasswordLabel')}</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-400 bg-slate-50"
                  />
                  {authConfirmPassword.length > 0 && (
                    <p className={`mt-1 text-[10px] font-medium ${isPasswordMatchValid ? 'text-emerald-600 font-bold' : 'text-rose-500'}`}>
                      {isPasswordMatchValid ? '✓ Passwords match' : '✕ Passwords do not match'}
                    </p>
                  )}
                </div>
              )}

              {authMode === 'signup' && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100 text-left">
                  <label className="flex items-center space-x-2 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="rounded text-rose-600 focus:ring-rose-400 shrink-0"
                    />
                    <span>
                      [Required] I agree to the <button type="button" onClick={() => openLegalDoc('terms')} className="text-rose-600 underline font-bold">Terms of Service</button>.
                    </span>
                  </label>

                  <label className="flex items-center space-x-2 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreePrivacy}
                      onChange={(e) => setAgreePrivacy(e.target.checked)}
                      className="rounded text-rose-600 focus:ring-rose-400 shrink-0"
                    />
                    <span>
                      [Required] I agree to the <button type="button" onClick={() => openLegalDoc('privacy')} className="text-rose-600 underline font-bold">Privacy Policy</button>.
                    </span>
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={authMode === 'signup' && !isSignupFormValid}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-2xs transition mt-2 cursor-pointer"
              >
                {authMode === 'login' ? t('loginBtn') : t('signupBtn')}
              </button>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
              <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-white px-2 text-slate-400 font-semibold">{t('or')}</span></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
            >
              <span>🌐</span> {t('googleLogin')}
            </button>
          </div>
        </div>
      )}

      {/* ⚙️ 계정 및 프로필 설정 모달 */}
      {isSettingsModalOpen && currentUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-2xs flex justify-center items-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl border border-rose-100 relative">
            <button
              onClick={() => setIsSettingsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
            >
              ✕
            </button>

            <div className="text-center mb-5">
              <h2 className="text-base font-bold text-slate-900 flex items-center justify-center gap-1">
                <span>⚙️</span> {t('settingsTitle')}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{currentUser.email}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">{t('changeNickname')}</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setAuthEditName(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-400 bg-slate-50 font-medium"
                />
              </div>

              <button
                onClick={handleSaveSettings}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition shadow-2xs cursor-pointer"
              >
                {t('saveProfileBtn')}
              </button>

              <hr className="border-slate-100 my-2" />

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-sm">👑</span>
                    <span className="text-xs font-bold text-slate-800">{t('premiumMembership')}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    currentUser.isSubscribed 
                      ? (currentUser.cancelAtPeriodEnd ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {currentUser.isSubscribed 
                      ? (currentUser.cancelAtPeriodEnd ? (lang === 'ko' ? '해지 예약됨' : 'Cancellation Scheduled') : (lang === 'ko' ? '이용 중' : 'Active'))
                      : (lang === 'ko' ? '무료 회원' : 'Free Plan')}
                  </span>
                </div>

                <p className="text-[10px] text-slate-500">
                  {currentUser.isSubscribed 
                    ? (lang === 'ko' ? `현재 [${currentUser.subscriptionPlan || 'Premium'}] 플랜을 이용하고 있습니다.` : `Currently using [${currentUser.subscriptionPlan || 'Premium'}] Plan.`)
                    : t('freePlanUsing')}
                </p>

                {currentUser.isSubscribed && currentUser.subscriptionEndDate && (
                  <div className="pt-2 border-t border-slate-200/60 text-[11px] space-y-1">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>{currentUser.cancelAtPeriodEnd ? t('expDateLabel') : t('nextPayDateLabel')}</span>
                      <span className="font-bold text-slate-800">{currentUser.subscriptionEndDate}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">{lang === 'ko' ? '남은 이용 기간:' : 'Days Remaining:'}</span>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-full text-[10px]">
                        {daysLeft}{t('daysLeftLabel')}
                      </span>
                    </div>
                  </div>
                )}

                {currentUser.isSubscribed && (
                  <div className="pt-2 border-t border-slate-200/60 flex justify-end">
                    {currentUser.cancelAtPeriodEnd ? (
                      <button
                        onClick={handleResumeSubscription}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition cursor-pointer"
                      >
                        ↺ {lang === 'ko' ? '구독 해지 철회 (정기 구독 유지)' : 'Resume Subscription'}
                      </button>
                    ) : (
                      <button
                        onClick={handleCancelSubscription}
                        className="text-[11px] text-rose-500 hover:text-rose-700 font-bold underline cursor-pointer"
                      >
                        {t('cancelSubscription')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-2 text-center">
                <button
                  onClick={handleDeleteAccount}
                  className="text-xs text-slate-400 hover:text-rose-600 underline font-semibold transition cursor-pointer"
                >
                  {t('deleteAccountBtn')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <LegalModal
        isOpen={legalModalState.isOpen}
        onClose={() => setLegalModalState({ isOpen: false, doc: null, docType: null })}
        document={legalModalState.doc}
        docType={legalModalState.docType}
        currentLang={lang}
      />

      <style>{`
        :root {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        /* 🌸 로고 폰트 고정 🌸 */
        .app-logo-text, .app-logo-text * {
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        }

        /* 🇨🇳 중국어(간체/번체) 폰트 패밀리 지정 */
        html[lang="zh-CN"] body *:not(.app-logo-text):not(.app-logo-text *),
        html[lang="zh-TW"] body *:not(.app-logo-text):not(.app-logo-text *) {
          font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif !important;
        }

        .note-content-area, .note-content-area * {
          font-weight: 400 !important;
        }

        ruby.inline-ruby {
          display: inline-flex !important;
          flex-direction: column-reverse !important;
          align-items: center !important;
          vertical-align: bottom !important;
        }

        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #f1f5f9; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}