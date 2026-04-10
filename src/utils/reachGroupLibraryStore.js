const GROUP_LIBRARY_STORAGE_KEY = 'zt_group_library';
const GROUP_LIBRARY_EVENT = 'zt:group-library-change';

function normalizeEntryKey(entry) {
  return String(entry?.groupId || entry?.zid || entry?.inviteLink || '').trim();
}

export function loadGroupLibraryEntries() {
  try {
    const raw = localStorage.getItem(GROUP_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGroupLibraryEntries(entries) {
  try {
    localStorage.setItem(GROUP_LIBRARY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    return;
  }

  window.dispatchEvent(new CustomEvent(GROUP_LIBRARY_EVENT, {
    detail: { entries },
  }));
}

export function upsertGroupLibraryEntries(nextEntries) {
  const incomingEntries = Array.isArray(nextEntries) ? nextEntries : [];
  if (!incomingEntries.length) return loadGroupLibraryEntries();

  const existingEntries = loadGroupLibraryEntries();
  const merged = new Map();

  existingEntries.forEach((entry) => {
    const key = normalizeEntryKey(entry);
    if (!key) return;
    merged.set(key, entry);
  });

  incomingEntries.forEach((entry) => {
    const key = normalizeEntryKey(entry);
    if (!key) return;
    const current = merged.get(key) || {};
    merged.set(key, {
      ...current,
      ...entry,
      groupId: entry?.groupId || current?.groupId || entry?.zid || current?.zid || '',
      inviteLink: entry?.inviteLink || current?.inviteLink || '',
      updatedAt: new Date().toISOString(),
    });
  });

  const entries = Array.from(merged.values())
    .sort((left, right) => new Date(right?.updatedAt || right?.pulledAt || 0).getTime() - new Date(left?.updatedAt || left?.pulledAt || 0).getTime());

  writeGroupLibraryEntries(entries);
  return entries;
}

export function subscribeGroupLibraryChange(callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }

  const handler = (event) => {
    callback(Array.isArray(event?.detail?.entries) ? event.detail.entries : loadGroupLibraryEntries());
  };

  window.addEventListener(GROUP_LIBRARY_EVENT, handler);
  return () => window.removeEventListener(GROUP_LIBRARY_EVENT, handler);
}