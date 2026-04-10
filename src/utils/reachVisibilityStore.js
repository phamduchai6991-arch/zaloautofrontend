const HIDDEN_CONTACTS_STORAGE_KEY = 'zt_hidden_contacts';
const HIDDEN_CONTACTS_EVENT = 'zt_hidden_contacts_changed';

function loadHiddenContactsMap() {
  try {
    const raw = localStorage.getItem(HIDDEN_CONTACTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveHiddenContactsMap(value) {
  localStorage.setItem(HIDDEN_CONTACTS_STORAGE_KEY, JSON.stringify(value));
}

function emitHiddenContactsChanged() {
  window.dispatchEvent(new CustomEvent(HIDDEN_CONTACTS_EVENT));
}

export function getHiddenContactIds(accountId) {
  if (!accountId) return new Set();
  const map = loadHiddenContactsMap();
  const values = Array.isArray(map[accountId]) ? map[accountId] : [];
  return new Set(values.map((value) => String(value || '').trim()).filter(Boolean));
}

export function hideContactsForAccount(accountId, ids) {
  if (!accountId) return;

  const nextIds = Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)));
  if (!nextIds.length) return;

  const map = loadHiddenContactsMap();
  const existing = Array.isArray(map[accountId]) ? map[accountId] : [];
  map[accountId] = Array.from(new Set([...existing, ...nextIds]));
  saveHiddenContactsMap(map);
  emitHiddenContactsChanged();
}

export function subscribeHiddenContactsChange(callback) {
  const handler = () => callback();
  window.addEventListener(HIDDEN_CONTACTS_EVENT, handler);
  return () => window.removeEventListener(HIDDEN_CONTACTS_EVENT, handler);
}