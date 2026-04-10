import React, { Suspense, lazy, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Box } from '@mui/material';
import HeaderBar from './components/HeaderBar';
import Sidebar from './components/Sidebar';

const AccountsPage = lazy(() => import('./pages/AccountsPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const ReachPage = lazy(() => import('./pages/ReachPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const GuidePage = lazy(() => import('./pages/GuidePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
          <Suspense fallback={<Box sx={{ p: 3 }}>Đang tải màn hình...</Box>}>
            <Outlet />
          </Suspense>
        </Box>
      </Box>
    </Box>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/reach" replace />} />
          <Route path="/reach" element={<ReachPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="*" element={<Navigate to="/reach" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
