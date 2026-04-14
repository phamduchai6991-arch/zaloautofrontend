export const ACTION_DEFAULTS = {
  removeFriend: false,
  muteNotifications: false,
  unmuteNotifications: false,
  leaveGroup: false,
  pullGroup: false,
  joinGroup: false,
  deletePhoneAfterAction: false,
  undoFriendRequest: false,
  rejectFriendRequest: false,
  acceptFriendRequest: false,
};

export const LOCAL_VIEW_DEFAULTS = {
  dedupeRows: false,
  showHiddenMembers: false,
  showAllAccountsFriends: false,
  showAllAccountsGroups: false,
};

export const CONTROL_DEFINITIONS = {
  removeFriend: { label: 'Xóa bạn bè', kind: 'action' },
  dedupeRows: { label: 'Lọc trùng', kind: 'local' },
  showAllAccountsFriends: { label: 'Tất cả nick', kind: 'local' },
  showAllAccountsGroups: { label: 'Tất cả nick', kind: 'local' },
  unmuteNotifications: { label: 'Bật thông báo', kind: 'action', exclusiveWith: ['muteNotifications'] },
  muteNotifications: { label: 'Tắt thông báo', kind: 'action', exclusiveWith: ['unmuteNotifications'] },
  leaveGroup: { label: 'Rời nhóm', kind: 'action' },
  pullGroup: { label: 'Kéo nhóm', kind: 'action' },
  showHiddenMembers: { label: 'Hiển thị thành viên ẩn', kind: 'local' },
  joinGroup: { label: 'Tham gia nhóm', kind: 'action' },
  deletePhoneAfterAction: { label: 'Xóa SĐT sau khi thao tác', kind: 'action' },
  undoFriendRequest: { label: 'Thu hồi lời mời', kind: 'action' },
  rejectFriendRequest: { label: 'Từ chối lời mời', kind: 'action', exclusiveWith: ['acceptFriendRequest'] },
  acceptFriendRequest: { label: 'Chấp nhận lời mời', kind: 'action', exclusiveWith: ['rejectFriendRequest'] },
};

export const TAB_CONTROL_ROWS = {
  0: [
    ['removeFriend', 'dedupeRows', 'showAllAccountsFriends'],
    ['unmuteNotifications'],
    ['muteNotifications'],
  ],
  1: [
    ['leaveGroup', 'pullGroup', 'showAllAccountsGroups'],
    ['showHiddenMembers', 'unmuteNotifications'],
    ['muteNotifications'],
  ],
  2: [
    ['showHiddenMembers', 'joinGroup'],
  ],
  3: [
    ['deletePhoneAfterAction'],
  ],
  4: [
    ['undoFriendRequest'],
  ],
  5: [
    ['rejectFriendRequest', 'acceptFriendRequest'],
  ],
};

export const TAB_SEARCH_PLACEHOLDERS = {
  0: 'Tìm kiếm',
  1: 'Tìm theo tên/link',
  2: 'Tìm theo tên/link',
  3: 'Tìm theo tên/link',
  4: 'Tìm theo tên',
  5: 'Tìm kiếm',
};

export const TABS_WITH_COLLECTION_FILTER = new Set([0, 1]);

export const SUPPORTED_REMOTE_ACTION_KEYS = new Set([
  'removeFriend',
  'muteNotifications',
  'unmuteNotifications',
  'leaveGroup',
  'pullGroup',
  'joinGroup',
  'undoFriendRequest',
  'rejectFriendRequest',
  'acceptFriendRequest',
]);

export function getTabControlRows(activeTab) {
  return TAB_CONTROL_ROWS[activeTab] || [];
}

export function getTabActionKeys(activeTab) {
  const keys = new Set();
  getTabControlRows(activeTab).forEach((row) => {
    row.forEach((key) => {
      if (CONTROL_DEFINITIONS[key]?.kind === 'action') {
        keys.add(key);
      }
    });
  });
  return Array.from(keys);
}

export function applyActionToggle(currentState, key, checked) {
  const next = {
    ...ACTION_DEFAULTS,
    ...(currentState || {}),
    [key]: checked,
  };

  if (checked) {
    const conflicts = CONTROL_DEFINITIONS[key]?.exclusiveWith || [];
    conflicts.forEach((conflictKey) => {
      next[conflictKey] = false;
    });
  }

  return next;
}

export function getControlLabel(key) {
  return CONTROL_DEFINITIONS[key]?.label || key;
}

export function getControlKind(key) {
  return CONTROL_DEFINITIONS[key]?.kind || 'action';
}

export function getUnsupportedActionLabels(activeTab, actionState) {
  return getTabActionKeys(activeTab)
    .filter((key) => Boolean(actionState?.[key]) && !SUPPORTED_REMOTE_ACTION_KEYS.has(key))
    .map((key) => getControlLabel(key));
}