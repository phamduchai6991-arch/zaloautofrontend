import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { onIncomingMessages, zFetch } from '../utils/extensionBridge';
import {
  buildFriendMap,
  buildGroupMap,
  enrichConversation,
} from '../utils/zaloDataTransforms';
import ConversationList from '../components/ConversationList';
import ChatView from '../components/ChatView';

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';

function SummaryCard({ label, value }) {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.25, minWidth: 110, textAlign: 'center', borderRadius: 2 }}>
      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
      <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3 }}>{value}</Typography>
    </Paper>
  );
}

function isExtensionInvalidationError(value) {
  return /extension context invalidated|tai lai trang sau khi reload extension/i.test(String(value || ''));
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

export default function MessagesPage() {
  const { activeAccount, activeAccountReady, extensionActive, syncState, accounts, activeAccountIndex, setActiveAccountIndex } = useAccount();
  const { isActive, planKey } = useSubscription();
  const [conversations, setConversations] = useState(() => {
    try {
      const raw = localStorage.getItem('zt_conversations');
      return keepGroupConversations(raw ? JSON.parse(raw) : []);
    } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
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

    if (!activeAccount) {
      console.log('[MessagesPage] refreshConversations: no activeAccount');
      setFeedback({ severity: 'warning', message: 'Chưa có tài khoản Zalo đang được chọn.' });
      return;
    }

    if (!extensionActive && !hasBackend) {
      console.log('[MessagesPage] refreshConversations: extension not active');
      setFeedback({ severity: 'warning', message: 'Extension chưa hoạt động nên chưa đọc được danh sách hội thoại.' });
      return;
    }

    if (!activeAccountReady && !extensionActive && !hasBackend) {
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

      const fetchFromExtension = async () => {
        if (!extensionActive) return null;
        const response = await zFetch({
          account: activeAccount,
          options: { allowCreateTab: false },
          request: { method: 'getConversationList', args: {} },
        });
        if (response?.ok) {
          source = 'extension';
          console.log('[MessagesPage] Loaded conversations from extension, count:', Array.isArray(response.data) ? response.data.length : typeof response.data);
          return response.data;
        }
        if (response?.error && !/không tìm thấy tab/i.test(response.error)) {
          throw new Error(response.error);
        }
        return null;
      };

      // Prefer extension for richer, realtime metadata. Backend is fallback when extension is unavailable/empty.
      if (extensionActive) {
        rawList = await fetchFromExtension();
        if (!Array.isArray(rawList) || rawList.length === 0) {
          rawList = await fetchFromBackend();
        }
      } else {
        rawList = await fetchFromBackend();
      }

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
      // Suppress transient "not ready" errors — they resolve automatically:
      // - "không tìm thấy tab": no open Zalo tab yet, will retry when account changes
      // - "chưa có cookie": cookies not yet restored from DB, will retry after enrichment
      const isSilentError = /không tìm thấy tab|chưa có cookie/i.test(error.message);
      if (!isSilentError && !silent) {
        setFeedback({ severity: 'error', message: error.message });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeAccount, activeAccountReady, extensionActive, isActive, planKey, syncState.phase]);

  // Auto-refresh on mount (uses allowCreateTab:false so won't open new Zalo window)
  useEffect(() => { refreshConversations({ silent: false }); }, [refreshConversations]);

  useEffect(() => {
    if (!extensionActive) return;
    if (!isExtensionInvalidationError(feedback?.message)) return;
    setFeedback(null);
  }, [extensionActive, feedback]);

  useEffect(() => {
    if (!activeAccount || !activeAccountReady || !extensionActive) return undefined;

    const selfId = String(activeAccount?.userId || '').trim();
    return onIncomingMessages((incomingMessages) => {
      if (!Array.isArray(incomingMessages) || incomingMessages.length === 0) return;

      setConversations((prev) => {
        let next = Array.isArray(prev) ? [...prev] : [];

        for (const incoming of incomingMessages) {
          if (!incoming?.isGroup) continue;

          const conversationId = String(
            incoming?.threadId ||
            (incoming?.isGroup
              ? (incoming?.toId || '')
              : (incoming?.fromId === '0' ? (incoming?.toId || '') : (incoming?.fromId || '')))
          ).trim();

          if (!conversationId) continue;

          const preview = String(incoming?.content || '').trim() || '[Tin nhắn không có nội dung]';
          const timestamp = Number(incoming?.ts || Date.now()) || Date.now();
          const isIncoming = Boolean(incoming?.fromId) && incoming.fromId !== '0' && String(incoming.fromId).trim() !== selfId;

          const index = next.findIndex((conversation) => {
            return String(conversation?.id || '').trim() === conversationId || String(conversation?.rawId || '').trim() === conversationId;
          });

          if (index >= 0) {
            const current = next[index];
            const updated = {
              ...current,
              lastMessage: preview,
              lastMsgTime: timestamp,
              unreadCount: isIncoming && selectedConversation?.id !== current.id
                ? Number(current.unreadCount || 0) + 1
                : Number(current.unreadCount || 0),
            };
            next.splice(index, 1);
            next.unshift(updated);
            continue;
          }

          next.unshift({
            id: conversationId,
            rawId: conversationId,
            displayName: incoming?.dName || (incoming?.isGroup ? 'Nhóm mới' : 'Người dùng Zalo'),
            avatar: '',
            isGroup: Boolean(incoming?.isGroup),
            lastMessage: preview,
            lastMsgTime: timestamp,
            unreadCount: isIncoming ? 1 : 0,
            isPinned: false,
            isMuted: false,
            memberCount: 0,
            type: incoming?.isGroup ? 'group' : 'user',
            subType: '',
            lastMessageType: incoming?.msgType || 'text',
          });
        }

        return next.sort((left, right) => Number(right?.lastMsgTime || 0) - Number(left?.lastMsgTime || 0));
      });
    });
  }, [activeAccount, activeAccountReady, extensionActive, selectedConversation?.id]);

  // Poll conversation list in background without toggling loading UI.
  useEffect(() => {
    if (!activeAccount) return;
    if (!extensionActive && !API_BASE) return;
    if (!activeAccountReady && !API_BASE) return;
    const intervalId = setInterval(() => refreshConversations({ silent: true }), 30000);
    return () => clearInterval(intervalId);
  }, [activeAccount, activeAccountReady, extensionActive, refreshConversations]);

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
            disabled={loading || !activeAccount || (!extensionActive && !API_BASE) || (!activeAccountReady && !API_BASE)}
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
            extensionActive={extensionActive}
          />
        </Box>
      </Box>
    </Box>
  );
}