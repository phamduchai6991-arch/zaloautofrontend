import React from 'react';
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Typography,
} from '@mui/material';
import {
  EditNote as EditNoteIcon,
  Person as PersonIcon,
  ChatBubbleOutline as ChatIcon,
  MenuBook as GuideIcon,
  HeadsetMic as SupportIcon,
} from '@mui/icons-material';
import { useLocation } from 'react-router-dom';

const DRAWER_WIDTH = 280;

const mainMenu = [
  { icon: <EditNoteIcon />, label: 'Tương Tác', path: '/reach' },
  { icon: <PersonIcon />, label: 'Tài Khoản Zalo', path: '/accounts' },
  { icon: <ChatIcon />, label: 'Tin Nhắn', path: '/messages' },
];

const bottomMenu = [
  { icon: <GuideIcon />, label: 'Hướng Dẫn Sử Dụng', path: '/guide' },
  { icon: <SupportIcon />, label: 'Hỗ Trợ Online', path: '/support' },
];

export default function Sidebar({ open, onToggle }) {
  const drawerWidth = open ? DRAWER_WIDTH : 80;
  const location = useLocation();

  const renderItem = (item, idx) => {
    const isActive = item.path ? location.pathname.startsWith(item.path) : false;

    const linkProps = item.href
      ? { component: 'a', href: item.href, target: '_blank', rel: 'noopener noreferrer' }
      : item.path
        ? { onClick: () => window.location.assign(item.path) }
        : {};

    return (
    <ListItemButton
      key={idx}
      {...linkProps}
      sx={{
        borderRadius: 1.5,
        mx: 1,
        mb: 0.5,
        px: open ? 2 : 1.5,
        py: 1,
        justifyContent: open ? 'initial' : 'center',
        bgcolor: isActive ? 'rgba(0,104,255,0.08)' : 'transparent',
        color: isActive ? 'primary.main' : 'text.secondary',
        '&:hover': {
          bgcolor: isActive ? 'rgba(0,104,255,0.12)' : 'action.hover',
        },
      }}
    >
      <ListItemIcon
        sx={{
          color: isActive ? 'primary.main' : 'text.secondary',
          minWidth: open ? 36 : 'auto',
          mr: open ? 1.5 : 0,
          justifyContent: 'center',
        }}
      >
        {item.icon}
      </ListItemIcon>
      {open && (
        <ListItemText
          primary={item.label}
          primaryTypographyProps={{
            variant: 'body2',
            fontWeight: isActive ? 600 : 500,
            noWrap: true,
          }}
        />
      )}
    </ListItemButton>
    );
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        transition: 'width 0.2s',
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          bgcolor: 'background.paper',
          borderRight: '1px dashed',
          borderColor: 'divider',
          transition: 'width 0.2s',
          overflowX: 'hidden',
        },
      }}
    >
      {/* Collapse toggle */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: open ? 'flex-end' : 'center',
          cursor: 'pointer',
        }}
        onClick={onToggle}
      >
        <Typography sx={{ fontSize: 18, color: 'text.secondary', userSelect: 'none' }}>
          {open ? '«' : '»'}
        </Typography>
      </Box>

      {/* Main menu */}
      <List sx={{ flex: 1, py: 0 }}>
        {mainMenu.map(renderItem)}
      </List>

      {/* Bottom menu */}
      <List sx={{ py: 1 }}>
        {bottomMenu.map(renderItem)}
      </List>

      {/* Build version */}
      {open && (
        <Box sx={{ px: 2, pb: 2 }}>
          <Chip
            label="build.7.1.1"
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.7rem', height: 22 }}
          />
        </Box>
      )}
    </Drawer>
  );
}
