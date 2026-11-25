import './protocol.js';

export const { MSG, PUSH, FRAME, OPEN_WHERE, PALETTE_MODE, PALETTE_HOST, CONTENT_STRINGS, PALETTE_READY_TIMEOUT_MS } = globalThis.__arcishProtocol;

// Request/response helper for talking to the service worker.
export async function rpc(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (res?.error) throw new Error(res.error);
  return res?.data;
}
