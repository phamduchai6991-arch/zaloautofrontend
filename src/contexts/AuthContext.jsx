import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEY = 'autozalo_user';
const API_BASE = import.meta.env.VITE_BACKEND_URL || '';

// Margin: treat tokens as expired 2 minutes before actual expiry
const EXPIRY_MARGIN_MS = 2 * 60 * 1000;

function getTokenExpiresAt(user) {
  if (!user?.authToken) return 0;

  // For our own session token: decode exp claim
  if (user.authType === 'autozalo-session') {
    if (user.expiresAt) return user.expiresAt;
    try {
      const payload = JSON.parse(atob(user.authToken.split('.')[1]));
      return (payload.exp || 0) * 1000;
    } catch {
      return 0;
    }
  }

  // For id_token: decode JWT exp claim
  if (user.authType === 'google-id-token') {
    try {
      const payload = JSON.parse(atob(user.authToken.split('.')[1]));
      return (payload.exp || 0) * 1000;
    } catch {
      return 0;
    }
  }

  // For access_token: use stored expiresAt (set at login time)
  if (user.expiresAt) return user.expiresAt;

  // Fallback: no expiry info, consider valid for 50 min from now
  return Date.now() + 50 * 60 * 1000;
}

function isTokenExpired(user) {
  const expiresAt = getTokenExpiresAt(user);
  return expiresAt > 0 && Date.now() + EXPIRY_MARGIN_MS >= expiresAt;
}

async function exchangeForSessionToken(googleToken, googleAuthType) {
  if (!API_BASE) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleToken, googleAuthType }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.ok && data.sessionToken) {
      console.log('[Auth] Đã đổi Google token → session token dài hạn (30 ngày).');
      return data;
    }
    return null;
  } catch {
    console.warn('[Auth] Không thể đổi session token, sẽ dùng Google token.');
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : null;
      // Clear immediately if token is already expired
      if (parsed && isTokenExpired(parsed)) {
        console.warn('[Auth] Stored Google token đã hết hạn, cần đăng nhập lại.');
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const [authExpired, setAuthExpired] = useState(false);

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      setAuthExpired(false);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  // Periodically check token expiry (every 60s)
  useEffect(() => {
    if (!user?.authToken) return undefined;

    const check = () => {
      if (isTokenExpired(user)) {
        console.warn('[Auth] Token hết hạn, yêu cầu đăng nhập lại.');
        setAuthExpired(true);
      }
    };

    check(); // Check immediately
    const intervalId = setInterval(check, 60_000);
    return () => clearInterval(intervalId);
  }, [user]);

  // Auto-upgrade: if user still has a valid Google token, exchange for session token
  const upgradeAttemptedRef = React.useRef(false);
  useEffect(() => {
    if (!user?.authToken || upgradeAttemptedRef.current) return;
    if (user.authType === 'autozalo-session') return; // already upgraded
    if (isTokenExpired(user)) return; // too late

    upgradeAttemptedRef.current = true;
    exchangeForSessionToken(user.authToken, user.authType).then((session) => {
      if (session) {
        setUser((prev) => prev ? {
          ...prev,
          authType: 'autozalo-session',
          authToken: session.sessionToken,
          expiresAt: session.expiresAt,
        } : prev);
      }
    });
  }, [user]);

  // Called by API consumers when they receive a 401
  const handleAuthError = useCallback(() => {
    console.warn('[Auth] Nhận được 401 từ server, token có thể đã hết hạn.');
    setAuthExpired(true);
  }, []);

  const getAuthHeaders = React.useCallback(() => {
    if (!user?.authToken || !user?.authType || isTokenExpired(user)) {
      return {};
    }

    return {
      Authorization: `Bearer ${user.authToken}`,
      'X-AutoZalo-Auth-Type': user.authType,
    };
  }, [user?.authToken, user?.authType]);

  useEffect(() => {
    if (!user?.sub || !user?.email) return undefined;

    let cancelled = false;

    const syncUser = async () => {
      try {
        await fetch(`${API_BASE}/api/users/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.sub,
            email: user.email,
            name: user.name,
            picture: user.picture,
          }),
          keepalive: true,
        });
      } catch {
        // Ignore sync failures; user should still be able to use the app.
      }
    };

    syncUser();
    const intervalId = setInterval(() => {
      if (!cancelled) syncUser();
    }, 2 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [user]);

  const login = (profile, auth = {}) => {
    const authType = auth?.authType || profile?.authType || '';
    const authToken = auth?.authToken || profile?.authToken || '';

    // Compute expiresAt for the stored token
    let expiresAt = 0;
    if (authType === 'google-id-token' && authToken) {
      try {
        const payload = JSON.parse(atob(authToken.split('.')[1]));
        expiresAt = (payload.exp || 0) * 1000;
      } catch { /* ignore */ }
    } else if (authType === 'google-access-token') {
      // Google access tokens typically expire in 1 hour
      expiresAt = Date.now() + (auth?.expiresIn || 3600) * 1000;
    } else if (authType === 'autozalo-session') {
      expiresAt = auth?.expiresAt || (Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    const newUser = { ...profile, authType, authToken, expiresAt };
    setUser(newUser);

    // Exchange short-lived Google token for long-lived session token (fire-and-forget)
    if (API_BASE && (authType === 'google-id-token' || authType === 'google-access-token')) {
      exchangeForSessionToken(authToken, authType).then((session) => {
        if (session) {
          setUser((prev) => prev ? {
            ...prev,
            authType: 'autozalo-session',
            authToken: session.sessionToken,
            expiresAt: session.expiresAt,
          } : prev);
        }
      });
    }
  };
  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout, getAuthHeaders, authExpired, handleAuthError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
