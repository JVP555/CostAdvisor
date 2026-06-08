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

// Response interceptor: redirect to login on 401, surface 429 rate limits
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
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

export default api;