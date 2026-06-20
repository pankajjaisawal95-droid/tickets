import axios from 'axios';
import { useAuth } from '../store/auth.js';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5320/api';

// Origin that serves /assets (the API base minus its trailing /api).
const ASSET_BASE = API_BASE.replace(/\/api\/?$/, '');

/**
 * Resolves a stored image value to a displayable URL.
 * DB stores relative paths ("/assets/images/..."); prepend the asset origin so
 * the admin (running on a different port) can load them. Full URLs and data URIs
 * are returned untouched.
 */
export const assetUrl = (src) => {
  if (!src) return '';
  if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:')) return src;
  return `${ASSET_BASE}/${String(src).replace(/^\/+/, '')}`;
};

export const api = axios.create({ baseURL: API_BASE });

/* Attach the access token on every request. */
api.interceptors.request.use((config) => {
  const { accessToken } = useAuth.getState();
  if (accessToken) config.headers['x-access-token'] = accessToken;
  return config;
});

/*
 * On 401 try a one-shot refresh (GET /auth/refresh-token with x-refresh-token),
 * then replay the original request. On refresh failure, log out.
 * 403 is surfaced as a non-admin error to the caller (handled in the UI).
 */
let refreshing = null;

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const { response, config } = err;
    if (!response) return Promise.reject(err);

    if (response.status === 401 && !config._retried) {
      const { refreshToken, setAccessToken, logout } = useAuth.getState();
      if (!refreshToken) {
        logout();
        return Promise.reject(err);
      }
      try {
        refreshing =
          refreshing ||
          axios.get(`${API_BASE}/auth/refresh-token`, {
            headers: { 'x-refresh-token': refreshToken }
          });
        const r = await refreshing;
        refreshing = null;
        const newToken = r.data?.data?.accessToken;
        if (!newToken) throw new Error('no token');
        setAccessToken(newToken);
        config._retried = true;
        config.headers['x-access-token'] = newToken;
        return api(config);
      } catch {
        refreshing = null;
        useAuth.getState().logout();
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  }
);

/** Unwraps the `{ success, message, data }` envelope and normalises errors. */
export const unwrap = (promise) =>
  promise.then(
    (res) => res.data?.data,
    (err) => {
      const status = err.response?.status;
      const message =
        err.response?.data?.message || err.message || 'Request failed';
      const e = new Error(message);
      e.status = status;
      throw e;
    }
  );

/* Thin verb helpers returning unwrapped data. */
export const get = (url, params) => unwrap(api.get(url, { params }));
export const post = (url, body) => unwrap(api.post(url, body));
export const put = (url, body) => unwrap(api.put(url, body));
export const patch = (url, body) => unwrap(api.patch(url, body));
export const del = (url) => unwrap(api.delete(url));

/**
 * Downloads a file from the API (auth token attached via the interceptor) and
 * triggers a browser "Save as". Reads the filename from Content-Disposition,
 * falling back to `fallbackName`. Used for CSV/PDF exports.
 */
export const download = async (url, params, fallbackName = 'download') => {
  const res = await api.get(url, { params, responseType: 'blob' });
  const href = URL.createObjectURL(new Blob([res.data]));
  const cd = res.headers['content-disposition'] || '';
  const match = /filename="?([^"]+)"?/.exec(cd);
  const a = document.createElement('a');
  a.href = href;
  a.download = match ? match[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
};

/**
 * Uploads an image to /organiser/upload; resolves to { url, path, filename }.
 * `folder` goes in the query string so the server resolves it BEFORE streaming
 * the file (multipart body fields aren't parsed yet at that point).
 */
export const uploadFile = (file, folder = 'event') => {
  const fd = new FormData();
  fd.append('file', file);
  return unwrap(
    api.post(`/organiser/upload?folder=${encodeURIComponent(folder)}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  );
};
