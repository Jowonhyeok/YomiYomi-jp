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
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { auth, googleProvider, db } from './firebase';

import type { Lang, KanjiInfo, WordInfo, GrammarInfo, AnalysisResult, Deck, UserProfile } from './types';
import { 
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
  analyzeJapanese
} from './utils/helpers';
import { CardCarousel } from './components/CardCarousel';
import { SidebarWordCarousel } from './components/SidebarCarousel';
import { LegalModal } from './components/LegalModal';
import { getLegalDocument } from './constants/legal';
import type { LegalDocType, LegalDocument } from './constants/legal';

import { useUserStore } from './store/useUserStore';
import { useDeckStore } from './store/useDeckStore';
import { useUIStore } from './store/useUIStore';

// 🌸 입력 글자 수 최대 한도 1,500자로 고정
const MAX_TEXT_LENGTH = 1500;

declare global {
  interface Window {
    createLemonSqueezy?: () => void;
    LemonSqueezy?: {
      Url: {
        Open: (url: string) => void;
        Close: (url: string) => void;
      };
      Setup: (options: {
        eventHandler: (event: { event: string; data?: any }) => void;
      }) => void;
    };
  }
}

const DEFAULT_DECK_DATA: Deck = {
  id: 'default',
  name: 'Default Deck',
  cards: [], 
  createdAt: new Date().toISOString()
};

const LANG_OPTIONS: { code: Lang; flagUrl: string; label: string }[] = [
  { code: 'en', flagUrl: 'https://flagcdn.com/us.svg', label: 'English' },
  { code: 'zh-CN', flagUrl: 'https://flagcdn.com/cn.svg', label: '简体中文' },
  { code: 'zh-TW', flagUrl: 'https://flagcdn.com/tw.svg', label: '繁體中文' },
  { code: 'ko', flagUrl: 'https://flagcdn.com/kr.svg', label: '한국어' },
  { code: 'ja', flagUrl: 'https://flagcdn.com/jp.svg', label: '日本語' },
];

let cachedDeviceId: string | null = null;

async function getDeviceId(): Promise<string | null> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    cachedDeviceId = result.visitorId;
    return cachedDeviceId;
  } catch (e) {
    console.error('Failed to load fingerprint device ID:', e);
    return null;
  }
}

export default function App() {
  const { currentUser, lang, setCurrentUser, setLang } = useUserStore();
  const { 
    decks, selectedDeckId, searchKeyword, quizSelectedDeckIds, quizState, 
    setDecks, setSelectedDeckId, setSearchKeyword, setQuizSelectedDeckIds, setQuizState 
  } = useDeckStore();
  const { 
    activeTab, readingDisplayMode, kanaTab, fontSize, speakingText,
    isPricingModalOpen, customModal,
    setActiveTab, setReadingDisplayMode, setKanaTab, setFontSize,
    setSpeakingText, setIsPricingModalOpen, setSelectedPlanForPay, showAlert, showConfirm, closeCustomModal
  } = useUIStore();

  const [hideWordMeanings, setHideWordMeanings] = useState(false);
  const [hideKanjiMeanings, setHideKanjiMeanings] = useState(false);
  const [hideGrammarMeanings, setHideGrammarMeanings] = useState(false);

  useEffect(() => {
    getDeviceId();
  }, []);

  const t = (key: string) => DICT[lang]?.[key] || DICT['en']?.[key] || DICT['ko']?.[key] || key;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedLang = localStorage.getItem('user_lang') as Lang;
    if (savedLang) {
      setLang(savedLang);
      return;
    }

    const browserLang = navigator.language || (navigator as any).userLanguage || '';
    if (browserLang.startsWith('zh')) {
      setLang(browserLang.includes('TW') || browserLang.includes('HK') ? 'zh-TW' : 'zh-CN');
    } else if (browserLang.startsWith('ko')) {
      setLang('ko');
    } else if (browserLang.startsWith('ja')) {
      setLang('ja');
    } else {
      setLang('zh-CN');
    }
  }, [setLang]);

  // 🌸 레몬스퀴지 결제 성공 시 토큰 강제 갱신 및 화면 정돈
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.createLemonSqueezy) {
        window.createLemonSqueezy();
      }

      if (window.LemonSqueezy) {
        window.LemonSqueezy.Setup({
          eventHandler: async (event) => {
            if (event.event === 'Checkout.Success') {
              const orderData = event.data?.order;
              const planName = sessionStorage.getItem('pendingPlanName') || 'Premium';

              if (auth.currentUser) {
                try {
                  const idToken = await auth.currentUser.getIdToken(true);
                  const verifyRes = await fetch('/api/payments/verify', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                      orderData,
                      planName,
                      userId: auth.currentUser.uid
                    })
                  });

                  // 레몬스퀴지 파싱 방어 로직 적용
                  let verifyData: any = {};
                  try {
                    verifyData = await verifyRes.json();
                  } catch (e) {
                    console.error('Verify endpoint returned non-JSON:', e);
                  }

                  if (verifyRes.ok && verifyData.success) {
                    setCurrentUser((prev) => prev ? {
                      ...prev,
                      isSubscribed: true,
                      subscriptionPlan: planName
                    } : null);

                    setIsPricingModalOpen(false);
                    setSelectedPlanForPay(null);
                    setAgreePayPolicy(false);
                    sessionStorage.removeItem('pendingPlanName');
                    
                    showAlert(`🎉 ${planName} ${t('paymentSuccessAlert')}`);
                    setTimeout(() => {
                      window.location.reload();
                    }, 1500);
                  } else {
                    showAlert(`${t('paymentApprovalError')}${verifyData?.message || 'Error'}`);
                  }
                } catch (err: any) {
                  showAlert(`${t('paymentVerifyError')}${err.message}`);
                }
              }
            }
          }
        });
      }
    }
  }, [setCurrentUser, setIsPricingModalOpen, setSelectedPlanForPay, showAlert, lang, t]);

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
        // 보안 규칙 무시
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
    if (typeof window !== 'undefined') {
      localStorage.setItem('user_lang', newLang);
    }
    if (currentUser && db && db.app) {
      const userDocRef = doc(db, 'users', currentUser.id);
      setDoc(userDocRef, { lang: newLang }, { merge: true }).catch(() => {});
    }
  };

  useEffect(() => {
    if (!auth || !auth.onAuthStateChanged) return;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
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

            if (data.subscriptionEndDate) {
              const endDate = new Date(data.subscriptionEndDate);
              const now = new Date();
              if (now > endDate) {
                isSubscribedActive = false;
                setDoc(userDocRef, { 
                  isSubscribed: false, 
                  subscriptionPlan: 'Free' 
                }, { merge: true }).catch(() => {});
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
            setDoc(userDocRef, { ...newUser, decks: initialDeck }).catch(() => {});
          }
        }, (err) => console.error(err));

        return () => unsubscribeSnapshot();
      } else {
        setCurrentUser(null);
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
      await setDoc(userDocRef, { decks: sanitized }, { merge: true }).catch(() => {});
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
      showAlert(t('enterEmailPasswordAlert'));
      return;
    }

    try {
      if (authMode === 'signup') {
        if (!authName.trim()) {
          showAlert(t('enterNameAlert'));
          return;
        }

        if (!isSignupFormValid) {
          showAlert(t('agreeTermsRequiredAlert'));
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        await updateProfile(userCredential.user, { displayName: authName.trim() });
        
        if (db && db.app) {
          const userDocRef = doc(db, 'users', userCredential.user.uid);
          await setDoc(userDocRef, { name: authName.trim(), lang: lang }, { merge: true }).catch(() => {});
        }

        await sendEmailVerification(userCredential.user);
        await signOut(auth);

        showAlert(t('signupSuccess'));
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
      let userFriendlyMsg = t('authErrorOccurred');
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        userFriendlyMsg = t('invalidEmailPasswordFormat');
      } else if (err.code === 'auth/email-already-in-use') {
        userFriendlyMsg = t('emailAlreadyInUse');
      } else if (err.code === 'auth/invalid-email') {
        userFriendlyMsg = t('invalidEmailFormat');
      }
      showAlert(userFriendlyMsg);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setIsAuthModalOpen(false);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        return;
      }
      showAlert(t('googleLoginFailedAlert') + err.message);
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
        setIsSettingsModalOpen(false);
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }
    });
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
            console.warn("Firestore user document delete error:", dbErr);
          }
        }

        await deleteUser(firebaseUser);

        setCurrentUser(null);
        setIsSettingsModalOpen(false);
        setDecks([DEFAULT_DECK_DATA]);
        localStorage.removeItem('koto_decks');
        
        showAlert(t('deleteAccountSuccess'));
        
        if (typeof window !== 'undefined') {
          window.location.reload();
        }

      } catch (err: any) {
        console.error("Delete Account Error:", err);
        
        if (err.code === 'auth/requires-recent-login') {
          try { await signOut(auth); } catch {}
          setCurrentUser(null);
          setIsSettingsModalOpen(false);
          showAlert(t('reloginRequiredForDelete'));
        } else {
          showAlert(t('deleteAccountFailed') + (err.message || 'Error'));
        }
      }
    });
  };

  const handleLemonSqueezyPayment = (planName: string, checkoutUrlRaw: string) => {
    if (!agreePayPolicy) {
      showAlert(t('agreePayPolicyRequired'));
      return;
    }

    if (!currentUser) {
      showAlert(t('loginRequired'));
      setIsAuthModalOpen(true);
      return;
    }

    sessionStorage.setItem('pendingPlanName', planName);

    let baseUrl = '';

    if (checkoutUrlRaw && typeof checkoutUrlRaw === 'string' && checkoutUrlRaw.startsWith('http')) {
      baseUrl = checkoutUrlRaw.trim();
    }

    if (!baseUrl) {
      if (planName.includes('3개월') || planName.includes('3-Month') || planName.includes('3 month') || planName.includes('3ヶ月')) {
        baseUrl = 'https://yomiyomi-jp.lemonsqueezy.com/checkout/buy/c190392a-86b8-4828-a4d6-dd88e54d8e53';
      } else if (planName.includes('1년') || planName.includes('1-Year') || planName.includes('1 year') || planName.includes('1年')) {
        baseUrl = 'https://yomiyomi-jp.lemonsqueezy.com/checkout/buy/3302e962-c15b-42b1-afda-f4272bd3a424';
      } else {
        baseUrl = 'https://yomiyomi-jp.lemonsqueezy.com/checkout/buy/c74e6951-6422-4bfe-a38d-ed18e989371d';
      }
    }

    try {
      const validUrl = new URL(baseUrl);
      validUrl.searchParams.set('embed', '1');
      if (currentUser.email) {
        validUrl.searchParams.set('checkout[email]', currentUser.email);
      }

      validUrl.searchParams.set('checkout[custom][user_id]', currentUser.id);
      validUrl.searchParams.set('checkout[custom][plan_name]', planName);

      const finalUrlString = validUrl.toString();

      if (window.LemonSqueezy && window.LemonSqueezy.Url) {
        window.LemonSqueezy.Url.Open(finalUrlString);
      } else {
        window.open(finalUrlString, '_blank');
      }
    } catch (err) {
      console.error('[LemonSqueezy URL Build Error]:', err);
      window.open(baseUrl || 'https://yomiyomi-jp.lemonsqueezy.com', '_blank');
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
          const dataUrl = canvas.toDataURL(mimeType, 0.75);
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
      showAlert(t('ttsNotSupported'));
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

  // 🌸 예외 처리 및 방어 로직이 강화된 분석 함수
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
      const deviceId = cachedDeviceId || await getDeviceId();

      const result = await analyzeJapanese(inputText, lang, imagePayload, deviceId);
      
      // AI 응답 결과 구조 방어 검증
      if (!result || typeof result !== 'object') {
        throw new Error('INVALID_RESPONSE_FORMAT');
      }

      setAnalysisResult(result);
      recordFeatureUsage();

    } catch (error: any) {
      const errMessage = String(error?.message || error || '');

      if (
        errMessage.includes("503") || 
        errMessage.includes("Service Unavailable") || 
        errMessage.includes("high demand") ||
        errMessage.includes("experiencing high demand")
      ) {
        setErrorMessage(t('googleServiceUnavailable'));
      } else if (errMessage === "DAILY_LIMIT_EXCEEDED") {
        showAlert(t('dailyLimitReached'));
        setIsPricingModalOpen(true);
      } else if (errMessage === "DEVICE_LIMIT_EXCEEDED") {
        showAlert(t('deviceLimitAlert'));
      } else if (errMessage === "RATE_LIMIT_EXCEEDED") {
        setErrorMessage(t('tooManyRequestsAlert'));
      } else if (errMessage === "JAPANESE_ONLY") {
        setErrorMessage(t('japaneseOnlyAlert'));
      } else if (errMessage === "UNAUTHORIZED") {
        setErrorMessage(t('sessionExpiredAlert'));
      } else if (errMessage === "PARSE_ERROR" || errMessage.includes("JSON")) {
        setErrorMessage(t('parseErrorAlert') || '분석 결과를 받아오지 못했습니다. 잠시 후 다시 시도해주세요.');
      } else {
        setErrorMessage(`⚠️ ${errMessage}`);
      }
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => {
        setIsCoolingDown(false);
      }, 1000);
    }
  };

  // 🌸 분석 시점의 카드 언어를 유지하여 저장
  const handleAddCardToDeck = (word: WordInfo, cardLang: Lang) => {
    if (!word) return;

    const currentDeckExists = (decks || []).some(d => String(d.id) === String(selectedDeckId));
    const targetDeckId = currentDeckExists ? selectedDeckId : (decks[0]?.id || 'default');

    const cardWithId: WordInfo = {
      id: String(Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
      word: String(word.word || '').trim(),
      reading: String(word.reading || '').trim(),
      partOfSpeech: getLocalizedPOS(word.partOfSpeech, cardLang),
      meaning: getLocalizedText(word.meaning, cardLang),
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

  const handleAddKanjiToDeck = (k: KanjiInfo, cardLang: Lang) => {
    handleAddCardToDeck({
      word: k.kanji,
      reading: k.readings,
      partOfSpeech: 'kanji',
      meaning: getLocalizedText(k.meaning, cardLang),
      jlpt: '한자'
    }, cardLang);
  };

  const handleAddGrammarToDeck = (g: GrammarInfo, cardLang: Lang) => {
    handleAddCardToDeck({
      word: g.grammar,
      reading: 'grammar',
      partOfSpeech: 'grammar',
      meaning: getLocalizedText(g.explanation, cardLang),
      jlpt: '문법'
    }, cardLang);
  };

  const handleCreateDeck = () => {
    setNewDeckInputName('');
    setIsNewDeckModalOpen(true);
  };

  const confirmCreateDeck = () => {
    if (!newDeckInputName.trim()) return;
    const newDeck: Deck = {
      id: String(Date.now()),
      name: newDeckInputName.trim().slice(0, 20),
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
        .filter(m => m && m !== currentCardMeaning)
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

  const payModalI18n = {
    ko: {
      title: '프리미엄 이용권 구매',
      sub: '한 번 결제로 정기 자동 결제 없이 안전하게 이용해보세요.',
      agree1: '[필수] 결제 약관 및 ',
      agree2: '환불·이용 정책',
      agree3: '에 동의합니다.',
      pass3m: '3개월 이용권',
      pass1y: '1년 이용권',
      passLife: '평생 이용권',
      mo3m: '월 $4.00 상당',
      mo1y: '월 $3.20 상당',
      lifeDesc: '무제한 영구 이용',
      buyBtn: '구매하기',
      footerNotice: '모든 결제는 1회성 단발성 결제로 진행되며 자동 연장되지 않습니다.'
    },
    en: {
      title: 'Buy Premium Access',
      sub: 'One-time payment with no recurring charges.',
      agree1: '[Required] I agree to the payment terms and ',
      agree2: 'Refund Policy',
      agree3: '.',
      pass3m: '3-Month Pass',
      pass1y: '1-Year Pass',
      passLife: 'Lifetime Pass',
      mo3m: '$4.00 / mo',
      mo1y: '$3.20 / mo',
      lifeDesc: 'Unlimited Forever',
      buyBtn: 'Buy Now',
      footerNotice: 'All purchases are single payments and will not auto-renew.'
    },
    'zh-CN': {
      title: '购买高级通行证',
      sub: '一次性支付，无自动续费，安全放心。',
      agree1: '[必填] 我同意支付条款及',
      agree2: '退款政策',
      agree3: '。',
      pass3m: '3个月通行证',
      pass1y: '1年通行证',
      passLife: '终身通行证',
      mo3m: '约 $4.00 / 月',
      mo1y: '约 $3.20 / 月',
      lifeDesc: '永久无限使用',
      buyBtn: '立即购买',
      footerNotice: '所有支付均为一次性购买，不会自动续费。'
    },
    'zh-TW': {
      title: '購買高級通行證',
      sub: '一次性支付，無自動續費，安全放心。',
      agree1: '[必填] 我同意支付條款及',
      agree2: '退款政策',
      agree3: '。',
      pass3m: '3個月通行證',
      pass1y: '1年通行證',
      passLife: '終身通行證',
      mo3m: '約 $4.00 / 月',
      mo1y: '約 $3.20 / 月',
      lifeDesc: '永久無限使用',
      buyBtn: '立即購買',
      footerNotice: '所有支付均為一次性購買，不會自動續費。'
    },
    ja: {
      title: 'プレミアムパスのご購入',
      sub: '一回限りの決済で、自動更新なしで安心してお使いいただけます。',
      agree1: '[必須] 決済利用規約および',
      agree2: '返金ポリシー',
      agree3: 'に同意します。',
      pass3m: '3ヶ月パス',
      pass1y: '1年パス',
      passLife: '無制限パス',
      mo3m: '月額 $4.00 相当',
      mo1y: '月額 $3.20 相当',
      lifeDesc: '無制限・永久利用',
      buyBtn: '購入する',
      footerNotice: 'すべての決済は一回限りの単品購入であり、自動更新されません。'
    }
  }[lang] || {
    title: 'Buy Premium Access',
    sub: 'One-time payment with no recurring charges.',
    agree1: '[Required] I agree to the payment terms and ',
    agree2: 'Refund Policy',
    agree3: '.',
    pass3m: '3-Month Pass',
    pass1y: '1-Year Pass',
    passLife: 'Lifetime Pass',
    mo3m: '$4.00 / mo',
    mo1y: '$3.20 / mo',
    lifeDesc: 'Unlimited Forever',
    buyBtn: 'Buy Now',
    footerNotice: 'All purchases are single payments and will not auto-renew.'
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-slate-800 font-sans border-t-4 border-rose-600 relative pb-20 flex flex-col justify-between">
      <div>
        {/* 🌸 헤더 영역 🌸 */}
        <header className="bg-white border-b border-rose-100 shadow-2xs sticky top-0 z-40 min-h-16 py-2">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 h-full grid grid-cols-3 items-center gap-2">
            
            {/* 좌측: 탭 메뉴 */}
            <div className="flex items-center space-x-2 justify-start">
              <div className="hidden lg:flex space-x-1 bg-slate-100 p-1 rounded-xl shrink-0">
                <button
                  onClick={() => setActiveTab('analyze')}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition cursor-pointer whitespace-nowrap ${activeTab === 'analyze' ? 'bg-white text-rose-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t('analyzeTab')}
                </button>
                <button
                  onClick={() => setActiveTab('decks')}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition cursor-pointer whitespace-nowrap ${activeTab === 'decks' ? 'bg-white text-rose-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t('decksTab')}
                </button>
                <button
                  onClick={() => setActiveTab('quiz')}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition cursor-pointer whitespace-nowrap ${activeTab === 'quiz' ? 'bg-white text-rose-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t('quizTab')}
                </button>
              </div>
            </div>

            {/* 중앙: 로고 */}
            <div className="flex items-center justify-center">
              <button 
                onClick={() => setActiveTab('analyze')}
                className="flex items-center space-x-1.5 sm:space-x-2 focus:outline-none group cursor-pointer shrink-0"
              >
                <span className="text-xl sm:text-2xl group-hover:scale-110 transition select-none">🌸</span>
                <h1 className="text-lg sm:text-2xl font-black tracking-tight text-slate-900 group-hover:text-rose-600 transition flex items-center gap-1.5 app-logo-text whitespace-nowrap">
                  <span>YomiYomi</span>
                  {currentUser?.isSubscribed && (
                    <span className="font-black text-rose-600 text-lg sm:text-2xl ml-0.5 whitespace-nowrap">
                      Premium
                    </span>
                  )}
                </h1>
                <span className="text-xl sm:text-2xl group-hover:scale-110 transition select-none">🌸</span>
              </button>
            </div>

            {/* 우측: 버튼 그룹 */}
            <div className="flex items-center justify-end space-x-1.5 sm:space-x-2">
              <button
                onClick={() => setIsPricingModalOpen(true)}
                className="px-3 py-1.5 sm:px-3.5 sm:py-2 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition flex items-center gap-1 active:scale-95 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <span>👑</span>
                <span className="hidden sm:inline whitespace-nowrap">{t('membership')}</span>
              </button>

              <div className="relative inline-block text-left shrink-0" ref={headerLangRef}>
                <button
                  type="button"
                  onClick={() => setIsHeaderLangOpen(!isHeaderLangOpen)}
                  className="px-2.5 py-1.5 sm:px-3 sm:py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl flex items-center gap-1.5 text-xs sm:text-sm font-normal text-slate-700 transition cursor-pointer whitespace-nowrap min-w-fit"
                >
                  <img src={currentLangObj.flagUrl} alt={currentLangObj.label} className="w-4 h-3 object-cover rounded-2xs shrink-0" />
                  <span className="hidden sm:inline text-xs sm:text-sm font-normal whitespace-nowrap">{currentLangObj.label}</span>
                  <span className="text-[10px] text-slate-400">▾</span>
                </button>

                {isHeaderLangOpen && (
                  <div className="absolute right-0 mt-1.5 w-36 bg-white border border-rose-100 rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 z-50 py-1">
                    {LANG_OPTIONS.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => {
                          handleLanguageChange(item.code);
                          setIsHeaderLangOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm text-left hover:bg-rose-50 transition whitespace-nowrap ${
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
                <div className="flex items-center pl-1 border-l border-slate-200 shrink-0">
                  <button
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-slate-600 hover:text-rose-600 text-xs sm:text-sm font-normal rounded-lg hover:bg-rose-50 transition cursor-pointer whitespace-nowrap"
                    title={t('settingsTitle')}
                  >
                    <span className="shrink-0">⚙️</span>
                    <span className="hidden sm:inline font-normal whitespace-nowrap">{t('settingsTitle')}</span>
                  </button>

                  <button
                    onClick={handleLogout}
                    className="hidden md:inline ml-1 px-2.5 py-1.5 text-xs font-normal text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 rounded-lg transition cursor-pointer whitespace-nowrap"
                  >
                    {t('logout')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); }}
                  className="px-3 py-1.5 sm:px-3.5 sm:py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition cursor-pointer shrink-0 whitespace-nowrap"
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
              bg-white border border-rose-100 shadow-xs rounded-2xl p-3.5
              ${isLeftSidebarOpenMobile ? 'fixed inset-x-4 top-16 z-50 max-h-[80vh] shadow-2xl' : 'hidden lg:flex'}
              flex flex-col h-fit self-start sticky top-16
            `}
          >
            <div className="flex justify-between items-center pb-2.5 mb-2.5 border-b border-rose-50 shrink-0">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span>🗂️</span> {t('deckSidebarTitle')}
              </h3>
            </div>

            <div className="space-y-2 mb-2.5 shrink-0">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-semibold">{t('deckLabel')}</span>
                <button
                  onClick={handleCreateDeck}
                  className="text-xs text-rose-600 hover:underline font-bold cursor-pointer"
                >
                  {t('newDeck')}
                </button>
              </div>
              <select
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="w-full text-xs sm:text-sm border border-slate-200 rounded-lg p-2 bg-slate-50 font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-rose-400 cursor-pointer"
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
                  className="w-full text-xs sm:text-sm p-2 border border-slate-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:border-rose-300"
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
                        <span className="text-xs px-2.5 py-0.5 rounded-full font-bold border bg-sky-50 text-sky-700 border-sky-200">
                          {t('dailyLimitBadge')}{remainingCount}/3
                        </span>
                      )}
                      
                      <span className={`text-xs font-semibold ${inputText.length >= MAX_TEXT_LENGTH ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
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
                        <label className="cursor-pointer px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs sm:text-sm font-bold transition flex items-center gap-1">
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
                        <span className="text-xs text-slate-400">{t('dragNotice')}</span>
                      </div>

                      {selectedImage && (
                        <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
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
                      className="px-6 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-2xs transition text-xs sm:text-sm flex items-center space-x-1.5 cursor-pointer"
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
                    <div className="flex items-center space-x-2 text-amber-900 font-semibold text-xs sm:text-sm">
                      <span className="animate-spin">🌸</span>
                      <span>{t('analyzing')}</span>
                    </div>
                  </div>
                )}

                {errorMessage && (
                  <div className="p-3 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200 flex items-center justify-between text-xs sm:text-sm font-medium">
                    <span>{errorMessage}</span>
                    <button onClick={() => setErrorMessage('')} className="font-bold hover:text-rose-900 cursor-pointer">{t('close')}</button>
                  </div>
                )}

                {analysisResult && (
                  <div className="space-y-4">
                    {(() => {
                      // 🌸 분석 시점의 언어 고정 기준
                      const cardLang = analysisResult.resultLang || lang;

                      return (
                        <>
                          <div className="bg-white p-5 rounded-2xl shadow-xs border border-rose-100">
                            <div className="flex flex-wrap justify-between items-center mb-3 pb-2 border-b border-slate-100 gap-2">
                              <div className="flex items-center space-x-2">
                                <h3 className="text-sm font-bold text-slate-600 flex items-center gap-1.5">
                                  <span>🎏</span> {t('noteTitle')}
                                </h3>
                                <button
                                  onClick={() => toggleSpeech(inputText)}
                                  className={`p-1.5 text-xs sm:text-sm font-bold rounded-md transition flex items-center justify-center cursor-pointer ${
                                    speakingText === inputText
                                      ? 'bg-rose-600 text-white hover:bg-rose-700 border border-rose-700'
                                      : 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                                  }`}
                                >
                                  <span>{speakingText === inputText ? '⏹️' : '🔊'}</span>
                                </button>
                              </div>
                              
                              <div className="flex flex-wrap items-center space-x-2 text-xs sm:text-sm bg-slate-50 p-1.5 rounded-xl border border-slate-200 gap-y-1">
                                <div className="flex items-center space-x-1">
                                  <button
                                    onClick={() => setFontSize(prev => Math.max(14, prev - 2))}
                                    className="px-2 py-0.5 bg-white border rounded text-slate-700 font-bold hover:bg-slate-100 text-xs cursor-pointer"
                                  >
                                    A-
                                  </button>
                                  <span className="text-xs font-semibold text-slate-500 w-8 text-center">{fontSize}px</span>
                                  <button
                                    onClick={() => setFontSize(prev => Math.min(28, prev + 2))}
                                    className="px-2 py-0.5 bg-white border rounded text-slate-700 font-bold hover:bg-slate-100 text-xs cursor-pointer"
                                  >
                                    A+
                                  </button>
                                </div>

                                <div className="flex items-center space-x-1.5 border-l border-slate-200 pl-2">
                                  <button
                                    onClick={() => setReadingDisplayMode(readingDisplayMode === 'off' ? 'furigana' : 'off')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer ${
                                      readingDisplayMode !== 'off'
                                        ? 'bg-rose-600 text-white hover:bg-rose-700' 
                                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                    }`}
                                  >
                                    {t('modeYomigana')} {readingDisplayMode !== 'off' ? 'On' : 'Off'}
                                  </button>
                                  <button
                                    onClick={() => setShowTranslation(!showTranslation)}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer ${
                                      showTranslation
                                        ? 'bg-sky-600 text-white hover:bg-sky-700' 
                                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                    }`}
                                  >
                                    {t('modeTranslate')} {showTranslation ? 'On' : 'Off'}
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div 
                              style={{
                                fontSize: `${fontSize}px`,
                                fontFamily: 'sans-serif'
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
                                <p className="text-slate-400 text-xs sm:text-sm">No analyzed sentences found.</p>
                              )}
                              
                              {showTranslation && analysisResult.translatedText && (
                                <div className="mt-4 pt-3 border-t border-amber-200/50 text-sm sm:text-base font-bold text-slate-700">
                                  {analysisResult.translatedText}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 🌸 주요 단어 카드 */}
                          {analysisResult.wordList && analysisResult.wordList.length > 0 && (
                            <div className="bg-white p-5 rounded-2xl shadow-xs border border-rose-100 space-y-3">
                              <div className="flex flex-wrap justify-between items-center gap-2 pb-2.5 border-b border-slate-100">
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs sm:text-sm text-slate-600 font-semibold">{t('targetDeck')}</span>
                                  <select
                                    value={selectedDeckId}
                                    onChange={(e) => setSelectedDeckId(e.target.value)}
                                    className="text-xs sm:text-sm border border-slate-200 rounded-lg px-2.5 py-1 bg-slate-50 font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-rose-400 cursor-pointer"
                                  >
                                    {decks.map(d => (
                                      <option key={d.id} value={d.id}>{d.name} ({(d.cards || []).length})</option>
                                    ))}
                                  </select>
                                </div>

                                <button
                                  onClick={() => setHideWordMeanings(!hideWordMeanings)}
                                  className={`text-xs sm:text-sm px-3.5 py-1.5 rounded-xl font-bold transition cursor-pointer shadow-2xs ${hideWordMeanings ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                                >
                                  {hideWordMeanings ? t('showMeaning') : t('hideMeaning')}
                                </button>
                              </div>

                              <CardCarousel
                                items={analysisResult.wordList}
                                title={t('wordCardTitle')}
                                icon="📌"
                                renderItem={(word) => (
                                  <div className="text-center w-full max-w-sm px-2 py-1">
                                    <div className="flex items-center justify-center space-x-2 mb-1">
                                      <span className="font-bold text-xl text-slate-900">{word.word}</span>
                                      <span className="text-sm text-rose-600 font-semibold">[{word.reading}]</span>
                                      <button
                                        onClick={() => toggleSpeech(word.word)}
                                        className={`text-sm p-1 rounded transition cursor-pointer ${
                                          speakingText === word.word
                                            ? 'bg-rose-600 text-white font-bold border border-rose-700'
                                            : 'text-slate-400 hover:text-amber-600'
                                        }`}
                                      >
                                        {speakingText === word.word ? '⏹️' : '🔊'}
                                      </button>
                                      {word.jlpt && <span className="text-xs bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">{word.jlpt}</span>}
                                    </div>
                                    <p className="text-xs sm:text-sm text-slate-600 mt-2">
                                      {t('partOfSpeech')}: <span className="font-semibold text-slate-800">{getLocalizedPOS(word.partOfSpeech, cardLang)}</span>
                                    </p>
                                    <p className="text-xs sm:text-sm mt-1.5">
                                      {t('meaning')}: {' '}
                                      <span className={hideWordMeanings ? 'bg-slate-800 text-slate-800 select-none rounded px-2' : 'font-bold text-slate-800'}>
                                        {getLocalizedText(word.meaning, cardLang)}
                                      </span>
                                    </p>
                                    <button
                                      onClick={() => handleAddCardToDeck(word, cardLang)}
                                      className="mt-3 px-4 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs sm:text-sm font-bold rounded-xl transition shadow-2xs active:scale-95 cursor-pointer"
                                    >
                                      {t('addWordBtn')}
                                    </button>
                                  </div>
                                )}
                              />
                            </div>
                          )}

                          {/* 🌸 한자 정보 카드 */}
                          {analysisResult.kanjiList && analysisResult.kanjiList.length > 0 && (
                            <div className="bg-white p-5 rounded-2xl shadow-xs border border-rose-100 space-y-3">
                              <div className="flex flex-wrap justify-between items-center gap-2 pb-2.5 border-b border-slate-100">
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs sm:text-sm text-slate-600 font-semibold">{t('targetDeck')}</span>
                                  <select
                                    value={selectedDeckId}
                                    onChange={(e) => setSelectedDeckId(e.target.value)}
                                    className="text-xs sm:text-sm border border-slate-200 rounded-lg px-2.5 py-1 bg-slate-50 font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-rose-400 cursor-pointer"
                                  >
                                    {decks.map(d => (
                                      <option key={d.id} value={d.id}>{d.name} ({(d.cards || []).length})</option>
                                    ))}
                                  </select>
                                </div>

                                <button
                                  onClick={() => setHideKanjiMeanings(!hideKanjiMeanings)}
                                  className={`text-xs sm:text-sm px-3.5 py-1.5 rounded-xl font-bold transition cursor-pointer shadow-2xs ${hideKanjiMeanings ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                                >
                                  {hideKanjiMeanings ? t('showMeaning') : t('hideMeaning')}
                                </button>
                              </div>

                              <CardCarousel
                                items={analysisResult.kanjiList}
                                title={t('kanjiCardTitle')}
                                icon="🏮"
                                renderItem={(k) => (
                                  <div className="text-center w-full max-w-sm px-2 py-1">
                                    <div className="flex justify-center items-center gap-1.5 mb-1">
                                      <span className="text-2xl font-bold text-slate-800">{k.kanji}</span>
                                      <button
                                        onClick={() => toggleSpeech(k.kanji)}
                                        className={`text-sm p-1 rounded transition cursor-pointer ${
                                          speakingText === k.kanji
                                            ? 'bg-rose-600 text-white font-bold border border-rose-700'
                                            : 'text-slate-400 hover:text-amber-600'
                                        }`}
                                      >
                                        {speakingText === k.kanji ? '⏹️' : '🔊'}
                                      </button>
                                    </div>
                                    <span className="text-sm text-rose-600 font-bold block">{k.readings}</span>
                                    <span className="text-xs sm:text-sm block mt-1.5">
                                      {t('meaning')}: {' '}
                                      <span className={hideKanjiMeanings ? 'bg-slate-800 text-slate-800 select-none rounded px-2' : 'font-semibold text-slate-800'}>
                                        {getLocalizedText(k.meaning, cardLang)}
                                      </span>
                                    </span>
                                    <button
                                      onClick={() => handleAddKanjiToDeck(k, cardLang)}
                                      className="mt-3 px-4 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs sm:text-sm font-bold rounded-xl transition shadow-2xs active:scale-95 cursor-pointer"
                                    >
                                      {t('addWordBtn')}
                                    </button>
                                  </div>
                                )}
                              />
                            </div>
                          )}

                          {/* 🌸 문법 구조 카드 */}
                          {analysisResult.grammarList && analysisResult.grammarList.length > 0 && (
                            <div className="bg-white p-5 rounded-2xl shadow-xs border border-rose-100 space-y-3">
                              <div className="flex flex-wrap justify-between items-center gap-2 pb-2.5 border-b border-slate-100">
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs sm:text-sm text-slate-600 font-semibold">{t('targetDeck')}</span>
                                  <select
                                    value={selectedDeckId}
                                    onChange={(e) => setSelectedDeckId(e.target.value)}
                                    className="text-xs sm:text-sm border border-slate-200 rounded-lg px-2.5 py-1 bg-slate-50 font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-rose-400 cursor-pointer"
                                  >
                                    {decks.map(d => (
                                      <option key={d.id} value={d.id}>{d.name} ({(d.cards || []).length})</option>
                                    ))}
                                  </select>
                                </div>

                                <button
                                  onClick={() => setHideGrammarMeanings(!hideGrammarMeanings)}
                                  className={`text-xs sm:text-sm px-3.5 py-1.5 rounded-xl font-bold transition cursor-pointer shadow-2xs ${hideGrammarMeanings ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                                >
                                  {hideGrammarMeanings ? t('showMeaning') : t('hideMeaning')}
                                </button>
                              </div>

                              <CardCarousel
                                items={analysisResult.grammarList}
                                title={t('grammarCardTitle')}
                                icon="⛩️"
                                renderItem={(g) => (
                                  <div className="text-center w-full max-w-md px-2 py-1">
                                    <span className="inline-block px-3 py-1 bg-rose-100 text-rose-800 font-bold text-sm rounded-md mb-2">
                                      {g.grammar}
                                    </span>
                                    <p className="text-xs sm:text-sm leading-relaxed font-medium mb-3">
                                      <span className={hideGrammarMeanings ? 'bg-slate-800 text-slate-800 select-none rounded px-2' : 'text-slate-800'}>
                                        {getLocalizedText(g.explanation, cardLang)}
                                      </span>
                                    </p>
                                    <button
                                      onClick={() => handleAddGrammarToDeck(g, cardLang)}
                                      className="px-4 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs sm:text-sm font-bold rounded-xl transition shadow-2xs active:scale-95 cursor-pointer"
                                    >
                                      {t('addWordBtn')}
                                    </button>
                                  </div>
                                )}
                              />
                            </div>
                          )}
                        </>
                      );
                    })()}
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
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-2xs cursor-pointer"
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
                      <div className="flex justify-between items-start mb-1.5 gap-2">
                        <h3 className="font-bold text-slate-800 text-xs sm:text-sm truncate max-w-[180px]">{deck.name}</h3>
                        {decks.length > 1 && (
                          <button
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              e.preventDefault();
                              openDeleteModal(deck.id, deck.name); 
                            }}
                            className="text-xs text-rose-500 hover:text-rose-700 font-bold p-1 bg-rose-50 hover:bg-rose-100 rounded transition cursor-pointer shrink-0"
                          >
                            {t('delete')}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{t('savedWordsLabel')}{(deck.cards || []).length}{t('unitCount')}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-[#FFFFFF] p-4 rounded-2xl shadow-xs border border-rose-100">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b">
                    <div className="flex items-center space-x-2">
                      <span className="px-2.5 py-1 bg-rose-100 text-rose-700 font-bold text-xs sm:text-sm rounded-md max-w-[150px] truncate">
                        {currentActiveDeck.name}
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-slate-800">{t('wordCardListTitle')}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleExportAnki}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs sm:text-sm rounded-lg transition flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <span>{t('exportAnki')}</span>
                      </button>
                      <button
                        onClick={handlePrintTestSheet}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs sm:text-sm rounded-lg transition flex items-center gap-1 shadow-2xs cursor-pointer"
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
                      className="w-full text-xs sm:text-sm p-2.5 border border-slate-200 rounded-xl outline-none bg-slate-50 focus:bg-white focus:border-rose-400"
                    />
                  </div>

                  {filteredCards.length === 0 ? (
                    <p className="text-sm sm:text-base font-medium text-slate-400 py-8 text-center">
                      {searchKeyword ? t('noSearchWords') : t('noSavedWords')}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {filteredCards.map(card => (
                        <div key={card.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center">
                          <div>
                            <div className="flex items-baseline space-x-1.5">
                              <span className="font-bold text-xs sm:text-sm text-slate-900">{card.word}</span>
                              <span className="text-xs text-rose-600 font-semibold">[{card.reading}]</span>
                              <button
                                onClick={() => toggleSpeech(card.word)}
                                className={`text-xs p-0.5 rounded transition cursor-pointer ${
                                  speakingText === card.word
                                    ? 'bg-rose-600 text-white font-bold border border-rose-700'
                                    : 'text-slate-400 hover:text-amber-600'
                                }`}
                              >
                                {speakingText === card.word ? '⏹️' : '🔊'}
                              </button>
                              {card.jlpt && <span className="text-[10px] bg-rose-100 text-rose-700 px-1 py-0.5 rounded font-bold">{card.jlpt}</span>}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{getLocalizedPOS(card.partOfSpeech, lang)} • {getLocalizedText(card.meaning, lang)}</p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleDeleteCard(selectedDeckId, card.id || '', card.word);
                            }}
                            className="text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 font-bold border border-rose-200 bg-white rounded-md transition cursor-pointer"
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
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-sm">{t('quizLockedDesc')}</p>
                    <button
                      onClick={() => setIsPricingModalOpen(true)}
                      className="mt-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-lg transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <span>👑</span>
                      <span>{payModalI18n.buyBtn}</span>
                    </button>
                  </div>
                ) : !quizState ? (
                  <div className="p-5 space-y-4">
                    <div className="text-center space-y-1">
                      <span className="text-3xl block">🎯</span>
                      <h2 className="text-base sm:text-lg font-bold text-slate-800">{t('quizTitle')}</h2>
                      <p className="text-xs sm:text-sm text-slate-500">{t('quizSelectDesc')}</p>
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
                              <span className="text-xs sm:text-sm font-bold text-slate-800 truncate max-w-[180px]">{deck.name}</span>
                            </div>
                            <span className="text-xs text-slate-400">{(deck.cards || []).length}{t('unitCount')}</span>
                          </label>
                        );
                      })}
                    </div>

                    <button
                      onClick={startQuiz}
                      className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow transition text-xs sm:text-sm cursor-pointer"
                    >
                      {t('quizStartBtn')}
                    </button>
                  </div>
                ) : quizState.isFinished ? (
                  <div className="p-6 text-center space-y-3">
                    <span className="text-4xl block">🎉</span>
                    <h2 className="text-base sm:text-lg font-bold text-slate-800">{t('quizCompleteTitle')}</h2>
                    <p className="text-xs sm:text-sm text-slate-600">
                      {quizState.quizCards.length} {t('unitCount')} 중 <span className="text-rose-600 font-bold">{quizState.score}</span> {t('quizScoreText')}
                    </p>
                    <button
                      onClick={() => setQuizState(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs sm:text-sm rounded-xl cursor-pointer"
                    >
                      {t('quizBackBtn')}
                    </button>
                  </div>
                ) : (
                  <div className="p-5 space-y-5">
                    <div className="flex justify-between items-center text-xs sm:text-sm text-slate-400 border-b pb-2">
                      <span>{quizState.currentCardIndex + 1} / {quizState.quizCards.length}</span>
                      <button
                        onClick={() => {
                          showConfirm(t('quizSurrenderConfirm'), () => setQuizState(null));
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded text-xs cursor-pointer"
                      >
                        {t('quizSurrenderBtn')}
                      </button>
                    </div>

                    <div className="text-center py-4 bg-[#FAF8F5] rounded-xl border border-amber-100">
                      <div className="flex justify-center items-center gap-1.5 mb-1">
                        <span className="text-xl sm:text-2xl font-bold text-slate-900">
                          {quizState.quizCards[quizState.currentCardIndex].word}
                        </span>
                        <button
                          onClick={() => toggleSpeech(quizState.quizCards[quizState.currentCardIndex].word)}
                          className={`text-sm p-1 rounded transition cursor-pointer ${
                            speakingText === quizState.quizCards[quizState.currentCardIndex].word
                              ? 'bg-rose-600 text-white hover:bg-rose-700 border border-rose-700'
                              : 'text-slate-400 hover:text-amber-600'
                          }`}
                        >
                          {speakingText === quizState.quizCards[quizState.currentCardIndex].word ? '⏹️' : '🔊'}
                        </button>
                      </div>
                      <span className="text-xs sm:text-sm text-rose-600 font-semibold">
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
                            className={`w-full p-3 border rounded-xl text-left text-xs sm:text-sm font-medium transition cursor-pointer ${btnStyle}`}
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

          <aside className="hidden lg:flex lg:col-span-3 bg-white border border-rose-100 shadow-xs rounded-2xl p-3.5 flex-col h-fit sticky top-16 space-y-3">
            <div className="bg-[#FAF8F5] p-3 rounded-xl border border-amber-100">
              <div className="flex justify-between items-center mb-2 pb-1 border-b border-amber-200/60">
                <h3 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1">
                  <span>🈩</span> {t('gojuonChart')}
                </h3>
                <div className="flex bg-slate-200 p-0.5 rounded text-[10px] font-bold">
                  <button
                    onClick={() => setKanaTab('hiragana')}
                    className={`px-2 py-0.5 rounded transition cursor-pointer ${kanaTab === 'hiragana' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600'}`}
                  >
                    {t('hiragana')}
                  </button>
                  <button
                    onClick={() => setKanaTab('katakana')}
                    className={`px-2 py-0.5 rounded transition cursor-pointer ${kanaTab === 'katakana' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600'}`}
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
                        className="text-xs font-semibold bg-white border border-slate-200 rounded py-0.5 cursor-pointer hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 transition"
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
                <h3 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1">
                  <span>🌐</span> {t('recSitesTitle')}
                </h3>
              </div>

              <div className="space-y-2 pr-0.5">
                {(RECOMMENDED_SITES[lang] || RECOMMENDED_SITES['ko']).map((site, idx) => (
                  <a
                    key={idx}
                    href={site.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-2.5 bg-[#FAF8F5] rounded-xl border border-amber-100 hover:border-rose-300 hover:bg-rose-50/50 transition group"
                  >
                    <div className="flex items-center space-x-1 mb-0.5">
                      <span className="text-xs sm:text-sm">{site.icon}</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-rose-600 transition truncate">
                        {site.name}
                      </span>
                      <span className="text-xs text-slate-400 ml-auto">↗</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-snug line-clamp-2">
                      {site.desc}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* 🌸 푸터 영역 🌸 */}
      <footer className="footer-area w-full py-6 flex flex-col items-center justify-center border-t border-slate-200 bg-white mt-12 space-y-2 px-4 text-center">
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
            {lang === 'ko' ? '환불 및 이용 정책' : 'Refund Policy'}
          </button>
        </div>

        <div className="text-[11px] text-slate-500 space-y-1 max-w-2xl leading-relaxed">
          <p>
            {lang === 'ko'
              ? '상호명: YomiYomi | 고객지원: support@yomiyomi-jp.com | 사업자등록번호: 588-26-01979 | 통신판매업신고: 제 2026-순천-7351 호'
              : 'Company: YomiYomi | Support: support@yomiyomi-jp.com | Business ID: 588-26-01979 | E-Commerce Permit: 2026-Suncheon-7351'}
          </p>
          <p className="text-slate-400 text-[10px] pt-0.5">
            Our order process is conducted by our online reseller & Merchant of Record, Lemon Squeezy.
          </p>
        </div>

        <p className="text-[10px] text-slate-400 font-normal select-none tracking-wider pt-1">
          Copyright © 2026 YomiYomi. All rights reserved.
        </p>
      </footer>

      {/* 🌸 요금제 모달 🌸 */}
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

            {currentUser?.isSubscribed ? (
              <div className="text-center py-6 space-y-3">
                <span className="text-4xl block">👑</span>
                <h2 className="text-lg font-black text-slate-900">
                  {lang === 'ko' ? '현재 프리미엄 이용 중입니다' : 'Premium Active'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
                  {lang === 'ko' ? '이미 무제한 서비스 혜택을 이용하고 계십니다.' : 'You are currently enjoying unlimited premium benefits.'}<br />
                  <strong className="text-slate-700 font-bold block mt-1">
                    {lang === 'ko' ? '남은 이용 기간 확인 및 설정은 계정 메뉴(⚙️)에서 가능합니다.' : 'Check remaining days in Account & Settings (⚙️).'}
                  </strong>
                </p>
                <button
                  onClick={() => {
                    setIsPricingModalOpen(false);
                    setIsSettingsModalOpen(true);
                  }}
                  className="mt-2 px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition cursor-pointer"
                >
                  ⚙️ {lang === 'ko' ? '계정 및 이용 정보로 이동' : 'Go to Account & Settings'}
                </button>
              </div>
            ) : (
              <>
                <div className="text-center space-y-1">
                  <span className="text-3xl block">👑</span>
                  <h2 className="text-lg font-black text-slate-900">{payModalI18n.title}</h2>
                  <p className="text-xs sm:text-sm text-slate-500">{payModalI18n.sub}</p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left my-2 space-y-1">
                  <label className="flex items-start space-x-2 text-xs sm:text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreePayPolicy}
                      onChange={(e) => setAgreePayPolicy(e.target.checked)}
                      className="mt-0.5 rounded text-rose-600 focus:ring-rose-400 shrink-0"
                    />
                    <span className="leading-tight text-xs sm:text-sm">
                      {payModalI18n.agree1}
                      <button type="button" onClick={() => openLegalDoc('refund')} className="text-rose-600 underline font-bold">
                        {payModalI18n.agree2}
                      </button>
                      {payModalI18n.agree3}
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* 3개월 이용권 */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between text-center hover:border-rose-300 transition">
                    <div>
                      <span className="text-xs font-bold text-slate-500 block mb-1">
                        {payModalI18n.pass3m}
                      </span>
                      <div className="text-base font-black text-slate-900 mb-1">$12.00 USD</div>
                      <span className="text-xs text-slate-400">
                        {payModalI18n.mo3m}
                      </span>
                    </div>
                    <button
                      disabled={!agreePayPolicy}
                      onClick={() => handleLemonSqueezyPayment(
                        payModalI18n.pass3m, 
                        'https://yomiyomi-jp.lemonsqueezy.com/checkout/buy/c190392a-86b8-4828-a4d6-dd88e54d8e53'
                      )}
                      className="mt-4 w-full py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition cursor-pointer"
                    >
                      {payModalI18n.buyBtn}
                    </button>
                  </div>

                  {/* 1년 이용권 */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between text-center hover:border-rose-300 transition relative">
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      20% OFF
                    </span>
                    <div>
                      <span className="text-xs font-bold text-slate-500 block mb-1">
                        {payModalI18n.pass1y}
                      </span>
                      <div className="text-base font-black text-slate-900 mb-1">$38.40 USD</div>
                      <span className="text-xs text-amber-700 font-semibold">
                        {payModalI18n.mo1y}
                      </span>
                    </div>
                    <button
                      disabled={!agreePayPolicy}
                      onClick={() => handleLemonSqueezyPayment(
                        payModalI18n.pass1y, 
                        'https://yomiyomi-jp.lemonsqueezy.com/checkout/buy/3302e962-c15b-42b1-afda-f4272bd3a424'
                      )}
                      className="mt-4 w-full py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition cursor-pointer"
                    >
                      {payModalI18n.buyBtn}
                    </button>
                  </div>

                  {/* 평생 이용권 */}
                  <div className="p-4 bg-rose-50/80 border border-rose-300 rounded-2xl flex flex-col justify-between text-center relative shadow-xs">
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      BEST
                    </span>
                    <div>
                      <span className="text-xs font-bold text-rose-700 block mb-1">
                        {payModalI18n.passLife}
                      </span>
                      <div className="text-base font-black text-rose-900 mb-1">$45.00 USD</div>
                      <span className="text-xs text-rose-600 font-bold">
                        {payModalI18n.lifeDesc}
                      </span>
                    </div>
                    <button
                      disabled={!agreePayPolicy}
                      onClick={() => handleLemonSqueezyPayment(
                        payModalI18n.passLife, 
                        'https://yomiyomi-jp.lemonsqueezy.com/checkout/buy/c74e6951-6422-4bfe-a38d-ed18e989371d'
                      )}
                      className="mt-4 w-full py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition cursor-pointer"
                    >
                      {payModalI18n.buyBtn}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-400 text-center">
                  {payModalI18n.footerNotice}
                </p>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* 단어장 생성 모달 */}
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
              <div>
                <input
                  type="text"
                  maxLength={20}
                  value={newDeckInputName}
                  onChange={(e) => setNewDeckInputName(e.target.value.slice(0, 20))}
                  placeholder={t('newDeckModalPlaceholder')}
                  className="w-full text-xs sm:text-sm p-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-400 bg-slate-50 font-medium text-center"
                />
                <p className="text-[10px] text-slate-400 text-right mt-1 font-semibold">
                  {newDeckInputName.length} / 20
                </p>
              </div>

              <div className="flex space-x-2 pt-1">
                <button
                  onClick={() => setIsNewDeckModalOpen(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs sm:text-sm rounded-xl transition cursor-pointer"
                >
                  {t('cancelBtn')}
                </button>
                <button
                  onClick={confirmCreateDeck}
                  disabled={!newDeckInputName.trim()}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition cursor-pointer"
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
            <p className="text-xs sm:text-sm font-bold text-slate-800 leading-relaxed whitespace-pre-wrap">
              {customModal.message}
            </p>
            <div className="flex justify-center space-x-2 pt-2">
              {customModal.type === 'confirm' && (
                <button
                  onClick={closeCustomModal}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs sm:text-sm rounded-xl transition cursor-pointer"
                >
                  {t('cancelBtn')}
                </button>
              )}
              <button
                onClick={() => {
                  if (customModal.onConfirm) customModal.onConfirm();
                  closeCustomModal();
                }}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition cursor-pointer"
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
              <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed whitespace-pre-wrap">
                {t('deckDeleteModalDesc')}
              </p>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={deleteModalState.inputName}
                onChange={(e) => setDeleteModalState(prev => ({ ...prev, inputName: e.target.value }))}
                placeholder={deleteModalState.deckName}
                className="w-full text-xs sm:text-sm p-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-400 bg-slate-50 font-medium text-center"
              />

              <div className="flex space-x-2 pt-1">
                <button
                  onClick={() => setDeleteModalState({ isOpen: false, deckId: '', deckName: '', inputName: '' })}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs sm:text-sm rounded-xl transition cursor-pointer"
                >
                  {t('cancelBtn')}
                </button>
                <button
                  onClick={confirmDeleteDeck}
                  disabled={deleteModalState.inputName.trim() !== deleteModalState.deckName.trim()}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition cursor-pointer"
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
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {authMode === 'login' ? t('loginSub') : t('signupSub')}
              </p>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl mb-4 text-xs sm:text-sm font-bold">
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
                  <label className="block text-xs font-bold text-slate-600 mb-1">{t('nicknameLabel')}</label>
                  <input
                    type="text"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full text-xs sm:text-sm p-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-400 bg-slate-50"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">{t('emailLabel')}</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="example@yomiyomi.com"
                  className="w-full text-xs sm:text-sm p-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-400 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">{t('passwordLabel')}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder={authMode === 'signup' ? "8+ chars with special symbol" : "••••••••"}
                    className="w-full text-xs sm:text-sm p-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-400 bg-slate-50 pr-8"
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
                  <div className="mt-1.5 space-y-0.5 text-xs font-medium">
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
                  <label className="block text-xs font-bold text-slate-600 mb-1">{t('confirmPasswordLabel')}</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full text-xs sm:text-sm p-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-400 bg-slate-50"
                  />
                  {authConfirmPassword.length > 0 && (
                    <p className={`mt-1 text-xs font-medium ${isPasswordMatchValid ? 'text-emerald-600 font-bold' : 'text-rose-500'}`}>
                      {isPasswordMatchValid ? '✓ Passwords match' : '✕ Passwords do not match'}
                    </p>
                  )}
                </div>
              )}

              {authMode === 'signup' && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100 text-left">
                  <label className="flex items-center space-x-2 text-xs text-slate-600 cursor-pointer">
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

                  <label className="flex items-center space-x-2 text-xs text-slate-600 cursor-pointer">
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
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition mt-2 cursor-pointer"
              >
                {authMode === 'login' ? t('loginBtn') : t('signupBtn')}
              </button>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400 font-semibold">{t('or')}</span></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
            >
              <span>🌐</span> {t('googleLogin')}
            </button>
          </div>
        </div>
      )}

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
              <p className="text-xs sm:text-sm text-slate-700 font-bold mt-1">{currentUser.name}</p>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{currentUser.email}</p>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-sm">👑</span>
                    <span className="text-xs sm:text-sm font-bold text-slate-800">{lang === 'ko' ? '프리미엄 멤버십' : 'Premium Access'}</span>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    currentUser.isSubscribed 
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {currentUser.isSubscribed 
                      ? (lang === 'ko' ? '이용 중' : 'Active')
                      : (lang === 'ko' ? '무료 회원' : 'Free Plan')}
                  </span>
                </div>

                <p className="text-xs text-slate-500">
                  {currentUser.isSubscribed 
                    ? (lang === 'ko' ? `현재 [${currentUser.subscriptionPlan || 'Premium'}] 이용권을 사용 중입니다.` : `Currently using [${currentUser.subscriptionPlan || 'Premium'}].`)
                    : t('freePlanUsing')}
                </p>

                {currentUser.isSubscribed && currentUser.subscriptionEndDate && (
                  <div className="pt-2 border-t border-slate-200/60 text-xs space-y-1">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>{lang === 'ko' ? '이용 만료일:' : 'Expiration Date:'}</span>
                      <span className="font-bold text-slate-800">{currentUser.subscriptionEndDate}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">{lang === 'ko' ? '남은 이용 기간:' : 'Days Remaining:'}</span>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-full text-xs">
                        {daysLeft}{t('daysLeftLabel')}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 text-center">
                <button
                  onClick={handleDeleteAccount}
                  className="text-xs sm:text-sm text-slate-400 hover:text-rose-600 underline font-semibold transition cursor-pointer"
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
          zoom: 1.25;
        }

        body {
          line-height: 1.6;
        }

        .footer-area {
          zoom: 0.8;
        }

        .app-logo-text, .app-logo-text * {
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        }

        html[lang="zh-CN"] body *:not(.app-logo-text):not(.app-logo-text *),
        html[lang="zh-TW"] body *:not(.app-logo-text):not(.app-logo-text *) {
          font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif !important;
          letter-spacing: 0.02em !important;
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

        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #f1f5f9; border-radius: 4px; }
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