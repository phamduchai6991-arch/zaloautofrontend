/**
 * Bridge to communicate with ZaloTool extension (extension/content/web-bridge.js).
 * Uses window.postMessage with source tags:
 *   page → ext:  { source: 'ZALOTOOL_PAGE', type, data }
 *   ext → page:  { source: 'ZALOTOOL_EXT',  type, data }
 */

const listeners = new Set();
let bridgeInvalidated = false;
let bridgeInjected = false;
let lastExtensionStatus = {
  active: false,
  phase: 'idle',
  reason: 'Đang chờ kiểm tra extension.',
  hints: [],
  injected: false,
  checkedAt: 0,
};

function buildMissingBridgeHints() {
  return [
    'Mở chrome://extensions và xác nhận AutoZalo Bridge đang bật.',
    'Vào Chi tiết extension và đặt Site access thành On all sites hoặc cho phép riêng domain hiện tại.',
    'Đảm bảo bạn đang mở web app bằng đúng Chrome profile đã cài extension.',
    'Reload extension rồi tải lại trang web.',
  ];
}

function buildBridgeErrorHints(code) {
  if (code === 'origin_not_allowed' || code === 'check_failed') {
    return [
      'Vào Chi tiết extension và kiểm tra Site access cho domain hiện tại.',
      'Nếu vừa reload extension, hãy tải lại tab web này để content script khởi tạo lại.',
    ];
  }

  if (code === 'runtime_unavailable') {
    return [
      'Reload extension trong chrome://extensions.',
      'Tải lại trang web sau khi reload extension.',
    ];
  }

  return buildMissingBridgeHints();
}

function updateExtensionStatus(next) {
  lastExtensionStatus = {
    active: false,
    phase: 'unknown',
    reason: '',
    hints: [],
    injected: bridgeInjected,
    checkedAt: Date.now(),
    ...next,
  };
  return { ...lastExtensionStatus };
}

// Central listener — dispatches to registered callbacks
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.source !== 'ZALOTOOL_EXT') return;
  if (msg.type === 'ZALOTOOL_BRIDGE_BOOTSTRAP') {
    bridgeInjected = true;
    updateExtensionStatus({
      active: false,
      phase: msg.data?.phase || 'bridge_detected',
      reason: 'Extension đã inject vào trang và đang khởi tạo kết nối.',
      hints: ['Nếu trạng thái này giữ nguyên quá lâu, hãy reload extension rồi tải lại trang.'],
      injected: true,
    });
  }
  if (msg.type === 'ZALOTOOL_BRIDGE_ERROR') {
    bridgeInjected = true;
    updateExtensionStatus({
      active: false,
      phase: msg.data?.phase || 'bridge_error',
      reason: msg.data?.error || 'Extension đã inject nhưng chưa kết nối được với background.',
      hints: buildBridgeErrorHints(msg.data?.code),
      injected: true,
    });
  }
  if (msg.type === 'ZALOTOOL_READY' || msg.type === 'ZALOTOOL_CHECK_OK') {
    bridgeInjected = true;
    updateExtensionStatus({
      active: true,
      phase: 'connected',
      reason: 'Extension đã kết nối.',
      hints: [],
      injected: true,
    });
  }
  if (msg.type === 'ZALOTOOL_EXTENSION_INVALIDATED') {
    bridgeInvalidated = true;
    updateExtensionStatus({
      active: false,
      phase: 'invalidated',
      reason: msg.data?.error || 'Extension context invalidated. Hãy reload extension rồi tải lại trang.',
      hints: buildBridgeErrorHints('runtime_unavailable'),
      injected: bridgeInjected,
    });
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

export function getExtensionStatusSnapshot() {
  return { ...lastExtensionStatus };
}

export function checkExtensionStatus(timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (bridgeInvalidated) {
      resolve(updateExtensionStatus({
        active: false,
        phase: 'invalidated',
        reason: 'Extension context invalidated. Hãy reload extension rồi tải lại trang.',
        hints: buildBridgeErrorHints('runtime_unavailable'),
      }));
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      if (bridgeInjected) {
        resolve(updateExtensionStatus({
          active: false,
          phase: 'bridge_timeout',
          reason: 'Extension đã inject vào trang nhưng chưa hoàn tất bắt tay với background.',
          hints: [
            'Reload extension trong chrome://extensions.',
            'Tải lại tab web sau khi reload extension.',
          ],
          injected: true,
        }));
        return;
      }

      resolve(updateExtensionStatus({
        active: false,
        phase: 'bridge_missing',
        reason: 'Trang hiện tại chưa nhận được content script của extension.',
        hints: buildMissingBridgeHints(),
        injected: false,
      }));
    }, timeoutMs);

    const cleanup = onExtensionMessage((msg) => {
      if (msg.type === 'ZALOTOOL_READY' || msg.type === 'ZALOTOOL_CHECK_OK' || msg.type === 'ZALOTOOL_EXTENSION_INVALIDATED' || msg.type === 'ZALOTOOL_BRIDGE_ERROR') {
        clearTimeout(timeout);
        cleanup();
        resolve(getExtensionStatusSnapshot());
      }
    });

    if (!postToExtension('ZALOTOOL_CHECK')) {
      clearTimeout(timeout);
      cleanup();
      resolve(updateExtensionStatus({
        active: false,
        phase: 'invalidated',
        reason: 'Extension context invalidated. Hãy reload extension rồi tải lại trang.',
        hints: buildBridgeErrorHints('runtime_unavailable'),
      }));
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

export function getZaloCommonData(payload) {
  return requestExtension('Z_GET_COMMON_DATA', payload, 70000);
}
