import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';
const SUBSCRIPTION_CACHE_KEY = 'autozalo_subscription_cache';

export const PLAN_LIMITS = {
  free: 1,
  basic: 1,
  plus: 3,
  pro: 10,
};

export const PLAN_LABELS = {
  free: 'Free',
  basic: 'Basic',
  plus: 'Plus',
  pro: 'Pro',
};

// Plan tier rank: higher = more features
const PLAN_RANK = { free: 0, basic: 1, plus: 2, pro: 3 };

// Minimum plan required for each gated feature
export const FEATURE_MIN_PLAN = {
  // BASIC features (available to all paid plans)
  send_message:       'basic',
  friend_request:     'basic',
  remove_friend:      'basic',
  undo_friend_request:'basic',
  leave_group:        'basic',
  reject_friend_request:'basic',
  accept_friend_request:'basic',
  // PLUS features
  ai_rewrite:         'plus',
  quick_message:      'plus',
  classify_contact:   'plus',
  manage_conversation:'plus',
  mute_notification:  'plus',
  unmute_notification:'plus',
  // PRO features
  pull_group:         'pro',
  join_group:         'pro',
  hidden_members:     'pro',
};

export function canUsePlanFeature(feature, currentPlan) {
  const minPlan = FEATURE_MIN_PLAN[feature];
  if (!minPlan) return true; // unknown feature → allow
  const minRank = PLAN_RANK[minPlan] || 0;
  const currentRank = PLAN_RANK[currentPlan] || 0;
  return currentRank >= minRank;
}

export function getRequiredPlanLabel(feature) {
  const minPlan = FEATURE_MIN_PLAN[feature];
  return minPlan ? (PLAN_LABELS[minPlan] || minPlan).toUpperCase() : '';
}

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
      return null;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (user.email) params.set('email', user.email);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${API_BASE}/api/payment/subscription/${encodeURIComponent(user.sub)}${suffix}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const nextSubscription = data.subscription || null;
        setSubscription(nextSubscription);
        writeCachedSubscription(user.sub, nextSubscription);
        return nextSubscription;
      } else {
        // Server error (e.g. cold start, 500) — keep existing subscription, don't reset to free
        console.warn('[Subscription] Server trả lỗi', res.status, '— giữ nguyên gói hiện tại.');
        const fallbackSubscription = getCachedSubscription(user.sub);
        setSubscription((prev) => prev || fallbackSubscription);
        return fallbackSubscription;
      }
    } catch {
      const fallbackSubscription = getCachedSubscription(user.sub);
      setSubscription((prev) => prev || fallbackSubscription);
      return fallbackSubscription;
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

  const planKey = subscription?.status === 'active' ? subscription.planKey : 'free';
  const maxAccounts = PLAN_LIMITS[planKey] ?? PLAN_LIMITS.free;
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
