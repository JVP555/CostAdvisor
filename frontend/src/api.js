import axios from 'axios';

// ConfirmProvider registers itself here so the 429 interceptor can use the
// custom dialog instead of window.alert (which is blocked in some browsers).
let _alertFn = (msg) => window.alert(msg);
export const registerAlertFn = (fn) => { _alertFn = fn; };

// In dev: empty baseURL → Vite proxy forwards /api and /auth to the backend.
// In prod: VITE_API_BASE_URL points at the deployed backend (e.g. https://api.yourdomain.com).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  withCredentials: true,  // Send cookies (JWT) with every request
});

// Response interceptor: redirect to login on 401, surface 429 rate limits, handle 403
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    } else if (status === 403) {
      // Forbidden — redirect to dashboard with a toast if available
      if (_toastFn) _toastFn("You don't have permission to access that page.", 'error');
      if (window.location.pathname !== '/dashboard') {
        window.location.href = '/dashboard';
      }
    } else if (status === 429) {
      const retryAfter = error.response?.headers?.['retry-after'];
      const msg = retryAfter
        ? `Too many requests. Try again in ${retryAfter}s.`
        : 'Too many requests. Please slow down.';
      _alertFn(msg);
    }
    return Promise.reject(error);
  }
);

/**
 * Convert an Axios error into a human-readable string.
 * Handles Pydantic validation arrays, plain strings, and fallbacks.
 */
export function formatApiError(err) {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || 'An unexpected error occurred.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(d => {
      const field = d.loc?.slice(-1)[0];
      return field ? `${field}: ${d.msg}` : d.msg;
    }).join('; ');
  }
  return String(detail);
}

// Toast function registered by ToastProvider so the interceptor can show 403 toasts.
let _toastFn = null;
export const registerToastFn = (fn) => { _toastFn = fn; };

export default api;