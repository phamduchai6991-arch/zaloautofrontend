import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  cancelAccountSync,
  checkExtension,
  checkExtensionStatus,
  closeIncognito,
  confirmAccountSync,
  getExtensionStatusSnapshot,
  onExtensionMessage,
  openZaloLogin,
} from '../utils/extensionBridge';
import { syncZaloCommonData } from '../utils/zaloRequestBuilder';
import { useAuth } from './AuthContext';

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';
const STORAGE_KEY = 'zalotool_accounts_cache';
const ACTIVE_KEY = 'zalotool_active_idx';
const MIGRATION_KEY = 'zalotool_accounts_migrated';
const INITIAL_SYNC_STATE = {
  phase: 'idle',
  requestId: null,
  mode: 'add',
  summary: null,
  error: '',
  startedAt: null,
  timestamp: 0,
  requiresConfirmation: false,
};
const INITIAL_EXTENSION_STATUS = {
  active: false,
  phase: 'idle',
  reason: 'Đang chờ kiểm tra extension.',
  hints: [],
  injected: false,
  checkedAt: 0,
};

function hasStoredSession(account) {
  const hasCookies = Boolean(
    (Array.isArray(account?.cookies) && account.cookies.length > 0) ||
    (typeof account?.cookie === 'string' && account.cookie.trim()),
  );
  return Boolean(account?.imei && hasCookies);
}

function getStoredAccountSyncStatus(account) {
  if (typeof account?.syncStatus === 'string') {
    return account.syncStatus;
  }
  return hasStoredSession(account) ? 'ready' : 'idle';
}

function isBusySyncPhase(phase) {
  return ['waiting_for_login', 'awaiting_sync_confirmation', 'syncing_account'].includes(phase);
}

function isVisibleSyncPhase(phase) {
  return ['waiting_for_login', 'awaiting_sync_confirmation', 'syncing_account'].includes(phase);
}

function isExtensionInvalidationError(value) {
  return /extension context invalidated|tai lai trang sau khi reload extension/i.test(String(value || ''));
}

function normalizeAccountRecord(account, index = 0) {
  return {
    id: account.id || account.zaloId || account.userId || account.cookie || `legacy_${index}`,
    ownerUserId: account.ownerUserId || '',
    cookie: account.cookie || '',
    cookies: Array.isArray(account.cookies) ? account.cookies : [],
    cookieCount: account.cookieCount || 0,
    name: account.name || account.displayName || account.zaloName || 'Tài khoản Zalo',
    avatar: account.avatar || account.zaloAvatar || '',
    phone: account.phone || account.phoneNumber || account.zaloPhone || '',
    imei: account.imei || '',
    userAgent: account.userAgent || navigator.userAgent,
    decryptKey: account.decryptKey || '',
    commonParams: account.commonParams || '',
    labelVersion: account.labelVersion || null,
    commonData: account.commonData || null,
    userId: account.userId || account.zaloId || '',
    UIN: account.UIN || '',
    sessionSource: Array.isArray(account.sessionSource) ? account.sessionSource : [],
    syncedAt: account.syncedAt || null,
    friends: Array.isArray(account.friends) ? account.friends : [],
    groups: Array.isArray(account.groups) ? account.groups : [],
    sentFriendRequests: Array.isArray(account.sentFriendRequests) ? account.sentFriendRequests : [],
    receivedFriendRequests: Array.isArray(account.receivedFriendRequests) ? account.receivedFriendRequests : [],
    serviceSyncedAt: account.serviceSyncedAt || null,
    syncStatus: getStoredAccountSyncStatus(account),
    addedAt: account.addedAt || null,
    lastUsedAt: account.lastUsedAt || null,
  };
}

function buildAccountsStorageKey(googleUserId) {
  return `${STORAGE_KEY}:${googleUserId || 'guest'}`;
}

function buildActiveStorageKey(googleUserId) {
  return `${ACTIVE_KEY}:${googleUserId || 'guest'}`;
}

function buildMigrationStorageKey(googleUserId) {
  return `${MIGRATION_KEY}:${googleUserId || 'guest'}`;
}

function loadAccounts(googleUserId) {
  try {
    const raw = localStorage.getItem(buildAccountsStorageKey(googleUserId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((account, index) => normalizeAccountRecord(account, index));
  } catch { return []; }
}

function clampActiveIndex(index, count) {
  if (!count) return -1;
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.min(index, count - 1);
}

function loadActiveIndex(googleUserId, count = 0) {
  try {
    const raw = localStorage.getItem(buildActiveStorageKey(googleUserId));
    const idx = raw !== null ? Number(raw) : -1;
    return clampActiveIndex(idx, count);
  } catch { return -1; }
}

function canSyncAccount(account) {
  return hasStoredSession(account);
}

// ─── Server-side account tracking helpers ────────────────

async function serverRegisterAccount({ userId, account, authHeaders = {} }) {
  const zaloId = account?.id || account?.userId || account?.zaloId || '';
  const zaloName = account?.name || account?.displayName || account?.zaloName || '';
  const zaloAvatar = account?.avatar || account?.zaloAvatar || '';
  const zaloPhone = account?.phone || account?.phoneNumber || account?.zaloPhone || '';
  if (!API_BASE || !userId || !zaloId) return null;
  try {
    const res = await fetch(`${API_BASE}/api/accounts/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ userId, zaloId, zaloName, zaloAvatar, zaloPhone, accountData: account }),
    });
    return await res.json();
  } catch (e) {
    console.warn('[Account] Server register failed:', e.message);
    return null;
  }
}

async function serverRemoveAccount(userId, zaloId, authHeaders = {}) {
  if (!API_BASE || !userId || !zaloId) return;
  try {
    await fetch(`${API_BASE}/api/accounts/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ userId, zaloId }),
    });
  } catch (e) {
    console.warn('[Account] Server remove failed:', e.message);
  }
}

async function serverGetAccounts(userId, authHeaders = {}, onAuthError) {
  if (!API_BASE || !userId) return [];
  try {
    const res = await fetch(`${API_BASE}/api/accounts?userId=${encodeURIComponent(userId)}`, {
      cache: 'no-store',
      headers: { ...authHeaders },
    });
    if (res.status === 401 || res.status === 403) {
      console.warn('[Account] Server trả về', res.status, '— token Google có thể đã hết hạn.');
      if (typeof onAuthError === 'function') onAuthError();
      return null;
    }
    const data = await res.json();
    return data.ok ? data.accounts : [];
  } catch {
    return null;
  }
}

async function persistAccountToServer(userId, account, authHeaders = {}) {
  if (!userId || !account?.id) return null;
  return serverRegisterAccount({ userId, account, authHeaders });
}

const AccountContext = createContext(null);

export function AccountProvider({ children }) {
  const { user, getAuthHeaders, handleAuthError } = useAuth();
  const googleUserId = user?.sub || '';
  const extensionInvalidatedRef = useRef(false);
  const [extensionActive, setExtensionActive] = useState(false);
  const [extensionChecked, setExtensionChecked] = useState(false);
  const [extensionStatus, setExtensionStatus] = useState(() => ({
    ...INITIAL_EXTENSION_STATUS,
    ...getExtensionStatusSnapshot(),
  }));
  const [accounts, setAccounts] = useState([]);
  const [activeAccountIndex, setActiveAccountIndex] = useState(-1);
  const [syncState, setSyncState] = useState(INITIAL_SYNC_STATE);
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sentFriendRequests, setSentFriendRequests] = useState([]);
  const [receivedFriendRequests, setReceivedFriendRequests] = useState([]);
  const [serverAccountCount, setServerAccountCount] = useState(0);

  const refreshServerAccountCount = useCallback(async () => {
    if (!googleUserId) {
      setServerAccountCount(0);
      return 0;
    }

    const list = await serverGetAccounts(googleUserId, getAuthHeaders(), handleAuthError);
    const count = Array.isArray(list) ? list.length : 0;
    setServerAccountCount(count);
    return count;
  }, [getAuthHeaders, googleUserId, handleAuthError]);

  useEffect(() => {
    let cancelled = false;

    if (!googleUserId) {
      setAccounts([]);
      setActiveAccountIndex(-1);
      setFriends([]);
      setGroups([]);
      setSentFriendRequests([]);
      setReceivedFriendRequests([]);
      setServerAccountCount(0);
      return undefined;
    }

    const cachedAccounts = loadAccounts(googleUserId);
    const migrationKey = buildMigrationStorageKey(googleUserId);
    const migrationDone = localStorage.getItem(migrationKey) === '1';
    setAccounts(cachedAccounts);
    setActiveAccountIndex(loadActiveIndex(googleUserId, cachedAccounts.length));
    setServerAccountCount(cachedAccounts.length);

    (async () => {
      const authHeaders = getAuthHeaders();
      const remoteAccounts = await serverGetAccounts(googleUserId, authHeaders, handleAuthError);
      if (cancelled) return;
      if (!Array.isArray(remoteAccounts)) return;
      const normalized = remoteAccounts.map((account, index) => normalizeAccountRecord({ ...account, ownerUserId: account.ownerUserId || googleUserId }, index));
      const cachedById = new Map(cachedAccounts.map((account) => [account.id, account]));
      const merged = normalized.map((account) => {
        const cached = cachedById.get(account.id);
        if (cached && !hasStoredSession(account) && hasStoredSession(cached)) {
          return { ...account, ...cached };
        }
        return account;
      });

      const canBackfillServer = Boolean(authHeaders.Authorization);
      const shouldUseLegacyCacheTemporarily = !migrationDone && normalized.length === 0 && cachedAccounts.length > 0;
      const shouldBackfillLegacyCache = shouldUseLegacyCacheTemporarily && canBackfillServer && cachedAccounts.some((account) => hasStoredSession(account));
      const nextAccounts = shouldUseLegacyCacheTemporarily ? cachedAccounts : merged;

      setAccounts(nextAccounts);
      setActiveAccountIndex(loadActiveIndex(googleUserId, nextAccounts.length));
      setServerAccountCount(nextAccounts.length);

      if (shouldBackfillLegacyCache) {
        const results = await Promise.allSettled(
          nextAccounts
            .filter((account) => hasStoredSession(account))
            .map((account) => persistAccountToServer(googleUserId, account, authHeaders)),
        );
        if (results.some((result) => result.status === 'fulfilled')) {
          localStorage.setItem(migrationKey, '1');
        }
      } else {
        for (const account of nextAccounts) {
          if (hasStoredSession(account)) {
            persistAccountToServer(googleUserId, account, authHeaders).catch(() => {});
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getAuthHeaders, googleUserId, handleAuthError]);

  const activeAccount = activeAccountIndex >= 0 ? accounts[activeAccountIndex] : null;
  const syncing = isBusySyncPhase(syncState.phase);
  const waitingForLogin = isVisibleSyncPhase(syncState.phase);
  const activeAccountReady = Boolean(activeAccount && activeAccount.syncStatus === 'ready');

  const updateAccountById = useCallback((accountId, patch) => {
    if (!accountId || !patch) return;
    setAccounts((prev) => prev.map((account) => (
      account.id === accountId ? { ...account, ...patch } : account
    )));
  }, []);

  const refreshAccountSessionFromExtension = useCallback(async (account) => {
    if (!canSyncAccount(account)) return null;
    if (!extensionActive) {
      throw new Error('Extension chưa sẵn sàng. Hãy bật extension rồi thử lại.');
    }

    const sessionPatch = await syncZaloCommonData(account);
    return {
      ...sessionPatch,
      userAgent: account.userAgent || navigator.userAgent,
      syncStatus: 'ready',
    };
  }, [extensionActive]);

  useEffect(() => {
    if (accounts.length === 0) {
      if (activeAccountIndex !== -1) setActiveAccountIndex(-1);
      return;
    }
    if (activeAccountIndex < 0 || activeAccountIndex >= accounts.length) {
      setActiveAccountIndex(0);
    }
  }, [accounts, activeAccountIndex]);

  useEffect(() => {
    if (!googleUserId) return;
    localStorage.setItem(buildAccountsStorageKey(googleUserId), JSON.stringify(accounts.map((account) => ({
      ...account,
      cookie: '',
      cookies: [],
      imei: '',
      decryptKey: '',
      commonParams: '',
      commonData: null,
      sessionSource: [],
      UIN: '',
    }))));
  }, [accounts, googleUserId]);
  useEffect(() => {
    if (!googleUserId) return;
    localStorage.setItem(buildActiveStorageKey(googleUserId), String(activeAccountIndex));
  }, [activeAccountIndex, googleUserId]);

  // Check extension on mount + periodic re-check
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (extensionInvalidatedRef.current) {
        if (!cancelled) {
          setExtensionActive(false);
          setExtensionChecked(true);
          setExtensionStatus((prev) => ({
            ...prev,
            active: false,
            phase: 'invalidated',
            checkedAt: Date.now(),
          }));
        }
        return;
      }

      const status = await checkExtensionStatus();
      if (!cancelled) {
        setExtensionActive(Boolean(status?.active));
        setExtensionChecked(true);
        setExtensionStatus(status || INITIAL_EXTENSION_STATUS);
      }
    };
    check();
    const interval = setInterval(async () => {
      if (extensionInvalidatedRef.current) {
        return;
      }

      const status = await checkExtensionStatus();
      if (!cancelled) {
        setExtensionActive(Boolean(status?.active));
        setExtensionStatus(status || INITIAL_EXTENSION_STATUS);
      }
    }, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Listen for messages from the extension
  useEffect(() => {
    const unsub = onExtensionMessage(async (msg) => {
      if (msg.type === 'ZALOTOOL_READY' || msg.type === 'ZALOTOOL_CHECK_OK' || msg.type === 'ZALOTOOL_EXTENSION_INVALIDATED' || msg.type === 'ZALOTOOL_BRIDGE_BOOTSTRAP' || msg.type === 'ZALOTOOL_BRIDGE_ERROR') {
        setExtensionStatus(getExtensionStatusSnapshot());
      }

      // Extension ready signal (fires on page load if extension installed)
      if (msg.type === 'ZALOTOOL_READY') {
        extensionInvalidatedRef.current = false;
        setExtensionActive(true);
        setExtensionChecked(true);
        setSyncState((prev) => {
          if (!isExtensionInvalidationError(prev?.error)) {
            return prev;
          }

          return {
            ...INITIAL_SYNC_STATE,
            phase: activeAccountReady ? 'ready' : 'idle',
            mode: prev.mode || 'add',
          };
        });
      }

      if (msg.type === 'ZALOTOOL_EXTENSION_INVALIDATED') {
        extensionInvalidatedRef.current = true;
        setExtensionActive(false);
        setExtensionChecked(true);
        setSyncState((prev) => ({
          ...INITIAL_SYNC_STATE,
          phase: 'failed',
          mode: prev.mode || 'add',
          error: msg.data?.error || 'Extension context invalidated. Hãy reload extension rồi tải lại trang.',
        }));
      }

      if (msg.type === 'ZALOTOOL_SYNC_STATE' && msg.data) {
        setSyncState({
          ...INITIAL_SYNC_STATE,
          ...msg.data,
        });
      }

      // Account data received after incognito login
      if (msg.type === 'ZALOTOOL_ACCOUNT_DATA' && msg.data) {
        const data = msg.data;
        console.log('[Account] Received account data:', data.me?.displayName, 'friends:', data.friends?.length, 'groups:', data.groups?.length);

        const me = data.me || {};
        const session = data.session || {};
        const accountId = me.userId || session.userId || data.userId || `acct_${Date.now()}`;
        const incomingAccount = {
          id: accountId,
          ownerUserId: googleUserId,
          cookie: '',
          cookies: Array.isArray(data.cookies) ? data.cookies : [],
          cookieCount: data.cookieCount || 0,
          name: me.displayName || me.zaloName || 'Tài khoản Zalo',
          avatar: me.avatar || '',
          phone: me.phoneNumber || '',
          imei: session.imei || data.imei || '',
          userAgent: data.userAgent || navigator.userAgent,
          decryptKey: session.decryptKey || data.decryptKey || '',
          commonParams: session.commonParams || data.commonParams || '',
          labelVersion: session.labelVersion || data.labelVersion || null,
          commonData: session.commonData || data.commonData || null,
          userId: session.userId || me.userId || data.userId || '',
          UIN: session.UIN || data.UIN || '',
          sessionSource: Array.isArray(session.sessionSource) ? session.sessionSource : [],
          syncedAt: new Date().toISOString(),
          syncStatus: 'ready',
          friends: Array.isArray(data.friends) ? data.friends : [],
          groups: Array.isArray(data.groups) ? data.groups : [],
          sentFriendRequests: Array.isArray(data.sentFriendRequests) ? data.sentFriendRequests : [],
          receivedFriendRequests: Array.isArray(data.receivedFriendRequests) ? data.receivedFriendRequests : [],
        };

        setAccounts((prev) => {
          const existingIdx = prev.findIndex((account) => account.id === accountId);
          const nextAccounts = existingIdx >= 0
            ? prev.map((account, index) => (index === existingIdx ? { ...account, ...incomingAccount } : account))
            : [...prev, incomingAccount];
          const nextIndex = existingIdx >= 0 ? existingIdx : nextAccounts.length - 1;
          setActiveAccountIndex(nextIndex);
          return nextAccounts;
        });

        // Register account server-side for limit enforcement
        if (googleUserId) {
          persistAccountToServer(googleUserId, incomingAccount, getAuthHeaders()).then((result) => {
            if (result?.ok) {
              refreshServerAccountCount();
            }
          });
        }

        if (data.friends?.length) setFriends(data.friends);
        if (data.groups?.length) setGroups(data.groups);
        setSentFriendRequests(Array.isArray(incomingAccount.sentFriendRequests) ? incomingAccount.sentFriendRequests : []);
        setReceivedFriendRequests(Array.isArray(incomingAccount.receivedFriendRequests) ? incomingAccount.receivedFriendRequests : []);

        setSyncState((prev) => ({
          ...prev,
          phase: 'ready',
          requestId: null,
          error: '',
        }));
      }

      // User closed incognito window before completing login
      if (msg.type === 'ZALOTOOL_LOGIN_CANCELLED') {
        setSyncState((prev) => ({
          ...INITIAL_SYNC_STATE,
          phase: 'cancelled',
          mode: prev.mode || 'add',
          error: prev.error || 'Đăng nhập hoặc đồng bộ tài khoản đã bị hủy.',
        }));
      }
    });
    return unsub;
  }, [updateAccountById, googleUserId]);

  useEffect(() => {
    if (!extensionActive || !isExtensionInvalidationError(syncState?.error)) {
      return;
    }

    setSyncState((prev) => {
      if (!isExtensionInvalidationError(prev?.error)) {
        return prev;
      }

      return {
        ...INITIAL_SYNC_STATE,
        phase: activeAccountReady ? 'ready' : 'idle',
        mode: prev.mode || 'add',
      };
    });
  }, [activeAccountReady, extensionActive, syncState?.error]);

  // Load friends/groups when active account changes
  useEffect(() => {
    if (activeAccountIndex >= 0 && accounts[activeAccountIndex]) {
      const acct = accounts[activeAccountIndex];
      setFriends(acct.friends?.length ? acct.friends : []);
      setGroups(acct.groups?.length ? acct.groups : []);
      setSentFriendRequests(acct.sentFriendRequests?.length ? acct.sentFriendRequests : []);
      setReceivedFriendRequests(acct.receivedFriendRequests?.length ? acct.receivedFriendRequests : []);
    } else {
      setFriends([]);
      setGroups([]);
      setSentFriendRequests([]);
      setReceivedFriendRequests([]);
    }
  }, [activeAccountIndex, accounts]);

  // Auto-fetch friend requests from backend after extension sync (extension doesn't collect them)
  const friendRequestFetchedRef = useRef(false);
  useEffect(() => {
    if (syncState?.phase !== 'ready') {
      friendRequestFetchedRef.current = false;
      return;
    }
    if (friendRequestFetchedRef.current) return;
    const acct = activeAccountIndex >= 0 ? accounts[activeAccountIndex] : null;
    if (!acct) return;
    // Only auto-fetch if friend requests are empty (extension didn't provide them)
    if (acct.sentFriendRequests?.length || acct.receivedFriendRequests?.length) return;

    const API_BASE = import.meta.env.VITE_BACKEND_URL || '';
    if (!API_BASE) return;

    friendRequestFetchedRef.current = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/zalo/account/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account: acct }),
        });
        const result = await res.json();
        if (!result?.ok || !result.data) return;
        const d = result.data;
        const sentReqs = Array.isArray(d.sentFriendRequests) ? d.sentFriendRequests : [];
        const recvReqs = Array.isArray(d.receivedFriendRequests) ? d.receivedFriendRequests : [];
        if (sentReqs.length || recvReqs.length) {
          const patch = { sentFriendRequests: sentReqs, receivedFriendRequests: recvReqs };
          updateAccountById(acct.id, patch);
          if (googleUserId) persistAccountToServer(googleUserId, { ...acct, ...patch }, getAuthHeaders());
          setSentFriendRequests(sentReqs);
          setReceivedFriendRequests(recvReqs);
        }
        // Also update friends/groups if backend returned more data
        if (Array.isArray(d.friends) && d.friends.length) {
          const patch = { friends: d.friends };
          updateAccountById(acct.id, patch);
          if (googleUserId) persistAccountToServer(googleUserId, { ...acct, ...patch }, getAuthHeaders());
          setFriends(d.friends);
        }
        if (Array.isArray(d.groups) && d.groups.length) {
          const patch = { groups: d.groups };
          updateAccountById(acct.id, patch);
          if (googleUserId) persistAccountToServer(googleUserId, { ...acct, ...patch }, getAuthHeaders());
          setGroups(d.groups);
        }
      } catch (_) { /* silent — friend requests are optional */ }
    })();
  }, [syncState?.phase, activeAccountIndex, accounts, updateAccountById]);

  // Add account: tell extension to open incognito for Zalo login
  const addAccount = useCallback(async () => {
    if (!extensionActive) return { success: false, error: 'extension_not_found' };

    setSyncState({
      ...INITIAL_SYNC_STATE,
      phase: 'waiting_for_login',
      mode: 'add',
      startedAt: Date.now(),
    });

    try {
      const response = await openZaloLogin({ mode: 'add' });
      if (!response?.ok) {
        throw new Error(response?.error || 'Extension không mở được cửa sổ đăng nhập Zalo.');
      }
      return { success: true, message: 'waiting_for_login' };
    } catch (error) {
      setSyncState({
        ...INITIAL_SYNC_STATE,
        phase: 'failed',
        mode: 'add',
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }, [extensionActive]);

  // Refresh active account — re-open incognito to re-scrape
  const refreshAccount = useCallback(async () => {
    if (!extensionActive || activeAccountIndex < 0) return;

    setSyncState({
      ...INITIAL_SYNC_STATE,
      phase: 'waiting_for_login',
      mode: 'refresh',
      startedAt: Date.now(),
    });

    try {
      const response = await openZaloLogin({ mode: 'refresh', accountId: activeAccount?.id || '' });
      if (!response?.ok) {
        throw new Error(response?.error || 'Không thể làm mới phiên đăng nhập Zalo.');
      }
    } catch (error) {
      setSyncState({
        ...INITIAL_SYNC_STATE,
        phase: 'failed',
        mode: 'refresh',
        error: error.message,
      });
    }
  }, [extensionActive, activeAccount?.id, activeAccountIndex]);

  const confirmPendingSync = useCallback(async () => {
    const requestId = syncState.requestId;
    if (!requestId) {
      return { ok: false, error: 'Không có yêu cầu đồng bộ nào đang chờ xác nhận.' };
    }

    setSyncState((prev) => ({ ...prev, phase: 'syncing_account', error: '' }));

    try {
      const response = await confirmAccountSync(requestId);
      if (!response?.ok) {
        throw new Error(response?.error || 'Extension không xác nhận được đồng bộ tài khoản.');
      }
      return response;
    } catch (error) {
      setSyncState((prev) => ({
        ...prev,
        phase: 'failed',
        error: error.message,
      }));
      return { ok: false, error: error.message };
    }
  }, [syncState.requestId]);

  const cancelPendingSync = useCallback(async (reason = 'Đã hủy đồng bộ tài khoản.') => {
    const requestId = syncState.requestId;

    try {
      await cancelAccountSync(requestId, reason);
      setSyncState((prev) => ({
        ...INITIAL_SYNC_STATE,
        phase: 'cancelled',
        mode: prev.mode || 'add',
        error: reason,
      }));
      return { ok: true };
    } catch (error) {
      setSyncState((prev) => ({
        ...prev,
        phase: 'failed',
        error: error.message,
      }));
      return { ok: false, error: error.message };
    }
  }, [syncState.requestId]);

  // Stop waiting / cancel
  const stopPolling = useCallback(async () => {
    if (syncState.phase === 'awaiting_sync_confirmation' || syncState.requestId) {
      await cancelPendingSync('Người dùng đã hủy đồng bộ tài khoản.');
      return;
    }

    await closeIncognito();
    setSyncState((prev) => ({
      ...INITIAL_SYNC_STATE,
      phase: 'cancelled',
      mode: prev.mode || 'add',
      error: 'Đã hủy đăng nhập Zalo.',
    }));
  }, [cancelPendingSync, syncState.phase, syncState.requestId]);

  const removeAccount = useCallback((index) => {
    const removedAccount = accounts[index];
    setAccounts(prev => prev.filter((_, i) => i !== index));
    if (activeAccountIndex === index) {
      setActiveAccountIndex(-1);
      setFriends([]);
      setGroups([]);
      setSentFriendRequests([]);
      setReceivedFriendRequests([]);
    } else if (activeAccountIndex > index) {
      setActiveAccountIndex(prev => prev - 1);
    }
    // Remove from server-side tracking
    if (googleUserId && removedAccount?.id) {
      serverRemoveAccount(googleUserId, removedAccount.id, getAuthHeaders()).then(() => {
        setServerAccountCount((prev) => Math.max(0, prev - 1));
      });
    }
  }, [activeAccountIndex, accounts, getAuthHeaders, googleUserId]);

  const refreshActiveAccountFromService = useCallback(async () => {
    const activeAccount = activeAccountIndex >= 0 ? accounts[activeAccountIndex] : null;
    if (!activeAccount) return null;

    const extensionPatch = await refreshAccountSessionFromExtension(activeAccount);
    if (extensionPatch) {
      const nextAccount = { ...activeAccount, ...extensionPatch };
      updateAccountById(activeAccount.id, extensionPatch);
      if (googleUserId) await persistAccountToServer(googleUserId, nextAccount, getAuthHeaders());
    }
    return extensionPatch;
  }, [accounts, activeAccountIndex, getAuthHeaders, googleUserId, refreshAccountSessionFromExtension, updateAccountById]);

  const refreshAccountViaBackend = useCallback(async () => {
    const acct = activeAccountIndex >= 0 ? accounts[activeAccountIndex] : null;
    if (!acct || !hasStoredSession(acct)) return null;

    const API_BASE = import.meta.env.VITE_BACKEND_URL || '';
    if (!API_BASE) return null;

    try {
      const res = await fetch(`${API_BASE}/api/zalo/account/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: acct }),
      });

      const result = await res.json();
      if (!result?.ok || !result.data) {
        throw new Error(result?.error || 'Backend không thể đồng bộ tài khoản.');
      }

    const d = result.data;
    const patch = {
      name: d.profile?.displayName || d.profile?.zaloName || acct.name,
      avatar: d.profile?.avatar || acct.avatar,
      phone: d.profile?.phoneNumber || acct.phone,
      friends: Array.isArray(d.friends) ? d.friends : acct.friends,
      groups: Array.isArray(d.groups) ? d.groups : acct.groups,
      sentFriendRequests: Array.isArray(d.sentFriendRequests) ? d.sentFriendRequests : acct.sentFriendRequests,
      receivedFriendRequests: Array.isArray(d.receivedFriendRequests) ? d.receivedFriendRequests : acct.receivedFriendRequests,
      serviceSyncedAt: d.syncedAt || new Date().toISOString(),
      syncStatus: 'ready',
    };

    updateAccountById(acct.id, patch);
    if (googleUserId) {
      await persistAccountToServer(googleUserId, { ...acct, ...patch }, getAuthHeaders());
    }
    if (patch.friends.length) setFriends(patch.friends);
    if (patch.groups.length) setGroups(patch.groups);
    setSentFriendRequests(patch.sentFriendRequests);
    setReceivedFriendRequests(patch.receivedFriendRequests);

    return patch;
    } catch (err) {
      console.warn('[AccountContext] refreshAccountViaBackend failed:', err?.message || err);
      return null;
    }
  }, [accounts, activeAccountIndex, getAuthHeaders, googleUserId, updateAccountById]);

  const value = {
    extensionActive,
    extensionChecked,
    extensionStatus,
    accounts,
    activeAccountIndex,
    activeAccount,
    activeAccountReady,
    syncing,
    waitingForLogin,
    syncState,
    friends,
    groups,
    sentFriendRequests,
    receivedFriendRequests,
    serverAccountCount,
    refreshServerAccountCount,
    addAccount,
    confirmPendingSync,
    cancelPendingSync,
    refreshAccount,
    refreshActiveAccountFromService,
    refreshAccountViaBackend,
    stopPolling,
    removeAccount,
    updateAccountById,
    setActiveAccountIndex,
    setFriends,
    setGroups,
  };

  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be inside AccountProvider');
  return ctx;
}
