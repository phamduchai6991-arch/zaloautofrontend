import React, { useState } from 'react';
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
} from '@mui/material';
import {
  Download as DownloadIcon,
  Notifications as NotifIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription, PLAN_LABELS } from '../contexts/SubscriptionContext';

export default function HeaderBar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { planKey, isActive, loading } = useSubscription();
  const [anchorEl, setAnchorEl] = useState(null);

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
      navigate('/login');
    }
  };

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
    navigate('/login');
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
      <Toolbar sx={{ justifyContent: 'flex-end', gap: 1.5, minHeight: '92px !important', px: 3 }}>
        {/* Download Extension */}
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
          v1.0.0
        </Button>

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
          onClick={() => navigate('/pricing')}
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
        <IconButton size="small">
          <Badge badgeContent={0} showZero color="error" sx={{ '& .MuiBadge-badge': { fontSize: 10, minWidth: 16, height: 16 } }}>
            <NotifIcon fontSize="small" sx={{ color: '#637381' }} />
          </Badge>
        </IconButton>

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
