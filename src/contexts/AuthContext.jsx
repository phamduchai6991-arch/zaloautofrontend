import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEY = 'autozalo_user';
const API_BASE = import.meta.env.VITE_BACKEND_URL || '';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

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

  const login = (profile) => setUser(profile);
  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
