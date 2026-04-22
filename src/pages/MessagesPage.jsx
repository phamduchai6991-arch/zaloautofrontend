import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import { useAccount } from '../contexts/AccountContext';
import { useSubscription, canUsePlanFeature, getRequiredPlanLabel } from '../contexts/SubscriptionContext';
import {
  buildFriendMap,
  buildGroupMap,
  enrichConversation,
} from '../utils/zaloDataTransforms';
import ConversationList from '../components/ConversationList';
import ChatView from '../components/ChatView';

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';

function buildRealtimeStreamUrl({ account, sinceTs }) {
  if (!API_BASE || !account) return '';
  const ownerUserId = encodeURIComponent(String(account.ownerUserId || '').trim());
  const accountZaloId = encodeURIComponent(String(account.id || account.zaloId || account.userId || '').trim());
  const cursor = encodeURIComponent(String(Math.max(0, Number(sinceTs) || 0)));
  if (!ownerUserId || !accountZaloId) return '';
  return `${API_BASE}/api/zalo/realtime/stream?ownerUserId=${ownerUserId}&accountZaloId=${accountZaloId}&sinceTs=${cursor}`;
}

function SummaryCard({ label, value }) {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.25, minWidth: 110, textAlign: 'center', borderRadius: 2 }}>
      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
      <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3 }}>{value}</Typography>
    </Paper>
  );
}

function keepGroupConversations(items) {
  return (Array.isArray(items) ? items : []).filter((item) => Boolean(item?.isGroup));
}

function hasMeaningfulPreview(conversation) {
  const preview = String(conversation?.lastMessage || '').trim();
  return Boolean(preview && preview !== 'Chưa có tin nhắn' && preview !== '[Tin nhắn không có nội dung]');
}

function getConversationKey(conversation) {
  return String(conversation?.id || conversation?.rawId || '').trim();
}

function mergeConversationSnapshots(prevList, nextList) {
  const prevMap = new Map();
  for (const item of Array.isArray(prevList) ? prevList : []) {
    const key = getConversationKey(item);
    if (key) prevMap.set(key, item);
  }

  return (Array.isArray(nextList) ? nextList : []).map((item) => {
    const key = getConversationKey(item);
    const prev = key ? prevMap.get(key) : null;
    if (!prev) return item;

    const nextPreview = String(item?.lastMessage || '').trim();
    const hasNextPreview = hasMeaningfulPreview(item);
    const fallbackPreview = String(prev?.lastMessage || '').trim();
    const fallbackTime = Number(prev?.lastMsgTime || 0);

    return {
      ...item,
      lastMessage: hasNextPreview ? nextPreview : (fallbackPreview || item?.lastMessage || ''),
      lastMsgTime: Number(item?.lastMsgTime || 0) > 0 ? Number(item.lastMsgTime) : fallbackTime,
      unreadCount: Number(item?.unreadCount || 0) > 0 ? Number(item.unreadCount) : Number(prev?.unreadCount || 0),
    };
  });
}

function isLikelyPartialSnapshot(prevList, nextList) {
  const prev = Array.isArray(prevList) ? prevList : [];
  const next = Array.isArray(nextList) ? nextList : [];
  if (prev.length < 15 || next.length === 0) return false;

  if (next.length < Math.max(6, Math.floor(prev.length * 0.4))) {
    return true;
  }

  const prevGroups = prev.filter((item) => item?.isGroup).length;
  const prevDirect = prev.length - prevGroups;
  const nextGroups = next.filter((item) => item?.isGroup).length;
  const nextDirect = next.length - nextGroups;

  const prevHasMixedTypes = prevGroups > 0 && prevDirect > 0;
  const nextOnlyOneType = nextGroups === 0 || nextDirect === 0;
  return prevHasMixedTypes && nextOnlyOneType && next.length < Math.floor(prev.length * 0.85);
}

function applyRealtimeChanges(prevList, changed) {
  const next = Array.isArray(prevList) ? [...prevList] : [];
  const changes = Array.isArray(changed) ? changed : [];

  for (const item of changes) {
    const id = String(item?.conversationId || '').trim();
    if (!id) continue;

    const index = next.findIndex((conversation) => String(conversation?.id || conversation?.rawId || '').trim() === id);
    if (index < 0) continue;

    const current = next[index];
    next[index] = {
      ...current,
      lastMsgTime: Number(item?.ts || 0) || Number(current?.lastMsgTime || 0),
      lastMessage: String(item?.lastMessage || '').trim() || current?.lastMessage || '',
      lastMsgId: String(item?.lastMsgId || '').trim() || current?.lastMsgId || '',
      lastMsgType: String(item?.lastMsgType || '').trim() || current?.lastMsgType || 'text',
      lastSenderId: String(item?.lastSenderId || '').trim() || current?.lastSenderId || '',
      lastSenderName: String(item?.lastSenderName || '').trim() || current?.lastSenderName || '',
      isGroup: Boolean(item?.isGroup ?? current?.isGroup),
    };
  }

  return next.sort((a, b) => Number(b?.lastMsgTime || 0) - Number(a?.lastMsgTime || 0));
}

export default function MessagesPage() {
  const { activeAccount, activeAccountReady, syncState, accounts, activeAccountIndex, setActiveAccountIndex } = useAccount();
  const { isActive, planKey } = useSubscription();
  const [conversations, setConversations] = useState(() => {
    try {
      const raw = localStorage.getItem('zt_conversations');
      return keepGroupConversations(raw ? JSON.parse(raw) : []);
    } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [chatRefreshToken, setChatRefreshToken] = useState(0);
  const [selectedConversation, setSelectedConversation] = useState(() => {
    try {
      const raw = localStorage.getItem('zt_selected_conv');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.isGroup ? parsed : null;
    } catch { return null; }
  });

  const refreshConversations = useCallback(async ({ silent = false } = {}) => {
    const hasBackend = Boolean(API_BASE);
    if (!isActive) {
      setFeedback({ severity: 'warning', message: 'Gói của bạn không còn hiệu lực. Vui lòng gia hạn để đọc và quản lý hội thoại.' });
      return;
    }

    if (!canUsePlanFeature('manage_conversation', planKey)) {
      setFeedback({ severity: 'warning', message: `Quản lý hội thoại yêu cầu gói ${getRequiredPlanLabel('manage_conversation')} trở lên. Vui lòng nâng cấp để sử dụng.` });
      return;
    }

    if (!hasBackend) {
      console.log('[MessagesPage] refreshConversations: backend not configured');
      setFeedback({ severity: 'warning', message: 'Backend chưa cấu hình. Không thể tải danh sách hội thoại.' });
      return;
    }

    if (!activeAccount) {
      console.log('[MessagesPage] refreshConversations: no activeAccount');
      setFeedback({ severity: 'warning', message: 'Chưa có tài khoản Zalo đang được chọn.' });
      return;
    }

    if (!activeAccountReady) {
      console.log('[MessagesPage] refreshConversations: account not ready');
      setFeedback({
        severity: 'warning',
        message: syncState.phase === 'awaiting_sync_confirmation'
          ? 'Tài khoản đang chờ xác nhận đồng bộ. Hãy xác nhận trước khi đọc hội thoại.'
          : 'Tài khoản chưa sẵn sàng để đọc hội thoại. Hãy làm mới và hoàn tất đồng bộ với extension.',
      });
      return;
    }

    if (!silent) setLoading(true);
    if (!silent) setFeedback(null);
    console.log('[MessagesPage] refreshConversations: fetching...');

    try {
      let rawList = null;
      let source = 'none';

      const fetchFromBackend = async () => {
        if (!hasBackend || !activeAccount) return null;
        try {
          const res = await fetch(`${API_BASE}/api/zalo/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account: activeAccount }),
          });
          if (!res.ok) return null;
          const json = await res.json();
          if (json?.ok && json?.data) {
            console.log('[MessagesPage] Loaded conversations from backend:', typeof json.data);
            source = 'backend';
            return json.data;
          }
          return null;
        } catch (backendErr) {
          console.warn('[MessagesPage] Backend conversations failed:', backendErr.message);
          return null;
        }
      };

      // Backend-only mode: do not use extension conversation APIs.
      rawList = await fetchFromBackend();

      if (rawList === null) {
        // No source succeeded yet — keep cached data silently
        return;
      }

      // Normalize response — backend may return {msgs: [...], groups:[...]} or flat array
      let items = [];
      if (Array.isArray(rawList)) {
        items = rawList;
      } else if (rawList && typeof rawList === 'object') {
        // Backend getrecentv2 returns {msgs:[...], ...} — flatten
        const msgs = Array.isArray(rawList.msgs) ? rawList.msgs : [];
        const grps = Array.isArray(rawList.groupMsgs) ? rawList.groupMsgs : [];
        items = [...msgs, ...grps];
      }
      const friendMap = buildFriendMap(activeAccount?.friends || []);
      const groupMap = buildGroupMap(activeAccount?.groups || []);
      const nextConversations = keepGroupConversations(items
        .map((conversation) => enrichConversation(conversation, friendMap, groupMap))
        .filter(Boolean));

      console.log('[MessagesPage] Loaded', nextConversations.length, 'conversations from', source);
      setConversations((prev) => {
        const merged = mergeConversationSnapshots(prev, nextConversations)
          .sort((a, b) => Number(b?.lastMsgTime || 0) - Number(a?.lastMsgTime || 0));

        if (silent && isLikelyPartialSnapshot(prev, merged)) {
          console.warn('[MessagesPage] Ignore partial conversation snapshot during background refresh.');
          return prev;
        }

        try { localStorage.setItem('zt_conversations', JSON.stringify(merged)); } catch {}
        return merged;
      });
      setFeedback(null);
    } catch (error) {
      // Keep cached conversations on error — don't wipe existing data
      console.warn('[MessagesPage] refreshConversations error:', error.message);
      const isSilentError = /chưa có cookie/i.test(error.message);
      if (!isSilentError && !silent) {
        setFeedback({ severity: 'error', message: error.message });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeAccount, activeAccountReady, isActive, planKey, syncState.phase]);

  const realtimeSinceTsRef = useRef(0);
  const sseConnectedRef = useRef(false);
  const selectedConversationIdRef = useRef('');

  useEffect(() => {
    selectedConversationIdRef.current = String(selectedConversation?.id || selectedConversation?.rawId || '').trim();
  }, [selectedConversation]);

  const pollRealtimeChanges = useCallback(async () => {
    if (sseConnectedRef.current) return;
    if (!API_BASE || !activeAccount || !activeAccountReady) return;

    try {
      const res = await fetch(`${API_BASE}/api/zalo/realtime/changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: activeAccount,
          sinceTs: realtimeSinceTsRef.current,
        }),
      });
      if (!res.ok) return;

      const json = await res.json();
      if (!json?.ok) return;

      const changed = Array.isArray(json?.changed) ? json.changed : [];
      const nextMaxTs = Math.max(
        Number(realtimeSinceTsRef.current || 0),
        Number(json?.maxTs || 0),
        ...changed.map((item) => Number(item?.ts || 0)),
      );
      realtimeSinceTsRef.current = nextMaxTs;

      if (changed.length === 0) return;

      setConversations((prev) => {
        const updated = applyRealtimeChanges(prev, changed);
        try { localStorage.setItem('zt_conversations', JSON.stringify(updated)); } catch {}
        return updated;
      });

      const selectedId = selectedConversationIdRef.current;
      if (selectedId && changed.some((item) => String(item?.conversationId || '').trim() === selectedId)) {
        setChatRefreshToken((tick) => tick + 1);
      }
    } catch (_) {
      // Keep silent to avoid spamming user-facing feedback during background realtime checks.
    }
  }, [activeAccount, activeAccountReady]);

  // Auto-refresh on mount.
  useEffect(() => { refreshConversations({ silent: false }); }, [refreshConversations]);

  // Poll conversation list in background without toggling loading UI.
  useEffect(() => {
    if (!activeAccount) return;
    if (!API_BASE) return;
    if (!activeAccountReady) return;
    const intervalId = setInterval(() => refreshConversations({ silent: true }), 5000);
    return () => clearInterval(intervalId);
  }, [activeAccount, activeAccountReady, refreshConversations]);

  // Fast realtime delta checks from backend cache.
  useEffect(() => {
    if (!activeAccount || !activeAccountReady || !API_BASE) return;
    const intervalId = setInterval(() => pollRealtimeChanges(), 2000);
    return () => clearInterval(intervalId);
  }, [activeAccount, activeAccountReady, pollRealtimeChanges]);

  // Prefer backend SSE for near-realtime push; polling remains fallback when SSE drops.
  useEffect(() => {
    if (!activeAccount || !activeAccountReady || !API_BASE) return undefined;
    if (typeof EventSource === 'undefined') return undefined;

    let disposed = false;
    let source = null;
    let reconnectTimer = null;

    const handleChanged = (changed) => {
      if (!Array.isArray(changed) || changed.length === 0) return;

      setConversations((prev) => {
        const updated = applyRealtimeChanges(prev, changed);
        try { localStorage.setItem('zt_conversations', JSON.stringify(updated)); } catch {}
        return updated;
      });

      const selectedId = selectedConversationIdRef.current;
      if (selectedId && changed.some((item) => String(item?.conversationId || '').trim() === selectedId)) {
        setChatRefreshToken((tick) => tick + 1);
      }
    };

    const connect = () => {
      if (disposed) return;
      const streamUrl = buildRealtimeStreamUrl({ account: activeAccount, sinceTs: realtimeSinceTsRef.current });
      if (!streamUrl) return;

      source = new EventSource(streamUrl);
      source.onopen = () => {
        sseConnectedRef.current = true;
      };

      source.addEventListener('ready', (event) => {
        try {
          const payload = JSON.parse(event.data || '{}');
          const readyTs = Number(payload?.sinceTs || 0);
          realtimeSinceTsRef.current = Math.max(Number(realtimeSinceTsRef.current || 0), readyTs);
        } catch {}
      });

      source.addEventListener('changes', (event) => {
        try {
          const payload = JSON.parse(event.data || '{}');
          const changed = Array.isArray(payload?.changed) ? payload.changed : [];
          const maxTs = Math.max(
            Number(payload?.maxTs || 0),
            ...changed.map((item) => Number(item?.ts || 0)),
          );
          realtimeSinceTsRef.current = Math.max(Number(realtimeSinceTsRef.current || 0), maxTs);
          handleChanged(changed);
        } catch {}
      });

      source.onerror = () => {
        sseConnectedRef.current = false;
        if (source) {
          source.close();
          source = null;
        }
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      sseConnectedRef.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (source) source.close();
    };
  }, [activeAccount, activeAccountReady]);

  // Keep selected conversation in sync with latest backend snapshot.
  useEffect(() => {
    if (!Array.isArray(conversations) || conversations.length === 0) return;

    if (!selectedConversation) {
      const firstConversation = conversations[0] || null;
      if (!firstConversation) return;
      setSelectedConversation(firstConversation);
      try { localStorage.setItem('zt_selected_conv', JSON.stringify(firstConversation)); } catch {}
      return;
    }

    const selectedKey = getConversationKey(selectedConversation);
    if (!selectedKey) return;
    const fresh = conversations.find((item) => getConversationKey(item) === selectedKey);
    if (!fresh) {
      const fallbackConversation = conversations[0] || null;
      if (!fallbackConversation) return;
      setSelectedConversation(fallbackConversation);
      try { localStorage.setItem('zt_selected_conv', JSON.stringify(fallbackConversation)); } catch {}
      return;
    }
    const prevSignature = JSON.stringify([
      selectedConversation.lastMsgId || '',
      selectedConversation.lastMsgTime || 0,
      selectedConversation.lastMessage || '',
      selectedConversation.lastSenderId || '',
      selectedConversation.lastSenderName || '',
    ]);
    const nextSignature = JSON.stringify([
      fresh.lastMsgId || '',
      fresh.lastMsgTime || 0,
      fresh.lastMessage || '',
      fresh.lastSenderId || '',
      fresh.lastSenderName || '',
    ]);
    if (prevSignature === nextSignature) return;
    setSelectedConversation(fresh);
    try { localStorage.setItem('zt_selected_conv', JSON.stringify(fresh)); } catch {}
  }, [conversations, selectedConversation]);

  // Persist selected conversation
  const handleSelectConversation = useCallback((conv) => {
    const next = conv?.isGroup ? conv : null;
    setSelectedConversation(next);
    try {
      if (next) {
        localStorage.setItem('zt_selected_conv', JSON.stringify(next));
      } else {
        localStorage.removeItem('zt_selected_conv');
      }
    } catch {}
  }, []);

  // Reset conversations + selected chat when account changes
  useEffect(() => {
    setSelectedConversation(null);
    setConversations([]);
    realtimeSinceTsRef.current = 0;
    sseConnectedRef.current = false;
    localStorage.removeItem('zt_selected_conv');
    localStorage.removeItem('zt_conversations');
  }, [activeAccount?.id]);

  const summary = useMemo(() => ({
    total: conversations.length,
    unread: conversations.reduce((total, item) => total + Number(item.unreadCount || 0), 0),
    direct: 0,
    groups: conversations.filter((item) => item.isGroup).length,
  }), [conversations]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Summary bar */}
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ mb: 1.5 }}>
          <SummaryCard label="Tổng hội thoại" value={summary.total} />
          <SummaryCard label="Chưa đọc" value={summary.unread} />
          <SummaryCard label="Cá nhân" value={summary.direct} />
          <SummaryCard label="Nhóm" value={summary.groups} />
          <Box sx={{ flex: 1 }} />
          {/* Account switcher */}
          {accounts.length > 0 && (
            <Select
              size="small"
              value={activeAccountIndex >= 0 ? activeAccountIndex : 0}
              onChange={(e) => setActiveAccountIndex(Number(e.target.value))}
              sx={{ height: 36, minWidth: 160, fontSize: '0.875rem' }}
              renderValue={(value) => {
                const acc = accounts[Number(value)];
                if (!acc) return 'Chọn tài khoản';
                const label = acc.name && acc.name !== 'Tài khoản Zalo' ? acc.name : acc.phone || `ZID ${acc.userId}`;
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar src={acc.avatar} sx={{ width: 22, height: 22, fontSize: 10 }}>{(acc.name || 'Z')[0]}</Avatar>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{label}</span>
                  </Box>
                );
              }}
            >
              {accounts.map((acc, idx) => {
                const label = acc.name && acc.name !== 'Tài khoản Zalo' ? acc.name : acc.phone || `ZID ${acc.userId}`;
                return (
                  <MenuItem key={acc.id || idx} value={idx}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar src={acc.avatar} sx={{ width: 28, height: 28, fontSize: 12 }}>{(acc.name || 'Z')[0]}</Avatar>
                      <Typography variant="body2">{label}</Typography>
                    </Box>
                  </MenuItem>
                );
              })}
            </Select>
          )}
          <Button
            variant="outlined"
            size="small"
            startIcon={<SyncIcon />}
            onClick={() => refreshConversations({ silent: false })}
            disabled={loading || !activeAccount || !API_BASE || !activeAccountReady}
          >
            {loading ? 'Đang tải...' : 'Đồng bộ ngay'}
          </Button>
        </Stack>

        {feedback && (
          <Alert severity={feedback.severity} sx={{ mb: 1 }} onClose={() => setFeedback(null)}>
            {feedback.message}
          </Alert>
        )}
      </Box>

      {/* Main split panel */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', borderTop: 1, borderColor: 'divider' }}>
        {/* Left: conversation list */}
        <Paper
          variant="outlined"
          square
          sx={{
            width: 380,
            minWidth: 300,
            maxWidth: 440,
            borderTop: 0,
            borderBottom: 0,
            borderLeft: 0,
            overflow: 'hidden',
          }}
        >
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversation?.id}
            onSelect={handleSelectConversation}
            loading={loading}
          />
        </Paper>

        {/* Right: chat view */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ChatView
            conversation={selectedConversation}
            account={activeAccount}
            accountReady={activeAccountReady}
            refreshToken={chatRefreshToken}
          />
        </Box>
      </Box>
    </Box>
  );
}