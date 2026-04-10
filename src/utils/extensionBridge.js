/**
 * Bridge to communicate with ZaloTool extension (extension/content/web-bridge.js).
 * Uses window.postMessage with source tags:
 *   page → ext:  { source: 'ZALOTOOL_PAGE', type, data }
 *   ext → page:  { source: 'ZALOTOOL_EXT',  type, data }
 */

const listeners = new Set();
let bridgeInvalidated = false;

// Central listener — dispatches to registered callbacks
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.source !== 'ZALOTOOL_EXT') return;
  if (msg.type === 'ZALOTOOL_EXTENSION_INVALIDATED') {
    bridgeInvalidated = true;
  }
  for (const cb of listeners) {
    try { cb(msg); } catch (e) { console.error('[ExtBridge] listener error', e); }
  }
});

/** Register a callback for extension messages. Returns unsubscribe fn. */
export function onExtensionMessage(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Post a message to the extension (fire-and-forget). */
export function postToExtension(type, data = {}) {
  if (bridgeInvalidated) return false;
  window.postMessage({ source: 'ZALOTOOL_PAGE', type, data }, '*');
  return true;
}

export function requestExtension(type, data = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (bridgeInvalidated) {
      reject(new Error('Extension context invalidated. Hãy tải lại trang sau khi reload extension.'));
      return;
    }

    const responseType = type + '_RESPONSE';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Extension request timed out: ' + type));
    }, timeoutMs);

    const cleanup = onExtensionMessage((msg) => {
      if (msg.type !== responseType) return;
      clearTimeout(timeout);
      cleanup();
      resolve(msg.data);
    });

    if (!postToExtension(type, data)) {
      clearTimeout(timeout);
      cleanup();
      reject(new Error('Extension context invalidated. Hãy tải lại trang sau khi reload extension.'));
    }
  });
}

/** Check if extension is installed and active. */
export function checkExtension() {
  return new Promise((resolve) => {
    if (bridgeInvalidated) {
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => { cleanup(); resolve(false); }, 2000);
    const cleanup = onExtensionMessage((msg) => {
      if (msg.type === 'ZALOTOOL_READY' || msg.type === 'ZALOTOOL_CHECK_OK') {
        clearTimeout(timeout);
        cleanup();
        resolve(true);
        return;
      }

      if (msg.type === 'ZALOTOOL_EXTENSION_INVALIDATED') {
        clearTimeout(timeout);
        cleanup();
        resolve(false);
      }
    });
    if (!postToExtension('ZALOTOOL_CHECK')) {
      clearTimeout(timeout);
      cleanup();
      resolve(false);
    }
  });
}

/** Ask extension to open incognito window for Zalo login. */
export function openZaloLogin(data = {}) {
  return requestExtension('OPEN_ZALO_LOGIN', data, 10000);
}

/** Ask extension to close the incognito window. */
export function closeIncognito() {
  return requestExtension('CLOSE_INCOGNITO', {}, 5000);
}

export function confirmAccountSync(requestId) {
  return requestExtension('CONFIRM_ACCOUNT_SYNC', { requestId }, 10000);
}

export function cancelAccountSync(requestId, reason = '') {
  return requestExtension('CANCEL_ACCOUNT_SYNC', { requestId, reason }, 10000);
}

export function executeMessageJobs(payload) {
  return requestExtension('EXECUTE_MESSAGE_JOBS', payload, 15000);
}

export function getZaloCommonData(payload) {
  return requestExtension('Z_GET_COMMON_DATA', payload, 70000);
}

export function zFetch(payload) {
  return requestExtension('Z_FETCH', payload, 70000);
}

/** Subscribe to real-time incoming Zalo messages. Returns unsubscribe fn. */
export function onIncomingMessages(callback) {
  return onExtensionMessage((msg) => {
    if (msg.type === 'ZALO_INCOMING_MESSAGES' && Array.isArray(msg.data)) {
      callback(msg.data);
    }
  });
}
