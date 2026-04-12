import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';
const SUBSCRIPTION_CACHE_KEY = 'autozalo_subscription_cache';

export const PLAN_LIMITS = {
  basic: 1,
  plus: 3,
  pro: 10,
};

export const PLAN_LABELS = {
  basic: 'Basic',
  plus: 'Plus',
  pro: 'Pro',
};

const SubscriptionContext = createContext(null);
const SUBSCRIPTION_CHANGED_EVENT = 'autozalo:subscription-changed';

function loadSubscriptionCache() {
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function getCachedSubscription(userId) {
  if (!userId) return null;
  const cache = loadSubscriptionCache();
  return cache[userId] || null;
}

function writeCachedSubscription(userId, subscription) {
  if (!userId) return;
  const cache = loadSubscriptionCache();
  if (subscription) {
    cache[userId] = subscription;
  } else {
    delete cache[userId];
  }

  try {
    localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage failures.
  }
}

export function SubscriptionProvider({ children }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.sub) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    const cached = getCachedSubscription(user.sub);
    setSubscription(cached);
    setLoading(true);
  }, [user?.sub]);

  const fetchSubscription = useCallback(async () => {
    if (!user?.sub) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/payment/subscription/${encodeURIComponent(user.sub)}`);
      if (res.ok) {
        const data = await res.json();
        const nextSubscription = data.subscription || null;
        setSubscription(nextSubscription);
        writeCachedSubscription(user.sub, nextSubscription);
      } else {
        setSubscription(null);
        writeCachedSubscription(user.sub, null);
      }
    } catch {
      setSubscription((prev) => prev || getCachedSubscription(user.sub));
    } finally {
      setLoading(false);
    }
  }, [user?.sub]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  useEffect(() => {
    if (!user?.sub) return undefined;

    const handleFocus = () => {
      fetchSubscription();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSubscription();
      }
    };

    const handleSubscriptionChanged = (event) => {
      const targetUserId = event?.detail?.userId;
      if (!targetUserId || targetUserId === user.sub) {
        fetchSubscription();
      }
    };

    const intervalId = setInterval(() => {
      fetchSubscription();
    }, 60000);

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener(SUBSCRIPTION_CHANGED_EVENT, handleSubscriptionChanged);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener(SUBSCRIPTION_CHANGED_EVENT, handleSubscriptionChanged);
    };
  }, [fetchSubscription, user?.sub]);

  const planKey = subscription?.status === 'active' ? subscription.planKey : null;
  const maxAccounts = planKey ? (PLAN_LIMITS[planKey] ?? 0) : 0;
  const isActive = subscription?.status === 'active';
  const isExpired = subscription?.status === 'expired';

  const daysLeft = (() => {
    if (!subscription?.expiresAt) return 0;
    const diff = new Date(subscription.expiresAt) - new Date();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  })();

  return (
    <SubscriptionContext.Provider
      value={{ subscription, planKey, maxAccounts, isActive, isExpired, daysLeft, loading, refetch: fetchSubscription }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be inside SubscriptionProvider');
  return ctx;
}

export function notifySubscriptionChanged(userId) {
  window.dispatchEvent(new CustomEvent(SUBSCRIPTION_CHANGED_EVENT, {
    detail: { userId: userId || '' },
  }));
}
