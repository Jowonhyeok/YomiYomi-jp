import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase'; // 프로젝트의 firebase 설정 경로에 맞춰 수정

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Firestore에서 유저 최신 데이터(구독 상태, 사용량) 가져오기
  const fetchUserData = async (currentUser) => {
    if (!currentUser) {
      setUserData(null);
      return;
    }

    try {
      const idToken = await currentUser.getIdToken(true);
      const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'yomiyomi-jp';

      const res = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${currentUser.uid}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      );

      if (res.ok) {
        const docJson = await res.json();
        const fields = docJson.fields || {};

        setUserData({
          isSubscribed: fields.isSubscribed?.booleanValue || false,
          subscriptionPlan: fields.subscriptionPlan?.stringValue || '',
          subscriptionEndDate: fields.subscriptionEndDate?.stringValue || '',
          dailyAnalyzeCount: parseInt(fields.dailyAnalyzeCount?.integerValue || '0', 10),
          lastAnalyzeDate: fields.lastAnalyzeDate?.stringValue || '',
        });
      }
    } catch (error) {
      console.error('[Fetch UserData Error]:', error);
    }
  };

  // 외부(결제 완료 시)에서 유저 상태를 강제 갱신하는 함수
  const refreshUserData = async () => {
    if (user) {
      await fetchUserData(user);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchUserData(currentUser);
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, loading, refreshUserData }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);