import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppBar,
  Toolbar,
  Box,
  Button,
  Badge,
  Avatar,
  IconButton,
  Chip,
  Typography,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Alert,
  Popover,
  List,
  ListItem,
  ListItemButton,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Notifications as NotifIcon,
  Logout as LogoutIcon,
  CheckCircle as SubscriptionIcon,
  Warning as WarningIcon,
  Error as ExpiredIcon,
  DoneAll as DoneAllIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import { useSubscription, PLAN_LABELS } from '../contexts/SubscriptionContext';

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';

const NOTIF_ICONS = {
  subscription_activated: <SubscriptionIcon fontSize="small" color="success" />,
  subscription_expiring: <WarningIcon fontSize="small" color="warning" />,
  subscription_expired: <ExpiredIcon fontSize="small" color="error" />,
};

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins}p`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function HeaderBar() {
  const navigate = useNavigate();
  const { user, logout, authExpired } = useAuth();
  const { extensionActive, extensionChecked } = useAccount();
  const { planKey, isActive, loading } = useSubscription();
  const [anchorEl, setAnchorEl] = useState(null);

  // Notification state
  const [notifAnchor, setNotifAnchor] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifPollRef = useRef(null);

  // Poll unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!user?.sub) return;
    try {
      const res = await fetch(`${API_BASE}/api/notifications/${encodeURIComponent(user.sub)}/count`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) setUnreadCount(data.unread);
      }
    } catch (_) { /* silent */ }
  }, [user?.sub]);

  useEffect(() => {
    if (!user?.sub) return;
    fetchUnreadCount();
    notifPollRef.current = setInterval(fetchUnreadCount, 30000);
    return () => { if (notifPollRef.current) clearInterval(notifPollRef.current); };
  }, [user?.sub, fetchUnreadCount]);

  const handleNotifOpen = async (event) => {
    setNotifAnchor(event.currentTarget);
    if (!user?.sub) return;
    setNotifLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/notifications/${encodeURIComponent(user.sub)}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setNotifications(data.notifications || []);
          setUnreadCount(data.unread || 0);
        }
      }
    } catch (_) { /* silent */ }
    setNotifLoading(false);
  };

  const handleNotifClose = () => setNotifAnchor(null);

  const handleMarkAllRead = async () => {
    if (!user?.sub) return;
    try {
      await fetch(`${API_BASE}/api/notifications/read-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.sub }),
      });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (_) { /* silent */ }
  };

  const handleNotifClick = async (notif) => {
    if (!notif.read && user?.sub) {
      try {
        await fetch(`${API_BASE}/api/notifications/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.sub, id: notif.id }),
        });
        setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, read: true } : n));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (_) { /* silent */ }
    }
    // Navigate to pricing if subscription-related
    if (notif.type?.startsWith('subscription_')) {
      handleNotifClose();
      window.location.assign('/pricing');
    }
  };

  const openLoginPage = () => {
    window.location.assign('/login');
  };

  const planLabel = user
    ? (loading && !planKey
      ? '...'
      : (isActive ? (PLAN_LABELS[planKey] || String(planKey || '').toUpperCase()) : 'FREE'))
    : 'LOGIN';

  const planColor = user
    ? (loading && !planKey ? '#9aa5b1' : (isActive ? '#f59e0b' : '#637381'))
    : '#637381';

  const handleAvatarClick = (e) => {
    if (user) {
      setAnchorEl(e.currentTarget);
    } else {
      openLoginPage();
    }
  };

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
    openLoginPage();
  };

  return (
    <AppBar
      position="static"
      color="inherit"
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        borderBottom: '1px dashed',
        borderColor: 'divider',
        boxShadow: 'none',
      }}
    >
      {authExpired && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={() => { logout(); openLoginPage(); }}>
              Đăng nhập lại
            </Button>
          }
          sx={{ borderRadius: 0 }}
        >
          Phiên đăng nhập Google đã hết hạn. Vui lòng đăng nhập lại để tiếp tục sử dụng.
        </Alert>
      )}
      <Toolbar sx={{ justifyContent: 'flex-end', gap: 1.5, minHeight: '92px !important', px: 3 }}>
        {/* Extension Status */}
        {extensionChecked && extensionActive ? (
          <Button
            size="small"
            startIcon={<CheckCircleIcon fontSize="small" />}
            sx={{
              fontSize: '0.8rem',
              fontWeight: 700,
              border: '0.8px solid',
              borderColor: 'rgb(84,214,44)',
              color: 'rgb(34,154,22)',
              bgcolor: 'rgba(84,214,44,0.08)',
              textTransform: 'none',
              borderRadius: '8px',
              px: 2,
              py: 0.5,
              height: 32,
              pointerEvents: 'none',
            }}
          >
            Extension đã kết nối · v3.0.0
          </Button>
        ) : (
          <Button
            size="small"
            component="a"
            href="/autozalo-extension.zip"
            download="autozalo-extension.zip"
            startIcon={<DownloadIcon fontSize="small" />}
            sx={{
              fontSize: '0.8rem',
              fontWeight: 700,
              border: '0.8px solid',
              borderColor: 'rgb(255,72,66)',
              color: 'rgb(255,72,66)',
              textTransform: 'none',
              borderRadius: '8px',
              px: 2,
              py: 0.5,
              height: 32,
            }}
          >
            Tải và cài extension để web hoạt động trước · v3.0.0
          </Button>
        )}

        {/* Flag */}
        <IconButton
          size="small"
          sx={{
            width: 40,
            height: 40,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '50%',
            p: 0,
            overflow: 'hidden',
          }}
        >
          <Box
            component="img"
            src="/ic_flag_vn.svg"
            alt="Vietnamese"
            sx={{ width: 28, height: 20, objectFit: 'cover' }}
          />
        </IconButton>

        {/* Mua Gói */}
        <Button
          size="small"
          onClick={() => window.location.assign('/pricing')}
          sx={{
            fontSize: '0.8rem',
            fontWeight: 700,
            border: '0.8px solid',
            borderColor: 'rgb(32,101,209)',
            color: 'rgb(32,101,209)',
            bgcolor: '#fff',
            textTransform: 'none',
            borderRadius: '8px',
            px: 2,
            py: 0.5,
            height: 32,
          }}
        >
          Mua gói
        </Button>

        {/* Notification */}
        <IconButton size="small" onClick={handleNotifOpen}>
          <Badge badgeContent={unreadCount} color="error" sx={{ '& .MuiBadge-badge': { fontSize: 10, minWidth: 16, height: 16 } }}>
            <NotifIcon fontSize="small" sx={{ color: '#637381' }} />
          </Badge>
        </IconButton>
        <Popover
          open={Boolean(notifAnchor)}
          anchorEl={notifAnchor}
          onClose={handleNotifClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { width: 360, maxHeight: 420, mt: 1 } } }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={700}>Thông báo</Typography>
            {unreadCount > 0 && (
              <Button size="small" startIcon={<DoneAllIcon fontSize="small" />} onClick={handleMarkAllRead} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                Đọc tất cả
              </Button>
            )}
          </Box>
          <Divider />
          {notifLoading ? (
            <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={24} /></Box>
          ) : notifications.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">Chưa có thông báo</Typography>
            </Box>
          ) : (
            <List disablePadding sx={{ maxHeight: 340, overflow: 'auto' }}>
              {notifications.map((notif) => (
                <ListItem key={notif.id} disablePadding>
                  <ListItemButton
                    onClick={() => handleNotifClick(notif)}
                    sx={{ py: 1.5, px: 2, bgcolor: notif.read ? 'transparent' : 'action.hover' }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {NOTIF_ICONS[notif.type] || <NotifIcon fontSize="small" color="action" />}
                    </ListItemIcon>
                    <ListItemText
                      primary={notif.title}
                      secondary={notif.body}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: notif.read ? 400 : 700 }}
                      secondaryTypographyProps={{ variant: 'caption', sx: { mt: 0.25 } }}
                    />
                    <Typography variant="caption" color="text.disabled" sx={{ ml: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {formatTimeAgo(notif.created_at)}
                    </Typography>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Popover>

        {/* User Avatar */}
        <Box sx={{ position: 'relative', cursor: 'pointer' }} onClick={handleAvatarClick}>
          <Avatar
            src={user?.picture}
            sx={{
              width: 44,
              height: 44,
              bgcolor: '#6366f1',
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            {user ? user.name?.charAt(0) : 'P'}
          </Avatar>
          <Chip
            label={planLabel}
            size="small"
            sx={{
              position: 'absolute',
              bottom: -6,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '0.55rem',
              height: 14,
              fontWeight: 700,
              bgcolor: planColor,
              color: '#fff',
              '& .MuiChip-label': { px: 0.5 },
            }}
          />
        </Box>

        {/* Logout Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          slotProps={{ paper: { sx: { mt: 1, minWidth: 200, borderRadius: 2 } } }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle2" fontWeight={700}>{user?.name}</Typography>
            <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
          </Box>
          <MenuItem onClick={handleLogout}>
            <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Đăng xuất</ListItemText>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
