export function buildJobId(prefix, key, index) {
  return `${prefix}_${Date.now()}_${index}_${String(key || 'item').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export function normalizeThreadTargetId(value, isGroup) {
  const text = String(value || '').trim();
  if (!text || text === '—') return text;
  if (isGroup && (text.startsWith('g') || text.startsWith('G'))) {
    return text.slice(1);
  }
  return text;
}

function toIsoOrNull(value) {
  return value ? value.toISOString() : null;
}

export function buildInviteRecords({
  inviteTargets,
  friendRequest,
  activeAccount,
  activeAccountIndex,
  accountLabel,
  delayWindow,
  antiSpam,
  selectedLabel,
  messageTargetsAreGroups,
  isScheduled,
  scheduledDate,
  now,
}) {
  return (Array.isArray(inviteTargets) ? inviteTargets : []).map((item, index) => ({
    id: buildJobId('invite', item.key || item.zid, index),
    type: 'friend_request',
    name: item.name,
    avatar: item.avatar,
    phone: item.phone,
    zid: item.zid || item.classification || '—',
    note: String(friendRequest || '').trim(),
    accountId: activeAccount?.id || activeAccountIndex,
    accountName: accountLabel,
    delayWindow,
    antiSpam,
    sourceTab: messageTargetsAreGroups ? `${selectedLabel} / ${item.sourceTab || 'Thành viên nhóm'}` : selectedLabel,
    createdAt: now.toISOString(),
    scheduledAt: isScheduled ? toIsoOrNull(scheduledDate) : null,
    status: isScheduled ? 'scheduled' : 'queued',
    statusLabel: isScheduled ? `Lên lịch ${scheduledDate.toLocaleString('vi-VN')}` : 'Đã tạo lệnh',
  }));
}

export function buildMessageRecords({
  selectedItems,
  message,
  selectedFiles,
  activeAccount,
  activeAccountIndex,
  accountLabel,
  delayWindow,
  antiSpam,
  selectedLabel,
  messageTargetsAreGroups,
  isScheduled,
  scheduledDate,
  now,
}) {
  return (Array.isArray(selectedItems) ? selectedItems : []).map((item, index) => ({
    id: buildJobId('message', item.key || item.zid, index),
    type: 'message',
    name: item.name,
    avatar: item.avatar,
    phone: item.phone,
    zid: normalizeThreadTargetId(item.zid || item.classification || '—', messageTargetsAreGroups),
    rawZid: item.zid || item.classification || '—',
    isGroup: messageTargetsAreGroups,
    content: String(message || '').trim(),
    attachments: (Array.isArray(selectedFiles) ? selectedFiles : []).map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
    })),
    accountId: activeAccount?.id || activeAccountIndex,
    accountName: accountLabel,
    delayWindow,
    antiSpam,
    sourceTab: selectedLabel,
    createdAt: now.toISOString(),
    scheduledAt: isScheduled ? toIsoOrNull(scheduledDate) : null,
    status: isScheduled ? 'scheduled' : 'queued',
    statusLabel: isScheduled ? `Lên lịch ${scheduledDate.toLocaleString('vi-VN')}` : 'Đang xếp hàng',
  }));
}

export function buildActionRecords({
  selectedItems,
  pullGroupItems,
  removeFriendEnabled,
  muteNotificationsEnabled,
  unmuteNotificationsEnabled,
  leaveGroupEnabled,
  pullGroupEnabled,
  joinGroupEnabled,
  targetGroupId,
  targetGroupName,
  undoFriendRequestEnabled,
  rejectFriendRequestEnabled,
  acceptFriendRequestEnabled,
  activeAccount,
  activeAccountIndex,
  accountLabel,
  delayWindow,
  antiSpam,
  selectedLabel,
  messageTargetsAreGroups,
  isScheduled,
  scheduledDate,
  now,
}) {
  const items = Array.isArray(selectedItems) ? selectedItems : [];
  const pullItems = Array.isArray(pullGroupItems) ? pullGroupItems : items;

  return [
    ...(removeFriendEnabled
      ? items.map((item, index) => ({
          id: buildJobId('remove_friend', item.key || item.zid, index),
          type: 'action',
          actionType: 'remove_friend',
          actionLabel: 'Xóa bạn bè',
          name: item.name,
          avatar: item.avatar,
          phone: item.phone,
          zid: item.zid || item.classification || '—',
          isGroup: false,
          accountId: activeAccount?.id || activeAccountIndex,
          accountName: accountLabel,
          delayWindow,
          antiSpam,
          sourceTab: selectedLabel,
          createdAt: now.toISOString(),
          scheduledAt: isScheduled ? toIsoOrNull(scheduledDate) : null,
          status: isScheduled ? 'scheduled' : 'queued',
          statusLabel: isScheduled ? `Lên lịch ${scheduledDate.toLocaleString('vi-VN')}` : 'Đang xếp hàng',
        }))
      : []),
    ...(leaveGroupEnabled
      ? items.map((item, index) => ({
          id: buildJobId('leave_group', item.key || item.zid, index),
          type: 'action',
          actionType: 'leave_group',
          actionLabel: 'Rời nhóm',
          name: item.name,
          avatar: item.avatar,
          phone: item.phone,
          zid: normalizeThreadTargetId(item.zid || item.classification || '—', true),
          rawZid: item.zid || item.classification || '—',
          isGroup: true,
          accountId: activeAccount?.id || activeAccountIndex,
          accountName: accountLabel,
          delayWindow,
          antiSpam,
          sourceTab: selectedLabel,
          createdAt: now.toISOString(),
          scheduledAt: isScheduled ? toIsoOrNull(scheduledDate) : null,
          status: isScheduled ? 'scheduled' : 'queued',
          statusLabel: isScheduled ? `Lên lịch ${scheduledDate.toLocaleString('vi-VN')}` : 'Đang xếp hàng',
        }))
      : []),
    ...(pullGroupEnabled
      ? pullItems.map((item, index) => ({
          id: buildJobId('pull_group', item.key || item.zid, index),
          type: 'action',
          actionType: 'pull_group',
          actionLabel: 'Kéo nhóm',
          name: item.name,
          avatar: item.avatar,
          phone: item.phone,
          classification: item.classification || '',
          zid: item.zid || item.classification || '—',
          rawZid: item.zid || item.classification || '—',
          isGroup: false,
          targetGroupId: normalizeThreadTargetId(targetGroupId || '—', true),
          targetGroupName: targetGroupName || 'Nhóm đã chọn',
          accountId: activeAccount?.id || activeAccountIndex,
          accountName: accountLabel,
          delayWindow,
          antiSpam,
          sourceTab: selectedLabel,
          createdAt: now.toISOString(),
          scheduledAt: isScheduled ? toIsoOrNull(scheduledDate) : null,
          status: isScheduled ? 'scheduled' : 'queued',
          statusLabel: isScheduled ? `Lên lịch ${scheduledDate.toLocaleString('vi-VN')}` : 'Đang xếp hàng',
        }))
      : []),
    ...(joinGroupEnabled
      ? items.map((item, index) => ({
          id: buildJobId('join_group', item.key || item.zid, index),
          type: 'action',
          actionType: 'join_group',
          actionLabel: 'Tham gia nhóm',
          name: item.name,
          avatar: item.avatar,
          phone: item.phone,
          classification: item.classification || '',
          zid: normalizeThreadTargetId(item.zid || item.key || '—', true),
          rawZid: item.zid || item.key || '—',
          inviteLink: item.inviteLink || item.source?.inviteLink || '',
          isGroup: false,
          accountId: activeAccount?.id || activeAccountIndex,
          accountName: accountLabel,
          delayWindow,
          antiSpam,
          sourceTab: selectedLabel,
          createdAt: now.toISOString(),
          scheduledAt: isScheduled ? toIsoOrNull(scheduledDate) : null,
          status: isScheduled ? 'scheduled' : 'queued',
          statusLabel: isScheduled ? `Lên lịch ${scheduledDate.toLocaleString('vi-VN')}` : 'Đang xếp hàng',
        }))
      : []),
    ...(undoFriendRequestEnabled
      ? items.map((item, index) => ({
          id: buildJobId('undo_friend_request', item.key || item.zid, index),
          type: 'action',
          actionType: 'undo_friend_request',
          actionLabel: 'Thu hồi lời mời',
          name: item.name,
          avatar: item.avatar,
          phone: item.phone,
          zid: item.zid || item.classification || '—',
          isGroup: false,
          accountId: activeAccount?.id || activeAccountIndex,
          accountName: accountLabel,
          delayWindow,
          antiSpam,
          sourceTab: selectedLabel,
          createdAt: now.toISOString(),
          scheduledAt: isScheduled ? toIsoOrNull(scheduledDate) : null,
          status: isScheduled ? 'scheduled' : 'queued',
          statusLabel: isScheduled ? `Lên lịch ${scheduledDate.toLocaleString('vi-VN')}` : 'Đang xếp hàng',
        }))
      : []),
    ...(rejectFriendRequestEnabled
      ? items.map((item, index) => ({
          id: buildJobId('reject_friend_request', item.key || item.zid, index),
          type: 'action',
          actionType: 'reject_friend_request',
          actionLabel: 'Từ chối lời mời',
          name: item.name,
          avatar: item.avatar,
          phone: item.phone,
          zid: item.zid || item.classification || '—',
          isGroup: false,
          accountId: activeAccount?.id || activeAccountIndex,
          accountName: accountLabel,
          delayWindow,
          antiSpam,
          sourceTab: selectedLabel,
          createdAt: now.toISOString(),
          scheduledAt: isScheduled ? toIsoOrNull(scheduledDate) : null,
          status: isScheduled ? 'scheduled' : 'queued',
          statusLabel: isScheduled ? `Lên lịch ${scheduledDate.toLocaleString('vi-VN')}` : 'Đang xếp hàng',
        }))
      : []),
    ...(acceptFriendRequestEnabled
      ? items.map((item, index) => ({
          id: buildJobId('accept_friend_request', item.key || item.zid, index),
          type: 'action',
          actionType: 'accept_friend_request',
          actionLabel: 'Chấp nhận lời mời',
          name: item.name,
          avatar: item.avatar,
          phone: item.phone,
          zid: item.zid || item.classification || '—',
          isGroup: false,
          accountId: activeAccount?.id || activeAccountIndex,
          accountName: accountLabel,
          delayWindow,
          antiSpam,
          sourceTab: selectedLabel,
          createdAt: now.toISOString(),
          scheduledAt: isScheduled ? toIsoOrNull(scheduledDate) : null,
          status: isScheduled ? 'scheduled' : 'queued',
          statusLabel: isScheduled ? `Lên lịch ${scheduledDate.toLocaleString('vi-VN')}` : 'Đang xếp hàng',
        }))
      : []),
    ...(muteNotificationsEnabled || unmuteNotificationsEnabled
      ? items.map((item, index) => ({
          id: buildJobId(unmuteNotificationsEnabled ? 'unmute' : 'mute', item.key || item.zid, index),
          type: 'action',
          actionType: unmuteNotificationsEnabled ? 'unmute' : 'mute',
          actionLabel: unmuteNotificationsEnabled ? 'Bật thông báo' : 'Tắt thông báo',
          name: item.name,
          avatar: item.avatar,
          phone: item.phone,
          zid: normalizeThreadTargetId(item.zid || item.classification || '—', messageTargetsAreGroups),
          rawZid: item.zid || item.classification || '—',
          isGroup: messageTargetsAreGroups,
          accountId: activeAccount?.id || activeAccountIndex,
          accountName: accountLabel,
          delayWindow,
          antiSpam,
          sourceTab: selectedLabel,
          createdAt: now.toISOString(),
          scheduledAt: isScheduled ? toIsoOrNull(scheduledDate) : null,
          status: isScheduled ? 'scheduled' : 'queued',
          statusLabel: isScheduled ? `Lên lịch ${scheduledDate.toLocaleString('vi-VN')}` : 'Đang xếp hàng',
        }))
      : []),
  ];
}