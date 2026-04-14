import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  Stack,
  Divider,
  CircularProgress,
  Chip,
  IconButton,
  Alert,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  CheckCircle as CheckIcon,
  Close as CloseIcon,
  AccountBalance as BankIcon,
} from '@mui/icons-material';

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';
const MAX_POLL_MS = 10 * 60 * 1000;

const PLAN_NAMES = { basic: 'BASIC', plus: 'PLUS', pro: 'PRO' };
const PERIOD_LABELS = { monthly: 'Tháng', yearly: 'Năm' };

function formatPrice(value) {
  return value.toLocaleString('vi-VN') + 'đ';
}

function InfoRow({ label, value, copyable }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
          {value}
        </Typography>
        {copyable && (
          <IconButton size="small" onClick={handleCopy} sx={{ ml: 0.5 }}>
            {copied ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" />}
          </IconButton>
        )}
      </Stack>
    </Box>
  );
}

export default function PaymentDialog({ open, onClose, plan, period, user }) {
  const [step, setStep] = useState('creating'); // creating | transfer | checking | success | error
  const [order, setOrder] = useState(null);
  const [bankInfo, setBankInfo] = useState(null);
  const [upgradeInfo, setUpgradeInfo] = useState(null);
  const [error, setError] = useState('');
  const pollRef = useRef(null);
  const pollStartedAtRef = useRef(0);
  const pollFailCountRef = useRef(0);

  const amount = plan
    ? period === 'yearly' ? plan.priceYearly : plan.priceMonthly
    : 0;

  // Create order on open
  useEffect(() => {
    if (!open || !plan || !user) return;

    setStep('creating');
    setError('');
    setOrder(null);
    setUpgradeInfo(null);

    fetch(`${API_BASE}/api/payment/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.sub,
        userEmail: user.email,
        planKey: plan.key,
        period,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setOrder(data.order);
          setBankInfo(data.bank);
          setUpgradeInfo(data.upgrade || null);
          setStep('transfer');
        } else {
          setError(data.error || 'Không tạo được đơn hàng.');
          setStep('error');
        }
      })
      .catch(() => {
        setError('Không kết nối được server. Hãy chắc chắn đã chạy "npm run dev".');
        setStep('error');
      });
  }, [open, plan, user, period]);

  // Poll for payment status
  const startPolling = useCallback(() => {
    if (!order?.code) return;
    if (pollRef.current) clearInterval(pollRef.current);

    setStep('checking');
    setError('');
    pollStartedAtRef.current = Date.now();
    pollFailCountRef.current = 0;

    pollRef.current = setInterval(() => {
      // Timeout check FIRST — runs regardless of fetch result
      if (Date.now() - pollStartedAtRef.current > MAX_POLL_MS) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setError('Hết thời gian chờ xác nhận thanh toán. Nếu bạn đã chuyển khoản, hãy mở lại đơn hàng hoặc liên hệ hỗ trợ.');
        setStep('error');
        return;
      }

      fetch(`${API_BASE}/api/payment/orders/${order.code}`, { cache: 'no-store' })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((data) => {
          pollFailCountRef.current = 0;

          if (data.ok && data.order.status === 'paid') {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setOrder(data.order);
            setStep('success');
            return;
          }

          if (data.ok && data.order.status === 'expired') {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setError('Đơn hàng đã hết hạn. Vui lòng tạo đơn mới để tiếp tục thanh toán.');
            setStep('error');
          }
        })
        .catch(() => {
          pollFailCountRef.current += 1;
          if (pollFailCountRef.current >= 12) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setError('Mất kết nối với server. Hãy kiểm tra mạng rồi thử lại.');
            setStep('error');
          }
        });
    }, 5000);
  }, [order]);

  // Auto-start polling when transfer step is reached (QR flow — user may pay without clicking button)
  useEffect(() => {
    if (step === 'transfer' && order?.code && !pollRef.current) {
      pollStartedAtRef.current = Date.now();
      pollFailCountRef.current = 0;
      pollRef.current = setInterval(() => {
        fetch(`${API_BASE}/api/payment/orders/${order.code}`, { cache: 'no-store' })
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .then((data) => {
            pollFailCountRef.current = 0;
            if (data.ok && data.order.status === 'paid') {
              clearInterval(pollRef.current);
              pollRef.current = null;
              setOrder(data.order);
              setStep('success');
            } else if (data.ok && data.order.status === 'expired') {
              clearInterval(pollRef.current);
              pollRef.current = null;
              setError('Đơn hàng đã hết hạn. Vui lòng tạo đơn mới.');
              setStep('error');
            }
          })
          .catch(() => {
            pollFailCountRef.current += 1;
          });
      }, 5000);
    }
    return () => {
      if (step !== 'transfer' && step !== 'checking' && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [step, order]);

  // Cleanup polling on unmount/close
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleTransferred = () => {
    startPolling();
  };

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setStep('creating');
    setOrder(null);
    setError('');
    onClose(step === 'success');
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <BankIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>Thanh toán chuyển khoản</Typography>
        </Stack>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Creating */}
        {step === 'creating' && (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <CircularProgress />
            <Typography sx={{ mt: 2 }}>Đang tạo đơn hàng...</Typography>
          </Box>
        )}

        {/* Error */}
        {step === 'error' && (
          <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>
        )}

        {/* Transfer info */}
        {step === 'transfer' && order && bankInfo && (
          <Box>
            <Box sx={{ mb: 2, p: 2, bgcolor: 'primary.50', borderRadius: 2, border: '1px solid', borderColor: 'primary.100' }}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                Thông tin đơn hàng
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label={PLAN_NAMES[order.planKey]} size="small" color="primary" />
                <Typography variant="body2">
                  {PERIOD_LABELS[order.period]} — <strong>{formatPrice(order.amount)}</strong>
                </Typography>
              </Stack>
              {upgradeInfo && (
                <Alert severity="info" icon={false} sx={{ mt: 1.5, py: 0.5 }}>
                  <Typography variant="body2">
                    Giá gốc: {formatPrice(upgradeInfo.originalAmount)} — Trừ còn lại gói cũ: <strong>−{formatPrice(upgradeInfo.discount)}</strong>
                  </Typography>
                  <Typography variant="body2" fontWeight={700}>
                    Chỉ cần thanh toán: {formatPrice(upgradeInfo.finalAmount)}
                  </Typography>
                </Alert>
              )}
            </Box>

            {/* SePay Dynamic QR Code */}
            <Box sx={{ textAlign: 'center', mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Quét mã QR để chuyển khoản
              </Typography>
              <Box
                component="img"
                src={`https://qr.sepay.vn/img?acc=${encodeURIComponent(bankInfo.accountNumber)}&bank=${encodeURIComponent(bankInfo.bankName)}&amount=${order.amount}&des=${encodeURIComponent(order.code)}`}
                alt="QR thanh toán"
                sx={{ width: 220, height: 220, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
              />
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                Mở app ngân hàng, quét QR — thông tin sẽ được điền sẵn
              </Typography>
            </Box>

            <Divider sx={{ my: 1.5 }}>
              <Typography variant="caption" color="text.secondary">hoặc chuyển khoản thủ công</Typography>
            </Divider>

            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              Chuyển khoản theo thông tin sau:
            </Typography>

            <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
              <InfoRow label="Ngân hàng" value={bankInfo.bankName} />
              <Divider />
              <InfoRow label="Số tài khoản" value={bankInfo.accountNumber} copyable />
              <Divider />
              <InfoRow label="Chủ tài khoản" value={bankInfo.accountHolder} />
              <Divider />
              <InfoRow label="Số tiền" value={formatPrice(order.amount)} copyable />
              <Divider />
              <InfoRow label="Nội dung CK" value={order.code} copyable />
            </Box>

            <Alert severity="warning" sx={{ mt: 2 }}>
              <strong>Quan trọng:</strong> Ghi đúng nội dung chuyển khoản <strong>{order.code}</strong> để hệ thống tự động xác nhận.
            </Alert>
          </Box>
        )}

        {/* Checking payment */}
        {step === 'checking' && (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <CircularProgress size={48} />
            <Typography sx={{ mt: 2, fontWeight: 600 }}>
              Đang chờ xác nhận thanh toán...
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Hệ thống sẽ tự động xác nhận khi nhận được chuyển khoản.
              <br />Mã đơn: <strong>{order?.code}</strong>
            </Typography>
          </Box>
        )}

        {/* Success */}
        {step === 'success' && (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <CheckIcon sx={{ fontSize: 64, color: 'success.main' }} />
            <Typography variant="h6" fontWeight={700} sx={{ mt: 1, color: 'success.main' }}>
              Thanh toán thành công!
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Gói <strong>{PLAN_NAMES[order?.planKey]}</strong> đã được kích hoạt.
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {step === 'transfer' && (
          <Button
            variant="contained"
            fullWidth
            onClick={handleTransferred}
            sx={{ py: 1.2, textTransform: 'none', fontWeight: 600, borderRadius: 1.5 }}
          >
            Tôi đã chuyển khoản
          </Button>
        )}
        {step === 'success' && (
          <Button
            variant="contained"
            color="success"
            fullWidth
            onClick={handleClose}
            sx={{ py: 1.2, textTransform: 'none', fontWeight: 600, borderRadius: 1.5 }}
          >
            Hoàn tất
          </Button>
        )}
        {step === 'error' && (
          <Button
            variant="outlined"
            fullWidth
            onClick={handleClose}
            sx={{ py: 1.2, textTransform: 'none', borderRadius: 1.5 }}
          >
            Đóng
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
