import React, { useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Box,
  InputAdornment,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PushPinIcon from '@mui/icons-material/PushPin';

function formatTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} giờ`;

  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ConversationList({ conversations, selectedId, onSelect, loading }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) =>
      (c.displayName || '').toLowerCase().includes(q) ||
      (c.id || '').includes(q)
    );
  }, [conversations, search]);

  const getPreviewText = (conversation) => {
    const preview = String(conversation?.lastMessage || '').trim();
    if (!preview) return 'Chưa có tin nhắn';
    const sender = String(conversation?.lastSenderName || '').trim();
    if (conversation?.isGroup && sender) return `${sender}: ${preview}`;
    return preview;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 1.5 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Tìm kiếm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      <List
        sx={{
          flex: 1,
          overflow: 'auto',
          py: 0,
          '& .MuiListItemButton-root': { px: 1.5, py: 1.25 },
        }}
      >
        {loading ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">Đang tải hội thoại...</Typography>
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {search ? 'Không tìm thấy hội thoại.' : 'Chưa có hội thoại nào.'}
            </Typography>
          </Box>
        ) : filtered.map((conversation) => {
          const key = `${conversation.isGroup ? 'g' : 'u'}_${conversation.id || conversation.rawId}`;
          const isActive = selectedId === conversation.id;

          return (
            <ListItemButton
              key={key}
              selected={isActive}
              onClick={() => onSelect(conversation)}
              sx={{
                borderLeft: isActive ? '3px solid' : '3px solid transparent',
                borderLeftColor: isActive ? 'primary.main' : 'transparent',
                bgcolor: isActive ? 'action.selected' : 'transparent',
              }}
            >
              <ListItemAvatar sx={{ minWidth: 54 }}>
                <Badge
                  badgeContent={conversation.unreadCount || 0}
                  color="primary"
                  max={99}
                  invisible={!conversation.unreadCount}
                >
                  <Avatar
                    src={conversation.avatar}
                    sx={{ width: 46, height: 46 }}
                  >
                    {(conversation.displayName || 'Z')[0]}
                  </Avatar>
                </Badge>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body1" fontWeight={conversation.unreadCount ? 700 : 500} noWrap sx={{ flex: 1 }}>
                      {conversation.displayName || 'Không rõ tên'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {formatTime(conversation.lastMsgTime)}
                    </Typography>
                  </Box>
                }
                secondary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography
                      variant="body2"
                      color={conversation.unreadCount ? 'text.primary' : 'text.secondary'}
                      fontWeight={conversation.unreadCount ? 600 : 400}
                      noWrap
                      sx={{ flex: 1 }}
                    >
                      {getPreviewText(conversation)}
                    </Typography>
                    {conversation.isPinned && (
                      <PushPinIcon sx={{ fontSize: 14, color: 'text.secondary', flexShrink: 0 }} />
                    )}
                  </Box>
                }
                disableTypography
              />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}
