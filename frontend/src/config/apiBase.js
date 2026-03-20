/**
 * Prefix cho mọi endpoint FastAPI (…/api/…)
 *
 * - Development: dùng '/api' + proxy trong package.json → 127.0.0.1:8000
 *   (tránh lỗi gọi thẳng localhost:8000: IPv6 / CORS trên Windows)
 * - Production build: bắt buộc set REACT_APP_API_URL (vd http://server:8000)
 */
export function getApiPathPrefix() {
  const env = process.env.REACT_APP_API_URL?.trim();
  if (env) {
    let base = env.replace(/\/$/, '');
    if (base.endsWith('/api')) return base;
    return `${base}/api`;
  }
  if (process.env.NODE_ENV === 'development') {
    return '/api';
  }
  return 'http://127.0.0.1:8000/api';
}

/** WebSocket luôn nối thẳng backend (CRA proxy không dùng cho WS mặc định) */
export function getWsOrigin() {
  const env = process.env.REACT_APP_API_URL?.trim();
  if (env) {
    let o = env.replace(/\/$/, '');
    if (o.endsWith('/api')) o = o.slice(0, -4);
    return o.replace(/^https/i, 'wss').replace(/^http/i, 'ws');
  }
  return 'ws://127.0.0.1:8000';
}

/** Gốc HTTP backend (không /api) — ping /, WebSocket host, v.v. */
export function getBackendHttpOrigin() {
  const env = process.env.REACT_APP_API_URL?.trim();
  if (env) {
    let b = env.replace(/\/$/, '');
    if (b.endsWith('/api')) b = b.slice(0, -4);
    return b;
  }
  return 'http://127.0.0.1:8000';
}
