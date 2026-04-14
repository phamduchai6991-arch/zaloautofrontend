import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Checkbox,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  AutoAwesome as AiIcon,
  CalendarMonth as CalendarIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  FlashOn as FlashIcon,
  Image as ImageIcon,
  ListAlt as ListIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Send as SendIcon,
  Settings as SettingsIcon,
  Pause as PauseIcon,
  PlayArrow as PlayArrowIcon,
} from '@mui/icons-material';
import { useAccount } from '../contexts/AccountContext';
import { PLAN_LIMITS, useSubscription, canUsePlanFeature, getRequiredPlanLabel } from '../contexts/SubscriptionContext';
import {
  executeMessageJobs,
  runActionBatchViaExtension,
} from '../utils/extensionBridge';
import {
  sendFriendRequestRequest,
} from '../utils/zaloRequestBuilder';
import { normalizeFriendRow } from '../utils/zaloDataTransforms';

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';
import {
  buildActionRecords,
  buildInviteRecords,
  buildMessageRecords,
} from '../features/campaigns/jobBuilders';
import {
  getTabActionKeys,
  getUnsupportedActionLabels,
  SUPPORTED_REMOTE_ACTION_KEYS,
  CONTROL_DEFINITIONS,
} from '../utils/reachActionConfig';
import { hideContactsForAccount } from '../utils/reachVisibilityStore';

const QUICK_TEMPLATES = [
  'Chào bạn, mình kết nối để trao đổi công việc nếu bạn thuận tiện nhé.',
  'Xin chào, mình gửi lời chào và rất mong được kết nối với bạn trên Zalo.',
  'Chào bạn, mình đang có một số thông tin phù hợp và muốn gửi bạn tham khảo.',
];

function buildRewriteOptions(text) {
  if (!text.trim()) return [];
  const compact = text.replace(/\s+/g, ' ').trim();
  return [
    `${compact}`,
    `Chào bạn, ${compact.charAt(0).toLowerCase()}${compact.slice(1)}`,
    `${compact}. Nếu phù hợp, mình rất mong được phản hồi từ bạn.`,
  ];
}

function buildRotationFallback(text) {
  if (!text.trim()) return [];
  const compact = text.replace(/\s+/g, ' ').trim();
  return [
    compact,
    `Chào bạn, ${compact.charAt(0).toLowerCase()}${compact.slice(1)}`,
    `Xin chào! ${compact}`,
    `Hi, ${compact.charAt(0).toLowerCase()}${compact.slice(1)}. Rất vui được kết nối!`,
    `${compact}. Mong được kết bạn nhé!`,
  ];
}

async function fetchAiRewrite(text, target) {
  const base = import.meta.env.VITE_BACKEND_URL || '';
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/ai/rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.options) ? data.options.filter((o) => typeof o === 'string' && o.trim()) : null;
  } catch (_) {
    return null;
  }
}

function isGenericAccountName(value) {
  const text = String(value || '').trim().toLowerCase();
  return !text || text === 'tài khoản zalo';
}

function buildInviteTargets(selectedItems, activeTab, activeAccount, isDrilledIntoMembers) {
  if (!Array.isArray(selectedItems) || selectedItems.length === 0) return [];

  if (isDrilledIntoMembers || (activeTab !== 1 && activeTab !== 2)) {
    return selectedItems.map((item) => ({
      key: item.key || item.zid,
      name: item.name,
      avatar: item.avatar,
      phone: item.phone,
      zid: item.zid || item.classification || '—',
      sourceTab: item.sourceTab || item.sourceGroupName,
    }));
  }

  const existingFriendIds = new Set(
    (Array.isArray(activeAccount?.friends) ? activeAccount.friends : [])
      .map((friend) => String(friend?.userId || friend?.username || friend?.globalId || '').trim())
      .filter(Boolean),
  );
  const selfId = String(activeAccount?.userId || '').trim();
  const dedupedTargets = new Map();

  selectedItems.forEach((groupItem) => {
    const memberIds = Array.isArray(groupItem?.source?.memberIds) ? groupItem.source.memberIds : [];
    memberIds.forEach((memberId) => {
      const zid = String(memberId || '').trim();
      if (!zid || zid === selfId || existingFriendIds.has(zid) || dedupedTargets.has(zid)) return;

      dedupedTargets.set(zid, {
        key: `${groupItem.key || groupItem.zid}_${zid}`,
        name: `Thành viên ${groupItem.name || 'nhóm'}`,
        avatar: '',
        phone: '—',
        zid,
        sourceTab: groupItem.name || 'Nhóm',
      });
    });
  });

  return Array.from(dedupedTargets.values());
}

async function resolveInviteTargets({ selectedItems, activeTab, activeAccount, isDrilledIntoMembers }) {
  const targets = buildInviteTargets(selectedItems, activeTab, activeAccount, isDrilledIntoMembers);

  if (isDrilledIntoMembers || (activeTab !== 1 && activeTab !== 2)) {
    return {
      targets,
      totals: {
        totalMembers: targets.length,
        friendCount: 0,
        incomingRequestCount: 0,
        outgoingRequestCount: 0,
        inviteableCount: targets.length,
      },
      summaries: [],
    };
  }

  const existingFriendIds = new Set(
    (Array.isArray(activeAccount?.friends) ? activeAccount.friends : [])
      .map((friend) => String(friend?.userId || friend?.username || friend?.globalId || '').trim())
      .filter(Boolean),
  );
  const selfId = String(activeAccount?.userId || '').trim();
  const uniqueMemberIds = new Set();
  let friendCount = 0;

  selectedItems.forEach((groupItem) => {
    const memberIds = Array.isArray(groupItem?.source?.memberIds) ? groupItem.source.memberIds : [];
    memberIds.forEach((memberId) => {
      const zid = String(memberId || '').trim();
      if (!zid || zid === selfId || uniqueMemberIds.has(zid)) return;
      uniqueMemberIds.add(zid);
      if (existingFriendIds.has(zid)) {
        friendCount += 1;
      }
    });
  });

  return {
    targets,
    totals: {
      totalMembers: uniqueMemberIds.size,
      friendCount,
      incomingRequestCount: 0,
      outgoingRequestCount: 0,
      inviteableCount: targets.length,
    },
    summaries: [],
  };
}

function getAccountPrimaryLabel(account, index) {
  if (!account) return 'Chưa chọn tài khoản';
  if (!isGenericAccountName(account.name)) return account.name;
  if (account.phone) return account.phone;
  if (account.userId) return `ZID ${account.userId}`;
  return `Tài khoản ${Number(index) + 1}`;
}

function getAccountSecondaryLabel(account) {
  if (!account) return '';
  const parts = [];
  if (account.phone && !isGenericAccountName(account.name)) parts.push(account.phone);
  if (account.userId) parts.push(`ZID ${account.userId}`);
  else if (account.UIN) parts.push(`UIN ${account.UIN}`);
  return parts.join(' | ');
}

function isExtensionInvalidationError(value) {
  return /extension context invalidated|tai lai trang sau khi reload extension/i.test(String(value || ''));
}

function mergeActionResultsIntoJobs(jobs, results, providerLabel) {
  const resultMap = new Map(
    (Array.isArray(results) ? results : []).map((item) => [item.jobId, item]),
  );

  return jobs.map((job) => {
    const result = resultMap.get(job.id);
    if (!result) {
      return {
        ...job,
        provider: providerLabel,
        status: 'failed',
        statusLabel: 'Không có phản hồi',
        error: 'Không nhận được phản hồi trạng thái cho thao tác đã chọn.',
      };
    }

    return {
      ...job,
      provider: result.provider || providerLabel,
      status: result.status || (result.ok ? 'completed' : 'failed'),
      statusLabel: result.statusLabel || (result.ok ? 'Đã hoàn thành' : 'Thất bại'),
      error: result.error || '',
      startedAt: result.startedAt || job.startedAt || new Date().toISOString(),
      sentAt: result.sentAt || job.sentAt || null,
      failedAt: result.failedAt || job.failedAt || null,
      apiResult: result.apiResult || null,
    };
  });
}

function buildActionFailureMessage(jobs, fallbackMessage) {
  const failedJobs = (Array.isArray(jobs) ? jobs : []).filter((job) => job.status === 'failed');
  if (!failedJobs.length) return fallbackMessage;

  const firstFailedJob = failedJobs[0];
  const detail = String(firstFailedJob?.error || '').trim();
  const label = String(firstFailedJob?.actionLabel || firstFailedJob?.statusLabel || 'Thao tác').trim();

  if (detail) {
    return `${label} thất bại: ${detail}`;
  }

  return fallbackMessage;
}

function mergeServiceResultsIntoJobs(jobs, results, providerLabel) {
  const resultMap = new Map(
    (Array.isArray(results) ? results : []).map((item) => [item.jobId, item]),
  );

  return jobs.map((job) => {
    const result = resultMap.get(job.id);
    if (!result) {
      return {
        ...job,
        provider: providerLabel,
        status: 'failed',
        statusLabel: 'Không có phản hồi',
        error: 'Không nhận được phản hồi trạng thái từ extension.',
      };
    }

    return {
      ...job,
      provider: result.provider || providerLabel,
      status: result.status || (result.ok ? 'sent' : 'failed'),
      statusLabel: result.statusLabel || (result.ok ? 'Đã gửi' : 'Gửi thất bại'),
      error: result.error || '',
      startedAt: result.startedAt || job.startedAt || new Date().toISOString(),
      sentAt: result.sentAt || job.sentAt || null,
      failedAt: result.failedAt || job.failedAt || null,
      apiResult: result.apiResult || null,
    };
  });
}

function applyOptimisticActionResults(account, jobs) {
  if (!account) return null;

  const successfulJobs = (Array.isArray(jobs) ? jobs : []).filter((job) => job.status !== 'failed');
  if (!successfulJobs.length) return null;

  const removedFriendIds = new Set(
    successfulJobs
      .filter((job) => job.actionType === 'remove_friend')
      .map((job) => String(job.zid || '').trim())
      .filter(Boolean),
  );
  const leftGroupIds = new Set(
    successfulJobs
      .filter((job) => job.actionType === 'leave_group')
      .map((job) => String(job.zid || '').trim())
      .filter(Boolean),
  );
  const undoneRequestIds = new Set(
    successfulJobs
      .filter((job) => job.actionType === 'undo_friend_request')
      .map((job) => String(job.zid || '').trim())
      .filter(Boolean),
  );
  const acceptedRequestJobs = successfulJobs.filter((job) => job.actionType === 'accept_friend_request');
  const acceptedRequestIds = new Set(
    acceptedRequestJobs
      .map((job) => String(job.zid || '').trim())
      .filter(Boolean),
  );
  const rejectedRequestIds = new Set(
    successfulJobs
      .filter((job) => job.actionType === 'reject_friend_request')
      .map((job) => String(job.zid || '').trim())
      .filter(Boolean),
  );
  const joinedGroupJobs = successfulJobs.filter((job) => (
    job.actionType === 'join_group' && (job.status === 'completed' || job.status === 'skipped')
  ));

  const nextFriends = Array.isArray(account.friends) ? account.friends.filter((friend) => {
    const friendId = String(friend?.userId || friend?.username || friend?.globalId || '').trim();
    return !removedFriendIds.has(friendId);
  }) : [];

  acceptedRequestJobs.forEach((job) => {
    if (nextFriends.some((friend) => String(friend?.userId || friend?.username || friend?.globalId || '').trim() === String(job.zid || '').trim())) {
      return;
    }
    nextFriends.unshift({
      userId: job.zid,
      displayName: job.name,
      avatar: job.avatar,
      phoneNumber: job.phone && job.phone !== '—' ? job.phone : '',
    });
  });

  const nextGroups = Array.isArray(account.groups) ? account.groups.filter((group) => {
    const groupId = String(group?.userId || group?.globalId || '').trim().replace(/^g/i, '');
    return !leftGroupIds.has(groupId);
  }) : [];

  joinedGroupJobs.forEach((job) => {
    const normalizedGroupId = String(job.zid || '').trim().replace(/^g/i, '');
    if (!normalizedGroupId) return;
    if (nextGroups.some((group) => String(group?.userId || group?.globalId || '').trim().replace(/^g/i, '') === normalizedGroupId)) {
      return;
    }
    nextGroups.unshift({
      userId: normalizedGroupId,
      displayName: job.name,
      avatar: job.avatar,
      totalMember: Number.parseInt(String(job.phone || '').replace(/\D+/g, ''), 10) || 0,
      desc: job.classification || '',
    });
  });

  const nextSentRequests = Array.isArray(account.sentFriendRequests) ? account.sentFriendRequests.filter((request) => {
    const requestId = String(request?.userId || request?.zid || '').trim();
    return !undoneRequestIds.has(requestId);
  }) : [];

  const nextReceivedRequests = Array.isArray(account.receivedFriendRequests) ? account.receivedFriendRequests.filter((request) => {
    const requestId = String(request?.userId || request?.zid || '').trim();
    return !acceptedRequestIds.has(requestId) && !rejectedRequestIds.has(requestId);
  }) : [];

  return {
    friends: nextFriends,
    groups: nextGroups,
    sentFriendRequests: nextSentRequests,
    receivedFriendRequests: nextReceivedRequests,
    serviceSyncedAt: new Date().toISOString(),
  };
}

function parseDelayWindowMs(delayWindow) {
  const match = String(delayWindow || '').match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return 0;
  const from = Number(match[1]);
  const to = Number(match[2]);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  const min = Math.min(from, to);
  const max = Math.max(from, to);
  return (min + Math.floor(Math.random() * (max - min + 1))) * 1000;
}

function hideProcessedContactRows(account, jobs, enabled) {
  if (!enabled || !account?.id) return;
  const ids = (Array.isArray(jobs) ? jobs : [])
    .filter((job) => job.status !== 'failed')
    .map((job) => String(job.zid || '').trim())
    .filter(Boolean);
  if (!ids.length) return;
  hideContactsForAccount(account.id, ids);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readNdjsonStream(response, onLine, onDone, waitIfPausedFn) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    if (waitIfPausedFn) await waitIfPausedFn();
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data._done) { onDone?.(data); }
        else { onLine(data); }
      } catch (_) { /* skip malformed line */ }
    }
  }
  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer);
      if (data._done) onDone?.(data);
      else onLine(data);
    } catch (_) { /* skip */ }
  }
}

function mergeInviteResultsIntoJobs(jobs, results, providerLabel) {
  const resultMap = new Map(
    (Array.isArray(results) ? results : []).map((item) => [item.jobId, item]),
  );

  return jobs.map((job) => {
    const result = resultMap.get(job.id);
    if (!result) {
      return {
        ...job,
        provider: providerLabel,
        status: 'failed',
        statusLabel: 'Không có phản hồi',
        error: 'Không nhận được phản hồi trạng thái cho lời mời kết bạn.',
      };
    }

    return {
      ...job,
      provider: result.provider || providerLabel,
      status: result.status || (result.ok ? 'sent' : 'failed'),
      statusLabel: result.statusLabel || (result.ok ? 'Đã gửi lời mời' : 'Kết bạn thất bại'),
      error: result.error || '',
      startedAt: result.startedAt || job.startedAt || new Date().toISOString(),
      sentAt: result.sentAt || job.sentAt || null,
      failedAt: result.failedAt || job.failedAt || null,
      apiResult: result.apiResult || null,
    };
  });
}

async function runInviteJobsViaExtension(account, jobs) {
  const results = [];

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const startedAt = new Date().toISOString();

    try {
      const apiResult = await sendFriendRequestRequest(account, job);
      results.push({
        jobId: job.id,
        ok: true,
        status: 'sent',
        statusLabel: 'Đã gửi lời mời',
        provider: 'extension',
        apiResult,
        startedAt,
        sentAt: new Date().toISOString(),
      });
    } catch (error) {
      results.push({
        jobId: job.id,
        ok: false,
        status: 'failed',
        statusLabel: 'Kết bạn thất bại',
        provider: 'extension',
        error: error.message,
        startedAt,
        failedAt: new Date().toISOString(),
      });
    }

    if (index < jobs.length - 1) {
      const waitMs = parseDelayWindowMs(job.delayWindow);
      if (waitMs > 0) {
        await delay(waitMs);
      }
    }
  }

  return { results };
}

export default function LeftColumn({ selection, actionState, campaignState, onCampaignCommit }) {
  const [ketBanEnabled, setKetBanEnabled] = useState(false);
  const [nhanTinEnabled, setNhanTinEnabled] = useState(false);
  const [friendRequest, setFriendRequest] = useState('');
  const [message, setMessage] = useState('');
  const [delayFrom, setDelayFrom] = useState('60');
  const [delayTo, setDelayTo] = useState('60');
  const [antiSpam, setAntiSpam] = useState(true);
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [rotationBatchSize, setRotationBatchSize] = useState('100');
  const [messageTemplates, setMessageTemplates] = useState([]);
  const [rotateMessageEvery, setRotateMessageEvery] = useState('100');
  const [autoAiContent, setAutoAiContent] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [autoAiMessage, setAutoAiMessage] = useState(false);
  const [aiMsgGenerating, setAiMsgGenerating] = useState(false);
  const [msgTemplates, setMsgTemplates] = useState([]);
  const [rotateMsgEvery, setRotateMsgEvery] = useState('100');
  const [showExtDialog, setShowExtDialog] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const pauseResolveRef = useRef(null);

  const waitIfPaused = useCallback(() => {
    if (!pausedRef.current) return Promise.resolve();
    return new Promise((resolve) => { pauseResolveRef.current = resolve; });
  }, []);

  const handlePauseToggle = useCallback(() => {
    if (pausedRef.current) {
      // Resume
      pausedRef.current = false;
      setPaused(false);
      if (pauseResolveRef.current) {
        pauseResolveRef.current();
        pauseResolveRef.current = null;
      }
    } else {
      // Pause
      pausedRef.current = true;
      setPaused(true);
    }
  }, []);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [rewriteDialog, setRewriteDialog] = useState({ open: false, target: 'message', options: [] });
  const [settingsMenuAnchor, setSettingsMenuAnchor] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [pullGroupFriendIds, setPullGroupFriendIds] = useState([]);
  const [pullGroupSearchQuery, setPullGroupSearchQuery] = useState('');
  const [feedback, setFeedback] = useState(null);

  const {
    activeAccount,
    activeAccountReady,
    activeAccountIndex,
    extensionActive,
    extensionChecked,
    extensionStatus,
    accounts,
    cancelPendingSync,
    confirmPendingSync,
    syncing,
    syncState,
    waitingForLogin,
    addAccount,
    refreshAccount,
    refreshActiveAccountFromService,
    refreshAccountViaBackend,
    stopPolling,
    updateAccountById,
    setActiveAccountIndex,
    serverAccountCount,
    refreshServerAccountCount,
    removeAccount,
    zaloSessionStatus,
    recheckZaloSession,
  } = useAccount();

  const { maxAccounts, isActive, isExpired, planKey, refetch: refetchSubscription } = useSubscription();

  const selectedItems = selection?.selectedItems || [];
  const selectedCount = selectedItems.length;
  const selectedLabel = selection?.activeLabel || 'Bạn bè';
  const activeViewState = selection?.viewState && typeof selection.viewState === 'object'
    ? selection.viewState
    : {};
  const hasAccount = accounts.length > 0;
  const activeTabActionKeys = getTabActionKeys(selection?.activeTab);
  const enabledTabActionKeys = activeTabActionKeys.filter((key) => Boolean(actionState?.[key]));
  const enabledLocalViewLabels = Object.entries(activeViewState)
    .filter(([key, value]) => Boolean(value) && CONTROL_DEFINITIONS[key]?.kind === 'local')
    .map(([key]) => CONTROL_DEFINITIONS[key]?.label)
    .filter(Boolean);
  const unsupportedActionLabels = getUnsupportedActionLabels(selection?.activeTab, actionState);
  const hasSupportedActionSelected = enabledTabActionKeys.some((key) => SUPPORTED_REMOTE_ACTION_KEYS.has(key));
  const removeFriendEnabled = selection?.activeTab === 0 && Boolean(actionState?.removeFriend);
  const muteNotificationsEnabled = (selection?.activeTab === 0 || selection?.activeTab === 1) && Boolean(actionState?.muteNotifications);
  const unmuteNotificationsEnabled = (selection?.activeTab === 0 || selection?.activeTab === 1) && Boolean(actionState?.unmuteNotifications);
  const leaveGroupEnabled = selection?.activeTab === 1 && Boolean(actionState?.leaveGroup);
  const pullGroupEnabled = selection?.activeTab === 1 && Boolean(actionState?.pullGroup);
  const joinGroupEnabled = selection?.activeTab === 2 && Boolean(actionState?.joinGroup);
  const undoFriendRequestEnabled = selection?.activeTab === 4 && Boolean(actionState?.undoFriendRequest);
  const rejectFriendRequestEnabled = selection?.activeTab === 5 && Boolean(actionState?.rejectFriendRequest);
  const acceptFriendRequestEnabled = selection?.activeTab === 5 && Boolean(actionState?.acceptFriendRequest);
  const deletePhoneAfterActionEnabled = selection?.activeTab === 3 && Boolean(actionState?.deletePhoneAfterAction);
  const canInviteFromCurrentTab = selection?.activeTab >= 0 && selection?.activeTab <= 3;
  const canMessageFromCurrentTab = selection?.activeTab >= 0 && selection?.activeTab <= 3;
  const canRemoveFriendFromCurrentTab = selection?.activeTab === 0 || selection?.activeTab === 3;
  const canPullGroupFromCurrentTab = selection?.activeTab === 1;
  const canNotificationFromCurrentTab = selection?.activeTab >= 0 && selection?.activeTab <= 3;
  const activeAccountPrimary = getAccountPrimaryLabel(activeAccount, activeAccountIndex);
  const activeAccountSecondary = getAccountSecondaryLabel(activeAccount);
  const extensionStatusReason = extensionActive
    ? 'Đã kết nối, web đang chạy ở chế độ extension-only'
    : extensionStatus?.reason || 'Chưa kết nối, hãy kiểm tra extension.';
  const extensionStatusHints = Array.isArray(extensionStatus?.hints) ? extensionStatus.hints : [];
  const syncStatusLabel = activeAccountReady
    ? (zaloSessionStatus === 'checking'
      ? 'Đang kiểm tra phiên...'
      : zaloSessionStatus === 'expired'
        ? 'Phiên Zalo hết hạn'
        : zaloSessionStatus === 'valid'
          ? 'Sẵn sàng'
          : 'Sẵn sàng')
    : syncState.phase === 'awaiting_sync_confirmation'
      ? 'Chờ xác nhận đồng bộ'
      : syncState.phase === 'waiting_for_login'
        ? 'Đang chờ đăng nhập'
        : syncState.phase === 'syncing_account'
          ? 'Đang đồng bộ'
          : 'Chưa sẵn sàng';
  const syncStatusColor = activeAccountReady
    ? (zaloSessionStatus === 'expired'
      ? 'error'
      : zaloSessionStatus === 'checking'
        ? 'info'
        : 'success')
    : syncState.phase === 'awaiting_sync_confirmation'
      ? 'warning'
      : syncState.phase === 'waiting_for_login' || syncState.phase === 'syncing_account'
        ? 'info'
        : 'default';
  const availablePullGroupFriends = useMemo(() => (
    (Array.isArray(activeAccount?.friends) ? activeAccount.friends : []).map(normalizeFriendRow)
  ), [activeAccount?.friends]);
  const filteredPullGroupFriends = useMemo(() => {
    const query = String(pullGroupSearchQuery || '').trim().toLowerCase();
    if (!query) return availablePullGroupFriends;
    return availablePullGroupFriends.filter((friend) => (
      String(friend.name || '').toLowerCase().includes(query)
      || String(friend.phone || '').toLowerCase().includes(query)
      || String(friend.zid || '').toLowerCase().includes(query)
      || String(friend.classification || '').toLowerCase().includes(query)
    ));
  }, [availablePullGroupFriends, pullGroupSearchQuery]);
  const selectedPullGroupFriends = useMemo(() => (
    availablePullGroupFriends.filter((friend) => pullGroupFriendIds.includes(String(friend.zid || '')))
  ), [availablePullGroupFriends, pullGroupFriendIds]);
  const selectedGroupRowForPull = selection?.activeTab === 1 && selectedItems.length === 1 ? selectedItems[0] : null;
  const isPullGroupMode = pullGroupEnabled && selection?.activeTab === 1 && !selection?.isDrilledIntoMembers;
  const visiblePullGroupFriendIds = filteredPullGroupFriends.map((friend) => String(friend.zid || '')).filter(Boolean);
  const allPullGroupVisibleSelected = visiblePullGroupFriendIds.length > 0 && visiblePullGroupFriendIds.every((id) => pullGroupFriendIds.includes(id));

  useEffect(() => {
    const validIds = new Set(availablePullGroupFriends.map((friend) => String(friend.zid || '')));
    setPullGroupFriendIds((prev) => prev.filter((id) => validIds.has(String(id || ''))));
  }, [availablePullGroupFriends]);

  useEffect(() => {
    if (!isPullGroupMode) {
      setPullGroupSearchQuery('');
    }
  }, [isPullGroupMode]);

  // Turn off Kết bạn / Nhắn tin when switching to tabs that don't support them
  useEffect(() => {
    if (!canInviteFromCurrentTab) setKetBanEnabled(false);
    if (!canMessageFromCurrentTab) setNhanTinEnabled(false);
  }, [canInviteFromCurrentTab, canMessageFromCurrentTab]);

  const togglePullGroupFriend = (friendId) => {
    const normalizedId = String(friendId || '');
    if (!normalizedId) return;
    setPullGroupFriendIds((prev) => (
      prev.includes(normalizedId)
        ? prev.filter((id) => id !== normalizedId)
        : [...prev, normalizedId]
    ));
  };

  const toggleAllPullGroupFriends = (checked) => {
    if (!checked) {
      setPullGroupFriendIds((prev) => prev.filter((id) => !visiblePullGroupFriendIds.includes(id)));
      return;
    }

    setPullGroupFriendIds((prev) => Array.from(new Set([...prev, ...visiblePullGroupFriendIds])));
  };

  const recentActivities = useMemo(() => {
    const actionJobs = (campaignState?.actionJobs || []).map((item) => ({
      ...item,
      activityType: 'action',
      timestamp: item.createdAt || item.scheduledAt,
    }));
    const inviteJobs = (campaignState?.inviteJobs || []).map((item) => ({
      ...item,
      activityType: 'invite',
      timestamp: item.createdAt || item.scheduledAt,
    }));
    const messageJobs = (campaignState?.messageJobs || []).map((item) => ({
      ...item,
      activityType: 'message',
      timestamp: item.createdAt || item.scheduledAt,
    }));
    const scheduledJobs = (campaignState?.scheduledJobs || []).map((item) => ({
      ...item,
      activityType: 'scheduled',
      timestamp: item.scheduledAt || item.createdAt,
    }));

    return [...actionJobs, ...inviteJobs, ...messageJobs, ...scheduledJobs]
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, 6);
  }, [campaignState]);

  useEffect(() => {
    if (!syncState?.error) return;
    if (syncState.phase !== 'failed' && syncState.phase !== 'cancelled') return;
    setFeedback({
      severity: syncState.phase === 'failed' ? 'error' : 'info',
      message: syncState.error,
    });
  }, [syncState.error, syncState.phase]);

  useEffect(() => {
    if (!extensionActive) return;
    if (!isExtensionInvalidationError(feedback?.message)) return;
    setFeedback(null);
  }, [extensionActive, feedback]);

  const handleAddAccount = async () => {
    if (!extensionChecked) return;
    if (syncing) return;
    if (!extensionActive) {
      setShowExtDialog(true);
      return;
    }

    const latestSubscription = await refetchSubscription();
    const effectivePlanKey = latestSubscription?.status === 'active' ? latestSubscription.planKey : 'free';
    const effectiveMaxAccounts = PLAN_LIMITS[effectivePlanKey] ?? PLAN_LIMITS.free;
    const currentServerAccountCount = await refreshServerAccountCount();

    if (accounts.length >= effectiveMaxAccounts || currentServerAccountCount >= effectiveMaxAccounts) {
      const needUpgrade = !latestSubscription?.status || latestSubscription?.status !== 'active';
      setFeedback({
        severity: 'warning',
        message: needUpgrade
          ? `Bạn cần đăng ký gói để thêm tài khoản Zalo. Hãy mua gói Basic, Plus hoặc Pro.`
          : `Gói ${effectivePlanKey?.toUpperCase()} chỉ cho phép tối đa ${effectiveMaxAccounts} tài khoản Zalo. Bạn đã đăng ký ${currentServerAccountCount}/${effectiveMaxAccounts} trên hệ thống. Hãy nâng cấp gói để thêm nhiều hơn.`,
      });
      return;
    }

    const result = await addAccount();
    if (!result.success && result.error === 'extension_not_found') {
      setShowExtDialog(true);
    }
  };

  const handleFileChange = (event) => {
    setSelectedFiles(Array.from(event.target.files || []));
  };

  const handleRefreshAccount = async () => {
    if (!hasAccount || syncing) return;

    try {
      setFeedback({ severity: 'info', message: 'Đang đồng bộ tài khoản qua server...' });
      const backendPatch = await refreshAccountViaBackend();
      if (backendPatch) {
        const friendCount = backendPatch.friends?.length || 0;
        const groupCount = backendPatch.groups?.length || 0;
        setFeedback({
          severity: 'success',
          message: `Đã cập nhật tài khoản: ${friendCount} bạn bè, ${groupCount} nhóm.`,
        });
        return;
      }
      setFeedback({
        severity: 'warning',
        message: 'Không thể đồng bộ — tài khoản chưa có session (cookie/IMEI). Hãy xóa và thêm lại tài khoản.',
      });
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: `Đồng bộ thất bại: ${error?.message || 'Lỗi không xác định'}`,
      });
    }
  };

  const handleConfirmPendingSync = async () => {
    const result = await confirmPendingSync();
    if (!result?.ok) {
      setFeedback({ severity: 'error', message: result?.error || 'Không xác nhận được đồng bộ tài khoản.' });
    }
  };

  const handleCancelPendingSync = async () => {
    const result = await cancelPendingSync('Người dùng đã hủy đồng bộ tài khoản.');
    if (!result?.ok) {
      setFeedback({ severity: 'error', message: result?.error || 'Không hủy được đồng bộ tài khoản.' });
    }
  };

  const openRewriteDialog = async (target) => {
    if (!canUsePlanFeature('ai_rewrite', planKey)) {
      setFeedback({ severity: 'warning', message: `Viết lại bằng AI yêu cầu gói ${getRequiredPlanLabel('ai_rewrite')} trở lên. Vui lòng nâng cấp để sử dụng.` });
      return;
    }
    const sourceText = target === 'friend' ? friendRequest : target === 'rotation' ? (friendRequest || 'Chào bạn, mình muốn kết bạn!') : target === 'message_rotation' ? (message || 'Chào bạn, mình có thông tin muốn chia sẻ!') : message;
    if (!sourceText.trim()) {
      setFeedback({ severity: 'warning', message: 'Cần nhập nội dung trước khi viết lại.' });
      return;
    }
    // Show dialog immediately with loading state
    setRewriteDialog({ open: true, target, options: [], loading: true });
    const aiOptions = await fetchAiRewrite(sourceText, target);
    if (aiOptions && aiOptions.length > 0) {
      setRewriteDialog({ open: true, target, options: aiOptions, loading: false });
    } else {
      // Fallback to static options if AI unavailable
      const fallback = (target === 'rotation' || target === 'message_rotation') ? buildRotationFallback(sourceText) : buildRewriteOptions(sourceText);
      setRewriteDialog({ open: true, target, options: fallback, loading: false });
    }
  };

  const applyRewriteOption = (value) => {
    if (rewriteDialog.target === 'friend') {
      setFriendRequest(value.slice(0, 150));
    } else if (rewriteDialog.target === 'rotation') {
      if (value === '__all__') {
        // Apply all options as message templates
        const allOptions = rewriteDialog.options.filter((o) => typeof o === 'string' && o.trim());
        setMessageTemplates(allOptions);
        setFeedback({ severity: 'success', message: `Đã tạo ${allOptions.length} mẫu tin nhắn luân phiên.` });
      } else {
        // Add single option to templates
        setMessageTemplates((prev) => [...prev, value]);
        setFeedback({ severity: 'success', message: 'Đã thêm 1 mẫu tin nhắn.' });
      }
    } else if (rewriteDialog.target === 'message_rotation') {
      if (value === '__all__') {
        const allOptions = rewriteDialog.options.filter((o) => typeof o === 'string' && o.trim());
        setMsgTemplates(allOptions);
        setFeedback({ severity: 'success', message: `Đã tạo ${allOptions.length} mẫu tin nhắn luân phiên.` });
      } else {
        setMsgTemplates((prev) => [...prev, value]);
        setFeedback({ severity: 'success', message: 'Đã thêm 1 mẫu tin nhắn.' });
      }
    } else {
      setMessage(value);
    }
    setRewriteDialog({ open: false, target: 'message', options: [] });
  };

  // Auto AI content generation
  const generateAiContent = useCallback(async () => {
    if (!canUsePlanFeature('ai_rewrite', planKey)) return;
    setAiGenerating(true);
    try {
      // Generate friend request content
      const seedText = friendRequest.trim() || 'Chào bạn, mình muốn kết bạn nhé!';
      const friendOptions = await fetchAiRewrite(seedText, 'friend');
      if (friendOptions && friendOptions.length > 0) {
        setFriendRequest(friendOptions[0].slice(0, 150));
      }
      // Always generate rotation templates for varied content (chống spam)
      const rotationOptions = await fetchAiRewrite(seedText, 'rotation');
      if (rotationOptions && rotationOptions.length > 0) {
        setMessageTemplates(rotationOptions);
      } else {
        setMessageTemplates(buildRotationFallback(seedText));
      }
      setFeedback({ severity: 'success', message: 'AI đã tự động tạo nội dung kết bạn và mẫu luân phiên.' });
    } catch (_) {
      setFeedback({ severity: 'error', message: 'Không thể tạo nội dung bằng AI.' });
    } finally {
      setAiGenerating(false);
    }
  }, [friendRequest, planKey]);

  // Auto-trigger when toggle is turned on
  useEffect(() => {
    if (autoAiContent && !aiGenerating) {
      generateAiContent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAiContent]);

  // Auto AI message content generation
  const generateAiMessage = useCallback(async () => {
    if (!canUsePlanFeature('ai_rewrite', planKey)) return;
    setAiMsgGenerating(true);
    try {
      const seedText = message.trim() || 'Chào bạn, mình có thông tin muốn chia sẻ với bạn.';
      // Generate main message
      const msgOptions = await fetchAiRewrite(seedText, 'message');
      if (msgOptions && msgOptions.length > 0) {
        setMessage(msgOptions[0]);
      }
      // Generate varied templates for anti-spam
      const rotOptions = await fetchAiRewrite(seedText, 'message_rotation');
      if (rotOptions && rotOptions.length > 0) {
        setMsgTemplates(rotOptions);
      } else {
        setMsgTemplates([seedText]);
      }
      setFeedback({ severity: 'success', message: 'AI đã tự động tạo nội dung tin nhắn và mẫu luân phiên.' });
    } catch (_) {
      setFeedback({ severity: 'error', message: 'Không thể tạo nội dung tin nhắn bằng AI.' });
    } finally {
      setAiMsgGenerating(false);
    }
  }, [message, planKey]);

  useEffect(() => {
    if (autoAiMessage && !aiMsgGenerating) {
      generateAiMessage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAiMessage]);



  const handleStart = async () => {
    if (running) return;
    setRunning(true);
    setPaused(false);
    pausedRef.current = false;
    try {
    if (!isActive) {
      setFeedback({
        severity: 'warning',
        message: isExpired
          ? 'Gói của bạn đã hết hạn. Vui lòng gia hạn trước khi chạy các thao tác Zalo.'
          : 'Bạn cần đăng ký gói trước khi chạy các thao tác Zalo.',
      });
      return;
    }

    // Per-feature plan gating
    const featureGates = [];
    if (ketBanEnabled) featureGates.push({ key: 'friend_request', label: 'Kết bạn' });
    if (nhanTinEnabled) featureGates.push({ key: 'send_message', label: 'Nhắn tin' });
    if (removeFriendEnabled) featureGates.push({ key: 'remove_friend', label: 'Xóa bạn bè' });
    if (leaveGroupEnabled) featureGates.push({ key: 'leave_group', label: 'Rời nhóm' });
    if (muteNotificationsEnabled) featureGates.push({ key: 'mute_notification', label: 'Tắt thông báo' });
    if (unmuteNotificationsEnabled) featureGates.push({ key: 'unmute_notification', label: 'Bật thông báo' });
    if (pullGroupEnabled) featureGates.push({ key: 'pull_group', label: 'Kéo nhóm' });
    if (joinGroupEnabled) featureGates.push({ key: 'join_group', label: 'Tham gia nhóm' });
    if (undoFriendRequestEnabled) featureGates.push({ key: 'undo_friend_request', label: 'Rút lời mời kết bạn' });
    if (rejectFriendRequestEnabled) featureGates.push({ key: 'reject_friend_request', label: 'Từ chối kết bạn' });
    if (acceptFriendRequestEnabled) featureGates.push({ key: 'accept_friend_request', label: 'Đồng ý kết bạn' });
    const blockedFeatures = featureGates.filter((f) => !canUsePlanFeature(f.key, planKey));
    if (blockedFeatures.length > 0) {
      const labels = blockedFeatures.map((f) => f.label).join(', ');
      const requiredPlan = [...new Set(blockedFeatures.map((f) => getRequiredPlanLabel(f.key)))].join(' / ');
      setFeedback({
        severity: 'warning',
        message: `Thao tác ${labels} yêu cầu gói ${requiredPlan} trở lên. Vui lòng nâng cấp để sử dụng.`,
      });
      return;
    }

    if (!hasAccount) {
      setFeedback({ severity: 'warning', message: 'Bạn cần thêm tài khoản Zalo trước khi chạy.' });
      return;
    }

    if (!activeAccount) {
      setFeedback({ severity: 'warning', message: 'Hãy chọn một tài khoản Zalo hợp lệ trước khi chạy.' });
      return;
    }

    if (!activeAccountReady) {
      setFeedback({
        severity: 'warning',
        message: syncState.phase === 'awaiting_sync_confirmation'
          ? 'Tài khoản đang chờ bạn xác nhận đồng bộ. Hãy xác nhận trước khi chạy.'
          : 'Tài khoản chưa sẵn sàng để chạy. Hãy làm mới và hoàn tất đồng bộ tài khoản Zalo trước.',
      });
      return;
    }

    if (!selectedCount) {
      setFeedback({ severity: 'warning', message: 'Hãy chọn ít nhất một dòng dữ liệu ở cột bên phải.' });
      return;
    }

    if (!ketBanEnabled && !nhanTinEnabled && !hasSupportedActionSelected && enabledLocalViewLabels.length > 0) {
      const availableLabels = activeTabActionKeys.map((key) => CONTROL_DEFINITIONS[key]?.label).filter(Boolean);
      const nextStep = availableLabels.length
        ? ` Muốn chạy thao tác, hãy bật ${availableLabels.join(', ')} ở cột bên phải${canInviteFromCurrentTab ? ', hoặc Kết bạn / Nhắn tin ở cột bên trái' : ''}.`
        : '';
      setFeedback({
        severity: 'info',
        message: `${enabledLocalViewLabels.join(', ')} chỉ là tuỳ chọn hiển thị danh sách và đã áp dụng ngay, không cần bấm Bắt Đầu.${nextStep}`,
      });
      return;
    }

    if (!ketBanEnabled && !nhanTinEnabled && !hasSupportedActionSelected && unsupportedActionLabels.length === 0) {
      const availableLabels = activeTabActionKeys.map((key) => CONTROL_DEFINITIONS[key]?.label).filter(Boolean);
      const hint = availableLabels.length
        ? ` Hãy bật ${availableLabels.join(', ')} ở cột bên phải${canInviteFromCurrentTab ? ', hoặc Kết bạn / Nhắn tin ở cột bên trái' : ''}.`
        : '';
      setFeedback({ severity: 'warning', message: `Hãy bật ít nhất một hành động trước khi chạy.${hint}` });
      return;
    }

    if (!ketBanEnabled && !nhanTinEnabled && !hasSupportedActionSelected && unsupportedActionLabels.length > 0) {
      setFeedback({
        severity: 'warning',
        message: `Các chức năng ${unsupportedActionLabels.join(', ')} hiện chưa được hỗ trợ ở chế độ extension-only.`,
      });
      return;
    }

    if (muteNotificationsEnabled && unmuteNotificationsEnabled) {
      setFeedback({ severity: 'warning', message: 'Chỉ chọn một trong hai thao tác: Bật thông báo hoặc Tắt thông báo.' });
      return;
    }

    if (ketBanEnabled && !canInviteFromCurrentTab) {
      setFeedback({ severity: 'warning', message: 'Kết bạn hiện áp dụng cho tab Bạn bè, Nhóm, Thư viện nhóm hoặc SĐT/ZID.' });
      return;
    }

    if (removeFriendEnabled && !canRemoveFriendFromCurrentTab) {
      setFeedback({ severity: 'warning', message: 'Xóa bạn bè hiện chỉ áp dụng cho tab Bạn bè hoặc SĐT/ZID.' });
      return;
    }

    if (pullGroupEnabled && !canPullGroupFromCurrentTab) {
      setFeedback({ severity: 'warning', message: 'Kéo nhóm hiện chỉ áp dụng ở tab Nhóm.' });
      return;
    }

    if (pullGroupEnabled && selection?.activeTab === 1 && selectedItems.length !== 1) {
      setFeedback({ severity: 'warning', message: 'Ở tab Nhóm, hãy chọn đúng 1 nhóm đích để kéo thành viên vào.' });
      return;
    }

    if (pullGroupEnabled && selection?.activeTab === 1 && selectedPullGroupFriends.length === 0) {
      setFeedback({ severity: 'warning', message: 'Hãy chọn ít nhất 1 bạn bè ở cột trái để mời vào nhóm đã chọn.' });
      return;
    }

    if (nhanTinEnabled && !canMessageFromCurrentTab) {
      setFeedback({ severity: 'warning', message: 'Nhắn tin hiện chỉ áp dụng cho tab Bạn bè, Nhóm, Thư viện nhóm hoặc SĐT/ZID.' });
      return;
    }

    if ((muteNotificationsEnabled || unmuteNotificationsEnabled) && !canNotificationFromCurrentTab) {
      setFeedback({ severity: 'warning', message: 'Bật/Tắt thông báo hiện chỉ áp dụng cho tab Bạn bè, Nhóm, Thư viện nhóm hoặc SĐT/ZID.' });
      return;
    }

    if (nhanTinEnabled && !message.trim() && selectedFiles.length === 0) {
      setFeedback({ severity: 'warning', message: 'Nhắn tin cần có nội dung hoặc ít nhất một tệp đính kèm.' });
      return;
    }

    const now = new Date();
    const scheduledDate = scheduleAt ? new Date(scheduleAt) : null;
    const isScheduled = Boolean(scheduledDate && scheduledDate.getTime() > now.getTime());
    const delayWindow = `${delayFrom}-${delayTo}s`;
    const isDrilledIntoMembers = Boolean(selection?.isDrilledIntoMembers);
    const messageTargetsAreGroups = !isDrilledIntoMembers && (selection?.activeTab === 1 || selection?.activeTab === 2);
    const inviteResolution = ketBanEnabled
      ? await resolveInviteTargets({
          selectedItems,
          activeTab: selection?.activeTab,
          activeAccount,
          isDrilledIntoMembers,
        })
      : { targets: [], totals: null, summaries: [] };
    const inviteTargets = inviteResolution.targets || [];



    if (ketBanEnabled && inviteTargets.length === 0) {
      const summary = inviteResolution?.totals;
      setFeedback({
        severity: 'warning',
        message: messageTargetsAreGroups
          ? summary
            ? `Nhóm đang xét có ${summary.totalMembers} thành viên, ${summary.friendCount} đã là bạn, ${summary.incomingRequestCount} đã gửi lời mời cho bạn, ${summary.outgoingRequestCount} bạn đã gửi lời mời trước đó, ${summary.inviteableCount} người chưa kết bạn.`
            : 'Không tìm thấy thành viên nào trong nhóm cần gửi kết bạn. Có thể tất cả đã là bạn bè hoặc nhóm chưa có dữ liệu thành viên.'
          : 'Không có đối tượng hợp lệ để gửi lời mời kết bạn.',
      });
      return;
    }

    const inviteRecords = ketBanEnabled
      ? buildInviteRecords({
          inviteTargets,
          friendRequest,
          activeAccount,
          activeAccountIndex,
          accountLabel: activeAccountPrimary,
          delayWindow,
          antiSpam,
          selectedLabel,
          messageTargetsAreGroups,
          isScheduled,
          scheduledDate,
          now,
        })
      : [];

    const messageRecords = nhanTinEnabled
      ? buildMessageRecords({
          selectedItems,
          message,
          selectedFiles,
          activeAccount,
          activeAccountIndex,
          accountLabel: activeAccountPrimary,
          delayWindow,
          antiSpam,
          selectedLabel,
          messageTargetsAreGroups,
          isScheduled,
          scheduledDate,
          now,
        })
      : [];

    const actionRecords = buildActionRecords({
      selectedItems,
      pullGroupItems: selectedPullGroupFriends,
      removeFriendEnabled,
      muteNotificationsEnabled,
      unmuteNotificationsEnabled,
      leaveGroupEnabled,
      pullGroupEnabled,
      joinGroupEnabled,
      targetGroupId: selectedGroupRowForPull?.zid || selectedGroupRowForPull?.key || '',
      targetGroupName: selectedGroupRowForPull?.name || 'Nhóm đã chọn',
      undoFriendRequestEnabled,
      rejectFriendRequestEnabled,
      acceptFriendRequestEnabled,
      activeAccount,
      activeAccountIndex,
      accountLabel: activeAccountPrimary,
      delayWindow,
      antiSpam,
      selectedLabel,
      messageTargetsAreGroups,
      isScheduled,
      scheduledDate,
      now,
    });

    const scheduledRecords = isScheduled
      ? [...actionRecords, ...inviteRecords, ...messageRecords]
      : [];

    onCampaignCommit?.({
      actionJobs: isScheduled ? [] : actionRecords,
      inviteJobs: isScheduled ? [] : inviteRecords,
      messageJobs: isScheduled ? [] : messageRecords,
      scheduledJobs: scheduledRecords,
    });

    if (isScheduled) {
      setFeedback({
        severity: 'success',
        message: `Đã lên lịch ${actionRecords.length + inviteRecords.length + messageRecords.length} thao tác cho tab ${selectedLabel}.`,
      });
    } else if (messageRecords.length > 0 && inviteRecords.length > 0) {
      setFeedback({
        severity: 'info',
        message: `Đang chuẩn bị chạy ${inviteRecords.length} lời mời kết bạn và ${messageRecords.length} tin nhắn.`,
      });
    } else if (inviteRecords.length > 0 && messageTargetsAreGroups && inviteResolution?.totals) {
      const summary = inviteResolution.totals;
      setFeedback({
        severity: 'info',
        message: `Nhóm đang xét có ${summary.totalMembers} thành viên, ${summary.friendCount} đã là bạn, ${summary.incomingRequestCount} đã gửi lời mời cho bạn, ${summary.outgoingRequestCount} bạn đã gửi lời mời trước đó. Đang gửi ${inviteRecords.length} lời mời kết bạn qua extension...`,
      });
    } else if (actionRecords.length > 0) {
      setFeedback({
        severity: 'info',
        message: `Đang chuẩn bị chạy ${actionRecords.length} thao tác từ cột phải.`,
      });
    } else if (messageRecords.length > 0) {
      setFeedback({
        severity: 'info',
        message: `Đang chuẩn bị gửi ${messageRecords.length} tin nhắn qua tab Zalo thật.`,
      });
    } else {
      setFeedback({
        severity: 'success',
        message: `Đã tạo ${inviteRecords.length} thao tác cho tab ${selectedLabel}.`,
      });
    }

    if (!isScheduled) {
      setScheduleAt('');
    }

    let inviteSummary = null;
    let messageSummary = null;
    let actionSummary = null;

    if (!isScheduled && actionRecords.length > 0) {
      let backendActionOk = false;

      // --- Strategy 1: Backend API (NDJSON streaming) ---
      if (API_BASE) {
        try {
          setFeedback({
            severity: 'info',
            message: `Đang thực thi 0/${actionRecords.length} thao tác quản lý qua server...`,
          });

          const res = await fetch(`${API_BASE}/api/zalo/actions/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              account: activeAccount,
              jobs: actionRecords,
            }),
          });

          if (res.ok && res.body) {
            backendActionOk = true;
            let actionAccepted = 0;
            let actionFailed = 0;

            await readNdjsonStream(res, (data) => {
              const originalJob = actionRecords.find((j) => j.id === data.jobId) || {};
              const mergedJob = { ...originalJob, ...data, provider: 'server' };

              if (data.status === 'running') {
                setFeedback({
                  severity: 'info',
                  message: data.statusLabel || `Đang xử lý ${actionAccepted + actionFailed + 1}/${actionRecords.length}...`,
                });
              } else {
                onCampaignCommit?.({ actionJobs: [mergedJob] });
                if (data.ok) actionAccepted++;
                else actionFailed++;
                setFeedback({
                  severity: data.ok ? 'success' : 'warning',
                  message: data.statusLabel || `Đã xử lý ${actionAccepted + actionFailed}/${actionRecords.length}`,
                });
              }
            }, undefined, waitIfPaused);

            actionSummary = {
              severity: actionFailed > 0 ? 'warning' : 'success',
              message: `Server đã xử lý ${actionAccepted}/${actionRecords.length} thao tác.${actionFailed > 0 ? ` ${actionFailed} thất bại.` : ''}`,
            };
          }
        } catch (_) {
          // Backend unreachable — fall through
        }
      }

      // --- Strategy 2: Extension fallback ---
      if (!backendActionOk) {
        try {
          setFeedback({
            severity: 'info',
            message: `Đang thực thi ${actionRecords.length} thao tác qua extension...`,
          });

          const extResult = await runActionBatchViaExtension({
            account: activeAccount,
            jobs: actionRecords,
          });

          const extData = extResult?.data || extResult || {};
          const extResults = Array.isArray(extData.results) ? extData.results : [];

          if (extResults.length > 0) {
            backendActionOk = true;
            extResults.forEach((data) => {
              const originalJob = actionRecords.find((j) => j.id === data.jobId) || {};
              onCampaignCommit?.({ actionJobs: [{ ...originalJob, ...data, provider: 'extension' }] });
            });

            const extAccepted = extResults.filter((r) => r.ok).length;
            const extFailed = extResults.filter((r) => !r.ok).length;
            actionSummary = {
              severity: extFailed > 0 ? 'warning' : 'success',
              message: `Extension đã xử lý ${extAccepted}/${actionRecords.length} thao tác.${extFailed > 0 ? ` ${extFailed} thất bại.` : ''}`,
            };
          }
        } catch (extError) {
          // Extension also failed
        }
      }

      if (!backendActionOk) {
        onCampaignCommit?.({
          actionJobs: actionRecords.map((job) => ({
            ...job,
            status: 'failed',
            statusLabel: 'Không thể thực thi',
            error: 'Không có backend hoặc extension khả dụng.',
            provider: 'extension',
          })),
        });
        actionSummary = {
          severity: 'warning',
          message: 'Không thể thực thi thao tác: backend và extension đều không khả dụng.',
        };
      }
    }

    // ── Pause checkpoint between actions and invites ──
    await waitIfPaused();

    if (!isScheduled && inviteRecords.length > 0) {
      let resolvedInviteJobs = [];
      let backendInviteOk = false;

      // --- Strategy 1: Backend API (zalo-api-final, NDJSON streaming) ---
      if (API_BASE) {
        try {
          // Use rotation endpoint when enabled and multiple accounts exist
          const useRotation = rotationEnabled && accounts.length > 1;

          setFeedback({
            severity: 'info',
            message: useRotation
              ? `Đang luân phiên gửi ${inviteRecords.length} lời mời qua ${accounts.length} nick...`
              : `Đang gửi ${inviteRecords.length} lời mời kết bạn qua server...`,
          });

          const batchSizeNum = Math.max(1, parseInt(rotationBatchSize, 10) || 100);
          const rotateEveryNum = Math.max(1, parseInt(rotateMessageEvery, 10) || 100);

          const endpoint = useRotation
            ? `${API_BASE}/api/zalo/friends/requests/batch/rotate`
            : `${API_BASE}/api/zalo/friends/requests/batch`;

          const payload = useRotation
            ? {
                accounts,
                jobs: inviteRecords,
                batchSize: batchSizeNum,
                messageTemplates: messageTemplates.length > 0 ? messageTemplates : [],
                rotateMessageEvery: rotateEveryNum,
              }
            : {
                account: activeAccount,
                jobs: inviteRecords,
                messageTemplates: messageTemplates.length > 0 ? messageTemplates : [],
                rotateMessageEvery: rotateEveryNum,
              };

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (res.ok && res.body) {
            backendInviteOk = true;
            await readNdjsonStream(res, (data) => {
              // Skip internal rotation switch events
              if (data._rotationSwitch || data._accountError) {
                if (data._rotationSwitch) {
                  setFeedback({
                    severity: 'info',
                    message: `Chuyển từ ${data.fromAccount} → ${data.toAccount} (còn ${data.remaining} lời mời)`,
                  });
                }
                return;
              }
              const originalJob = inviteRecords.find((j) => j.id === data.jobId) || {};
              const mergedJob = { ...originalJob, ...data };
              onCampaignCommit?.({ inviteJobs: [mergedJob] });
              if (data.status !== 'running') {
                resolvedInviteJobs.push(mergedJob);
              }
            }, undefined, waitIfPaused);
          }
        } catch (_) {
          // Backend unreachable — fall through to extension
        }
      }

      // --- Strategy 2: Extension fallback ---
      if (!backendInviteOk) {
        try {
          setFeedback({
            severity: 'info',
            message: `Đang gửi ${inviteRecords.length} lời mời kết bạn qua extension...`,
          });

          const response = await runInviteJobsViaExtension(activeAccount, inviteRecords);
          resolvedInviteJobs = mergeInviteResultsIntoJobs(
            inviteRecords,
            response?.results,
            'extension',
          );
        } catch (error) {
          onCampaignCommit?.({
            inviteJobs: inviteRecords.map((job) => ({
              ...job,
              status: 'failed',
              statusLabel: 'Không thể gửi lời mời',
              error: error.message,
              provider: 'extension',
            })),
          });

          inviteSummary = {
            severity: 'error',
            message: error.message,
          };
        }
      }

      if (resolvedInviteJobs.length > 0) {
        hideProcessedContactRows(activeAccount, resolvedInviteJobs, deletePhoneAfterActionEnabled);

        onCampaignCommit?.({
          inviteJobs: resolvedInviteJobs,
        });

        const processedCount = resolvedInviteJobs.filter((job) => job.status !== 'failed').length;
        const failedCount = resolvedInviteJobs.length - processedCount;

        if (processedCount > 0 && failedCount === 0) {
          inviteSummary = {
            severity: 'success',
            message: `Đã xử lý ${processedCount}/${resolvedInviteJobs.length} lời mời kết bạn thành công.`,
          };
        } else if (processedCount > 0) {
          inviteSummary = {
            severity: 'warning',
            message: `Xử lý thành công ${processedCount}/${resolvedInviteJobs.length} lời mời. ${failedCount} bị lỗi.`,
          };
        } else if (!inviteSummary) {
          inviteSummary = {
            severity: 'error',
            message: 'Không xử lý được lời mời kết bạn nào.',
          };
        }
      }

      const optimisticSentRequests = resolvedInviteJobs
        .filter((job) => job.status === 'sent')
        .map((job) => ({
          userId: job.zid,
          displayName: job.name,
          avatar: job.avatar,
          message: job.note,
          requestedAt: job.sentAt || new Date().toISOString(),
        }));

      if (optimisticSentRequests.length > 0 && activeAccount?.id) {
        const requestMap = new Map(
          [
            ...optimisticSentRequests,
            ...(Array.isArray(activeAccount?.sentFriendRequests) ? activeAccount.sentFriendRequests : []),
          ].map((item) => [item.userId, item]),
        );

        updateAccountById(activeAccount.id, {
          sentFriendRequests: Array.from(requestMap.values()),
          serviceSyncedAt: new Date().toISOString(),
        });
      }

      if (resolvedInviteJobs.some((job) => job.status !== 'failed')) {
        try {
          await refreshActiveAccountFromService();
        } catch (_) {
          // Keep optimistic invite state if a follow-up extension snapshot is temporarily unavailable.
        }
      }
    }

    // ── Pause checkpoint between invites and messages ──
    await waitIfPaused();

    if (!isScheduled && messageRecords.length > 0) {
      let backendOk = false;

      // --- Strategy 1: Backend API (zalo-api-final, NDJSON streaming) ---
      if (API_BASE) {
        try {
          setFeedback({
            severity: 'info',
            message: `Đang gửi ${messageRecords.length} tin nhắn qua server...`,
          });

          // Convert selected files to base64 for server upload
          let filesPayload = [];
          if (selectedFiles.length > 0) {
            filesPayload = await Promise.all(
              selectedFiles.map((file) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve({ name: file.name, data: reader.result.split(',')[1] });
                reader.onerror = reject;
                reader.readAsDataURL(file);
              }))
            );
          }

          const res = await fetch(`${API_BASE}/api/zalo/messages/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              account: activeAccount,
              jobs: messageRecords,
              ...(filesPayload.length > 0 ? { files: filesPayload } : {}),
              messageTemplates: msgTemplates.length > 0 ? msgTemplates : [],
              rotateMessageEvery: Math.max(1, parseInt(rotateMsgEvery, 10) || 100),
            }),
          });

          if (res.ok && res.body) {
            backendOk = true;
            let accepted = 0;
            let failed = 0;

            await readNdjsonStream(res, (data) => {
              const originalJob = messageRecords.find((j) => j.id === data.jobId) || {};
              onCampaignCommit?.({
                messageJobs: [{ ...originalJob, ...data }],
              });
            }, (summary) => {
              accepted = summary.accepted || 0;
              failed = summary.failed || 0;
            }, waitIfPaused);

            messageSummary = {
              severity: failed > 0 ? 'warning' : 'success',
              message: `Server đã gửi ${accepted}/${messageRecords.length} tin nhắn.${failed > 0 ? ` ${failed} thất bại.` : ''}`,
            };
          } else if (res.status > 0) {
            // Backend reachable but returned error — don't fallback to extension
            backendOk = true;
            let errorMsg = `Server lỗi (${res.status}).`;
            try {
              const errData = await res.json();
              if (errData?.error) errorMsg = errData.error;
              if (errData?.code === 'SERVICE_LOGIN_FAILED') {
                errorMsg = 'Phiên Zalo đã hết hạn. Hãy đồng bộ lại tài khoản rồi thử lại.';
              }
            } catch { /* ignore */ }

            onCampaignCommit?.({
              messageJobs: messageRecords.map((job) => ({
                ...job,
                status: 'failed',
                statusLabel: 'Server lỗi',
                error: errorMsg,
                provider: 'server',
              })),
            });

            messageSummary = {
              severity: 'error',
              message: errorMsg,
            };
          }
        } catch (_) {
          // Backend unreachable — fall through to extension
        }
      }

      // --- Strategy 2: Extension fallback (browser tab automation) ---
      if (!backendOk) {
        try {
          setFeedback({
            severity: 'info',
            message: `Đang gửi ${messageRecords.length} tin nhắn qua extension...`,
          });

          const response = await executeMessageJobs({
            account: activeAccount,
            jobs: messageRecords,
          });

          if (!response?.ok) {
            throw new Error(response?.error || 'Extension không khởi chạy được batch nhắn tin.');
          }

          const acceptedCount = Number(response.accepted || messageRecords.length) || messageRecords.length;
          messageSummary = {
            severity: 'info',
            message: `Extension đã nhận ${acceptedCount}/${messageRecords.length} tin nhắn. Kết quả sẽ cập nhật khi gửi xong.`,
          };
        } catch (error) {
          onCampaignCommit?.({
            messageJobs: messageRecords.map((job) => ({
              ...job,
              status: 'failed',
              statusLabel: 'Không thể gửi tin nhắn',
              error: error.message,
              provider: 'extension',
            })),
          });

          messageSummary = {
            severity: 'error',
            message: error.message,
          };
        }
      }
    }

    const summaries = [actionSummary, inviteSummary, messageSummary].filter(Boolean);
    if (summaries.length > 0) {
      const severityWeight = { info: 1, success: 2, warning: 3, error: 4 };
      const finalSeverity = summaries.reduce((highest, current) => (
        severityWeight[current.severity] > severityWeight[highest] ? current.severity : highest
      ), 'info');

      setFeedback({
        severity: finalSeverity,
        message: summaries.map((item) => item.message).join(' '),
      });
    }
    } finally {
      setRunning(false);
      setPaused(false);
      pausedRef.current = false;
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flex: 1, overflow: 'auto', pb: 1 }}>
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Tài khoản:
          </Typography>
          <IconButton size="small" onClick={handleAddAccount} disabled={syncing}>
            {syncing ? <CircularProgress size={16} /> : <AddIcon fontSize="small" />}
          </IconButton>
          <IconButton size="small" onClick={handleRefreshAccount} disabled={syncing || accounts.length === 0} title="Làm mới dữ liệu">
            <RefreshIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={(e) => setSettingsMenuAnchor(e.currentTarget)} disabled={accounts.length === 0}>
            <SettingsIcon fontSize="small" />
          </IconButton>
          <Menu anchorEl={settingsMenuAnchor} open={Boolean(settingsMenuAnchor)} onClose={() => setSettingsMenuAnchor(null)}>
            <MenuItem onClick={() => { setSettingsMenuAnchor(null); setDeleteConfirmOpen(true); }} disabled={activeAccountIndex < 0}>
              <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Xóa tài khoản đang chọn
            </MenuItem>
          </Menu>
        </Box>

        {accounts.length > 0 && (
          <Select
            size="small"
            value={activeAccountIndex}
            onChange={(event) => setActiveAccountIndex(Number(event.target.value))}
            sx={{ mb: 1, minWidth: 220 }}
            displayEmpty
            renderValue={(value) => {
              const selectedAccount = accounts[Number(value)];
              if (!selectedAccount) return 'Chọn tài khoản';

              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <Avatar src={selectedAccount.avatar} sx={{ width: 24, height: 24 }}>
                    {getAccountPrimaryLabel(selectedAccount, value)?.[0] || 'Z'}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {getAccountPrimaryLabel(selectedAccount, value)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {getAccountSecondaryLabel(selectedAccount) || 'Đã đồng bộ tài khoản'}
                    </Typography>
                  </Box>
                </Box>
              );
            }}
          >
            {accounts.map((acc, idx) => (
              <MenuItem key={idx} value={idx}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <Avatar src={acc.avatar} sx={{ width: 24, height: 24 }}>
                    {getAccountPrimaryLabel(acc, idx)?.[0] || 'Z'}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {getAccountPrimaryLabel(acc, idx)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {getAccountSecondaryLabel(acc) || `Tài khoản #${idx + 1}`}
                    </Typography>
                  </Box>
                </Box>
              </MenuItem>
            ))}
          </Select>
        )}

        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#fff', borderStyle: 'dashed' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
            <Avatar src={activeAccount?.avatar} sx={{ width: 42, height: 42 }}>
              {activeAccountPrimary?.[0] || 'Z'}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={700} noWrap>
                {activeAccountPrimary}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {activeAccountSecondary || 'Đang chờ đồng bộ tên và ảnh đại diện'}
              </Typography>
            </Box>
            <Chip label={syncStatusLabel} size="small" color={syncStatusColor} variant={activeAccountReady ? 'filled' : 'outlined'} />
          </Box>
          <Typography variant="body2" color="text.secondary">
            Đã đăng: {activeAccountPrimary}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {activeAccountSecondary || 'Chưa có thông tin số điện thoại hoặc ZID'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Bạn bè: {activeAccount?.friends?.length || 0} | Nhóm: {activeAccount?.groups?.length || 0}
          </Typography>
          <Typography variant="body2" color={extensionActive ? 'success.main' : 'error.main'}>
            Extension: {extensionStatusReason}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Đang chọn: {selectedCount}/{selection?.allItems?.length || 0} mục từ tab {selectedLabel}
          </Typography>
        </Paper>
      </Box>

      {zaloSessionStatus === 'expired' && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => { recheckZaloSession(); refreshAccount(); }}>
              Đồng bộ lại
            </Button>
          }
        >
          Phiên đăng nhập Zalo đã hết hạn. Hãy đồng bộ lại tài khoản để tiếp tục gửi tin nhắn.
        </Alert>
      )}

      {feedback && (
        <Alert severity={feedback.severity} sx={{ mb: 2 }} onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}

      <Dialog open={showExtDialog} onClose={() => setShowExtDialog(false)} maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Cần cài đặt Extension
          <IconButton size="small" onClick={() => setShowExtDialog(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Bạn cần cài đặt extension "AutoZalo Bridge" để sử dụng tính năng này.
          </Alert>
          {!extensionActive && extensionStatus?.reason ? (
            <Alert severity={extensionStatus?.injected ? 'info' : 'warning'} sx={{ mb: 2 }}>
              {extensionStatus.reason}
            </Alert>
          ) : null}
          <Typography variant="body2" sx={{ mb: 1 }}>
            Extension giúp mở cửa sổ ẩn danh, lấy cookie đúng phiên đăng nhập và đồng bộ dữ liệu Zalo về web app.
          </Typography>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
            Hướng dẫn cài đặt:
          </Typography>
          <Typography variant="body2" component="div">
            1. Mở Chrome, vào <b>chrome://extensions</b><br />
            2. Bật <b>"Chế độ nhà phát triển"</b> (góc phải trên)<br />
            3. Nhấn <b>"Tải tiện ích đã giải nén"</b><br />
            4. Chọn thư mục <b>extension</b><br />
            5. Bật <b>"Cho phép trong cửa sổ ẩn danh"</b><br />
            6. Mở <b>Chi tiết</b> của extension, đặt <b>Site access</b> thành <b>On all sites</b> hoặc cho phép riêng <b>zaloautofrontend.onrender.com</b><br />
            7. Tải lại trang web này
          </Typography>
          {!extensionActive && extensionStatusHints.length > 0 ? (
            <Typography variant="body2" component="div" sx={{ mt: 2 }}>
              {extensionStatusHints.map((hint, index) => (
                <React.Fragment key={hint}>
                  {index + 1}. {hint}
                  {index < extensionStatusHints.length - 1 ? <br /> : null}
                </React.Fragment>
              ))}
            </Typography>
          ) : null}
          <Alert severity="info" sx={{ mt: 2 }}>
            Nếu đã cài extension nhưng web vẫn báo chưa kết nối, nguyên nhân thường là extension chưa được phép chạy trên domain hiện tại dù đã bật ẩn danh.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowExtDialog(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={waitingForLogin} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {syncState.phase === 'awaiting_sync_confirmation'
            ? 'Xác nhận đồng bộ tài khoản'
            : syncState.phase === 'syncing_account'
              ? 'Đang đồng bộ tài khoản'
              : 'Đang chờ đăng nhập Zalo'}
          <IconButton size="small" onClick={stopPolling}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {syncState.phase === 'awaiting_sync_confirmation' ? (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                Extension đã lấy được phiên đăng nhập Zalo. Xác nhận để web app nhận và sử dụng tài khoản này.
              </Alert>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Tài khoản: <strong>{syncState.summary?.name || 'Tài khoản Zalo'}</strong>
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Bạn bè: {syncState.summary?.friendCount || 0} | Nhóm: {syncState.summary?.groupCount || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Nếu đồng ý, tài khoản sẽ được đồng bộ vào web app và dùng làm phiên thao tác cho các chức năng nhắn tin, quản lý hội thoại và action runtime.
              </Typography>
            </>
          ) : syncState.phase === 'syncing_account' ? (
            <Alert severity="info" icon={<CircularProgress size={20} />} sx={{ mb: 2 }}>
              Đang chốt đồng bộ tài khoản và cập nhật dữ liệu phiên làm việc.
            </Alert>
          ) : (
            <>
              <Alert severity="info" icon={<CircularProgress size={20} />} sx={{ mb: 2 }}>
                Vui lòng đăng nhập Zalo trong cửa sổ ẩn danh vừa mở.
              </Alert>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Sau khi đăng nhập thành công, extension sẽ lấy session và chuyển sang bước xác nhận đồng bộ.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Thời gian chờ tối đa: 2 phút
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          {syncState.phase === 'awaiting_sync_confirmation' ? (
            <>
              <Button onClick={handleCancelPendingSync} color="inherit">Hủy</Button>
              <Button onClick={handleConfirmPendingSync} variant="contained">Xác nhận đồng bộ</Button>
            </>
          ) : (
            <Button onClick={stopPolling} color="error" disabled={syncState.phase === 'syncing_account'}>Hủy</Button>
          )}
        </DialogActions>
      </Dialog>



      <Dialog open={templateDialogOpen} onClose={() => setTemplateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Chọn mẫu tin nhắn nhanh</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
            {QUICK_TEMPLATES.map((template) => (
              <Button
                key={template}
                variant="outlined"
                onClick={() => {
                  setMessage(template);
                  setTemplateDialogOpen(false);
                }}
                sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
              >
                {template}
              </Button>
            ))}
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog open={rewriteDialog.open} onClose={() => setRewriteDialog({ open: false, target: 'message', options: [] })} maxWidth="sm" fullWidth>
        <DialogTitle>
          {rewriteDialog.target === 'rotation' ? '✨ AI Tạo mẫu tin nhắn luân phiên' : '✨ AI Gợi ý viết lại'}
        </DialogTitle>
        <DialogContent>
          {rewriteDialog.loading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, py: 4 }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary">
                {rewriteDialog.target === 'rotation' ? 'Đang tạo mẫu tin nhắn chống spam...' : 'Đang tạo gợi ý bằng AI...'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
              {(rewriteDialog.target === 'rotation' || rewriteDialog.target === 'message_rotation') && rewriteDialog.options.length > 1 && (
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => applyRewriteOption('__all__')}
                  sx={{ mb: 1, textTransform: 'none', fontWeight: 700 }}
                >
                  Dùng tất cả {rewriteDialog.options.length} mẫu
                </Button>
              )}
              {rewriteDialog.options.map((option, idx) => (
                <Button
                  key={idx}
                  variant="outlined"
                  onClick={() => applyRewriteOption(option)}
                  sx={{ justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none' }}
                >
                  {rewriteDialog.target === 'rotation' && (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ mr: 1, fontWeight: 700 }}>
                      #{idx + 1}
                    </Typography>
                  )}
                  {option}
                </Button>
              ))}
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleDialogOpen} onClose={() => setScheduleDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Lên lịch chạy</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            type="datetime-local"
            label="Thời gian chạy"
            value={scheduleAt}
            onChange={(event) => setScheduleAt(event.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScheduleDialogOpen(false)}>Đóng</Button>
          <Button onClick={() => setScheduleDialogOpen(false)} variant="contained">Xác nhận</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} maxWidth="xs">
        <DialogTitle>Xóa tài khoản Zalo</DialogTitle>
        <DialogContent>
          <Typography>
            Bạn có chắc muốn xóa tài khoản <b>{accounts[activeAccountIndex]?.name || ''}</b> khỏi hệ thống?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Hủy</Button>
          <Button color="error" variant="contained" onClick={() => {
            removeAccount(activeAccountIndex);
            setDeleteConfirmOpen(false);
            setFeedback({ severity: 'success', message: 'Đã xóa tài khoản.' });
          }}>
            Xóa
          </Button>
        </DialogActions>
      </Dialog>

      {!isPullGroupMode && canInviteFromCurrentTab && (
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Typography variant="h6" fontWeight={700}>
            Kết bạn
          </Typography>
          <Switch
            checked={ketBanEnabled}
            onChange={(event) => setKetBanEnabled(event.target.checked)}
            size="small"
            disabled={!hasAccount}
          />
          <Tooltip title={!canUsePlanFeature('ai_rewrite', planKey) ? `Yêu cầu gói ${getRequiredPlanLabel('ai_rewrite')} trở lên` : 'Bật để AI tự động viết nội dung lời mời kết bạn và mẫu tin nhắn luân phiên'} arrow>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, ml: 1, cursor: 'pointer', opacity: !canUsePlanFeature('ai_rewrite', planKey) ? 0.5 : 1 }}>
              <AiIcon fontSize="small" sx={{ color: autoAiContent ? 'primary.main' : 'text.secondary', fontSize: 18 }} />
              <Typography variant="caption" fontWeight={600} color={autoAiContent ? 'primary.main' : 'text.secondary'}>
                AI tự động
              </Typography>
              <Switch
                checked={autoAiContent}
                onChange={(event) => setAutoAiContent(event.target.checked)}
                color="primary"
                size="small"
                disabled={!canUsePlanFeature('ai_rewrite', planKey) || !ketBanEnabled}
              />
              {aiGenerating && <CircularProgress size={14} sx={{ ml: 0.5 }} />}
            </Box>
          </Tooltip>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Lời mời kết bạn (150 ký tự):
        </Typography>

        <Paper variant="outlined" sx={{ mb: 1 }}>
          <TextField
            fullWidth
            multiline
            rows={2}
            value={friendRequest}
            onChange={(event) => {
              if (event.target.value.length <= 150) setFriendRequest(event.target.value);
            }}
            variant="standard"
            InputProps={{ disableUnderline: true }}
            disabled={!hasAccount || !ketBanEnabled}
            sx={{ px: 1.5, py: 1 }}
          />

          <Box sx={{ display: 'flex', gap: 1, px: 1.5, pb: 1 }}>
            <Tooltip title={!canUsePlanFeature('ai_rewrite', planKey) ? `Yêu cầu gói ${getRequiredPlanLabel('ai_rewrite')} trở lên` : ''} arrow>
              <span>
              <Button
                size="small"
                startIcon={<AiIcon fontSize="small" />}
                disabled={!hasAccount || !ketBanEnabled || !friendRequest.trim() || !canUsePlanFeature('ai_rewrite', planKey)}
                onClick={() => openRewriteDialog('friend')}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.8rem',
                  borderRadius: '16px',
                  px: 1.5,
                }}
              >
                AI viết lại
              </Button>
              </span>
            </Tooltip>
            {autoAiContent && (
              <Button
                size="small"
                startIcon={aiGenerating ? <CircularProgress size={14} /> : <RefreshIcon fontSize="small" />}
                disabled={aiGenerating}
                onClick={generateAiContent}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.8rem',
                  borderRadius: '16px',
                  px: 1.5,
                }}
              >
                Tạo lại
              </Button>
            )}
          </Box>
        </Paper>
      </Box>
      )}

      {!isPullGroupMode && canMessageFromCurrentTab && (
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Typography variant="h6" fontWeight={700}>
            Nhắn tin
          </Typography>
          <Switch
            checked={nhanTinEnabled}
            onChange={(event) => setNhanTinEnabled(event.target.checked)}
            size="small"
          />
          {canUsePlanFeature('ai_rewrite', planKey) && (
            <>
              <Tooltip title="AI tự động tạo nội dung tin nhắn và mẫu luân phiên chống spam" arrow>
                <Button
                  size="small"
                  startIcon={aiMsgGenerating ? <CircularProgress size={14} /> : <AiIcon fontSize="small" />}
                  onClick={() => setAutoAiMessage((prev) => !prev)}
                  disabled={aiMsgGenerating}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.8rem',
                    borderRadius: '16px',
                    px: 1.5,
                    color: autoAiMessage ? 'primary.main' : 'text.secondary',
                    bgcolor: autoAiMessage ? 'primary.50' : undefined,
                  }}
                >
                  AI tự động
                </Button>
              </Tooltip>
              {autoAiMessage && (
                <Button
                  size="small"
                  disabled={aiMsgGenerating}
                  onClick={generateAiMessage}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.8rem',
                    borderRadius: '16px',
                    px: 1.5,
                  }}
                >
                  Tạo lại
                </Button>
              )}
            </>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Tin nhắn:
          </Typography>
          <IconButton size="small" disabled={!hasAccount || !nhanTinEnabled}>
            <ImageIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" disabled={!hasAccount || !nhanTinEnabled}>
            <ListIcon fontSize="small" />
          </IconButton>
        </Box>

        <Paper variant="outlined" sx={{ mb: 1.5 }}>
          <TextField
            fullWidth
            multiline
            rows={2}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            variant="standard"
            InputProps={{ disableUnderline: true }}
            disabled={!hasAccount || !nhanTinEnabled}
            sx={{ px: 1.5, py: 1 }}
          />

          <Box sx={{ display: 'flex', gap: 1, px: 1.5, pb: 1 }}>
            <Tooltip title={!canUsePlanFeature('ai_rewrite', planKey) ? `Yêu cầu gói ${getRequiredPlanLabel('ai_rewrite')} trở lên` : ''} arrow>
              <span>
              <Button
                size="small"
                startIcon={<AiIcon fontSize="small" />}
                disabled={!hasAccount || !nhanTinEnabled || !message.trim() || !canUsePlanFeature('ai_rewrite', planKey)}
                onClick={() => openRewriteDialog('message')}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.8rem',
                  borderRadius: '16px',
                  px: 1.5,
                }}
              >
                AI viết lại
              </Button>
              </span>
            </Tooltip>
            <Tooltip title={!canUsePlanFeature('quick_message', planKey) ? `Yêu cầu gói ${getRequiredPlanLabel('quick_message')} trở lên` : ''} arrow>
              <span>
              <Button
                size="small"
                startIcon={<FlashIcon fontSize="small" />}
                disabled={!hasAccount || !nhanTinEnabled || !canUsePlanFeature('quick_message', planKey)}
                onClick={() => setTemplateDialogOpen(true)}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.8rem',
                  borderRadius: '16px',
                  px: 1.5,
                }}
              >
                Tin nhắn nhanh
              </Button>
              </span>
            </Tooltip>
          </Box>
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            p: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            borderStyle: 'dashed',
            cursor: nhanTinEnabled ? 'pointer' : 'not-allowed',
            position: 'relative',
            '&:hover': nhanTinEnabled ? { borderColor: 'primary.main', bgcolor: 'rgba(0,104,255,0.02)' } : undefined,
          }}
          onClick={() => {
            if (hasAccount && nhanTinEnabled) {
              document.getElementById('file-upload')?.click();
            }
          }}
        >
          <input
            id="file-upload"
            type="file"
            multiple
            accept="image/jpeg,.jpeg,.png,image/*,.jpg,video/*,.mp4,text/*,.txt,.csv,application/zip,.zip,.7z,.gz,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <Box component="img" src="/upload-illustration.svg" alt="upload" sx={{ width: 80, height: 80 }} />
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>
              Ảnh/Video/File đính kèm
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedFiles.length ? `Đã chọn ${selectedFiles.length} tệp` : 'Kéo thả hoặc chọn tệp'}
            </Typography>
          </Box>
        </Paper>

        {selectedFiles.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
            {selectedFiles.map((file) => (
              <Chip key={`${file.name}-${file.size}`} label={file.name} onDelete={() => setSelectedFiles((prev) => prev.filter((item) => item !== file))} />
            ))}
          </Box>
        )}

        {/* Message template rotation (when AI auto or templates exist) */}
        {(autoAiMessage || msgTemplates.length > 0) && (
          <Box sx={{ mt: 1.5, p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
              <Typography variant="caption" fontWeight={600}>Đổi nội dung mỗi:</Typography>
              <TextField
                value={rotateMsgEvery}
                onChange={(event) => setRotateMsgEvery(event.target.value)}
                size="small"
                type="number"
                sx={{ width: 64, '& .MuiInputBase-input': { py: 0.5, px: 0.75, fontSize: '0.75rem' } }}
                inputProps={{ min: 1 }}
              />
              <Typography variant="caption" color="text.secondary">tin nhắn</Typography>
            </Box>
            <TextField
              fullWidth
              multiline
              minRows={2}
              maxRows={4}
              size="small"
              value={msgTemplates.join('\n')}
              onChange={(event) => setMsgTemplates(event.target.value.split('\n').filter((l) => l.trim()))}
              placeholder={'Chào bạn, mình có thông tin hay muốn chia sẻ!\nHi bạn, mình gửi tin nhắn nhé!\nXin chào, mình muốn nhắn tin cho bạn!'}
              helperText={msgTemplates.length > 0 ? `${msgTemplates.length} mẫu tin nhắn — đổi nội dung mỗi ${rotateMsgEvery} tin` : 'Để trống = dùng nội dung mặc định'}
              sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
            />
            <Button
              size="small"
              startIcon={<AiIcon fontSize="small" />}
              onClick={() => openRewriteDialog('message_rotation')}
              disabled={!canUsePlanFeature('ai_rewrite', planKey)}
              sx={{
                textTransform: 'none',
                fontSize: '0.75rem',
                borderRadius: '16px',
                px: 1.5,
                mt: 0.5,
                alignSelf: 'flex-start',
              }}
            >
              AI tạo mẫu chống spam
            </Button>
          </Box>
        )}
      </Box>
      )}

      {isPullGroupMode && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
            Danh sách bạn bè để mời vào nhóm
          </Typography>

          <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Nhóm đích: {selectedGroupRowForPull?.name || 'Hãy chọn 1 nhóm ở cột phải'}
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="Tìm bạn bè theo tên/SĐT/ZID"
              value={pullGroupSearchQuery}
              onChange={(event) => setPullGroupSearchQuery(event.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Paper>

          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderBottom: '1px solid #eef2f6' }}>
              <Checkbox
                size="small"
                checked={allPullGroupVisibleSelected}
                onChange={(event) => toggleAllPullGroupFriends(event.target.checked)}
              />
              <Typography variant="body2" fontWeight={600}>
                {selectedPullGroupFriends.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                bạn bè đã chọn
              </Typography>
            </Box>

            <TableContainer sx={{ maxHeight: 480 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>Tên</TableCell>
                    <TableCell>Số điện thoại</TableCell>
                    <TableCell>Phân loại</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPullGroupFriends.map((friend) => {
                    const friendId = String(friend.zid || '');
                    const checked = pullGroupFriendIds.includes(friendId);
                    return (
                      <TableRow key={friendId || friend.key} hover selected={checked}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={checked}
                            onChange={() => togglePullGroupFriend(friendId)}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar src={friend.avatar} sx={{ width: 28, height: 28 }}>
                              {(friend.name || '?')[0]}
                            </Avatar>
                            <Typography variant="body2">{friend.name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">{friend.phone || '—'}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">{friend.classification || 'Chưa phân loại'}</Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {filteredPullGroupFriends.length === 0 && (
              <Box sx={{ px: 2, py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  Không tìm thấy bạn bè phù hợp để mời vào nhóm.
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>
      )}

      {!isPullGroupMode && (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Hoạt động gần đây
        </Typography>
        {recentActivities.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Chưa có chiến dịch nào được tạo. Hãy chọn dữ liệu ở cột bên phải rồi bấm Bắt Đầu.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {recentActivities.map((activity) => (
              <Box key={activity.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {activity.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {activity.activityType === 'message'
                      ? 'Nhắn tin'
                      : activity.activityType === 'invite'
                        ? 'Kết bạn'
                        : activity.activityType === 'action'
                          ? activity.actionLabel || 'Thao tác'
                          : 'Đã lên lịch'} | {new Date(activity.timestamp || Date.now()).toLocaleString('vi-VN')}
                  </Typography>
                </Box>
                <Chip label={activity.statusLabel || 'Đã tạo'} size="small" variant="outlined" />
              </Box>
            ))}
          </Box>
        )}
      </Paper>
      )}
      </Box>

      {/* ── Sticky bottom action bar ── */}
      <Paper
        elevation={3}
        sx={{
          position: 'sticky',
          bottom: 0,
          zIndex: 10,
          borderRadius: '12px 12px 0 0',
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          px: 2,
          py: 1.5,
        }}
      >
        {/* Row 1: Settings toggles */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              Delay:
            </Typography>
            <TextField
              value={delayFrom}
              onChange={(event) => setDelayFrom(event.target.value)}
              size="small"
              type="text"
              sx={{ width: 52, '& .MuiInputBase-input': { py: 0.5, px: 0.75, fontSize: '0.75rem' } }}
            />
            <Typography variant="caption" color="text.secondary">–</Typography>
            <TextField
              value={delayTo}
              onChange={(event) => setDelayTo(event.target.value)}
              size="small"
              type="text"
              sx={{ width: 52, '& .MuiInputBase-input': { py: 0.5, px: 0.75, fontSize: '0.75rem' } }}
            />
            <Typography variant="caption" color="text.secondary">giây</Typography>
          </Box>

          <Tooltip title="Bật chống spam: thêm delay ngẫu nhiên giữa mỗi lời mời để tránh bị Zalo phát hiện" arrow>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: 'pointer' }}>
              <Typography variant="caption" fontWeight={600} color={antiSpam ? 'error.main' : 'text.secondary'}>
                Chống spam
              </Typography>
              <Switch
                checked={antiSpam}
                onChange={(event) => setAntiSpam(event.target.checked)}
                color="error"
                size="small"
              />
            </Box>
          </Tooltip>

          {accounts.length > 1 && (
            <Tooltip title={`Luân phiên gửi kết bạn qua ${accounts.length} nick để tránh bị khóa. Mỗi nick gửi ${rotationBatchSize} lời mời rồi chuyển sang nick kế tiếp.`} arrow>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: 'pointer' }}>
                <Typography variant="caption" fontWeight={600} color={rotationEnabled ? 'primary.main' : 'text.secondary'}>
                  Luân phiên
                </Typography>
                <Switch
                  checked={rotationEnabled}
                  onChange={(event) => setRotationEnabled(event.target.checked)}
                  color="primary"
                  size="small"
                />
              </Box>
            </Tooltip>
          )}
        </Box>

        {/* Row 1.5a: Rotation nick settings (only when rotation enabled + multi-account) */}
        {rotationEnabled && accounts.length > 1 && (
          <Box sx={{ mb: 0.5, p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
              <Typography variant="caption" fontWeight={600}>Mỗi nick gửi:</Typography>
              <TextField
                value={rotationBatchSize}
                onChange={(event) => setRotationBatchSize(event.target.value)}
                size="small"
                type="number"
                sx={{ width: 64, '& .MuiInputBase-input': { py: 0.5, px: 0.75, fontSize: '0.75rem' } }}
                inputProps={{ min: 1 }}
              />
              <Typography variant="caption" color="text.secondary">lời mời rồi chuyển nick</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {accounts.length} nick: {accounts.map((a, i) => a.name || a.phone || `Nick ${i + 1}`).join(', ')}
            </Typography>
          </Box>
        )}

        {/* Row 1.5b: Message templates (when rotation or AI auto enabled) */}
        {(rotationEnabled || autoAiContent || messageTemplates.length > 0) && (
          <Box sx={{ mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
              <Typography variant="caption" fontWeight={600}>Đổi nội dung mỗi:</Typography>
              <TextField
                value={rotateMessageEvery}
                onChange={(event) => setRotateMessageEvery(event.target.value)}
                size="small"
                type="number"
                sx={{ width: 64, '& .MuiInputBase-input': { py: 0.5, px: 0.75, fontSize: '0.75rem' } }}
                inputProps={{ min: 1 }}
              />
              <Typography variant="caption" color="text.secondary">lời mời</Typography>
            </Box>
            <TextField
              fullWidth
              multiline
              minRows={2}
              maxRows={4}
              size="small"
              value={messageTemplates.join('\n')}
              onChange={(event) => setMessageTemplates(event.target.value.split('\n').filter((l) => l.trim()))}
              placeholder={'Chào bạn, kết bạn nhé!\nXin chào, mình muốn kết bạn!\nHi, cho mình kết bạn với!'}
              helperText={messageTemplates.length > 0 ? `${messageTemplates.length} mẫu tin nhắn — đổi nội dung mỗi ${rotateMessageEvery} lời mời` : 'Để trống = dùng lời mời mặc định (không đổi)'}
              sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
            />
            <Button
              size="small"
              startIcon={<AiIcon fontSize="small" />}
              onClick={() => openRewriteDialog('rotation')}
              disabled={!canUsePlanFeature('ai_rewrite', planKey)}
              sx={{
                textTransform: 'none',
                fontSize: '0.75rem',
                borderRadius: '16px',
                px: 1.5,
                mt: 0.5,
                alignSelf: 'flex-start',
              }}
            >
              AI tạo mẫu chống spam
            </Button>
          </Box>
        )}

        {/* Row 2: Action buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {running ? (
            <Button
              variant="contained"
              size="medium"
              type="button"
              endIcon={paused ? <PlayArrowIcon /> : <PauseIcon />}
              onClick={handlePauseToggle}
              sx={{
                flex: 1,
                height: 44,
                fontWeight: 700,
                fontSize: '0.9rem',
                borderRadius: '8px',
                bgcolor: paused ? '#f59e0b' : '#ff5630',
                boxShadow: 'none',
                textTransform: 'none',
                '&:hover': { bgcolor: paused ? '#d97706' : '#cc4526' },
              }}
            >
              {paused ? 'Tiếp tục' : 'Tạm dừng'}
            </Button>
          ) : (
            <Button
              variant="contained"
              size="medium"
              type="button"
              endIcon={<SendIcon />}
              onClick={handleStart}
              sx={{
                flex: 1,
                height: 44,
                fontWeight: 700,
                fontSize: '0.9rem',
                borderRadius: '8px',
                bgcolor: 'rgb(32,101,209)',
                boxShadow: 'none',
                textTransform: 'none',
                '&:hover': { bgcolor: 'rgb(24, 80, 170)' },
              }}
            >
              Bắt Đầu
            </Button>
          )}

          <Box sx={{ position: 'relative' }}>
            <Button
              variant="contained"
              onClick={() => setScheduleDialogOpen(true)}
              disabled={!hasAccount || !selectedCount || (!ketBanEnabled && !nhanTinEnabled && !hasSupportedActionSelected)}
              sx={{
                minWidth: 48,
                height: 44,
                borderRadius: '8px',
                bgcolor: 'rgba(145,158,171,0.24)',
                color: 'rgba(145,158,171,0.8)',
                boxShadow: 'none',
                '&:hover': { bgcolor: 'rgba(145,158,171,0.34)' },
                '&.Mui-disabled': {
                  bgcolor: 'rgba(145,158,171,0.24)',
                  color: 'rgba(145,158,171,0.8)',
                },
              }}
            >
              <CalendarIcon />
            </Button>
            <Chip
              label={scheduleAt ? 'Đã đặt' : 'Soon'}
              size="small"
              sx={{
                position: 'absolute',
                top: -8,
                right: -8,
                fontSize: '0.6rem',
                height: 18,
                fontWeight: 700,
                bgcolor: scheduleAt ? '#00a76f' : '#ef5350',
                color: '#fff',
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
