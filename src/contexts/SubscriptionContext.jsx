import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';

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

export function SubscriptionProvider({ children }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchSubscription = useCallback(async () => {
    if (!user?.sub) {
      setSubscription(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/payment/subscription/${encodeURIComponent(user.sub)}`);
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription || null);
      } else {
        setSubscription(null);
      }
    } catch {
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [user?.sub]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

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
