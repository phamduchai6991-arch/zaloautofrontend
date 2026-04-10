import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  CircularProgress,
  Divider,
  IconButton,
  InputBase,
  Paper,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import GroupIcon from '@mui/icons-material/Group';
import { zFetch, onIncomingMessages } from '../utils/extensionBridge';
import { checkLocalZaloService, sendMessageJobsViaLocalService } from '../utils/localZaloService';

function formatMessageTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }) + ' ' + date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({ message, isSelf }) {
  const isFailed = message.status === 'failed';
  const isSending = message.status === 'sending';

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isSelf ? 'flex-end' : 'flex-start',
        mb: 1.5,
        px: 1,
      }}
    >
      {!isSelf && (
        <Avatar sx={{ width: 32, height: 32, mr: 1, mt: 0.5, fontSize: 14 }}>
          {(message.fromId || '?')[0]}
        </Avatar>
      )}
      <Box sx={{ maxWidth: '65%' }}>
        <Paper
          elevation={0}
          sx={{
            px: 1.5,
            py: 1,
            borderRadius: 2,
            bgcolor: isFailed ? 'error.light' : isSelf ? 'primary.main' : 'grey.100',
            color: isFailed ? 'error.contrastText' : isSelf ? 'primary.contrastText' : 'text.primary',
            opacity: isSending ? 0.7 : 1,
            wordBreak: 'break-word',
          }}
        >
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {message.content || '[Tin nhắn không có nội dung]'}
          </Typography>
        </Paper>
        <Typography
          variant="caption"
          color={isFailed ? 'error.main' : 'text.secondary'}
          sx={{ display: 'block', mt: 0.25, textAlign: isSelf ? 'right' : 'left', px: 0.5 }}
        >
          {isSending ? 'Đang gửi...' : isFailed ? 'Gửi thất bại' : formatMessageTime(message.ts)}
        </Typography>
      </Box>
    </Box>
  );
}

function buildMessageSignature(message) {
  return JSON.stringify([
    message?.msgId || '',
    message?.content || '',
    message?.ts || 0,
    message?.status || '',
    message?.fromId || '',
    message?.toId || '',
  ]);
}

// --- sessionStorage cache helpers ---
const MSG_CACHE_PREFIX = 'zt_msgs_';
const MSG_CACHE_MAX = 20; // max conversations to cache

function getCachedMessages(convId) {
  if (!convId) return [];
  try {
    const raw = localStorage.getItem(MSG_CACHE_PREFIX + convId);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function setCachedMessages(convId, messages) {
  if (!convId || !messages?.length) return;
  try {
    localStorage.setItem(MSG_CACHE_PREFIX + convId, JSON.stringify(messages));
    // Evict oldest caches if too many
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(MSG_CACHE_PREFIX)) keys.push(k);
    }
    if (keys.length > MSG_CACHE_MAX) {
      keys.slice(0, keys.length - MSG_CACHE_MAX).forEach((k) => localStorage.removeItem(k));
    }
  } catch { /* storage full, ignore */ }
}

export default function ChatView({ conversation, account, accountReady = false, extensionActive }) {
  const convId = conversation?.id || conversation?.rawId || null;
  const [messages, setMessages] = useState(() => getCachedMessages(convId));
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const shouldAutoScroll = useRef(true);
  const messagesContainerRef = useRef(null);

  const selfId = String(account?.userId || '');
  const conversationIdRef = useRef(convId);

  const fetchMessages = useCallback(async (isPolling = false) => {
    if (!conversation || !extensionActive || !account || !accountReady) return;

    const convId = conversation.id || conversation.rawId;
    
    // Track which conversation we're fetching for
    if (!isPolling) {
      conversationIdRef.current = convId;
      setLoading(true);
    }

    // Don't fetch if conversation changed while we were waiting
    if (conversationIdRef.current !== convId) return;
    
    try {
      if (!isPolling) {
        console.log('[ChatView] Fetching messages for', convId, 'isGroup:', conversation.isGroup);
      }

      const response = await zFetch({
        account,
        request: {
          method: 'getMessageHistory',
          args: {
            threadId: convId,
            isGroup: conversation.isGroup,
            count: 30,
          },
          meta: {
            conversation: {
              id: conversation.id || conversation.rawId || '',
              rawId: conversation.rawId || '',
              displayName: conversation.displayName || '',
              isGroup: conversation.isGroup,
            },
          },
        },
      });

      // Stale check: don't update if user switched conversations
      if (conversationIdRef.current !== convId) return;

      if (!isPolling) {
        console.log('[ChatView] getMessageHistory response:', response?.ok, 'data length:', response?.data?.length);
        if (response?.data?.[0]) {
          console.log('[ChatView] First message sample keys:', Object.keys(response.data[0]));
        }
      }

      if (response?.ok && Array.isArray(response.data)) {
        const sorted = [...response.data].sort((a, b) => (a.ts || 0) - (b.ts || 0));
        setMessages((prev) => {
          // Merge: keep local temp/sending messages, replace server messages
          const tempMessages = prev.filter((m) => String(m.msgId).startsWith('temp_'));
          const serverIds = new Set(sorted.map((m) => m.msgId));
          const keptTemp = tempMessages.filter((m) => !serverIds.has(m.msgId));
          const merged = [...sorted, ...keptTemp];
          const nextSignature = merged.map(buildMessageSignature).join('|');
          const prevSignature = prev.map(buildMessageSignature).join('|');
          if (nextSignature === prevSignature) {
            return prev;
          }
          setCachedMessages(convId, merged);
          return merged;
        });
      } else if (!isPolling && response && !response.ok) {
        console.warn('[ChatView] getMessageHistory failed:', response.error);
      }
    } catch (err) {
      console.error('[ChatView] fetchMessages error:', err);
      if (!isPolling) setMessages([]);
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [conversation, extensionActive, account, accountReady]);

  // Initial load when conversation changes
  useEffect(() => {
    const id = conversation?.id || conversation?.rawId || null;
    conversationIdRef.current = id;
    // Restore cached messages instantly, then fetch fresh ones
    const cached = getCachedMessages(id);
    setMessages(cached);
    setInputValue('');
    if (id) fetchMessages(false);
  }, [fetchMessages, conversation]);

  // Listen for real-time incoming messages via WebSocket interceptor
  useEffect(() => {
    const convId = conversation?.id || conversation?.rawId;
    if (!convId) return;

    const unsub = onIncomingMessages((incomingMsgs) => {
      // Filter only messages for this conversation
      const relevant = incomingMsgs.filter((m) => {
        // Match by threadId (computed in zalo-main.js)
        if (m.threadId === convId) return true;
        // Also match by fromId/toId directly
        if (m.fromId === convId || m.toId === convId) return true;
        return false;
      });

      if (relevant.length === 0) return;

      console.log('[ChatView] Real-time messages received:', relevant.length, 'for', convId);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.msgId));
        const newMsgs = relevant.filter((m) => m.msgId && !existingIds.has(m.msgId));
        if (newMsgs.length === 0) return prev;
        const merged = [...prev, ...newMsgs].sort((a, b) => (a.ts || 0) - (b.ts || 0));
        setCachedMessages(convId, merged);
        return merged;
      });
    });

    return unsub;
  }, [conversation]);

  // Fallback poll every 15s (in case WebSocket interceptor misses something)
  useEffect(() => {
    if (!conversation || !extensionActive || !account || !accountReady) return;
    const intervalId = setInterval(() => fetchMessages(true), 15000);
    return () => clearInterval(intervalId);
  }, [conversation, extensionActive, account, accountReady, fetchMessages]);

  // Track scroll position — auto-scroll only if user is near bottom
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const threshold = 80;
    shouldAutoScroll.current = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  useEffect(() => {
    if (shouldAutoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || sending || !conversation || !accountReady) return;

    setSending(true);
    const tempMsg = {
      msgId: `temp_${Date.now()}`,
      fromId: selfId,
      content: text,
      ts: Date.now(),
      msgType: 'text',
      status: 'sending',
    };
    setMessages((prev) => [...prev, tempMsg]);
    setInputValue('');

    try {
      let sent = false;

      // Try local service first
      const serviceReady = await checkLocalZaloService();
      if (serviceReady) {
        try {
          const response = await sendMessageJobsViaLocalService({
            account: {
              ...account,
              userAgent: account.userAgent || navigator.userAgent,
            },
            jobs: [{
              id: tempMsg.msgId,
              zid: conversation.id || conversation.rawId,
              isGroup: conversation.isGroup,
              content: text,
            }],
            userAgent: account.userAgent || navigator.userAgent,
          });

          const jobResult = response?.results?.[0];
          if (jobResult && !jobResult.ok) {
            throw new Error(jobResult.error || 'Gửi tin nhắn thất bại qua local service.');
          }
          sent = true;
        } catch (serviceError) {
          console.warn('[ChatView] Local service send failed, trying extension:', serviceError.message);
          // Fall through to extension
        }
      }

      // Fallback to extension if service failed or unavailable
      if (!sent && extensionActive) {
        const response = await zFetch({
          account,
          request: {
            method: 'sendZText',
            args: {
              toId: conversation.id || conversation.rawId,
              isGroup: conversation.isGroup,
              message: text,
            },
          },
        });

        if (response && !response.ok) {
          throw new Error(response.error || 'Extension gửi tin nhắn thất bại.');
        }
        sent = true;
      }

      if (!sent) {
        throw new Error('Không có kênh gửi tin nhắn khả dụng. Hãy làm mới tài khoản hoặc bật extension.');
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.msgId === tempMsg.msgId ? { ...m, status: 'sent' } : m
        )
      );
    } catch (error) {
      console.error('[ChatView] Send failed:', error);
      setMessages((prev) =>
        prev.map((m) =>
          m.msgId === tempMsg.msgId
            ? { ...m, status: 'failed', content: m.content + `\n⚠ ${error.message}` }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  }, [inputValue, sending, conversation, selfId, account, accountReady, extensionActive]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!conversation) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
        <Box sx={{ mb: 2, opacity: 0.5 }}>
          <svg width="120" height="120" viewBox="0 0 24 24" fill="currentColor" opacity="0.2">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
            <path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z" />
          </svg>
        </Box>
        <Typography variant="h6" fontWeight={600}>Chọn đoạn chat</Typography>
        <Typography variant="body2">Chọn đoạn chat ở phía bên trái để xem chi tiết tin nhắn</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar src={conversation.avatar} sx={{ width: 40, height: 40 }}>
          {(conversation.displayName || 'Z')[0]}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap>
            {conversation.displayName || 'Không rõ tên'}
          </Typography>
          {conversation.isGroup && conversation.memberCount > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <GroupIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {conversation.memberCount} thành viên
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Messages area */}
      <Box ref={messagesContainerRef} onScroll={handleScroll} sx={{ flex: 1, overflow: 'auto', py: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : messages.length === 0 ? (
          <Box sx={{ textAlign: 'center', pt: 4 }}>
            <Typography variant="body2" color="text.secondary">
              {accountReady
                ? 'Chưa tải được lịch sử tin nhắn cho hội thoại này.'
                : 'Tài khoản chưa sẵn sàng để tải lịch sử tin nhắn. Hãy hoàn tất đồng bộ với extension.'}
            </Typography>
          </Box>
        ) : (
          messages.map((msg, index) => {
            // Zalo convention: "0" means self for uidFrom/idTo
            const isSelf = msg.fromId === selfId || msg.fromId === '0';
            return (
              <MessageBubble
                key={msg.msgId || `idx_${index}_${msg.ts}`}
                message={msg}
                isSelf={isSelf}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input area */}
      <Divider />
      <Box sx={{ p: 1.5, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
        <IconButton size="small" disabled>
          <AttachFileIcon />
        </IconButton>
        <Paper
          variant="outlined"
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            px: 1.5,
            py: 0.5,
            borderRadius: 3,
          }}
        >
          <InputBase
            multiline
            maxRows={4}
            fullWidth
            placeholder={accountReady ? 'Nhập tin nhắn' : 'Hoàn tất đồng bộ tài khoản để nhắn tin'}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending || !accountReady}
            sx={{ fontSize: 14 }}
          />
        </Paper>
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!inputValue.trim() || sending || !accountReady}
        >
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
