import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Box } from '@mui/material';
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
          <Outlet />
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

