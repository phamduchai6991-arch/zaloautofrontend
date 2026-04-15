const LIMITS_KEY = 'zt_daily_limits';
const USAGE_KEY = 'zt_daily_usage';

const DEFAULT_LIMITS = { messages: 0, friendRequests: 0, joinGroups: 0 };

function todayKey() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

// ─── Limits (per account) ───

export function getAllLimits() {
  try {
    return JSON.parse(localStorage.getItem(LIMITS_KEY)) || {};
  } catch {
    return {};
  }
}

export function getAccountLimits(accountId) {
  const all = getAllLimits();
  return { ...DEFAULT_LIMITS, ...all[accountId] };
}

export function setAccountLimits(accountId, limits) {
  const all = getAllLimits();
  all[accountId] = { ...DEFAULT_LIMITS, ...all[accountId], ...limits };
  localStorage.setItem(LIMITS_KEY, JSON.stringify(all));
}

export function setAllAccountsLimits(limitsMap) {
  localStorage.setItem(LIMITS_KEY, JSON.stringify(limitsMap));
}

// ─── Usage tracking (per account, per day) ───

function getAllUsage() {
  try {
    return JSON.parse(localStorage.getItem(USAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function cleanOldUsage(usage) {
  const today = todayKey();
  const cleaned = {};
  for (const [accountId, days] of Object.entries(usage)) {
    if (days[today]) {
      cleaned[accountId] = { [today]: days[today] };
    }
  }
  return cleaned;
}

export function getAccountUsage(accountId) {
  const usage = getAllUsage();
  const today = todayKey();
  return { messages: 0, friendRequests: 0, joinGroups: 0, ...usage[accountId]?.[today] };
}

export function addAccountUsage(accountId, type, count = 1) {
  const usage = cleanOldUsage(getAllUsage());
  const today = todayKey();
  if (!usage[accountId]) usage[accountId] = {};
  if (!usage[accountId][today]) usage[accountId][today] = { messages: 0, friendRequests: 0, joinGroups: 0 };
  usage[accountId][today][type] = (usage[accountId][today][type] || 0) + count;
  localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
}

// ─── Remaining quota ───

export function getRemainingQuota(accountId) {
  const limits = getAccountLimits(accountId);
  const usage = getAccountUsage(accountId);
  return {
    messages: limits.messages > 0 ? Math.max(0, limits.messages - usage.messages) : Infinity,
    friendRequests: limits.friendRequests > 0 ? Math.max(0, limits.friendRequests - usage.friendRequests) : Infinity,
    joinGroups: limits.joinGroups > 0 ? Math.max(0, limits.joinGroups - usage.joinGroups) : Infinity,
  };
}

export function isOverLimit(accountId, type) {
  const limits = getAccountLimits(accountId);
  if (!limits[type] || limits[type] <= 0) return false; // 0 = no limit
  const usage = getAccountUsage(accountId);
  return usage[type] >= limits[type];
}
