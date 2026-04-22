import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import CloseIcon from '@mui/icons-material/Close';
import GroupIcon from '@mui/icons-material/Group';
import { resolveGroupInviteTargetsViaBackend } from '../utils/localZaloService';

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';

function formatMessageTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  if (isYesterday) return `Hôm qua ${time}`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' + time;
}

function renderObjectContent(value, depth = 0) {
  if (depth > 3 || value == null) return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        const nested = renderObjectContent(parsed, depth + 1);
        if (nested) return nested;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  if (typeof value === 'number') return String(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = renderObjectContent(item, depth + 1);
      if (nested) return nested;
    }
    return '';
  }

  if (typeof value !== 'object') return '';

  const directCandidates = [
    value.text,
    value.content,
    value.description,
    value.title,
    value.name,
    value.caption,
    value.body,
    value.msg,
    value.message,
    value.summary,
    value.snippet,
    value.href,
    value.url,
    value.link,
  ];

  for (const candidate of directCandidates) {
    const nested = renderObjectContent(candidate, depth + 1);
    if (nested) return nested;
  }

  if (value.fileName || value.file_name) return `[File] ${value.fileName || value.file_name}`;
  if (value.thumb || value.thumbSrc || value.hdUrl || value.normalUrl || value.imageUrl || value.photoUrl || value.thumbnail || value.image) return '[Hình ảnh]';
  if (value.videoUrl || value.video) return '[Video]';
  if (value.audioUrl || value.voiceUrl || value.audio) return '[Âm thanh]';
  if (value.stickerId) return '[Sticker]';

  const nestedCandidates = [value.data, value.params, value.meta, value.attach, value.attachment, value.attachments, value.payload, value.extra, value.quote];
  for (const candidate of nestedCandidates) {
    const nested = renderObjectContent(candidate, depth + 1);
    if (nested) return nested;
  }

  return '';
}

function getMessageDisplayText(message) {
  if (typeof message?.content === 'string' && message.content.trim()) return message.content.trim();

  const rawContentText = renderObjectContent(message?.rawContent);
  if (rawContentText) return rawContentText;

  const quoteText = renderObjectContent(message?.quote);
  if (quoteText) return quoteText;

  const msgType = String(message?.msgType || '').toLowerCase();
  if (msgType.includes('photo') || msgType.includes('image') || msgType.includes('gif')) return '[Hình ảnh]';
  if (msgType.includes('video')) return '[Video]';
  if (msgType.includes('voice') || msgType.includes('audio')) return '[Âm thanh]';
  if (msgType.includes('sticker')) return '[Sticker]';
  if (msgType.includes('file')) return '[Tệp đính kèm]';
  if (msgType.includes('link')) return '[Liên kết]';
  if (msgType.includes('location')) return '[Vị trí]';

  // Numeric msgType fallback (Zalo internal types)
  const msgTypeNum = Number(message?.msgType);
  if (msgTypeNum === 2 || msgTypeNum === 201) return '[Hình ảnh]';
  if (msgTypeNum === 3) return '[Sticker]';
  if (msgTypeNum === 4) return '[GIF]';
  if (msgTypeNum === 6) return '[Video]';
  if (msgTypeNum === 7) return '[Âm thanh]';
  if (msgTypeNum === 8) return '[Vị trí]';
  if (msgTypeNum === 10) return '[Tệp đính kèm]';
  if (msgTypeNum === 11) return '[Cuộc gọi]';

  return null; // no renderable content
}

function hasRenderableMessageContent(message) {
  return getMessageDisplayText(message) !== null;
}

function hasUsableMessageList(messages) {
  return Array.isArray(messages) && messages.some(hasRenderableMessageContent);
}

function buildConversationPreviewMessage(conversation) {
  const content = String(conversation?.lastMessage || '').trim();
  if (!content) return null;
  return {
    msgId: String(conversation?.lastMsgId || `preview_${conversation?.id || conversation?.rawId || 'conv'}`),
    fromId: String(conversation?.lastSenderId || ''),
    toId: String(conversation?.id || conversation?.rawId || ''),
    content,
    rawContent: null,
    msgType: String(conversation?.lastMsgType || 'text'),
    ts: Number(conversation?.lastMsgTime || 0) || Date.now(),
    dName: String(conversation?.lastSenderName || ''),
  };
}

function firstNonEmptyText(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function normalizeEntityId(value, isGroup = false) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (isGroup && text.toLowerCase().startsWith('g')) {
    return text.slice(1);
  }
  return text;
}

function isImageFileLike(value) {
  const type = String(value?.type || value?.mimeType || '').toLowerCase();
  const name = String(value?.name || value?.fileName || '').toLowerCase();
  return type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function addSenderProfile(map, rawProfile = {}, options = {}) {
  if (!rawProfile || typeof rawProfile !== 'object') return;

  const isGroup = Boolean(options.isGroup);
  const name = firstNonEmptyText(
    rawProfile.name,
    rawProfile.displayName,
    rawProfile.dName,
    rawProfile.senderName,
    rawProfile.fromName,
    rawProfile.zaloName,
    rawProfile.fullName,
  );
  const avatar = firstNonEmptyText(
    rawProfile.avatar,
    rawProfile.avatarUrl,
    rawProfile.avt,
    rawProfile.photo,
    rawProfile.thumbSrc,
    rawProfile.profilePic,
  );

  const keys = [
    normalizeEntityId(rawProfile.id, isGroup),
    normalizeEntityId(rawProfile.userId, isGroup),
    normalizeEntityId(rawProfile.uid, isGroup),
    normalizeEntityId(rawProfile.uidFrom, isGroup),
    normalizeEntityId(rawProfile.fromId, isGroup),
    normalizeEntityId(rawProfile.senderId, isGroup),
    normalizeEntityId(rawProfile.zid, isGroup),
    normalizeEntityId(rawProfile.memberId, isGroup),
    normalizeEntityId(rawProfile.globalId, isGroup),
    normalizeEntityId(rawProfile.username, isGroup),
  ].filter(Boolean);

  if (!keys.length || (!name && !avatar)) return;

  for (const key of keys) {
    const current = map.get(key);
    map.set(key, {
      name: firstNonEmptyText(current?.name, name),
      avatar: firstNonEmptyText(current?.avatar, avatar),
    });
  }
}

function collectProfilesFromValue(map, value, depth = 0) {
  if (!value || depth > 3) return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectProfilesFromValue(map, item, depth + 1));
    return;
  }

  if (typeof value !== 'object') return;

  addSenderProfile(map, value);

  const nestedCandidates = [
    value.members,
    value.memberList,
    value.memberInfo,
    value.memberMap,
    value.currentMems,
    value.participants,
    value.participantInfo,
    value.profiles,
    value.profile,
    value.data,
    value.extra,
    value.rawContent,
  ];

  nestedCandidates.forEach((candidate) => collectProfilesFromValue(map, candidate, depth + 1));

  if (!Array.isArray(value) && depth < 2) {
    Object.values(value).forEach((candidate) => {
      if (candidate && typeof candidate === 'object') {
        collectProfilesFromValue(map, candidate, depth + 1);
      }
    });
  }
}

function buildBaseSenderProfiles(account, conversation) {
  const map = new Map();

  addSenderProfile(map, {
    id: account?.userId || account?.id || account?.zaloId,
    name: account?.name || account?.displayName || account?.zaloName,
    avatar: account?.avatar || account?.zaloAvatar,
  });

  (Array.isArray(account?.friends) ? account.friends : []).forEach((friend) => {
    addSenderProfile(map, friend);
  });

  const activeGroupId = normalizeEntityId(conversation?.id || conversation?.rawId, true);
  const matchedGroup = (Array.isArray(account?.groups) ? account.groups : []).find((group) => {
    const groupId = normalizeEntityId(group?.userId || group?.groupId || group?.id, true);
    return groupId && groupId === activeGroupId;
  });

  collectProfilesFromValue(map, matchedGroup);
  collectProfilesFromValue(map, conversation);
  return map;
}

function extractSenderProfile(message) {
  const map = new Map();
  collectProfilesFromValue(map, message?.rawContent);
  const normalizedFromId = normalizeEntityId(message?.fromId);
  return normalizedFromId ? map.get(normalizedFromId) || null : null;
}

function enrichMessageForDisplay(message, senderProfiles, selfProfile, selfId) {
  if (!message || typeof message !== 'object') return message;

  const isSelf = normalizeEntityId(message.fromId) === normalizeEntityId(selfId) || String(message.fromId || '') === '0';
  const normalizedFromId = normalizeEntityId(message.fromId);
  const matchedProfile = normalizedFromId ? senderProfiles.get(normalizedFromId) : null;
  const rawProfile = extractSenderProfile(message);

  const dName = firstNonEmptyText(
    message.dName,
    matchedProfile?.name,
    rawProfile?.name,
    isSelf ? selfProfile?.name : '',
  );
  const avatar = firstNonEmptyText(
    message.avatar,
    matchedProfile?.avatar,
    rawProfile?.avatar,
    isSelf ? selfProfile?.avatar : '',
  );

  if (dName === message.dName && avatar === message.avatar) return message;
  return { ...message, dName, avatar };
}

function mergeSelectedFiles(existingFiles, incomingFiles) {
  const merged = [...(Array.isArray(existingFiles) ? existingFiles : [])];
  const seen = new Set(merged.map((file) => `${file.name}:${file.size}:${file.lastModified}`));

  for (const file of Array.isArray(incomingFiles) ? incomingFiles : []) {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(file);
  }

  return merged;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',').pop() : result;
      if (!base64) {
        reject(new Error(`Không thể đọc tệp ${file.name}.`));
        return;
      }
      resolve({
        name: file.name,
        data: base64,
        type: file.type || 'application/octet-stream',
        size: file.size || 0,
      });
    };
    reader.onerror = () => reject(new Error(`Không thể đọc tệp ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function getAvatarLabel(message) {
  if (message.dName) return message.dName[0].toUpperCase();
  if (message.fromId && !/^[0-9]+$/.test(message.fromId)) return message.fromId[0].toUpperCase();
  return '?';
}

function getSenderName(message) {
  return message.dName || '';
}

// --- Extract media/link info from rawContent ---
function extractMediaInfo(message) {
  const raw = message?.rawContent;
  if (!raw || typeof raw !== 'object') {
    // Check if text content contains a URL
    const text = message?.content || '';
    const urlMatch = typeof text === 'string' && text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) return { type: 'link', url: urlMatch[0] };
    return null;
  }

  const src = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!src) return null;

  const attachments = Array.isArray(src.attachments)
    ? src.attachments
    : (Array.isArray(src.attachment?.attachments) ? src.attachment.attachments : []);
  if (attachments.length > 0) {
    const firstAttachment = attachments[0];
    if (isImageFileLike(firstAttachment)) {
      return {
        type: 'image',
        url: firstAttachment.url || firstAttachment.previewUrl || firstAttachment.normalUrl || '',
        caption: attachments.length > 1 ? `+${attachments.length - 1} tệp khác` : '',
      };
    }
    return {
      type: 'file',
      name: attachments.length > 1
        ? `${firstAttachment.name || firstAttachment.fileName || 'Tệp đính kèm'} (+${attachments.length - 1})`
        : (firstAttachment.name || firstAttachment.fileName || 'Tệp đính kèm'),
      size: firstAttachment.size || firstAttachment.fileSize || 0,
    };
  }

  // Image
  const imgUrl = src.hdUrl || src.normalUrl || src.thumb || src.thumbSrc || src.imageUrl || src.photoUrl || src.thumbnail || src.image;
  if (imgUrl) return { type: 'image', url: imgUrl, caption: src.caption || src.description || src.title || '' };

  // Sticker
  if (src.stickerId || src.stickerUrl) return { type: 'sticker', url: src.stickerUrl || src.spriteUrl || '' };

  // File
  if (src.fileName || src.file_name) return { type: 'file', name: src.fileName || src.file_name, size: src.fileSize || src.file_size || 0 };

  // Video
  if (src.videoUrl || src.video) return { type: 'video', url: src.videoUrl || src.video, thumb: src.thumb || src.thumbUrl || '' };

  // Link card
  const href = src.href || src.url || src.link;
  if (href) return { type: 'link', url: href, title: src.title || src.name || '', desc: src.description || src.desc || '', thumb: src.thumb || src.thumbUrl || src.thumbnail || src.image || '' };

  // Nested: check src.params, src.data, src.attach
  for (const nested of [src.params, src.data, src.attach, src.attachment]) {
    if (nested && typeof nested === 'object') {
      const nestedResult = extractMediaInfo({ rawContent: nested });
      if (nestedResult) return nestedResult;
    }
  }

  return null;
}

// Render text with inline URLs as clickable links
function renderTextWithLinks(text) {
  if (!text || typeof text !== 'string') return text;
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{part}</a>
      : part
  );
}

// Zalo emoticon codes → emoji mapping
const ZALO_EMOTICONS = {
  '/-strong': '💪', '/-heart': '❤️', ':>': '😊', ':o': '😮', ':-((' : '😢',
  ':-h': '😎', ':-P': '😛', ':D': '😄', ':-|': '😐', ':-*': '😘',
  ':-x': '😡', ':-t': '😤', ':-/': '😕', ':-S': '😰', ':-@': '😠',
  ':-$': '😳', ':-&': '🤢', ':-!': '😬', ':-[': '😦', ':-\\\\': '😖',
  '>_<': '😣', 'o:)': '😇', 'B-)': '😎', ':-))': '😂', ':-(': '☹️',
  ':)': '🙂', ';)': '😉', ':P': '😛', ':*': '😘', ':|': '😐',
  ':(': '☹️', ';(': '😢', '/-rose': '🌹', '/-sun': '☀️',
  '/-rain': '🌧️', '/-cloud': '☁️', '/-star': '⭐', '/-moon': '🌙',
  '/-coffee': '☕', '/-beer': '🍺', '/-cake': '🎂', '/-gift': '🎁',
  '/-music': '🎵', '/-phone': '📱', '/-ok': '👌', '/-v': '✌️',
  '/-bye': '👋', '/-pray': '🙏', '/-clap': '👏', '/-like': '👍',
  '/-dislike': '👎', '/-angry': '😡', '/-cry': '😭', '/-laugh': '😆',
  '/-love': '😍', '/-kiss': '💋', '/-hug': '🤗', '/-think': '🤔',
  '/-cool': '😎', '/-shock': '😱',
};

function renderZaloEmoticons(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  for (const [code, emoji] of Object.entries(ZALO_EMOTICONS)) {
    if (result.includes(code)) {
      result = result.split(code).join(emoji);
    }
  }
  return result;
}

function MessageBubble({ message, isSelf, showAvatar = true, showName = true }) {
  const isFailed = message.status === 'failed';
  const isSending = message.status === 'sending';
  const senderName = getSenderName(message);
  const media = extractMediaInfo(message);
  const displayText = getMessageDisplayText(message);
  const isMediaOnly = media && (media.type === 'image' || media.type === 'sticker');

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isSelf ? 'flex-end' : 'flex-start',
        mb: 0.5,
        px: 1,
      }}
    >
      {!isSelf && (
        showAvatar ? (
          <Avatar src={message.avatar || ''} sx={{ width: 36, height: 36, mr: 1, mt: 0.5, fontSize: 15 }}>
            {getAvatarLabel(message)}
          </Avatar>
        ) : (
          <Box sx={{ width: 36, mr: 1 }} />
        )
      )}
      <Box sx={{ maxWidth: '65%' }}>
        {!isSelf && showName && senderName && (
          <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ ml: 0.5, mb: 0.25, display: 'block' }}>
            {senderName}
          </Typography>
        )}

        {/* Link card rendering */}
        {media?.type === 'link' && media.title ? (
          <Paper
            elevation={0}
            component="a"
            href={media.url}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'block',
              textDecoration: 'none',
              borderRadius: 2,
              overflow: 'hidden',
              bgcolor: 'grey.100',
              border: '1px solid',
              borderColor: 'divider',
              opacity: isSending ? 0.7 : 1,
              '&:hover': { borderColor: 'primary.main' },
            }}
          >
            {media.thumb && (
              <Box
                component="img"
                src={media.thumb}
                alt=""
                onError={(e) => { e.target.style.display = 'none'; }}
                sx={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }}
              />
            )}
            <Box sx={{ px: 1.5, py: 1 }}>
              <Typography variant="body2" fontWeight={600} color="text.primary" sx={{ mb: 0.25 }}>
                {media.title}
              </Typography>
              {media.desc && (
                <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {media.desc}
                </Typography>
              )}
            </Box>
          </Paper>
        ) : media?.type === 'image' && media.url ? (
          /* Image rendering */
          <Box sx={{ borderRadius: 2, overflow: 'hidden', opacity: isSending ? 0.7 : 1 }}>
            <Box
              component="img"
              src={media.url}
              alt={media.caption || 'Hình ảnh'}
              onError={(e) => { e.target.parentElement.innerHTML = '<div style="padding:12px;background:#f5f5f5;border-radius:8px;color:#999">[Hình ảnh]</div>'; }}
              sx={{ maxWidth: '100%', maxHeight: 300, borderRadius: 2, display: 'block', cursor: 'pointer' }}
              onClick={() => window.open(media.url, '_blank')}
            />
            {media.caption && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                {media.caption}
              </Typography>
            )}
          </Box>
        ) : media?.type === 'file' ? (
          /* File attachment */
          <Paper
            elevation={0}
            sx={{
              px: 1.5, py: 1, borderRadius: 2,
              bgcolor: isSelf ? 'primary.main' : 'grey.100',
              color: isSelf ? 'primary.contrastText' : 'text.primary',
              display: 'flex', alignItems: 'center', gap: 1,
              opacity: isSending ? 0.7 : 1,
            }}
          >
            <AttachFileIcon sx={{ fontSize: 18 }} />
            <Box>
              <Typography variant="body2" fontWeight={500}>{media.name}</Typography>
              {media.size > 0 && (
                <Typography variant="caption" color="inherit" sx={{ opacity: 0.7 }}>
                  {media.size > 1048576 ? `${(media.size / 1048576).toFixed(1)} MB` : `${Math.round(media.size / 1024)} KB`}
                </Typography>
              )}
            </Box>
          </Paper>
        ) : (
          /* Standard text bubble */
          <Paper
            elevation={0}
            sx={{
              px: 1.75,
              py: 1,
              borderRadius: 2,
              bgcolor: isFailed ? 'error.light' : isSelf ? 'primary.main' : 'grey.100',
              color: isFailed ? 'error.contrastText' : isSelf ? 'primary.contrastText' : 'text.primary',
              opacity: isSending ? 0.7 : 1,
              wordBreak: 'break-word',
            }}
          >
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
              {renderTextWithLinks(renderZaloEmoticons(displayText || ''))}
            </Typography>
          </Paper>
        )}

        {/* Link text below card (like competitor) */}
        {media?.type === 'link' && !media.title && media.url && (
          <Typography variant="caption" sx={{ display: 'block', mt: 0.25, px: 0.5 }}>
            <a href={media.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>{media.url}</a>
          </Typography>
        )}

        <Typography
          variant="caption"
          color={isFailed ? 'error.main' : 'text.secondary'}
          sx={{ display: 'block', mt: 0.25, textAlign: isSelf ? 'right' : 'left', px: 0.5, fontSize: '0.7rem' }}
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
const MSG_CACHE_PREFIX = 'zt_msgs_v2_';
const MSG_CACHE_MAX = 20; // max conversations to cache

function getCachedMessages(convId) {
  if (!convId) return [];
  try {
    const raw = localStorage.getItem(MSG_CACHE_PREFIX + convId);
    const parsed = raw ? JSON.parse(raw) : [];
    return hasUsableMessageList(parsed) ? parsed : [];
  } catch { return []; }
}

function setCachedMessages(convId, messages) {
  if (!convId || !messages?.length || !hasUsableMessageList(messages)) return;
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

export default function ChatView({ conversation, account, accountReady = false, refreshToken = 0 }) {
  const convId = conversation?.id || conversation?.rawId || null;
  const [messages, setMessages] = useState(() => getCachedMessages(convId));
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [groupMemberProfiles, setGroupMemberProfiles] = useState({});
  const messagesEndRef = useRef(null);
  const shouldAutoScroll = useRef(true);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  const selfId = String(account?.userId || account?.id || account?.zaloId || '');
  const conversationIdRef = useRef(convId);

  const selfProfile = useMemo(() => ({
    name: firstNonEmptyText(account?.name, account?.displayName, account?.zaloName),
    avatar: firstNonEmptyText(account?.avatar, account?.zaloAvatar),
  }), [account]);

  const senderProfiles = useMemo(() => {
    const map = buildBaseSenderProfiles(account, conversation);
    Object.entries(groupMemberProfiles || {}).forEach(([key, value]) => {
      const normalizedKey = normalizeEntityId(key);
      if (!normalizedKey) return;
      const current = map.get(normalizedKey);
      map.set(normalizedKey, {
        name: firstNonEmptyText(current?.name, value?.name),
        avatar: firstNonEmptyText(current?.avatar, value?.avatar),
      });
    });
    return map;
  }, [account, conversation, groupMemberProfiles]);

  const displayMessages = useMemo(
    () => messages.map((message) => enrichMessageForDisplay(message, senderProfiles, selfProfile, selfId)),
    [messages, senderProfiles, selfProfile, selfId],
  );

  useEffect(() => {
    setGroupMemberProfiles({});
    if (!conversation?.isGroup || !account || !accountReady) return undefined;

    const groupId = normalizeEntityId(conversation.id || conversation.rawId, true);
    if (!groupId) return undefined;

    let cancelled = false;

    resolveGroupInviteTargetsViaBackend({
      account,
      groups: [{
        groupId,
        zid: groupId,
        name: conversation.displayName || 'Nhóm',
      }],
      includeAllMembers: true,
    })
      .then((response) => {
        if (cancelled) return;
        const membersByGroup = response?.data?.membersByGroup || response?.membersByGroup || {};
        const rows = Array.isArray(membersByGroup[groupId]) ? membersByGroup[groupId] : [];
        const nextProfiles = {};
        rows.forEach((member) => {
          const memberId = normalizeEntityId(member?.zid || member?.userId || member?.id);
          if (!memberId) return;
          nextProfiles[memberId] = {
            name: firstNonEmptyText(member?.name, member?.displayName),
            avatar: firstNonEmptyText(member?.avatar),
          };
        });
        setGroupMemberProfiles(nextProfiles);
      })
      .catch(() => {
        if (!cancelled) setGroupMemberProfiles({});
      });

    return () => {
      cancelled = true;
    };
  }, [account, accountReady, conversation?.displayName, conversation?.id, conversation?.isGroup, conversation?.rawId]);

  const fetchMessages = useCallback(async (isPolling = false) => {
    if (!conversation || !account || !accountReady) return;

    const convId = conversation.id || conversation.rawId;
    const hasBackend = Boolean(API_BASE);
    
    // Track which conversation we're fetching for
    if (!isPolling) {
      conversationIdRef.current = convId;
      setLoading(true);
      setFetchError(null);
    }

    // Don't fetch if conversation changed while we were waiting
    if (conversationIdRef.current !== convId) return;
    
    try {
      if (!isPolling) {
        console.log('[ChatView] Fetching messages for', convId, 'isGroup:', conversation.isGroup, 'backend:', hasBackend);
      }

      let response = null;

      // Strategy 1: Backend history API (DB-first + server hydrate).
      if (hasBackend) {
        try {
          const res = await fetch(`${API_BASE}/api/zalo/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              account,
              threadId: convId,
              conversationId: convId,
              isGroup: Boolean(conversation.isGroup),
              count: 30,
            }),
          });

          if (res.ok) {
            const json = await res.json();
            response = {
              ok: Boolean(json?.ok),
              data: Array.isArray(json?.data) ? json.data : [],
              error: json?.error || null,
              source: json?.source || 'backend',
            };
          } else {
            let errorMessage = `Backend HTTP ${res.status}`;
            try {
              const errJson = await res.json();
              if (errJson?.error) errorMessage = errJson.error;
            } catch {}
            response = { ok: false, data: [], error: errorMessage, source: 'backend' };
          }
        } catch (backendErr) {
          console.warn('[ChatView] Backend history failed:', backendErr.message);
        }
      }

      // Stale check: don't update if user switched conversations
      if (conversationIdRef.current !== convId) return;

      if (!isPolling) {
        console.log('[ChatView] getMessageHistory response:', response?.ok, 'source:', response?.source || 'extension', 'data length:', response?.data?.length);
        if (response?.data?.[0]) {
          console.log('[ChatView] First message sample keys:', Object.keys(response.data[0]));
        }
      }

      if (response?.ok && Array.isArray(response.data)) {
        const sorted = [...response.data].sort((a, b) => (a.ts || 0) - (b.ts || 0));
        if (sorted.length > 0 && !hasUsableMessageList(sorted)) {
          console.warn('[ChatView] getMessageHistory returned placeholder-only data for', convId);
          if (!isPolling) {
            setMessages([]);
            setFetchError('Đã nhận được lịch sử nhưng chưa đọc ra nội dung thực từ backend.');
          }
          return;
        }
        setMessages((prev) => {
          // Guard against race condition: user may have switched conversation
          // between the stale-check above and this state updater executing
          if (conversationIdRef.current !== convId) return prev;
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
        setFetchError(response.error || 'Không lấy được tin nhắn.');
      } else if (response?.ok && (!response.data || response.data.length === 0)) {
        const previewMsg = buildConversationPreviewMessage(conversation);
        if (previewMsg && hasRenderableMessageContent(previewMsg)) {
          setMessages((prev) => {
            const prevSignature = prev.map(buildMessageSignature).join('|');
            const nextList = [previewMsg];
            const nextSignature = nextList.map(buildMessageSignature).join('|');
            if (prevSignature === nextSignature) return prev;
            setCachedMessages(convId, nextList);
            return nextList;
          });
          if (!isPolling) setFetchError(null);
        } else if (!isPolling) {
          setFetchError('API backend trả về 0 tin nhắn.');
        }
      }
    } catch (err) {
      console.error('[ChatView] fetchMessages error:', err);
      if (!isPolling) {
        setMessages([]);
        setFetchError(err?.message || 'Lỗi không xác định khi tải tin nhắn.');
      }
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [conversation, account, accountReady]);

  // Initial load when conversation changes — restore cache then fetch from backend/extension.
  useEffect(() => {
    const id = conversation?.id || conversation?.rawId || null;
    conversationIdRef.current = id;
    const cached = getCachedMessages(id);
    setMessages(cached);
    setInputValue('');
    setSelectedFiles([]);
    setFetchError(null);
    if (id && accountReady && Boolean(API_BASE)) fetchMessages(false);
  }, [fetchMessages, conversation]);

  // Immediate refresh when parent detects a backend realtime delta for current conversation.
  useEffect(() => {
    if (!conversation || !account || !accountReady) return;
    if (!API_BASE) return;
    fetchMessages(true);
  }, [refreshToken, conversation, account, accountReady, fetchMessages]);

  // Fallback poll every 15s (in case WebSocket interceptor misses something)
  useEffect(() => {
    if (!conversation || !account || !accountReady) return;
    if (!API_BASE) return;
    const intervalId = setInterval(() => fetchMessages(true), 5000);
    return () => clearInterval(intervalId);
  }, [conversation, account, accountReady, fetchMessages]);

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
  }, [displayMessages]);

  const handleAttachFiles = useCallback((event) => {
    const pickedFiles = Array.from(event.target.files || []);
    if (pickedFiles.length > 0) {
      setSelectedFiles((prev) => mergeSelectedFiles(prev, pickedFiles));
    }
    event.target.value = '';
  }, []);

  const handleRemoveFile = useCallback((indexToRemove) => {
    setSelectedFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  }, []);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    const filesToSend = selectedFiles;
    if ((!text && filesToSend.length === 0) || sending || !conversation || !accountReady) return;

    setSending(true);
    const tempMsgId = `temp_${Date.now()}`;
    const tempMsg = {
      msgId: tempMsgId,
      fromId: selfId,
      content: text,
      ts: Date.now(),
      msgType: filesToSend.length > 0 ? (isImageFileLike(filesToSend[0]) ? 'image' : 'file') : 'text',
      rawContent: filesToSend.length > 0 ? {
        attachments: filesToSend.map((file) => ({
          name: file.name,
          fileName: file.name,
          size: file.size,
          fileSize: file.size,
          type: file.type,
          mimeType: file.type,
        })),
      } : null,
      dName: selfProfile.name,
      avatar: selfProfile.avatar,
      status: 'sending',
    };
    setMessages((prev) => [...prev, tempMsg]);
    setInputValue('');
    setSelectedFiles([]);

    try {
      let sent = false;
      const filePayloads = await Promise.all(filesToSend.map((file) => fileToBase64(file)));

      // Strategy 1: Backend API (zalo-api-final)
      if (API_BASE && account) {
        try {
          const res = await fetch(`${API_BASE}/api/zalo/messages/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              account,
              jobs: [{
                id: tempMsg.msgId,
                zid: conversation.id || conversation.rawId,
                isGroup: conversation.isGroup,
                content: text,
                sourceTab: conversation.isGroup ? 'group' : 'friend',
              }],
              files: filePayloads,
            }),
          });
          if (res.ok) {
            // Read NDJSON stream to check result
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            let lastResult = null;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop() || '';
              for (const line of lines) {
                if (!line.trim()) continue;
                try { lastResult = JSON.parse(line); } catch {}
              }
            }
            if (lastResult?.ok) sent = true;
            else if (lastResult?.error && lastResult?.code !== 'SERVICE_LOGIN_FAILED') {
              // Re-throw non-session errors; session errors fall through to extension
              throw new Error(lastResult.error);
            }
          }
        } catch (backendErr) {
          if (sent) throw backendErr;
          console.warn('[ChatView] Backend send failed:', backendErr.message);
        }
      }

      if (!sent) {
        throw new Error('Không có kênh gửi tin nhắn khả dụng qua backend.');
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.msgId === tempMsg.msgId ? { ...m, status: 'sent' } : m
        )
      );
      fetchMessages(true);
    } catch (error) {
      console.error('[ChatView] Send failed:', error);
      setSelectedFiles((prev) => mergeSelectedFiles(prev, filesToSend));
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
  }, [account, accountReady, conversation, fetchMessages, inputValue, selectedFiles, selfId, selfProfile, sending]);

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
      <Box sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: 'background.paper' }}>
        <Avatar src={conversation.avatar} sx={{ width: 44, height: 44 }}>
          {(conversation.displayName || 'Z')[0]}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap>
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
          <Box sx={{ textAlign: 'center', pt: 4, px: 3 }}>
            <Typography variant="body2" color="text.secondary">
              {!accountReady
                ? 'Tài khoản chưa sẵn sàng để tải lịch sử tin nhắn. Hãy hoàn tất đồng bộ với extension.'
                : fetchError
                  ? `Lỗi: ${fetchError}`
                    : 'Chưa có dữ liệu tin nhắn từ backend.'}
            </Typography>
          </Box>
        ) : (
          displayMessages.filter(hasRenderableMessageContent).map((msg, index, arr) => {
            // Zalo convention: "0" means self for uidFrom/idTo
            const isSelf = normalizeEntityId(msg.fromId) === normalizeEntityId(selfId) || msg.fromId === '0';
            const prevMsg = index > 0 ? arr[index - 1] : null;
            const sameSenderAsPrev = prevMsg && prevMsg.fromId === msg.fromId;
            const closeInTime = prevMsg && Math.abs((msg.ts || 0) - (prevMsg.ts || 0)) < 120000; // 2 min
            const grouped = sameSenderAsPrev && closeInTime;
            return (
              <MessageBubble
                key={msg.msgId || `idx_${index}_${msg.ts}`}
                message={msg}
                isSelf={isSelf}
                showAvatar={!grouped}
                showName={!grouped}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input area */}
      <Divider />
      <Box sx={{ p: 1.5 }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={handleAttachFiles}
        />
        {selectedFiles.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
            {selectedFiles.map((file, index) => (
              <Paper
                key={`${file.name}_${file.size}_${file.lastModified}_${index}`}
                variant="outlined"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  pl: 1.25,
                  pr: 0.5,
                  py: 0.5,
                  borderRadius: 2,
                  maxWidth: 260,
                }}
              >
                <AttachFileIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap>{file.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{formatFileSize(file.size)}</Typography>
                </Box>
                <IconButton size="small" onClick={() => handleRemoveFile(index)} disabled={sending}>
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Paper>
            ))}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
        <IconButton size="small" onClick={() => fileInputRef.current?.click()} disabled={sending || !accountReady}>
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
          disabled={(!inputValue.trim() && selectedFiles.length === 0) || sending || !accountReady}
        >
          <SendIcon />
        </IconButton>
        </Box>
      </Box>
    </Box>
  );
}
