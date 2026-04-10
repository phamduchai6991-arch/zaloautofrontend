import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import { useAccount } from '../contexts/AccountContext';
import { onIncomingMessages, zFetch } from '../utils/extensionBridge';
import {
  buildFriendMap,
  buildGroupMap,
  enrichConversation,
} from '../utils/zaloDataTransforms';
import ConversationList from '../components/ConversationList';
import ChatView from '../components/ChatView';

function SummaryCard({ label, value }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 120, textAlign: 'center' }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h6" fontWeight={700}>{value}</Typography>
    </Paper>
  );
}

function isExtensionInvalidationError(value) {
  return /extension context invalidated|tai lai trang sau khi reload extension/i.test(String(value || ''));
}

export default function MessagesPage() {
  const { activeAccount, activeAccountReady, extensionActive, syncState } = useAccount();
  const [conversations, setConversations] = useState(() => {
    try {
      const raw = localStorage.getItem('zt_conversations');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(() => {
    try {
      const raw = localStorage.getItem('zt_selected_conv');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const refreshConversations = useCallback(async () => {
    if (!activeAccount) {
      console.log('[MessagesPage] refreshConversations: no activeAccount');
      setFeedback({ severity: 'warning', message: 'Chưa có tài khoản Zalo đang được chọn.' });
      return;
    }

    if (!extensionActive) {
      console.log('[MessagesPage] refreshConversations: extension not active');
      setFeedback({ severity: 'warning', message: 'Extension chưa hoạt động nên chưa đọc được danh sách hội thoại.' });
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

    setLoading(true);
    setFeedback(null);
    console.log('[MessagesPage] refreshConversations: fetching via extension...');

    try {
      const response = await zFetch({
        account: activeAccount,
        request: {
          method: 'getConversationList',
          args: {},
        },
      });

      console.log('[MessagesPage] zFetch response:', response?.ok, 'data length:', Array.isArray(response?.data) ? response.data.length : typeof response?.data);

      if (!response?.ok) {
        throw new Error(response?.error || 'Không lấy được danh sách hội thoại từ Zalo.');
      }

      const friendMap = buildFriendMap(activeAccount?.friends || []);
      const groupMap = buildGroupMap(activeAccount?.groups || []);
      const nextConversations = (Array.isArray(response.data) ? response.data : [])
        .map((conversation) => enrichConversation(conversation, friendMap, groupMap));

      console.log('[MessagesPage] Loaded', nextConversations.length, 'conversations');
      setConversations(nextConversations);
      try { localStorage.setItem('zt_conversations', JSON.stringify(nextConversations)); } catch {}
      setFeedback(null);
    } catch (error) {
      // Keep cached conversations on error — don't wipe existing data
      console.warn('[MessagesPage] refreshConversations error:', error.message);
      setFeedback({ severity: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  }, [activeAccount, activeAccountReady, extensionActive, syncState.phase]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

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

  // Poll conversation list every 15 seconds
  useEffect(() => {
    if (!activeAccount || !activeAccountReady || !extensionActive) return;
    const intervalId = setInterval(refreshConversations, 15000);
    return () => clearInterval(intervalId);
  }, [activeAccount, activeAccountReady, extensionActive, refreshConversations]);

  // Persist selected conversation
  const handleSelectConversation = useCallback((conv) => {
    setSelectedConversation(conv);
    try { localStorage.setItem('zt_selected_conv', JSON.stringify(conv)); } catch {}
  }, []);

  // Reset selected conversation when account changes
  useEffect(() => {
    setSelectedConversation(null);
    localStorage.removeItem('zt_selected_conv');
  }, [activeAccount?.id]);

  const summary = useMemo(() => ({
    total: conversations.length,
    unread: conversations.reduce((total, item) => total + Number(item.unreadCount || 0), 0),
    direct: conversations.filter((item) => !item.isGroup).length,
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
          <Button
            variant="outlined"
            size="small"
            startIcon={<SyncIcon />}
            onClick={refreshConversations}
            disabled={loading || !activeAccount || !activeAccountReady || !extensionActive}
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
            width: 360,
            minWidth: 280,
            maxWidth: 420,
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