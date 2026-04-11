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
const STORAGE_KEY = 'zalotool_accounts';
const ACTIVE_KEY = 'zalotool_active_idx';
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

function loadAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((account, index) => ({
      id: account.id || account.userId || account.cookie || `legacy_${index}`,
      cookie: account.cookie || '',
      cookies: Array.isArray(account.cookies) ? account.cookies : [],
      cookieCount: account.cookieCount || 0,
      name: account.name || account.displayName || 'Tài khoản Zalo',
      avatar: account.avatar || '',
      phone: account.phone || account.phoneNumber || '',
      imei: account.imei || '',
      userAgent: account.userAgent || navigator.userAgent,
      decryptKey: account.decryptKey || '',
      commonParams: account.commonParams || '',
      labelVersion: account.labelVersion || null,
      commonData: account.commonData || null,
      userId: account.userId || '',
      UIN: account.UIN || '',
      sessionSource: Array.isArray(account.sessionSource) ? account.sessionSource : [],
      syncedAt: account.syncedAt || null,
      friends: Array.isArray(account.friends) ? account.friends : [],
      groups: Array.isArray(account.groups) ? account.groups : [],
      sentFriendRequests: Array.isArray(account.sentFriendRequests) ? account.sentFriendRequests : [],
      receivedFriendRequests: Array.isArray(account.receivedFriendRequests) ? account.receivedFriendRequests : [],
      serviceSyncedAt: account.serviceSyncedAt || null,
      syncStatus: getStoredAccountSyncStatus(account),
    }));
  } catch { return []; }
}

function loadActiveIndex() {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    const idx = raw !== null ? Number(raw) : -1;
    return Number.isFinite(idx) ? idx : -1;
  } catch { return -1; }
}

function canSyncAccount(account) {
  return hasStoredSession(account);
}

// ─── Server-side account tracking helpers ────────────────

async function serverRegisterAccount({ userId, zaloId, zaloName, zaloAvatar, zaloPhone }) {
  if (!API_BASE || !userId || !zaloId) return null;
  try {
    const res = await fetch(`${API_BASE}/api/accounts/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, zaloId, zaloName, zaloAvatar, zaloPhone }),
    });
    return await res.json();
  } catch (e) {
    console.warn('[Account] Server register failed:', e.message);
    return null;
  }
}

async function serverRemoveAccount(userId, zaloId) {
  if (!API_BASE || !userId || !zaloId) return;
  try {
    await fetch(`${API_BASE}/api/accounts/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, zaloId }),
    });
  } catch (e) {
    console.warn('[Account] Server remove failed:', e.message);
  }
}

async function serverGetAccounts(userId) {
  if (!API_BASE || !userId) return [];
  try {
    const res = await fetch(`${API_BASE}/api/accounts?userId=${encodeURIComponent(userId)}`);
    const data = await res.json();
    return data.ok ? data.accounts : [];
  } catch {
    return [];
  }
}

const AccountContext = createContext(null);

export function AccountProvider({ children }) {
  const { user } = useAuth();
  const googleUserId = user?.sub || '';
  const extensionInvalidatedRef = useRef(false);
  const [extensionActive, setExtensionActive] = useState(false);
  const [extensionChecked, setExtensionChecked] = useState(false);
  const [extensionStatus, setExtensionStatus] = useState(() => ({
    ...INITIAL_EXTENSION_STATUS,
    ...getExtensionStatusSnapshot(),
  }));
  const [accounts, setAccounts] = useState(loadAccounts);
  const [activeAccountIndex, setActiveAccountIndex] = useState(loadActiveIndex);
  const [syncState, setSyncState] = useState(INITIAL_SYNC_STATE);
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sentFriendRequests, setSentFriendRequests] = useState([]);
  const [receivedFriendRequests, setReceivedFriendRequests] = useState([]);
  const [serverAccountCount, setServerAccountCount] = useState(0);

  // Load server-side registered account count on login
  useEffect(() => {
    if (!googleUserId) return;
    serverGetAccounts(googleUserId).then((list) => {
      setServerAccountCount(list.length);
    });
  }, [googleUserId]);

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

  // Persist accounts to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts.map((account) => ({
      ...account,
      cookie: '',
    }))));
  }, [accounts]);
  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, String(activeAccountIndex));
  }, [activeAccountIndex]);

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
          serverRegisterAccount({
            userId: googleUserId,
            zaloId: accountId,
            zaloName: incomingAccount.name,
            zaloAvatar: incomingAccount.avatar,
            zaloPhone: incomingAccount.phone,
          }).then((result) => {
            if (result?.ok) {
              serverGetAccounts(googleUserId).then((list) => setServerAccountCount(list.length));
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
          updateAccountById(acct.id, { sentFriendRequests: sentReqs, receivedFriendRequests: recvReqs });
          setSentFriendRequests(sentReqs);
          setReceivedFriendRequests(recvReqs);
        }
        // Also update friends/groups if backend returned more data
        if (Array.isArray(d.friends) && d.friends.length) {
          updateAccountById(acct.id, { friends: d.friends });
          setFriends(d.friends);
        }
        if (Array.isArray(d.groups) && d.groups.length) {
          updateAccountById(acct.id, { groups: d.groups });
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
      serverRemoveAccount(googleUserId, removedAccount.id).then(() => {
        setServerAccountCount((prev) => Math.max(0, prev - 1));
      });
    }
  }, [activeAccountIndex, accounts, googleUserId]);

  const refreshActiveAccountFromService = useCallback(async () => {
    const activeAccount = activeAccountIndex >= 0 ? accounts[activeAccountIndex] : null;
    if (!activeAccount) return null;

    const extensionPatch = await refreshAccountSessionFromExtension(activeAccount);
    if (extensionPatch) {
      updateAccountById(activeAccount.id, extensionPatch);
    }
    return extensionPatch;
  }, [accounts, activeAccountIndex, refreshAccountSessionFromExtension, updateAccountById]);

  const refreshAccountViaBackend = useCallback(async () => {
    const acct = activeAccountIndex >= 0 ? accounts[activeAccountIndex] : null;
    if (!acct || !hasStoredSession(acct)) return null;

    const API_BASE = import.meta.env.VITE_BACKEND_URL || '';
    if (!API_BASE) return null;

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
    if (patch.friends.length) setFriends(patch.friends);
    if (patch.groups.length) setGroups(patch.groups);
    setSentFriendRequests(patch.sentFriendRequests);
    setReceivedFriendRequests(patch.receivedFriendRequests);

    return patch;
  }, [accounts, activeAccountIndex, updateAccountById]);

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
