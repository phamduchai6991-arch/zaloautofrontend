import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Box, Alert, Button, Typography } from '@mui/material';
import HeaderBar from './components/HeaderBar';
import Sidebar from './components/Sidebar';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import AccountsPage from './pages/AccountsPage';
import MessagesPage from './pages/MessagesPage';
import ReachPage from './pages/ReachPage';
import PricingPage from './pages/PricingPage';
import GuidePage from './pages/GuidePage';
import LoginPage from './pages/LoginPage';
import SupportPage from './pages/SupportPage';
import AdminPage from './pages/AdminPage';

class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[PageErrorBoundary]', error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.locationKey !== this.props.locationKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            Trang gặp lỗi khi hiển thị. Hãy thử tải lại.
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {String(this.state.error?.message || '')}
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Tải lại trang
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <Box
        component="main"
        sx={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <HeaderBar />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <PageErrorBoundary locationKey={location.key}>
            <Outlet />
          </PageErrorBoundary>
        </Box>
      </Box>
    </Box>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SubscriptionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/reach" replace />} />
            <Route path="/reach" element={<ReachPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/reach" replace />} />
          </Route>
        </Routes>
      </SubscriptionProvider>
    </BrowserRouter>
  );
}

